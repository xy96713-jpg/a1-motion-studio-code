#!/usr/bin/env node
/**
 * Deterministically migrate the current ED-10 overlay Assembly after the
 * opaque full-frame background contract was tightened. No image generation,
 * critic, or motion is performed; existing transparent layer PNGs are reused.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {projectDirs, persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {recalculateEditorialAssetWorkbench, assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildPackageLayerCandidateCacheKey} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";

const appRoot = path.join(process.cwd(), "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => {
  const file = path.resolve(publicRoot, String(url || "").replace(/^\//u, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("ed10-overlay-public-path-invalid");
  return file;
};
const hashWithout = (value, key) => { const copy = structuredClone(value); delete copy[key]; return sha256(copy); };

async function buildOverlay({baseFrameFile, layerFiles, overlayFile, contextFile}) {
  const overlays = [];
  for (const file of layerFiles) {
    const input = await sharp(file).resize(1920, 1080, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
    overlays.push({input});
  }
  const transparentCanvas = {create: {width: 1920, height: 1080, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}};
  await sharp(transparentCanvas).composite(overlays).png().toFile(overlayFile);
  await sharp(baseFrameFile).resize(1920, 1080).composite(overlays).png().toFile(contextFile);
}

const run = async () => {
  const before = readProjectWorkspace(appRoot);
  const workspace = structuredClone(before);
  const runtime = workspace.production.shotIntelligence;
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (!kit || !recipe || recipe.status !== "ASSEMBLY_REVIEW_REQUIRED") throw new Error("ed10-overlay-current-assembly-required");
  const background = kit.layers.find((layer) => layer.kind === "BACKGROUND");
  const opaqueBackground = background?.candidates?.find((candidate) => (candidate.status === "READY" && candidate.artifact?.alphaVerified !== true)
    || candidate.admission?.failures?.includes("overlay-opaque-full-frame-background-forbidden"));
  if (opaqueBackground) {
    opaqueBackground.status = "REJECTED";
    opaqueBackground.admission = {status: "FAIL", failures: ["overlay-opaque-full-frame-background-forbidden"], auditedAt: new Date().toISOString()};
    opaqueBackground.candidateSha256 = hashWithout(opaqueBackground, "candidateSha256");
    const admissionId = opaqueBackground.provenance?.serverAuditId || opaqueBackground.serverAuditId || opaqueBackground.admission?.admissionId;
    if (admissionId && workspace.production.packageLayerAdmissionRegistry?.[admissionId]) {
      workspace.production.packageLayerAdmissionRegistry[admissionId] = {
        ...workspace.production.packageLayerAdmissionRegistry[admissionId],
        status: "HISTORY_READ_ONLY",
        current: false,
        advisoryOnly: true,
        reason: "overlay-opaque-full-frame-background-forbidden",
      };
    }
  }
  if (!background) throw new Error("ed10-overlay-background-layer-missing");
  background.route = "NONE";
  background.candidateBudget = 0;
  background.status = "NOT_REQUIRED";
  background.selectedCandidateId = null;
  background.selectedCandidateSource = "SEMANTIC_NONE_ROUTE";
  background.routeAudit = {
    ...(background.routeAudit || {}),
    status: "SEMANTIC_NONE_OVERLAY_BASE_PRESERVATION",
    fallback: "NONE",
    compatibleAssetCount: 0,
    compatibleAssetIds: [],
    reason: "OVERLAY + baseSubjectMustRemainVisible 禁止不透明 full-frame BACKGROUND；当前母版使用正片 base frame 作为底图。",
  };
  background.reason = "OVERLAY 保留正片主体；不生成或录用不透明 full-frame BACKGROUND。";

  const previousAssembly = structuredClone(recipe.assemblyComposite);
  recipe.legacyAssemblyHistory = {status: "HISTORY_READ_ONLY", reason: "opaque-full-frame-background-invalid-for-overlay", assemblyComposite: previousAssembly};
  recipe.layerCandidateIds = {...recipe.layerCandidateIds, BACKGROUND: null};
  recipe.placement = (recipe.placement || []).filter((item) => item.layerKind !== "BACKGROUND");
  recipe.zOrder = (recipe.zOrder || []).filter((item) => item.layerKind !== "BACKGROUND");
  recipe.geometry = (recipe.geometry || []).filter((item) => item.layerKind !== "BACKGROUND");
  recipe.masks = (recipe.masks || []).filter((item) => item.layerKind !== "BACKGROUND");
  const planHashInput = structuredClone(kit);
  delete planHashInput.planSha256;
  kit.planSha256 = sha256(planHashInput);
  for (const layer of kit.layers) for (const candidate of layer.candidates || []) {
    candidate.planSha256 = kit.planSha256;
    candidate.cache = {...candidate.cache, key: buildPackageLayerCandidateCacheKey({planSha256: kit.planSha256, layerKind: candidate.layerKind, route: candidate.route, contentSha256: candidate.artifact?.sha256, variantNonce: candidate.cache?.variantNonce || null})};
    candidate.candidateSha256 = hashWithout(candidate, "candidateSha256");
  }
  recipe.planSha256 = kit.planSha256;
  if (recipe.selectionEvidence) {
    recipe.selectionEvidence.planSha256 = kit.planSha256;
    const evidence = recipe.selectionEvidence.layers.find((item) => item.layerKind === "BACKGROUND");
    if (evidence) Object.assign(evidence, {route: "NONE", candidateScores: [], selectedCandidateId: null, recommendedCandidateId: null, heuristicRecommendedCandidateId: null, selectedAlternatives: [], rejectedAlternatives: []});
    recipe.selectionEvidence.selectedCandidateIds = {...recipe.selectionEvidence.selectedCandidateIds, BACKGROUND: null};
    recipe.selectionEvidence.recommendedCandidateIds = {...recipe.selectionEvidence.recommendedCandidateIds, BACKGROUND: null};
    recipe.selectionEvidence.heuristicRecommendedCandidateIds = {...recipe.selectionEvidence.heuristicRecommendedCandidateIds, BACKGROUND: null};
    const evidenceHashInput = structuredClone(recipe.selectionEvidence);
    delete evidenceHashInput.evidenceSha256;
    recipe.selectionEvidence.evidenceSha256 = sha256(evidenceHashInput);
  }
  const selectedFiles = [];
  for (const layer of kit.layers) {
    const selectedId = recipe.layerCandidateIds?.[layer.kind];
    if (!selectedId) continue;
    const candidate = layer.candidates.find((item) => item.candidateId === selectedId && item.status === "READY");
    if (!candidate) throw new Error(`ed10-overlay-selected-layer-missing:${layer.kind}`);
    selectedFiles.push(publicFile(candidate.artifact.publicUrl));
  }
  const baseFrame = kit.videoContext?.baseFrame;
  if (!baseFrame?.publicUrl || !baseFrame?.sha256) throw new Error("ed10-overlay-base-frame-missing");
  const baseFrameFile = publicFile(baseFrame.publicUrl);
  if (sha256(fs.readFileSync(baseFrameFile)) !== baseFrame.sha256) throw new Error("ed10-overlay-base-frame-sha-mismatch");
  const buildKey = sha256({contract: "A1DeterministicOverlayAssembly/v2", shotId: "ED-10", planSha256: kit.planSha256, layerCandidateIds: recipe.layerCandidateIds, layerFiles: selectedFiles.map((file) => sha256(fs.readFileSync(file))), baseFrameSha256: baseFrame.sha256});
  const relativeDir = "generated/system-line/editorial-asset-workbench-v1/package-assembly-parity-four-layer-trial";
  const overlayUrl = `/${relativeDir}/ed-10-overlay-${buildKey.slice(0, 12)}-assembly.png`;
  const contextUrl = `/${relativeDir}/ed-10-overlay-${buildKey.slice(0, 12)}-context-preview.png`;
  await buildOverlay({baseFrameFile, layerFiles: selectedFiles, overlayFile: publicFile(overlayUrl), contextFile: publicFile(contextUrl)});
  const overlaySha = sha256(fs.readFileSync(publicFile(overlayUrl)));
  const contextSha = sha256(fs.readFileSync(publicFile(contextUrl)));
  recipe.assemblyComposite = {publicUrl: overlayUrl, sha256: overlaySha, width: 1920, height: 1080, relationship: "TRANSPARENT_OVERLAY_PACKAGE_ONLY", baseFrameSha256: null, compositorVersion: "a1-overlay-context-compositor-v2"};
  recipe.contextPreview = {publicUrl: contextUrl, sha256: contextSha, width: 1920, height: 1080, relationship: "BASE_FRAME_WITH_TRANSPARENT_LAYERS", baseFrameSha256: baseFrame.sha256, assemblySha256: overlaySha, compositorVersion: "a1-overlay-context-compositor-v2"};
  recipe.buildKey = buildKey;
  const recipeIdentity = {contract: recipe.contract, version: recipe.version, shotId: recipe.shotId, planSha256: recipe.planSha256, layerCandidateIds: recipe.layerCandidateIds, buildKey, assemblyComposite: recipe.assemblyComposite, contextPreview: recipe.contextPreview, selectedLookMasterBinding: recipe.selectedLookMasterBinding, reconstructionSource: recipe.reconstructionSource, videoContextSha256: recipe.videoContextSha256};
  recipe.recipeSha256 = sha256(recipeIdentity);
  if (recipe.parityAudit) {
    recipe.parityAudit.planSha256 = recipe.planSha256;
    recipe.parityAudit.recipeSha256 = recipe.recipeSha256;
    recipe.parityAudit.assemblyPreview = recipe.assemblyComposite;
    recipe.parityAudit.contextPreview = recipe.contextPreview;
    delete recipe.parityAudit.auditSha256;
    recipe.parityAudit.auditSha256 = hashWithout(recipe.parityAudit, "auditSha256");
  }
  if (recipe.deterministicParity) {
    recipe.deterministicParity.planSha256 = recipe.planSha256;
    recipe.deterministicParity.recipeSha256 = recipe.recipeSha256;
    recipe.deterministicParity.assemblyPreview = recipe.assemblyComposite;
    recipe.deterministicParity.contextPreview = recipe.contextPreview;
    recipe.deterministicParity.auditSha256 = recipe.parityAudit?.auditSha256 || null;
  }
  if (recipe.approvalBinding) {
    recipe.approvalBinding.planSha256 = recipe.planSha256;
    recipe.approvalBinding.recipeSha256 = recipe.recipeSha256;
    recipe.approvalBinding.buildKey = buildKey;
    recipe.approvalBinding.layerHashes = kit.layers.flatMap((layer) => { const id = recipe.layerCandidateIds?.[layer.kind]; const candidate = layer.candidates.find((item) => item.candidateId === id); return candidate ? [candidate.candidateSha256] : []; }).sort();
  }
  runtime.ed10FourLayerTrial.actualLayerCandidateCount = kit.layers.reduce((sum, layer) => sum + layer.candidates.filter((candidate) => candidate.status === "READY" && candidate.admission?.status === "PASS").length, 0);
  runtime.ed10FourLayerTrial.result = {
    ...(runtime.ed10FourLayerTrial.result || {}),
    status: "ASSEMBLY_REVIEW_REQUIRED",
    parityStatus: "REVIEW_REQUIRED",
    failureReason: null,
    actualLayerCandidates: runtime.ed10FourLayerTrial.actualLayerCandidateCount,
    routes: Object.fromEntries(kit.layers.map((layer) => [layer.kind, {
      route: layer.route,
      count: layer.candidates.filter((candidate) => candidate.status === "READY" && candidate.admission?.status === "PASS").length,
    }])),
    assemblyPreviewSha256: overlaySha,
    contextPreviewSha256: contextSha,
  };
  runtime.ed10FourLayerTrial.backgroundRoute = "NONE";
  runtime.ed10FourLayerTrial.backgroundRejectedReason = "overlay-opaque-full-frame-background-forbidden";
  runtime.status = "ASSEMBLY_REVIEW_REQUIRED";
  workspace.production.shotIntelligence.status = "ASSEMBLY_REVIEW_REQUIRED";
  const recalculated = recalculateEditorialAssetWorkbench(workspace);
  assertEditorialAssetWorkbench(recalculated);
  const beforeWorkspaceSha256 = workspace.workspaceSha256;
  withProjectLock(appRoot, () => {
    const current = readProjectWorkspace(appRoot);
    if (current.workspaceSha256 !== beforeWorkspaceSha256) throw new Error("ed10-overlay-workspace-cas-mismatch");
    // Keep the legacy workbench audit explicitly historical but point its
    // supersession marker at the exact workspace now written by this migration.
    const auditFiles = [
      path.join(publicRoot, relativeDir.replace("/generated/system-line/", "generated/system-line/").replace("package-assembly-parity-four-layer-trial", ""), "audit-report.json"),
      path.join(projectDirs(appRoot).artifactDir, "audit-report.json"),
    ];
    const historicalAuditFile = auditFiles.find((auditFile) => fs.existsSync(auditFile));
    const historicalAudit = historicalAuditFile ? JSON.parse(fs.readFileSync(historicalAuditFile, "utf8")) : null;
    const auditFilesToPersist = historicalAudit?.status === "HISTORY_READ_ONLY"
      ? {"audit-report.json": {...historicalAudit, supersededBy: {...(historicalAudit.supersededBy || {}), currentWorkspaceSha256: recalculated.workspaceSha256}}}
      : {};
    persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: beforeWorkspaceSha256, files: auditFilesToPersist});
  });
  console.log(JSON.stringify({status: "PASS", workspaceSha256: recalculated.workspaceSha256, selectedLayers: recalculated.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10").layerCandidateIds, assembly: recalculated.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10").assemblyComposite, contextPreview: recalculated.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10").contextPreview}, null, 2));
};

run().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
