#!/usr/bin/env node
/**
 * Quarantine the rejected ED-10 Assembly and prepare one bounded, generation-
 * first Look Master replacement. Existing files are never deleted or changed.
 * This migration does not generate, split layers, run critic, or build motion.
 */
import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();

const replacementDirections = [
  {
    directionId: "direction-01",
    dominantActor: "language-verdict-transition-compact-scanline-window",
    composition: "compact-top-right-scanline-window-with-face-clearance",
    surface: "crt-scanline-breakup-with-sparse-pixel-registration",
    material: "dark-screen-phosphor-and-one-ink-accent",
    paletteRole: "base-video-derived-charcoal-plus-acid-signal",
    motionPotential: "signal-enters-from-negative-space-then-locks",
    baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
  },
  {
    directionId: "direction-02",
    dominantActor: "language-verdict-transition-paper-cutout-relay",
    composition: "off-axis-paper-cutout-in-open-side-space-with-short-type-path",
    surface: "dithered-newsprint-with-controlled-misregistration",
    material: "cream-paper-charcoal-ink-and-cobalt-cutout",
    paletteRole: "hold-frame-darkness-plus-cream-and-cobalt",
    motionPotential: "paper-cutout-slides-in-and-verdict-replaces-first-state",
    baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
  },
  {
    directionId: "direction-03",
    dominantActor: "language-verdict-transition-object-bound-editor-tool",
    composition: "single-editorial-object-anchored-to-left-negative-space-with-horizontal-type",
    surface: "hard-pixel-edge-with-printed-grain-and-small-registration-marks",
    material: "one-bit-tool-object-on-transparent-overlay-field",
    paletteRole: "charcoal-hold-frame-plus-cobalt-and-vermilion-action",
    motionPotential: "tool-crosses-copy-then-releases-a-clean-verdict",
    baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
  },
  {
    directionId: "direction-04",
    dominantActor: "language-verdict-transition-dithered-type-actor",
    composition: "diagonal-type-actor-and-pixel-pressure-band-in-lower-side-space",
    surface: "coarse-halftone-density-shift-with-visible-print-registration",
    material: "transparent-pixel-ink-and-matte-paper-fragment",
    paletteRole: "deep-video-neutral-plus-lime-transition-and-cobalt-structure",
    motionPotential: "ordered-copy-degrades-into-waste-then-holds",
    baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
  },
].map((direction) => ({
  ...direction,
  fingerprint: [direction.dominantActor, direction.composition, direction.surface, direction.material, direction.paletteRole, direction.baseVideoRelationship].join("|"),
}));

function hashWithout(value, key) {
  const copy = structuredClone(value);
  delete copy[key];
  return sha256(copy);
}

function hashContext(context) {
  const copy = structuredClone(context);
  delete copy.contextSha256;
  delete copy.createdAt;
  return sha256(copy);
}

