#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  applyCanonicalStaticBoardInput,
  canonicalStaticBoardInputIsReady,
  compileCanonicalStaticBoardInput,
} from "../apps/studio-next/src/lib/a1-canonical-static-board-input-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  auditRecordFromRawReference,
  buildRepairManifest,
  writeRepairManifestSidecarAtomic,
} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {reconcileSemanticTimelineRevision} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {applySemanticTimelineToDecisionSet, deriveSemanticTimelineRevision} from "../apps/studio-next/src/lib/a1-semantic-timeline-decision-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const currentPhasePath = path.join(artifactRoot, "current-phase.json");
const authorityAuditPath = path.join(artifactRoot, "system-line-current-authority-v2/audit-report.json");
const repairManifestPath = path.join(artifactRoot, "editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json");
const auditRoot = path.join(publicRoot, "look-master-audits");
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const readOptionalJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function candidateShas(workspace) {
  return [...new Set([
    ...(workspace.production.shotIntelligence.wholeFilmStaticBoard?.items || []).map((item) => item.artifactSha256),
    ...(workspace.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256),
  ].filter(Boolean))].sort();
}

function collectAuditRecords(workspace) {
  const records = [];
  if (fs.existsSync(auditRoot)) for (const shotId of fs.readdirSync(auditRoot).filter((name) => /^ED-\d+$/u.test(name))) {
    const directory = path.join(auditRoot, shotId);
    for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".json"))) {
      try { records.push(JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"))); } catch { /* history can contain malformed non-authoritative files */ }
    }
  }
  for (const reference of workspace.production.shotIntelligence.lookMasterRawReferences || []) {
    const audit = auditRecordFromRawReference(reference);
    if (audit) records.push(audit);
  }
  return records;
}

function collectCandidateRecords(workspace) {
  return [
    ...(workspace.production.generation.jobs || []).map((job) => job.output?.sha256 ? {...job.output, attempts: job.attempts || 0} : null).filter(Boolean),
    ...(workspace.production.shotIntelligence.lookMasterRawReferences || []).map((reference) => reference.artifact?.sha256 ? {
      ...reference,
      artifact: reference.artifact,
      shotId: reference.shotId || reference.artifact.shotId || null,
      planSha256: reference.planSha256 || null,
      lookMasterPlanSha256: reference.planSha256 || null,
      styleBriefSha256: reference.styleBriefSha256 || null,
      canonicalPrimitiveId: reference.canonicalPrimitiveId || null,
      isRawReference: true,
      attempts: 1,
    } : null).filter(Boolean),
  ];
}

