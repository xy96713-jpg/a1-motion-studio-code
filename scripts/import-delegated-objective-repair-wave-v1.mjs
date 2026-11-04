#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {buildUniversalReferenceAttachmentManifest, assertUniversalReferenceAttachmentManifest, A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, UNIVERSAL_REFERENCE_PRODUCTION_METHOD} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const outputRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const waveRelativePath = "golden-film-visual-system-maturity-v1/delegated-objective-repair-wave-v1/repair-manifest.json";
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.resolve(publicRoot, String(url).replace(/^\//u, ""));

const presentationDecisions = {
  "ED-08": {
    contract: "A1IndependentPresentationDecision/v1",
    mode: "FULLSCREEN_TYPOGRAPHY_TAKEOVER",
    informationOwner: "typography",
    presenterVisibility: "FORBIDDEN",
    referenceInputsDoNotInferPresenter: true,
    decisionBeforePrompt: true,
    decisionSource: "EXPLICIT_PROJECT_AND_SEMANTIC_AUTHORITY",
  },
  "ED-14": {
    contract: "A1IndependentPresentationDecision/v1",
    mode: "SOURCE_EVIDENCE_TAKEOVER",
    informationOwner: "source",
    presenterVisibility: "FORBIDDEN",
    referenceInputsDoNotInferPresenter: true,
    decisionBeforePrompt: true,
    decisionSource: "EXPLICIT_PROJECT_AND_SEMANTIC_AUTHORITY",
  },
};

const referenceDefinitions = {
  "ED-08": [
    {
      id: "ed-08-real-hold-frame-style-rhythm",
      sourcePath: path.join(outputRoot, "imported-film-media-v1/presenter-shot-frames/ED-08.jpg"),
      sourceSha256: "fff18cc6849d2ec038ea658500d818119093667c0b859c870703ed207ee4fe43",
      sourceType: "REAL_HOLD_FRAME",
      semanticRole: "reference-only-color-rhythm-transition-no-presenter-output",
      transformPolicy: "STYLE_REFERENCE_ONLY",
    },
  ],
  "ED-14": [
    {
      id: "ed-14-real-paper-evidence-window",
      sourcePath: path.join(publicRoot, "generated/system-line/web-source-packaging-pilot-v1/sources/acl-2026-acl-long-1803-title-abstract.png"),
      sourceSha256: "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46",
      sourceType: "RESEARCH_EVIDENCE",
      semanticRole: "real-official-paper-title-author-abstract-evidence-window",
      transformPolicy: "EVIDENCE_WINDOW",
    },
    {
      id: "ed-14-real-hold-frame-style-rhythm",
      sourcePath: path.join(outputRoot, "video-packaging-context-v1/ed-14-hold-frame.jpg"),
      sourceSha256: "fb5cb39ae42a080a21e7c01de1ff8729624ce56229bb7b9e65c6d06e3be937c1",
      sourceType: "REAL_HOLD_FRAME",
      semanticRole: "reference-only-color-rhythm-transition-no-presenter-output",
      transformPolicy: "STYLE_REFERENCE_ONLY",
    },
  ],
};

const candidateDefinitions = {
  "ED-08": {
    outputRelativePath: "generated/system-line/editorial-asset-workbench-v1/look-master-wave-v2/ED-08/look-master-wave-v2-ed-08-fullscreen-c1.png",
    prompt: "Create a finished 16:9 editorial video Look Master for a FULLSCREEN_TYPOGRAPHY_TAKEOVER. The only readable copy is exactly “AI 常常不说人话”. Make the title the sole information owner and the sole primary reading path. Do not show a presenter, human figure, face, body, microphone, or any restored video subject. Use the attached ED-08 real hold frame only for cool color, rhythm, transition timing, and negative-space memory; it must not be copied into the output and must not cause presenter visibility. Use cool white, charcoal, black, and controlled cobalt blue. Use one sparse semantic language-distortion action behind the title, with no pseudo-text, no malformed Chinese strings, no character streams, no numbers, no UI labels, no source labels, no filler, no logo, no card wall, no checkerboard, no warm cream field, and no extra readable words. ImageGen must deliver the complete integrated Look Master before any later layer extraction.",
    directionFingerprint: "fullscreen-typography-takeover|single-readable-title|sparse-language-distortion|cool-white-charcoal-cobalt|presenter-forbidden",
  },
  "ED-14": {
    outputRelativePath: "generated/system-line/editorial-asset-workbench-v1/look-master-wave-v2/ED-14/look-master-wave-v2-ed-14-fullscreen-c1.png",
    prompt: "Create a finished 16:9 editorial video Look Master for a SOURCE_EVIDENCE_TAKEOVER. The real attached paper title, authors, and readable evidence window are the source identity and visual authority; keep them authentic and legible. The attached ED-14 hold frame is only a cool color and rhythm reference and must not cause a presenter to appear. No presenter, human figure, face, microphone, fake paper, invented citation, fake source window, or copied style-reference wording. Keep only the real evidence screenshot and the authorized Chinese conclusion “句法多样性下降” and “词汇多样性下降” as the editorial explanation. Forbidden leakage includes GRID ONE, BAD DESIGN IS BETTER, Susan Kare, START, unrelated English UI labels, debug labels, and filler. Use cool white, charcoal, black, and controlled cobalt blue; no warm cream field. Make one clear narrowing-path mechanism from the real evidence window toward the two authorized Chinese conclusions. ImageGen must deliver the complete integrated Look Master before any later layer extraction.",
    directionFingerprint: "source-evidence-takeover|real-paper-window|authorized-conclusions-only|cool-white-charcoal-cobalt|presenter-forbidden",
  },
};

function updatePresentationDecisionSet(next) {
  const set = next.production.presentationDecisions;
  if (!set?.items) return;
  for (const shotId of Object.keys(presentationDecisions)) {
    const item = set.items.find((entry) => entry.shotId === shotId);
    const decision = presentationDecisions[shotId];
    if (!item) continue;
    const withoutHash = {
      ...item,
      informationOwner: decision.informationOwner,
      frameOccupation: shotId === "ED-08" ? "full-frame" : "macro",
      typographyDuty: shotId === "ED-08" ? "verdict-actor" : "attached-keyword",
      rendererExecutor: shotId === "ED-08" ? "type-gesture-verdict" : "evidence-package-full-bleed",
      generationAllowed: true,
      generationPurpose: shotId === "ED-08" ? "complete-look-master-fullscreen-typography" : "complete-look-master-source-evidence-takeover",
      presentationMode: decision.mode,
      presenterVisibility: decision.presenterVisibility,
      referenceInputsDoNotInferPresenter: true,
      decisionBeforePrompt: true,
      independentPresentationDecision: structuredClone(decision),
    };
    delete withoutHash.decisionSha256;
    Object.assign(item, withoutHash, {decisionSha256: sha256(withoutHash)});
  }
  const withoutHash = {...set};
  delete withoutHash.sha256;
  set.sha256 = sha256(withoutHash);
  set.independentPresentationPolicy = {
    contract: "A1IndependentPresentationPolicy/v1",
    status: "PASS",
    referenceInputPresenceNeverInfersPresenter: true,
    decisionBeforePrompt: true,
    modes: Object.values(presentationDecisions).map((item) => item.mode),
    updatedAt: now,
  };
  set.sha256 = sha256({...set, sha256: undefined});
}

function patchPlan(plan, decision) {
  const next = structuredClone(plan);
  next.assemblyMode = decision.assemblyMode;
  next.assemblyModeReason = "INDEPENDENT_PRESENTATION_DECISION_BEFORE_PROMPT";
  next.contentTreatment = decision.contentTreatment;
  next.frameOccupation = decision.frameOccupation;
  next.presentationMode = decision.presentationMode;
  next.presentationModeReason = "REFERENCE_INPUT_PRESENCE_DOES_NOT_INFER_PRESENTER_VISIBILITY";
  next.presenterPackagingMode = decision.presenterPackagingMode || null;
  next.presenterPackagingRoute = decision.presenterPackagingRoute || null;
  next.canonicalCreatorDecision = structuredClone(decision);
  next.presentationDecision = structuredClone(decision.presentationDecision);
  next.independentPresentationDecision = structuredClone(decision.presentationDecision);
  next.videoContext = {
    ...next.videoContext,
    assemblyMode: decision.assemblyMode,
    presentationMode: decision.presentationMode,
    contentTreatment: decision.contentTreatment,
    frameOccupation: decision.frameOccupation,
    presenterPackagingMode: null,
    presenterPackagingRoute: null,
    baseVideoRelationship: decision.presentationMode === "SOURCE_EVIDENCE_TAKEOVER" ? "TEMPORARY_SOURCE_EVIDENCE_TAKEOVER" : "TEMPORARY_FULL_FRAME_TAKEOVER",
    baseSubjectMustRemainVisible: false,
    frameTakeoverAllowed: true,
    safeZonePolicy: decision.presentationMode === "SOURCE_EVIDENCE_TAKEOVER" ? "SOURCE_EVIDENCE_WINDOW_AND_TITLE_SAFE" : "FULL_FRAME_WITH_TITLE_SAFE",
  };
  delete next.videoContext.contextSha256;
  delete next.videoContext.createdAt;
  next.videoContext.createdAt = now;
  next.videoContext.contextSha256 = sha256(Object.fromEntries(Object.entries(next.videoContext).filter(([key]) => key !== "contextSha256" && key !== "createdAt")));
  if (Object.prototype.hasOwnProperty.call(next, "videoContextSha256")) next.videoContextSha256 = next.videoContext.contextSha256;
  next.objectiveVisualGate = {
    contract: "A1DelegatedObjectiveVisualGatePresentationBinding/v1",
    status: "PENDING_ACTUAL_PIXEL_AUDIT",
    mode: decision.presentationMode,
    informationOwner: decision.presentationDecision.informationOwner,
    presenterVisibility: decision.presentationDecision.presenterVisibility,
    referenceInputsDoNotInferPresenter: true,
    decisionBeforePrompt: true,
  };
  next.provisionalWholeFilmBoardSelection = null;
  next.selectedLookMasterId = null;
  next.wholeFilmBoardRecommendation = null;
  next.recommendation = null;
  next.status = "LOOK_MASTER_REVIEW_REQUIRED";
  next.planSha256 = sha256(planIdentity(next));
  return next;
}

function artifactFor({job, plan, metadata, bytes, generatedAt, attachmentManifest}) {
  return {
    contract: "A1GeneratedEditorialAssetCache/v1",
    assetId: `look-master-wave-v2-${job.shotId.toLowerCase()}-fullscreen-c1`,
    targetKind: "package-look-master",
    briefId: `look-master-${job.shotId.toLowerCase()}`,
    briefHash: null,
    treatmentHash: null,
    shotId: job.shotId,
    layerId: null,
    provider: "codex-built-in-imagegen",
    model: "gpt-image-2",
    prompt: job.prompt,
    promptSha256: sha256(job.prompt),
    generationInputHash: sha256({jobId: job.jobId, planSha256: plan.planSha256, promptSha256: sha256(job.prompt), sourceShas: attachmentManifest.sourceSha256s, presentationDecision: job.presentationDecision}),
    cacheKey: sha256({jobId: job.jobId, planSha256: plan.planSha256, promptSha256: sha256(job.prompt), sourceShas: attachmentManifest.sourceSha256s, presentationDecision: job.presentationDecision}),
    sha256: sha256(bytes),
    publicUrl: `/${job.outputRelativePath}`,
    mimeType: "image/png",
    generationId: job.generationId,
    generationJobId: job.jobId,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha === true,
    cacheHit: false,
    durationMs: null,
    generatedAt,
    workspaceImported: true,
    sourcePlanSha256: plan.planSha256,
    referenceAttachmentManifestSha256: attachmentManifest.manifestSha256,
    imagegenAttachmentManifestSha256: attachmentManifest.manifestSha256,
    imagegenAttachmentCount: attachmentManifest.fileCount,
    imagegenAttachmentSourceShas: attachmentManifest.sourceSha256s,
    imagegenAttachmentsAttachedToInitialPrompt: true,
    presentationDecision: structuredClone(job.presentationDecision),
  };
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.running !== 0 || current.production.generation.summary.queued !== 0) throw new Error("delegated-objective-repair-wave-active-queue");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("delegated-objective-repair-wave-worker-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("delegated-objective-repair-wave-assembly-forbidden");
  const overrideFile = path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json");
  const sequenceWorkspace = structuredClone(current);
  sequenceWorkspace.production.creatorPackagingProjectOverrides = readJson(overrideFile);
  const sequence = buildCanonicalCreatorPackagingSequence(sequenceWorkspace, {now});
  const runtime = current.production.shotIntelligence;
  const existingArtifactShas = new Set((runtime.lookMasterRawReferences || []).map((raw) => raw.artifact?.sha256).filter(Boolean));
  const existingJobIds = new Set((current.production.generation.jobs || []).map((job) => job.id));
  const jobs = [];
  const prepared = [];
  for (const shotId of ["ED-08", "ED-14"]) {
    const definition = candidateDefinitions[shotId];
    const decision = sequence.decisions.find((item) => item.shotId === shotId);
    const oldPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!decision || !oldPlan) throw new Error(`delegated-objective-repair-plan-missing:${shotId}`);
    const plan = patchPlan(oldPlan, decision);
    const file = publicFile(`/${definition.outputRelativePath}`);
    if (!fs.existsSync(file)) throw new Error(`delegated-objective-repair-output-missing:${shotId}`);
    const bytes = fs.readFileSync(file);
    const artifactSha256 = sha256(bytes);
    if (existingArtifactShas.has(artifactSha256)) throw new Error(`delegated-objective-repair-duplicate-artifact:${shotId}`);
    const metadata = await sharp(file).metadata();
    if (metadata.format !== "png" || metadata.width !== 1672 || metadata.height !== 941) throw new Error(`delegated-objective-repair-output-decode-invalid:${shotId}`);
    const references = referenceDefinitions[shotId];
    const attachmentManifest = buildUniversalReferenceAttachmentManifest({
      jobId: `look-master-wave-v2-${shotId.toLowerCase()}-fullscreen-c1-${artifactSha256.slice(0, 12)}`,
      referenceInputs: references,
      attachedImagePaths: references.map((item) => item.sourcePath),
      stage: "ATTACHED_TO_CODEX_INITIAL_PROMPT",
    });
    assertUniversalReferenceAttachmentManifest(attachmentManifest, {requireAttached: true});
    const job = {
      jobId: `look-master-wave-v2-${shotId.toLowerCase()}-fullscreen-c1-${artifactSha256.slice(0, 12)}`,
      shotId,
      candidateIndex: 1,
      planSha256: plan.planSha256,
      directionId: "delegated-objective-fullscreen-c1",
      directionFingerprint: definition.directionFingerprint,
      prompt: definition.prompt,
      generationId: shotId === "ED-08" ? "exec-132e6b72-0c8d-445a-b9e1-a80015e441b9" : "exec-f0555570-0b7f-4974-9537-801b66a65122",
      outputRelativePath: definition.outputRelativePath,
      presentationDecision: structuredClone(presentationDecisions[shotId]),
      referenceDecision: "UNIVERSAL_REFERENCE_TO_IMAGEGEN_PACKAGING",
      references,
      attachmentManifest,
      artifactSha256,
    };
    if (existingJobIds.has(job.jobId)) throw new Error(`delegated-objective-repair-job-already-imported:${shotId}`);
    jobs.push(job);
    prepared.push({shotId, job, plan, decision, file, bytes, metadata, attachmentManifest, artifact: artifactFor({job, plan, metadata, bytes, generatedAt: now, attachmentManifest})});
  }
  const next = structuredClone(current);
  next.production.creatorPackagingProjectOverrides = readJson(overrideFile);
  next.production.canonicalCreatorPackagingSequence = sequence;
  next.production.shotIntelligence.packageLookMasterPlans = runtime.packageLookMasterPlans.map((plan) => {
    const item = prepared.find((entry) => entry.shotId === plan.shotId);
    return item ? item.plan : plan;
  });
  const patchedContextByShot = new Map(prepared.map((item) => [item.shotId, item.plan.videoContext]));
  const contextItems = next.production.shotIntelligence.videoPackagingContexts.items.map((context) => patchedContextByShot.get(context.shotId) || context);
  next.production.shotIntelligence.videoPackagingContexts = buildVideoPackagingContextSet(contextItems, {createdAt: next.production.shotIntelligence.videoPackagingContexts.createdAt});
  updatePresentationDecisionSet(next);
  for (const item of prepared) {
    const {job, plan, decision, attachmentManifest, artifact} = item;
    next.production.generation.jobs.push({
      contract: "A1AssetGenerationJob/v2",
      id: job.jobId,
      projectId: "july1-writing-workbench",
      assetId: artifact.assetId,
      targetKind: "package-look-master",
      shotId: job.shotId,
      route: "delegated-objective-visual-gate-manual-imagegen-import-v1",
      provider: "codex-built-in-imagegen",
      providerMode: "subscription-zero-extra-cost",
      model: "gpt-image-2",
      status: "complete",
      prompt: job.prompt,
      promptSha256: artifact.promptSha256,
      cacheKey: artifact.cacheKey,
      sourceHash: plan.sourceHash || null,
      planSha256: plan.planSha256,
      lookMasterPlanSha256: plan.planSha256,
      candidateDirection: {directionId: job.directionId, fingerprint: job.directionFingerprint},
      candidateIndex: job.candidateIndex,
      generationInputHash: artifact.generationInputHash,
      referenceDecision: job.referenceDecision,
      referenceInputs: structuredClone(job.references),
      referenceAttachmentManifest: structuredClone(attachmentManifest),
      referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      imagegenAttachmentCount: attachmentManifest.fileCount,
      imagegenAttachmentSourceShas: attachmentManifest.sourceSha256s,
      imagegenAttachmentsAttachedToInitialPrompt: true,
      presentationDecision: structuredClone(job.presentationDecision),
      actualImageGenExecutionEvidence: {
        contract: "A1ActualImageGenExecutionEvidence/v1",
        tool: "image_gen.imagegen",
        requestMode: "referenced_image_paths",
        attachedToInitialRequest: true,
        attachmentManifestSha256: attachmentManifest.manifestSha256,
        generationId: job.generationId,
        outputPath: item.file,
      },
      attempts: 1,
      createdAt: now,
      startedAt: now,
      completedAt: now,
      durationMs: null,
      cacheHit: false,
      output: artifact,
      error: null,
      telemetry: {completedAt: now, firstPreviewAt: now},
      delegatedObjectiveVisualGate: "PENDING_ACTUAL_PIXEL_AUDIT",
    });
    next.production.shotIntelligence.lookMasterRawReferences.push({
      contract: "A1PackageLookMasterRaw/v1",
      referenceId: `look-master-raw-${job.jobId}`,
      shotId: job.shotId,
      planSha256: plan.planSha256,
      styleBriefSha256: plan.styleBriefSha256 || null,
      candidateDirectionId: job.directionId,
      directionFingerprint: job.directionFingerprint,
      classification: "FULL_LOOK_MASTER_GENERATED_WITH_ACTUAL_REFERENCE_ATTACHMENTS",
      fullLookMasterStatus: "PENDING_ACTUAL_PIXEL_AUDIT",
      status: "LOOK_MASTER_RAW",
      artifact,
      provenance: {
        generationJobContract: "A1AssetGenerationJob/v2",
        generationJobId: job.jobId,
        generationId: job.generationId,
        generationInputHash: artifact.generationInputHash,
        provider: artifact.provider,
        model: artifact.model,
        referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
        productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
        referenceAttachmentManifestSha256: attachmentManifest.manifestSha256,
        referenceInputs: structuredClone(job.references),
        actualImageGenExecutionEvidence: {tool: "image_gen.imagegen", requestMode: "referenced_image_paths", attachedToInitialRequest: true, attachmentManifestSha256: attachmentManifest.manifestSha256, generationId: job.generationId},
        holdFrameSha256: job.references.find((reference) => reference.sourceType === "REAL_HOLD_FRAME")?.sourceSha256 || null,
        sourceEvidenceInputs: job.references.filter((reference) => reference.sourceType === "RESEARCH_EVIDENCE").map((reference) => structuredClone(reference)),
      },
      referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      referenceInputs: structuredClone(job.references),
      referenceAttachmentManifest: structuredClone(attachmentManifest),
      imagegenAttachmentManifestSha256: attachmentManifest.manifestSha256,
      imagegenAttachmentCount: attachmentManifest.fileCount,
      imagegenAttachmentSourceShas: attachmentManifest.sourceSha256s,
      imagegenAttachmentsAttachedToInitialPrompt: true,
      presentationDecision: structuredClone(job.presentationDecision),
      objectiveVisualGate: {contract: "A1DelegatedObjectiveVisualGate/v1", status: "PENDING_ACTUAL_PIXEL_AUDIT", ruleSets: ["STRUCTURAL_PIXEL_REFERENCE_GATE", "SEMANTIC_PRESENTER_DECOUPLING_GATE"]},
      pixelAudit: null,
      semanticPixelAudit: null,
      candidateAuditAuthority: null,
      candidateAdmissionRequired: true,
      recommendationEligible: false,
      selectionEligible: false,
      assemblyEligible: false,
      current: true,
      historyReadOnly: false,
      reviewDeferredTo: "DELEGATED_OBJECTIVE_ACTUAL_PIXEL_AUDIT",
      createdAt: now,
    });
  }
  const superseded = {
    "ED-08": {sha256: "c8d2a595e65771a824eb1715733515d6d2babcd47d4c93e40598ecf471360687", reason: "ACTUAL_PIXEL_FAIL_FILLER_TEXT_AND_EXCESS_DENSITY"},
    "ED-14": {sha256: "788f151958a8eca7bd3e5947315eb5ce9e695ff7ce80a0e80c0008140b3552d7", reason: "ACTUAL_PIXEL_FAIL_SOURCE_LEAKAGE_AND_FILLER"},
  };
  for (const [shotId, failure] of Object.entries(superseded)) {
    const old = next.production.shotIntelligence.lookMasterRawReferences.find((raw) => raw.shotId === shotId && raw.artifact?.sha256 === failure.sha256);
    if (!old) throw new Error(`delegated-objective-repair-superseded-candidate-missing:${shotId}`);
    old.current = false;
    old.historyReadOnly = true;
    old.recommendationEligible = false;
    old.selectionEligible = false;
    old.assemblyEligible = false;
    old.status = failure.reason;
    old.reviewStatus = failure.reason;
    old.fullLookMasterStatus = failure.reason;
    old.candidateAuditAuthority = {contract: "A1CandidateAuditAuthority/v1", status: "FAIL", hardRuleFailures: [failure.reason], userVisualApproval: "NOT_APPROVED", auditedAt: now};
  }
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.production.packagingAutomation = {
    ...(next.production.packagingAutomation || {}),
    status: "DELEGATED_OBJECTIVE_VISUAL_GATE",
    currentStage: "delegated-objective-repair-awaiting-pixel-audit",
    targetShotIds: ["ED-08", "ED-14"],
    generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"},
    updatedAt: now,
  };
  next.production.project.currentStage = "delegated-objective-repair-awaiting-pixel-audit";
  next.production.project.updatedAt = now;
  next.production.goldenFilmVisualSystemMaturity = {
    ...(next.production.goldenFilmVisualSystemMaturity || {}),
    status: "DELEGATED_OBJECTIVE_REPAIR_AWAITING_PIXEL_AUDIT",
    nextAction: "AUDIT_DELEGATED_OBJECTIVE_REPAIR_WAVE",
    targetShotIds: ["ED-08", "ED-14"],
    currentWaveJobIds: jobs.map((job) => job.jobId),
    updatedAt: now,
  };
  next.production.objectiveVisualGate = {
    contract: "A1DelegatedObjectiveVisualGate/v1",
    status: "PENDING_TWO_CANDIDATE_ACTUAL_PIXEL_AUDIT",
    ruleSetIds: ["STRUCTURAL_PIXEL_REFERENCE_GATE", "SEMANTIC_PRESENTER_DECOUPLING_GATE"],
    presentationDecisionSha256: sha256(presentationDecisions),
    userVisualApproval: "NOT_APPROVED",
    hardRuleDisagreement: false,
    targetShotIds: ["ED-08", "ED-14"],
    updatedAt: now,
  };
  next.production.shotIntelligence.wholeFilmStaticBoard = {...(next.production.shotIntelligence.wholeFilmStaticBoard || {}), status: "SUPERSEDED_DELEGATED_OBJECTIVE_REPAIR_PENDING", approvalAllowed: false, decision: null};
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {...(next.production.shotIntelligence.wholeFilmBatchRecommendation || {}), status: "DELEGATED_OBJECTIVE_REPAIR_AWAITING_PIXEL_AUDIT", autoRecommendationAllowed: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "AUDIT_DELEGATED_OBJECTIVE_REPAIR_WAVE"};
  const manifest = {
    contract: "A1DelegatedObjectiveRepairWaveManifest/v1",
    status: "IMPORTED_AWAITING_ACTUAL_PIXEL_AUDIT",
    generatedAt: now,
    sourceWorkspaceSha256: current.workspaceSha256,
    presentationPolicy: {contract: "A1IndependentPresentationPolicy/v1", decisionBeforePrompt: true, referenceInputPresenceNeverInfersPresenter: true, userVisualApproval: "NOT_APPROVED"},
    targets: prepared.map(({shotId, job, plan, artifact, attachmentManifest, decision}) => ({shotId, jobId: job.jobId, generationId: job.generationId, artifactSha256: artifact.sha256, publicUrl: artifact.publicUrl, planSha256: plan.planSha256, promptSha256: artifact.promptSha256, presentationDecision: decision.presentationDecision, referenceAttachmentManifestSha256: attachmentManifest.manifestSha256, referenceAttachmentCount: attachmentManifest.fileCount, referenceAttachmentSourceShas: attachmentManifest.sourceSha256s, imagegenAttachmentsAttachedToInitialPrompt: true, actualImageGenExecutionEvidence: {tool: "image_gen.imagegen", requestMode: "referenced_image_paths", attachedToInitialRequest: true}})),
    supersededCandidates: Object.values(superseded),
    queue: {queued: 0, running: 0, workerStatus: "frozen"},
    assemblyCreationAllowed: false,
    layerReconstructionStarted: false,
    criticPerformed: false,
    motionPerformed: false,
    manifestSha256: null,
  };
  manifest.manifestSha256 = sha256({...manifest, manifestSha256: undefined});
  const event = createProductionEvent({workspace: next, action: "import-delegated-objective-repair-wave", targetId: manifest.manifestSha256, payload: {contract: manifest.contract, targetShotIds: ["ED-08", "ED-14"], importedCandidateCount: 2, actualAttachmentProof: true, presentationDecisionBeforePrompt: true, presenterDecoupled: true, assemblyCreated: false, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(recalculated.production.generation.summary.queued, 0);
  assert.equal(recalculated.production.generation.summary.running, 0);
  assert.equal(recalculated.production.generation.workerStatus, "frozen");
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `delegated-objective-repair-import-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[waveRelativePath]: manifest}});
  return {status: manifest.status, manifestSha256: manifest.manifestSha256, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, jobs: manifest.targets, supersededCandidates: manifest.supersededCandidates, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCreationAllowed: false};
});

console.log(JSON.stringify(result, null, 2));
