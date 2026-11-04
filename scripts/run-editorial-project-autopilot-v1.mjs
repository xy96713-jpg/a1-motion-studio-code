#!/usr/bin/env node
import crypto from "node:crypto";
import {dispatchProjectNodeTickV1} from "../apps/studio-next/src/lib/a1-project-node-dispatch-v1.mjs";
import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildProjectVisualBiblePack, assertProjectVisualBiblePack} from "../apps/studio-next/src/lib/a1-project-visual-bible-v1.mjs";
import {admitProjectGeneratedOutputsByManifest, assertProjectAssetWorkspace, buildProjectAssetWorkspace, queueProjectAssetGeneration, recalculateProjectAssetWorkspace} from "../apps/studio-next/src/lib/a1-project-asset-workspace-v1.mjs";
import {assertProjectSceneGraphWorkspace, buildProjectSceneGraphWorkspace} from "../apps/studio-next/src/lib/a1-project-scene-graph-v1.mjs";
import {assertProjectAcceptedShotIrSet, assertProjectMotionIrSet, compileProjectAcceptedShotIr} from "../apps/studio-next/src/lib/a1-project-accepted-shot-ir-v2.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_PROJECT_QUALIFICATION_ROLE, assertCurrentPackagingRouteOwner} from "../apps/studio-next/src/lib/a1-packaging-orchestration-boundary-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const projectId = process.argv.find((value) => value.startsWith("--projectId="))?.slice("--projectId=".length) || "";
if (!/^[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]{0,119}$/iu.test(projectId)) throw new Error("project-autopilot-project-id-invalid");
const nodeDispatch = await dispatchProjectNodeTickV1({repoRoot: root, projectId});
if (nodeDispatch) { console.log(JSON.stringify(nodeDispatch, null, 2)); process.exit(0); }
const {publicDir, artifactDir} = projectDirs(appRoot);
const projectDir = path.join(artifactDir, "projects", projectId);
const publicProjectDir = path.join(publicDir, "projects", projectId);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fs.renameSync(tmp, file); };
const writeProjectJson = (name, value) => { writeJson(path.join(projectDir, name), value); writeJson(path.join(publicProjectDir, name), value); };

async function updateWorkspace(action, payload, mutate, files = {}) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return withProjectLock(appRoot, () => {
        const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
        assertCurrentPackagingRouteOwner(current, A1_PROJECT_QUALIFICATION_ROLE);
        const next = structuredClone(current);
        const intake = next.production.projectIntakes?.find((item) => item.projectId === projectId);
        if (!intake) throw new Error("project-autopilot-intake-not-found");
        mutate(intake, next);
        const event = createProductionEvent({workspace: current, action, targetId: projectId, payload: {...payload, automatic: true}});
        next.production.eventLedger.eventCount += 1;
        next.production.eventLedger.lastEventId = event.eventId;
        next.production.eventLedger.lastEventAt = event.createdAt;
        const intakeFile = path.join(projectDir, "intake.json");
        const persistedFiles = {...files};
        if (fs.existsSync(intakeFile)) {
          const intakeDocument = JSON.parse(fs.readFileSync(intakeFile, "utf8"));
          intakeDocument.status = intake.status;
          intakeDocument.updatedAt = intake.updatedAt;
          intakeDocument.pipeline = {automationMode: intake.automationMode, intermediateApprovalRequired: false, finalDecisionRequired: false, motionStatus: intake.motionStatus || null, review540pStatus: intake.review540pStatus || null, review540pPublicUrl: intake.review540pPublicUrl || null, visualQualityStatus: intake.visualQualityStatus || null, visualQualityVerdict: intake.visualQualityVerdict || null, visualQualityScore: intake.visualQualityScore ?? null, visualQualityReportPublicUrl: intake.visualQualityReportPublicUrl || null, visualRepairBriefPublicUrl: intake.visualRepairBriefPublicUrl || null, final1080pStatus: intake.final1080pStatus || null, final1080pPublicUrl: intake.final1080pPublicUrl || null, davinciPackageStatus: intake.davinciPackageStatus || null, davinciPackagePublicUrl: intake.davinciPackagePublicUrl || null, finalReleaseBlockedReason: intake.finalReleaseBlockedReason || null};
          const unsignedIntake = structuredClone(intakeDocument); delete unsignedIntake.sha256; intakeDocument.sha256 = sha256(unsignedIntake);
          intake.sha256 = intakeDocument.sha256;
          persistedFiles[`projects/${projectId}/intake.json`] = intakeDocument;
        }
        const recalculated = recalculateEditorialAssetWorkbench(next);
        persistProjectState(appRoot, recalculated, {event, files: persistedFiles});
        return recalculated;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "production-state-write-in-progress" || attempt === 39) throw error;
      await sleep(180);
    }
  }
  throw new Error("project-autopilot-state-lock-timeout");
}

