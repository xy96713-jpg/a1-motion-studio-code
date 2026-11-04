#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackageAssetKitPlan, assertPackageAssetKitPlan, buildPackageAssemblyRecipe, assertPackageAssemblyRecipe} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {assertPackageLookMasterPlan, buildPackageLookMasterPlan} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {auditRetroPixelStyleBriefs, compileRetroPixelEditorialStyleBrief, mergeRetroPixelDiversityHistory} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const shotId = "ED-34";
const eventId = "packaging-event-05";

const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const equalJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function legacyStyleBinding(brief, {lookPlan = null, kitPlan = null, recipe = null, supersededBy = null} = {}) {
  return {
    status: "HISTORY_READ_ONLY",
    current: false,
    shotId,
    eventId,
    styleBriefSha256: brief?.styleBriefSha256 || null,
    fingerprint: brief?.fingerprint || null,
    primaryFamily: brief?.variation?.primaryFamily || null,
    referenceIds: (brief?.sourceReferences || []).map((reference) => reference.id),
    referenceSha256: (brief?.sourceReferences || []).map((reference) => ({id: reference.id, sha256: reference.sourceSha256})),
    lookPlanSha256: lookPlan?.planSha256 || null,
    kitPlanSha256: kitPlan?.planSha256 || null,
    recipeSha256: recipe?.recipeSha256 || null,
    supersededByStyleBriefSha256: supersededBy,
    supersededReason: "ED-34 source-text-priority variant recompile; no candidates or visual adoption performed.",
    excludedFromCurrentCandidateSelection: true,
  };
}

function buildDecision(beat, oldLookPlan, oldKitPlan, oldRecipe) {
  const sourceHash = oldLookPlan?.exactCopy?.sourceHash || oldKitPlan?.copySpec?.sourceHash || beat.sourceHash;
  const sourceHashOfArticle = oldLookPlan?.sourceHash || oldKitPlan?.sourceHash;
  const decisionHash = beat.decisionHash || oldLookPlan?.decisionHash || oldKitPlan?.decisionHash;
  if (!sourceHash || !sourceHashOfArticle || !decisionHash) throw new Error("ed34-style-recompile-source-binding-missing");
  return {
    ...beat,
    shotId,
    beatId: shotId,
    packageDecision: "PACKAGE",
    sourceText: beat.sourceText || oldLookPlan?.exactCopy?.text || oldKitPlan?.copySpec?.exactPhrase,
    sourceHash,
    sourceHashOfArticle,
    decisionHash,
    assemblyMode: beat.assemblyMode || oldLookPlan?.assemblyMode || oldKitPlan?.assemblyMode,
    presentationMode: beat.presentationMode || oldLookPlan?.presentationMode || oldKitPlan?.presentationMode || oldRecipe?.presentationMode,
    presentationModeReason: beat.presentationModeReason || oldLookPlan?.presentationModeReason || oldKitPlan?.presentationModeReason || oldRecipe?.presentationModeReason,
    whyPresentationModeBeatsOtherModes: beat.whyPresentationModeBeatsOtherModes || oldLookPlan?.whyPresentationModeBeatsOtherModes || oldKitPlan?.whyPresentationModeBeatsOtherModes || oldRecipe?.whyPresentationModeBeatsOtherModes,
    semanticRole: beat.semanticRole || oldLookPlan?.semanticRole || oldKitPlan?.semanticRole,
    packageReason: beat.packageReason || oldKitPlan?.semanticJob,
    whyPackagingBeatsNoPackage: beat.whyPackagingBeatsNoPackage || beat.whyPackagingIsBetterThanNoPackage || beat.whyPackage,
  };
}

function replaceByShot(items, replacement) {
  const index = (items || []).findIndex((item) => item.shotId === shotId || item.eventId === eventId || item.sourceBeatIds?.includes(shotId));
  if (index < 0) throw new Error(`ed34-style-recompile-shot-not-found:${replacement?.contract || "item"}`);
  const next = [...items];
  next[index] = replacement;
  return next;
}

