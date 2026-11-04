#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {approveCreatorPackagingPaletteBySystemAuthority, buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv.find((arg) => /^[a-f0-9]{64}$/u.test(arg)) || null;
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const withoutHash = (value, key) => {
  const copy = structuredClone(value);
  delete copy[key];
  return copy;
};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`canonical-system-validation-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("canonical-system-validation-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("canonical-system-validation-requires-no-assembly");
  if (current.production.creatorPaletteShotBindingManifest?.status !== "PASS") throw new Error("canonical-system-validation-requires-current-binding-pass");
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const boundRegistry = next.production.creatorPackagingPaletteRegistry;
  if (boundRegistry.status !== "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED") throw new Error(`canonical-system-validation-registry-state-invalid:${boundRegistry.status}`);
  const selectedByLane = structuredClone(boundRegistry.selection?.selectedByLane || {});
  const selectedPaletteEntryIds = new Set(Object.values(selectedByLane));
  const selectedAestheticBlocks = (boundRegistry.currentAestheticGate?.entries || []).filter((entry) => selectedPaletteEntryIds.has(entry.paletteEntryId) && entry.status !== "PASS");
  if (selectedAestheticBlocks.length) throw new Error(`canonical-system-validation-selected-aesthetic-gate-blocked:${selectedAestheticBlocks.map((entry) => entry.paletteEntryId).join(",")}`);
  const reviewRegistry = {
    ...structuredClone(boundRegistry),
    status: "CREATOR_PACKAGING_PALETTE_REVIEW",
    confirmationAllowed: true,
    selection: {selectedByLane: {}, userDecisionAt: null},
    entries: boundRegistry.entries.map((entry) => ({...structuredClone(entry), approvalState: "PALETTE_CANDIDATE"})),
    currentAestheticGate: {
      ...structuredClone(boundRegistry.currentAestheticGate || {}),
      status: "PASS",
      blockedPaletteEntryIds: [],
      selectionScope: "SELECTED_BY_LANE_ONLY",
      unselectedBlockedPaletteEntryIds: (boundRegistry.currentAestheticGate?.entries || []).filter((entry) => !selectedPaletteEntryIds.has(entry.paletteEntryId) && entry.status !== "PASS").map((entry) => entry.paletteEntryId),
    },
    updatedAt: now,
  };
  reviewRegistry.registrySha256 = sha256(withoutHash(reviewRegistry, "registrySha256"));
  next.production.creatorPackagingPaletteRegistry = approveCreatorPackagingPaletteBySystemAuthority(reviewRegistry, selectedByLane, {
    authoritySequenceSha256: next.production.canonicalCreatorPackagingSequence.sequenceSha256,
    registrySourceSha256: reviewRegistry.registrySha256,
    rationale: "CANDIDATE_ONLY static-board preflight: all 13 current shot bindings already passed actual-pixel, semantic, mode, font/source and current-aesthetic gates; this does not approve the whole-film board or authorize Assembly.",
    now,
  });
  next.production.creatorPaletteShotBindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  if (next.production.creatorPaletteShotBindingManifest.status !== "PASS" || next.production.creatorPaletteShotBindingManifest.entries.some((entry) => entry.status !== "PASS")) throw new Error(`canonical-system-validation-rebound-blocked:${JSON.stringify(next.production.creatorPaletteShotBindingManifest.blockedShotIds)}`);

  const plans = new Map(next.production.shotIntelligence.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
  const raws = next.production.shotIntelligence.lookMasterRawReferences || [];
  const packageDecisions = next.production.canonicalCreatorPackagingSequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE");
  const selectedMasters = packageDecisions.map((decision) => {
    const plan = plans.get(decision.shotId);
    const artifact = plan?.provisionalWholeFilmBoardSelection?.artifact;
    const raw = artifact ? raws.find((candidate) => candidate.shotId === decision.shotId && candidate.artifact?.sha256 === artifact.sha256) : null;
    const pass = raw?.current === true
      && raw?.selectionEligible === true
      && raw?.pixelAudit?.status === "PASS"
      && raw?.pixelAudit?.admissionAllowed === true
      && raw?.semanticPixelAudit?.status === "PASS"
      && raw?.semanticPixelAudit?.recommendationEligible === true;
    if (!plan || !artifact || !pass) throw new Error(`canonical-system-validation-selected-master-blocked:${decision.shotId}`);
    return {
      shotId: decision.shotId,
      presentationMode: decision.presentationMode,
      artifactSha256: artifact.sha256,
      artifactPublicUrl: artifact.publicUrl,
      artifactWidth: artifact.width,
      artifactHeight: artifact.height,
      candidateId: raw.referenceId,
      planSha256: plan.planSha256,
      directionId: raw.candidateDirectionId,
      pixelAuditSha256: raw.pixelAudit.auditSha256,
      semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
      status: "SYSTEM_PIXEL_PASS_SELECTED_CANDIDATE_ONLY",
    };
  });
  const selectedMasterSetSha256 = sha256(selectedMasters.map(({shotId, artifactSha256, planSha256, pixelAuditSha256, semanticPixelAuditSha256}) => ({shotId, artifactSha256, planSha256, pixelAuditSha256, semanticPixelAuditSha256})));
  const objectiveBody = {
    contract: "A1DelegatedObjectiveVisualGate/v1",
    status: "SYSTEM_VISUAL_APPROVED_DELEGATED",
    current: true,
    authorityScope: "CURRENT_CANDIDATE_ONLY_STATIC_BOARD_PREFLIGHT",
    validationLane: "SYSTEM_VALIDATION_CANDIDATE_ONLY",
    ruleSetIds: ["CURRENT_CANONICAL_SEMANTIC_MEMBERSHIP", "CURRENT_SELECTED_ACTUAL_PIXEL_AND_PROVENANCE", "CURRENT_PRESENTATION_MODE_AND_AESTHETIC"],
    hardRuleDisagreement: false,
    userVisualApproval: "NOT_APPROVED",
    selectedPackageCount: selectedMasters.length,
    targetShotIds: [],
    selectedMasters,
    selectedMasterSetSha256,
    boardBinding: {contract: "A1DelegatedObjectiveBoardBinding/v1", status: "PENDING_CURRENT_STATIC_BOARD_REBUILD", packageBoardSha256: null, timelineBoardSha256: null, selectedMasterSetSha256, selectedMasterCount: selectedMasters.length},
    internalCanaryAllowed: false,
    nextAction: "REBUILD_WHOLE_FILM_STATIC_BOARD_FOR_USER_REVIEW",
    requiresUser: true,
    productionWired: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    motionAllowed: false,
    resolveInsertAuthorized: false,
    finalFilm: false,
    updatedAt: now,
  };
  next.production.objectiveVisualGate = {...objectiveBody, gateSha256: sha256(objectiveBody)};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.shotIntelligence.currentAssembly = [];
  let recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "admit-canonical-static-board-system-validation-v1", targetId: selectedMasterSetSha256, payload: {validationLane: "SYSTEM_VALIDATION_CANDIDATE_ONLY", packageShotIds: selectedMasters.map((item) => item.shotId), bindingManifestSha256: recalculated.production.creatorPaletteShotBindingManifest.manifestSha256, userVisualApproval: "NOT_APPROVED", assemblyCreationAllowed: false, motionAllowed: false}, now});
  recalculated.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(recalculated, now));
  const report = {contract: "A1CanonicalStaticBoardSystemValidation/v1", status: "PASS", validationLane: "SYSTEM_VALIDATION_CANDIDATE_ONLY", packageShotIds: selectedMasters.map((item) => item.shotId), selectedMasterSetSha256, registrySha256: recalculated.production.creatorPackagingPaletteRegistry.registrySha256, bindingManifestSha256: recalculated.production.creatorPaletteShotBindingManifest.manifestSha256, userVisualApproval: "NOT_APPROVED", assemblyCreationAllowed: false, motionAllowed: false, generatedAt: now};
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `canonical-system-validation-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"canonical-static-board-system-validation-v1/report.json": report, "creator-packaging-palette-review-v1/registry.json": recalculated.production.creatorPackagingPaletteRegistry, "creator-packaging-palette-binding-v1/manifest.json": recalculated.production.creatorPaletteShotBindingManifest}});
  return {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: persisted.workspaceSha256, transitionSha256: persisted.transitionSha256};
});

console.log(JSON.stringify(result, null, 2));
