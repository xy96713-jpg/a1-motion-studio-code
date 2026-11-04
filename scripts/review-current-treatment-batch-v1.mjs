#!/usr/bin/env node

import path from "node:path";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {requeueVisualTreatmentCompositeReview} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const scopeArg = process.argv.find((item) => item.startsWith("--scope="))?.split("=")[1] || "all";
const reviewScope = scopeArg === "champion" ? "champion-or-all" : "all";
const expectedCandidateCount = reviewScope === "all" ? 6 : 2;
const renderOnly = process.argv.includes("--render-only");
const {artifactDir} = projectDirs(appRoot);
const compositorWorkerLock = path.join(artifactDir, ".generated-visual-composite-worker.lock");

if (fs.existsSync(compositorWorkerLock)) {
  let ownerPid = null;
  try { ownerPid = Number(fs.readFileSync(compositorWorkerLock, "utf8").trim()) || null; } catch {}
  let ownerAlive = false;
  if (ownerPid) {
    try { process.kill(ownerPid, 0); ownerAlive = true; } catch {}
  }
  if (ownerAlive) {
    console.log(JSON.stringify({status: "SKIPPED", reason: "generated-visual-composite-worker-already-running", ownerPid}));
    process.exit(0);
  }
}

const queued = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(readProjectWorkspace(appRoot), now));
  const activeVisualJobs = current.production.generation.jobs.filter((job) => job.targetKind === "visual-layer" && ["queued", "running"].includes(job.status));
  if (activeVisualJobs.length) throw new Error(`treatment-batch-review-refuses-active-image-generation:${activeVisualJobs.length}`);
  const result = requeueVisualTreatmentCompositeReview(current, now, {scope: reviewScope});
  if (result.candidateCount !== expectedCandidateCount) throw new Error(`treatment-batch-existing-candidates-required:${result.candidateCount}/${expectedCandidateCount}`);
  result.workspace.production.generation.automaticDispatchAllowed = false;
  result.workspace.production.visualDirector.treatmentBatchProgress = {
    contract: "A1TreatmentBatchProgress/v1",
    status: "queued",
    phase: "queued-existing-materials-only",
    completedCount: 0,
    totalCount: result.candidateCount,
    batchHash: null,
    timeoutMs: Number(process.env.A1_VISUAL_MATURITY_CRITIC_TIMEOUT_MS || 360_000),
    elapsedMs: 0,
    heartbeatAt: now,
    compositorSourceSha256: null,
    error: null,
  };
  const event = createProductionEvent({workspace: current, action: renderOnly ? "visual-treatment-compositor-render-only-queued" : reviewScope === "all" ? "visual-treatment-3x2-compositor-review-queued" : "visual-treatment-champion-compositor-review-queued", targetId: reviewScope === "all" ? "visual-treatment-3x2" : current.production.visualDirector.treatmentBatchReview?.championTreatmentId || "visual-treatment-champion", payload: {candidateCount: result.candidateCount, imageGenerationDispatched: false, criticDispatched: !renderOnly, reviewScope, reviewMode: "one-remotion-bundle-one-browser-one-batch-critic"}, now});
  result.workspace.production.eventLedger.eventCount += 1;
  result.workspace.production.eventLedger.lastEventId = event.eventId;
  result.workspace.production.eventLedger.lastEventAt = event.createdAt;
  const next = recalculateEditorialAssetWorkbench(result.workspace, now);
  persistProjectState(appRoot, next, {event});
  return {workspaceSha256: next.workspaceSha256, candidateCount: result.candidateCount};
});

console.log(JSON.stringify({status: renderOnly ? "TREATMENT_BATCH_RENDER_ONLY_QUEUED" : "TREATMENT_BATCH_REVIEW_QUEUED", ...queued, imageGenerationDispatched: false, criticDispatched: !renderOnly}));
const child = spawnSync(process.execPath, [path.join(root, "scripts/render-generated-visual-composite-v2.mjs"), ...(renderOnly ? ["--render-only"] : [])], {cwd: root, stdio: "inherit", env: process.env});
if (child.error) throw child.error;
if (child.status !== 0) process.exitCode = child.status || 1;
