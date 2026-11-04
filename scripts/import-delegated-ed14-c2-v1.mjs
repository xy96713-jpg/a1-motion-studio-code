#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildUniversalReferenceAttachmentManifest, assertUniversalReferenceAttachmentManifest, A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, UNIVERSAL_REFERENCE_PRODUCTION_METHOD} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const outputRelativePath = "generated/system-line/editorial-asset-workbench-v1/look-master-wave-v2/ED-14/look-master-wave-v2-ed-14-fullscreen-c2.png";
const waveRelativePath = "golden-film-visual-system-maturity-v1/delegated-objective-repair-wave-v1/repair-manifest-c2.json";
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => path.resolve(publicRoot, String(url).replace(/^\//u, ""));

const sourceEvidencePath = path.join(publicRoot, "generated/system-line/web-source-packaging-pilot-v1/sources/acl-2026-acl-long-1803-title-abstract.png");
const holdFramePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-14-hold-frame.jpg");
const references = [
  {
    id: "ed-14-real-paper-evidence-window",
    sourcePath: sourceEvidencePath,
    sourceSha256: "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46",
    sourceType: "RESEARCH_EVIDENCE",
    semanticRole: "real-official-paper-title-author-abstract-evidence-window",
    transformPolicy: "EVIDENCE_WINDOW",
  },
  {
    id: "ed-14-real-hold-frame-style-rhythm",
    sourcePath: holdFramePath,
    sourceSha256: "fb5cb39ae42a080a21e7c01de1ff8729624ce56229bb7b9e65c6d06e3be937c1",
    sourceType: "REAL_HOLD_FRAME",
    semanticRole: "reference-only-color-rhythm-transition-no-presenter-output",
    transformPolicy: "STYLE_REFERENCE_ONLY",
  },
];
const generationId = "exec-1d1799aa-96b6-4738-ab2d-afac279b4afc";
const prompt = "Create a finished 16:9 editorial video Look Master for a SOURCE_EVIDENCE_TAKEOVER. This is a new, cleaner evidence-window primitive after a prior draft used unauthorized paraphrases. The real attached ACL paper screenshot must remain the identity and visual authority, large and legible on the left; do not redraw, invent, or paraphrase the paper. The attached ED-14 presenter hold frame is only a cool color and rhythm reference and must not cause any presenter, human figure, face, or microphone to appear in the output. On the right, render exactly and only these two authorized Chinese conclusions, with these exact characters: “句法多样性下降” and “词汇多样性下降”. Do not use 降低, 尤其明显, 下降以外的 paraphrase, or any extra conclusion. Do not add GRID ONE, BAD DESIGN IS BETTER, Susan Kare, START, unrelated English UI labels, debug labels, fake citation, fake source window, style-reference wording, or filler. The attached paper’s own authentic title, authors, abstract, citations, and source text may remain visible inside the real evidence screenshot. Use cool white, charcoal, black, and controlled cobalt blue; no warm cream field. Use a single thin cobalt evidence connector and a sparse two-label conclusion block. Keep the whole composition editorial and source-led, with a clear one-way reading path from real paper evidence to the two exact Chinese conclusions. ImageGen must deliver the complete integrated 16:9 Look Master before any later layer extraction.";

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("delegated-ed14-c2-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("delegated-ed14-c2-assembly-forbidden");
  const plan = current.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-14");
  if (!plan) throw new Error("delegated-ed14-c2-plan-missing");
  const file = publicFile(outputRelativePath);
  const bytes = fs.readFileSync(file);
  const artifactSha256 = sha256(bytes);
  if (artifactSha256 !== "88bb2f3f437ee5cf8070c216ed4563709c41a6f3736f8d43e3fc36a93541938b") throw new Error(`delegated-ed14-c2-sha-mismatch:${artifactSha256}`);
  const attachmentManifest = buildUniversalReferenceAttachmentManifest({
    jobId: `look-master-wave-v2-ed-14-fullscreen-c2-${artifactSha256.slice(0, 12)}`,
    referenceInputs: references,
    attachedImagePaths: references.map((item) => item.sourcePath),
    stage: "ATTACHED_TO_CODEX_INITIAL_PROMPT",
  });
  assertUniversalReferenceAttachmentManifest(attachmentManifest, {requireAttached: true});
  const jobId = `look-master-wave-v2-ed-14-fullscreen-c2-${artifactSha256.slice(0, 12)}`;
  if (current.production.generation.jobs.some((job) => job.id === jobId)) throw new Error("delegated-ed14-c2-job-already-imported");
  const artifact = {
    contract: "A1GeneratedEditorialAssetCache/v1",
    assetId: "look-master-wave-v2-ed-14-fullscreen-c2",
    targetKind: "package-look-master",
    briefId: "look-master-ed-14",
    briefHash: null,
    treatmentHash: null,
    shotId: "ED-14",
    layerId: null,
    provider: "codex-built-in-imagegen",
    model: "gpt-image-2",
    prompt,
    promptSha256: sha256(prompt),
    generationInputHash: sha256({jobId, planSha256: plan.planSha256, promptSha256: sha256(prompt), sourceShas: attachmentManifest.sourceSha256s, presentationMode: "SOURCE_EVIDENCE_TAKEOVER"}),
    cacheKey: sha256({jobId, planSha256: plan.planSha256, promptSha256: sha256(prompt), sourceShas: attachmentManifest.sourceSha256s, presentationMode: "SOURCE_EVIDENCE_TAKEOVER"}),
    sha256: artifactSha256,
    publicUrl: `/${outputRelativePath}`,
    mimeType: "image/png",
    generationId,
    generationJobId: jobId,
    width: 1672,
    height: 941,
    hasAlpha: false,
    cacheHit: false,
    durationMs: null,
    generatedAt: now,
    workspaceImported: true,
    sourcePlanSha256: plan.planSha256,
    referenceAttachmentManifestSha256: attachmentManifest.manifestSha256,
    imagegenAttachmentManifestSha256: attachmentManifest.manifestSha256,
    imagegenAttachmentCount: attachmentManifest.fileCount,
    imagegenAttachmentSourceShas: attachmentManifest.sourceSha256s,
    imagegenAttachmentsAttachedToInitialPrompt: true,
    presentationDecision: structuredClone(plan.presentationDecision),
  };
  const next = structuredClone(current);
  next.production.generation.jobs.push({
    contract: "A1AssetGenerationJob/v2",
    id: jobId,
    projectId: "july1-writing-workbench",
    assetId: artifact.assetId,
    targetKind: "package-look-master",
    shotId: "ED-14",
    route: "delegated-objective-visual-gate-manual-imagegen-import-v1",
    provider: "codex-built-in-imagegen",
    providerMode: "subscription-zero-extra-cost",
    model: "gpt-image-2",
    status: "complete",
    prompt,
    promptSha256: artifact.promptSha256,
    cacheKey: artifact.cacheKey,
    sourceHash: plan.sourceHash || null,
    planSha256: plan.planSha256,
    lookMasterPlanSha256: plan.planSha256,
    candidateDirection: {directionId: "delegated-objective-source-evidence-c2", fingerprint: "source-evidence-takeover|clean-evidence-window|exact-authorized-conclusions|cool-white-charcoal-cobalt|presenter-forbidden"},
    candidateIndex: 2,
    generationInputHash: artifact.generationInputHash,
    referenceDecision: "UNIVERSAL_REFERENCE_TO_IMAGEGEN_PACKAGING",
    referenceInputs: structuredClone(references),
    referenceAttachmentManifest: structuredClone(attachmentManifest),
    referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
    productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
    imagegenAttachmentCount: attachmentManifest.fileCount,
    imagegenAttachmentSourceShas: attachmentManifest.sourceSha256s,
    imagegenAttachmentsAttachedToInitialPrompt: true,
    presentationDecision: structuredClone(plan.presentationDecision),
    actualImageGenExecutionEvidence: {contract: "A1ActualImageGenExecutionEvidence/v1", tool: "image_gen.imagegen", requestMode: "referenced_image_paths", attachedToInitialRequest: true, attachmentManifestSha256: attachmentManifest.manifestSha256, generationId, outputPath: file},
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
  const raw = {
    contract: "A1PackageLookMasterRaw/v1",
    referenceId: `look-master-raw-${jobId}`,
    shotId: "ED-14",
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256 || null,
    candidateDirectionId: "delegated-objective-source-evidence-c2",
    directionFingerprint: "source-evidence-takeover|clean-evidence-window|exact-authorized-conclusions|cool-white-charcoal-cobalt|presenter-forbidden",
    classification: "FULL_LOOK_MASTER_GENERATED_WITH_ACTUAL_REFERENCE_ATTACHMENTS",
    fullLookMasterStatus: "PENDING_ACTUAL_PIXEL_AUDIT",
    status: "LOOK_MASTER_RAW",
    artifact,
    provenance: {generationJobContract: "A1AssetGenerationJob/v2", generationJobId: jobId, generationId, generationInputHash: artifact.generationInputHash, provider: artifact.provider, model: artifact.model, referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD, referenceAttachmentManifestSha256: attachmentManifest.manifestSha256, referenceInputs: structuredClone(references), actualImageGenExecutionEvidence: {tool: "image_gen.imagegen", requestMode: "referenced_image_paths", attachedToInitialRequest: true, attachmentManifestSha256: attachmentManifest.manifestSha256, generationId}, holdFrameSha256: references[1].sourceSha256, sourceEvidenceInputs: [structuredClone(references[0])]},
    referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
    productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
    referenceInputs: structuredClone(references),
    referenceAttachmentManifest: structuredClone(attachmentManifest),
    imagegenAttachmentManifestSha256: attachmentManifest.manifestSha256,
    imagegenAttachmentCount: attachmentManifest.fileCount,
    imagegenAttachmentSourceShas: attachmentManifest.sourceSha256s,
    imagegenAttachmentsAttachedToInitialPrompt: true,
    presentationDecision: structuredClone(plan.presentationDecision),
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
  };
  const oldC1 = next.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === "ED-14" && item.artifact?.sha256 === "164a6e26428641dadfdd2e9f9fd9395f920edf5c6784cbf4689f6ee72cd5a91b");
  if (!oldC1) throw new Error("delegated-ed14-c2-prior-candidate-missing");
  oldC1.current = false;
  oldC1.historyReadOnly = true;
  oldC1.recommendationEligible = false;
  oldC1.selectionEligible = false;
  oldC1.assemblyEligible = false;
  oldC1.status = "ACTUAL_PIXEL_FAIL_UNAUTHORIZED_PARAPHRASE_OR_SOURCE_CONCLUSION";
  oldC1.reviewStatus = oldC1.status;
  oldC1.fullLookMasterStatus = oldC1.status;
  oldC1.candidateAuditAuthority = {contract: "A1CandidateAuditAuthority/v1", status: "FAIL", hardRuleFailures: [oldC1.status], userVisualApproval: "NOT_APPROVED", auditedAt: now};
  next.production.shotIntelligence.lookMasterRawReferences.push(raw);
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.production.packagingAutomation = {...(next.production.packagingAutomation || {}), status: "DELEGATED_OBJECTIVE_VISUAL_GATE", currentStage: "delegated-objective-repair-awaiting-pixel-audit", targetShotIds: ["ED-14"], generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
  next.production.goldenFilmVisualSystemMaturity = {...(next.production.goldenFilmVisualSystemMaturity || {}), status: "DELEGATED_OBJECTIVE_REPAIR_AWAITING_PIXEL_AUDIT", nextAction: "AUDIT_DELEGATED_OBJECTIVE_REPAIR_WAVE_C2", targetShotIds: ["ED-14"], currentWaveJobIds: [jobId], updatedAt: now};
  next.production.objectiveVisualGate = {...(next.production.objectiveVisualGate || {}), status: "PENDING_ED14_C2_ACTUAL_PIXEL_AUDIT", targetShotIds: ["ED-14"], userVisualApproval: "NOT_APPROVED", updatedAt: now};
  const manifest = {contract: "A1DelegatedObjectiveRepairWaveC2Manifest/v1", status: "IMPORTED_AWAITING_ACTUAL_PIXEL_AUDIT", generatedAt: now, sourceWorkspaceSha256: current.workspaceSha256, target: {shotId: "ED-14", jobId, generationId, artifactSha256: artifactSha256, publicUrl: artifact.publicUrl, planSha256: plan.planSha256, promptSha256: artifact.promptSha256, presentationDecision: raw.presentationDecision, referenceAttachmentManifestSha256: attachmentManifest.manifestSha256, referenceAttachmentCount: attachmentManifest.fileCount, referenceAttachmentSourceShas: attachmentManifest.sourceSha256s, imagegenAttachmentsAttachedToInitialPrompt: true, actualImageGenExecutionEvidence: {tool: "image_gen.imagegen", requestMode: "referenced_image_paths", attachedToInitialRequest: true}}, priorCandidate: {artifactSha256: oldC1.artifact.sha256, failure: oldC1.status}, queue: {queued: 0, running: 0, workerStatus: "frozen"}, assemblyCreationAllowed: false, criticPerformed: false, motionPerformed: false, manifestSha256: null};
  manifest.manifestSha256 = sha256({...manifest, manifestSha256: undefined});
  const event = createProductionEvent({workspace: next, action: "import-delegated-ed14-c2", targetId: manifest.manifestSha256, payload: {contract: manifest.contract, shotId: "ED-14", artifactSha256, actualAttachmentProof: true, exactAuthorizedConclusionsRequired: true, assemblyCreated: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `delegated-ed14-c2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[waveRelativePath]: manifest}});
  return {status: manifest.status, manifestSha256: manifest.manifestSha256, workspaceSha256After: committed.workspaceSha256, shotId: "ED-14", artifactSha256, publicUrl: artifact.publicUrl, jobId, generationId, attachmentManifestSha256: attachmentManifest.manifestSha256, attachmentSourceShas: attachmentManifest.sourceSha256s, queue: recalculated.production.generation.summary};
});

console.log(JSON.stringify(result, null, 2));