function updateProjectWorkspace(name, value) { writeProjectJson(name, value); }

function runDirector() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/run-editorial-project-director-v1.mjs"), `--projectId=${projectId}`], {cwd: root, stdio: "ignore"});
    child.on("close", () => resolve());
  });
}

function runProject540p() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/render-editorial-project-540p-v1.mjs"), `--projectId=${projectId}`], {cwd: root, stdio: "ignore"});
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`project-540p-render-failed:${code}`)));
    child.on("error", reject);
  });
}

function runProjectFinal1080p() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts/render-editorial-project-540p-v1.mjs"), `--projectId=${projectId}`, "--resolution=1080", "--final"], {cwd: root, stdio: "ignore"});
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`project-final-1080-render-failed:${code}`)));
    child.on("error", reject);
  });
}

function hasBoundAudio() {
  const workspacePath = path.join(projectDir, "project-asset-workspace.json");
  if (!fs.existsSync(workspacePath)) return false;
  const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
  return Boolean(workspace.assets?.some((asset) => asset.binding?.slotKind === "audio" && asset.output?.publicUrl));
}

async function waitForDirector() {
  const intakePath = path.join(projectDir, "intake.json");
  const before = JSON.parse(fs.readFileSync(intakePath, "utf8"));
  if (["READY_FOR_AI_DIRECTOR", "AUTOMATIC_PRODUCTION_QUEUED", "BLOCKED_AI_DIRECTOR", "PROJECT_540P_VISUAL_REVISE_REQUIRED"].includes(before.status)) {
    const repairPass = before.status === "PROJECT_540P_VISUAL_REVISE_REQUIRED";
    await updateWorkspace("project-autopilot-director-started", {repairPass, visualRepairBriefPublicUrl: before.visualRepairBriefPublicUrl || null}, (entry) => {
      entry.status = "AI_DIRECTOR_RUNNING";
      entry.directorStatus = "running";
      entry.directorBlockedAt = null;
      entry.directorReason = null;
      entry.updatedAt = new Date().toISOString();
    });
    await runDirector();
  }
  for (let i = 0; i < 180; i += 1) {
    const intake = JSON.parse(fs.readFileSync(intakePath, "utf8"));
    if (intake.status !== "AI_DIRECTOR_RUNNING") return intake;
    await sleep(1000);
  }
  throw new Error("project-autopilot-director-timeout");
}

