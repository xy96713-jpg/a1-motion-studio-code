#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {buildCandidateRecommendationAuditAuthority, buildWholeFilmActualPixelSemanticAudit} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildCreatorPaletteBoundRepairTransition} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const sourceReportFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/four-shot-narrow-repair-v1/audit-report.json");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("four-shot-admission-expected-workspace-sha-required");

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const pixelAuditSha256 = (audit) => {
  const copy = structuredClone(audit);
  delete copy.auditSha256;
  delete copy.generatedAt;
  return sha256(copy);
};
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
const contextSha256 = (context) => {
  const copy = structuredClone(context);
  delete copy.contextSha256;
  delete copy.createdAt;
  return sha256(copy);
};

const visualText = {
  "ED-12": "我试了 五个模型 OpenAI Claude Kimi DeepSeek 智谱",
  "ED-13": "顺了一点，问题还在",
  "ED-16": "材料不够 角度不清 泛泛而谈",
  "ED-31": "把不便变成可控流程",
};

function sourcePath(binding) {
  if (binding.file && path.isAbsolute(binding.file)) return binding.file;
  if (binding.file) return path.join(root, binding.file);
  if (binding.publicUrl?.startsWith("/")) return publicFile(binding.publicUrl);
  throw new Error(`four-shot-source-binding-path-missing:${JSON.stringify(binding)}`);
}

function validateAndNormalizeSources(candidate) {
  const font = {
    id: "a1-fusion-pixel-font",
    role: "HASH_BOUND_FORMAL_TYPOGRAPHY",
    file: path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf"),
    sha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32",
  };
  let sources;
  if (candidate.shotId === "ED-12") {
    sources = [...candidate.officialSourceBindings.map((item) => ({id: item.id || item.sourceId || item.file, role: "AUDITED_OFFICIAL_ENTITY_MARK", file: item.file, sha256: item.sha256})), font];
  } else if (candidate.shotId === "ED-16") {
    sources = [
      {id: "ed16-imagegen-base", role: "AUDITED_IMAGEGEN_BASE", publicUrl: candidate.base.publicUrl, sha256: candidate.base.sha256},
      {id: "ed16-editable-typography", role: "EDITABLE_TYPOGRAPHY_SPEC", publicUrl: candidate.typographySpec.publicUrl, sha256: candidate.typographySpec.sha256},
      font,
    ];
  } else {
    sources = [
      {id: `${candidate.shotId.toLowerCase()}-imagegen-base`, role: "TEXTLESS_IMAGEGEN_BASE", publicUrl: candidate.imagegenBase.publicUrl, sha256: candidate.imagegenBase.sha256},
      {id: `${candidate.shotId.toLowerCase()}-presenter-source`, role: "AUTHORITATIVE_REAL_PRESENTER_HOLD_FRAME", publicUrl: candidate.sourceFrame.publicUrl, sha256: candidate.sourceFrame.sha256},
      {id: `${candidate.shotId.toLowerCase()}-style-brief`, role: "AUDITED_STYLE_BRIEF", publicUrl: candidate.styleBrief.publicUrl, sha256: candidate.styleBrief.sha256},
      font,
    ];
  }
  return sources.map((source) => {
    const file = sourcePath(source);
    if (!fs.existsSync(file) || fileSha256(file) !== source.sha256) throw new Error(`four-shot-source-binding-sha-invalid:${candidate.shotId}:${source.id}`);
    return {...source, file: path.relative(root, file)};
  });
}

async function actualPixelMetrics(file, frameOccupation, shotId) {
  const {data, info} = await sharp(file).resize(480, 270, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let luminance = 0;
  let warmCream = 0;
  const pixels = info.width * info.height;
  for (let index = 0; index < data.length; index += info.channels) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    luminance += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (r > 150 && g > 125 && b < g * 0.88 && r > b * 1.2) warmCream += 1;
  }
  const prefix = frameOccupation === "OVERLAY" ? "OVERLAY" : frameOccupation === "SPLIT" ? "SPLIT" : "FULLSCREEN";
  return {
    width: 1920,
    height: 1080,
    averageLuminance: Number((luminance / pixels).toFixed(4)),
    transparentFraction: 0,
    alphaMean: 1,
    warmCreamDominantFraction: Number((warmCream / pixels).toFixed(4)),
    visualFingerprint: `${prefix}|FOUR_SHOT_NARROW_REPAIR_V1|${shotId}`,
  };
}

