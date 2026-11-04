#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {applySemanticTimelineToDecisionSet, deriveSemanticTimelineReconciliationScope} from "../apps/studio-next/src/lib/a1-semantic-timeline-decision-v1.mjs";
import {rehashShotSemanticDesignBrief} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {buildFusionGenerationPreflight, compileFusionAuthority} from "../apps/studio-next/src/lib/a1-crt-pixel-editorial-fusion-authority-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {buildCreatorPaletteBoundRepairTransition} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const overridesPath = path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("semantic-timeline-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const packagingTypeForMode = (mode) => mode === "OVERLAY" ? "OVERLAY_PACKAGE" : mode === "FULLSCREEN" ? "FULLSCREEN_PACKAGE" : mode === "TYPOGRAPHY" ? "TYPOGRAPHY_PACKAGE" : mode === "EXPLAINER" ? "EXPLAINER_PACKAGE" : "NO_PACKAGE";

function updatePackagingBeatPlan(plan, decisionSet, targetShotIds, now) {
  const decisionsByShot = new Map(decisionSet.items.map((item) => [item.shotId, item]));
  const items = (plan.semanticBeats || plan.items || []).map((item) => {
    const shotId = item.beatId || item.shotId;
    if (!targetShotIds.includes(shotId)) return item;
    const decision = decisionsByShot.get(shotId);
    if (!decision) throw new Error(`semantic-timeline-decision-missing:${shotId}`);
    const selected = decision.packageDecision === "PACKAGE";
    return {
      ...item,
      networkDecision: decision.networkDecision,
      networkReason: decision.networkReason,
      claimType: decision.claimType,
      searchIntents: decision.searchIntents,
      searchQueries: decision.searchQueries,
      packageDecision: decision.packageDecision,
      packageReason: decision.packageReason,
      assemblyMode: selected ? decision.assemblyMode : null,
      presentationMode: selected ? decision.presentationMode : null,
      presentationModeReason: selected ? decision.presentationModeReason : null,
      whyPresentationModeBeatsOtherModes: selected ? decision.whyPresentationModeBeatsOtherModes : null,
      assemblyModeReason: selected ? decision.assemblyModeReason : null,
      whyThisModeBeatsOtherModes: selected ? decision.whyThisModeBeatsOtherModes : null,
      decisionVersion: decision.decisionVersion,
      decisionHash: decision.decisionHash,
      itemType: selected ? packagingTypeForMode(decision.assemblyMode) : "NO_PACKAGE",
      packagingType: selected ? packagingTypeForMode(decision.assemblyMode) : "NO_PACKAGE",
      packagingEventId: selected ? item.packagingEventId || `packaging-event-${shotId}` : null,
      whyPackage: selected ? decision.packageReason : null,
      whyPackagingIsBetterThanNoPackage: selected ? decision.whyPackagingBeatsNoPackage : null,
      selectionStatus: selected ? "selected" : "incompatible-packaging",
      selectionReason: decision.packageReason,
      generationAllowed: selected,
      candidateEvaluation: {
        ...(item.candidateEvaluation || {}),
        candidate: selected,
        typeFit: selected ? decision.assemblyMode : "NO_PACKAGE",
        valueAdded: selected ? decision.valueAdded : 0,
        status: selected ? "selected" : "incompatible-packaging",
        downgradeReason: selected ? null : decision.packageReason,
      },
    };
  });
  const oldEvents = new Map((plan.packagingEvents || []).map((event) => [event.sourceBeatIds?.[0], event]));
  const packagingEvents = items.filter((item) => item.packageDecision === "PACKAGE").map((item) => ({
    ...(oldEvents.get(item.beatId || item.shotId) || {}),
    eventId: item.packagingEventId,
    sourceBeatIds: [item.beatId || item.shotId],
    packagingType: item.packagingType,
    semanticRole: item.semanticRole,
    sourceText: item.sourceText,
    assemblyMode: item.assemblyMode,
    presentationMode: item.presentationMode,
    generationAllowed: true,
  }));
  const withoutHash = {
    ...plan,
    generatedAt: now,
    semanticBeats: items,
    items,
    packagingEvents,
    packagingEventCount: packagingEvents.length,
    noPackageCount: items.length - packagingEvents.length,
    noPackageMajority: items.length - packagingEvents.length > items.length / 2,
    summary: {
      ...(plan.summary || {}),
      semanticBeatCount: items.length,
      packagingEventCount: packagingEvents.length,
      noPackageCount: items.length - packagingEvents.length,
      packagingTypes: packagingEvents.reduce((counts, event) => ({...counts, [event.packagingType]: (counts[event.packagingType] || 0) + 1}), {}),
    },
    sha256: undefined,
  };
  return {...withoutHash, sha256: sha256(withoutHash)};
}

