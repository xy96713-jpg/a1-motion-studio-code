#!/usr/bin/env node
/**
 * Presenter-first packaging lane.
 *
 * queue    -> send the selected full presenter composition plus the untouched
 *             presenter hold frame back to imagegen for reverse extraction
 * finalize -> bind the imagegen-composed full frame as the Assembly and the
 *             extracted transparent PNG as the DaVinci overlay
 *
 * Layer slots are a post-approval decomposition/delivery contract. They never
 * independently re-compose or redesign the imagegen-integrated frame here.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {currentPackageLookMasterDirections} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const artifactDir = projectDirs(appRoot).artifactDir;
const mode = process.argv[2];
const shotId = process.env.A1_PACKAGE_SHOT_ID || "ED-10";
const now = process.env.A1_PACKAGE_RUN_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const fileSha = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => {
  const file = path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("integrated-presenter-package-public-path-invalid");
  return file;
};
const generationSummary = (jobs) => ({
  queued: jobs.filter((job) => job.status === "queued").length,
  running: jobs.filter((job) => job.status === "running").length,
  complete: jobs.filter((job) => job.status === "complete").length,
  failed: jobs.filter((job) => job.status === "failed").length,
  stale: jobs.filter((job) => job.status === "stale").length,
  cancelled: jobs.filter((job) => job.status === "cancelled").length,
  total: jobs.length,
});

function selectedBindings(workspace) {
  const runtime = workspace.production.shotIntelligence;
  const lookPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
  const binding = kit?.selectedLookMasterBinding;
  const raw = (runtime.lookMasterRawReferences || []).find((item) => item.shotId === shotId && item.artifact?.sha256 === binding?.artifactSha256);
  const direction = currentPackageLookMasterDirections(lookPlan).find((item) => item.directionId === binding?.directionId);
  const base = lookPlan?.videoContext?.baseFrame;
  if (!lookPlan || !kit || !binding?.artifactPublicUrl || !binding.artifactSha256 || !raw || !direction || !base?.publicUrl || !base.sha256) throw new Error("integrated-presenter-package-selected-master-binding-invalid");
  if (fileSha(publicFile(binding.artifactPublicUrl)) !== binding.artifactSha256 || fileSha(publicFile(base.publicUrl)) !== base.sha256) throw new Error("integrated-presenter-package-reference-sha-invalid");
  return {runtime, lookPlan, kit, binding, raw, direction, base};
}

function queue() {
  const source = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (source.production.generation.summary.queued || source.production.generation.summary.running) throw new Error("integrated-presenter-package-generation-queue-not-idle");
  const {lookPlan, kit, binding, direction, base} = selectedBindings(source);
  const prompt = `The first reference is the authoritative imagegen-composed final presenter frame. The second reference is the untouched original presenter hold frame. Reverse-extract ONLY the visual packaging that was added around the presenter in the authoritative final frame: its paper panels, integrated Chinese typography, halftone question-mark actor, cobalt blocks, print texture and diagram marks. Preserve the exact 16:9 canvas coordinates, scale, overlap, hierarchy and visual relationships from the authoritative frame. Remove every original-video pixel: presenter, skin, hair, shirt, microphone, room, lamps, monitors, wall art and lighting. Output one full-canvas PNG with real transparency everywhere outside the added package. Do not redesign, rearrange, simplify, add text, retype with a clean font, or create a new poster. This coherent overlay is the source for later four-slot decomposition; do not independently re-compose its parts.`;
  const promptSha256 = sha256(prompt);
  const generationInputHash = sha256({contract: "A1IntegratedPresenterPackage/v1", shotId, selectedMasterSha256: binding.artifactSha256, baseFrameSha256: base.sha256, promptSha256});
  const id = `integrated-presenter-package-${shotId.toLowerCase()}-${generationInputHash.slice(0, 12)}`;
  const existing = source.production.generation.jobs.find((job) => job.id === id || job.generationInputHash === generationInputHash);
  if (existing && ["queued", "running", "complete"].includes(existing.status)) {
    console.log(JSON.stringify({status: existing.status.toUpperCase(), jobId: existing.id, output: existing.output || null}, null, 2));
    return;
  }
  withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (current.workspaceSha256 !== source.workspaceSha256) throw new Error("integrated-presenter-package-workspace-changed-before-queue");
    const currentBindings = selectedBindings(current);
    const job = {
      contract: "A1AssetGenerationJob/v2",
      id,
      jobIdentity: `integrated-presenter-package:${shotId}`,
      generationInputHash,
      targetKind: "package-look-master",
      projectId: current.production.project.projectId,
      sourceHash: kit.sourceHash,
      assetPackSha256: current.library.assetPackSha256,
      assetId: null,
      briefId: `integrated-presenter-package-${shotId.toLowerCase()}`,
      briefHash: sha256({planSha256: lookPlan.planSha256, promptSha256}),
      shotId,
      eventId: lookPlan.eventId,
      lookMasterPlanSha256: lookPlan.planSha256,
      styleBriefSha256: lookPlan.styleBriefSha256,
      candidateIndex: 1,
      candidateDirection: currentBindings.direction,
      generationRole: "reverse-extract-imagegen-integrated-presenter-package",
      generationMode: "FAST_CANDIDATE_DISCOVERY",
      mode: "generate",
      referenceInputs: [
        {id: `${shotId.toLowerCase()}-authoritative-imagegen-final-frame`, role: "authoritative-imagegen-composed-presenter-frame", publicUrl: currentBindings.binding.artifactPublicUrl, sha256: currentBindings.binding.artifactSha256},
        {id: `${shotId.toLowerCase()}-untouched-presenter-frame`, role: "untouched-original-presenter-hold-frame-for-removal", publicUrl: currentBindings.base.publicUrl, sha256: currentBindings.base.sha256},
      ],
      capabilitySnapshot: {finishedCompositionAllowed: true, transparentOutput: true, reverseExtraction: true, localRecompositionAllowed: false, remoteCriticRequired: false},
      qualityTier: "production-integrated-overlay",
      route: "subscription-image-generation",
      provider: "codex-imagegen",
      providerMode: "subscription-zero-extra-cost",
      model: "codex-imagegen-current",
      status: "queued",
      prompt,
      promptSha256,
      cacheKey: generationInputHash,
      priority: "presenter-first-reverse-extraction",
      outputRelativePath: `generated/system-line/editorial-asset-workbench-v1/integrated-presenter-package/${shotId}/${generationInputHash.slice(0, 12)}-package-only.png`,
      attempts: 0,
      cacheHit: false,
      error: null,
      telemetry: {queuedAt: now, firstPreviewAt: null, completedAt: null, retryCount: 0},
      createdAt: now,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      output: null,
    };
    current.production.generation.jobs.push(job);
    current.production.generation.summary = generationSummary(current.production.generation.jobs);
    current.production.generation.workerStatus = "queued";
    current.production.generation.updatedAt = now;
    current.production.shotIntelligence.integratedPresenterPackage = {
      contract: "A1IntegratedPresenterPackage/v1",
      status: "OVERLAY_EXTRACTION_QUEUED",
      shotId,
      selectedDirectionId: binding.directionId,
      authoritativeFullFrame: {publicUrl: binding.artifactPublicUrl, sha256: binding.artifactSha256},
      untouchedPresenterFrame: {publicUrl: base.publicUrl, sha256: base.sha256},
      extractionJobId: id,
      compositionAuthority: "IMAGEGEN_INTEGRATED_PRESENTER_FRAME",
      localLayerRecompositionAllowed: false,
      decompositionTiming: "AFTER_FINAL_ASSEMBLY_APPROVAL",
      queuedAt: now,
    };
    if (current.production.shotIntelligence.autoAssemblyRun) current.production.shotIntelligence.autoAssemblyRun.status = "SUPERSEDED_BY_PRESENTER_FIRST_PIPELINE";
    const recalculated = recalculateEditorialAssetWorkbench(current, now);
    persistProjectState(appRoot, recalculated, {event: createProductionEvent({workspace: recalculated, action: "queue-presenter-first-package-reverse-extraction", targetId: shotId, payload: {jobId: id, selectedMasterSha256: binding.artifactSha256, baseFrameSha256: base.sha256, localRecompositionAllowed: false, remoteCriticPerformed: false}, now})});
  });
  console.log(JSON.stringify({status: "OVERLAY_EXTRACTION_QUEUED", jobId: id, selectedMasterSha256: binding.artifactSha256, baseFrameSha256: base.sha256}, null, 2));
}

const ocrBinary = [path.join(artifactDir, "a1-vision-ocr-v1"), path.join(path.dirname(artifactDir), "a1-vision-ocr-v1")].find((file) => fs.existsSync(file));
const semanticCharacters = (value) => String(value || "").normalize("NFKC").match(/[\p{Script=Han}A-Za-z0-9]+/gu)?.join("") || "";
function runOcr(file) {
  if (!ocrBinary) throw new Error("integrated-presenter-package-ocr-binary-missing");
  const result = spawnSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000});
  if (result.status !== 0) throw new Error(`integrated-presenter-package-ocr-failed:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

async function normalizePng(source, target) {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const temporary = `${target}.tmp-${process.pid}.png`;
  await sharp(source).resize(1920, 1080, {fit: "fill"}).png().toFile(temporary);
  fs.renameSync(temporary, target);
}

async function finalize() {
  // Read the pre-migration presenter-first state without asserting the old
  // layer-bound recipe. The locked mutation below rewrites it to the current
  // integrated Assembly contract and validates the resulting workspace.
  const source = readProjectWorkspace(appRoot);
  const {lookPlan, kit, binding, base} = selectedBindings(source);
  const run = source.production.shotIntelligence.integratedPresenterPackage;
  const job = source.production.generation.jobs.find((item) => item.id === run?.extractionJobId);
  if (run?.contract !== "A1IntegratedPresenterPackage/v1" || !job || job.status !== "complete" || !job.output?.publicUrl || fileSha(publicFile(job.output.publicUrl)) !== job.output.sha256) throw new Error("integrated-presenter-package-extraction-not-complete");
  const sourceOverlay = publicFile(job.output.publicUrl);
  const metadata = await sharp(sourceOverlay).metadata();
  const stats = await sharp(sourceOverlay).stats();
  const alpha = stats.channels[3];
  if (metadata.hasAlpha !== true || !alpha || alpha.min >= 250 || alpha.max <= 8 || alpha.mean >= 190) throw new Error(`integrated-presenter-package-alpha-invalid:${metadata.hasAlpha}:${alpha?.min}:${alpha?.max}:${alpha?.mean}`);
  const ocr = runOcr(sourceOverlay);
  const expected = kit.copySpec.exactPhrase;
  if (ocr.status !== "PASS" || semanticCharacters(ocr.text) !== semanticCharacters(expected)) throw new Error(`integrated-presenter-package-copy-blocked:${ocr.text}`);

  const finalBase = "/generated/system-line/editorial-asset-workbench-v1/integrated-presenter-package/final";
  const assemblyPublicUrl = `${finalBase}/${shotId.toLowerCase()}-${binding.artifactSha256.slice(0, 12)}-imagegen-assembly.png`;
  const overlayPublicUrl = `${finalBase}/${shotId.toLowerCase()}-${job.output.sha256.slice(0, 12)}-package-only.png`;
  await normalizePng(publicFile(binding.artifactPublicUrl), publicFile(assemblyPublicUrl));
  await normalizePng(sourceOverlay, publicFile(overlayPublicUrl));
  const assemblyPreview = {publicUrl: assemblyPublicUrl, sha256: fileSha(publicFile(assemblyPublicUrl)), width: 1920, height: 1080, relationship: "IMAGEGEN_COMPOSED_WITH_REAL_PRESENTER_FRAME"};
  const packageOnlyPreview = {publicUrl: overlayPublicUrl, sha256: fileSha(publicFile(overlayPublicUrl)), width: 1920, height: 1080, alphaVerified: true, relationship: "IMAGEGEN_REVERSE_EXTRACTED_PACKAGE_ONLY"};

  withProjectLock(appRoot, () => {
    const current = readProjectWorkspace(appRoot);
    if (current.workspaceSha256 !== source.workspaceSha256) throw new Error("integrated-presenter-package-workspace-changed-before-finalize");
    const runtime = current.production.shotIntelligence;
    const currentLookPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    const currentKit = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
    const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
    const currentMasterRaw = (runtime.lookMasterRawReferences || []).find((item) => item.shotId === shotId && item.artifact?.sha256 === binding.artifactSha256);
    const currentMasterJob = current.production.generation.jobs.find((item) => item.id === currentMasterRaw?.provenance?.generationJobId && item.status === "complete" && item.output?.sha256 === binding.artifactSha256);
    const masterGenerationId = currentMasterJob?.output?.generationId || currentMasterRaw?.artifact?.generationId || null;
    if (!currentLookPlan || !currentKit || !recipe || !currentMasterRaw || !currentMasterJob || !masterGenerationId) throw new Error("integrated-presenter-package-system-provenance-incomplete");
    const completeMasterBinding = {
      ...currentKit.selectedLookMasterBinding,
      provenanceMode: "SYSTEM_GENERATED",
      provenanceStatus: "COMPLETE",
      traceabilityStatus: "COMPLETE",
      generationJobId: currentMasterJob.id,
      generationId: masterGenerationId,
      generationInputHash: currentMasterJob.generationInputHash || currentMasterRaw.provenance?.generationInputHash || null,
      operatorImported: false,
      upstreamUnavailable: false,
      provenance: {
        ...(currentKit.selectedLookMasterBinding?.provenance || {}),
        provenanceStatus: "COMPLETE",
        traceabilityStatus: "COMPLETE",
        generationJobId: currentMasterJob.id,
        generationId: masterGenerationId,
        generationInputHash: currentMasterJob.generationInputHash || currentMasterRaw.provenance?.generationInputHash || null,
        provider: currentMasterJob.provider || currentMasterRaw.provenance?.provider || "codex-imagegen",
        model: currentMasterJob.model || currentMasterRaw.provenance?.model || "codex-imagegen-current",
        artifactSha256: binding.artifactSha256,
        operatorImported: false,
        upstreamUnavailable: false,
      },
    };
    currentLookPlan.selectedLookMasterBinding = structuredClone(completeMasterBinding);
    currentKit.selectedLookMasterBinding = structuredClone(completeMasterBinding);
    recipe.selectedLookMasterBinding = structuredClone(completeMasterBinding);
    const parity = {
      contract: "A1PackageAssemblyParityAudit/v1",
      status: "REVIEW_REQUIRED",
      method: "IMAGEGEN_INTEGRATED_FRAME_PLUS_IMAGEGEN_REVERSE_EXTRACTION",
      planSha256: currentKit.planSha256,
      recipeSha256: recipe.recipeSha256,
      selectedLookMasterSha256: binding.artifactSha256,
      assemblyPreview,
      packageOnlyPreview,
      baseFrameSha256: base.sha256,
      localLayerRecompositionPerformed: false,
      remoteCriticPerformed: false,
      ocr: {status: ocr.status, text: ocr.text, exact: true},
      alpha: {status: "PASS", min: alpha.min, max: alpha.max, mean: alpha.mean},
      generatedAt: now,
    };
    parity.auditSha256 = sha256({...parity, auditSha256: undefined, generatedAt: undefined});
    const previousLayerSelection = Object.values(recipe.layerCandidateIds || {}).some(Boolean) ? {
      status: "HISTORY_READ_ONLY",
      reason: "superseded-by-imagegen-integrated-presenter-frame",
      layerCandidateIds: structuredClone(recipe.layerCandidateIds || {}),
      selectionEvidence: recipe.selectionEvidence ? structuredClone(recipe.selectionEvidence) : null,
      approvalBinding: recipe.approvalBinding ? structuredClone(recipe.approvalBinding) : null,
      supersededAt: now,
    } : recipe.prePresenterFirstLayerSelection || null;
    recipe.prePresenterFirstLayerSelection = previousLayerSelection;
    recipe.layerCandidateIds = {BACKGROUND: null, TYPOGRAPHY: null, ELEMENT_KIT: null, ILLUSTRATION: null};
    recipe.placement = [];
    recipe.zOrder = [];
    recipe.geometry = [];
    recipe.masks = [];
    recipe.selectionEvidence = null;
    recipe.selectedAlternatives = [];
    recipe.rejectedAlternatives = [];
    recipe.assemblyComposite = assemblyPreview;
    recipe.packageOnlyComposite = packageOnlyPreview;
    recipe.contextPreview = {publicUrl: assemblyPreview.publicUrl, sha256: assemblyPreview.sha256, width: 1920, height: 1080, baseFrameSha256: base.sha256, assemblySha256: assemblyPreview.sha256, packageOnlySha256: packageOnlyPreview.sha256};
    recipe.parityAudit = parity;
    recipe.deterministicParity = parity;
    recipe.assemblyVisualReview = null;
    recipe.finalAssemblyReview = null;
    recipe.assemblyPreviewAvailable = true;
    recipe.assemblyReadyForUserReview = true;
    recipe.assemblyUserApproved = false;
    recipe.status = "ASSEMBLY_REVIEW_REQUIRED";
    recipe.assemblySource = {mode: "IMAGEGEN_INTEGRATED_PRESENTER_FRAME", authoritativeFullFrame: assemblyPreview, untouchedPresenterFrame: {publicUrl: base.publicUrl, sha256: base.sha256}, reverseExtractedPackage: packageOnlyPreview, localLayerRecompositionPerformed: false};
    recipe.decompositionSlots = {
      BACKGROUND: {route: "NONE", reason: "editor-owned-presenter-video-remains-the-base"},
      TYPOGRAPHY: {route: "DECOMPOSE_AFTER_ASSEMBLY_APPROVAL"},
      ELEMENT_KIT: {route: "DECOMPOSE_AFTER_ASSEMBLY_APPROVAL"},
      ILLUSTRATION: {route: "NONE", reason: "selected-integrated-frame-does-not-need-a-separate-illustration"},
    };
    recipe.materialIntegration = "imagegen-integrated-presenter-frame";
    recipe.buildKey = sha256({contract: "A1IntegratedPresenterAssemblyBuild/v1", planSha256: currentKit.planSha256, selectedLookMasterSha256: binding.artifactSha256, assemblySha256: assemblyPreview.sha256, packageOnlySha256: packageOnlyPreview.sha256, decompositionSlots: recipe.decompositionSlots});
    recipe.recipeSha256 = sha256({contract: "A1IntegratedPresenterAssemblyRecipe/v1", buildKey: recipe.buildKey, sourceHash: recipe.sourceHash, assemblySource: recipe.assemblySource, decompositionSlots: recipe.decompositionSlots});
    parity.recipeSha256 = recipe.recipeSha256;
    parity.auditSha256 = sha256({...parity, auditSha256: undefined, generatedAt: undefined});
    recipe.approvalBinding = {planSha256: currentKit.planSha256, recipeSha256: recipe.recipeSha256, buildKey: recipe.buildKey, layerHashes: [], assemblySha256: assemblyPreview.sha256, packageOnlySha256: packageOnlyPreview.sha256, selectedDirectionId: binding.directionId, selectedMasterSha256: binding.artifactSha256, bindingMode: "IMAGEGEN_INTEGRATED_ASSEMBLY", userApproved: false};
    recipe.recommendation = {status: "REVIEW_REQUIRED", reason: "推荐画面由生图直接围绕真实口播帧完成；透明包装也由完整成片反向提取，未用本地字体/纸片重新拼构图。用户确认 Assembly 后才拆字体与元素做动效。"};
    currentKit.status = "ASSEMBLY_REVIEW_REQUIRED";
    currentKit.integratedAssemblyPolicy = {
      contract: "A1IntegratedPresenterAssemblyPolicy/v1",
      compositionAuthority: "IMAGEGEN_WITH_REAL_PRESENTER_FRAME",
      coherentOverlayFirst: true,
      localLayerRecompositionAllowed: false,
      decompositionTiming: "AFTER_FINAL_ASSEMBLY_APPROVAL",
      fourSlotsAreDeliveryContractsNotPrecompositionInputs: true,
    };
    currentKit.integratedAssemblyReview = {status: "REVIEW_REQUIRED", assemblySha256: assemblyPreview.sha256, packageOnlySha256: packageOnlyPreview.sha256, userApprovalRequired: true};
    currentKit.historicalPrePresenterFirstLayerSelection = previousLayerSelection;
    for (const layer of currentKit.layers) {
      layer.selectedCandidateId = null;
      layer.selectedCandidateSource = layer.kind === "BACKGROUND" || layer.kind === "ILLUSTRATION" ? "SEMANTIC_NONE_ROUTE" : "WAITING_FOR_ASSEMBLY_APPROVAL_DECOMPOSITION";
    }
    runtime.status = "ASSEMBLY_REVIEW_REQUIRED";
    runtime.integratedPresenterPackage = {...runtime.integratedPresenterPackage, status: "ASSEMBLY_REVIEW_REQUIRED", authoritativeFullFrame: assemblyPreview, reverseExtractedPackage: packageOnlyPreview, ocr: {status: ocr.status, text: ocr.text, exact: true}, alpha: {status: "PASS", min: alpha.min, max: alpha.max, mean: alpha.mean}, finalizedAt: now};
    runtime.finalAssemblyReview = {status: "REVIEW_REQUIRED", reviewMode: "USER_ASSEMBLY_REVIEW_ONLY", serverVisualReview: "SKIPPED_BY_FAST_POLICY", recipeSha256: recipe.recipeSha256, auditSha256: parity.auditSha256, assemblyPreview, packageOnlyPreview, userApprovalRequired: true, selectedDirectionId: binding.directionId, selectedMasterSha256: binding.artifactSha256, compositionAuthority: "IMAGEGEN_INTEGRATED_PRESENTER_FRAME", localLayerRecompositionPerformed: false};
    current.production.packagingReview = {...current.production.packagingReview, status: "ASSEMBLY_REVIEW_REQUIRED", intermediateApprovalRequired: false, requiresExplicitApproval: true, userApprovalStatus: "RECOMMENDED_ASSEMBLY_CONFIRMATION_REQUIRED", nextAction: "review-recommended-package-assembly", updatedAt: now};
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(current, now));
    persistProjectState(appRoot, recalculated, {event: createProductionEvent({workspace: recalculated, action: "presenter-first-package-ready-for-assembly-review", targetId: shotId, payload: {assemblySha256: assemblyPreview.sha256, packageOnlySha256: packageOnlyPreview.sha256, selectedMasterSha256: binding.artifactSha256, extractionJobId: job.id, localLayerRecompositionPerformed: false, motionPerformed: false}, now})});
    console.log(JSON.stringify({status: "ASSEMBLY_REVIEW_REQUIRED", workspaceSha256: recalculated.workspaceSha256, shotId, assemblyPreview, packageOnlyPreview, ocr: {text: ocr.text, exact: true}, alpha: {min: alpha.min, max: alpha.max, mean: alpha.mean}, next: "USER_ASSEMBLY_REVIEW_THEN_DECOMPOSE_FOR_MOTION"}, null, 2));
  });
}

if (mode === "queue") queue();
else if (mode === "finalize") await finalize();
else throw new Error("usage: node scripts/execute-integrated-presenter-package-v1.mjs <queue|finalize>");