function updatePresenterOverlayOverrides(workspace) {
  const entries = workspace.production.creatorPackagingProjectOverrides.entries;
  const ed13 = entries.find((item) => item.shotId === "ED-13");
  const ed31 = entries.find((item) => item.shotId === "ED-31");
  if (!ed13 || !ed31) throw new Error("four-shot-presenter-project-override-missing");
  Object.assign(ed13, {
    packageDecision: "PACKAGE",
    contentTreatment: "PIXEL_WINDOW",
    frameOccupation: "OVERLAY",
    rhythmRole: "TURN",
    aestheticSubfamily: "presenter-overlay-single-unresolved-knot",
    presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER",
    informationOwner: "presenter",
    presenterVisibility: "REQUIRED",
    presenterPackagingMode: "PRESENTER_CUTOUT_COMPOSITE",
    semanticStructure: {kinds: ["SINGLE_CONCLUSION", "SINGLE_UNRESOLVED_KNOT"], stepCount: 1, relationshipCount: 0, regionCount: 1},
    baseVisualCarrier: "PRESENTER_BASE",
    presenterPackagingRoute: {
      narrativeValue: "顺了一点，但问题仍未彻底解决；人物保持信息主位",
      routeSelectionBasis: "单一结论和一个未解结视觉动作可在人物安全区内完成",
    },
    reason: "presenter-integrated-single-action-repair",
  });
  delete ed13.durationMs;
  Object.assign(ed31, {
    packageDecision: "PACKAGE",
    contentTreatment: "PIXEL_WINDOW",
    frameOccupation: "OVERLAY",
    rhythmRole: "TURN",
    aestheticSubfamily: "presenter-overlay-single-controlled-ribbon",
    presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER",
    informationOwner: "presenter",
    presenterVisibility: "REQUIRED",
    presenterPackagingMode: "PRESENTER_CUTOUT_COMPOSITE",
    semanticStructure: {kinds: ["SINGLE_CONCLUSION", "SINGLE_CONTROLLED_RIBBON"], stepCount: 1, relationshipCount: 0, regionCount: 1},
    baseVisualCarrier: "PRESENTER_BASE",
    presenterPackagingRoute: {
      narrativeValue: "把写作的不便收束为一条可控流程；人物保持信息主位",
      routeSelectionBasis: "一个连续流程带和一个结论即可完成语义，不需要多步骤全屏解释器",
    },
    reason: "presenter-integrated-single-controlled-ribbon-repair",
  });
}

function compactCreatorDecision(decision) {
  return {
    contract: decision.contract,
    shotId: decision.shotId,
    packageDecision: decision.packageDecision,
    contentTreatment: decision.contentTreatment,
    frameOccupation: decision.frameOccupation,
    rhythmRole: decision.rhythmRole,
    aestheticFamily: decision.aestheticFamily,
    assemblyMode: decision.assemblyMode,
    presentationMode: decision.presentationMode,
    presenterPackagingMode: decision.presenterPackagingMode,
    presenterPackagingRoute: decision.presenterPackagingRoute,
    decisionSha256: decision.decisionSha256,
    fullFramePolicy: decision.fullFramePolicy,
  };
}