function restoreDeterministicDecisionProjection(workspace, now) {
  const next = structuredClone(workspace);
  const reconciliation = reconcileSemanticTimelineRevision({
    decisionSet: next.production.shotIntelligence.decisionSet,
    beats: next.production.packagingBeatPlan.semanticBeats,
    sourceHash: next.article.sourceTextSha256,
    projectId: next.production.project.projectId,
    now,
  });
  next.production.shotIntelligence.decisionSet = applySemanticTimelineToDecisionSet(reconciliation.decisionSet, {
    beats: next.production.packagingBeatPlan.semanticBeats,
    sourceHash: next.article.sourceTextSha256,
    now,
  });
  return next;
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  if (current.production.generation.summary.queued || current.production.generation.summary.running || current.production.generation.workerStatus !== "frozen") throw new Error("canonical-static-board-input-preparation-requires-frozen-idle-queue");
  if ((runtime.currentAssembly || []).length || (current.production.visualProductionRun?.currentAssembly || []).length) throw new Error("canonical-static-board-input-preparation-requires-empty-assembly");
  if (runtime.wholeFilmStaticBoard?.status !== "SUPERSEDED_CANONICAL_INPUT_BLOCKED" || runtime.canonicalStaticBoardAuthority?.status !== "BLOCKED" || JSON.stringify(runtime.canonicalStaticBoardAuthority.selectionMissingShotIds) !== JSON.stringify(["ED-20"])) throw new Error("canonical-static-board-input-preparation-checkpoint-drift");
  const inputReady = canonicalStaticBoardInputIsReady(current);
  const currentEd03Coverage = current.production.shotVisualCoveragePlan?.shotPlans?.find((item) => item.shotId === "ED-03");
  const currentEd20Decision = runtime.decisionSet?.items?.find((item) => item.shotId === "ED-20");
  const currentEd32Decision = runtime.decisionSet?.items?.find((item) => item.shotId === "ED-32");
  const semanticRevision = deriveSemanticTimelineRevision({beats: current.production.packagingBeatPlan.semanticBeats, sourceHash: current.article.sourceTextSha256, decisionSet: runtime.decisionSet});
  const projectionCurrent = current.production.authority?.nextAction?.id === "dispatch-canonical-static-board-input-repair"
    && current.production.shotIntelligence.wholeFilmBatchRecommendation?.nextUserGate === "CANONICAL_STATIC_BOARD_INPUT_GENERATION"
    && currentEd03Coverage?.route === "SCREEN_EVIDENCE"
    && currentEd20Decision?.packageDecision === "NO_PACKAGE"
    && currentEd32Decision?.packageDecision === "PACKAGE"
    && semanticRevision.recompileRequired === false;
  if (inputReady && projectionCurrent) return {workspace: current, alreadyCurrent: true, report: readOptionalJson(path.join(artifactRoot, "editorial-asset-workbench-v1/canonical-static-board-authority-v1/ed20-input-preflight-report.json"))};
  if (inputReady) {
    const now = new Date().toISOString();
    const before = {workspaceSha256: current.workspaceSha256, boardSha256: runtime.wholeFilmStaticBoard.sha256, candidateShas: candidateShas(current)};
    const deterministicProjection = restoreDeterministicDecisionProjection(current, now);
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(deterministicProjection, now));
    const after = {workspaceSha256: recalculated.workspaceSha256, boardSha256: recalculated.production.shotIntelligence.wholeFilmStaticBoard.sha256, candidateShas: candidateShas(recalculated)};
    if (before.boardSha256 !== after.boardSha256 || JSON.stringify(before.candidateShas) !== JSON.stringify(after.candidateShas)) throw new Error("canonical-static-board-input-projection-mutated-board-or-candidate-sha");
    const readiness = runtime.canonicalStaticBoardInputReadiness;
    const event = createProductionEvent({workspace: current, action: "canonical-static-board-input-projection-reconciled", targetId: "ED-20", payload: {readinessSha256: readiness.readinessSha256, imageGenCalled: false, boardRebuilt: false}, now});
    recalculated.production.eventLedger.eventCount += 1;
    recalculated.production.eventLedger.lastEventId = event.eventId;
    recalculated.production.eventLedger.lastEventAt = event.createdAt;
    const report = {
      ...(readOptionalJson(path.join(artifactRoot, "editorial-asset-workbench-v1/canonical-static-board-authority-v1/ed20-input-preflight-report.json")) || {}),
      contract: "A1CanonicalStaticBoardInputPreflightReport/v1",
      status: "PASS",
      checkpoint: "CANONICAL_STATIC_BOARD_INPUT_READY",
      shotId: "ED-20",
      workspaceSha256Before: before.workspaceSha256,
      workspaceSha256After: after.workspaceSha256,
      boardSha256: after.boardSha256,
      candidateShasUnchanged: true,
      projectionReconciled: true,
      generationAllowed: true,
      generationDispatched: false,
      imageGenCalls: 0,
      boardRebuilt: false,
      assemblyStarted: false,
      queue: recalculated.production.generation.summary,
      workerStatus: recalculated.production.generation.workerStatus,
      generatedAt: now,
    };
    persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"canonical-static-board-authority-v1/ed20-input-preflight-report.json": report}});
    return {workspace: recalculated, alreadyCurrent: false, projectionReconciled: true, report};
  }

  const historicalContext = (runtime.videoPackagingContextHistory || []).filter((item) => item.shotId === "ED-20").at(-1);
  const framePath = path.join(appRoot, "public", historicalContext?.baseFrame?.publicUrl?.replace(/^\/+/, "") || "__missing__");
  if (!historicalContext?.baseFrame || !fs.existsSync(framePath) || fileSha256(framePath) !== historicalContext.baseFrame.sha256) throw new Error("canonical-static-board-input-real-hold-frame-verification-failed");
  const before = {workspaceSha256: current.workspaceSha256, boardSha256: runtime.wholeFilmStaticBoard.sha256, candidateShas: candidateShas(current)};
  const now = new Date().toISOString();
  const compiled = compileCanonicalStaticBoardInput({workspace: current, appRoot, referenceManifest, holdFrame: historicalContext.baseFrame, now});
  const prepared = applyCanonicalStaticBoardInput(current, compiled, {now});
  const deterministicProjection = restoreDeterministicDecisionProjection(prepared, now);
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(deterministicProjection, now));
  const scope = buildCanonicalStaticBoardScope(recalculated);
  if (scope.status !== "BLOCKED" || JSON.stringify(scope.selectionMissingShotIds) !== JSON.stringify(["ED-20"])) throw new Error("canonical-static-board-input-must-remain-board-selection-blocked");
  recalculated.production.shotIntelligence.canonicalStaticBoardAuthority = scope;
  const after = {workspaceSha256: recalculated.workspaceSha256, boardSha256: recalculated.production.shotIntelligence.wholeFilmStaticBoard.sha256, candidateShas: candidateShas(recalculated)};
  if (before.boardSha256 !== after.boardSha256 || JSON.stringify(before.candidateShas) !== JSON.stringify(after.candidateShas)) throw new Error("canonical-static-board-input-preparation-mutated-board-or-candidate-sha");
  const event = createProductionEvent({
    workspace: current,
    action: "canonical-static-board-input-prepared",
    targetId: "ED-20",
    payload: {readinessSha256: compiled.readiness.readinessSha256, planSha256: compiled.plan.planSha256, styleBriefSha256: compiled.styleBrief.styleBriefSha256, videoContextSha256: compiled.context.contextSha256, holdFrameSha256: compiled.context.baseFrame.sha256, imageGenCalled: false, boardRebuilt: false},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1CanonicalStaticBoardInputPreflightReport/v1",
    status: "PASS",
    checkpoint: "CANONICAL_STATIC_BOARD_INPUT_READY",
    shotId: "ED-20",
    workspaceSha256Before: before.workspaceSha256,
    workspaceSha256After: after.workspaceSha256,
    boardSha256: after.boardSha256,
    candidateShasUnchanged: true,
    currentSlotReplacement: {removedFromCurrent: "ED-32", addedToCurrent: "ED-20", currentPlanCount: recalculated.production.shotIntelligence.packageLookMasterPlans.length},
    bindings: {authoritySha256: compiled.readiness.authoritySha256, sourceRevisionHash: compiled.readiness.sourceRevisionHash, canonicalDecisionSha256: compiled.readiness.canonicalDecisionSha256, planSha256: compiled.plan.planSha256, styleBriefSha256: compiled.styleBrief.styleBriefSha256, videoContextSha256: compiled.context.contextSha256, holdFrameSha256: compiled.context.baseFrame.sha256, promptSha256: compiled.readiness.promptSha256},
    visual: {typographyVisualRole: compiled.plan.typographyVisualRole, visibleCopy: compiled.readiness.visibleCopy, primitiveId: compiled.readiness.primitiveId, referenceIds: compiled.plan.referenceInputs.map((item) => item.id), palette: compiled.styleBrief.variation.palette},
    preflight: compiled.preflight,
    generationAllowed: true,
    generationDispatched: false,
    imageGenCalls: 0,
    boardRebuilt: false,
    assemblyStarted: false,
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    generatedAt: now,
  };
  persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"canonical-static-board-authority-v1/ed20-input-preflight-report.json": report}});
  return {workspace: recalculated, alreadyCurrent: false, report};
});

