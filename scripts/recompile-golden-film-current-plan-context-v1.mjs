#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildPackageLookMasterPlan, assertPackageLookMasterPlan} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildVideoPackagingContext, buildVideoPackagingContextSet, assertVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const GOLDEN_FILM_MODE_RECOMPILE_ACTION = "recompile-golden-film-current-plan-context-v1";
export const GOLDEN_FILM_MODE_RECOMPILE_CONTRACT = "A1GoldenFilmCurrentPlanContextRecompile/v1";
export const ED15_HOLD_FRAME_SHA256 = "ccb19f607bf6de09ad93f2bc2946381785c69f01ee621c16f1730892953d9d15";
export const ED15_VISIBLE_PHRASES = Object.freeze(["讨厌什么句式", "带到哪里"]);

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const reportRelativePath = "golden-film-visual-system-maturity-v1/mode-recompile.json";
const packageIds = (sequence) => sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const ED15_GEOMETRY = Object.freeze({
  contract: "A1RealHoldFrameGeometryEvidence/v1",
  sourceHoldFrameSha256: ED15_HOLD_FRAME_SHA256,
  sourceHoldFramePublicUrl: "/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-15-hold-frame.jpg",
  sourceDimensions: {width: 960, height: 540},
  normalizedCoordinateSpace: "x/y/width/height in [0,1]",
  measurementMethod: "ACTUAL_HOLD_FRAME_PIXEL_REVIEW",
  noTemplateDefaults: true,
  subjectBounds: {
    x: 0.33,
    y: 0.28,
    width: 0.41,
    height: 0.72,
    semanticRole: "presenter-face-and-central-body-silhouette",
    status: "DECLARED_FROM_ACTUAL_HOLD_FRAME_PIXEL_REVIEW",
  },
  protectedBounds: {
    face: {x: 0.46, y: 0.29, width: 0.20, height: 0.31, semanticRole: "presenter-face"},
    eyes: {x: 0.49, y: 0.42, width: 0.13, height: 0.07, semanticRole: "presenter-eyes"},
    mouth: {x: 0.53, y: 0.53, width: 0.07, height: 0.07, semanticRole: "presenter-mouth"},
    body: {x: 0.33, y: 0.54, width: 0.41, height: 0.46, semanticRole: "presenter-central-body"},
  },
  microphoneAndBoomExclusion: {
    microphone: {x: 0.02, y: 0.46, width: 0.25, height: 0.17, semanticRole: "microphone-head-and-grille"},
    boom: {x: 0.02, y: 0.51, width: 0.44, height: 0.25, semanticRole: "microphone-boom-and-arm"},
  },
  safeZones: [
    {id: "lower-third-caption-safe", x: 0.03, y: 0.84, width: 0.94, height: 0.12, semanticRole: "editor-owned-caption-and-subtitle-exclusion"},
  ],
  availableRegions: [
    {id: "top-left-presenter-negative-space", x: 0.04, y: 0.06, width: 0.29, height: 0.26, semanticRole: "actual-open-negative-space-for-presenter-aware-headline", evidence: "ACTUAL_HOLD_FRAME_PIXEL_REVIEW"},
  ],
  balanceNotes: [
    "Presenter occupies central/right field; top-left is the only sufficiently quiet title field.",
    "Microphone boom crosses left-middle and must remain visible; the title region stays above it.",
    "Right background is visually busier than the top-left field; do not route the headline there.",
  ],
});