async function compileVisualBible(intake) {
  if (intake.status !== "DIRECTOR_PLAN_REVIEW_REQUIRED") return intake;
  const planPath = path.join(projectDir, "director-plan.json");
  if (!fs.existsSync(planPath)) throw new Error("project-autopilot-director-plan-missing");
  const planBytes = fs.readFileSync(planPath);
  const plan = JSON.parse(planBytes.toString("utf8"));
  if (plan.contract !== "A1WholeFilmAiDirectorPlan/v1" || plan.coverage?.exact !== true || plan.coverage?.editTimelineContinuous !== true) throw new Error("project-autopilot-director-plan-invalid");
  const planSha256 = sha256(planBytes);
  const now = new Date().toISOString();
  const review = {contract: "A1WholeFilmAiDirectorPlanReview/v1", status: "auto-approved-for-visual-bible-compilation", projectId, planSha256, note: "全自动制作模式：不设中间人工审批，保留审计记录；最终只由 540p 交付决定。", approvedAt: now, approvedBy: "system-final-release-only", gates: {visualBibleCompilationAllowed: true, assetGenerationAllowed: true, shotCompositionAllowed: true, renderAllowed: false}};
  const reviewSha256 = sha256(`${JSON.stringify(review, null, 2)}\n`);
  const pack = assertProjectVisualBiblePack(buildProjectVisualBiblePack({plan, planSha256, approvedDirectorReviewSha256: reviewSha256, compiledAt: now}));
  writeProjectJson("director-review.json", review);
  writeProjectJson("project-visual-bible-pack.json", pack);
  writeProjectJson("visual-bible.json", pack.visualBible);
  writeProjectJson("typography-direction.json", pack.typographyDirection);
  writeProjectJson("asset-requirement-graph.json", pack.assetRequirementGraph);
  writeProjectJson("asset-briefs.json", pack.assetBriefs);
  let assetWorkspace = buildProjectAssetWorkspace({pack, visualBibleReviewArtifactSha256: reviewSha256, createdAt: now});
  // Automatic production approves only the *brief*; output and source admission stay explicit in the audit state.
  assetWorkspace.assets = assetWorkspace.assets.map((asset) => asset.generationAllowed
    ? {...asset, briefReview: {status: "approved", note: "系统自动批准非事实资产简报。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: asset.contentSha256}}
    : asset);
  assetWorkspace = recalculateProjectAssetWorkspace(assetWorkspace, now);
  const generated = assetWorkspace.assets.filter((asset) => asset.generationAllowed && asset.briefReview.status === "approved" && !asset.output.publicUrl);
  for (const asset of generated) assetWorkspace = queueProjectAssetGeneration(assetWorkspace, asset.id, now);
  writeProjectJson("project-asset-workspace.json", assetWorkspace);
  return updateWorkspace("project-autopilot-visual-bible-and-assets-queued", {planSha256, visualBibleSha256: pack.sha256, queuedCount: generated.length}, (entry) => {
    entry.status = assetWorkspace.queue.summary.queued ? "PROJECT_ASSET_GENERATION_QUEUED" : "PROJECT_ASSET_WORKSPACE_BRIEF_REVIEW_REQUIRED";
    entry.directorStatus = "completed";
    entry.directorPlanPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/director-plan.json`;
    entry.planSha256 = planSha256;
    entry.planApprovedAt = now;
    entry.visualBibleStatus = "approved";
    entry.visualBiblePublicUrl = `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/project-visual-bible-pack.json`;
    entry.visualBibleSha256 = pack.sha256;
    entry.visualBibleApprovedAt = now;
    entry.assetBriefCount = pack.assetBriefs.counts.total;
    entry.assetWorkspaceStatus = assetWorkspace.status;
    entry.assetWorkspacePublicUrl = `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/project-asset-workspace.json`;
    entry.assetWorkspaceSha256 = assetWorkspace.sha256;
    entry.assetQueuedCount = assetWorkspace.queue.summary.queued;
    entry.assetApprovedCount = assetWorkspace.summary.outputApprovedCount;
    entry.updatedAt = now;
  }, {[`projects/${projectId}/director-review.json`]: review, [`projects/${projectId}/project-visual-bible-pack.json`]: pack, [`projects/${projectId}/visual-bible.json`]: pack.visualBible, [`projects/${projectId}/typography-direction.json`]: pack.typographyDirection, [`projects/${projectId}/asset-requirement-graph.json`]: pack.assetRequirementGraph, [`projects/${projectId}/asset-briefs.json`]: pack.assetBriefs, [`projects/${projectId}/project-asset-workspace.json`]: assetWorkspace});
}

async function compileSceneGraphIfReady(intake) {
  const workspacePath = path.join(projectDir, "project-asset-workspace.json");
  const packPath = path.join(projectDir, "project-visual-bible-pack.json");
  if (!fs.existsSync(workspacePath) || !fs.existsSync(packPath)) return intake;
  let assetWorkspace = assertProjectAssetWorkspace(JSON.parse(fs.readFileSync(workspacePath, "utf8")));
  // A user-owned file still needs a separate source/behavior review. Its name,
  // extension, import slot and SHA are not proof that the required action occurs.
  assetWorkspace.assets = admitProjectGeneratedOutputsByManifest(assetWorkspace.assets);
  assetWorkspace = recalculateProjectAssetWorkspace(assetWorkspace);
  writeProjectJson("project-asset-workspace.json", assetWorkspace);
  if (!assetWorkspace.gates.sceneGraphCandidateGenerationAllowed) {
    return updateWorkspace("project-autopilot-media-gate-blocked", {blockers: ["真实人物、录屏或证据源尚未绑定；系统不伪造素材"]}, (entry) => {
      entry.status = "BLOCKED_MEDIA_MISSING";
      entry.assetWorkspaceStatus = assetWorkspace.status;
      entry.assetWorkspaceSha256 = assetWorkspace.sha256;
      entry.assetQueuedCount = assetWorkspace.queue.summary.queued;
      entry.assetApprovedCount = assetWorkspace.summary.outputApprovedCount;
      entry.updatedAt = new Date().toISOString();
    }, {[`projects/${projectId}/project-asset-workspace.json`]: assetWorkspace});
  }
  const pack = assertProjectVisualBiblePack(JSON.parse(fs.readFileSync(packPath, "utf8")));
  const sceneWorkspace = assertProjectSceneGraphWorkspace(buildProjectSceneGraphWorkspace({pack, assetWorkspace}));
  const selected = structuredClone(sceneWorkspace);
  const quality = (candidate) => {
    const layoutScore = Number(candidate.sceneGraph?.layoutSolution?.score || 0);
    const topology = String(candidate.sceneGraph?.topology || "");
    const nodeCount = Array.isArray(candidate.sceneGraph?.nodes) ? candidate.sceneGraph.nodes.length : 0;
    const motionIntent = candidate.sceneGraph?.motionPhrase?.intent ? 4 : 0;
    return layoutScore + nodeCount * 0.5 + motionIntent - (topology.includes("card") ? 8 : 0);
  };
  const priorTopologies = [];
  const topologyCounts = new Map();
  selected.shots = selected.shots.map((shot) => {
    const candidates = shot.candidates.filter((item) => !item.screening.hardFailures.length).sort((left, right) => {
      const leftPenalty = (topologyCounts.get(left.sceneGraph.topology) || 0) * 12 + (priorTopologies.at(-1) === left.sceneGraph.topology ? 8 : 0);
      const rightPenalty = (topologyCounts.get(right.sceneGraph.topology) || 0) * 12 + (priorTopologies.at(-1) === right.sceneGraph.topology ? 8 : 0);
      return (quality(right) - rightPenalty) - (quality(left) - leftPenalty) || left.candidateId.localeCompare(right.candidateId);
    });
    const candidate = candidates[0] || shot.candidates[0];
    priorTopologies.push(candidate.sceneGraph.topology);
    topologyCounts.set(candidate.sceneGraph.topology, (topologyCounts.get(candidate.sceneGraph.topology) || 0) + 1);
    candidate.screening = {...candidate.screening, status: "auto-admitted-final-release-only", score: quality(candidate)};
    return {...shot, candidates: shot.candidates.map((item) => item.candidateId === candidate.candidateId ? candidate : item), selectedCandidateId: candidate.candidateId, review: {status: "approved", note: "系统自动选择：按布局评分、动作意图和相邻轮廓连续性完成；用户仅在 540p 做最终决定。", reviewedAt: new Date().toISOString(), reviewedBy: "system"}};
  });
  selected.summary.approvedShotCount = selected.shots.length;
  selected.gates.allShotsApproved = true;
  selected.gates.acceptedShotIrCompilationAllowed = true;
  selected.status = "ALL_SHOTS_APPROVED_ACCEPTED_IR_READY";
  selected.updatedAt = new Date().toISOString();
  const hashInput = structuredClone(selected); delete hashInput.sha256; selected.sha256 = sha256(hashInput);
  writeProjectJson("project-scene-graph-workspace.json", selected);
  const compiled = compileProjectAcceptedShotIr({pack, assetWorkspace, sceneWorkspace: selected});
  const acceptedSet = assertProjectAcceptedShotIrSet(compiled.acceptedSet);
  const motionSet = assertProjectMotionIrSet(compiled.motionSet);
  writeProjectJson("accepted-shot-ir-v2.json", acceptedSet); writeProjectJson("motion-ir-v2.json", motionSet);
  return updateWorkspace("project-autopilot-scene-and-motion-compiled", {shotCount: acceptedSet.shotCount, motionSceneCount: motionSet.sceneCount}, (entry) => {
    entry.status = "PROJECT_ACCEPTED_SHOT_IR_COMPILED_REPRESENTATIVE_MOTION_PENDING";
    entry.sceneGraphWorkspaceStatus = selected.status;
    entry.sceneGraphWorkspacePublicUrl = `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/project-scene-graph-workspace.json`;
    entry.sceneGraphWorkspaceSha256 = selected.sha256;
    entry.sceneCandidateCount = selected.summary.candidateCount;
    entry.approvedShotCount = selected.summary.approvedShotCount;
    entry.acceptedShotIrStatus = "compiled-review-only";
    entry.acceptedShotIrPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/accepted-shot-ir-v2.json`;
    entry.acceptedShotIrSha256 = acceptedSet.sha256;
    entry.motionIrPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/projects/${projectId}/motion-ir-v2.json`;
    entry.motionIrSha256 = motionSet.sha256;
    entry.updatedAt = new Date().toISOString();
  }, {[`projects/${projectId}/project-scene-graph-workspace.json`]: selected, [`projects/${projectId}/accepted-shot-ir-v2.json`]: acceptedSet, [`projects/${projectId}/motion-ir-v2.json`]: motionSet});
}

async function main() {
  fs.mkdirSync(projectDir, {recursive: true}); fs.mkdirSync(publicProjectDir, {recursive: true});
  let intake = await waitForDirector();
  if (intake.status === "BLOCKED_AI_DIRECTOR") throw new Error(`project-autopilot-ai-director-blocked:${intake.director?.blockedCode || intake.directorReason || "unknown"}`);
  intake = await compileVisualBible(intake);
  const assetWorkspacePath = path.join(projectDir, "project-asset-workspace.json");
  if (fs.existsSync(assetWorkspacePath)) {
    const assetWorkspace = assertProjectAssetWorkspace(JSON.parse(fs.readFileSync(assetWorkspacePath, "utf8")));
    if (assetWorkspace.queue.summary.queued > 0) {
      const worker = spawn(process.execPath, [path.join(root, "scripts/run-editorial-project-asset-jobs-v1.mjs"), `--projectId=${projectId}`], {cwd: root, stdio: "ignore"});
      worker.unref();
      for (let i = 0; i < 720; i += 1) {
        await sleep(1000);
        const latest = assertProjectAssetWorkspace(JSON.parse(fs.readFileSync(assetWorkspacePath, "utf8")));
        if (!latest.queue.summary.queued && !latest.queue.summary.running) break;
      }
    }
  }
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const latestIntake = current.production.projectIntakes.find((item) => item.projectId === projectId);
  await compileSceneGraphIfReady(latestIntake);
  const afterCompile = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)).production.projectIntakes.find((item) => item.projectId === projectId);
  const audioNowBound = hasBoundAudio();
  const needsProject540p = afterCompile?.status === "PROJECT_ACCEPTED_SHOT_IR_COMPILED_REPRESENTATIVE_MOTION_PENDING" && !afterCompile?.review540pPublicUrl;
  const needsAudioRefresh = afterCompile?.status === "PROJECT_540P_READY_FOR_FINAL_DECISION" && audioNowBound && afterCompile.review540pAudioBound !== true;
  if (needsProject540p || needsAudioRefresh) {
    await runProject540p();
  }
  const after540p = JSON.parse(fs.readFileSync(path.join(projectDir, "intake.json"), "utf8"));
  const canAutoRelease = after540p.status === "PROJECT_540P_READY_FOR_FINAL_DECISION"
    && after540p.visualQualityStatus === "passed"
    && hasBoundAudio();
  if (canAutoRelease) await runProjectFinal1080p();
  console.log(JSON.stringify({status: "PASS", projectId, next: canAutoRelease ? "1080p-and-davinci-rendered-automatically" : "automatic-540p-visual-gate-or-media-block", automaticFinalRelease: canAutoRelease}, null, 2));
}

let autopilotHandle;
let autopilotLockOwned = false;
try {
  const autopilotLockPath = path.join(projectDir, ".autopilot-worker.lock");
  // A 540p visual-repair pass is dispatched by the renderer before the
  // current autopilot process has released its lock. Wait for that owner
  // instead of treating the automatic repair as a duplicate and dropping it.
  for (let attempt = 0; attempt < 180 && !autopilotLockOwned; attempt += 1) {
    try {
      autopilotHandle = fs.openSync(autopilotLockPath, "wx");
      autopilotLockOwned = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await sleep(1000);
    }
  }
  if (!autopilotLockOwned) throw new Error("project-autopilot-lock-timeout");
  await main();
} catch (error) {
  if (error?.code === "EEXIST") {
    console.log(JSON.stringify({status: "SKIPPED", projectId, reason: "project-autopilot-already-running"}, null, 2));
    process.exitCode = 0;
  } else {
  const reason = error instanceof Error ? error.message : String(error);
  try { await updateWorkspace("project-autopilot-blocked", {reason}, (entry) => { entry.status = reason.startsWith("project-autopilot-ai-director-blocked") ? "BLOCKED_AI_DIRECTOR" : /media|source|presenter|screen|audio/iu.test(reason) ? "BLOCKED_MEDIA_MISSING" : "BLOCKED_AUTOMATION"; entry.directorReason = reason; entry.updatedAt = new Date().toISOString(); }); } catch {}
  console.error(JSON.stringify({status: "BLOCKED", projectId, reason}, null, 2));
  process.exitCode = 2;
  }
} finally {
  if (autopilotHandle != null) fs.closeSync(autopilotHandle);
  if (autopilotLockOwned) fs.rmSync(path.join(projectDir, ".autopilot-worker.lock"), {force: true});
}
