#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {parseSrtTimeline} from "../apps/studio-next/src/lib/a1-project-intake-v1.mjs";
import {runWholeFilmAiDirector} from "../apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
// Whole-project direction runs in a background worker; the interactive 12s
// article-analysis budget is too short for a cold complete-script pass.
process.env.A1_CODEX_DIRECTOR_TIMEOUT_MS ||= "120000";
const requestedProjectId = process.argv.find((value) => value.startsWith("--projectId="))?.slice("--projectId=".length) || "";
if (!/^[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]{0,119}$/iu.test(requestedProjectId)) throw new Error("project-director-project-id-invalid");

const {publicDir, artifactDir} = projectDirs(appRoot);
const publicProjectDir = path.join(publicDir, "projects", requestedProjectId);
const artifactProjectDir = path.join(artifactDir, "projects", requestedProjectId);
const articlePath = path.join(artifactProjectDir, "article.txt");
const intakePath = path.join(artifactProjectDir, "intake.json");
const timelinePath = path.join(artifactProjectDir, "timeline.srt");
const visualRepairBriefPath = path.join(artifactProjectDir, "visual-quality-review", "visual-repair-brief.json");
if (!fs.existsSync(articlePath) || !fs.existsSync(intakePath) || !fs.existsSync(timelinePath)) throw new Error("project-director-intake-artifacts-missing");

fs.mkdirSync(publicProjectDir, {recursive: true});
fs.mkdirSync(artifactProjectDir, {recursive: true});
const lockPath = path.join(artifactProjectDir, ".director-worker.lock");
let workerHandle;
try {
  workerHandle = fs.openSync(lockPath, "wx");
} catch {
  console.log(JSON.stringify({status: "SKIPPED", reason: "project-director-already-running", projectId: requestedProjectId}));
  process.exit(0);
}

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeJsonAtomic = (dir, name, value) => {
  fs.mkdirSync(dir, {recursive: true});
  const target = path.join(dir, name);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
};
const writeProjectPair = (name, value) => {
  writeJsonAtomic(publicProjectDir, name, value);
  writeJsonAtomic(artifactProjectDir, name, value);
};

async function updateWorkspace(action, payload, mutate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return withProjectLock(appRoot, () => {
        const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
        const event = createProductionEvent({workspace: current, action, targetId: requestedProjectId, payload});
        const next = structuredClone(current);
        const entry = next.production.projectIntakes?.find((item) => item.projectId === requestedProjectId);
        if (!entry) throw new Error("project-director-intake-not-registered");
        mutate(entry, next);
        next.production.eventLedger.eventCount += 1;
        next.production.eventLedger.lastEventId = event.eventId;
        next.production.eventLedger.lastEventAt = event.createdAt;
        const recalculated = recalculateEditorialAssetWorkbench(next);
        persistProjectState(appRoot, recalculated, {event});
        return recalculated;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "production-state-write-in-progress" || attempt === 29) throw error;
      await sleep(150);
    }
  }
  throw new Error("project-director-state-lock-timeout");
}