function ed15VisualActorContract(sourceCopy) {
  return {
    contract: "A1PresenterAwareDualGapTypographyActor/v1",
    status: "PASS",
    decision: "KEEP_PRESENTER_AWARE_OVERLAY",
    lane: "OVERLAY",
    sourceCopyRequired: true,
    sourceCopy,
    visiblePhrases: [...ED15_VISIBLE_PHRASES],
    semanticRole: "DUAL_MISSING_CONSTRAINTS",
    semanticCompression: "Two short phrase actors preserve the two distinct gaps in the spoken sentence without pretending the full sentence fits the measured presenter negative space.",
    renderRule: "Render only visiblePhrases as the integrated typography actors; keep sourceCopy in the prompt and semantic contract, not as additional visible copy.",
    hierarchy: "CO_PRIMARY_TWO_ACTORS",
    fullFrameTakeoverLegal: false,
    laneCRequired: false,
    rationale: "The actual hold frame provides a small top-left negative-space field while the presenter, face, eyes, body, microphone and boom must remain visible; two short actors are readable in three seconds and preserve the presenter relationship.",
  };
}

function planDecision(oldPlan, canonical) {
  const distinctPresentation = canonical.assemblyMode !== canonical.presentationMode;
  const exactSourceText = canonical.sourceText || oldPlan.exactCopy?.text || oldPlan.sourceText || "";
  const protectedPhrases = canonical.shotId === "ED-15"
    ? [...ED15_VISIBLE_PHRASES]
    : (oldPlan.protectedPhrases?.length ? oldPlan.protectedPhrases : [exactSourceText]);
  const visualActorContract = canonical.shotId === "ED-15" ? ed15VisualActorContract(exactSourceText) : (oldPlan.typographyVisualContract || null);
  const typographyPolicy = canonical.shotId === "ED-15"
    ? {
        ...(oldPlan.typographyPolicy || {}),
        baseVisualCarrier: "PRESENTER_BASE",
        enhancementPackaging: "TYPE_OVERLAY",
        preferredPresentationMode: "OVERLAY",
        typographyVisualRole: "PRESENTER_HEADLINE",
        protectedPhrases,
        visualActorContract,
      }
    : oldPlan.typographyPolicy;
  return {
    ...oldPlan,
    packageDecision: "PACKAGE",
    sourceHash: oldPlan.shotSourceHash || oldPlan.sourceHash,
    sourceHashOfArticle: oldPlan.sourceHash,
    assemblyMode: canonical.assemblyMode,
    presentationMode: canonical.presentationMode,
    contentTreatment: canonical.contentTreatment,
    frameOccupation: canonical.frameOccupation,
    presenterPackagingMode: canonical.presenterPackagingMode || null,
    presenterPackagingRoute: canonical.presenterPackagingRoute ? structuredClone(canonical.presenterPackagingRoute) : null,
    rhythmRole: canonical.rhythmRole,
    aestheticFamily: canonical.aestheticFamily,
    baseVisualCarrier: canonical.baseVisualCarrier || (canonical.frameOccupation === "OVERLAY" ? "PRESENTER_BASE" : oldPlan.baseVisualCarrier || "NONE_OR_TAKEOVER"),
    strongLanguageEvent: canonical.strongLanguageEvent ?? (distinctPresentation ? false : oldPlan.strongLanguageEvent),
    sourceText: exactSourceText,
    protectedPhrases,
    typographyVisualContract: visualActorContract,
    typographyPolicy,
    typographyVisualRole: canonical.shotId === "ED-15" ? "PRESENTER_HEADLINE" : canonical.shotId === "ED-16" ? "HERO_TAKEOVER" : oldPlan.typographyVisualRole,
    assemblyModeReason: "DERIVED_FROM_CURRENT_CANONICAL_CREATOR_AXES",
    whyThisModeBeatsOtherModes: `Current canonical contentTreatment=${canonical.contentTreatment} and frameOccupation=${canonical.frameOccupation} require assemblyMode=${canonical.assemblyMode}.`,
    presentationModeReason: "DERIVED_FROM_CURRENT_CANONICAL_CREATOR_AXES",
    whyPresentationModeBeatsOtherModes: `Current canonical frameOccupation=${canonical.frameOccupation} requires presentationMode=${canonical.presentationMode}; distinct semantic/presentation modes are explicitly bound when needed.`,
    modeBinding: distinctPresentation ? {
      contract: "A1SemanticPresentationModeBinding/v1",
      status: "PASS",
      semanticMode: canonical.assemblyMode,
      presentationMode: canonical.presentationMode,
      relation: "SEMANTIC_STRUCTURE_WITH_DISTINCT_VIDEO_PRESENTATION",
      rationale: "Current canonical creator axes distinguish semantic assembly structure from video presentation; this binding is required and is not a stale fallback.",
    } : null,
    canonicalCreatorDecision: {
      contract: "A1CanonicalCreatorPackagingDecision/v1",
      shotId: canonical.shotId,
      packageDecision: canonical.packageDecision,
      contentTreatment: canonical.contentTreatment,
      frameOccupation: canonical.frameOccupation,
      rhythmRole: canonical.rhythmRole,
      aestheticFamily: canonical.aestheticFamily,
      assemblyMode: canonical.assemblyMode,
      presentationMode: canonical.presentationMode,
      presenterPackagingMode: canonical.presenterPackagingMode || null,
      presenterPackagingRoute: canonical.presenterPackagingRoute ? structuredClone(canonical.presenterPackagingRoute) : null,
      decisionSha256: canonical.decisionSha256,
      fullFramePolicy: structuredClone(canonical.fullFramePolicy || {status: "NOT_APPLICABLE", fallbackAllowed: false}),
    },
  };
}

