#!/usr/bin/env node
import crypto from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildPackageLayerCandidateCacheKey} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {buildOperatorImportedProvenance} from "../apps/studio-next/src/lib/a1-package-provenance-server-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = process.cwd() + "/apps/studio-next";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();

// This legacy reconciliation script used to unconditionally recreate the old
// two-layer Assembly review envelope.  A blocked four-layer trial is a
// terminal recovery state for this pass: it must not be silently converted
// back into an Assembly approval gate.  Keep the script safe for old callers
// by making it an explicit read-only no-op until the dedicated recovery flow
// reopens the trial.
const preflightWorkspace = readProjectWorkspace(appRoot);
const preflightRuntime = preflightWorkspace.production?.shotIntelligence;
const preflightRecipe = preflightRuntime?.packageAssemblyRecipes?.find((item) => item.shotId === "ED-10");
const preflightTrial = preflightRuntime?.ed10FourLayerTrial;
if (String(preflightTrial?.status || "").startsWith("BLOCKED_") && preflightRecipe?.status === "HISTORY_READ_ONLY") {
  console.log(JSON.stringify({
    status: "HISTORY_READ_ONLY",
    mutated: false,
    currentTrialStatus: preflightTrial.status,
    partialRawReferenceCount: preflightTrial.partialRawReferenceCount || 0,
    currentAssemblyStatus: preflightTrial.currentAssemblyPreserved ? "HISTORY_READ_ONLY" : "UNAVAILABLE",
    nextAction: preflightWorkspace.production?.authority?.nextAction || null,
    reason: "blocked-four-layer-trial-requires-dedicated-recovery; legacy-two-layer-reconcile-disabled",
    workspaceSha256: preflightWorkspace.workspaceSha256,
  }, null, 2));
  process.exit(0);
}

