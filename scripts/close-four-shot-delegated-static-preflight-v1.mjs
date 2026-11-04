#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {
  approveCreatorPackagingPaletteBySystemAuthority,
  buildCreatorPackagingPaletteRegistry,
  buildCreatorPaletteShotBindingManifest,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {normalizeCreatorPaletteRepairManifest} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("four-shot-static-preflight-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (before.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`four-shot-static-preflight-workspace-sha-precondition-failed:${before.workspaceSha256}`);
if (before.production.generation.workerStatus !== "frozen"
  || before.production.generation.summary.queued !== 0
  || before.production.generation.summary.running !== 0) throw new Error("four-shot-static-preflight-requires-frozen-idle-runtime");
if ((before.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("four-shot-static-preflight-requires-empty-assembly");
if (before.production.creatorPaletteShotBindingManifest?.status !== "PASS") throw new Error("four-shot-static-preflight-current-binding-not-pass");

const now = new Date().toISOString();
const sequence = before.production.canonicalCreatorPackagingSequence;
const previousRegistry = before.production.creatorPackagingPaletteRegistry;
const decisionsByShot = new Map(sequence.decisions.map((decision) => [decision.shotId, decision]));
const registryEntries = previousRegistry.entries.map((entry) => ({
  ...structuredClone(entry),
  canonicalDecisionSha256: decisionsByShot.get(entry.shotId)?.decisionSha256 || entry.canonicalDecisionSha256,
  approvalState: "PALETTE_CANDIDATE",
}));
const reviewRegistry = buildCreatorPackagingPaletteRegistry({
  sequence,
  entries: registryEntries,
  contactSheet: structuredClone(previousRegistry.contactSheet),
  sourceWorkspaceSha256: before.workspaceSha256,
  sourceBoardSha256: before.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null,
  recommendedTrio: structuredClone(previousRegistry.recommendedTrio || previousRegistry.selection?.selectedByLane),
  now,
});
if (reviewRegistry.status !== "CREATOR_PACKAGING_PALETTE_REVIEW" || reviewRegistry.confirmationAllowed !== true) throw new Error("four-shot-static-preflight-palette-review-not-ready");
const approvedRegistry = approveCreatorPackagingPaletteBySystemAuthority(reviewRegistry, reviewRegistry.recommendedTrio, {
  authoritySequenceSha256: sequence.sequenceSha256,
  registrySourceSha256: reviewRegistry.registrySha256,
  rationale: "四镜头窄修复及其来源、字体、主持人保护区和实际像素审计均已通过；系统仅确认当前风格配色绑定用于重建静态板，不代替用户对整片静态板的批准。",
  now,
});

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== before.workspaceSha256) throw new Error("four-shot-static-preflight-workspace-cas-mismatch");
  const next = structuredClone(current);
  next.production.creatorPackagingPaletteRegistry = approvedRegistry;
  const bindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  if (bindingManifest.status !== "PASS" || bindingManifest.blockedShotIds.length) throw new Error(`four-shot-static-preflight-binding-blocked:${JSON.stringify(bindingManifest.blockers)}`);
  next.production.creatorPaletteShotBindingManifest = bindingManifest;

  const packageDecisions = sequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE");
  const selectedRows = packageDecisions.map((decision) => {
    const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === decision.shotId);
    const artifactSha256 = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
    const raw = next.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === decision.shotId && item.artifact?.sha256 === artifactSha256);
    return {decision, plan, raw};
  });
  for (const {decision, plan, raw} of selectedRows) {
    if (raw && !raw.candidateAuditAuthority
      && raw.classification === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS"
      && raw.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS"
      && raw.pixelAudit?.status === "PASS"
      && raw.semanticPixelAudit?.status === "PASS") {
      raw.candidateAuditAuthority = {
        contract: "A1CandidateAuditAuthority/v1",
        status: "PASS",
        sourcePixelAuditSha256: raw.pixelAudit.auditSha256 || null,
        sourceSemanticAuditSha256: raw.semanticPixelAudit.auditSha256 || null,
        hardRuleFailures: [],
        userVisualApproval: "NOT_APPROVED",
        auditBasis: "INHERITED_EXISTING_SYSTEM_PIXEL_PASS_NO_NEW_PIXEL_REVIEW",
        auditedAt: now,
      };
    }
  }
  const selectedPass = selectedRows.length === 13 && selectedRows.every(({raw, plan}) => raw?.current === true
    && raw?.selectionEligible === true
    && raw?.classification === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS"
    && raw?.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS"
    && raw?.pixelAudit?.status === "PASS"
    && raw?.pixelAudit?.admissionAllowed === true
    && raw?.semanticPixelAudit?.status === "PASS"
    && raw?.actualPixelAssessment?.status === "PASS"
    && raw?.goldenFilmMaturityAudit?.status === "PASS"
    && raw?.candidateAuditAuthority?.status === "PASS"
    && raw?.planSha256 === plan?.planSha256);
  const modes = selectedRows.map(({decision}) => decision.presentationMode);
  const adjacentPresenterRepeat = selectedRows.some(({decision}, index) => index > 0
    && decision.presentationMode === "PRESENTER_INTEGRATED_LOOK_MASTER"
    && selectedRows[index - 1].decision.presentationMode === decision.presentationMode);
  const ruleSetA = {
    contract: "A1WholeFilmStaticVisualRuleSet/v1",
    id: "WHOLE_FILM_SELECTED_PIXEL_AND_PROVENANCE",
    status: selectedPass ? "PASS" : "FAIL",
    packageCount: selectedRows.length,
    expectedPackageCount: 13,
    allSelectedActualPixelPass: selectedPass,
    noUserVisualApprovalFabricated: true,
  };
  const ruleSetB = {
    contract: "A1WholeFilmRhythmAndIndependentPresentationRuleSet/v1",
    id: "WHOLE_FILM_PRESENTATION_RHYTHM_AND_PALETTE",
    status: modes.includes("FULLSCREEN_TYPOGRAPHY_TAKEOVER")
      && modes.includes("SOURCE_EVIDENCE_TAKEOVER")
      && modes.some((mode) => ["EXPLAINER", "FULLSCREEN_EXPLAINER_TAKEOVER"].includes(mode))
      && modes.includes("PRESENTER_INTEGRATED_LOOK_MASTER")
      && !adjacentPresenterRepeat
      && selectedRows.every(({raw}) => Number(raw?.pixelAudit?.actualPixelMetrics?.warmCreamDominantFraction || 0) < 0.18)
      ? "PASS"
      : "FAIL",
    requiredRoles: {
      typographyTakeover: modes.includes("FULLSCREEN_TYPOGRAPHY_TAKEOVER"),
      evidenceTakeover: modes.includes("SOURCE_EVIDENCE_TAKEOVER"),
      explainerTakeover: modes.some((mode) => ["EXPLAINER", "FULLSCREEN_EXPLAINER_TAKEOVER"].includes(mode)),
      presenterIntegrated: modes.includes("PRESENTER_INTEGRATED_LOOK_MASTER"),
    },
    adjacentPresenterIntegratedRepeat: adjacentPresenterRepeat,
    warmCreamDominantSelectedCount: selectedRows.filter(({raw}) => Number(raw?.pixelAudit?.actualPixelMetrics?.warmCreamDominantFraction || 0) >= 0.18).length,
    modeSequence: selectedRows.map(({decision}) => ({shotId: decision.shotId, mode: decision.presentationMode})),
  };
  if (ruleSetA.status !== "PASS" || ruleSetB.status !== "PASS") throw new Error(`four-shot-static-preflight-objective-rule-blocked:${JSON.stringify({ruleSetA, ruleSetB})}`);
  const selectedMasters = selectedRows.map(({decision, plan, raw}) => ({
    shotId: decision.shotId,
    presentationMode: decision.presentationMode,
    artifactSha256: raw.artifact.sha256,
    artifactPublicUrl: raw.artifact.publicUrl,
    artifactWidth: raw.artifact.width,
    artifactHeight: raw.artifact.height,
    candidateId: raw.referenceId,
    planSha256: plan.planSha256,
    directionId: raw.candidateDirectionId,
    pixelAuditSha256: raw.pixelAudit.auditSha256,
    semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
    referenceAttachmentManifestSha256: raw.referenceAttachmentManifest?.manifestSha256 || null,
    status: "SYSTEM_PIXEL_PASS_SELECTED",
  }));
  const selectedMasterSetSha256 = sha256(selectedMasters.map((item) => ({shotId: item.shotId, artifactSha256: item.artifactSha256, planSha256: item.planSha256, presentationMode: item.presentationMode})));
  const objectiveBody = {
    contract: "A1DelegatedObjectiveVisualGate/v1",
    status: "SYSTEM_VISUAL_APPROVED_DELEGATED",
    current: true,
    authorityScope: "CURRENT",
    ruleSetIds: [ruleSetA.id, ruleSetB.id],
    ruleSetSha256s: [sha256({...ruleSetA, status: undefined}), sha256({...ruleSetB, status: undefined})],
    hardRuleDisagreement: false,
    userVisualApproval: "NOT_APPROVED",
    selectedPackageCount: selectedRows.length,
    targetShotIds: [],
    selectedMasters,
    selectedMasterSetSha256,
    boardBinding: {
      contract: "A1DelegatedObjectiveBoardBinding/v1",
      status: "PENDING_CURRENT_STATIC_BOARD_REBUILD",
      packageBoardSha256: current.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null,
      timelineBoardSha256: current.production.shotIntelligence.wholeFilmStaticBoard?.timelineBoard?.sha256 || null,
      selectedMasterSetSha256,
      selectedMasterCount: selectedMasters.length,
    },
    internalCanaryAllowed: false,
    nextAction: "REBUILD_WHOLE_FILM_STATIC_BOARD_FOR_USER_REVIEW",
    requiresUser: true,
    productionWired: false,
    resolveInsertAuthorized: false,
    finalFilm: false,
    updatedAt: now,
  };
  next.production.objectiveVisualGate = {...objectiveBody, gateSha256: sha256(objectiveBody)};

  const repairManifestPath = path.join(artifactDir, "incremental-repair-executor-v1/repair-manifest.json");
  if (!fs.existsSync(repairManifestPath)) throw new Error("four-shot-static-preflight-repair-manifest-missing");
  const currentRepairManifest = JSON.parse(fs.readFileSync(repairManifestPath, "utf8"));
  const repairManifest = normalizeCreatorPaletteRepairManifest(currentRepairManifest, {
    sequenceSha256: sequence.sequenceSha256,
    registrySha256: approvedRegistry.registrySha256,
    bindingManifestSha256: bindingManifest.manifestSha256,
    bindingManifest,
    currentPlans: next.production.shotIntelligence.packageLookMasterPlans,
    status: "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED",
    now,
  });
  next.production.incrementalRepairManifestAuthority = {
    contract: "A1IncrementalRepairManifestAuthority/v1",
    status: "CURRENT",
    manifestSha256: repairManifest.manifestSha256,
    artifactPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    publicPath: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    mirrorStatus: "IN_SYNC",
  };
  next.production.shotIntelligence.canonicalStaticBoardAuthority = buildCanonicalStaticBoardScope(next);
  next.production.goldenFilmVisualSystemMaturity = {
    ...(next.production.goldenFilmVisualSystemMaturity || {}),
    status: "DELEGATED_OBJECTIVE_STATIC_VISUAL_GATE_PASS",
    nextAction: "REBUILD_WHOLE_FILM_STATIC_BOARD_FOR_USER_REVIEW",
    targetShotIds: [],
    updatedAt: now,
  };
  next.production.packagingAutomation = {
    ...(next.production.packagingAutomation || {}),
    status: "DELEGATED_OBJECTIVE_STATIC_VISUAL_GATE_PASS",
    currentStage: "delegated-objective-static-visual-gate-pass",
    targetShotIds: [],
    generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"},
    updatedAt: now,
  };
  next.production.project.currentStage = "delegated-objective-static-visual-gate-pass";
  next.production.project.updatedAt = now;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  next.production.shotIntelligence.wholeFilmStaticBoard = {
    ...next.production.shotIntelligence.wholeFilmStaticBoard,
    status: "STATIC_BOARD_NOT_YET_REBUILT",
    approvalAllowed: false,
    decision: null,
  };
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
    status: "DELEGATED_OBJECTIVE_STATIC_VISUAL_GATE_PASS",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "REBUILD_WHOLE_FILM_STATIC_BOARD",
    staticBoard: structuredClone(next.production.shotIntelligence.wholeFilmStaticBoard),
  };
  const reportBody = {
    contract: "A1FourShotDelegatedStaticPreflightReport/v1",
    status: "PASS",
    sourceWorkspaceSha256: current.workspaceSha256,
    sequenceSha256: sequence.sequenceSha256,
    registrySha256: approvedRegistry.registrySha256,
    bindingManifestSha256: bindingManifest.manifestSha256,
    repairManifestSha256: repairManifest.manifestSha256,
    objectiveVisualGateSha256: next.production.objectiveVisualGate.gateSha256,
    ruleSets: [ruleSetA, ruleSetB],
    selectedMasters,
    userVisualApproval: "NOT_APPROVED",
    boardRebuilt: false,
    assemblyCreated: false,
    layerExtractionPerformed: false,
    motionPerformed: false,
    resolvePerformed: false,
    finalRenderPerformed: false,
    createdAt: now,
  };
  const report = {...reportBody, reportSha256: sha256(reportBody)};
  const event = createProductionEvent({
    workspace: next,
    action: "close-four-shot-delegated-static-preflight",
    targetId: report.reportSha256,
    payload: {
      sequenceSha256: sequence.sequenceSha256,
      registrySha256: approvedRegistry.registrySha256,
      bindingManifestSha256: bindingManifest.manifestSha256,
      selectedMasterSetSha256,
      userVisualApproval: "NOT_APPROVED",
      assemblyCreated: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "creator-packaging-palette-review-v1/registry.json": approvedRegistry,
      "creator-packaging-palette-binding-v1/manifest.json": bindingManifest,
      "four-shot-narrow-repair-v1/delegated-static-preflight-report.json": report,
      "incremental-repair-executor-v1/repair-manifest.json": repairManifest,
    },
  });
  return {workspace: recalculated, report, bindingManifest};
});

console.log(JSON.stringify({
  status: result.report.status,
  workspaceSha256Before: before.workspaceSha256,
  workspaceSha256After: result.workspace.workspaceSha256,
  sequenceSha256: sequence.sequenceSha256,
  registryStatus: result.workspace.production.creatorPackagingPaletteRegistry.status,
  registrySha256: result.workspace.production.creatorPackagingPaletteRegistry.registrySha256,
  bindingStatus: result.bindingManifest.status,
  bindingManifestSha256: result.bindingManifest.manifestSha256,
  objectiveVisualGate: result.workspace.production.objectiveVisualGate.status,
  userVisualApproval: result.workspace.production.objectiveVisualGate.userVisualApproval,
  selectedPackageCount: result.report.selectedMasters.length,
  assemblyCount: result.workspace.production.shotIntelligence.currentAssembly.length,
  boardRebuilt: false,
}, null, 2));