function contextDecision(oldPlan, canonical) {
  const distinctPresentation = canonical.assemblyMode !== canonical.presentationMode;
  return {
    ...oldPlan,
    ...canonical,
    packageDecision: "PACKAGE",
    decisionHash: oldPlan.decisionHash,
    sourceHash: oldPlan.shotSourceHash || oldPlan.sourceHash,
    sourceHashOfArticle: oldPlan.sourceHash,
    beatId: oldPlan.beatId || canonical.shotId,
    sourceText: canonical.sourceText || oldPlan.exactCopy?.text || oldPlan.sourceText || "",
    ...(canonical.shotId === "ED-15" ? {
      protectedPhrases: [...ED15_VISIBLE_PHRASES],
      typographyVisualContract: ed15VisualActorContract(canonical.sourceText || oldPlan.exactCopy?.text || oldPlan.sourceText || ""),
      typographyPolicy: {
        ...(oldPlan.typographyPolicy || {}),
        baseVisualCarrier: "PRESENTER_BASE",
        enhancementPackaging: "TYPE_OVERLAY",
        preferredPresentationMode: "OVERLAY",
        typographyVisualRole: "PRESENTER_HEADLINE",
        protectedPhrases: [...ED15_VISIBLE_PHRASES],
      },
    } : {}),
    baseVisualCarrier: canonical.baseVisualCarrier || (canonical.frameOccupation === "OVERLAY" ? "PRESENTER_BASE" : oldPlan.baseVisualCarrier || "NONE_OR_TAKEOVER"),
    strongLanguageEvent: canonical.strongLanguageEvent ?? (distinctPresentation ? false : oldPlan.strongLanguageEvent),
    presenterPackagingMode: canonical.presenterPackagingMode || null,
    presenterPackagingRoute: canonical.presenterPackagingRoute ? structuredClone(canonical.presenterPackagingRoute) : null,
  };
}

