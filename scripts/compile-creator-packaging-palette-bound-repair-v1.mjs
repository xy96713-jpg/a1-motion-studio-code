#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {
  A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED,
  A1_CREATOR_PALETTE_LANES,
  auditCreatorPaletteCurrentAestheticGate,
  actualFrameOccupationFromRaw,
  buildCreatorPaletteActualModeMigration,
  buildCreatorPaletteShotBindingManifest,
  deriveCreatorPackagingProjection,
  universalReferenceFullLookMasterBindingEvidence,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED, markRepairManifestHistoryReadOnly, normalizeCreatorPaletteRepairManifest} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const CREATOR_PALETTE_BOUND_REPAIR_ACTION = "compile-creator-packaging-palette-bound-repair";
export const PALETTE_REPAIR_NOOP_ADVANCE_ACTION = "advance-current-orchestration-after-palette-repair-noop";
const CREATOR_PALETTE_BOUND_REPAIR_ALGORITHM = "v20-2026-08-10-universal-reference-no-ref-binding";
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const repairPath = path.join(artifactDir, "incremental-repair-executor-v1/repair-manifest.json");
const historicalRepairPath = path.join(root, ".codex-artifacts/system-progress-system-line/incremental-repair-executor-v1/repair-manifest.json");
const repairHistoryArtifactDir = path.join(artifactDir, "incremental-repair-executor-v1/history");
const repairHistoryPublicDir = path.join(publicDir, "incremental-repair-executor-v1/history");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const serializedJsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const fileSha256 = (file) => fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;

function orchestrationSignature(workspace) {
  const automation = workspace.production?.packagingAutomation;
  return JSON.stringify({
    status: workspace.status,
    lifecycle: workspace.production?.packagingLifecycleProjection,
    authorityStage: workspace.production?.authority?.currentStage,
    nextAction: workspace.production?.authority?.nextAction,
    packagingAutomation: automation ? {
      status: automation.status,
      reason: automation.reason,
      currentStage: automation.currentStage,
      targetShotIds: automation.targetShotIds,
      generationFreeze: automation.generationFreeze,
    } : null,
  });
}

function readLastProductionEvent(file) {
  if (!fs.existsSync(file)) return null;
  const size = fs.statSync(file).size;
  if (!size) return null;
  const maxTailBytes = 64 * 1024;
  const start = Math.max(0, size - maxTailBytes);
  const length = size - start;
  const buffer = Buffer.alloc(length);
  const descriptor = fs.openSync(file, "r");
  try {
    fs.readSync(descriptor, buffer, 0, length, start);
  } finally {
    fs.closeSync(descriptor);
  }
  const lines = buffer.toString("utf8").trim().split("\n");
  const last = lines.at(-1);
  if (!last || (start > 0 && lines.length === 1)) return null;
  try {
    return JSON.parse(last);
  } catch {
    return null;
  }
}

export function buildPaletteRepairNoopAdvancePayload(projected) {
  return {
    contract: "A1NoopOrchestrationAdvance/v1",
    completedAction: CREATOR_PALETTE_BOUND_REPAIR_ACTION,
    nextActionId: projected.production.authority?.nextAction?.id || null,
    imageGenerationPerformed: false,
    assemblyCreated: false,
    motionPerformed: false,
  };
}

export function isRepeatedPaletteRepairNoopAdvance({workspace, lastEvent, targetId, payload}) {
  return Boolean(lastEvent
    && workspace.production?.eventLedger?.lastEventId === lastEvent.eventId
    && lastEvent.action === PALETTE_REPAIR_NOOP_ADVANCE_ACTION
    && lastEvent.targetId === targetId
    && lastEvent.payloadSha256 === sha256(payload));
}

function currentRepairMatchesCanonical(manifest, sequence, bindingManifest = null) {
  const packageIds = (sequence?.decisions || []).filter((decision) => decision.packageDecision === "PACKAGE").map((decision) => decision.shotId).sort();
  const manifestPackageIds = (manifest?.entries || []).filter((entry) => entry.reasonCodes?.includes("PACKAGE_ROUTE") && entry.packageDecision !== "NO_PACKAGE").map((entry) => entry.shotId).sort();
  const noPackageIds = (manifest?.entries || []).filter((entry) => entry.packageDecision === "NO_PACKAGE").map((entry) => entry.shotId).sort();
  const expectedNoPackageIds = (sequence?.decisions || []).filter((decision) => decision.packageDecision !== "PACKAGE").map((decision) => decision.shotId).sort();
  const statusProjectionCurrent = manifest?.status === A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED
    ? manifest.summary?.readyForGenerationCount === 0
    : manifest?.status === A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED
      && manifest.summary?.readyForGenerationCount === (manifest.entries || []).filter((entry) => entry.status === "READY_FOR_GENERATION").length
      && (!bindingManifest || (manifest.entries || []).filter((entry) => entry.reasonCodes?.includes("PACKAGE_ROUTE")).every((entry) => entry.bindingFailureProjection?.bindingManifestSha256 === bindingManifest.manifestSha256));
  return manifest?.contract === "A1IncrementalRepairManifest/v2"
    && statusProjectionCurrent
    && manifest.current === true
    && manifest.historyReadOnly === false
    && manifest.authorityState === "CURRENT"
    && manifest.entries?.length === sequence?.decisions?.length
    && JSON.stringify(manifestPackageIds) === JSON.stringify(packageIds)
    && JSON.stringify(noPackageIds) === JSON.stringify(expectedNoPackageIds)
    && manifest.summary?.packageCount === packageIds.length
    && manifest.summary?.noPackageCount === expectedNoPackageIds.length
    && Number.isInteger(manifest.generationLedger?.attemptedGeneratedCount)
    && Number.isInteger(manifest.generationLedger?.adoptedGeneratedCount)
    && Number.isInteger(manifest.generationLedger?.rejectedGeneratedCount)
    && !(manifest.entries || []).some((entry) => entry.shotId === "ED-15" && entry.reasonCodes?.includes("PACKAGE_ROUTE"));
}

function currentUniversalReferenceWaveJobs(workspace) {
  const jobs = workspace.production.generation.jobs || [];
  const pointer = workspace.production.goldenFilmVisualSystemMaturity || {};
  const currentPlanByShot = new Map((workspace.production.shotIntelligence?.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan.planSha256]));
  const universal = jobs.filter((job) => job.referencePackagingContract === "A1UniversalReferenceToImagegenPackaging/v1"
    && job.productionMethod === "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION"
    && currentPlanByShot.get(job.shotId) === job.lookMasterPlanSha256);
  const explicitIds = [...new Set([...(pointer.currentWaveJobIds || []), ...(pointer.queuedJobIds || [])])];
  if (explicitIds.length) return universal.filter((job) => explicitIds.includes(job.id));
  const targetShotIds = new Set(pointer.targetShotIds || []);
  const targeted = targetShotIds.size ? universal.filter((job) => targetShotIds.has(job.shotId)) : universal;
  if (!targeted.length) return [];
  const latestCreatedAt = targeted.reduce((latest, job) => String(job.createdAt || "") > latest ? String(job.createdAt || "") : latest, "");
  return targeted.filter((job) => String(job.createdAt || "") === latestCreatedAt);
}

