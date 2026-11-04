#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {updateRepairManifestSidecar} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {A1_GENERATOR_LANES, A1_CODEX_IMAGEGEN_PROVIDER, buildGenerationProviderRoutingV2, sha256} from "../apps/studio-next/src/lib/a1-isolated-imagegen-generation-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const isolatedRoot = path.join(artifactDir, "isolated-imagegen-v2");
const manifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const feedbackCode = "USER_AESTHETIC_FEEDBACK_MECHANICAL";
const nextPrimitiveId = "human-editorial-manuscript-table:one-continuous-paper-story";
const now = new Date().toISOString();

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function readCanaryRecord(jobId) {
  const jobPath = path.join(isolatedRoot, "jobs", `${jobId}.json`);
  const resultPath = path.join(isolatedRoot, "results", jobId, "result.json");
  if (!fs.existsSync(jobPath) || !fs.existsSync(resultPath)) throw new Error(`mechanical-rejection-canary-receipt-missing:${jobId}`);
  const job = readJson(jobPath);
  const result = readJson(resultPath);
  return {jobId, shotId: job.shotId, primitiveId: job.primitiveId, attempt: job.attempt, artifactSha: result.artifactSha, sourceResultStatus: result.status, status: "REJECTED_BY_USER_AESTHETIC", historyReadOnly: true, productionCandidate: false, imported: false, reasonCodes: [feedbackCode], rejectedAt: now};
}

const transaction = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("mechanical-rejection-requires-frozen-empty-queue");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("mechanical-rejection-requires-empty-assembly");
  const previousJobId = current.production.generation.providerRouting?.canary?.jobId;
  if (!previousJobId) throw new Error("mechanical-rejection-current-canary-missing");
  const currentJob = readJson(path.join(isolatedRoot, "jobs", `${previousJobId}.json`));
  const jobIds = [...new Set([currentJob.retryOfJobId, previousJobId].filter(Boolean))];
  const history = jobIds.map(readCanaryRecord);
  const boardSha256 = current.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null;
  const candidateShas = (current.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean).sort();
  const baseSourceRevisionHash = current.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-20")?.canonicalStaticBoardInput?.sourceRevisionHash || current.production.shotIntelligence.canonicalDirectorAuthority?.sourceRevisionHash;
  const sourceRevisionHash = sha256({baseSourceRevisionHash, feedbackCode, nextPrimitiveId});
  const routingBase = buildGenerationProviderRoutingV2({status: "CANARY_REQUIRED", canary: null, now});
  const routing = {...routingBase, canaryHistory: history, routingSha256: sha256({...routingBase, canaryHistory: history, routingSha256: undefined})};
  const next = structuredClone(current);
  next.production.generation.providerRouting = routing;
  next.production.generation.providerState = {provider: A1_CODEX_IMAGEGEN_PROVIDER, status: "CANARY_REQUIRED", fallback: "BLOCKED_NO_WEB_FALLBACK", observedAt: now};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  const event = createProductionEvent({workspace: current, action: "codex-imagegen-user-aesthetic-rejection", targetId: "ED-20", payload: {reasonCode: feedbackCode, rejectedCanaryArtifactShas: history.map((item) => item.artifactSha), nextPrimitiveId, sourceRevisionHash}, now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1CodexImageGenUserAestheticRejection/v2", status: "PASS", shotId: "ED-20", reasonCode: feedbackCode, history, nextPrimitiveId, sourceRevisionHash, workspaceSha256Before: current.workspaceSha256, boardSha256, candidateShaCount: candidateShas.length, candidateImported: false, boardRebuilt: false, createdAt: now};
  const saved = persistProjectState(appRoot, recalculated, {event, files: {"isolated-imagegen-v2/user-aesthetic-rejection.json": report}, expectedWorkspaceSha256: current.workspaceSha256});
  const persisted = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const persistedCandidates = (persisted.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean).sort();
  if (persisted.production.shotIntelligence.wholeFilmStaticBoard?.sha256 !== boardSha256) throw new Error("mechanical-rejection-board-sha-changed");
  if (JSON.stringify(persistedCandidates) !== JSON.stringify(candidateShas)) throw new Error("mechanical-rejection-candidate-shas-changed");
  return {saved, report};
});

await updateRepairManifestSidecar({manifestPath, update: (manifest) => {
  const next = structuredClone(manifest);
  const entry = next.entries.find((item) => item.shotId === "ED-20");
  if (!entry) throw new Error("mechanical-rejection-ed20-manifest-entry-missing");
  entry.canaryHistory = (entry.canaryHistory || []).map((item) => ({...item, status: "HISTORY_READ_ONLY", rejectionStatus: "REJECTED_BY_USER_AESTHETIC", reasonCodes: [...new Set([...(item.reasonCodes || []), feedbackCode])], productionCandidate: false, imported: false}));
  entry.userAestheticFeedback = {code: feedbackCode, status: "LOCKED", receivedAt: now, scope: "ED-20", instruction: "forbid mechanical workflow/process-diagram language"};
  entry.primitiveCandidates = [nextPrimitiveId, ...(entry.primitiveCandidates || []).filter((item) => item !== nextPrimitiveId)];
  entry.primitiveId = nextPrimitiveId;
  entry.sourceRevisionHash = transaction.report.sourceRevisionHash;
  entry.promptHash = null;
  entry.finalSha = null;
  entry.attempt = 0;
  entry.status = "CANARY_REQUIRED";
  entry.generationState = "READY";
  entry.auditStatus = "NOT_RUN";
  entry.nextAction = {action: "PREPARE_NEW_PRIMITIVE_CANARY", provider: A1_CODEX_IMAGEGEN_PROVIDER, generatorLane: A1_GENERATOR_LANES.TYPOGRAPHY_EXPLAINER, primitiveId: nextPrimitiveId, sourceRevisionHash: transaction.report.sourceRevisionHash, reasonCode: feedbackCode, forbiddenVisualLanguages: ["conveyor", "factory", "machine pipeline", "lock station", "terminal receipt", "computer cursor", "ui workflow", "four cards", "four icons"], importAllowedBeforeAuditPass: false, webFallbackAllowed: false};
  return next;
}});

console.log(JSON.stringify({status: "PASS", ...transaction.report, workspaceSha256After: transaction.saved.workspaceSha256, oldCanariesHistoryOnly: true}, null, 2));
