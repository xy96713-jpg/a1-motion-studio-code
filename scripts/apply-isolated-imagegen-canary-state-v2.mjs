#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {updateRepairManifestSidecar} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {A1_GENERATOR_LANES, assertGenerationJobV2, assertGenerationResultV2, buildGenerationProviderRoutingV2, sha256} from "../apps/studio-next/src/lib/a1-isolated-imagegen-generation-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const isolatedRoot = path.join(artifactDir, "isolated-imagegen-v2");
const args = process.argv.slice(2);
const arg = (name) => args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const jobPath = path.resolve(root, arg("--job") || "");
const resultPath = path.resolve(root, arg("--result") || "");
if (![jobPath, resultPath].every(fs.existsSync)) throw new Error("isolated-imagegen-canary-state-job-result-required");
const job = assertGenerationJobV2(JSON.parse(fs.readFileSync(jobPath, "utf8")));
const result = assertGenerationResultV2(JSON.parse(fs.readFileSync(resultPath, "utf8")));
if (job.jobId !== result.jobId || job.generationKey !== result.generationKey) throw new Error("isolated-imagegen-canary-state-binding-mismatch");
const canaryPassed = result.status === "AUDIT_PASS" && result.rejectionCodes.length === 0;
const samePrimitiveRetryExhausted = !canaryPassed && job.attempt >= 2;
const now = new Date().toISOString();
const candidateShas = (workspace) => (workspace.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean).sort();

const transaction = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("isolated-imagegen-canary-state-requires-frozen-empty-queue");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("isolated-imagegen-canary-state-requires-empty-assembly");
  if (current.production.generation.providerRouting?.activeProvider !== job.provider) throw new Error("isolated-imagegen-canary-state-provider-drift");
  const boardSha256 = current.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null;
  const beforeCandidateShas = candidateShas(current);
  const canary = {jobId: job.jobId, shotId: job.shotId, generationKey: job.generationKey, artifactSha: result.artifactSha, resultStatus: result.status, resultReceiptSha256: sha256(`${JSON.stringify(result, null, 2)}\n`), rejectionCodes: result.rejectionCodes, evaluatedAt: now};
  const routingStatus = canaryPassed ? "CANARY_PASS_LANES_READY" : samePrimitiveRetryExhausted ? "CANARY_PRIMITIVE_SWITCH_REQUIRED" : "CANARY_RETRY_REQUIRED";
  const routing = buildGenerationProviderRoutingV2({status: routingStatus, canary, now});
  const next = structuredClone(current);
  next.production.generation.providerRouting = routing;
  next.production.generation.providerState = {provider: job.provider, status: routing.status, fallback: "BLOCKED_NO_WEB_FALLBACK", observedAt: now};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  const event = createProductionEvent({workspace: current, action: canaryPassed ? "codex-imagegen-canary-pass" : samePrimitiveRetryExhausted ? "codex-imagegen-canary-primitive-switch-required" : "codex-imagegen-canary-blocked", targetId: job.shotId, payload: canary, now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const laneSpecs = canaryPassed ? {
    "isolated-imagegen-v2/lanes/lane-a.json": {contract: "A1IsolatedGeneratorLane/v2", laneId: A1_GENERATOR_LANES.HOLD_FRAME_EVIDENCE, status: "READY_IDLE", maxConcurrentJobs: 1, workspaceWriteAllowed: false, acceptedJobContract: job.contract, resultContract: result.contract, styleAuthority: job.styleVersion, importPolicy: "MAINLINE_SERIAL_TRANSACTION_ONLY_AFTER_AUDIT_PASS"},
    "isolated-imagegen-v2/lanes/lane-b.json": {contract: "A1IsolatedGeneratorLane/v2", laneId: A1_GENERATOR_LANES.TYPOGRAPHY_EXPLAINER, status: "ASSIGNED", maxConcurrentJobs: 1, assignedJobId: job.jobId, assignedShotId: job.shotId, generationKey: job.generationKey, workspaceWriteAllowed: false, acceptedJobContract: job.contract, resultContract: result.contract, styleAuthority: job.styleVersion, importPolicy: "MAINLINE_SERIAL_TRANSACTION_ONLY_AFTER_AUDIT_PASS"},
  } : {};
  const report = {contract: "A1CodexImageGenCanaryStateCheckpoint/v2", status: canaryPassed ? "PASS" : "BLOCKED", canary, laneSpecsCreated: canaryPassed ? 2 : 0, workspaceSha256Before: current.workspaceSha256, boardSha256, candidateShaCount: beforeCandidateShas.length, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length, boardRebuilt: false, candidateImported: false, createdAt: now};
  const saved = persistProjectState(appRoot, recalculated, {event, files: {"isolated-imagegen-v2/canary-state-checkpoint.json": report, ...laneSpecs}, expectedWorkspaceSha256: current.workspaceSha256});
  const persisted = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (persisted.production.shotIntelligence.wholeFilmStaticBoard?.sha256 !== boardSha256) throw new Error("isolated-imagegen-canary-state-board-sha-changed");
  if (JSON.stringify(candidateShas(persisted)) !== JSON.stringify(beforeCandidateShas)) throw new Error("isolated-imagegen-canary-state-candidate-shas-changed");
  return {saved, report};
});

