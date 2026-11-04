#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {
  A1_INCREMENTAL_REPAIR_DRY_RUN_REPORT_CONTRACT,
  buildRepairManifest,
  buildRunMetrics,
  compileGenerationDispatch,
  finalizeRepairManifest,
  auditRecordFromRawReference,
} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";

const projectRoot = path.resolve(process.argv[2] || path.join(import.meta.dirname, ".."));
const publicRoot = path.join(projectRoot, "apps/studio-next/public");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-phase.json");
const authorityAuditPath = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json");
const auditRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/look-master-audits");
// Keep the dry-run artifact at the exact sidecar path consumed by the
// production importer/worker.  A sibling root-level copy is not authoritative
// and previously allowed stale retry state to masquerade as current state.
const outputDir = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const workspace = readJson(workspacePath);
const currentPhase = readJson(currentPhasePath);
const authorityAudit = readJson(authorityAuditPath);
const runtime = workspace.production.shotIntelligence;
const canonicalRepairTargetIds = runtime.canonicalDirectorTargetRepairManifest?.generationEligibleShotIds || [];

const auditRecords = [];
if (fs.existsSync(auditRoot)) {
  for (const shotId of fs.readdirSync(auditRoot).filter((name) => /^ED-\d+$/u.test(name))) {
    const directory = path.join(auditRoot, shotId);
    for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".json"))) {
      try { auditRecords.push(readJson(path.join(directory, file))); } catch { /* ignore malformed historical cache entries */ }
    }
  }
}
for (const rawReference of runtime.lookMasterRawReferences || []) {
  const audit = auditRecordFromRawReference(rawReference);
  if (audit) auditRecords.push(audit);
}

const candidateRecords = [
  ...(workspace.production.generation.jobs || []).map((job) => job.output?.sha256 ? {...job.output, attempts: job.attempts || 0} : null).filter(Boolean),
  ...(runtime.lookMasterRawReferences || []).map((reference) => reference.artifact?.sha256 ? {
    ...reference,
    artifact: reference.artifact,
    shotId: reference.shotId || reference.artifact.shotId || null,
    planSha256: reference.planSha256 || null,
    lookMasterPlanSha256: reference.planSha256 || null,
    styleBriefSha256: reference.styleBriefSha256 || null,
    canonicalPrimitiveId: reference.canonicalPrimitiveId || null,
    directionFingerprint: reference.directionFingerprint,
    isRawReference: true,
    attempts: 1,
  } : null).filter(Boolean),
];

const started = performance.now();
const before = {
  workspaceSha256: workspace.workspaceSha256,
  boardSha: runtime.wholeFilmStaticBoard?.sha256 || null,
  candidateShas: (runtime.wholeFilmStaticBoard?.items || []).map((item) => item.artifactSha256).filter(Boolean).sort(),
  queued: workspace.production.generation.summary?.queued || 0,
  running: workspace.production.generation.summary?.running || 0,
  workerStatus: workspace.production.generation.workerStatus,
  assemblyCount: runtime.currentAssembly?.length || 0,
  assemblyCreationAllowed: runtime.wholeFilmBatchRecommendation?.assemblyCreationAllowed ?? false,
};

const scanStarted = performance.now();
const manifest = buildRepairManifest({workspace, currentPhase, authorityAudit, candidateRecords, auditRecords, mode: "dry-run"});
const scanTimeMs = performance.now() - scanStarted;
const dispatch = compileGenerationDispatch(manifest, {
  dryRun: true,
  automaticDispatchAllowed: workspace.production.generation.automaticDispatchAllowed === true,
  workerStatus: workspace.production.generation.workerStatus,
  maxConcurrency: 2,
});
const deltaAuditCount = manifest.entries.filter((entry) => entry.status === "AUDIT_DELTA_REQUIRED").length;
const finalization = finalizeRepairManifest(manifest, {dryRun: true});
const totalWallTimeMs = performance.now() - started;

