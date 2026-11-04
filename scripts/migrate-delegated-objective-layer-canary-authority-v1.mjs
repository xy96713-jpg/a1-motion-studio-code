#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {applyImagegenMasterPreservationPolicy} from "../apps/studio-next/src/lib/a1-imagegen-master-preservation-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const expectedWorkspaceSha256 = process.argv[2];
const targetShotIds = ["ED-08", "ED-14", "ED-31"];
const layerKinds = ["BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION"];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("delegated-layer-canary-migration-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function publicFile(publicUrl) {
  const value = String(publicUrl || "");
  const file = path.resolve(publicRoot, value.replace(/^\//u, ""));
  if (!value.startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("delegated-layer-canary-public-path-invalid");
  return file;
}

function presentationBehavior(mode) {
  if (["PRESENTER_INTEGRATED_LOOK_MASTER", "PRESENTER_NEGATIVE_SPACE_OVERLAY", "PRESENTER_BASE", "OVERLAY"].includes(mode)) return {
    baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
    baseSubjectMustRemainVisible: true,
    frameTakeoverAllowed: false,
    safeZonePolicy: "ACTUAL_FRAME_OPEN_REGION_REQUIRED",
  };
  if (mode === "SOURCE_EVIDENCE_TAKEOVER") return {
    baseVideoRelationship: "TEMPORARY_SOURCE_EVIDENCE_TAKEOVER",
    baseSubjectMustRemainVisible: false,
    frameTakeoverAllowed: true,
    safeZonePolicy: "SOURCE_EVIDENCE_WINDOW_AND_TITLE_SAFE",
  };
  if (mode === "EXPLAINER") return {
    baseVideoRelationship: "TEMPORARY_EXPLAINER_OR_EDITOR_CHOSEN_SPLIT",
    baseSubjectMustRemainVisible: false,
    frameTakeoverAllowed: true,
    safeZonePolicy: "NAMED_MECHANISM_MUST_REMAIN_TITLE_SAFE",
  };
  return {
    baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER",
    baseSubjectMustRemainVisible: false,
    frameTakeoverAllowed: true,
    safeZonePolicy: "FULL_FRAME_WITH_TITLE_SAFE",
  };
}

function rehashVideoContext(context, now) {
  const next = structuredClone(context);
  next.createdAt = now;
  const identity = structuredClone(next);
  delete identity.contextSha256;
  delete identity.createdAt;
  next.contextSha256 = sha256(identity);
  return next;
}

function rehashPackageKitPlan(plan) {
  const identity = structuredClone(plan);
  delete identity.planSha256;
  delete identity.createdAt;
  return {...plan, planSha256: sha256(identity)};
}

function historyOnly(value, now, reason) {
  if (!value || typeof value !== "object") return value;
  const previousStatus = value.status || null;
  return {
    ...value,
    status: "HISTORY_READ_ONLY_SUPERSEDED",
    previousStatus,
    current: false,
    historyReadOnly: true,
    authorityScope: "HISTORY_READ_ONLY",
    supersededAt: now,
    supersededReason: reason,
  };
}

function buildSelectedMaster({item, raw, binding}) {
  const selectionEvidence = {
    contract: "A1DelegatedObjectiveMasterSelectionEvidence/v1",
    shotId: item.shotId,
    artifactSha256: item.artifactSha256,
    pixelAuditSha256: raw.pixelAudit?.auditSha256 || binding.actualPixelAuditSha256 || null,
    semanticPixelAuditSha256: raw.semanticPixelAudit?.auditSha256 || raw.semanticPixelAuditSha256 || binding.semanticPixelAuditSha256 || null,
    actualPixelStatus: raw.pixelAudit?.status || raw.actualPixelAssessment?.status || null,
    semanticPixelStatus: raw.semanticPixelAudit?.status || null,
    creatorBindingStatus: binding.status,
  };
  const selectionEvidenceSha256 = sha256(selectionEvidence);
  return {
    shotId: item.shotId,
    presentationMode: item.presentationMode,
    artifactSha256: item.artifactSha256,
    artifactPublicUrl: item.artifactPublicUrl,
    artifactWidth: Number(raw.artifact?.width || 1672),
    artifactHeight: Number(raw.artifact?.height || 941),
    candidateId: item.candidateId,
    planSha256: item.planSha256,
    directionId: raw.candidateDirectionId || raw.directionId || `delegated-objective-${item.shotId.toLowerCase()}`,
    selectionEvidenceSha256,
    pixelAuditSha256: selectionEvidence.pixelAuditSha256,
    semanticPixelAuditSha256: selectionEvidence.semanticPixelAuditSha256,
    referenceAttachmentManifestSha256: raw.referenceAttachmentManifest?.manifestSha256 || raw.imagegenAttachmentManifestSha256 || raw.artifact?.imagegenAttachmentManifestSha256 || null,
    status: "SYSTEM_PIXEL_PASS_SELECTED",
  };
}

function selectedBinding(selected, prior = null) {
  return {
    ...(prior || {}),
    status: "SYSTEM_PIXEL_PASS_SELECTED_DELEGATED",
    lookMasterPlanSha256: selected.planSha256,
    candidateId: selected.candidateId,
    candidateSha256: selected.selectionEvidenceSha256,
    directionId: selected.directionId,
    artifactPublicUrl: selected.artifactPublicUrl,
    artifactSha256: selected.artifactSha256,
    artifactWidth: selected.artifactWidth,
    artifactHeight: selected.artifactHeight,
    auditSha256: selected.pixelAuditSha256,
    semanticPixelAuditSha256: selected.semanticPixelAuditSha256,
    comparativeReviewSha256: selected.selectionEvidenceSha256,
    reviewDecisionSha256: selected.selectionEvidenceSha256,
    referenceAttachmentManifestSha256: selected.referenceAttachmentManifestSha256,
    userApprovalRequired: false,
    userVisualApproval: "NOT_APPROVED",
    selectedBy: "system",
    selectionSource: "DELEGATED_OBJECTIVE_VISUAL_GATE",
    internalCanaryAllowed: targetShotIds.includes(selected.shotId),
    assemblyEligible: false,
  };
}

const result = withProjectLock(appRoot, () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `delegated-layer-canary-migration-workspace-cas-failed:${before.workspaceSha256}`);
  assert.equal(Number(before.production.generation.summary.queued || 0), 0, "delegated-layer-canary-migration-queue-not-idle");
  assert.equal(Number(before.production.generation.summary.running || 0), 0, "delegated-layer-canary-migration-running-not-idle");
  assert.equal(before.production.generation.workerStatus, "frozen", "delegated-layer-canary-migration-worker-not-frozen");
  assert.equal(before.production.generation.automaticDispatchAllowed, false, "delegated-layer-canary-migration-auto-dispatch-must-be-false");
  assert.equal((before.production.shotIntelligence.currentAssembly || []).length, 0, "delegated-layer-canary-migration-zero-current-assembly-required");

  const runtime = before.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  assert.equal(board?.sha256, "08c250b8cf31d53fecf4adbbbc98388d1e825487a8fb09b97664bf7593d23d24", "delegated-layer-canary-package-board-sha-invalid");
  assert.equal(board?.timelineBoard?.sha256, "b3c14be3c41e8bf90913af7ba2a9a18857058dd5873702b00ed41750dc903fa5", "delegated-layer-canary-timeline-board-sha-invalid");
  assert.equal(Number(board?.itemCount || 0), 13, "delegated-layer-canary-package-board-count-invalid");
  assert.equal(Number(board?.timelineBoard?.itemCount || 0), 34, "delegated-layer-canary-timeline-board-count-invalid");
  for (const artifact of [{publicUrl: board.publicUrl, sha256: board.sha256}, {publicUrl: board.timelineBoard.publicUrl, sha256: board.timelineBoard.sha256}]) {
    const file = publicFile(artifact.publicUrl);
    assert.ok(fs.existsSync(file), `delegated-layer-canary-board-file-missing:${artifact.publicUrl}`);
    assert.equal(fileSha256(file), artifact.sha256, `delegated-layer-canary-board-file-sha-invalid:${artifact.publicUrl}`);
  }

  const objective = before.production.objectiveVisualGate;
  assert.equal(objective?.contract, "A1DelegatedObjectiveVisualGate/v1", "delegated-layer-canary-objective-contract-invalid");
  assert.equal(objective?.status, "SYSTEM_VISUAL_APPROVED_DELEGATED", "delegated-layer-canary-objective-status-invalid");
  assert.equal(objective?.hardRuleDisagreement, false, "delegated-layer-canary-hard-rule-disagreement");
  assert.equal(objective?.userVisualApproval, "NOT_APPROVED", "delegated-layer-canary-user-approval-must-remain-not-approved");

  const creatorBinding = before.production.creatorPaletteShotBindingManifest;
  assert.equal(creatorBinding?.status, "PASS", "delegated-layer-canary-creator-binding-not-pass");
  assert.equal(creatorBinding?.entries?.length, 13, "delegated-layer-canary-creator-binding-count-invalid");
  const bindingByShot = new Map(creatorBinding.entries.map((entry) => [entry.shotId, entry]));
  const rawBySha = new Map((runtime.lookMasterRawReferences || []).map((raw) => [raw.artifact?.sha256, raw]));
  const selectedMasters = board.items.map((item) => {
    const raw = rawBySha.get(item.artifactSha256);
    const binding = bindingByShot.get(item.shotId);
    assert.ok(raw, `delegated-layer-canary-selected-raw-missing:${item.shotId}`);
    assert.ok(binding && binding.status === "PASS", `delegated-layer-canary-selected-binding-missing:${item.shotId}`);
    assert.equal(binding.actualShotCandidateSha256, item.artifactSha256, `delegated-layer-canary-selected-binding-sha-mismatch:${item.shotId}`);
    const file = publicFile(item.artifactPublicUrl);
    assert.ok(fs.existsSync(file), `delegated-layer-canary-master-file-missing:${item.shotId}`);
    assert.equal(fileSha256(file), item.artifactSha256, `delegated-layer-canary-master-file-sha-invalid:${item.shotId}`);
    return buildSelectedMaster({item, raw, binding});
  });
  assert.equal(new Set(selectedMasters.map((item) => item.shotId)).size, 13, "delegated-layer-canary-selected-shot-duplicate");
  assert.equal(new Set(selectedMasters.map((item) => item.artifactSha256)).size, 13, "delegated-layer-canary-selected-master-duplicate");
  const selectedMasterSetSha256 = sha256(selectedMasters);
  const now = new Date().toISOString();
  let next = structuredClone(before);
  const nextRuntime = next.production.shotIntelligence;

  const objectiveBody = {
    ...next.production.objectiveVisualGate,
    current: true,
    authorityScope: "CURRENT",
    status: "SYSTEM_VISUAL_APPROVED_DELEGATED",
    packageBoardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard.sha256,
    selectedMasters,
    selectedMasterSetSha256,
    selectedPackageCount: selectedMasters.length,
    boardBinding: {
      contract: "A1DelegatedObjectiveBoardBinding/v1",
      status: "PASS",
      packageBoardSha256: board.sha256,
      timelineBoardSha256: board.timelineBoard.sha256,
      selectedMasterSetSha256,
      selectedMasterCount: selectedMasters.length,
    },
    internalCanaryAllowed: true,
    nextAction: "RUN_REPRESENTATIVE_LAYER_CANARY",
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };
  delete objectiveBody.gateSha256;
  objectiveBody.gateSha256 = sha256({...objectiveBody, gateSha256: undefined, updatedAt: undefined});
  next.production.objectiveVisualGate = objectiveBody;

  next.production.userVisualApprovalGate = {
    contract: "A1WholeFilmStaticBoardApprovalGate/v2",
    status: "NOT_APPROVED_EXTERNAL_RELEASE_ONLY",
    current: true,
    authorityScope: "CURRENT",
    legalApprovalFound: false,
    packageBoardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard.sha256,
    selectedMasterSetSha256,
    userQuote: null,
    userMessageId: null,
    userVisualApproval: "NOT_APPROVED",
    blocksInternalCanary: false,
    blocksExternalRelease: true,
    nextAction: "NONE_FOR_INTERNAL_CANARY",
    checkedAt: now,
    historyReadOnly: historyOnly(before.production.userVisualApprovalGate, now, "superseded-by-delegated-objective-canary-policy"),
  };

  const selectedByShot = new Map(selectedMasters.map((item) => [item.shotId, item]));
  for (const plan of nextRuntime.packageLookMasterPlans || []) {
    const selected = selectedByShot.get(plan.shotId);
    if (!selected) continue;
    plan.selectedLookMasterId = selected.candidateId;
    plan.selectedLookMasterBinding = selectedBinding(selected, plan.selectedLookMasterBinding);
    plan.systemSelection = {
      contract: "A1DelegatedObjectiveMasterSelection/v1",
      status: "SYSTEM_SELECTED",
      artifactSha256: selected.artifactSha256,
      selectionEvidenceSha256: selected.selectionEvidenceSha256,
      userVisualApproval: "NOT_APPROVED",
      selectedAt: now,
    };
    plan.layerCanaryStatus = targetShotIds.includes(plan.shotId) ? "THREE_SHOT_LAYER_CANARY_READY" : "SYSTEM_PIXEL_PASS_DEFERRED_AFTER_CANARY";
  }

  const lookPlanByShot = new Map((nextRuntime.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  const updatedKitByShot = new Map();
  for (const currentPlan of nextRuntime.packageAssetKitPlans || []) {
    const selected = selectedByShot.get(currentPlan.shotId);
    const binding = bindingByShot.get(currentPlan.shotId);
    const lookPlan = lookPlanByShot.get(currentPlan.shotId);
    if (!selected || !binding || !lookPlan) continue;
    let plan = structuredClone(currentPlan);
    const mode = lookPlan.presentationMode || selected.presentationMode || binding.presentationMode || plan.presentationMode;
    const assemblyMode = lookPlan.assemblyMode || binding.assemblyMode || plan.assemblyMode;
    plan.assemblyMode = assemblyMode;
    plan.presentationMode = mode;
    plan.presentationModeReason = "INDEPENDENT_INFORMATION_OWNER_DECISION_BOUND_BEFORE_PROMPT";
    plan.whyPresentationModeBeatsOtherModes = `Current board information owner requires ${mode}; reference attachment presence never infers presenter visibility.`;
    if (lookPlan.videoContext) {
      plan.videoContext = structuredClone(lookPlan.videoContext);
      plan.videoContextSha256 = plan.videoContext.contextSha256;
    }
    if (targetShotIds.includes(plan.shotId)) {
      for (const layer of plan.layers) {
        layer.route = "GENERATE";
        layer.candidateBudget = 1;
        layer.budgetRange = {min: 1, max: 1};
        layer.status = "THREE_SHOT_LAYER_CANARY_READY";
        layer.candidates = [];
        layer.selectedCandidateId = null;
      }
    }
    plan = applyImagegenMasterPreservationPolicy(plan, {selectedLookMasterBinding: selectedBinding(selected, plan.selectedLookMasterBinding)});
    plan.status = targetShotIds.includes(plan.shotId) ? "THREE_SHOT_LAYER_CANARY_READY" : "LOCKED_DEFERRED_AFTER_CANARY";
    plan.current = true;
    plan.authorityScope = "CURRENT";
    plan.userVisualApproval = "NOT_APPROVED";
    plan.delegatedObjectiveGateSha256 = objectiveBody.gateSha256;
    plan.deterministicCanary = {
      status: targetShotIds.includes(plan.shotId) ? "READY" : "DEFERRED",
      sourceMasterSha256: selected.artifactSha256,
      expectedLayerKinds: [...layerKinds],
      localSecondDesignAllowed: false,
    };
    plan = rehashPackageKitPlan(plan);
    updatedKitByShot.set(plan.shotId, plan);
  }
  nextRuntime.packageAssetKitPlans = (nextRuntime.packageAssetKitPlans || []).map((plan) => updatedKitByShot.get(plan.shotId) || plan);

  nextRuntime.packageAssemblyRecipeHistory = [
    ...(nextRuntime.packageAssemblyRecipeHistory || []),
    ...(nextRuntime.packageAssemblyRecipes || []).map((recipe) => historyOnly(recipe, now, "superseded-zero-layer-pre-canary-assembly")),
  ];
  nextRuntime.packageAssemblyRecipes = (nextRuntime.packageAssemblyRecipes || []).map((currentRecipe) => {
    const plan = updatedKitByShot.get(currentRecipe.shotId);
    const selected = selectedByShot.get(currentRecipe.shotId);
    if (!plan || !selected) return historyOnly(currentRecipe, now, "superseded-zero-layer-pre-canary-assembly");
    const recipe = {
      ...currentRecipe,
      planSha256: plan.planSha256,
      assemblyMode: plan.assemblyMode,
      assemblyModeReason: plan.assemblyModeReason,
      whyThisModeBeatsOtherModes: plan.whyThisModeBeatsOtherModes,
      presentationMode: plan.presentationMode,
      presentationModeReason: plan.presentationModeReason,
      whyPresentationModeBeatsOtherModes: plan.whyPresentationModeBeatsOtherModes,
      insertionMode: plan.presentationMode,
      videoContext: structuredClone(plan.videoContext),
      videoContextSha256: plan.videoContextSha256,
      selectedLookMasterBinding: selectedBinding(selected, currentRecipe.selectedLookMasterBinding),
      reconstructionSource: null,
      assemblySource: {
        mode: "HISTORY_READ_ONLY",
        previousMode: currentRecipe.assemblySource?.mode || null,
        previousAuthoritativeFullFrameSha256: currentRecipe.assemblySource?.authoritativeFullFrame?.sha256 || null,
      },
      layerCandidateIds: Object.fromEntries(layerKinds.map((kind) => [kind, null])),
      selectionEvidence: null,
      deterministicParity: null,
      parityAudit: null,
      finalAssemblyReview: null,
      approvalBinding: null,
      assemblyPreviewAvailable: false,
      assemblyReadyForUserReview: false,
      assemblyUserApproved: false,
      status: "HISTORY_READ_ONLY",
      previousStatus: currentRecipe.status,
      current: false,
      historyReadOnly: true,
      authorityScope: "HISTORY_READ_ONLY",
      supersededAt: now,
      supersededReason: "zero-layer-current-state-cannot-be-assembly-review-required",
    };
    const recipeIdentity = structuredClone(recipe);
    delete recipeIdentity.recipeSha256;
    recipe.recipeSha256 = sha256(recipeIdentity);
    return recipe;
  });
  nextRuntime.currentAssembly = [];

  if (nextRuntime.videoPackagingContexts?.items) {
    nextRuntime.videoPackagingContexts.items = nextRuntime.videoPackagingContexts.items.map((context) => updatedKitByShot.get(context.shotId)?.videoContext || context);
    nextRuntime.videoPackagingContexts.summary = {
      contextCount: nextRuntime.videoPackagingContexts.items.length,
      holdFrameBoundCount: nextRuntime.videoPackagingContexts.items.filter((item) => item.frameStatus === "HOLD_FRAME_BOUND").length,
      unverifiedCompatibilityCount: nextRuntime.videoPackagingContexts.items.filter((item) => item.footageCompatibility === "UNVERIFIED").length,
      recommendationAllowedCount: nextRuntime.videoPackagingContexts.items.filter((item) => item.recommendationAllowed).length,
    };
    nextRuntime.videoPackagingContexts.status = nextRuntime.videoPackagingContexts.summary.holdFrameBoundCount === nextRuntime.videoPackagingContexts.summary.contextCount ? "ALL_HOLD_FRAMES_BOUND" : "PARTIAL_HOLD_FRAMES_BOUND";
    nextRuntime.videoPackagingContexts.sha256 = sha256({
      contract: nextRuntime.videoPackagingContexts.contract,
      version: nextRuntime.videoPackagingContexts.version,
      status: nextRuntime.videoPackagingContexts.status,
      items: nextRuntime.videoPackagingContexts.items,
      summary: nextRuntime.videoPackagingContexts.summary,
    });
  }

  for (const key of [
    "approvedMasterLayerJobPreflight",
    "approvedMasterLayerPilot",
    "approvedMasterLayerCanaryAudit",
    "deterministicLayerReconstructionPilot",
    "representativeApprovedMasterMotionPilot",
    "wholeFilmDeterministicLayerReconstruction",
    "wholeFilmDeterministicLayerActualVisualReview",
    "wholeFilmApprovedMasterMotionPlan",
  ]) if (nextRuntime[key]) nextRuntime[key] = historyOnly(nextRuntime[key], now, "superseded-by-current-delegated-three-shot-layer-canary");

  nextRuntime.threeShotLayerCanary = {
    contract: "A1ThreeShotLayerCanary/v1",
    status: "THREE_SHOT_LAYER_CANARY_READY",
    current: true,
    authorityScope: "CURRENT",
    targetShotIds: [...targetShotIds],
    expectedLayerKinds: [...layerKinds],
    expectedLayerCount: targetShotIds.length * layerKinds.length,
    layerCount: 0,
    itemCount: 0,
    passCount: 0,
    failureCount: 0,
    sourcePackageBoardSha256: board.sha256,
    sourceTimelineBoardSha256: board.timelineBoard.sha256,
    sourceSelectedMasterSetSha256: selectedMasterSetSha256,
    localSecondDesignAllowed: false,
    imageGenerationAllowed: false,
    assemblyCreationAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    userVisualApproval: "NOT_APPROVED",
    nextAction: "RUN_REPRESENTATIVE_LAYER_CANARY",
    createdAt: now,
  };
  nextRuntime.status = "THREE_SHOT_LAYER_CANARY_READY";
  nextRuntime.wholeFilmStaticBoard = {
    ...nextRuntime.wholeFilmStaticBoard,
    status: "SYSTEM_VISUAL_APPROVED_DELEGATED_CANARY_ONLY",
    reviewScope: "DELEGATED_OBJECTIVE_INTERNAL_CANARY",
    userVisualApproval: "NOT_APPROVED",
    internalCanaryAllowed: true,
    assemblyCreationAllowed: false,
    updatedAt: now,
  };
  if (nextRuntime.wholeFilmStaticBoardDecision) nextRuntime.wholeFilmStaticBoardDecision = historyOnly(nextRuntime.wholeFilmStaticBoardDecision, now, "explicit-user-approval-not-present-and-not-required-for-internal-canary");

  next.production.assembly = {
    contract: "A1FilmAssembly/v2",
    status: "LOCKED_PRE_CANARY",
    current: true,
    authorityScope: "CURRENT",
    currentAssemblyCount: 0,
    previewArtifact: null,
    assemblyCreated: false,
    productionWired: false,
    mediaBindings: structuredClone(before.production.assembly?.mediaBindings || {}),
    discovery: structuredClone(before.production.assembly?.discovery || null),
    userVisualApproval: "NOT_APPROVED",
    historyReadOnly: historyOnly(before.production.assembly, now, "superseded-zero-layer-pre-canary-assembly"),
    updatedAt: now,
  };
  next.production.motion = {
    contract: "A1RepresentativeMotionGate/v2",
    status: "NOT_CREATED",
    current: true,
    authorityScope: "CURRENT",
    representativePlan: null,
    previewArtifact: null,
    review: {status: "not-started", score: null, maxScore: 24, hardFailures: [], reviewedAt: null},
    fullMotionAllowed: false,
    motionApproved: false,
    historyReadOnly: historyOnly(before.production.motion, now, "superseded-pre-canary-motion-state"),
    updatedAt: now,
  };

  next.production.packagingReview = {
    ...(next.production.packagingReview || {}),
    current: true,
    status: "DELEGATED_OBJECTIVE_CANARY_INTERNAL",
    userApprovalStatus: "NOT_APPROVED",
    userVisualApproval: "NOT_APPROVED",
    intermediateApprovalRequired: false,
    requiresExplicitApproval: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: true,
    criticAllowed: false,
    motionAllowed: false,
    nextAction: "RUN_REPRESENTATIVE_LAYER_CANARY",
    updatedAt: now,
  };
  next.production.universalReferencePackagingGate = {
    ...next.production.universalReferencePackagingGate,
    status: "PASS",
    current: true,
    packageCount: 13,
    noPackageCount: 21,
    fullLookMasterActualPixelPassCount: 13,
    actualAttachmentCoverageCount: 4,
    selectedMasterSetSha256,
    packageBoardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard.sha256,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: true,
    criticAllowed: false,
    motionAllowed: false,
    nextAction: "RUN_REPRESENTATIVE_LAYER_CANARY",
    updatedAt: now,
  };
  next.production.packagingAutomation = {
    ...(next.production.packagingAutomation || {}),
    status: "THREE_SHOT_LAYER_CANARY_READY",
    currentStage: "three-shot-layer-canary",
    targetShotIds: [...targetShotIds],
    reason: "delegated-objective-static-board-pass-unlocks-only-reversible-three-shot-layer-canary",
    generationFreeze: {
      frozen: true,
      imageGenerationAllowed: false,
      automaticDispatchAllowed: false,
      workerStatus: "frozen",
    },
    updatedAt: now,
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};

  const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
  const maturityRun = readJson(maturityPath);
  maturityRun.overallStatus = "DELEGATED_STATIC_BOARD_APPROVED_FOR_CANARY";
  maturityRun.nextAction = "RUN_REPRESENTATIVE_LAYER_CANARY";
  maturityRun.current = true;
  maturityRun.targetShotIds = [...targetShotIds];
  maturityRun.userVisualApproval = "NOT_APPROVED";
  maturityRun.delegatedObjectiveVisualGate = {
    status: "SYSTEM_VISUAL_APPROVED_DELEGATED",
    gateSha256: objectiveBody.gateSha256,
    packageBoardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard.sha256,
    selectedMasterSetSha256,
  };
  maturityRun.postStaticBoard = {
    status: "THREE_SHOT_LAYER_CANARY_READY",
    targetShotIds: [...targetShotIds],
    expectedLayerCount: 12,
    assemblyCreationAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };
  maturityRun.generatedAt = now;
  maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
  next.production.goldenFilmVisualSystemMaturity = {
    ...(next.production.goldenFilmVisualSystemMaturity || {}),
    current: true,
    status: maturityRun.overallStatus,
    nextAction: maturityRun.nextAction,
    maturityRunSha256: maturityRun.maturityRunSha256,
    targetShotIds: [...targetShotIds],
    packageBoardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard.sha256,
    selectedMasterSetSha256,
    objectiveVisualGateSha256: objectiveBody.gateSha256,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };

  const migrationBody = {
    contract: "A1DelegatedObjectiveLayerCanaryAuthorityMigration/v1",
    status: "PASS",
    workspaceSha256Before: before.workspaceSha256,
    packageBoardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard.sha256,
    selectedMasterSetSha256,
    selectedMasterCount: selectedMasters.length,
    selectedMasters,
    objectiveVisualGateSha256: objectiveBody.gateSha256,
    userVisualApproval: "NOT_APPROVED",
    internalCanaryAllowed: true,
    targetShotIds: [...targetShotIds],
    expectedLayerCount: 12,
    currentLayerCount: 0,
    currentAssemblyCount: 0,
    assemblyStatus: "LOCKED_PRE_CANARY",
    motionStatus: "NOT_CREATED",
    criticAllowed: false,
    nextAction: "RUN_REPRESENTATIVE_LAYER_CANARY",
    requiresUser: false,
    migratedAt: now,
  };
  const migration = {...migrationBody, migrationSha256: sha256({...migrationBody, migratedAt: undefined})};

  const existingBoardReportPath = path.join(publicDir, "whole-film-static-board-v1/report.json");
  const boardReport = {
    ...(fs.existsSync(existingBoardReportPath) ? readJson(existingBoardReportPath) : {}),
    current: true,
    authorityScope: "CURRENT",
    status: "SYSTEM_VISUAL_APPROVED_DELEGATED_CANARY_ONLY",
    packageBoardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard.sha256,
    selectedMasterSetSha256,
    itemCount: 13,
    timelineItemCount: 34,
    userVisualApproval: "NOT_APPROVED",
    userApprovalRequired: false,
    delegatedObjectiveGateSha256: objectiveBody.gateSha256,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: true,
    canaryTargetShotIds: [...targetShotIds],
    nextAction: "RUN_REPRESENTATIVE_LAYER_CANARY",
    requiresUser: false,
    criticAllowed: false,
    motionAllowed: false,
    updatedAt: now,
  };

  const event = createProductionEvent({
    workspace: before,
    action: "migrate-delegated-objective-layer-canary-authority-v1",
    targetId: objectiveBody.gateSha256,
    payload: migration,
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));

  assert.equal(next.production.objectiveVisualGate.current, true);
  assert.equal(next.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED");
  assert.equal(next.production.authority.nextAction.id, "RUN_REPRESENTATIVE_LAYER_CANARY");
  assert.equal(next.production.authority.nextAction.requiresUser, false);
  assert.equal(next.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_READY");
  assert.equal(next.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(next.production.assembly.status, "LOCKED_PRE_CANARY");
  assert.equal(next.production.motion.status, "NOT_CREATED");
  assert.equal(next.production.universalReferencePackagingGate.nextAction, "RUN_REPRESENTATIVE_LAYER_CANARY");
  assert.equal(next.production.generation.summary.queued, 0);
  assert.equal(next.production.generation.summary.running, 0);

  const committed = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: before.workspaceSha256,
    commitId: `delegated-layer-canary-authority-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "delegated-objective-layer-canary-authority-v1/migration.json": migration,
      "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun,
      "whole-film-static-board-v1/report.json": boardReport,
      "three-shot-layer-canary-v1/authority.json": next.production.shotIntelligence.threeShotLayerCanary,
    },
  });
  return {
    status: migration.status,
    workspaceSha256Before: before.workspaceSha256,
    workspaceSha256After: committed.workspaceSha256,
    migrationSha256: migration.migrationSha256,
    objectiveVisualGateSha256: objectiveBody.gateSha256,
    selectedMasterSetSha256,
    selectedMasterCount: selectedMasters.length,
    packageBoardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard.sha256,
    shotStatus: next.production.shotIntelligence.status,
    assemblyStatus: next.production.assembly.status,
    motionStatus: next.production.motion.status,
    nextAction: next.production.authority.nextAction.id,
    requiresUser: next.production.authority.nextAction.requiresUser,
    userVisualApproval: next.production.objectiveVisualGate.userVisualApproval,
    queue: next.production.generation.summary,
    workerStatus: next.production.generation.workerStatus,
  };
});

console.log(JSON.stringify(result, null, 2));