function reconcile(current) {
  const normalizedCurrent = structuredClone(current);
  const ed10DecisionOverride = {
    assemblyModeReason: "语言本身包含覆盖、改写或判定动作，文字的状态变化就是视觉事件。",
    whyThisModeBeatsOtherModes: "相较 OVERLAY/EXPLAINER，最后很容易变成一篇 “完成度很高的废稿”。的因果发生在字面状态，不需要虚构界面或额外流程图。",
    presentationMode: "OVERLAY",
    presentationModeReason: "文字是 TYPOGRAPHY 视觉 actor，但以透明 alpha overlay 与真实正片共存；不短暂接管整帧。",
    whyPresentationModeBeatsOtherModes: "相较 FULLSCREEN 接管或独立字卡，OVERLAY 保留正片主体与节奏，并让文字动作落在真实画面安全区。",
  };
  const hashDecision = (item) => {
    const copy = structuredClone(item);
    delete copy.decisionHash;
    return sha256(copy);
  };
  const hashContext = (context) => {
    const copy = structuredClone(context);
    delete copy.contextSha256;
    delete copy.createdAt;
    return sha256(copy);
  };
  const hashPlan = (plan) => {
    const copy = structuredClone(plan);
    delete copy.planSha256;
    delete copy.createdAt;
    return sha256(copy);
  };
  const hashLookPlan = (plan) => sha256({
    contract: plan.contract,
    version: plan.version,
    dataChainVersion: plan.dataChainVersion,
    shotId: plan.shotId,
    beatId: plan.beatId,
    eventId: plan.eventId,
    sourceHash: plan.sourceHash,
    decisionHash: plan.decisionHash,
    styleBriefSha256: plan.styleBriefSha256,
    semanticJob: plan.semanticJob,
    semanticRole: plan.semanticRole,
    assemblyMode: plan.assemblyMode,
    assemblyModeReason: plan.assemblyModeReason || null,
    whyThisModeBeatsOtherModes: plan.whyThisModeBeatsOtherModes || null,
    presentationMode: plan.presentationMode || plan.assemblyMode,
    presentationModeReason: plan.presentationModeReason || null,
    whyPresentationModeBeatsOtherModes: plan.whyPresentationModeBeatsOtherModes || null,
    exactCopy: plan.exactCopy,
    candidateBudget: plan.candidateBudget,
    candidateDirections: plan.candidateDirections,
    referenceBindingStatus: plan.referenceBindingStatus,
    referenceManifestSha256: plan.referenceManifestSha256,
    referenceInputs: plan.referenceInputs,
    generationCriteria: plan.generationCriteria,
    videoContext: plan.legacyVideoContextIdentity?.videoContext || plan.videoContext,
  });
  const hashCandidate = (candidate) => {
    const copy = structuredClone(candidate);
    delete copy.candidateSha256;
    return sha256(copy);
  };
  const hashRecipe = (recipe) => {
    const copy = structuredClone(recipe);
    delete copy.recipeSha256;
    return sha256(copy);
  };
  const operatorImportProvenance = (provenance, candidateId, artifactSha256) => buildOperatorImportedProvenance({provenance, candidateId, artifactSha256});
  const decisionSet = normalizedCurrent.production?.shotIntelligence?.decisionSet;
  for (const item of decisionSet?.items || []) {
    if (item.packageDecision === "PACKAGE") {
      item.presentationMode ||= item.assemblyMode === "TYPOGRAPHY" ? "OVERLAY" : item.assemblyMode;
      item.presentationModeReason ||= `当前正片插入方式为 ${item.presentationMode}。`;
      item.whyPresentationModeBeatsOtherModes ||= `当前语义选择 ${item.presentationMode} 以保持正片节奏。`;
    } else {
      item.presentationMode = null;
      item.presentationModeReason = null;
      item.whyPresentationModeBeatsOtherModes = null;
    }
    item.decisionHash = hashDecision(item);
  }
  if (decisionSet) {
    decisionSet.sha256 = undefined;
    decisionSet.sha256 = sha256(decisionSet);
  }
  const decision = decisionSet?.items?.find((item) => item.shotId === "ED-10");
  if (decision) {
    Object.assign(decision, ed10DecisionOverride, {presentationModeOverride: "OVERLAY"});
    decision.decisionHash = hashDecision(decision);
    decisionSet.sha256 = undefined;
    decisionSet.sha256 = sha256(decisionSet);
  }
  const beatPlan = normalizedCurrent.production?.packagingBeatPlan;
  const ed10Beat = beatPlan?.semanticBeats?.find((item) => item.beatId === "ED-10" || item.shotId === "ED-10");
  if (ed10Beat && decision) {
    Object.assign(ed10Beat, ed10DecisionOverride, {presentationModeOverride: "OVERLAY", decisionHash: decision.decisionHash});
  }
  const ed10Event = beatPlan?.packagingEvents?.find((event) => event.sourceBeatIds?.includes("ED-10"));
  if (ed10Event && decision) {
    Object.assign(ed10Event, ed10DecisionOverride, {presentationModeOverride: "OVERLAY", decisionHash: decision.decisionHash});
  }
  if (beatPlan && ed10Beat) {
    beatPlan.items = beatPlan.semanticBeats;
    beatPlan.summary ||= {};
    beatPlan.summary.packagingTypes = beatPlan.packagingEvents.reduce((counts, event) => ({...counts, [event.packagingType]: (counts[event.packagingType] || 0) + 1}), {});
    beatPlan.sha256 = undefined;
    beatPlan.sha256 = sha256(beatPlan);
  }
  const runtimeDraft = normalizedCurrent.production?.shotIntelligence;
  // Backfill the source-of-truth presentation/context fields for every
  // existing PACKAGE plan before the workbench assertion runs.  This is a
  // metadata migration only; it never queues or regenerates an asset.
  for (const kitPlan of runtimeDraft?.packageAssetKitPlans || []) {
    const sourceDecision = runtimeDraft.decisionSet?.items?.find((item) => item.shotId === kitPlan.shotId);
    const context = runtimeDraft.videoPackagingContexts?.items?.find((item) => item.shotId === kitPlan.shotId);
    if (!sourceDecision || !context) continue;
    kitPlan.assemblyMode = sourceDecision.assemblyMode;
    kitPlan.presentationMode = sourceDecision.presentationMode || sourceDecision.assemblyMode;
    kitPlan.presentationModeReason = sourceDecision.presentationModeReason || `当前正片插入方式为 ${kitPlan.presentationMode}。`;
    kitPlan.whyPresentationModeBeatsOtherModes = sourceDecision.whyPresentationModeBeatsOtherModes || `当前语义选择 ${kitPlan.presentationMode} 以保持正片节奏。`;
    kitPlan.assemblyModeReason = sourceDecision.assemblyModeReason;
    kitPlan.whyThisModeBeatsOtherModes = sourceDecision.whyThisModeBeatsOtherModes;
    kitPlan.videoContext = structuredClone(context);
    kitPlan.videoContext.presentationMode = kitPlan.presentationMode;
    kitPlan.videoContext.contextSha256 = hashContext(kitPlan.videoContext);
    kitPlan.videoContextSha256 = kitPlan.videoContext.contextSha256;
    const recipeForKit = runtimeDraft.packageAssemblyRecipes?.find((item) => item.shotId === kitPlan.shotId);
    if (recipeForKit) {
      recipeForKit.assemblyMode = kitPlan.assemblyMode;
      recipeForKit.presentationMode = kitPlan.presentationMode;
      recipeForKit.presentationModeReason = kitPlan.presentationModeReason;
      recipeForKit.whyPresentationModeBeatsOtherModes = kitPlan.whyPresentationModeBeatsOtherModes;
      recipeForKit.insertionMode = kitPlan.presentationMode;
      recipeForKit.assemblyModeReason = kitPlan.assemblyModeReason;
      recipeForKit.whyThisModeBeatsOtherModes = kitPlan.whyThisModeBeatsOtherModes;
      recipeForKit.videoContext = structuredClone(kitPlan.videoContext);
      recipeForKit.videoContextSha256 = kitPlan.videoContextSha256;
    }
  }
  for (const lookPlan of runtimeDraft?.packageLookMasterPlans || []) {
    const sourceDecision = runtimeDraft.decisionSet?.items?.find((item) => item.shotId === lookPlan.shotId);
    const context = runtimeDraft.videoPackagingContexts?.items?.find((item) => item.shotId === lookPlan.shotId);
    if (!sourceDecision || !context) continue;
    lookPlan.presentationMode = sourceDecision.presentationMode || sourceDecision.assemblyMode;
    lookPlan.assemblyModeReason = sourceDecision.assemblyModeReason || null;
    lookPlan.whyThisModeBeatsOtherModes = sourceDecision.whyThisModeBeatsOtherModes || null;
    lookPlan.presentationModeReason = sourceDecision.presentationModeReason || `当前正片插入方式为 ${lookPlan.presentationMode}。`;
    lookPlan.whyPresentationModeBeatsOtherModes = sourceDecision.whyPresentationModeBeatsOtherModes || `当前语义选择 ${lookPlan.presentationMode} 以保持正片节奏。`;
    lookPlan.videoContext = structuredClone(context);
    lookPlan.videoContext.presentationMode = lookPlan.presentationMode;
    lookPlan.videoContext.contextSha256 = hashContext(lookPlan.videoContext);
    Object.assign(context, structuredClone(lookPlan.videoContext));
    lookPlan.planSha256 = hashLookPlan(lookPlan);
  }
  const lookDraft = runtimeDraft?.packageLookMasterPlans?.find((item) => item.shotId === "ED-10");
  const kitDraft = runtimeDraft?.packageAssetKitPlans?.find((item) => item.shotId === "ED-10");
  const recipeDraft = runtimeDraft?.packageAssemblyRecipes?.find((item) => item.shotId === "ED-10");
  if (lookDraft && kitDraft && recipeDraft && decision) {
    const context = structuredClone(lookDraft.videoContext || kitDraft.videoContext);
    if (!context) throw new Error("ed10-video-context-missing-for-mode-reconciliation");
    Object.assign(context, {
      decisionHash: decision.decisionHash,
      assemblyMode: decision.assemblyMode,
      presentationMode: "OVERLAY",
      baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
      baseSubjectMustRemainVisible: true,
      frameTakeoverAllowed: false,
      safeZonePolicy: "ACTUAL_FRAME_OPEN_REGION_REQUIRED",
      footageCompatibility: "COMPATIBLE",
      recommendationAllowed: true,
      recommendationBlocker: null,
    });
    context.contextSha256 = hashContext(context);
    Object.assign(lookDraft, ed10DecisionOverride, {assemblyMode: decision.assemblyMode, decisionHash: decision.decisionHash, videoContext: context, videoContextSha256: context.contextSha256});
    lookDraft.videoContextReconciliation = {...(lookDraft.videoContextReconciliation || {}), footageCompatibility: "COMPATIBLE", recommendationAllowed: true, recommendationBlocker: null, contextSha256: context.contextSha256};
    Object.assign(kitDraft, ed10DecisionOverride, {assemblyMode: decision.assemblyMode, decisionHash: decision.decisionHash, videoContext: structuredClone(context), videoContextSha256: context.contextSha256, presentationMode: "OVERLAY", insertionMode: "OVERLAY"});
    kitDraft.status = kitDraft.status === "ASSEMBLY_REVIEW_REQUIRED" ? kitDraft.status : kitDraft.status;
    lookDraft.planSha256 = hashLookPlan(lookDraft);
    if (lookDraft.selectedLookMasterBinding) lookDraft.selectedLookMasterBinding.lookMasterPlanSha256 = lookDraft.planSha256;
    if (kitDraft.selectedLookMasterBinding) kitDraft.selectedLookMasterBinding.lookMasterPlanSha256 = lookDraft.planSha256;
    if (recipeDraft.selectedLookMasterBinding) recipeDraft.selectedLookMasterBinding.lookMasterPlanSha256 = lookDraft.planSha256;
    for (const layer of kitDraft.layers || []) {
      for (const candidate of layer.candidates || []) {
        candidate.planSha256 = undefined;
      }
    }
    // Rehash plan first, then rebind deterministic candidates to the new plan
    // identity without touching their actual files or pixel hashes.
    kitDraft.planSha256 = undefined;
    kitDraft.planSha256 = hashPlan(kitDraft);
    for (const layer of kitDraft.layers || []) {
      for (const candidate of layer.candidates || []) {
        candidate.planSha256 = kitDraft.planSha256;
        candidate.cache ||= {};
        candidate.cache.key = buildPackageLayerCandidateCacheKey({planSha256: kitDraft.planSha256, layerKind: layer.kind, route: layer.route, contentSha256: candidate.cache.contentSha256 || candidate.artifact?.sha256 || "", variantNonce: candidate.cache.variantNonce || null});
        candidate.candidateSha256 = undefined;
        candidate.candidateSha256 = hashCandidate(candidate);
      }
    }
    recipeDraft.planSha256 = kitDraft.planSha256;
    Object.assign(recipeDraft, ed10DecisionOverride, {assemblyMode: decision.assemblyMode, presentationMode: "OVERLAY", insertionMode: "OVERLAY", videoContext: structuredClone(context), videoContextSha256: context.contextSha256});
    recipeDraft.selectedLookMasterBinding = {...(recipeDraft.selectedLookMasterBinding || kitDraft.selectedLookMasterBinding), insertionMode: "OVERLAY"};
    const selectedBinding = kitDraft.selectedLookMasterBinding || lookDraft.selectedLookMasterBinding || recipeDraft.selectedLookMasterBinding;
    const selectedExploration = (lookDraft.explorationCandidates || []).find((candidate) => candidate.candidateId === selectedBinding?.candidateId || candidate.artifact?.sha256 === selectedBinding?.artifactSha256);
    const selectedRaw = (runtimeDraft.lookMasterRawReferences || []).find((raw) => raw.referenceId === selectedExploration?.rawReferenceId || raw.artifact?.sha256 === selectedBinding?.artifactSha256);
    const selectedProvenance = operatorImportProvenance(selectedExploration?.provenance || selectedRaw?.provenance, selectedBinding?.candidateId, selectedBinding?.artifactSha256);
    if (selectedProvenance) {
      const selectedBindingProvenance = {
        ...selectedProvenance,
        provenanceStatus: selectedProvenance.provenanceStatus || (selectedProvenance.generationId ? "COMPLETE" : "INCOMPLETE_REVIEW"),
      };
      for (const binding of [lookDraft.selectedLookMasterBinding, kitDraft.selectedLookMasterBinding, recipeDraft.selectedLookMasterBinding]) {
        if (!binding) continue;
        binding.generationJobContract = selectedBindingProvenance.generationJobContract || null;
        binding.generationJobId = selectedBindingProvenance.generationJobId || null;
        binding.generationInputHash = selectedBindingProvenance.generationInputHash || null;
        binding.provider = selectedBindingProvenance.provider || null;
        binding.generationId = selectedBindingProvenance.generationId || null;
        binding.importedSourceId = selectedBindingProvenance.importedSourceId || null;
        binding.provenanceStatus = selectedBindingProvenance.provenanceStatus;
        binding.provenance = selectedBindingProvenance;
      }
      for (const candidate of [
        ...(lookDraft.explorationCandidates || []),
        ...(lookDraft.fastCandidateDiscovery?.candidates || []),
        ...(runtimeDraft.lookMasterRawReferences || []),
      ]) {
        const candidateSha = candidate.artifact?.sha256 || candidate.artifactSha256 || null;
        if (candidate.candidateId === selectedBinding?.candidateId || candidateSha === selectedBinding?.artifactSha256) candidate.provenance = operatorImportProvenance(candidate.provenance, candidate.candidateId || selectedBinding?.candidateId, candidateSha || selectedBinding?.artifactSha256);
      }
    }
    // Provenance is part of the kit identity. Rehash after enriching the
    // selected binding so persisted kit/recipe hashes cannot drift from it.
    kitDraft.planSha256 = undefined;
    kitDraft.planSha256 = hashPlan(kitDraft);
    for (const layer of kitDraft.layers || []) {
      for (const candidate of layer.candidates || []) {
        candidate.planSha256 = kitDraft.planSha256;
        candidate.cache ||= {};
        candidate.cache.key = buildPackageLayerCandidateCacheKey({planSha256: kitDraft.planSha256, layerKind: layer.kind, route: layer.route, contentSha256: candidate.cache.contentSha256 || candidate.artifact?.sha256 || "", variantNonce: candidate.cache.variantNonce || null});
        candidate.candidateSha256 = undefined;
        candidate.candidateSha256 = hashCandidate(candidate);
      }
    }
    recipeDraft.planSha256 = kitDraft.planSha256;
    recipeDraft.buildKey = sha256({contract: "A1DeterministicPackageAssembly/v1", shotId: recipeDraft.shotId, planSha256: recipeDraft.planSha256, selectedLookMasterSha256: recipeDraft.selectedLookMasterBinding?.artifactSha256 || null, reconstructionSource: recipeDraft.reconstructionSource, layerCandidateIds: recipeDraft.layerCandidateIds, assemblyMode: recipeDraft.assemblyMode, assemblyModeReason: recipeDraft.assemblyModeReason, whyThisModeBeatsOtherModes: recipeDraft.whyThisModeBeatsOtherModes, videoContextSha256: recipeDraft.videoContextSha256, layerHashes: kitDraft.layers.flatMap((layer) => layer.candidates.filter((candidate) => candidate.status === "READY").map((candidate) => candidate.candidateSha256))});
    recipeDraft.recipeSha256 = undefined;
    recipeDraft.recipeSha256 = hashRecipe(recipeDraft);
    const contextSetItem = runtimeDraft.videoPackagingContexts?.items?.find((item) => item.shotId === "ED-10");
    if (contextSetItem) Object.assign(contextSetItem, structuredClone(context));
    if (runtimeDraft.videoPackagingContexts) {
      runtimeDraft.videoPackagingContexts.summary ||= {};
      runtimeDraft.videoPackagingContexts.sha256 = undefined;
      runtimeDraft.videoPackagingContexts.sha256 = sha256({contract: runtimeDraft.videoPackagingContexts.contract, version: runtimeDraft.videoPackagingContexts.version, status: runtimeDraft.videoPackagingContexts.status, items: runtimeDraft.videoPackagingContexts.items, summary: runtimeDraft.videoPackagingContexts.summary});
    }
  }
  for (const plan of normalizedCurrent.production?.shotIntelligence?.packageLookMasterPlans || []) {
    if (plan.shotId === "ED-10" && !plan.legacyVideoContextIdentity?.videoContext && plan.videoContext) {
      plan.legacyVideoContextIdentity = {
        contract: "A1LegacyVideoPackagingContextIdentity/v1",
        status: "HISTORY_READ_ONLY",
        reason: "preserve-original-look-master-plan-identity-after-final-parity-reconciliation",
        videoContext: structuredClone(plan.videoContext),
      };
    }
    delete plan.videoContext?.reconciliation;
    delete plan.videoContext?.legacyCompatibilityFields;
    delete plan.legacyVideoContextFields;
  }
  const workspace = structuredClone(assertEditorialAssetWorkbench(normalizedCurrent));
  const runtime = workspace.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (!plan || !kit || !recipe) throw new Error("ed10-authority-reconciliation-record-missing");
  const finalReview = recipe.finalAssemblyReview;
  if (finalReview?.status !== "PASS" || recipe.status !== "ASSEMBLY_REVIEW_REQUIRED") throw new Error("ed10-authority-reconciliation-requires-final-parity-pass");
  const selected = kit.selectedLookMasterBinding;
  if (!selected || selected.directionId !== "direction-05" || selected.artifactSha256 !== finalReview.masterSha256) throw new Error("ed10-authority-reconciliation-selected-master-invalid");
  if (recipe.selectedLookMasterBinding?.directionId !== selected.directionId || recipe.selectedLookMasterBinding?.artifactSha256 !== selected.artifactSha256) throw new Error("ed10-authority-reconciliation-recipe-binding-invalid");
  const boardCandidates = plan.comparativeReviewBoard?.candidates || [];
  const activeDirectionIds = ["direction-02", "direction-03", "direction-04", "direction-05"];
  if (boardCandidates.length !== 4 || new Set(boardCandidates.map((item) => item.directionId)).size !== 4 || !activeDirectionIds.every((id) => boardCandidates.some((item) => item.directionId === id))) throw new Error("ed10-authority-reconciliation-active-board-invalid");

  const previousPortfolioAudit = plan.portfolioAudit;
  const previousCandidates = plan.candidates || [];
  const activePortfolio = {
    contract: "A1LookMasterPortfolioAudit/v1",
    version: 1,
    serverGenerated: true,
    shotId: "ED-10",
    scope: "ACTIVE_COMPARATIVE_REVIEW_BOARD",
    planSha256: plan.planSha256,
    rawCandidateCount: 4,
    effectiveDirectionCount: 4,
    requiredEffectiveDirectionCount: 4,
    status: "PASS",
    candidateDispositions: boardCandidates.map((candidate) => ({
      directionId: candidate.directionId,
      artifactSha256: candidate.artifactSha256,
      family: candidate.family,
      status: "EFFECTIVE_DIRECTION",
      countsTowardEffectiveBudget: true,
      reason: "当前整组比较板的独立方向；每行包含原始母版与正片合成预览。",
    })),
    effectiveDirectionIds: activeDirectionIds,
    duplicateDirectionIds: [],
    recommendedDirectionId: "direction-05",
    selectedDirectionId: "direction-05",
    comparativeReviewSha256: plan.comparativeReview.reviewSha256,
    generatedAt: now,
  };
  activePortfolio.auditSha256 = sha256({...activePortfolio, auditSha256: undefined});
  plan.historicalPortfolioAudit = previousPortfolioAudit ? {
    ...previousPortfolioAudit,
    status: "HISTORY_READ_ONLY",
    advisoryOnly: true,
    currentReplacement: "activeComparativeReviewBoard",
    supersededAt: now,
  } : null;
  plan.portfolioAudit = activePortfolio;
  plan.legacyCandidates = previousCandidates.map((candidate) => ({
    ...candidate,
    status: "HISTORY_READ_ONLY",
    advisoryOnly: true,
    currentReplacement: "activeComparativeReviewBoard",
  }));
  plan.activeCandidateSet = {
    contract: "A1ActiveLookMasterCandidateSet/v1",
    status: "ACTIVE",
    source: "comparativeReviewBoard",
    candidateCount: 4,
    directionIds: activeDirectionIds,
    selectedDirectionId: "direction-05",
    selectedCandidateId: plan.recommendation?.candidateId,
    reviewSha256: plan.comparativeReview.reviewSha256,
    candidateIds: boardCandidates.map((candidate) => `exploration-ed-10-${candidate.directionId}-${String(candidate.artifactSha256).slice(0, 12)}`),
    candidates: boardCandidates.map((candidate) => ({
      directionId: candidate.directionId,
      artifactSha256: candidate.artifactSha256,
      candidatePublicUrl: candidate.candidatePublicUrl,
      compositePublicUrl: candidate.compositePublicUrl,
      family: candidate.family,
      status: candidate.directionId === "direction-05" ? "SELECTED" : "EXPLORATION_CANDIDATE",
    })),
    labels: {plan: "PLAN_ONLY", candidate: "EXPLORATION_CANDIDATE", selected: "SELECTED", layer: "ACTUAL_LAYER", assembly: "ASSEMBLY_REVIEW_REQUIRED"},
    updatedAt: now,
  };
  plan.currentCandidateSource = {contract: "A1CurrentPackageCandidateSource/v1", source: "activeCandidateSet", legacySelectorDisabled: true};

  const previousPlanStatus = plan.status;
  plan.status = "ASSEMBLY_REVIEW_REQUIRED";
  plan.currentStage = "ASSEMBLY_REVIEW_REQUIRED";
  plan.stateReconciliation = {
    contract: "A1PackageLookMasterStateReconciliation/v1",
    status: "CURRENT",
    previousStatus: previousPlanStatus,
    currentStatus: "ASSEMBLY_REVIEW_REQUIRED",
    selectedDirectionId: "direction-05",
    selectedMasterSha256: selected.artifactSha256,
    comparativeReviewSha256: plan.comparativeReview.reviewSha256,
    staleFieldsQuarantined: ["plan.status=RECONSTRUCTING", "videoContext.recommendationAllowed=false", "videoContext.recommendationBlocker=actual-look-master-composite-audit-required", "portfolioAudit=SUPPLEMENTAL_DIRECTIONS_REQUIRED", "plan.candidates=legacy-two-candidate-list"],
    reconciledAt: now,
  };
  plan.videoContextReconciliation = {
      contract: "A1VideoPackagingContextReconciliation/v1",
      status: "CURRENT",
      footageCompatibility: "COMPATIBLE",
      recommendationAllowed: true,
      recommendationBlocker: null,
      source: "FINAL_ASSEMBLY_PARITY_PASS",
      assemblySha256: finalReview.assemblySha256,
      assessmentSha256: finalReview.assessmentSha256,
      selectedMasterSha256: selected.artifactSha256,
      updatedAt: now,
  };
  plan.videoContext.footageCompatibility = "COMPATIBLE";
  plan.videoContext.recommendationAllowed = true;
  plan.videoContext.recommendationBlocker = null;
  const currentContextIdentity = structuredClone(plan.videoContext);
  delete currentContextIdentity.contextSha256;
  delete currentContextIdentity.createdAt;
  plan.videoContext.contextSha256 = sha256(currentContextIdentity);
  plan.videoContextReconciliation.contextSha256 = plan.videoContext.contextSha256;
  const context = runtime.videoPackagingContexts?.items?.find((item) => item.shotId === "ED-10");
  if (context) {
    context.footageCompatibility = plan.videoContext.footageCompatibility;
    context.recommendationAllowed = plan.videoContext.recommendationAllowed;
    context.recommendationBlocker = plan.videoContext.recommendationBlocker;
    context.contextSha256 = plan.videoContext.contextSha256;
    context.reconciliation = structuredClone(plan.videoContextReconciliation);
  }
  runtime.currentCandidateSource = {contract: "A1CurrentPackageCandidateSource/v1", status: "ACTIVE", shotIds: ["ED-10"], legacySelectorsDisabled: true};
  runtime.status = "ASSEMBLY_REVIEW_REQUIRED";
  if (workspace.production.packagingReview) {
    workspace.production.packagingReview.status = "ASSEMBLY_REVIEW_REQUIRED";
    workspace.production.packagingReview.intermediateApprovalRequired = false;
    workspace.production.packagingReview.requiresExplicitApproval = false;
    workspace.production.packagingReview.userApprovalStatus = "ONLY_FOR_RECOMMENDED_ASSEMBLY_OR_FINAL_RELEASE";
    workspace.production.packagingReview.nextAction = "review-recommended-package-assembly";
    workspace.production.packagingReview.authorityScope = "packaging-lane-current";
    workspace.production.packagingReview.advisoryOnly = false;
    workspace.production.packagingReview.legacyStatus = "LOOK_MASTER_CANDIDATES_READY";
    workspace.production.packagingReview.legacyStatusReadOnly = true;
  }
  runtime.updatedAt = now;
  delete runtime.sha256;
  runtime.sha256 = sha256(runtime);
  const recalculated = recalculateEditorialAssetWorkbench(workspace, now);
  assert.equal(recalculated.status, "PACKAGING_LANE_ASSEMBLY_REVIEW_REQUIRED");
  assert.equal(recalculated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10").status, "ASSEMBLY_REVIEW_REQUIRED");
  assert.equal(recalculated.production.authority.currentStage, "assembly-review-required");
  return recalculated;
}

const result = withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  const next = reconcile(current);
  if (next.production.generation.summary.queued !== 0 || next.production.generation.summary.running !== 0 || next.production.generation.workerStatus !== "frozen") throw new Error("ed10-authority-reconciliation-queue-not-frozen");
  const event = createProductionEvent({workspace: next, action: "reconcile-ed10-assembly-authority", targetId: "ED-10", payload: {selectedDirectionId: "direction-05", activeDirectionIds: ["direction-02", "direction-03", "direction-04", "direction-05"], finalAssemblyReview: "PASS", legacyPlanStatus: "RECONSTRUCTING"}});
  const kit = next.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const actualLayerCandidateCount = kit.layers.reduce((sum, layer) => sum + layer.candidates.filter((candidate) => candidate.status === "READY" && candidate.admission?.status === "PASS").length, 0);
  const noneLayerRouteCount = kit.layers.filter((layer) => layer.route === "NONE").length;
  const reportPath = path.join(appRoot, "public", "generated", "system-line", "editorial-asset-workbench-v1", "report.json");
  const previousReport = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : {};
  const report = {
    ...previousReport,
    contract: "A1EditorialAssetWorkbenchPackagingAuthorityReport/v1",
    authorityScope: "packaging-only-current",
    status: "PACKAGING_LANE_ASSEMBLY_REVIEW_REQUIRED",
    workspaceSha256: next.workspaceSha256,
    summary: {
      ...(previousReport.summary || {}),
      packagingLayerCandidateCount: actualLayerCandidateCount,
      actualLayerCandidateCount,
      noneLayerRouteCount,
      layerTrialScope: "SEMANTICALLY_CROPPED_TWO_LAYER_TRIAL",
      activeEffectiveDirectionCount: 4,
      lookMasterCandidateCount: 4,
    },
    packagingLaneSummary: {
      ...(previousReport.packagingLaneSummary || {}),
      status: "ASSEMBLY_REVIEW_REQUIRED",
      planStatus: "ASSEMBLY_REVIEW_REQUIRED",
      activeEffectiveDirectionCount: 4,
      masterDirectionCount: 4,
      actualLayerCandidateCount,
      noneLayerRouteCount,
      layerTrialScope: "按 direction-05 reconstructionMap 裁剪后的两层实际试点；不是四层各有多候选",
      selectedDirectionId: "direction-05",
      assemblyStatus: "ASSEMBLY_REVIEW_REQUIRED",
      selectedMasterProvenanceStatus: kit.selectedLookMasterBinding?.provenanceStatus || "INCOMPLETE_REVIEW",
      selectedMasterProvenanceMode: kit.selectedLookMasterBinding?.provenance?.operatorImported === true ? "OPERATOR_IMPORTED" : kit.selectedLookMasterBinding?.generationId ? "SYSTEM_GENERATED" : "UNVERIFIED",
      selectedMasterGenerationPath: kit.selectedLookMasterBinding?.provenance?.operatorImported === true ? "operator-imported-imagegen-master" : kit.selectedLookMasterBinding?.generationId ? "worker-imagegen-job" : "UNVERIFIED",
      selectedMasterProductionReady: Boolean(kit.selectedLookMasterBinding?.provenanceStatus === "COMPLETE" && kit.selectedLookMasterBinding?.traceabilityStatus === "COMPLETE" && kit.selectedLookMasterBinding?.generationId),
      selectedMasterImportedSourceId: kit.selectedLookMasterBinding?.importedSourceId || null,
    },
  };
  persistProjectState(appRoot, next, {event, files: {"report.json": report}});
  return next;
});
console.log(JSON.stringify({status: "PASS", workspaceSha256: result.workspaceSha256, rootStatus: result.status, runtimeStatus: result.production.shotIntelligence.status, authorityStage: result.production.authority.currentStage, activeDirectionCount: 4, selectedDirectionId: "direction-05", selectedMasterSha256: result.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10").selectedLookMasterBinding.artifactSha256}, null, 2));