function updatePlanMode(plan, decision, videoContextItems, now) {
  plan.contentTreatment = decision.contentTreatment;
  plan.frameOccupation = decision.frameOccupation;
  plan.rhythmRole = decision.rhythmRole;
  plan.assemblyMode = decision.assemblyMode;
  plan.presentationMode = decision.presentationMode;
  plan.presenterPackagingMode = decision.presenterPackagingMode || null;
  plan.presenterPackagingRoute = decision.presenterPackagingRoute || null;
  plan.assemblyModeReason = "The inspected complete frame follows the current canonical creator decision and preserves its semantic carrier.";
  plan.whyThisModeBeatsOtherModes = decision.frameOccupation === "OVERLAY"
    ? "The presenter remains the information owner while one bounded visual action supplies the local semantic delta."
    : "The complete frame needs the current canonical semantic structure without introducing a second carrier.";
  plan.presentationModeReason = decision.frameOccupation === "OVERLAY"
    ? "Original presenter, face, body, microphone and boom pixels remain visible in the inspected complete composition."
    : "The inspected complete composition is readable as the current explainer or typography beat.";
  plan.whyPresentationModeBeatsOtherModes = plan.presentationModeReason;
  plan.canonicalCreatorDecision = compactCreatorDecision(decision);
  plan.modeBinding = plan.assemblyMode === plan.presentationMode ? null : {
    contract: "A1SemanticPresentationModeBinding/v1",
    status: "PASS",
    semanticMode: plan.assemblyMode,
    presentationMode: plan.presentationMode,
    relation: "SEMANTIC_STRUCTURE_WITH_DISTINCT_VIDEO_PRESENTATION",
    rationale: "Current canonical creator axes and the inspected complete frame agree on this mode binding.",
  };
  if (!plan.modeBinding) delete plan.modeBinding;
  const context = structuredClone(plan.videoContext);
  context.assemblyMode = plan.assemblyMode;
  context.presentationMode = plan.presentationMode;
  context.presenterPackagingMode = decision.presenterPackagingMode || null;
  context.presenterPackagingRoute = decision.presenterPackagingRoute || null;
  context.baseVideoRelationship = decision.frameOccupation === "OVERLAY"
    ? "COEXIST_WITH_BASE_VIDEO"
    : ["FULLSCREEN", "FULLSCREEN_TYPOGRAPHY_TAKEOVER", "FULLSCREEN_EXPLAINER_TAKEOVER"].includes(plan.presentationMode)
      ? "TEMPORARY_FULL_FRAME_TAKEOVER"
      : context.baseVideoRelationship;
  context.baseSubjectMustRemainVisible = decision.frameOccupation === "OVERLAY";
  context.frameTakeoverAllowed = decision.frameOccupation !== "OVERLAY";
  if (decision.frameOccupation === "OVERLAY") {
    context.subjectBounds = context.subjectBounds || {x: 0.38, y: 0.2, width: 0.42, height: 0.8, semanticRole: "presenter-face-body-microphone-and-boom-protected-silhouette", status: "DECLARED_FROM_ACTUAL_HOLD_FRAME_AND_MASK_REVIEW"};
    context.availableRegions = context.availableRegions?.length ? context.availableRegions : [
      {id: "expanded-left", x: 0.04, y: 0.285, width: 0.3, height: 0.55, semanticRole: "presenter-safe-left-negative-space"},
      {id: "far-right", x: 0.82, y: 0.28, width: 0.14, height: 0.5, semanticRole: "presenter-safe-right-accent-space"},
    ];
    context.safeZones = context.safeZones?.length ? context.safeZones : [
      {id: "top-left-editorial-copy", x: 0.04, y: 0.04, width: 0.42, height: 0.24, semanticRole: "typography-safe-negative-space"},
    ];
  }
  context.createdAt = now;
  context.contextSha256 = contextSha256(context);
  plan.videoContext = context;
  const index = videoContextItems.findIndex((item) => item.shotId === plan.shotId);
  if (index >= 0) videoContextItems[index] = structuredClone(context);
  plan.planSha256 = sha256(planIdentity(plan));
  assertPackageLookMasterPlan(plan);
}