function updatePackagingBeatPlan(plan, styleBrief) {
  const update = (item) => item.beatId === shotId ? {...item, styleBriefSha256: styleBrief.styleBriefSha256} : item;
  const nextItems = (plan.items || []).map(update);
  const nextSemanticBeats = (plan.semanticBeats || []).map(update);
  const nextEvents = (plan.packagingEvents || []).map((event) => event.eventId === eventId ? {...event, styleBriefSha256: styleBrief.styleBriefSha256} : event);
  const withoutHash = {...plan, items: nextItems, semanticBeats: nextSemanticBeats, packagingEvents: nextEvents, sha256: undefined};
  return {...withoutHash, sha256: sha256(withoutHash)};
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const production = current.production;
  const runtime = production.shotIntelligence;
  const beat = production.packagingBeatPlan?.items?.find((item) => item.beatId === shotId);
  const event = production.packagingBeatPlan?.packagingEvents?.find((item) => item.eventId === eventId);
  const oldBrief = production.packagingStyleBriefs?.find((brief) => brief.eventId === eventId);
  const oldLookPlan = runtime.packageLookMasterPlans?.find((plan) => plan.shotId === shotId);
  const oldKitPlan = runtime.packageAssetKitPlans?.find((plan) => plan.shotId === shotId);
  const oldRecipe = runtime.packageAssemblyRecipes?.find((recipe) => recipe.shotId === shotId);
  if (!beat || !event || !oldBrief || !oldLookPlan || !oldKitPlan || !oldRecipe) throw new Error("ed34-style-recompile-current-binding-missing");
  const referenceManifest = JSON.parse(fs.readFileSync(referenceManifestPath, "utf8"));
  const videoContext = runtime.videoPackagingContexts?.items?.find((item) => item.shotId === shotId) || oldLookPlan.videoContext;
  if (!videoContext) throw new Error("ed34-style-recompile-video-context-missing");

  const now = new Date().toISOString();
  const decision = buildDecision(beat, oldLookPlan, oldKitPlan, oldRecipe);
  const nextBrief = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, now});
  if (nextBrief.derivation?.semanticActionId !== "author-preference-direction" || nextBrief.variation?.primaryFamily !== "icon-atlas-interface-language") {
    throw new Error("ed34-style-recompile-semantic-variant-not-selected");
  }

  const currentStyleBriefs = replaceByShot(production.packagingStyleBriefs, nextBrief);
  const approvedHistory = (production.retroPixelEditorialDiversityHistory?.entries || [])
    .filter((entry) => entry.visualStatus === "VISUAL_APPROVED" || entry.status === "VISUAL_APPROVED");
  const styleBriefAudit = auditRetroPixelStyleBriefs(currentStyleBriefs, {
    appRoot,
    recentHistory: approvedHistory,
    distinctEventIds: production.packagingBeatPlan?.anchorSampling?.selectedEventIds || [],
  });
  const diversityHistory = mergeRetroPixelDiversityHistory(approvedHistory, []);
  diversityHistory.proposedFingerprints = currentStyleBriefs.map((brief) => ({
    outputId: brief.outputId,
    contentSha256: brief.contentSha256,
    styleBriefSha256: brief.styleBriefSha256,
    fingerprint: brief.fingerprint,
    status: "READY_FOR_REVIEW",
  }));

  const legacyBinding = legacyStyleBinding(oldBrief, {lookPlan: oldLookPlan, kitPlan: oldKitPlan, recipe: oldRecipe, supersededBy: nextBrief.styleBriefSha256});
  const nextLookPlanBase = buildPackageLookMasterPlan(decision, nextBrief, {
    now,
    previousPlan: null,
    videoContext,
    referenceManifest,
    recentDirectionFingerprints: runtime.packageLookMasterPlans
      .filter((plan) => plan.shotId !== shotId && plan.status === "VISUAL_APPROVED")
      .flatMap((plan) => (plan.candidateDirections || []).map((direction) => direction.fingerprint)),
  });
  const nextLookPlan = {...nextLookPlanBase, legacyStyleBinding: legacyBinding};
  assertPackageLookMasterPlan(nextLookPlan);

  const researchPacket = runtime.researchPackets?.find((packet) => packet.shotId === shotId) || null;
  const nextKitBase = buildPackageAssetKitPlan(decision, {
    styleBriefSha256: nextBrief.styleBriefSha256,
    styleBriefBinding: nextBrief,
    referenceManifest,
    existingAssets: current.library.assets,
    researchPacket,
    videoContext,
    now,
  });
  const nextKitPlan = {...nextKitBase, legacyStyleBinding: legacyBinding};
  assertPackageAssetKitPlan(nextKitPlan);
  const nextRecipeBase = buildPackageAssemblyRecipe(nextKitPlan, {now});
  const nextRecipe = {...nextRecipeBase, legacyStyleBinding: legacyBinding};
  assertPackageAssemblyRecipe(nextKitPlan, nextRecipe);

  const existingHistory = production.packagingStyleBriefHistory || [];
  const nextHistory = existingHistory.some((entry) => entry.styleBriefSha256 === oldBrief.styleBriefSha256)
    ? existingHistory
    : [...existingHistory, {...oldBrief, history: legacyBinding}];

  const next = structuredClone(current);
  next.production.packagingBeatPlan = updatePackagingBeatPlan(production.packagingBeatPlan, nextBrief);
  next.production.packagingStyleBriefs = currentStyleBriefs;
  next.production.packagingStyleBriefHistory = nextHistory;
  next.production.packagingStyleBriefAudit = styleBriefAudit;
  next.production.retroPixelEditorialDiversityHistory = diversityHistory;
  next.production.shotIntelligence.packageLookMasterPlans = replaceByShot(runtime.packageLookMasterPlans, nextLookPlan);
  next.production.shotIntelligence.packageAssetKitPlans = replaceByShot(runtime.packageAssetKitPlans, nextKitPlan);
  next.production.shotIntelligence.packageAssemblyRecipes = replaceByShot(runtime.packageAssemblyRecipes, nextRecipe);
  next.production.shotIntelligence.styleBriefAudit = styleBriefAudit;

  const beforeEd10 = {
    look: runtime.packageLookMasterPlans.find((plan) => plan.shotId === "ED-10"),
    kit: runtime.packageAssetKitPlans.find((plan) => plan.shotId === "ED-10"),
    recipe: runtime.packageAssemblyRecipes.find((recipe) => recipe.shotId === "ED-10"),
  };
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const validated = assertEditorialAssetWorkbench(recalculated);
  const afterRuntime = validated.production.shotIntelligence;
  const afterEd10 = {
    look: afterRuntime.packageLookMasterPlans.find((plan) => plan.shotId === "ED-10"),
    kit: afterRuntime.packageAssetKitPlans.find((plan) => plan.shotId === "ED-10"),
    recipe: afterRuntime.packageAssemblyRecipes.find((recipe) => recipe.shotId === "ED-10"),
  };
  if (!equalJson(beforeEd10.look?.selectedLookMasterId, afterEd10.look?.selectedLookMasterId)
    || !equalJson(beforeEd10.look?.activeCandidateSet, afterEd10.look?.activeCandidateSet)
    || !equalJson(beforeEd10.kit?.selectedLookMasterBinding, afterEd10.kit?.selectedLookMasterBinding)
    || !equalJson(beforeEd10.recipe?.parityAudit, afterEd10.recipe?.parityAudit)
    || afterRuntime.status !== runtime.status) throw new Error("ed34-style-recompile-ed10-current-assembly-changed");
  const migratedLook = afterRuntime.packageLookMasterPlans.find((plan) => plan.shotId === shotId);
  const migratedKit = afterRuntime.packageAssetKitPlans.find((plan) => plan.shotId === shotId);
  const migratedRecipe = afterRuntime.packageAssemblyRecipes.find((recipe) => recipe.shotId === shotId);
  if (migratedLook.styleBriefSha256 !== nextBrief.styleBriefSha256
    || migratedKit.styleBriefSha256 !== nextBrief.styleBriefSha256
    || migratedRecipe.styleBriefSha256 !== nextBrief.styleBriefSha256
    || migratedLook.styleBinding?.fingerprint !== nextBrief.fingerprint
    || migratedKit.styleBinding?.fingerprint !== nextBrief.fingerprint
    || migratedRecipe.styleBinding?.fingerprint !== nextBrief.fingerprint
    || migratedLook.status !== "PLAN_READY"
    || migratedKit.status !== "WAITING_FOR_LOOK_MASTER"
    || migratedRecipe.status !== "WAITING_FOR_LOOK_MASTER"
    || migratedLook.candidates.length !== 0
    || migratedKit.layers.some((layer) => (layer.candidates || []).length > 0)) throw new Error("ed34-style-recompile-current-binding-invalid");

  const changed = oldBrief.styleBriefSha256 !== nextBrief.styleBriefSha256
    || oldLookPlan.styleBriefSha256 !== nextLookPlan.styleBriefSha256
    || oldKitPlan.styleBriefSha256 !== nextKitPlan.styleBriefSha256
    || oldRecipe.styleBriefSha256 !== nextRecipe.styleBriefSha256;
  if (!changed) return {status: "NOOP", workspaceSha256: current.workspaceSha256, styleBriefSha256: nextBrief.styleBriefSha256, fingerprint: nextBrief.fingerprint, generatedAssets: false};

  const productionEvent = createProductionEvent({
    workspace: current,
    action: "recompile-ed34-retro-pixel-style-brief",
    targetId: nextBrief.styleBriefSha256,
    payload: {
      contract: "A1ED34RetroPixelStyleVariantRecompile/v1",
      shotId,
      eventId,
      previousStyleBriefSha256: oldBrief.styleBriefSha256,
      styleBriefSha256: nextBrief.styleBriefSha256,
      previousFingerprint: oldBrief.fingerprint,
      fingerprint: nextBrief.fingerprint,
      previousLookPlanSha256: oldLookPlan.planSha256,
      lookPlanSha256: migratedLook.planSha256,
      previousKitPlanSha256: oldKitPlan.planSha256,
      kitPlanSha256: migratedKit.planSha256,
      previousRecipeSha256: oldRecipe.recipeSha256,
      recipeSha256: migratedRecipe.recipeSha256,
      generatedAssets: false,
      imagegenPerformed: false,
      candidatesCreated: false,
      oldBindingHistory: legacyBinding,
    },
    now,
  });
  validated.production.eventLedger.eventCount += 1;
  validated.production.eventLedger.lastEventId = productionEvent.eventId;
  validated.production.eventLedger.lastEventAt = productionEvent.createdAt;
  const report = {
    contract: "A1ED34RetroPixelStyleVariantRecompile/v1",
    status: "APPLIED",
    shotId,
    eventId,
    previousStyleBriefSha256: oldBrief.styleBriefSha256,
    styleBriefSha256: nextBrief.styleBriefSha256,
    previousFingerprint: oldBrief.fingerprint,
    fingerprint: nextBrief.fingerprint,
    primaryFamily: nextBrief.variation.primaryFamily,
    styleBriefAudit,
    referenceBinding: {
      selectedSubsetCount: nextLookPlan.referenceBindingAudit.selectedSubsetCount,
      manifestSourceCount: nextLookPlan.referenceBindingAudit.manifestSourceCount,
      selectedReferenceIds: nextLookPlan.referenceBindingAudit.selectedReferenceIds,
      referenceManifestSha256: nextLookPlan.referenceBindingAudit.referenceManifestSha256,
    },
    lookPlanSha256: migratedLook.planSha256,
    kitPlanSha256: migratedKit.planSha256,
    recipeSha256: migratedRecipe.recipeSha256,
    statusByArtifact: {lookPlan: migratedLook.status, kitPlan: migratedKit.status, recipe: migratedRecipe.status},
    legacyBinding,
    generatedAssets: false,
    imagegenPerformed: false,
    criticPerformed: false,
    renderPerformed: false,
    currentAssemblyUnchanged: true,
    appliedAt: now,
  };
  report.sha256 = sha256(report);
  persistProjectState(appRoot, validated, {event: productionEvent, files: {"ed34-retro-pixel-style-variant-recompile-v1/report.json": report}});
  return {status: report.status, workspaceSha256: validated.workspaceSha256, report};
});

console.log(JSON.stringify(result, null, 2));