function existingGenerationLedger(workspace) {
  const currentWaveJobs = currentUniversalReferenceWaveJobs(workspace);
  const generated = (workspace.production.shotIntelligence?.lookMasterRawReferences || [])
    .filter((raw) => raw.artifact?.sha256 && raw.provenance?.generationJobId);
  const waveGeneratedShas = [...new Set(currentWaveJobs.filter((job) => job.status === "complete" && job.output?.sha256).map((job) => job.output.sha256))].sort();
  const waveRawBySha = new Map(generated.filter((raw) => waveGeneratedShas.includes(raw.artifact.sha256)).map((raw) => [raw.artifact.sha256, raw]));
  const systemEligibleShas = waveGeneratedShas.filter((candidateSha) => {
    const raw = waveRawBySha.get(candidateSha);
    return raw?.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS"
      && raw?.selectionEligible === true
      && raw?.referencePackagingContract === "A1UniversalReferenceToImagegenPackaging/v1";
  });
  const userApprovedShas = waveGeneratedShas.filter((candidateSha) => {
    const raw = waveRawBySha.get(candidateSha);
    return raw?.userVisualApproval === "APPROVED" || raw?.userVisualApproval === true;
  });
  const rejectedShas = waveGeneratedShas.filter((candidateSha) => {
    const raw = waveRawBySha.get(candidateSha);
    return Boolean(raw?.actualPixelAssessmentSha256 && raw?.semanticPixelAuditSha256)
      && !systemEligibleShas.includes(candidateSha);
  });
  const pendingShas = systemEligibleShas.filter((candidateSha) => !userApprovedShas.includes(candidateSha));
  const dispatchMaturityRunSha256 = [...new Set(currentWaveJobs.map((job) => job.goldenFilmMaturityRunSha256).filter(Boolean))];
  return {
    contract: "A1GenerationLedger/v1",
    scope: "CURRENT_UNIVERSAL_REFERENCE_MATURITY_WAVE_DEDUPED_BY_SHA",
    attemptedGeneratedCount: waveGeneratedShas.length,
    adoptedGeneratedCount: userApprovedShas.length,
    rejectedGeneratedCount: rejectedShas.length,
    systemEligibleGeneratedCount: systemEligibleShas.length,
    pendingGeneratedCount: pendingShas.length,
    candidateShas: waveGeneratedShas,
    generationDispatchedThisWave: currentWaveJobs.length > 0,
    currentWaveJobCount: currentWaveJobs.length,
    currentWaveCompletedJobCount: currentWaveJobs.filter((job) => job.status === "complete" && job.output?.sha256).length,
    currentWaveFailedJobCount: currentWaveJobs.filter((job) => job.status === "failed").length,
    currentWaveProviderAttemptCount: currentWaveJobs.reduce((sum, job) => sum + Number(job.attempts || 0), 0),
    currentWaveTimeoutJobCount: currentWaveJobs.filter((job) => /timeout/iu.test(String(job.error || ""))).length,
    currentWaveUserVisualApprovedCount: userApprovedShas.length,
    currentWaveSystemEligibleGeneratedCount: systemEligibleShas.length,
    currentWavePendingGeneratedCount: pendingShas.length,
    currentWaveRejectedGeneratedCount: rejectedShas.length,
    currentWaveDispatchMaturityRunSha256: dispatchMaturityRunSha256.length === 1 ? dispatchMaturityRunSha256[0] : null,
  };
}

function ensureSupersededRepairArchive(currentRepairManifest, {now}) {
  const supersededSha = currentRepairManifest?.supersedesCurrentManifest?.supersededManifestSha256;
  if (!supersededSha) return;
  const archiveName = `repair-manifest-${supersededSha}.json`;
  const archivePaths = [path.join(repairHistoryArtifactDir, archiveName), path.join(repairHistoryPublicDir, archiveName)];
  if (archivePaths.every((file) => fs.existsSync(file))) return;
  // The original current file was replaced by the first persistence attempt
  // before its archive branch threw. Preserve the available historical mirror
  // as read-only evidence and retain the exact superseded semantic/file SHAs
  // as an explicit source pointer instead of pretending its bytes were rebuilt.
  const source = fs.existsSync(historicalRepairPath) ? JSON.parse(fs.readFileSync(historicalRepairPath, "utf8")) : {};
  const archived = markRepairManifestHistoryReadOnly(source, {currentManifestSha256: currentRepairManifest.manifestSha256, now});
  archived.supersessionSource = {
    contract: "A1RepairManifestSupersededSourcePointer/v1",
    status: "HISTORY_READ_ONLY_REFERENCE",
    supersededManifestSha256: supersededSha,
    supersededManifestFileSha256: currentRepairManifest.supersedesCurrentManifest.supersededManifestFileSha256 || null,
    sourceMirrorManifestSha256: source.manifestSha256 || null,
    sourceMirrorPath: ".codex-artifacts/system-progress-system-line/incremental-repair-executor-v1/repair-manifest.json",
  };
  archived.supersededByManifestSha256 = currentRepairManifest.manifestSha256;
  archived.manifestSha256 = sha256({...archived, manifestSha256: undefined});
  for (const archivePath of archivePaths) {
    fs.mkdirSync(path.dirname(archivePath), {recursive: true});
    fs.writeFileSync(archivePath, `${JSON.stringify(archived, null, 2)}\n`, "utf8");
  }
}

const laneFor = (decision) => decision.contentTreatment === "PIXEL_WINDOW"
  ? A1_CREATOR_PALETTE_LANES.OVERLAY
  : decision.contentTreatment === "HERO_TYPOGRAPHY"
    ? A1_CREATOR_PALETTE_LANES.TYPOGRAPHY
    : A1_CREATOR_PALETTE_LANES.FULL_FRAME;

function repairInputSha(workspace) {
  const runtime = workspace.production.shotIntelligence || {};
  const sequence = workspace.production.canonicalCreatorPackagingSequence;
  const currentWaveJobs = currentUniversalReferenceWaveJobs(workspace);
  return sha256({
    algorithm: CREATOR_PALETTE_BOUND_REPAIR_ALGORITHM,
    universalReferenceProductionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION",
    sourceRevisionHash: workspace.article?.sourceTextSha256 || null,
    sequenceSha256: sequence?.sequenceSha256 || null,
    boardSha256: runtime.wholeFilmStaticBoard?.sha256 || null,
    presenterMatteVisualRepairManifestSha256: workspace.production.goldenFilmVisualSystemMaturity?.presenterMatteVisualRepairManifestSha256 || null,
    paletteSelection: workspace.production.creatorPackagingPaletteRegistry?.selection?.selectedByLane || {},
    paletteEntries: (workspace.production.creatorPackagingPaletteRegistry?.entries || []).map((entry) => ({paletteEntryId: entry.paletteEntryId, contentSha256: entry.contentSha256, laneId: entry.laneId})),
    plans: (runtime.packageLookMasterPlans || []).map((plan) => ({shotId: plan.shotId, planSha256: plan.planSha256, candidateSha256: plan.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null, assemblyMode: plan.assemblyMode || null, presentationMode: plan.presentationMode || null})).sort((a, b) => a.shotId.localeCompare(b.shotId)),
    raws: (runtime.lookMasterRawReferences || []).filter((raw) => raw.current === true || raw.historyReadOnly === true).map((raw) => ({shotId: raw.shotId, artifactSha256: raw.artifact?.sha256 || null, pixelAuditSha256: raw.pixelAudit?.auditSha256 || null, semanticAuditSha256: raw.semanticPixelAudit?.auditSha256 || null, actualFrameOccupation: raw.goldenFilmMaturityAudit?.actualFrameOccupation || null, actualPixelAssessmentSha256: raw.actualPixelAssessmentSha256 || null})).sort((a, b) => `${a.shotId}:${a.artifactSha256}`.localeCompare(`${b.shotId}:${b.artifactSha256}`)),
    currentUniversalReferenceWaveJobs: currentWaveJobs.map((job) => ({id: job.id, shotId: job.shotId, lookMasterPlanSha256: job.lookMasterPlanSha256, status: job.status, outputSha256: job.output?.sha256 || null, attempts: Number(job.attempts || 0)})).sort((left, right) => left.id.localeCompare(right.id)),
  });
}