function rebuiltContext(oldContext, oldPlan, canonical) {
  const isEd15 = canonical.shotId === "ED-15";
  const geometry = isEd15 ? ED15_GEOMETRY : null;
  const rebuilt = buildVideoPackagingContext({
    decision: contextDecision(oldPlan, canonical),
    demand: {editWindow: structuredClone(oldContext.timelineRange)},
    holdFrame: structuredClone(oldContext.baseFrame),
    subjectBounds: canonical.frameOccupation === "OVERLAY" ? structuredClone(geometry?.subjectBounds || oldContext.subjectBounds || null) : null,
    safeZones: canonical.frameOccupation === "OVERLAY" ? structuredClone(geometry?.safeZones || oldContext.safeZones || []) : [],
    visualAnchors: structuredClone(oldContext.visualAnchors || null),
    createdAt: oldContext.createdAt,
  });
  const routeBound = {
    ...rebuilt,
    contentTreatment: canonical.contentTreatment,
    frameOccupation: canonical.frameOccupation,
    presenterPackagingMode: canonical.presenterPackagingMode || null,
    presenterPackagingRoute: canonical.presenterPackagingRoute ? structuredClone(canonical.presenterPackagingRoute) : null,
  };
  delete routeBound.contextSha256;
  const routeIdentity = structuredClone(routeBound);
  delete routeIdentity.contextSha256;
  delete routeIdentity.createdAt;
  routeBound.contextSha256 = sha256(routeIdentity);
  if (!isEd15) return assertVideoPackagingContext(routeBound);
  // The generic context builder supplies derived regions.  For ED-15 the
  // actual frame review identified one named region; retain that measured
  // region as the only generation placement target and preserve all protected
  // geometry in a separate evidence record.
  const next = {
    ...routeBound,
    availableRegions: structuredClone(ED15_GEOMETRY.availableRegions),
    faceBounds: structuredClone(ED15_GEOMETRY.protectedBounds.face),
    eyesBounds: structuredClone(ED15_GEOMETRY.protectedBounds.eyes),
    mouthBounds: structuredClone(ED15_GEOMETRY.protectedBounds.mouth),
    microphoneExclusion: structuredClone(ED15_GEOMETRY.microphoneAndBoomExclusion),
    holdFrameGeometry: structuredClone(ED15_GEOMETRY),
    typographyVisualContract: ed15VisualActorContract(canonical.sourceText || oldPlan.exactCopy?.text || oldPlan.sourceText || ""),
  };
  delete next.contextSha256;
  const identity = structuredClone(next);
  delete identity.contextSha256;
  delete identity.createdAt;
  next.contextSha256 = sha256(identity);
  return assertVideoPackagingContext(next);
}

function preservePlanRuntimeFields(nextPlan, oldPlan, newPlanSha256) {
  const preservedKeys = [
    "status", "candidates", "recommendation", "selectedLookMasterId", "reviewDecision",
    "wholeFilmBoardRecommendation", "provisionalWholeFilmBoardSelection", "activeCandidateSet",
    "currentCandidateDirections", "currentCandidateBudget", "candidateDirectionAuthority",
    "legacyCandidateDirections", "supplementalCandidateDirections", "effectiveDirectionBudget",
    "portfolioPolicy", "candidateSource", "currentCandidateSource", "currentCandidateSet",
  ];
  for (const key of preservedKeys) {
    if (Object.prototype.hasOwnProperty.call(oldPlan, key)) nextPlan[key] = structuredClone(oldPlan[key]);
  }
  if (nextPlan.provisionalWholeFilmBoardSelection?.artifact?.sha256) {
    nextPlan.provisionalWholeFilmBoardSelection = {
      ...nextPlan.provisionalWholeFilmBoardSelection,
      planMetadataMigration: {
        contract: "A1LookMasterPlanMetadataMigration/v1",
        status: "PASS",
        fromPlanSha256: oldPlan.planSha256,
        toPlanSha256: newPlanSha256,
        actualArtifactSha256: nextPlan.provisionalWholeFilmBoardSelection.artifact.sha256,
        actualPixelAuditSha256: nextPlan.provisionalWholeFilmBoardSelection.actualPixelAuditSha256 || null,
        semanticPixelAuditSha256: nextPlan.provisionalWholeFilmBoardSelection.semanticPixelAuditSha256 || null,
        auditBytesUnchanged: true,
      },
    };
  }
  return nextPlan;
}