function updateBriefSet(briefSet, decisionSet, targetShotIds, now) {
  const decisionsByShot = new Map(decisionSet.items.map((item) => [item.shotId, item]));
  const briefs = briefSet.briefs.map((brief) => {
    if (!targetShotIds.includes(brief.shotId)) return brief;
    const decision = decisionsByShot.get(brief.shotId);
    if (!decision) throw new Error(`semantic-timeline-brief-decision-missing:${brief.shotId}`);
    const selected = decision.packageDecision === "PACKAGE";
    const suppressed = decision.sequenceReview?.finalPackageDecision === "NO_PACKAGE" && Boolean(decision.sequenceReview?.packageSuppressedReason);
    return rehashShotSemanticDesignBrief({
      ...brief,
      decisionHash: decision.decisionHash,
      packageDecision: decision.packageDecision,
      presentation: {type: selected ? decision.presentationMode : null, reason: decision.packageReason},
      semanticTimeline: decision.sequenceReview,
      semanticTimelineHash: decision.sequenceReview?.rewriteSourceHash || null,
      rewriteSourceHash: decision.sequenceReview?.rewriteSourceHash || null,
      evidenceRoute: suppressed ? "PRESENTER" : brief.evidenceRoute,
      generatedAt: now,
    });
  });
  const routeMap = briefSet.routeMap.map((route) => targetShotIds.includes(route.shotId)
    ? {...route, packageDecision: decisionsByShot.get(route.shotId)?.packageDecision || route.packageDecision, evidenceRoute: decisionsByShot.get(route.shotId)?.sequenceReview?.packageSuppressedReason ? "PRESENTER" : route.evidenceRoute, presentationType: decisionsByShot.get(route.shotId)?.packageDecision === "PACKAGE" ? route.presentationType : decisionsByShot.get(route.shotId)?.sequenceReview?.packageSuppressedReason ? null : route.presentationType}
    : route);
  const next = {...briefSet, briefs, routeMap, generatedAt: now, briefSetSha256: undefined};
  next.briefSetSha256 = sha256({...next, briefSetSha256: undefined, generatedAt: undefined});
  return next;
}

function markHistory(record, reason) {
  return {...record, status: "HISTORY_READ_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY", recommendationEligible: false, supersededReason: reason};
}