const afterWorkspace = readJson(workspacePath);
const afterRuntime = afterWorkspace.production.shotIntelligence;
const after = {
  workspaceSha256: afterWorkspace.workspaceSha256,
  boardSha: afterRuntime.wholeFilmStaticBoard?.sha256 || null,
  candidateShas: (afterRuntime.wholeFilmStaticBoard?.items || []).map((item) => item.artifactSha256).filter(Boolean).sort(),
  queued: afterWorkspace.production.generation.summary?.queued || 0,
  running: afterWorkspace.production.generation.summary?.running || 0,
  workerStatus: afterWorkspace.production.generation.workerStatus,
  assemblyCount: afterRuntime.currentAssembly?.length || 0,
  assemblyCreationAllowed: afterRuntime.wholeFilmBatchRecommendation?.assemblyCreationAllowed ?? false,
};

const packageEntries = manifest.entries.filter((entry) => entry.reasonCodes.includes("PACKAGE_ROUTE"));
const canonicalStaticBoardBlockedShotIds = runtime.canonicalStaticBoardAuthority?.status === "BLOCKED"
  ? runtime.canonicalStaticBoardAuthority.selectionMissingShotIds || []
  : [];
const canonicalInputReadyShotIds = runtime.canonicalStaticBoardInputReadiness?.status === "PASS"
  && runtime.canonicalStaticBoardInputReadiness?.generationAllowed === true
  ? [runtime.canonicalStaticBoardInputReadiness.shotId].filter((shotId) => canonicalStaticBoardBlockedShotIds.includes(shotId))
  : [];
const canonicalInputMissingShotIds = canonicalStaticBoardBlockedShotIds.filter((shotId) => !canonicalInputReadyShotIds.includes(shotId));
const expectedCachedPassCount = packageEntries.length - canonicalStaticBoardBlockedShotIds.length;
assert.equal(manifest.summary.shotCount, workspace.article.shotCount);
assert.equal(packageEntries.length, 15);
assert.equal(manifest.summary.cachedPassCount, expectedCachedPassCount);
for (const shotId of canonicalRepairTargetIds) {
  const entry = manifest.entries.find((item) => item.shotId === shotId);
  assert.equal(entry?.status, "CACHED_PASS", `audited canonical target must reuse its current actual-pixel PASS:${shotId}`);
  assert.ok(entry?.candidateSha, `audited canonical target must retain its current candidate SHA:${shotId}`);
  assert.equal(entry?.auditStatus, "PASS_CACHED", `audited canonical target must retain its current audit cache:${shotId}`);
}
for (const shotId of canonicalInputMissingShotIds) {
  const entry = manifest.entries.find((item) => item.shotId === shotId);
  assert.equal(entry?.status, "PREFLIGHT_BLOCKED", `missing canonical board input must remain statically blocked:${shotId}`);
  assert.equal(entry?.candidateSha, null, `missing canonical board input must not reuse a superseded candidate:${shotId}`);
  assert.ok(entry?.preflight?.hardFailures?.length > 0, `missing canonical board input must explain its preflight blockers:${shotId}`);
}
for (const shotId of canonicalInputReadyShotIds) {
  const entry = manifest.entries.find((item) => item.shotId === shotId);
  assert.ok(["READY_FOR_GENERATION", "REPAIR_REQUIRED_DEPENDENCY_CHANGE"].includes(entry?.status), `prepared canonical board input must be shot-locally dispatchable:${shotId}`);
  assert.equal(entry?.candidateSha, null, `prepared canonical board input must not reuse a superseded candidate:${shotId}`);
  assert.equal(entry?.preflight?.status, "PASS", `prepared canonical board input must pass static preflight:${shotId}`);
}
assert.equal(dispatch.jobs.length, 0);
assert.equal(dispatch.reason, "DRY_RUN_NO_IMAGEGEN");
assert.equal(deltaAuditCount, 0);
assert.equal(finalization.executed, false);
assert.ok(finalization.blockers.includes("dry-run-finalize-not-executed"));
assert.deepEqual(after, before);
assert.equal(manifest.authority.conflicts.length, 0);
assert.equal(manifest.authority.assemblyCreationAllowed, false);