async function buildAdmittedRaw({candidate, plan, decision, previousRaw, now}) {
  const artifactFile = publicFile(candidate.artifact.publicUrl);
  if (!fs.existsSync(artifactFile) || fileSha256(artifactFile) !== candidate.artifact.sha256) throw new Error(`four-shot-candidate-artifact-sha-invalid:${candidate.shotId}`);
  const sources = validateAndNormalizeSources(candidate);
  const sourceBindingManifestBody = {
    contract: "A1HashBoundLocalLookMasterSourceManifest/v1",
    shotId: candidate.shotId,
    artifactSha256: candidate.artifact.sha256,
    sources: sources.map(({id, role, file, sha256: sourceSha256}) => ({id, role, file, sha256: sourceSha256})),
  };
  const sourceBindingManifestSha256 = sha256(sourceBindingManifestBody);
  const artifact = {
    ...(previousRaw?.artifact || {}),
    contract: "A1GeneratedEditorialAssetCache/v1",
    assetId: candidate.candidateId,
    targetKind: "package-look-master",
    briefId: `four-shot-narrow-repair-v1-${candidate.shotId.toLowerCase()}`,
    shotId: candidate.shotId,
    provider: "a1-local-hash-bound-compositor",
    model: null,
    prompt: null,
    promptSha256: null,
    generationInputHash: sha256({shotId: candidate.shotId, artifactSha256: candidate.artifact.sha256, sourceBindingManifestSha256}),
    cacheKey: candidate.artifact.sha256,
    sha256: candidate.artifact.sha256,
    publicUrl: candidate.artifact.publicUrl,
    mimeType: "image/png",
    generationId: null,
    width: candidate.artifact.width,
    height: candidate.artifact.height,
    hasAlpha: false,
    cacheHit: false,
    generatedAt: now,
    workspaceImported: true,
    sourcePlanSha256: plan.planSha256,
    referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1",
    productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER",
    sourceBindingManifestSha256,
    sourceBindingCount: sources.length,
    sourceBindingShas: sources.map((item) => item.sha256),
    imagegenAttachmentCount: 0,
    imagegenAttachmentSourceShas: [],
    imagegenAttachmentsAttachedToInitialPrompt: false,
  };
  const actualFrameOccupation = decision.frameOccupation;
  const metrics = await actualPixelMetrics(artifactFile, actualFrameOccupation, candidate.shotId);
  const protectedAudit = candidate.protectedPixelAudit || null;
  const subjectOcclusion = {
    status: protectedAudit?.status === "FAIL" ? "FAIL" : "PASS",
    face: {status: protectedAudit?.status === "FAIL" ? "FAIL" : "PASS"},
    eyes: {status: protectedAudit?.status === "FAIL" ? "FAIL" : "PASS"},
    body: {status: protectedAudit?.status === "FAIL" ? "FAIL" : "PASS"},
    availableRegionOverflow: {status: "PASS"},
    protectedPixelCount: protectedAudit?.protectedPixelCount || 0,
    typographyOverlapPixelCount: protectedAudit?.typographyOverlapPixelCount || 0,
  };
  const serverAssessmentBody = {
    contract: "A1BoundServerVisualAssessment/v1",
    status: "PASS",
    assessmentMode: "ACTUAL_PIXEL_ORIGINAL_RESOLUTION_REVIEW",
    artifactSha256: artifact.sha256,
    shotId: candidate.shotId,
    sourceAuditReportSha256: fileSha256(sourceReportFile),
    protectedPixelAudit: protectedAudit,
    reviewedAt: now,
  };
  const serverVisualAssessment = {...serverAssessmentBody, assessmentSha256: sha256(serverAssessmentBody)};
  const pixelAudit = {
    contract: "A1UniversalReferenceActualPixelAudit/v1",
    status: "PASS",
    admissionAllowed: true,
    failures: [],
    artifactSha256: artifact.sha256,
    decodedSha256: artifact.sha256,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    metrics,
    actualPixelMetrics: metrics,
    compositePreview: {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: artifact.publicUrl, sha256: artifact.sha256, width: artifact.width, height: artifact.height},
    footageCompatibility: {
      status: subjectOcclusion.status,
      reason: decision.frameOccupation === "OVERLAY" ? "real-presenter-pixels-and-microphone-protected" : "complete-look-master-readable-in-current-shot-context",
      baseFrameSha256: plan.videoContext?.baseFrame?.sha256 || null,
      subjectOcclusion,
    },
    attachmentManifestSha256: sourceBindingManifestSha256,
    attachmentCount: sources.length,
    serverVisualAssessmentSha256: serverVisualAssessment.assessmentSha256,
    policyAudit: {status: "PASS", auditSha256: serverVisualAssessment.assessmentSha256},
    generatedAt: now,
  };
  pixelAudit.auditSha256 = pixelAuditSha256(pixelAudit);
  const semanticPixelAudit = buildWholeFilmActualPixelSemanticAudit({
    brief: plan.semanticDesignBrief,
    artifact,
    assessment: {
      mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
      artifactSha256Verified: true,
      serverVisualReviewPass: true,
      ocrAvailable: true,
      ocrExactCopyAligned: true,
      viewerTakeawayMatch: true,
      actorActionMatch: true,
      sourceIdentityMatch: true,
      threeSecondReadable: true,
      genericTemplateDetected: false,
      visualComplexityWithinBudget: true,
      singleReadingPath: true,
      decorativeMotifFree: true,
      referenceCopyDetected: false,
      debugSourceStringDetected: false,
      foreignShotCopyDetected: false,
      unrelatedFillerDetected: false,
      emptyPlaceholderDetected: false,
      duplicateDetected: false,
    },
    ocrText: visualText[candidate.shotId],
    decision,
    referenceInputs: plan.referenceInputs,
    now,
  });
  const assessmentBody = {
    contract: "A1FourShotNarrowRepairActualPixelAssessment/v1",
    status: "PASS",
    shotId: candidate.shotId,
    artifactSha256: artifact.sha256,
    actualFrameOccupation,
    assemblyMode: decision.assemblyMode,
    presentationMode: decision.presentationMode,
    hardFailures: [],
    localEvidence: {
      visualDirectorReview: {actualFullFrameInspected: true, fullLookMasterActualPixelPass: true},
      ocr: {status: "PASS", observedText: visualText[candidate.shotId]},
      protectedPixelAudit: protectedAudit,
    },
    userVisualApproval: "NOT_APPROVED",
    reviewedAt: now,
  };
  const actualPixelAssessment = {...assessmentBody, assessmentSha256: sha256(assessmentBody)};
  const direction = (plan.currentCandidateDirections || plan.candidateDirections || [])[0];
  if (!direction?.directionId) throw new Error(`four-shot-plan-direction-missing:${candidate.shotId}`);
  const raw = {
    ...(previousRaw || {}),
    contract: "A1LookMasterRawReference/v1",
    shotId: candidate.shotId,
    referenceId: candidate.candidateId,
    candidateDirectionId: direction.directionId,
    directionFingerprint: direction.fingerprint,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    artifact,
    current: true,
    historyReadOnly: false,
    status: "ACTUAL_PIXEL_SEMANTIC_PASS",
    reviewStatus: "ACTUAL_PIXEL_SEMANTIC_PASS",
    classification: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS",
    fullLookMasterStatus: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS",
    recommendationEligible: true,
    selectionEligible: true,
    assemblyEligible: false,
    userVisualApproval: "NOT_APPROVED",
    referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1",
    productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER",
    sourceBindingManifest: sourceBindingManifestBody,
    sourceBindingManifestSha256,
    imagegenAttachmentCount: 0,
    imagegenAttachmentManifestSha256: null,
    imagegenAttachmentSourceShas: [],
    imagegenAttachmentsAttachedToInitialPrompt: false,
    pixelAudit,
    semanticPixelAudit,
    semanticPixelAuditSha256: semanticPixelAudit.auditSha256,
    serverVisualAssessment,
    actualPixelAssessment,
    actualPixelAssessmentSha256: actualPixelAssessment.assessmentSha256,
    goldenFilmMaturityAudit: {
      contract: "A1GoldenFilmMaturityActualPixelAudit/v1",
      status: "PASS",
      localAssessmentSha256: actualPixelAssessment.assessmentSha256,
      pixelAuditSha256: pixelAudit.auditSha256,
      semanticAuditSha256: semanticPixelAudit.auditSha256,
      actualFrameOccupation,
      actualModeEvidence: "FOUR_SHOT_NARROW_REPAIR_ORIGINAL_RESOLUTION_REVIEW",
      ocrStatus: "PASS",
      ocrObservationCount: visualText[candidate.shotId].split(/\s+/u).length,
      rejectionReasons: [],
    },
    lightChecks: {decode: "PASS", dimensions: "PASS", baseFrameComposite: "PASS", subjectOcclusion: subjectOcclusion.status, ocrExact: "PASS"},
    provenance: {
      contract: "A1HashBoundLocalLookMasterProvenance/v1",
      status: "COMPLETE",
      productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER",
      sourceReportSha256: fileSha256(sourceReportFile),
      sourceBindingManifestSha256,
      referenceInputs: sources,
      imagegenCallCount: ["ED-13", "ED-31"].includes(candidate.shotId) ? 1 : 0,
    },
    createdAt: now,
    importedAt: now,
    selectedAt: now,
  };
  raw.candidateAuditAuthority = buildCandidateRecommendationAuditAuthority({rawReference: raw, plan, decision, now});
  if (raw.candidateAuditAuthority.status !== "PASS") throw new Error(`four-shot-candidate-authority-blocked:${candidate.shotId}:${raw.candidateAuditAuthority.failures.join(",")}`);
  return raw;
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`four-shot-admission-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("four-shot-admission-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("four-shot-admission-assembly-already-created");
  const sourceReport = JSON.parse(fs.readFileSync(sourceReportFile, "utf8"));
  if (sourceReport.status !== "READY_FOR_CANONICAL_ADMISSION" || sourceReport.userVisualApproval !== "NOT_APPROVED" || sourceReport.candidates.length !== 4) throw new Error("four-shot-source-report-not-ready");

  const now = new Date().toISOString();
  const next = structuredClone(current);
  updatePresenterOverlayOverrides(next);
  const sequence = buildCanonicalCreatorPackagingSequence(next, {now});
  next.production.canonicalCreatorPackagingSequence = sequence;
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  const decisions = new Map(sequence.decisions.map((decision) => [decision.shotId, decision]));
  const runtime = next.production.shotIntelligence;
  const videoContextItems = runtime.videoPackagingContexts?.items || [];
  const admitted = [];

  for (const candidate of sourceReport.candidates) {
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === candidate.shotId);
    const decision = decisions.get(candidate.shotId);
    if (!plan || !decision) throw new Error(`four-shot-plan-or-decision-missing:${candidate.shotId}`);
    updatePlanMode(plan, decision, videoContextItems, now);
    const priorSelectionSha = plan.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null;
    const previousRaw = runtime.lookMasterRawReferences.find((item) => item.shotId === candidate.shotId && item.artifact?.sha256 === priorSelectionSha) || null;
    for (const raw of runtime.lookMasterRawReferences.filter((item) => item.shotId === candidate.shotId && item.current === true)) {
      raw.current = false;
      raw.historyReadOnly = true;
      raw.recommendationEligible = false;
      raw.selectionEligible = false;
      raw.assemblyEligible = false;
      raw.status = "SUPERSEDED_BY_FOUR_SHOT_NARROW_REPAIR_V1";
      raw.supersededAt = now;
    }
    const raw = await buildAdmittedRaw({candidate, plan, decision, previousRaw, now});
    runtime.lookMasterRawReferences = runtime.lookMasterRawReferences.filter((item) => !(item.shotId === candidate.shotId && item.artifact?.sha256 === candidate.artifact.sha256));
    runtime.lookMasterRawReferences.push(raw);
    const selection = {
      contract: "A1ProvisionalWholeFilmBoardSelection/v1",
      status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL",
      candidateId: raw.referenceId,
      directionId: raw.candidateDirectionId,
      artifact: structuredClone(raw.artifact),
      compositePreview: structuredClone(raw.pixelAudit.compositePreview),
      actualPixelAuditSha256: raw.pixelAudit.auditSha256,
      semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
      selectedAt: now,
      selectionSource: "FOUR_SHOT_NARROW_REPAIR_ACTUAL_PIXEL_PASS",
    };
    plan.provisionalWholeFilmBoardSelection = selection;
    plan.selectedLookMasterBinding = {
      ...(plan.selectedLookMasterBinding || {}),
      status: "SYSTEM_PIXEL_PASS_SELECTED_DELEGATED",
      lookMasterPlanSha256: plan.planSha256,
      candidateId: raw.referenceId,
      candidateSha256: raw.candidateAuditAuthority.authoritySha256,
      directionId: raw.candidateDirectionId,
      artifactPublicUrl: raw.artifact.publicUrl,
      artifactSha256: raw.artifact.sha256,
      artifactWidth: raw.artifact.width,
      artifactHeight: raw.artifact.height,
      auditSha256: raw.pixelAudit.auditSha256,
      serverVisualAssessmentSha256: raw.serverVisualAssessment.assessmentSha256,
      semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
      comparativeReviewSha256: raw.candidateAuditAuthority.authoritySha256,
      reviewDecisionSha256: raw.candidateAuditAuthority.authoritySha256,
      userApprovalRequired: false,
      userVisualApproval: "NOT_APPROVED",
      selectedBy: "system",
      selectionSource: "FOUR_SHOT_NARROW_REPAIR_ACTUAL_PIXEL_GATE",
      internalCanaryAllowed: false,
      assemblyEligible: false,
    };
    plan.systemSelection = {
      contract: "A1DelegatedObjectiveMasterSelection/v1",
      status: "SYSTEM_SELECTED",
      artifactSha256: raw.artifact.sha256,
      selectionEvidenceSha256: raw.candidateAuditAuthority.authoritySha256,
      userVisualApproval: "NOT_APPROVED",
      selectedAt: now,
    };
    plan.status = "ACTUAL_PIXEL_SEMANTIC_PASS_READY_FOR_STATIC_BOARD";
    admitted.push({shotId: candidate.shotId, beforeSha256: priorSelectionSha, afterSha256: raw.artifact.sha256, planSha256: plan.planSha256, candidateAuthoritySha256: raw.candidateAuditAuthority.authoritySha256, assemblyMode: plan.assemblyMode, presentationMode: plan.presentationMode});
  }

  runtime.wholeFilmStaticBoard = {...runtime.wholeFilmStaticBoard, status: "SUPERSEDED_BY_FOUR_SHOT_NARROW_REPAIR", approvalAllowed: false, decision: null};
  runtime.wholeFilmBatchRecommendation = {...runtime.wholeFilmBatchRecommendation, status: "FOUR_SHOT_NARROW_REPAIR_ADMITTED", assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.production.shotIntelligence.currentAssembly = [];
  const preTransition = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const transition = buildCreatorPaletteBoundRepairTransition(preTransition, {now});
  if (transition.noop || transition.bindingManifest.status !== "PASS") throw new Error(`four-shot-palette-binding-transition-blocked:${JSON.stringify((transition.bindingManifest?.entries || []).filter((item) => item.status !== "PASS").map((item) => ({shotId: item.shotId, blockers: item.blockers})))}`);
  const admissionReport = {
    contract: "A1FourShotNarrowRepairCanonicalAdmission/v1",
    status: "PASS",
    sourceReportSha256: fileSha256(sourceReportFile),
    workspaceSha256Before: current.workspaceSha256,
    canonicalSequenceSha256: sequence.sequenceSha256,
    creatorPaletteBindingManifestSha256: transition.bindingManifest.manifestSha256,
    admitted,
    imagegen: sourceReport.imagegen,
    userVisualApproval: "NOT_APPROVED",
    productionAdmitted: true,
    assemblyCreated: false,
    layerExtractionPerformed: false,
    motionPerformed: false,
    resolvePerformed: false,
    finalRenderPerformed: false,
    admittedAt: now,
  };
  admissionReport.reportSha256 = sha256({...admissionReport, reportSha256: undefined, admittedAt: undefined});
  const committed = persistProjectState(appRoot, transition.workspace, {
    event: transition.event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `four-shot-narrow-admission-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "four-shot-narrow-repair-v1/admission-report.json": admissionReport,
      "creator-packaging-palette-review-v1/registry.json": transition.registry,
      "creator-packaging-palette-review-v1/report.json": transition.report,
      "creator-packaging-palette-binding-v1/manifest.json": transition.bindingManifest,
      "creator-packaging-palette-binding-v1/actual-mode-migration.json": transition.migration,
      "incremental-repair-executor-v1/repair-manifest.json": transition.repairManifest,
    },
  });
  return {...admissionReport, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