function removeShotsFromVideoContextManifest(manifest, shotIds) {
  const items = (manifest.items || []).filter((item) => !shotIds.includes(item.shotId));
  const next = {
    ...manifest,
    items,
    summary: {
      ...(manifest.summary || {}),
      contextCount: items.length,
      holdFrameBoundCount: items.filter((item) => item.frameStatus === "HOLD_FRAME_BOUND").length,
      unverifiedCompatibilityCount: items.filter((item) => item.footageCompatibility === "UNVERIFIED").length,
      recommendationAllowedCount: items.filter((item) => item.recommendationAllowed === true).length,
    },
    sha256: undefined,
  };
  return {...next, sha256: sha256(next)};
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`semantic-timeline-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("semantic-timeline-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("semantic-timeline-must-not-touch-assembly");
  const plan = current.production.packagingBeatPlan;
  const beats = plan?.semanticBeats || [];
  if (beats.length !== current.article.shotCount) throw new Error("semantic-timeline-beat-count-mismatch");
  const runtime = current.production.shotIntelligence;
  const beforeArtifactShas = (runtime.lookMasterRawReferences || []).map((raw) => raw.artifact?.sha256).filter(Boolean).sort();
  const beforePlanIds = (runtime.packageLookMasterPlans || []).map((item) => item.shotId).sort();
  const now = new Date().toISOString();
  const timelineDecisionSet = applySemanticTimelineToDecisionSet(runtime.decisionSet, {beats, sourceHash: current.article.sourceTextSha256, now});
  const previousDecisionByShot = new Map(runtime.decisionSet.items.map((item) => [item.shotId, item]));
  const reconciliationScope = deriveSemanticTimelineReconciliationScope({previousDecisionSet: runtime.decisionSet, nextDecisionSet: timelineDecisionSet});
  const targetShotIds = reconciliationScope.targetShotIds;
  if (!targetShotIds.length) throw new Error("semantic-timeline-no-downstream-reconciliation-targets");
  const noPackageShotIds = timelineDecisionSet.items.filter((item) => targetShotIds.includes(item.shotId) && item.packageDecision === "NO_PACKAGE").map((item) => item.shotId);
  const suppressedShotIds = timelineDecisionSet.items.filter((item) => targetShotIds.includes(item.shotId) && item.packageDecision === "NO_PACKAGE" && Boolean(item.sequenceReview?.packageSuppressedReason)).map((item) => item.shotId);
  const packageDecisionBefore = Object.fromEntries(targetShotIds.map((shotId) => [shotId, previousDecisionByShot.get(shotId)?.packageDecision || null]));
  const next = structuredClone(current);
  next.production.creatorPackagingProjectOverrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
  next.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective.fusionAuthority = compileFusionAuthority(next.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective.fusionAuthority);
  next.production.shotIntelligence.decisionSet = timelineDecisionSet;
  const briefSet = updateBriefSet(next.production.shotIntelligence.semanticDesignBriefSet, timelineDecisionSet, targetShotIds, now);
  next.production.shotIntelligence.semanticDesignBriefSet = briefSet;
  next.production.shotIntelligence.semanticRouteMap = {
    ...next.production.shotIntelligence.semanticRouteMap,
    routeMap: briefSet.routeMap,
    routeMapSha256: briefSet.briefSetSha256,
    semanticTimelineHash: timelineDecisionSet.semanticTimelineHash,
    rewriteRevisionHash: timelineDecisionSet.sourceRevisionHash,
    generatedAt: now,
  };
  next.production.packagingBeatPlan = updatePackagingBeatPlan(plan, timelineDecisionSet, targetShotIds, now);

  const architecture = next.production.shotVisualCoveragePlan ? next.production.shotVisualCoveragePlan : null;
  void architecture;
  const retiredPlans = (runtime.packageLookMasterPlans || []).filter((item) => noPackageShotIds.includes(item.shotId)).map((item) => markHistory(item, "semantic-timeline-no-package"));
  next.production.shotIntelligence.packageLookMasterPlanHistory = [
    ...(runtime.packageLookMasterPlanHistory || []),
    ...retiredPlans.filter((item) => !(runtime.packageLookMasterPlanHistory || []).some((history) => history.planSha256 === item.planSha256)),
  ];
  next.production.shotIntelligence.packageLookMasterPlans = (runtime.packageLookMasterPlans || []).filter((item) => !noPackageShotIds.includes(item.shotId));
  next.production.shotIntelligence.lookMasterRawReferences = (runtime.lookMasterRawReferences || []).map((raw) => noPackageShotIds.includes(raw.shotId) ? markHistory(raw, "semantic-timeline-no-package") : raw);
  const retiredKits = (runtime.packageAssetKitPlans || []).filter((kit) => noPackageShotIds.includes(kit.shotId)).map((kit) => markHistory(kit, "semantic-timeline-no-package"));
  next.production.shotIntelligence.packageAssetKitPlanHistory = [
    ...(runtime.packageAssetKitPlanHistory || []),
    ...retiredKits.filter((item) => !(runtime.packageAssetKitPlanHistory || []).some((history) => history.planSha256 === item.planSha256)),
  ];
  next.production.shotIntelligence.packageAssetKitPlans = (runtime.packageAssetKitPlans || []).filter((kit) => !noPackageShotIds.includes(kit.shotId));
  const retiredRecipes = (runtime.packageAssemblyRecipes || []).filter((recipe) => noPackageShotIds.includes(recipe.shotId)).map((recipe) => markHistory(recipe, "semantic-timeline-no-package"));
  next.production.shotIntelligence.packageAssemblyRecipeHistory = [
    ...(runtime.packageAssemblyRecipeHistory || []),
    ...retiredRecipes.filter((item) => !(runtime.packageAssemblyRecipeHistory || []).some((history) => history.recipeSha256 === item.recipeSha256)),
  ];
  next.production.shotIntelligence.packageAssemblyRecipes = (runtime.packageAssemblyRecipes || []).filter((recipe) => !noPackageShotIds.includes(recipe.shotId));
  next.production.shotIntelligence.videoPackagingContextHistory = [
    ...(runtime.videoPackagingContextHistory || []),
    ...((runtime.videoPackagingContexts?.items || []).filter((item) => noPackageShotIds.includes(item.shotId))),
  ];
  if (runtime.videoPackagingContexts?.contract === "A1VideoPackagingContextSet/v1") {
    next.production.shotIntelligence.videoPackagingContexts = {
      ...runtime.videoPackagingContexts,
      items: runtime.videoPackagingContexts.items.filter((item) => !noPackageShotIds.includes(item.shotId)),
      summary: {...runtime.videoPackagingContexts.summary, contextCount: runtime.videoPackagingContexts.items.filter((item) => !noPackageShotIds.includes(item.shotId)).length},
    };
  }
  next.production.packagingStyleBriefs = (next.production.packagingStyleBriefs || []).map((brief) => brief.sourceBeatIds?.some((shotId) => noPackageShotIds.includes(shotId)) ? markHistory(brief, "semantic-timeline-no-package") : brief);

  const batch = next.production.shotIntelligence.wholeFilmBatchRecommendation || {};
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...batch,
    exceptions: (batch.exceptions || []).filter((item) => !noPackageShotIds.includes(item.shotId)),
    finalizedShotIds: (batch.finalizedShotIds || []).filter((shotId) => !noPackageShotIds.includes(shotId)),
    semanticReviewFindings: (batch.semanticReviewFindings || []).filter((item) => !noPackageShotIds.includes(item.shotId)),
    status: "PARTIAL_WITH_EXCEPTIONS",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    currentAssembly: [],
    recommendation: null,
    selected: null,
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    reconciliationRequired: false,
    reconciliationStatus: "SEMANTIC_TIMELINE_RECONCILED",
    reconciliation: {
      ...(batch.reconciliation || {}),
      contract: "A1SemanticTimelinePackageBoundaryReconciliation/v1",
      status: "PASS",
      targetShotIds,
      packageDecisionBefore,
      packageDecisionAfter: Object.fromEntries(targetShotIds.map((shotId) => [shotId, timelineDecisionSet.items.find((item) => item.shotId === shotId)?.packageDecision || null])),
      evidenceOwnerShotIds: Object.fromEntries(targetShotIds.map((shotId) => [shotId, timelineDecisionSet.items.find((item) => item.shotId === shotId)?.sequenceReview?.evidenceOwner?.shotIds || []])),
      generatedPngCount: 0,
      artifactSha256Changed: false,
      boardPublished: false,
      assemblyCreated: false,
      layerReconstructionStarted: false,
      criticPerformed: false,
      motionPerformed: false,
      completedAt: now,
    },
    updatedAt: now,
  };
  next.production.shotIntelligence.currentAssembly = [];
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.visualProductionRun = {...next.production.visualProductionRun, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false};

  next.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(next, {now});
  next.production.fusionGenerationPreflight = buildFusionGenerationPreflight(next);
  delete next.production.packagingTemporalReadabilityAuthority;
  let recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(recalculated, {now});
  recalculated = recalculateEditorialAssetWorkbench(recalculated, now);
  const paletteTransition = buildCreatorPaletteBoundRepairTransition(recalculated, {now});
  recalculated = paletteTransition.workspace;
  delete recalculated.production.packagingTemporalReadabilityAuthority;
  recalculated = recalculateEditorialAssetWorkbench(recalculated, now);
  recalculated.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(recalculated, {now});
  recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(recalculated, now));
  for (const shotId of suppressedShotIds) {
    const finalDecision = recalculated.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === shotId);
    const finalCoverage = recalculated.production.shotVisualCoveragePlan.shotPlans.find((item) => item.shotId === shotId);
    const finalBrief = recalculated.production.shotIntelligence.semanticDesignBriefSet.briefs.find((item) => item.shotId === shotId);
    assert.equal(finalDecision.packageDecision, "NO_PACKAGE");
    assert.equal(finalCoverage.route, "PRESENTER_BASE");
    assert.equal(finalCoverage.requiresLookMaster, false);
    assert.equal(finalBrief.packageDecision, "NO_PACKAGE");
    assert.equal(finalBrief.evidenceRoute, "PRESENTER");
    assert.equal(recalculated.production.shotIntelligence.packageLookMasterPlans.some((item) => item.shotId === shotId), false);
  }
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(recalculated.production.generation.summary.queued, 0);
  assert.equal(recalculated.production.generation.summary.running, 0);
  assert.equal(recalculated.production.generation.workerStatus, "frozen");
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.exceptions.some((item) => noPackageShotIds.includes(item.shotId)), false);
  const afterArtifactShas = (recalculated.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => raw.artifact?.sha256).filter(Boolean).sort();
  assert.deepEqual(afterArtifactShas, beforeArtifactShas);

  const event = createProductionEvent({
    workspace: current,
    action: "reconcile-semantic-timeline-package-boundaries",
    targetId: targetShotIds.join(","),
    payload: {
      contract: "A1SemanticTimelinePackageBoundaryReconciliation/v1",
      sourceRevisionHash: timelineDecisionSet.sourceRevisionHash,
      semanticTimelineHash: timelineDecisionSet.semanticTimelineHash,
      packageDecisionBefore,
      packageDecisionAfter: Object.fromEntries(targetShotIds.map((shotId) => [shotId, timelineDecisionSet.items.find((item) => item.shotId === shotId)?.packageDecision || null])),
      evidenceOwnerShotIds: Object.fromEntries(targetShotIds.map((shotId) => [shotId, timelineDecisionSet.items.find((item) => item.shotId === shotId)?.sequenceReview?.evidenceOwner?.shotIds || []])),
      affectedPackageCountBefore: beforePlanIds.length,
      affectedPackageCountAfter: recalculated.production.shotIntelligence.packageLookMasterPlans.length,
      generatedAssets: false,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      layerReconstructionStarted: false,
      criticPerformed: false,
      motionPerformed: false,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const commitId = `semantic-timeline-package-boundary-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const reportBase = {
    contract: "A1SemanticTimelinePackageBoundaryReconciliationReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    commitId,
    checkpointJournal: {status: "COMMITTED", journalPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/checkpoint-journal.json"},
    sourceRevisionHash: timelineDecisionSet.sourceRevisionHash,
    semanticTimelineHash: timelineDecisionSet.semanticTimelineHash,
    reconciliationScope,
    targetShotIds,
    evidenceOwnerShotIds: Object.fromEntries(targetShotIds.map((shotId) => [shotId, timelineDecisionSet.items.find((item) => item.shotId === shotId)?.sequenceReview?.evidenceOwner?.shotIds || []])),
    packageDecisionBefore,
    packageDecisionAfter: Object.fromEntries(targetShotIds.map((shotId) => [shotId, timelineDecisionSet.items.find((item) => item.shotId === shotId)?.packageDecision || null])),
    packageLookMasterPlanCountBefore: beforePlanIds.length,
    packageLookMasterPlanCountAfter: recalculated.production.shotIntelligence.packageLookMasterPlans.length,
    generatedPngCount: 0,
    artifactSha256Changed: false,
    artifactSha256Before: beforeArtifactShas,
    artifactSha256After: afterArtifactShas,
    assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length,
    assemblyCreationAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed,
    layerReconstructionAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.layerReconstructionAllowed,
    criticAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.criticAllowed,
    motionAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.motionAllowed,
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    authority: {currentStage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction},
    generatedAt: now,
  };
  const report = {...reportBase, reportSha256: sha256(reportBase)};
  const videoManifestPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/manifest.json");
  const videoManifest = removeShotsFromVideoContextManifest(JSON.parse(fs.readFileSync(videoManifestPath, "utf8")), noPackageShotIds);
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId,
    files: {
      "semantic-timeline-package-boundary-v1/reconciliation.json": report,
      "video-packaging-context-v1/manifest.json": videoManifest,
    },
  });
  return {...report, workspaceSha256After: committed.workspaceSha256, checkpointJournal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