function currentInputSha(workspace, sequence, packageDecisions) {
  return sha256({
    contract: GOLDEN_FILM_MODE_RECOMPILE_CONTRACT,
    sequenceSha256: sequence.sequenceSha256,
    canonicalDecisions: packageDecisions.map((item) => ({shotId: item.shotId, decisionSha256: item.decisionSha256, sourceRevisionHash: item.sourceRevisionHash || null, sourceText: item.sourceText || null, assemblyMode: item.assemblyMode, presentationMode: item.presentationMode, frameOccupation: item.frameOccupation, presenterPackagingMode: item.presenterPackagingMode || null, presenterPackagingRoute: item.presenterPackagingRoute || null})),
    ed15HoldFrameSha256: workspace.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === "ED-15")?.baseFrame?.sha256 || null,
    ed15Geometry: ED15_GEOMETRY,
  });
}

function alreadyCurrent(workspace, inputSha256, packageDecisions) {
  const runtime = workspace.production.shotIntelligence || {};
  if (runtime.goldenFilmCurrentPlanContextRecompile?.inputSha256 !== inputSha256) return false;
  const contextManifestPath = path.join(publicDir, "video-packaging-context-v1/manifest.json");
  const contextManifest = fs.existsSync(contextManifestPath) ? readJson(contextManifestPath) : null;
  const currentContextSet = runtime.videoPackagingContexts || null;
  const expectedContextShotIds = packageDecisions.map((decision) => decision.shotId);
  if (!contextManifest || !currentContextSet || contextManifest.sha256 !== currentContextSet.sha256
    || JSON.stringify(contextManifest.items?.map((item) => item.shotId) || []) !== JSON.stringify(expectedContextShotIds)) return false;
  const plans = new Map((runtime.packageLookMasterPlans || []).map((item) => [item.shotId, item]));
  const contexts = new Map((runtime.videoPackagingContexts?.items || []).map((item) => [item.shotId, item]));
  return packageDecisions.every((decision) => {
    const plan = plans.get(decision.shotId);
    const context = contexts.get(decision.shotId);
    return plan?.assemblyMode === decision.assemblyMode
      && plan?.presentationMode === decision.presentationMode
      && plan?.frameOccupation === decision.frameOccupation
      && plan?.referencePackaging?.productionMethod === "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION"
      && plan?.referencePackaging?.contract === "A1UniversalReferenceToImagegenPackaging/v1"
      && plan?.contentTreatment === decision.contentTreatment
      && plan?.presenterPackagingMode === (decision.presenterPackagingMode || null)
      && JSON.stringify(plan?.presenterPackagingRoute || null) === JSON.stringify(decision.presenterPackagingRoute || null)
      && plan?.canonicalCreatorDecision?.frameOccupation === decision.frameOccupation
      && typeof plan?.exactCopy?.text === "string"
      && plan.exactCopy.text.length > 0
      && !plan.exactCopy.text.includes("undefined")
      && context?.assemblyMode === decision.assemblyMode
      && context?.presentationMode === decision.presentationMode
      && context?.frameOccupation === decision.frameOccupation
      && context?.presenterPackagingMode === (decision.presenterPackagingMode || null)
      && JSON.stringify(context?.presenterPackagingRoute || null) === JSON.stringify(decision.presenterPackagingRoute || null)
      && context?.contextSha256 === plan?.videoContext?.contextSha256
      && (decision.shotId !== "ED-15" || (
        JSON.stringify(plan?.protectedPhrases || []) === JSON.stringify(ED15_VISIBLE_PHRASES)
        && plan?.typographyVisualContract?.contract === "A1PresenterAwareDualGapTypographyActor/v1"
        && JSON.stringify(context?.protectedPhrases || []) === JSON.stringify(ED15_VISIBLE_PHRASES)
        && context?.typographyVisualContract?.contract === "A1PresenterAwareDualGapTypographyActor/v1"
      ))
      && (decision.shotId !== "ED-15" || (context.subjectBounds
        && context.faceBounds
        && context.eyesBounds
        && context.mouthBounds
        && context.microphoneExclusion
        && context.holdFrameGeometry?.sourceHoldFrameSha256 === ED15_HOLD_FRAME_SHA256
        && context.safeZones?.length
        && context.availableRegions?.length));
  });
}