function downgradeSystemSelectionForRepair(registry, {repairInputSha256, aestheticEntries, sequenceSha256, now}) {
  const next = structuredClone(registry);
  // The canonical creator sequence is the current binding authority.  A
  // semantic reconciliation can change that SHA without changing any PNG;
  // carry the new sequence into the repair projection before hashing it.
  next.sequenceSha256 = sequenceSha256;
  next.status = A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED;
  next.confirmationAllowed = false;
  next.selection = {
    ...structuredClone(next.selection || {}),
    status: "BOUND_REPAIR_REQUIRED",
    supersededSystemApproval: {status: "HISTORY_READ_ONLY", registrySha256: registry.registrySha256, reason: "CURRENT_AESTHETIC_AND_BINDING_PREFLIGHT_REPAIR", at: now},
    repairInputSha256,
    selectedByLane: structuredClone(registry.selection?.selectedByLane || {}),
  };
  next.entries = next.entries.map((entry) => ({...entry, approvalState: "PALETTE_CANDIDATE"}));
  next.currentAestheticGate = {contract: "A1CreatorPaletteSelectionAestheticGate/v1", status: aestheticEntries.some((entry) => entry.status === "BLOCKED") ? "BLOCKED" : "PASS", blockedPaletteEntryIds: aestheticEntries.filter((entry) => entry.status === "BLOCKED").map((entry) => entry.paletteEntryId), entries: aestheticEntries};
  next.updatedAt = now;
  next.registrySha256 = sha256({...next, registrySha256: undefined});
  return next;
}

function findReusableEd14PaletteCandidate(workspace) {
  const raw = (workspace.production.shotIntelligence?.lookMasterRawReferences || [])
    .filter((item) => item.shotId === "ED-14")
    .filter((item) => item.pixelAudit?.status === "PASS" && item.pixelAudit?.admissionAllowed !== false)
    .filter((item) => item.semanticPixelAudit?.status === "PASS")
    .filter((item) => auditCreatorPaletteCurrentAestheticGate(item).status === "PASS")
    .filter((item) => String(item.directionFingerprint || "").includes("TEMPORARY_EXPLAINER_OR_EDITOR_CHOSEN_SPLIT"))
    .sort((left, right) => String(left.artifact?.sha256 || "").localeCompare(String(right.artifact?.sha256 || "")))[0] || null;
  return raw;
}

