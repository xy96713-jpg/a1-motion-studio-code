#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileScreenInteractionTimeline} from "../apps/studio-next/src/lib/a1-screen-interaction-timeline-v1.mjs";
import {deriveScreenResultRegion} from "./lib/derive-screen-result-region-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work/screen-result-region-readiness-v1");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
fs.mkdirSync(outputRoot, {recursive: true});
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const items = [];
for (const shot of plan.shots) {
  const directory = path.join(root, `work/headless-${shot.shotId.toLowerCase()}-v1`);
  const candidates = fs.existsSync(directory)
    ? fs.readdirSync(directory).sort().reverse().map((run) => path.join(directory, run, "report.json")).filter((file) => fs.existsSync(file))
    : [];
  let result = null;
  const attempts = [];
  for (const reportPath of candidates) {
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      const durationMs = Number(report.authorityDurationMs || report.output?.durationMs);
      const initial = compileScreenInteractionTimeline({durationMs, actionId: shot.execution.actionId, actionContract: shot.authority.actionContract, screenActions: shot.execution.screenActions || [], events: report.events || [], cursorTelemetry: report.cursorTelemetry, domTargets: report.domTargets || [], pointerTargets: report.pointerTargets || []});
      let resultRegionProof = null;
      if (initial.directorFamily.target !== "NONE") {
        const lastInteractionMs = initial.interactions.at(-1)?.anchorMs ?? Math.max(0, initial.resultHold.startMs - 1200);
        resultRegionProof = await deriveScreenResultRegion({source: path.join(root, report.output.path), beforeMs: lastInteractionMs + 200, resultMs: initial.resultHold.startMs, durationMs, shotId: shot.shotId, outputDir: path.join(outputRoot, shot.shotId.toLowerCase()), ffmpeg});
      }
      const currentRevisionBound = report.storyboardBinding?.versionId === shot.authority.versionId
        && report.storyboardBinding?.revisionSha256 === shot.authority.revisionSha256
        && report.storyboardBinding?.cameraRecipeSha256 === shot.execution.cameraRecipe.recipeSha256;
      result = {reportPath: path.relative(root, reportPath), reportSha256: crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex"), currentRevisionBound, resultRegionProof: resultRegionProof ? {...resultRegionProof, frames: {...resultRegionProof.frames, beforeFile: path.relative(root, resultRegionProof.frames.beforeFile), afterFile: path.relative(root, resultRegionProof.frames.afterFile)}} : {contract: "A1VerifiedScreenResultRegion/v1", status: "NOT_REQUIRED_STATIC_STATE", shotId: shot.shotId}};
      break;
    } catch (error) {
      attempts.push({reportPath: path.relative(root, reportPath), failure: String(error?.message || error)});
    }
  }
  const failures = [];
  if (!candidates.length) failures.push("NO_HEADLESS_CAPTURE");
  else if (!result) failures.push("NO_CAPTURE_WITH_VERIFIABLE_RESULT_REGION");
  if (result && !result.currentRevisionBound) failures.push("CAPTURE_NOT_BOUND_TO_CURRENT_RECIPE");
  items.push({shotId: shot.shotId, actionId: shot.execution.actionId, directorFamily: shot.execution.cameraRecipe.interactionIntent.directorFamily.id, status: failures.length ? "BLOCKED" : "READY", latestUsable: result, attemptedCaptureCount: attempts.length + (result ? 1 : 0), recentFailures: attempts.slice(0, 3), failures});
}

const failures = items.flatMap((item) => item.failures.map((failure) => `${item.shotId}:${failure}`));
const body = {contract: "A1ScreenResultRegionReadinessAudit/v1", status: failures.length ? "INCOMPLETE" : "PASS", sourcePlanSha256: plan.planSha256, targetCount: items.length, readyCount: items.filter((item) => item.status === "READY").length, verifiableResultCount: items.filter((item) => item.latestUsable?.resultRegionProof).length, currentRevisionBoundCount: items.filter((item) => item.latestUsable?.currentRevisionBound).length, items, failures};
const report = {...body, auditSha256: sha(body)};
fs.writeFileSync(path.join(outputRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({contract: report.contract, status: report.status, sourcePlanSha256: report.sourcePlanSha256, targetCount: report.targetCount, readyCount: report.readyCount, verifiableResultCount: report.verifiableResultCount, currentRevisionBoundCount: report.currentRevisionBoundCount, failures: report.failures, auditSha256: report.auditSha256}, null, 2));
if (report.status !== "PASS") process.exitCode = 2;