await updateRepairManifestSidecar({manifestPath: path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json"), update: (manifest) => {
  const next = structuredClone(manifest);
  const entry = next.entries.find((item) => item.shotId === job.shotId);
  if (!entry) throw new Error(`isolated-imagegen-canary-state-manifest-entry-missing:${job.shotId}`);
  const previousReceiptPath = job.retryOfJobId ? path.join(isolatedRoot, "results", job.retryOfJobId, "result.json") : null;
  const previousReceipt = previousReceiptPath && fs.existsSync(previousReceiptPath) ? JSON.parse(fs.readFileSync(previousReceiptPath, "utf8")) : null;
  const canaryHistoryByJob = new Map((entry.canaryHistory || []).map((item) => [item.jobId, item]));
  if (previousReceipt) canaryHistoryByJob.set(previousReceipt.jobId, {jobId: previousReceipt.jobId, primitiveId: job.primitiveId, attempt: previousReceipt.attempt, artifactSha: previousReceipt.artifactSha, status: previousReceipt.status, rejectionCodes: previousReceipt.rejectionCodes, historical: true});
  const currentCanary = {jobId: job.jobId, primitiveId: job.primitiveId, attempt: job.attempt, generationKey: job.generationKey, artifactSha: result.artifactSha, status: result.status, rejectionCodes: result.rejectionCodes, evaluatedAt: now};
  canaryHistoryByJob.set(job.jobId, currentCanary);
  entry.canaryHistory = [...canaryHistoryByJob.values()].sort((left, right) => Number(left.attempt || 0) - Number(right.attempt || 0));
  entry.canary = currentCanary;
  entry.generatorLane = A1_GENERATOR_LANES.TYPOGRAPHY_EXPLAINER;
  entry.attempt = Math.max(Number(entry.attempt || 0), job.attempt);
  const triedPrimitiveIds = new Set(entry.canaryHistory.map((item) => item.primitiveId).filter(Boolean));
  const nextPrimitiveId = samePrimitiveRetryExhausted ? (entry.primitiveCandidates || []).find((item) => item && !triedPrimitiveIds.has(item)) || null : null;
  if (nextPrimitiveId) entry.primitiveId = nextPrimitiveId;
  entry.status = canaryPassed ? "DISPATCH_READY" : nextPrimitiveId ? "SWITCH_PRIMITIVE_PENDING" : job.attempt === 1 ? "RETRY_SAME_PRIMITIVE_PENDING" : "CANARY_BLOCKED";
  entry.generationState = canaryPassed || nextPrimitiveId || job.attempt === 1 ? "READY" : "BLOCKED";
  entry.nextAction = canaryPassed
    ? {action: "DISPATCH_ISOLATED_GENERATION_JOB", generatorLane: A1_GENERATOR_LANES.TYPOGRAPHY_EXPLAINER, generationKey: job.generationKey, importAllowedBeforeAuditPass: false}
    : nextPrimitiveId
      ? {action: "SWITCH_PRIMITIVE_FOR_CAPABILITY_CANARY", exhaustedPrimitiveId: job.primitiveId, attemptsOnPrimitive: job.attempt, nextPrimitiveId, rejectionCodes: result.rejectionCodes, webFallbackAllowed: false}
      : job.attempt === 1
        ? {action: "RETRY_SAME_PRIMITIVE_ONCE", primitiveId: job.primitiveId, attempt: job.attempt, rejectionCodes: result.rejectionCodes, webFallbackAllowed: false}
        : {action: "BLOCKED_PROVIDER_CAPABILITY_CANARY", rejectionCodes: result.rejectionCodes, webFallbackAllowed: false};
  return next;
}});

console.log(JSON.stringify({status: transaction.report.status, ...transaction.report, workspaceSha256After: transaction.saved.workspaceSha256}, null, 2));