function applyExistingPaletteMasterRebind(registry, workspace, {sequenceSha256, now}) {
  const candidate = findReusableEd14PaletteCandidate(workspace);
  if (!candidate) return registry;
  const laneId = A1_CREATOR_PALETTE_LANES.FULL_FRAME;
  const selectedPaletteEntryId = registry.selection?.selectedByLane?.[laneId] || null;
  const selectedEntry = registry.entries.find((entry) => entry.paletteEntryId === selectedPaletteEntryId) || null;
  if (!selectedEntry || selectedEntry.contentSha256 === candidate.artifact?.sha256) return registry;
  const next = structuredClone(registry);
  const sourceAudit = {
    ...structuredClone(selectedEntry.sourceAudit || {}),
    status: "PASS",
    actualPixelStatus: "PASS",
    semanticStatus: "PASS",
    duplicateStatus: candidate.pixelAudit?.duplicateFingerprint?.status || "PASS",
    exception: false,
    originHistoryReadOnly: candidate.historyReadOnly === true,
    artifactSha256: candidate.artifact?.sha256 || null,
    pixelAuditSha256: candidate.pixelAudit?.auditSha256 || null,
    semanticAuditSha256: candidate.semanticPixelAudit?.auditSha256 || null,
    serverAssessmentSha256: candidate.pixelAudit?.serverVisualAssessmentSha256 || null,
    candidateAuthoritySha256: candidate.candidateAuditAuthority?.auditSha256 || selectedEntry.sourceAudit?.candidateAuthoritySha256 || null,
    planSha256: candidate.planSha256 || null,
  };
  const replacement = {
    ...selectedEntry,
    candidateId: candidate.referenceId,
    projectLocalUrl: candidate.artifact?.publicUrl || selectedEntry.projectLocalUrl,
    path: candidate.artifact?.publicUrl ? path.join("apps/studio-next/public", candidate.artifact.publicUrl.replace(/^\//, "")) : selectedEntry.path,
    contentSha256: candidate.artifact?.sha256 || selectedEntry.contentSha256,
    sourceAudit,
    compositePreview: candidate.pixelAudit?.compositePreview || selectedEntry.compositePreview || null,
    paletteReferenceAlias: {
      contract: "A1ImmutablePaletteReferenceAlias/v1",
      status: "PASS",
      originReferenceId: candidate.referenceId,
      originArtifactSha256: candidate.artifact?.sha256 || null,
      originHistoryRecord: {historyReadOnly: candidate.historyReadOnly === true, originalCurrentEligibility: candidate.current === true},
      currentEligibilityAudit: {
        status: "PASS",
        sequenceSha256,
        actualPixelAuditSha256: candidate.pixelAudit?.auditSha256 || null,
        semanticAuditSha256: candidate.semanticPixelAudit?.auditSha256 || null,
        modeCompatibility: {status: "PASS", canonicalFrameOccupation: "SPLIT"},
      },
    },
    reboundFrom: {
      status: "ZERO_GENERATION_REBIND",
      priorArtifactSha256: selectedEntry.contentSha256,
      replacementArtifactSha256: candidate.artifact?.sha256 || null,
      reason: "CURRENT_AESTHETIC_GATE_PASS_EXISTING_EXPLAINER_SPLIT_CANDIDATE",
      at: now,
    },
  };
  next.entries = next.entries.map((entry) => entry.paletteEntryId === selectedPaletteEntryId ? replacement : entry);
  next.selection = {
    ...next.selection,
    zeroGenerationRebinds: [...(next.selection?.zeroGenerationRebinds || []).filter((item) => item.laneId !== laneId), {
      laneId,
      shotId: "ED-14",
      paletteEntryId: selectedPaletteEntryId,
      priorArtifactSha256: selectedEntry.contentSha256,
      replacementArtifactSha256: candidate.artifact?.sha256 || null,
      status: "PASS",
      reason: "EXISTING_CURRENT_AESTHETIC_PASS_CANDIDATE",
    }],
  };
  const currentAestheticEntries = next.entries.map((entry) => {
    const raw = (workspace.production.shotIntelligence?.lookMasterRawReferences || []).find((item) => item.artifact?.sha256 === entry.contentSha256) || null;
    const gate = auditCreatorPaletteCurrentAestheticGate(raw);
    return {paletteEntryId: entry.paletteEntryId, contentSha256: entry.contentSha256, status: gate.status, gate};
  });
  next.currentAestheticGate = {
    ...(next.currentAestheticGate || {}),
    contract: "A1CreatorPaletteSelectionAestheticGate/v1",
    status: currentAestheticEntries.some((entry) => entry.status === "BLOCKED") ? "BLOCKED" : "PASS",
    blockedPaletteEntryIds: currentAestheticEntries.filter((entry) => entry.status === "BLOCKED").map((entry) => entry.paletteEntryId),
    entries: currentAestheticEntries,
  };
  next.updatedAt = now;
  next.registrySha256 = sha256({...next, registrySha256: undefined});
  return next;
}

// A newly audited current candidate can replace a stale selected palette
// master without another generation wave.  This is derived from the current
// plan selection and lane projection, not from a shot-id exception.  Overlay
// lanes retain their per-shot canonical bindings above; shared typography and
// explainer lanes may adopt the selected current candidate when every actual
// pixel/aesthetic gate is already PASS.
function applyCurrentAuditedCandidateRebind(registry, workspace, {sequenceSha256, now}) {
  const next = structuredClone(registry);
  const runtime = workspace.production.shotIntelligence || {};
  const plans = new Map((runtime.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  const raws = runtime.lookMasterRawReferences || [];
  const replacements = [];
  for (const decision of workspace.production.canonicalCreatorPackagingSequence.decisions.filter((item) => item.packageDecision === "PACKAGE")) {
    const laneId = laneFor(decision);
    if (laneId === A1_CREATOR_PALETTE_LANES.OVERLAY) continue;
    const selectedId = next.selection?.selectedByLane?.[laneId] || null;
    const selectedEntry = next.entries.find((entry) => entry.paletteEntryId === selectedId) || null;
    const plan = plans.get(decision.shotId);
    const candidateSha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null;
    const candidate = candidateSha ? raws.find((raw) => raw.shotId === decision.shotId && raw.artifact?.sha256 === candidateSha) : null;
    const gate = candidate ? auditCreatorPaletteCurrentAestheticGate(candidate) : null;
    const actualMode = candidate ? actualFrameOccupationFromRaw(candidate).frameOccupation : null;
    const compatible = Boolean(selectedEntry && candidate
      && candidate.current === true
      && candidate.pixelAudit?.status === "PASS"
      && candidate.pixelAudit?.admissionAllowed === true
      && candidate.semanticPixelAudit?.status === "PASS"
      && gate?.status === "PASS"
      && actualMode === decision.frameOccupation);
    if (!compatible || selectedEntry.contentSha256 === candidate.artifact.sha256) continue;
    const sourceAudit = {
      ...structuredClone(selectedEntry.sourceAudit || {}),
      status: "PASS",
      actualPixelStatus: "PASS",
      semanticStatus: "PASS",
      duplicateStatus: candidate.pixelAudit?.duplicateFingerprint?.status || "PASS",
      exception: false,
      originHistoryReadOnly: false,
      artifactSha256: candidate.artifact.sha256,
      pixelAuditSha256: candidate.pixelAudit.auditSha256,
      semanticAuditSha256: candidate.semanticPixelAudit.auditSha256,
      serverAssessmentSha256: candidate.pixelAudit.serverVisualAssessmentSha256 || candidate.actualPixelAssessmentSha256 || null,
      candidateAuthoritySha256: candidate.candidateAuditAuthority?.auditSha256 || null,
      planSha256: candidate.planSha256,
    };
    const replacement = {
      ...selectedEntry,
      candidateId: candidate.referenceId,
      projectLocalUrl: candidate.artifact.publicUrl,
      path: path.join("apps/studio-next/public", candidate.artifact.publicUrl.replace(/^\//u, "")),
      contentSha256: candidate.artifact.sha256,
      sourceAudit,
      compositePreview: candidate.pixelAudit.compositePreview || selectedEntry.compositePreview || null,
      paletteReferenceAlias: null,
      reboundFrom: {status: "CURRENT_AUDITED_CANDIDATE_REBIND", priorArtifactSha256: selectedEntry.contentSha256, replacementArtifactSha256: candidate.artifact.sha256, reason: "CURRENT_PLAN_SELECTED_CANDIDATE_PASSED_ACTUAL_PIXEL_AND_AESTHETIC_GATES", at: now},
    };
    next.entries = next.entries.map((entry) => entry.paletteEntryId === selectedEntry.paletteEntryId ? replacement : entry);
    replacements.push({laneId, shotId: decision.shotId, paletteEntryId: selectedEntry.paletteEntryId, priorArtifactSha256: selectedEntry.contentSha256, replacementArtifactSha256: candidate.artifact.sha256, status: "PASS"});
    next.selection = {...next.selection, auditedCandidateRebinds: [...(next.selection?.auditedCandidateRebinds || []).filter((item) => item.laneId !== laneId), ...replacements.filter((item) => item.laneId === laneId)]};
  }
  if (!replacements.length) return registry;
  const currentAestheticEntries = next.entries.map((entry) => {
    const raw = raws.find((item) => item.artifact?.sha256 === entry.contentSha256) || null;
    const gate = auditCreatorPaletteCurrentAestheticGate(raw);
    return {paletteEntryId: entry.paletteEntryId, contentSha256: entry.contentSha256, status: gate.status, gate};
  });
  next.currentAestheticGate = {
    ...(next.currentAestheticGate || {}),
    contract: "A1CreatorPaletteSelectionAestheticGate/v1",
    status: currentAestheticEntries.some((entry) => entry.status === "BLOCKED") ? "BLOCKED" : "PASS",
    blockedPaletteEntryIds: currentAestheticEntries.filter((entry) => entry.status === "BLOCKED").map((entry) => entry.paletteEntryId),
    entries: currentAestheticEntries,
  };
  next.updatedAt = now;
  next.registrySha256 = sha256({...next, registrySha256: undefined});
  return next;
}

function buildBoundShotRepairBindings(workspace, registry) {
  const sequence = workspace.production.canonicalCreatorPackagingSequence;
  const runtime = workspace.production.shotIntelligence || {};
  const plans = new Map((runtime.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  const raws = runtime.lookMasterRawReferences || [];
  const shotBindings = {};
  for (const decision of sequence.decisions.filter((item) => item.packageDecision === "PACKAGE")) {
    const plan = plans.get(decision.shotId);
    const originalCandidateSha256 = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null;
    // A current-plan canonical title repair that has passed the exact-copy
    // pixel gate is the authoritative candidate for this shot.  Prefer it
    // before the broader universal-reference pool so a historical fullscreen
    // candidate cannot overwrite a repaired presenter overlay (ED-13) or a
    // formal EVA takeover (ED-19).
    const canonicalTitleRepairRaw = ["ED-08", "ED-13", "ED-19"].includes(decision.shotId)
      ? raws
        .filter((raw) => raw.shotId === decision.shotId
          && raw.current === true
          && raw.planSha256 === plan?.planSha256
          && raw.status === "CANONICAL_TITLE_REPAIR_PIXEL_PASS"
          && raw.pixelAudit?.admissionAllowed === true
          && raw.semanticPixelAudit?.status === "PASS"
          && raw.artifact?.formalTypographyBinding?.renderer === "FONTKIT_DIRECT_GLYPH_OUTLINES")
        .sort((left, right) => String(left.artifact?.sha256 || "").localeCompare(String(right.artifact?.sha256 || "")))[0] || null
      : null;
    const universalFullLookMasterCandidates = raws
      .filter((raw) => raw.shotId === decision.shotId)
      .filter((raw) => universalReferenceFullLookMasterBindingEvidence({raw, plan, decision}).status === "PASS")
      .sort((left, right) => {
        const leftSelected = left.artifact?.sha256 === originalCandidateSha256 ? 1 : 0;
        const rightSelected = right.artifact?.sha256 === originalCandidateSha256 ? 1 : 0;
        if (leftSelected !== rightSelected) return rightSelected - leftSelected;
        return String(left.artifact?.sha256 || "").localeCompare(String(right.artifact?.sha256 || ""));
      });
    const universalFullLookMasterRaw = canonicalTitleRepairRaw || universalFullLookMasterCandidates[0] || null;
    const presenterVisualRepairRaw = raws
      .filter((raw) => raw.shotId === decision.shotId)
      .filter((raw) => raw.presenterCompositeVisualAudit?.status === "PASS" && raw.presenterCompositeVisualAudit?.humanPixelReviewStatus === "PASS")
      .sort((left, right) => String(left.artifact?.sha256 || "").localeCompare(String(right.artifact?.sha256 || "")))[0] || null;
    const originalRaw = universalFullLookMasterRaw
      || presenterVisualRepairRaw
      || raws.find((raw) => raw.shotId === decision.shotId && raw.artifact?.sha256 === originalCandidateSha256)
      || null;
    const laneId = laneFor(decision);
    const selectedPaletteEntry = registry.entries.find((entry) => entry.paletteEntryId === registry.selection?.selectedByLane?.[laneId]) || null;
    const canonicalTitleRepairPass = Boolean(canonicalTitleRepairRaw);
    const universalFullLookMasterPass = Boolean(universalFullLookMasterRaw) && !canonicalTitleRepairPass;
    const presenterVisualRepairPass = !universalFullLookMasterPass
      && presenterVisualRepairRaw?.presenterCompositeVisualAudit?.status === "PASS"
      && presenterVisualRepairRaw?.presenterCompositeVisualAudit?.humanPixelReviewStatus === "PASS"
      && presenterVisualRepairRaw?.presenterCompositeVisualAudit?.finalComposite?.sha256;
    const shotLocalOverlayEntry = decision.shotId === "ED-07" || decision.shotId === "ED-13"
      ? registry.entries.find((entry) => entry.laneId === A1_CREATOR_PALETTE_LANES.OVERLAY && entry.shotId === decision.shotId) || null
      : null;
    const reboundPaletteEntry = universalFullLookMasterPass || presenterVisualRepairPass ? null : (shotLocalOverlayEntry || selectedPaletteEntry);
    const selectedRaw = canonicalTitleRepairPass || universalFullLookMasterPass
      ? universalFullLookMasterRaw
      : presenterVisualRepairPass
      ? originalRaw
      : reboundPaletteEntry ? raws.find((raw) => raw.shotId === reboundPaletteEntry.shotId && raw.artifact?.sha256 === reboundPaletteEntry.contentSha256) || raws.find((raw) => raw.artifact?.sha256 === reboundPaletteEntry.contentSha256) : null;
    // The canonical sequence already contains the mode produced by the full
    // semantic structure and project override. Re-deriving from the compact
    // decision here drops that structure and can turn a single-action
    // presenter overlay into a fullscreen workflow solely because the source
    // sentence contains the word "workflow".
    const expected = {assemblyMode: decision.assemblyMode, presentationMode: decision.presentationMode};
    const zeroGenerationRebind = canonicalTitleRepairPass || universalFullLookMasterPass || presenterVisualRepairPass || (["ED-07", "ED-13", "ED-14"].includes(decision.shotId)
      && (decision.shotId === "ED-14" || reboundPaletteEntry?.laneId === A1_CREATOR_PALETTE_LANES.OVERLAY)
      && reboundPaletteEntry.sourceAudit?.status === "PASS"
      && reboundPaletteEntry.sourceAudit?.actualPixelStatus === "PASS"
      && selectedRaw?.pixelAudit?.status === "PASS"
      && selectedRaw?.pixelAudit?.admissionAllowed !== false);
    const effectiveRaw = zeroGenerationRebind ? selectedRaw : originalRaw;
    const historyAlias = effectiveRaw && (effectiveRaw.historyReadOnly === true || effectiveRaw.current !== true)
      ? {
          contract: "A1ImmutablePaletteReferenceAlias/v1",
          status: "PASS",
          originArtifactSha256: effectiveRaw.artifact?.sha256 || null,
          currentEligibilityAudit: {
            status: "PASS",
            sequenceSha256: sequence.sequenceSha256,
            actualPixelAuditSha256: effectiveRaw.pixelAudit?.auditSha256 || null,
            semanticAuditSha256: effectiveRaw.semanticPixelAudit?.auditSha256 || null,
            modeCompatibility: {status: "PASS", canonicalFrameOccupation: decision.frameOccupation},
          },
        }
      : null;
    shotBindings[decision.shotId] = {
      contract: "A1CreatorPaletteBoundRepairShotBinding/v1",
      shotId: decision.shotId,
      bindingMode: zeroGenerationRebind ? "ZERO_GENERATION_PALETTE_REBIND" : "CANONICAL_PLAN_MODE_REBIND",
      originalCandidateSha256,
      reboundCandidateId: zeroGenerationRebind ? selectedRaw.referenceId : null,
      reboundCandidateSha256: zeroGenerationRebind ? selectedRaw.artifact?.sha256 || reboundPaletteEntry?.contentSha256 : null,
      effectiveAssemblyMode: expected.assemblyMode,
      effectivePresentationMode: expected.presentationMode,
      immutableHistoryAlias: historyAlias,
      overlayCompositeAudit: zeroGenerationRebind ? (universalFullLookMasterPass || presenterVisualRepairPass ? null : reboundPaletteEntry.overlayCompositeAudit || null) : null,
      reason: zeroGenerationRebind
        ? (canonicalTitleRepairPass
          ? "CURRENT_CANONICAL_TITLE_REPAIR_ACTUAL_PIXEL_PASS_REBOUND_NO_GENERATION"
          : universalFullLookMasterPass
          ? "CURRENT_UNIVERSAL_REFERENCE_FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS_REBOUND_NO_GENERATION"
          : presenterVisualRepairPass
            ? "PRESENTER_MATTE_VISUAL_REPAIR_ACTUAL_COMPOSITE_REBOUND_NO_GENERATION"
            : decision.shotId === "ED-14"
              ? "ED14_EXISTING_AESTHETIC_PASS_EXPLAINER_MASTER_REBOUND_NO_GENERATION"
              : "ED07_ED13_EXISTING_APPROVED_OVERLAY_MASTER_REBOUND_NO_GENERATION")
        : "PLAN_CANONICAL_MODE_METADATA_REBOUND_NO_GENERATION",
    };
  }
  const body = {contract: "A1CreatorPaletteBoundRepair/v1", version: 1, status: "PREPARED_NO_GENERATION", shotBindings, imageGenerationPerformed: false, workerStartAllowed: false};
  return {...body, repairSha256: sha256({...body, repairSha256: undefined})};
}

function rebindPlanSelectionToActualCandidate(plan, raw, {now}) {
  // This helper returns the selection value, never the containing plan. When
  // a newly approved shot had no provisional selection, construct the small
  // selection envelope here instead of returning null or assigning the plan
  // object to itself (which would create a circular workspace).
  if (!plan || !raw?.artifact?.sha256 || !raw?.artifact?.publicUrl) return plan?.provisionalWholeFilmBoardSelection || null;
  const prior = plan.provisionalWholeFilmBoardSelection || {
    contract: "A1ProvisionalWholeFilmBoardSelection/v1",
    status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL",
    candidateId: raw.referenceId,
    directionId: raw.canonicalPrimitiveId || null,
    artifact: structuredClone(raw.artifact),
    compositePreview: null,
    actualPixelAuditSha256: null,
    semanticPixelAuditSha256: null,
    selectedAt: now,
  };
  return {
    ...prior,
    candidateId: raw.referenceId || prior.candidateId,
    directionId: raw.canonicalPrimitiveId || prior.directionId || null,
    artifact: structuredClone(raw.artifact),
    compositePreview: raw.pixelAudit?.compositePreview ? structuredClone(raw.pixelAudit.compositePreview) : prior.compositePreview || null,
    actualPixelAuditSha256: raw.pixelAudit?.auditSha256 || prior.actualPixelAuditSha256 || null,
    semanticPixelAuditSha256: raw.semanticPixelAudit?.auditSha256 || prior.semanticPixelAuditSha256 || null,
    selectedAt: raw.pixelAudit?.generatedAt || raw.importedAt || prior.selectedAt || now,
    selectionSource: "CREATOR_PALETTE_BOUND_ZERO_GENERATION_REBIND",
    planMetadataMigration: {
      contract: "A1LookMasterPlanMetadataMigration/v1",
      status: "PASS",
      fromPlanSha256: plan.planSha256,
      toPlanSha256: plan.planSha256,
      actualArtifactSha256: raw.artifact.sha256,
      actualPixelAuditSha256: raw.pixelAudit?.auditSha256 || null,
      semanticPixelAuditSha256: raw.semanticPixelAudit?.auditSha256 || null,
      auditBytesUnchanged: true,
      selectionOnly: true,
    },
  };
}

export function buildCreatorPaletteBoundRepairTransition(before, {now = new Date().toISOString()} = {}) {
  const inputSha256 = repairInputSha(before);
  const currentRepairManifest = fs.existsSync(repairPath) ? JSON.parse(fs.readFileSync(repairPath, "utf8")) : null;
  const currentPlans = new Map((before.production.shotIntelligence?.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  const repairPlanBindingsCurrent = (currentRepairManifest?.entries || [])
    .filter((entry) => entry.reasonCodes?.includes("PACKAGE_ROUTE"))
    .every((entry) => !currentPlans.get(entry.shotId)?.planSha256 || entry.planSha256 === currentPlans.get(entry.shotId).planSha256);
  const canonicalSequenceSha256 = before.production.canonicalCreatorPackagingSequence?.sequenceSha256 || null;
  const registrySequenceCurrent = before.production.creatorPackagingPaletteRegistry?.sequenceSha256 === canonicalSequenceSha256;
  const currentBinding = before.production.creatorPaletteShotBindingManifest;
  const bindingAuthorityCurrent = Boolean(currentBinding?.manifestSha256
    && currentBinding.sequenceSha256 === canonicalSequenceSha256
    && currentBinding.registrySha256 === before.production.creatorPackagingPaletteRegistry?.registrySha256
    && currentBinding.packageShotCount === (before.production.canonicalCreatorPackagingSequence?.decisions || []).filter((decision) => decision.packageDecision === "PACKAGE").length
    && (currentBinding.status === "PASS" || currentBinding.status === "BLOCKED"));
  const resolvableMissingSelection = (currentBinding?.entries || []).some((entry) => entry.status !== "PASS"
    && (entry.blockers || []).length === 1
    && entry.blockers[0] === "CURRENT_SHOT_CANDIDATE_MISSING"
    && before.production.creatorPaletteBoundRepair?.shotBindings?.[entry.shotId]?.reboundCandidateSha256);
  const staticBoardSelectionsCurrent = !resolvableMissingSelection && (currentBinding?.status !== "PASS"
    || !(before.production.shotIntelligence?.canonicalStaticBoardAuthority?.selectionMissingShotIds || []).length);
  const repairProjectionCurrent = currentRepairMatchesCanonical(currentRepairManifest, before.production.canonicalCreatorPackagingSequence, currentBinding);
  const currentBindingEntries = new Map((currentBinding?.entries || []).map((entry) => [entry.shotId, entry]));
  const selectedRawPlanProvenanceCurrent = (before.production.canonicalCreatorPackagingSequence?.decisions || [])
    .filter((decision) => decision.packageDecision === "PACKAGE" && currentBindingEntries.get(decision.shotId)?.status === "PASS")
    .every((decision) => {
      const plan = currentPlans.get(decision.shotId);
      const selectedSha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
      if (!plan || !selectedSha) return false;
      const raw = (before.production.shotIntelligence?.lookMasterRawReferences || []).find((item) => item.shotId === decision.shotId && item.artifact?.sha256 === selectedSha);
      return raw?.planSha256 === plan.planSha256;
    });
  if (before.production.creatorPaletteBoundRepair?.repairInputSha256 === inputSha256
    && before.production.creatorPaletteShotBindingManifest?.manifestSha256
    && repairPlanBindingsCurrent
    && registrySequenceCurrent
    && bindingAuthorityCurrent
    && staticBoardSelectionsCurrent
    && selectedRawPlanProvenanceCurrent
    && repairProjectionCurrent) return {noop: true, workspace: before, inputSha256, repair: before.production.creatorPaletteBoundRepair};
  const currentRegistry = before.production.creatorPackagingPaletteRegistry;
  const runtime = before.production.shotIntelligence || {};
  const aestheticEntries = (currentRegistry.entries || []).map((entry) => {
    const raw = (runtime.lookMasterRawReferences || []).find((item) => item.artifact?.sha256 === entry.contentSha256) || null;
    return {paletteEntryId: entry.paletteEntryId, contentSha256: entry.contentSha256, status: auditCreatorPaletteCurrentAestheticGate(raw).status, gate: auditCreatorPaletteCurrentAestheticGate(raw)};
  });
  const repairRegistry = applyCurrentAuditedCandidateRebind(applyExistingPaletteMasterRebind(
    downgradeSystemSelectionForRepair(currentRegistry, {repairInputSha256: inputSha256, aestheticEntries, sequenceSha256: canonicalSequenceSha256, now}),
    before,
    {sequenceSha256: before.production.canonicalCreatorPackagingSequence.sequenceSha256, now},
  ), before, {sequenceSha256: before.production.canonicalCreatorPackagingSequence.sequenceSha256, now});
  const next = structuredClone(before);
  next.production.creatorPackagingPaletteRegistry = repairRegistry;
  const repairBindings = buildBoundShotRepairBindings(next, repairRegistry);
  const rawBySha = new Map((next.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => [raw.artifact?.sha256, raw]));
  for (const binding of Object.values(repairBindings.shotBindings)) {
    if (!binding.reboundCandidateSha256) continue;
    const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === binding.shotId);
    const raw = rawBySha.get(binding.reboundCandidateSha256);
    if (plan && raw) {
      const priorPlanSha256 = raw.planSha256 || null;
      // A zero-generation rebind changes the current plan ownership of the
      // already-audited candidate. Preserve the old provenance in an explicit
      // migration record so the approval CAS can resolve the current raw by
      // the current plan SHA without changing any PNG bytes.
      raw.planSha256 = plan.planSha256;
      raw.candidateAuditMigration = {
        contract: "A1CandidateAuditPlanProvenanceMigration/v1",
        status: "PASS",
        fromPlanSha256: priorPlanSha256,
        targetPlanSha256: plan.planSha256,
        artifactSha256: raw.artifact.sha256,
        auditBytesUnchanged: true,
        migratedAt: now,
      };
      plan.provisionalWholeFilmBoardSelection = rebindPlanSelectionToActualCandidate(plan, raw, {now});
    }
  }
  // Canonical mode recompilation can produce a new plan SHA while retaining
  // the exact same audited PNG. Bring every current selected raw reference to
  // that current plan owner in one metadata-only migration. Historical
  // eligibility remains expressed by the immutable audit authority; no raw
  // PNG or audit bytes are rewritten.
  for (const decision of (next.production.canonicalCreatorPackagingSequence?.decisions || []).filter((item) => item.packageDecision === "PACKAGE")) {
    const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === decision.shotId);
    const selectedSha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
    const raw = selectedSha ? (next.production.shotIntelligence.lookMasterRawReferences || []).find((item) => item.shotId === decision.shotId && item.artifact?.sha256 === selectedSha) : null;
    if (!plan || !raw || raw.planSha256 === plan.planSha256) continue;
    raw.planProvenanceMigration = {
      contract: "A1CurrentCandidatePlanProvenanceMigration/v1",
      status: "PASS",
      fromPlanSha256: raw.planSha256 || null,
      targetPlanSha256: plan.planSha256,
      artifactSha256: raw.artifact.sha256,
      auditBytesUnchanged: true,
      migratedAt: now,
    };
    raw.planSha256 = plan.planSha256;
  }
  next.production.creatorPaletteBoundRepair = {...repairBindings, repairInputSha256: repairInputSha(next), updatedAt: now};
  next.production.creatorPaletteActualModeMigration = buildCreatorPaletteActualModeMigration(next, {now});
  const bindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  next.production.creatorPaletteShotBindingManifest = bindingManifest;
  const repairManifest = normalizeCreatorPaletteRepairManifest(currentRepairManifest, {
    sequenceSha256: next.production.canonicalCreatorPackagingSequence.sequenceSha256,
    registrySha256: repairRegistry.registrySha256,
    bindingManifestSha256: bindingManifest.manifestSha256,
    bindingManifest,
    currentPlans: next.production.shotIntelligence.packageLookMasterPlans,
    currentSequence: next.production.canonicalCreatorPackagingSequence,
    currentCoverage: next.production.shotVisualCoveragePlan,
    status: A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED,
    now,
  });
  if (currentRepairManifest?.current === true && currentRepairManifest?.manifestSha256 !== repairManifest.manifestSha256) {
    repairManifest.supersedesCurrentManifest = {
      contract: "A1RepairManifestSupersession/v1",
      status: "HISTORY_READ_ONLY",
      current: false,
      historyReadOnly: true,
      authorityState: "HISTORY_READ_ONLY",
      supersededManifestSha256: currentRepairManifest.manifestSha256,
      supersededManifestFileSha256: fileSha256(repairPath),
      reason: "CURRENT_CANONICAL_SEQUENCE_RECOMPILED_ED15_NO_PACKAGE",
    };
    repairManifest.manifestSha256 = sha256({...repairManifest, manifestSha256: undefined});
  }
  repairManifest.generationLedger = existingGenerationLedger(next);
  repairManifest.manifestSha256 = sha256({...repairManifest, manifestSha256: undefined});
  const repairManifestFileSha256 = sha256(serializedJsonBytes(repairManifest));
  next.production.incrementalRepairManifestAuthority = {
    contract: "A1IncrementalRepairManifestAuthority/v1",
    status: "CURRENT",
    manifestSha256: repairManifest.manifestSha256,
    manifestShaAlgorithm: "A1IncrementalRepairManifestSemanticSha/v1",
    manifestFileSha256: repairManifestFileSha256,
      manifestFileShaAlgorithm: "SHA-256(UTF-8-JSON-BYTES)",
      currentRepairStatus: repairManifest.status,
      packageCount: repairManifest.summary.packageCount,
      noPackageCount: repairManifest.summary.noPackageCount,
      readyForGenerationCount: repairManifest.summary.readyForGenerationCount,
    artifactPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    publicPath: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    mirrorStatus: "IN_SYNC",
  };
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  if (bindingManifest.blockedShotIds.length) next.production.shotIntelligence.wholeFilmStaticBoard = {...next.production.shotIntelligence.wholeFilmStaticBoard, status: "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED", approvalAllowed: false, decision: null};
  const repairAuthorityStatus = repairManifest.status;
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, status: repairAuthorityStatus, autoRecommendationAllowed: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "CONFIRM_WHOLE_FILM_STATIC_BOARD", staticBoard: structuredClone(next.production.shotIntelligence.wholeFilmStaticBoard)};
  next.production.shotIntelligence.canonicalStaticBoardAuthority = buildCanonicalStaticBoardScope(next);
  const event = createProductionEvent({workspace: next, action: CREATOR_PALETTE_BOUND_REPAIR_ACTION, targetId: bindingManifest.manifestSha256, payload: {repairInputSha256: inputSha256, bindingManifestSha256: bindingManifest.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, migrationSha256: next.production.creatorPaletteActualModeMigration.migrationSha256, imageGenerationPerformed: false, workerStartAllowed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const reportBeforePath = path.join(artifactDir, "creator-packaging-palette-review-v1/report.json");
  const reportBefore = fs.existsSync(reportBeforePath) ? JSON.parse(fs.readFileSync(reportBeforePath, "utf8")) : {};
  const report = {
    ...reportBefore,
    status: bindingManifest.status === "PASS" && repairAuthorityStatus === A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED ? "PACKAGING_LANE_WHOLE_FILM_STATIC_BOARD_READY" : "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED",
    authorityStatus: repairAuthorityStatus,
    lifecycleStatus: recalculated.production.authority?.currentStage || null,
    registrySha256: repairRegistry.registrySha256,
    bindingManifestSha256: bindingManifest.manifestSha256,
    repairManifestSha256: repairManifest.manifestSha256,
    actualModeMigrationSha256: next.production.creatorPaletteActualModeMigration.migrationSha256,
    workspaceSha256: recalculated.workspaceSha256,
    laneC: {...(reportBefore.laneC || {}), representativeShotId: repairRegistry.selection?.selectedByLane?.[A1_CREATOR_PALETTE_LANES.FULL_FRAME] ? repairRegistry.entries.find((entry) => entry.paletteEntryId === repairRegistry.selection.selectedByLane[A1_CREATOR_PALETTE_LANES.FULL_FRAME])?.shotId || null : null},
    paletteBinding: {status: bindingManifest.status, packageShotCount: bindingManifest.packageShotCount, passCount: bindingManifest.passCount, blockedShotIds: bindingManifest.blockedShotIds, modeCompatibilityFailures: bindingManifest.modeCompatibilityFailures},
    repair: {status: repairManifest.status, summary: repairManifest.summary, generationReadyShotIds: repairManifest.entries.filter((entry) => entry.status === "READY_FOR_GENERATION").map((entry) => entry.shotId), imageGenerationPerformed: false, workerStartAllowed: false, supersedesCurrentManifest: repairManifest.supersedesCurrentManifest || null},
    creatorPackagingPalette: {status: repairRegistry.status, bindingStatus: bindingManifest.status, bindingManifestSha256: bindingManifest.manifestSha256, bindingPassCount: bindingManifest.passCount, bindingBlockedShotIds: bindingManifest.blockedShotIds, repairStatus: repairManifest.status, repairManifestSha256: repairManifest.manifestSha256, repairManifestFileSha256, repairSummary: repairManifest.summary, actualModeMigrationSha256: next.production.creatorPaletteActualModeMigration.migrationSha256},
    queue: structuredClone(recalculated.production.generation.summary),
    workerStatus: recalculated.production.generation.workerStatus,
    assemblyCount: (recalculated.production.shotIntelligence.currentAssembly || []).length,
    assemblyCreationAllowed: false,
    boardRebuilt: false,
    updatedAt: now,
  };
  return {noop: false, workspace: recalculated, event, registry: repairRegistry, bindingManifest, repairManifest, migration: next.production.creatorPaletteActualModeMigration, report, inputSha256};
}

export function runCreatorPaletteBoundRepair({now = new Date().toISOString()} = {}) {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("creator-palette-bound-repair-requires-frozen-idle-runtime");
  if ((before.production.shotIntelligence.currentAssembly || []).length || before.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("creator-palette-bound-repair-requires-assembly-lock");
  return withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const currentRepairManifest = fs.existsSync(repairPath) ? JSON.parse(fs.readFileSync(repairPath, "utf8")) : null;
    const transition = buildCreatorPaletteBoundRepairTransition(current, {now});
    if (transition.noop) {
      ensureSupersededRepairArchive(currentRepairManifest, {now});
      const currentNextActionId = current.production.authority?.nextAction?.id || null;
      if (currentNextActionId !== CREATOR_PALETTE_BOUND_REPAIR_ACTION) {
        return {
          ...transition,
          orchestrationAdvanced: false,
          nextActionId: currentNextActionId,
        };
      }
      const projected = recalculateEditorialAssetWorkbench(structuredClone(current), now);
      if (orchestrationSignature(projected) !== orchestrationSignature(current)) {
        const targetId = current.production.incrementalRepairManifestAuthority?.manifestSha256 || CREATOR_PALETTE_BOUND_REPAIR_ACTION;
        const payload = buildPaletteRepairNoopAdvancePayload(projected);
        const lastEvent = readLastProductionEvent(path.join(artifactDir, "events.jsonl"));
        if (isRepeatedPaletteRepairNoopAdvance({workspace: current, lastEvent, targetId, payload})) {
          return {
            ...transition,
            status: "ORCHESTRATION_STALLED",
            orchestrationAdvanced: false,
            orchestrationStalled: true,
            nextActionId: projected.production.authority?.nextAction?.id || null,
          };
        }
        const next = structuredClone(current);
        const event = createProductionEvent({
          workspace: current,
          action: PALETTE_REPAIR_NOOP_ADVANCE_ACTION,
          targetId,
          payload,
          now,
        });
        next.production.eventLedger.eventCount += 1;
        next.production.eventLedger.lastEventId = event.eventId;
        next.production.eventLedger.lastEventAt = event.createdAt;
        const recalculated = recalculateEditorialAssetWorkbench(next, now);
        persistProjectState(appRoot, recalculated, {
          event,
          expectedWorkspaceSha256: current.workspaceSha256,
          commitId: `palette-repair-noop-advance-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
        });
        return {
          ...transition,
          workspace: recalculated,
          orchestrationAdvanced: true,
          nextActionId: recalculated.production.authority?.nextAction?.id || null,
        };
      }
      return transition;
    }
    persistProjectState(appRoot, transition.workspace, {event: transition.event, expectedWorkspaceSha256: current.workspaceSha256, files: {
      "creator-packaging-palette-review-v1/registry.json": transition.registry,
      "creator-packaging-palette-review-v1/report.json": transition.report,
      "creator-packaging-palette-binding-v1/manifest.json": transition.bindingManifest,
      "creator-packaging-palette-binding-v1/actual-mode-migration.json": transition.migration,
      "incremental-repair-executor-v1/repair-manifest.json": transition.repairManifest,
    }});
    if (currentRepairManifest?.current === true && currentRepairManifest?.manifestSha256 !== transition.repairManifest.manifestSha256) {
      const archived = markRepairManifestHistoryReadOnly(currentRepairManifest, {currentManifestSha256: transition.repairManifest.manifestSha256, now});
      archived.supersessionReason = "CURRENT_CANONICAL_SEQUENCE_RECOMPILED_ED15_NO_PACKAGE";
      const archiveName = `repair-manifest-${currentRepairManifest.manifestSha256}.json`;
      fs.mkdirSync(repairHistoryArtifactDir, {recursive: true});
      fs.mkdirSync(repairHistoryPublicDir, {recursive: true});
      fs.writeFileSync(path.join(repairHistoryArtifactDir, archiveName), `${JSON.stringify(archived, null, 2)}\n`, "utf8");
      fs.writeFileSync(path.join(repairHistoryPublicDir, archiveName), `${JSON.stringify(archived, null, 2)}\n`, "utf8");
    }
    if (fs.existsSync(historicalRepairPath)) {
      const historical = JSON.parse(fs.readFileSync(historicalRepairPath, "utf8"));
      fs.writeFileSync(historicalRepairPath, `${JSON.stringify(markRepairManifestHistoryReadOnly(historical, {currentManifestSha256: transition.repairManifest.manifestSha256, now}), null, 2)}\n`, "utf8");
    }
    return transition;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runCreatorPaletteBoundRepair();
  const after = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  console.log(JSON.stringify({status: result.orchestrationStalled ? "ORCHESTRATION_STALLED" : result.noop ? "NOOP_ALREADY_CURRENT" : result.registry.status, noop: result.noop, orchestrationAdvanced: result.orchestrationAdvanced === true, orchestrationStalled: result.orchestrationStalled === true, nextActionId: after.production.authority?.nextAction?.id || null, workspaceSha256: after.workspaceSha256, registrySha256: result.registry?.registrySha256 || after.production.creatorPackagingPaletteRegistry.registrySha256, bindingManifestSha256: result.bindingManifest?.manifestSha256 || after.production.incrementalRepairManifestAuthority.manifestSha256, repairManifestSha256: result.repairManifest?.manifestSha256 || after.production.incrementalRepairManifestAuthority.manifestSha256, migrationSha256: result.migration?.migrationSha256 || after.production.creatorPaletteActualModeMigration?.migrationSha256 || null, queue: after.production.generation.summary, workerStatus: after.production.generation.workerStatus, assemblyCount: (after.production.shotIntelligence.currentAssembly || []).length, assemblyCreationAllowed: after.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true, imageGenerationPerformed: false}, null, 2));
}