const report = {
  contract: A1_INCREMENTAL_REPAIR_DRY_RUN_REPORT_CONTRACT,
  executorContract: "A1IncrementalRepairExecutor/v2",
  status: "PASS",
  mode: "dry-run",
  generatedAt: new Date().toISOString(),
  source: {workspacePath, currentPhasePath, authorityAuditPath, auditRoot, actualCandidateAuditSource: "workspace.production.shotIntelligence.lookMasterRawReferences[].pixelAudit+semanticPixelAudit", boardReportRole: "aggregate-only"},
  manifest: {contract: manifest.contract, sha256: manifest.manifestSha256, entryCount: manifest.entries.length, packageCount: packageEntries.length, cachedPassCount: manifest.summary.cachedPassCount, canonicalRepairTargetIds, canonicalStaticBoardBlockedShotIds},
  dependencyChain: ["sourceRevision", "semanticDecision", "plan", "prompt", "candidateSha", "auditVersion", "board"],
  stateMachine: ["DISCOVER", "COMPILE", "PREFLIGHT", "GENERATE", "AUDIT_DELTA", "FINALIZE"],
  stages: {discover: "PASS", compile: "PASS", preflight: canonicalInputMissingShotIds.length ? "BLOCKED_INPUTS" : canonicalInputReadyShotIds.length ? "PASS_GENERATION_READY" : "PASS", generate: "SKIPPED_DRY_RUN", auditDelta: "CACHE_ONLY", finalize: "NOT_RUN_INPUT_GATE"},
  queue: {generationCalls: 0, queued: dispatch.jobs.length, pendingGeneration: dispatch.pendingCount, workerStatus: after.workerStatus, hardConcurrency: dispatch.hardConcurrency, isolationConcurrency: dispatch.isolationConcurrency, polling: dispatch.polling},
  authority: manifest.authority,
  invariants: {workspaceLogicalShaUnchanged: before.workspaceSha256 === after.workspaceSha256, candidateShasUnchanged: JSON.stringify(before.candidateShas) === JSON.stringify(after.candidateShas), boardShaUnchanged: before.boardSha === after.boardSha, queueEmpty: after.queued === 0 && after.running === 0, workerFrozen: after.workerStatus === "frozen", assemblyEmpty: after.assemblyCount === 0, assemblyCreationDisabled: after.assemblyCreationAllowed === false, imageGenCalled: false, boardRebuilt: false, finalizeExecuted: false, boardReportNotUsedAsCandidateAudit: true},
  metrics: buildRunMetrics({manifest, scanTimeMs, generationCalls: 0, retryCount: 0, deltaAuditCount, boardRebuildCount: 0, totalWallTimeMs}),
  nextAction: canonicalInputMissingShotIds.length
    ? `补齐 ${canonicalInputMissingShotIds.join("/")} 的 canonical 静态板输入；旧板不可批准。`
    : canonicalInputReadyShotIds.length
      ? `只派发 ${canonicalInputReadyShotIds.join("/")} 的 canonical 静态板输入修复；旧板不可批准。`
      : "用户审当前全片静态板；未替用户批准，不进入 Assembly/拆层/critic/motion。",
};

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, "repair-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "dry-run-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, reportPath: path.join(outputDir, "dry-run-report.json"), manifestPath: path.join(outputDir, "repair-manifest.json"), manifestSha256: manifest.manifestSha256, packageCount: packageEntries.length, cachedPassCount: manifest.summary.cachedPassCount, generationCalls: report.metrics.generationCalls, deltaAuditCount, finalizeExecuted: finalization.executed, workspaceSha256: after.workspaceSha256, boardSha: after.boardSha}, null, 2));