function historyMark(value, reason) {
  if (!value || typeof value !== "object") return value;
  return {...value, status: "HISTORY_READ_ONLY", current: false, historyReadOnly: true, advisoryOnly: true, visualStatus: "VISUAL_REJECTED", supersededReason: reason, supersededAt: now};
}

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (!plan || !kit || !recipe) throw new Error("ed10-look-master-plan-kit-recipe-required");

  const oldLayerIds = Object.values(recipe.layerCandidateIds || {}).filter(Boolean);
  const oldAssembly = structuredClone(recipe.assemblyComposite || null);
  const oldContextPreview = structuredClone(recipe.contextPreview || null);
  const oldBinding = structuredClone(plan.selectedLookMasterBinding || kit.selectedLookMasterBinding || recipe.selectedLookMasterBinding || null);
  const oldPlanStatus = plan.status;
  const oldPlanSha256 = plan.planSha256;

  next.production.shotIntelligence.legacyVisualRejection = {
    contract: "A1ED10VisualRejectionHistory/v1",
    shotId: "ED-10",
    status: "VISUAL_REJECTED",
    current: false,
    historyReadOnly: true,
    rejectedReason: "user-visual-rejection-face-occlusion-and-poor-composition",
    oldPlanStatus,
    oldPlanSha256,
    oldAssembly,
    oldContextPreview,
    oldSelectedMasterBinding: oldBinding,
    oldLayerCandidateIds: recipe.layerCandidateIds || {},
    oldLayerCandidateCount: oldLayerIds.length,
    preservedAt: now,
  };

  // Preserve the old current board and raw references as history. Nothing is
  // deleted, but no old candidate can be selected by the new route.
  if (plan.activeCandidateSet) plan.activeCandidateSet = historyMark(plan.activeCandidateSet, "superseded-by-user-visual-rejection");
  if (plan.comparativeReviewBoard) plan.comparativeReviewBoard = historyMark(plan.comparativeReviewBoard, "superseded-by-user-visual-rejection");
  if (plan.comparativeReview) plan.comparativeReview = historyMark(plan.comparativeReview, "superseded-by-user-visual-rejection");
  if (plan.fastCandidateDiscovery) plan.fastCandidateDiscovery = historyMark(plan.fastCandidateDiscovery, "superseded-by-user-visual-rejection");
  if (plan.portfolioAudit) plan.portfolioAudit = historyMark(plan.portfolioAudit, "superseded-by-user-visual-rejection");
  plan.legacyCandidateDirections = {status: "HISTORY_READ_ONLY", current: false, directions: structuredClone(plan.candidateDirections || []), reason: "superseded-by-user-visual-rejection"};
  plan.candidateBudget = 4;
  plan.candidateDirections = replacementDirections;
  plan.currentCandidateDirections = null;
  plan.currentCandidateBudget = null;
  plan.candidateDirectionAuthority = "LEGACY_PLAN_CATALOG_UNTIL_FAST_DISCOVERY";
  plan.candidates = (plan.candidates || []).map((candidate) => historyMark(candidate, "superseded-by-user-visual-rejection"));
  plan.recommendation = null;
  plan.selectedLookMasterId = null;
  plan.selectedLookMasterBinding = null;
  plan.reviewDecision = null;
  plan.status = "PLAN_READY";
  plan.videoContext = {
    ...plan.videoContext,
    footageCompatibility: "UNVERIFIED",
    recommendationAllowed: false,
    recommendationBlocker: "subject-bounds-unavailable-after-visual-rejection",
    contextStatus: "VISUAL_REJECTED_UNVERIFIED",
    reconciliation: {
      contract: "A1VideoPackagingContextReconciliation/v1",
      status: "VISUAL_REJECTED",
      source: "USER_VISUAL_REJECTION",
      footageCompatibility: "UNVERIFIED",
      recommendationAllowed: false,
      recommendationBlocker: "subject-bounds-unavailable-after-visual-rejection",
      reconciledAt: now,
    },
  };
  plan.videoContext.presentationMode = plan.presentationMode || "OVERLAY";
  plan.videoContext.contextSha256 = hashContext(plan.videoContext);
  plan.videoContextSha256 = plan.videoContext.contextSha256;
  plan.planSha256 = sha256(planIdentity(plan));

  for (const reference of runtime.lookMasterRawReferences || []) {
    if (reference.shotId === "ED-10") Object.assign(reference, historyMark(reference, "superseded-by-user-visual-rejection"));
  }

  // Quarantine only the three layers used by the rejected Assembly. Other
  // historical candidates remain readable but cannot be current.
  for (const layer of kit.layers || []) {
    layer.candidates = (layer.candidates || []).map((candidate) => oldLayerIds.includes(candidate.candidateId)
      ? historyMark(candidate, "superseded-by-user-visual-rejection")
      : candidate);
    layer.selectedCandidateId = null;
    layer.autoSelectedCandidateId = null;
    if (layer.route !== "NONE") layer.status = "WAITING_FOR_LOOK_MASTER";
  }
  kit.status = "WAITING_FOR_LOOK_MASTER";
  kit.selectedLookMasterBinding = null;
  kit.selectedLookMasterProvenance = null;
  kit.reconstructionSource = null;
  kit.videoContext = structuredClone(plan.videoContext);
  kit.videoContextSha256 = plan.videoContext.contextSha256;
  kit.planSha256 = hashWithout(kit, "planSha256");
  for (const layer of kit.layers || []) for (const candidate of layer.candidates || []) {
    if (candidate.status === "HISTORY_READ_ONLY") {
      candidate.planSha256 = kit.planSha256;
      candidate.candidateSha256 = hashWithout(candidate, "candidateSha256");
    }
  }

  recipe.status = "WAITING_FOR_LOOK_MASTER";
  recipe.current = true;
  recipe.historyReadOnly = false;
  recipe.advisoryOnly = false;
  recipe.legacyVisualRejection = next.production.shotIntelligence.legacyVisualRejection;
  recipe.planSha256 = kit.planSha256;
  recipe.layerCandidateIds = Object.fromEntries((kit.layers || []).map((layer) => [layer.kind, null]));
  recipe.selectedLookMasterBinding = null;
  recipe.reconstructionSource = null;
  recipe.assemblyComposite = null;
  recipe.contextPreview = null;
  recipe.parityAudit = null;
  recipe.deterministicParity = null;
  recipe.assemblyVisualReview = null;
  recipe.finalAssemblyReview = null;
  recipe.userAssemblyDecision = null;
  recipe.assemblyPreviewAvailable = false;
  recipe.assemblyReadyForUserReview = false;
  recipe.assemblyUserApproved = false;
  recipe.selectionEvidence = null;
  recipe.recommendation = {status: "WAITING_FOR_LOOK_MASTER", reason: "旧 Assembly 已被用户拒绝；先生成四个完整、互异的正片包装母版，用户只在母版组合完成后审阅。"};
  recipe.buildKey = null;
  recipe.recipeSha256 = hashWithout(recipe, "recipeSha256");

  runtime.status = "LOOK_MASTER_PLANS_READY";
  runtime.visualReplacement = {
    contract: "A1ED10LookMasterVisualReplacement/v1",
    scope: "ED-10",
    status: "IN_PROGRESS",
    reason: "user-visual-rejection",
    oldAssemblySha256: oldAssembly?.sha256 || null,
    oldContextPreviewSha256: oldContextPreview?.sha256 || null,
    oldAssemblyStatus: "VISUAL_REJECTED",
    fastDiscovery: true,
    generationFirst: true,
    noLayerReconstruction: true,
    startedAt: now,
  };
  runtime.queuePolicy = {...runtime.queuePolicy, generationConcurrencyHardMax: 2, automaticDispatchAllowed: false};
  next.production.packagingReview = {
    ...next.production.packagingReview,
    status: "LOOK_MASTER_CANDIDATES_READY",
    currentDecision: null,
    binding: null,
    nextAction: "generate-package-look-master-candidates",
    userApprovalStatus: "LOOK_MASTER_REVIEW_NOT_READY",
    requiresExplicitApproval: false,
    intermediateApprovalRequired: false,
    legacyStatus: "ASSEMBLY_REVIEW_REQUIRED",
    legacyStatusReadOnly: true,
  };
  next.production.packagingAutomation = {
    ...(next.production.packagingAutomation || {}),
    contract: "A1PackagingAutomationState/v1",
    scope: "packaging-only-current",
    status: "PAUSED_WAITING_FOR_LOOK_MASTER_CANDIDATES",
    reason: "ed10-visual-replacement-generation-first",
    currentStage: "LOOK_MASTER_PLANS_READY",
    generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"},
    legacyGlobalPolicyStatus: "HISTORY_READ_ONLY",
    updatedAt: now,
  };

  const event = createProductionEvent({
    workspace: current,
    action: "ed10-look-master-visual-rejection-quarantined",
    targetId: "ED-10",
    payload: {oldAssemblySha256: oldAssembly?.sha256 || null, oldContextPreviewSha256: oldContextPreview?.sha256 || null, oldLayerCandidateIds: recipe.layerCandidateIds || {}, nextCandidateBudget: 4, generationFirst: true, generatedImages: false, criticPerformed: false, layerReconstructionStarted: false},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {"ed10-visual-rejection-history-v1.json": recalculated.production.shotIntelligence.legacyVisualRejection}});
  console.log(JSON.stringify({status: "PASS", workspaceSha256: recalculated.workspaceSha256, runtimeStatus: recalculated.production.shotIntelligence.status, planStatus: recalculated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10")?.status, candidateBudget: recalculated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10")?.candidateBudget, oldAssembly: recalculated.production.shotIntelligence.legacyVisualRejection.oldAssemblySha256, recommendationAllowed: recalculated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10")?.videoContext?.recommendationAllowed, queue: recalculated.production.generation.summary}, null, 2));
});