const persisted = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const previousManifest = readOptionalJson(repairManifestPath);
const manifest = buildRepairManifest({
  workspace: persisted,
  currentPhase: readOptionalJson(currentPhasePath),
  authorityAudit: readOptionalJson(authorityAuditPath),
  candidateRecords: collectCandidateRecords(persisted),
  auditRecords: collectAuditRecords(persisted),
  previousManifest,
  mode: "execution",
});
const persistedManifest = writeRepairManifestSidecarAtomic({manifestPath: repairManifestPath, manifest, expectedManifestSha256: previousManifest?.manifestSha256}).manifest;
const ed20 = persistedManifest.entries.find((item) => item.shotId === "ED-20");
const dispatchableStatuses = new Set(["READY_FOR_GENERATION", "REPAIR_REQUIRED_DEPENDENCY_CHANGE"]);
if (!dispatchableStatuses.has(ed20?.status) || ed20.preflight?.status !== "PASS" || ed20.candidateSha !== null) throw new Error(`canonical-static-board-input-manifest-not-ready:${ed20?.status || "MISSING"}`);

console.log(JSON.stringify({
  status: "PASS",
  checkpoint: "CANONICAL_STATIC_BOARD_INPUT_READY",
  alreadyCurrent: result.alreadyCurrent,
  workspaceSha256: persisted.workspaceSha256,
  boardSha256: persisted.production.shotIntelligence.wholeFilmStaticBoard.sha256,
  planSha256: ed20.planSha256,
  styleBriefSha256: persisted.production.packagingStyleBriefs.find((item) => item.sourceBeatIds?.includes("ED-20"))?.styleBriefSha256,
  videoContextSha256: persisted.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === "ED-20")?.contextSha256,
  manifestSha256: persistedManifest.manifestSha256,
  ed20Status: ed20.status,
  preflightStatus: ed20.preflight.status,
  cachedPassCount: persistedManifest.summary.cachedPassCount,
  pendingGenerationCount: persistedManifest.summary.pendingGenerationCount,
  queue: persisted.production.generation.summary,
  workerStatus: persisted.production.generation.workerStatus,
  assemblyCount: persisted.production.shotIntelligence.currentAssembly.length,
  imageGenCalled: false,
  boardRebuilt: false,
}, null, 2));