export function runGoldenFilmCurrentPlanContextRecompile({now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const runtime = before.production.shotIntelligence || {};
    if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("golden-film-recompile-requires-frozen-idle-runtime");
    if ((runtime.currentAssembly || []).length || runtime.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("golden-film-recompile-requires-assembly-lock");
    const sequence = before.production.canonicalCreatorPackagingSequence;
    const canonicalDecisions = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE");
    if (!canonicalDecisions.length) throw new Error(`golden-film-recompile-package-count-invalid:${canonicalDecisions.length}`);
    const inputSha256 = currentInputSha(before, sequence, canonicalDecisions);
    if (alreadyCurrent(before, inputSha256, canonicalDecisions)) return {noop: true, workspace: before, inputSha256, changedShotIds: []};
    const referenceManifest = readJson(referenceManifestPath);
    const styles = before.production.packagingStyleBriefs || [];
    const currentPlans = new Map((runtime.packageLookMasterPlans || []).map((item) => [item.shotId, item]));
    const currentContexts = new Map((runtime.videoPackagingContexts?.items || []).map((item) => [item.shotId, item]));
    const nextPlans = [];
    const changedShotIds = [];
    for (const canonical of canonicalDecisions) {
      const oldPlan = currentPlans.get(canonical.shotId);
      const oldContext = currentContexts.get(canonical.shotId);
      const styleBrief = styles.find((item) => item.sourceBeatIds?.includes(canonical.shotId));
      if (!oldPlan || !oldContext || !styleBrief) throw new Error(`golden-film-recompile-input-missing:${canonical.shotId}`);
      const context = rebuiltContext(oldContext, oldPlan, canonical);
      const decision = planDecision(oldPlan, canonical);
      let nextPlan = buildPackageLookMasterPlan(decision, styleBrief, {
        now: oldPlan.createdAt || now,
        previousPlan: oldPlan,
        videoContext: context,
        semanticBrief: oldPlan.semanticDesignBrief,
        referenceManifest,
        researchPacket: runtime.researchPackets?.find((item) => item.shotId === canonical.shotId) || null,
        sourceEvidenceInputs: structuredClone(oldPlan.sourceEvidenceInputs || []),
      });
      nextPlan = preservePlanRuntimeFields(nextPlan, oldPlan, nextPlan.planSha256);
      assertPackageLookMasterPlan(nextPlan);
      if (oldPlan.planSha256 !== nextPlan.planSha256 || oldContext.contextSha256 !== context.contextSha256 || oldPlan.assemblyMode !== canonical.assemblyMode || oldPlan.presentationMode !== canonical.presentationMode || oldPlan.frameOccupation !== canonical.frameOccupation || oldPlan.presenterPackagingMode !== (canonical.presenterPackagingMode || null)) changedShotIds.push(canonical.shotId);
      nextPlans.push(nextPlan);
    }
    const packageIdSet = new Set(canonicalDecisions.map((item) => item.shotId));
    const retainedNonPackagePlans = (runtime.packageLookMasterPlans || []).filter((item) => !packageIdSet.has(item.shotId));
    const retainedNonPackageContexts = (runtime.videoPackagingContexts?.items || []).filter((item) => !packageIdSet.has(item.shotId));
    const nextContexts = canonicalDecisions.map((item) => rebuiltContext(currentContexts.get(item.shotId), currentPlans.get(item.shotId), item));
    const contextSet = buildVideoPackagingContextSet([...nextContexts, ...retainedNonPackageContexts], {createdAt: runtime.videoPackagingContexts.createdAt});
    const next = structuredClone(before);
    next.production.shotIntelligence.packageLookMasterPlans = [...nextPlans, ...retainedNonPackagePlans];
    next.production.shotIntelligence.videoPackagingContexts = contextSet;
    // Current raw records retain their immutable output/audit bytes, while
    // their current plan binding follows the newly compiled plan metadata.
    const planByShot = new Map(nextPlans.map((item) => [item.shotId, item]));
    next.production.shotIntelligence.lookMasterRawReferences = (runtime.lookMasterRawReferences || []).map((raw) => {
      if (raw.historyReadOnly === true || raw.current !== true) return raw;
      const plan = planByShot.get(raw.shotId);
      if (!plan || (raw.planSha256 !== currentPlans.get(raw.shotId)?.planSha256 && raw.lookMasterPlanSha256 !== currentPlans.get(raw.shotId)?.planSha256)) return raw;
      return {
        ...raw,
        planSha256: plan.planSha256,
        lookMasterPlanSha256: plan.planSha256,
        planMetadataMigration: {
          contract: "A1LookMasterPlanMetadataMigration/v1",
          status: "PASS",
          fromPlanSha256: currentPlans.get(raw.shotId)?.planSha256 || null,
          toPlanSha256: plan.planSha256,
          artifactSha256: raw.artifact?.sha256 || null,
          actualPixelAuditSha256: raw.pixelAudit?.auditSha256 || null,
          semanticPixelAuditSha256: raw.semanticPixelAudit?.auditSha256 || null,
          auditBytesUnchanged: true,
          provenanceJobUnchanged: true,
        },
      };
    });
    const runtimeHashInput = structuredClone(next.production.shotIntelligence);
    delete runtimeHashInput.sha256;
    next.production.shotIntelligence.sha256 = sha256(runtimeHashInput);
    next.production.shotIntelligence.goldenFilmCurrentPlanContextRecompile = {
      contract: GOLDEN_FILM_MODE_RECOMPILE_CONTRACT,
      status: "PASS",
      inputSha256,
      sequenceSha256: sequence.sequenceSha256,
      packageCount: canonicalDecisions.length,
      changedShotIds,
      planModeConflicts: 0,
      ed15Geometry: structuredClone(ED15_GEOMETRY),
      generatedAt: now,
    };
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {
      ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
    };
    const event = createProductionEvent({workspace: next, action: GOLDEN_FILM_MODE_RECOMPILE_ACTION, targetId: inputSha256, payload: {contract: GOLDEN_FILM_MODE_RECOMPILE_CONTRACT, packageCount: canonicalDecisions.length, changedShotIds, planModeConflicts: 0, imageGenerationPerformed: false, assemblyCreated: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const report = {
      contract: GOLDEN_FILM_MODE_RECOMPILE_CONTRACT,
      status: "PASS",
      inputSha256,
      workspaceSha256Before: before.workspaceSha256,
      workspaceSha256After: recalculated.workspaceSha256,
      sequenceSha256: sequence.sequenceSha256,
      packageCount: canonicalDecisions.length,
      changedShotIds,
      planModeConflicts: [],
      ed15Geometry: structuredClone(ED15_GEOMETRY),
      imageGenerationPerformed: false,
      assemblyCreated: false,
      generatedAt: now,
    };
    const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256, files: {
      [reportRelativePath]: report,
      "video-packaging-context-v1/manifest.json": recalculated.production.shotIntelligence.videoPackagingContexts,
    }});
    return {noop: false, workspace: committed, inputSha256, changedShotIds, report};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runGoldenFilmCurrentPlanContextRecompile();
  console.log(JSON.stringify({status: result.noop ? "NOOP_ALREADY_CURRENT" : "PASS", noop: result.noop, workspaceSha256: result.workspace.workspaceSha256, inputSha256: result.inputSha256, changedShotIds: result.changedShotIds, planModeConflicts: result.report?.planModeConflicts || []}, null, 2));
}