async function main() {
  const intake = JSON.parse(fs.readFileSync(intakePath, "utf8"));
  if (intake.contract !== "A1ProjectIntake/v1" || intake.projectId !== requestedProjectId) throw new Error("project-director-intake-contract-mismatch");
  const articleText = fs.readFileSync(articlePath, "utf8").trim();
  const timelineText = fs.readFileSync(timelinePath, "utf8").trim();
  if (sha256(articleText) !== intake.article.sha256) throw new Error("project-director-article-sha-mismatch");
  if (sha256(timelineText) !== intake.timeline.sha256) throw new Error("project-director-timeline-sha-mismatch");
  const parsedTimeline = parseSrtTimeline(timelineText);
  if (parsedTimeline.cueCount !== intake.timeline.cueCount || parsedTimeline.durationMs !== intake.timeline.durationMs) throw new Error("project-director-timeline-contract-mismatch");
  const cues = parsedTimeline.cues.map((cue, index) => ({
    cueId: cue.cueId,
    sourceStartMs: index === 0 ? 0 : cue.startMs,
    sourceEndMs: cue.endMs,
    sourceText: cue.text,
  }));
  const startedAt = new Date().toISOString();
  const result = await runWholeFilmAiDirector({
    projectId: intake.projectId,
    title: intake.title,
    articleText,
    cues,
    timeline: {authority: "corrected-srt", srtPath: `projects/${requestedProjectId}/timeline.srt`, srtSha256: intake.timeline.sha256},
    mediaInventory: {
      presenterFootage: {status: intake.media.presenter === "bound" ? "bound" : "missing"},
      screenRecording: {
        status: intake.media.screenRecording === "bound" ? "bound" : intake.media.screenRecording === "planning-evidence-only" ? "planning-evidence-only" : "missing",
        ...(intake.media.screenRecordingAssetUri ? {assetUri: intake.media.screenRecordingAssetUri} : {}),
        ...(intake.media.screenRecordingSourceSha256 ? {sourceSha256: intake.media.screenRecordingSourceSha256} : {}),
        ...(intake.media.screenSourceCapabilityProfile ? {capabilityProfile: intake.media.screenSourceCapabilityProfile} : {}),
      },
      boundMaterialIds: [],
    },
    visualRepairBrief: fs.existsSync(visualRepairBriefPath) ? JSON.parse(fs.readFileSync(visualRepairBriefPath, "utf8")) : null,
  });
  const completedAt = new Date().toISOString();
  const runSha256 = sha256(result);
  writeProjectPair("director-run.json", result);
  if (result.status === "completed") writeProjectPair("director-plan.json", result.plan);

  const nextIntake = structuredClone(intake);
  nextIntake.status = result.status === "completed" ? "DIRECTOR_PLAN_REVIEW_REQUIRED" : "BLOCKED_AI_DIRECTOR";
  nextIntake.director = result.status === "completed"
    ? {status: "completed", blockedCode: null, outputSha256: runSha256, traceCount: result.traces.length, shotCount: result.plan.shots.length, chapterCount: result.plan.chapters.length, startedAt, completedAt}
    : {status: "blocked", blockedCode: result.blockedAt, reason: result.reason, outputSha256: runSha256, traceCount: result.traces.length, startedAt, completedAt};
  nextIntake.updatedAt = completedAt;
  const unsignedIntake = {...nextIntake};
  delete unsignedIntake.sha256;
  nextIntake.sha256 = sha256(unsignedIntake);
  writeProjectPair("intake.json", nextIntake);

  await updateWorkspace(result.status === "completed" ? "project-ai-director-completed" : "project-ai-director-blocked", {runSha256, status: result.status, blockedAt: result.status === "blocked" ? result.blockedAt : null}, (entry) => {
    entry.status = nextIntake.status;
    entry.sha256 = nextIntake.sha256;
    entry.updatedAt = completedAt;
    entry.directorStatus = result.status;
    entry.directorRunPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/projects/${requestedProjectId}/director-run.json`;
    entry.directorPlanPublicUrl = result.status === "completed" ? `/generated/system-line/editorial-asset-workbench-v1/projects/${requestedProjectId}/director-plan.json` : null;
    entry.directorBlockedAt = result.status === "blocked" ? result.blockedAt : null;
    entry.directorReason = result.status === "blocked" ? result.reason : null;
    entry.shotCount = result.status === "completed" ? result.plan.shots.length : null;
    entry.chapterCount = result.status === "completed" ? result.plan.chapters.length : null;
    entry.traceCount = result.traces.length;
    entry.completedAt = completedAt;
  });
  console.log(JSON.stringify({status: result.status === "completed" ? "PASS" : "BLOCKED_AI_DIRECTOR", projectId: requestedProjectId, runSha256, shotCount: result.status === "completed" ? result.plan.shots.length : null, chapterCount: result.status === "completed" ? result.plan.chapters.length : null, blockedAt: result.status === "blocked" ? result.blockedAt : null}, null, 2));
  if (result.status === "blocked") process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const completedAt = new Date().toISOString();
  try {
    writeProjectPair("director-worker-error.json", {contract: "A1WholeFilmAiDirectorWorkerError/v1", status: "BLOCKED_AI_DIRECTOR", projectId: requestedProjectId, reason, completedAt});
    await updateWorkspace("project-ai-director-worker-failed", {reason}, (entry) => {
      entry.status = "BLOCKED_AI_DIRECTOR";
      entry.directorStatus = "blocked";
      entry.directorBlockedAt = "worker";
      entry.directorReason = reason;
      entry.updatedAt = completedAt;
      entry.completedAt = completedAt;
    });
  } catch (persistError) {
    console.error(persistError);
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  if (workerHandle != null) fs.closeSync(workerHandle);
  fs.rmSync(lockPath, {force: true});
}
