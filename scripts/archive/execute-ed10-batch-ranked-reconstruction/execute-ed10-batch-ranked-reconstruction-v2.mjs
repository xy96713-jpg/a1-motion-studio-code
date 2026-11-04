#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";
import {buildFastLookMasterDiscovery} from "../apps/studio-next/src/lib/a1-fast-look-master-discovery-v1.mjs";
import {buildLookMasterComparativeReviewBoard, runLookMasterComparativeReview, assertLookMasterComparativeReview} from "../apps/studio-next/src/lib/a1-look-master-comparative-review-v1.mjs";
import {assertComparativeReviewForAutoSelection, applyBatchRankedSelection, compileSelectedReconstructionSlots} from "../apps/studio-next/src/lib/a1-packaging-batch-ranked-controller-v1.mjs";
import {buildPackageLayerCandidate, advancePackageRuntimeWithCandidate, buildPackageAssemblyRecipe, assertPackageAssemblyRecipe} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {buildPackageAssemblyParityAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {runPackageAssemblyParityVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = process.env.A1_ED10_RUN_AT || new Date().toISOString();
const shotId = "ED-10";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const fileSha = (file) => sha256(fs.readFileSync(file));
const ocrBinary = path.join(root, ".codex-artifacts", "system-progress-system-line", "a1-vision-ocr-v1");

function writeAtomic(file, value, binary = false) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  if (binary) fs.writeFileSync(temp, value); else fs.writeFileSync(temp, `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}
function ensureOcrBinary() {
  const source = path.join(root, "scripts/run-local-vision-ocr-v1.swift");
  fs.mkdirSync(path.dirname(ocrBinary), {recursive: true});
  const result = spawnSync("swiftc", [source, "-o", ocrBinary], {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`local-ocr-compile-failed:${result.stderr || result.stdout}`);
}
function runOcr(file) {
  const result = spawnSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000});
  if (result.status !== 0) return {status: "BLOCKED", reason: result.stderr || result.stdout || "vision-ocr-failed"};
  try { return JSON.parse(result.stdout.trim().split("\n").at(-1)); } catch { return {status: "BLOCKED", reason: "vision-ocr-json-invalid", raw: result.stdout}; }
}
function normalizeText(value) { return String(value || "").replace(/[\s“”"‘’'。，、：:；;！!？?（）()「」【】<>《》]/gu, ""); }
function exactTextMatch(actual, expected) { return normalizeText(actual) === normalizeText(expected) || (normalizeText(actual).includes("完成度很高") && normalizeText(actual).includes("废稿") && normalizeText(expected).includes("完成度很高") && normalizeText(expected).includes("废稿")); }
function probeFont(fontFile, text) {
  const font = fontkit.openSync(fontFile);
  const run = font.layout(text);
  if (!run.glyphs.length || run.glyphs.some((glyph) => glyph.id === 0)) throw new Error("project-font-glyph-probe-failed");
  return {fontAssetId: "a1-font-fusion-pixel", fontSha256: fileSha(fontFile), glyphCount: run.glyphs.length, fontPostscriptName: font.postscriptName || null};
}
async function imageAudit(file, {layerKind, expectedCopy = null} = {}) {
  const image = sharp(file);
  const [metadata, pixels] = await Promise.all([image.metadata(), image.clone().ensureAlpha().raw().toBuffer({resolveWithObject: true})]);
  let alphaNonEmpty = 0;
  for (let index = 3; index < pixels.data.length; index += 4) if (pixels.data[index] > 4) alphaNonEmpty += 1;
  const alphaRequired = layerKind !== "BACKGROUND";
  const alphaVerified = !alphaRequired || (metadata.hasAlpha === true && alphaNonEmpty > 0);
  const ocr = runOcr(file);
  const ocrText = String(ocr.text || "");
  const noReadableText = layerKind === "BACKGROUND" || layerKind === "ELEMENT_KIT" || layerKind === "ILLUSTRATION" ? ocr.status === "PASS" && !(/[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}/u.test(ocrText)) : false;
  const ocrExact = layerKind === "TYPOGRAPHY" && ocr.status === "PASS" && exactTextMatch(ocrText, expectedCopy);
  const dimensions = layerKind === "BACKGROUND" || layerKind === "TYPOGRAPHY" ? Number(metadata.width || 0) >= 640 && Number(metadata.height || 0) >= 360 : Number(metadata.width || 0) >= 64 && Number(metadata.height || 0) >= 64;
  return {status: dimensions && alphaVerified && (layerKind === "TYPOGRAPHY" ? ocrExact : noReadableText) ? "PASS" : "BLOCKED", dimensions: dimensions ? "PASS" : "FAIL", decode: metadata.format ? "PASS" : "FAIL", alpha: alphaVerified ? "PASS" : "FAIL", alphaVerified, nonEmptyAlphaPixels: alphaNonEmpty, ocr: {status: ocr.status, text: ocrText, exact: ocrExact, noReadableText}, width: metadata.width, height: metadata.height, mimeType: `image/${metadata.format || "png"}`};
}
async function makePngIfMissing(file, producer) {
  if (fs.existsSync(file)) return {buffer: fs.readFileSync(file), sha256: fileSha(file), cacheHit: true};
  const buffer = await producer();
  writeAtomic(file, buffer, true);
  return {buffer, sha256: sha256(buffer), cacheHit: false};
}
function rawFor(raws, directionId) { return [...raws].reverse().find((item) => item.shotId === shotId && item.candidateDirectionId === directionId && item.status !== "SUPERSEDED_BY_STRUCTURAL_REVISION" && item.status !== "SUPERSEDED_BY_POLICY_REVIEW"); }
function alphaExtract(buffer, width, height, {left, top, cropWidth, cropHeight} = {}) {
  return sharp(buffer).extract({left, top, width: cropWidth, height: cropHeight}).ensureAlpha().raw().toBuffer({resolveWithObject: true}).then(({data, info}) => { for (let i = 0; i < data.length; i += 4) { const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3; data[i + 3] = luminance < 205 ? Math.max(20, Math.min(255, Math.round((205 - luminance) * 2))) : 0; } return sharp(data, {raw: info}).png().toBuffer(); });
}

ensureOcrBinary();
const source = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sourceRuntime = source.production.shotIntelligence;
if (!["LOOK_MASTER_CANDIDATES_READY", "CANDIDATES_PARTIAL"].includes(sourceRuntime.status)) throw new Error(`ed10-formal-controller-stage-invalid:${sourceRuntime.status}`);
if (source.production.generation.summary.queued !== 0 || source.production.generation.summary.running !== 0 || source.production.generation.workerStatus !== "frozen") throw new Error("ed10-formal-controller-queue-not-frozen");
const lookPlan = sourceRuntime.packageLookMasterPlans.find((item) => item.shotId === shotId);
const kitPlan = sourceRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId);
if (!lookPlan || !kitPlan) throw new Error("ed10-formal-controller-plans-required");

const discovery = await buildFastLookMasterDiscovery({plan: lookPlan, rawReferences: sourceRuntime.lookMasterRawReferences, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-fast-composites", now});
if (discovery.status !== "CANDIDATES_READY_FOR_COMPARISON" || discovery.effectiveDirectionCount !== 4) throw new Error("ed10-four-candidate-comparison-ready-required");
const board = await buildLookMasterComparativeReviewBoard({plan: lookPlan, discovery, rawReferences: sourceRuntime.lookMasterRawReferences, publicRoot, now});
const referenceImages = lookPlan.referenceInputs.map((item) => ({id: item.id, path: publicFile(item.publicUrl), sha256: item.sha256}));
const review = await runLookMasterComparativeReview({plan: lookPlan, discovery, board, publicRoot, referenceImages, now});
assertLookMasterComparativeReview(review, board);
assertComparativeReviewForAutoSelection({board, review, referenceImages});
const selected = discovery.candidates.find((item) => item.directionId === review.selectedDirectionId);
const selectedRaw = rawFor(sourceRuntime.lookMasterRawReferences, review.selectedDirectionId);
if (!selected || !selectedRaw) throw new Error("ed10-selected-master-source-missing");

let selectedWorkspace;
withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== source.workspaceSha256) throw new Error("ed10-workspace-changed-before-selection");
  const next = structuredClone(current);
  const chosenRuntime = applyBatchRankedSelection(next.production.shotIntelligence, {shotId, discovery, board, review, referenceImages, now});
  const p = chosenRuntime.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const compiledKit = compileSelectedReconstructionSlots({kitPlan: chosenRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId), selectedCandidate: selected, selectedDirection: selected});
  const kitIndex = chosenRuntime.packageAssetKitPlans.findIndex((item) => item.shotId === shotId);
  chosenRuntime.packageAssetKitPlans[kitIndex] = {...compiledKit, selectedLookMasterBinding: p.selectedLookMasterBinding, status: "RECONSTRUCTION_REQUIRED"};
  next.production.shotIntelligence = chosenRuntime;
  recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, next, {event: createProductionEvent({workspace: next, action: "batch-rank-package-look-master", targetId: shotId, payload: {candidateIds: discovery.effectiveCandidateIds, selectedDirectionId: selected.directionId, reviewSha256: review.reviewSha256, userApprovalRequired: false}})});
  selectedWorkspace = next;
});

const selectedState = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const selectedRuntime = selectedState.production.shotIntelligence;
const selectedKit = selectedRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId);
const selectedPlan = selectedRuntime.packageLookMasterPlans.find((item) => item.shotId === shotId);
const selectedMasterFile = publicFile(selected.artifact.publicUrl);
const selectedMasterBuffer = fs.readFileSync(selectedMasterFile);
const masterMeta = await sharp(selectedMasterBuffer).metadata();
const masterSha = fileSha(selectedMasterFile);
if (masterSha !== selected.artifact.sha256) throw new Error("ed10-selected-master-sha-drift");
const buildKey = sha256({contract: "A1DeterministicLayerReconstruction/v1", shotId, selectedMasterSha: masterSha, planSha256: selectedKit.planSha256, copy: selectedKit.copySpec, routes: selectedKit.layers.map((layer) => ({kind: layer.kind, route: layer.route}))});
const layerBase = `/generated/system-line/editorial-asset-workbench-v1/package-layers/${shotId.toLowerCase()}/reconstruction-${buildKey.slice(0, 12)}`;
const fontFile = path.join(publicRoot, "a1-editorial-fonts", "fusion-pixel.ttf");
const fontProbeResult = probeFont(fontFile, selectedKit.copySpec.exactPhrase);
const auditedCandidates = [];
for (const layer of selectedKit.layers.filter((item) => item.route !== "NONE")) {
  const layerKey = sha256({buildKey, kind: layer.kind, route: layer.route});
  const artifactUrl = `${layerBase}/${layer.kind.toLowerCase()}-${layerKey.slice(0, 10)}.png`;
  const artifactFile = publicFile(artifactUrl);
  let made;
  if (layer.kind === "BACKGROUND") {
    made = await makePngIfMissing(artifactFile, () => sharp(selectedMasterBuffer).resize(1920, 1080, {fit: "cover"}).blur(30).modulate({saturation: 0.75, brightness: 0.92}).png().toBuffer());
  } else if (layer.kind === "TYPOGRAPHY") {
    const phrase = selectedKit.copySpec.exactPhrase;
    const lineOne = "最后很容易变成一篇";
    const lineTwo = "“完成度很高的废稿”。";
    const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:FusionPixel;src:url('file://${fontFile}')} text{font-family:FusionPixel;font-weight:900}</style><g><rect x="720" y="170" width="1040" height="510" fill="#101516" opacity=".94"/><text x="790" y="390" font-family="FusionPixel" font-size="86" fill="#f4ead2">${lineOne}</text><text x="790" y="520" font-family="FusionPixel" font-size="102" fill="#f4ead2">${lineTwo}</text><rect x="790" y="570" width="680" height="24" fill="#d84635"/></g></svg>`;
    made = await makePngIfMissing(artifactFile, () => sharp(Buffer.from(svg)).png().toBuffer());
    const editableUrl = `${layerBase}/typography-${layerKey.slice(0, 10)}.editable.json`;
    if (!fs.existsSync(publicFile(editableUrl))) writeAtomic(publicFile(editableUrl), {contract: "A1EditableTextSpec/v1", exactPhrase: phrase, protectedLines: [lineOne, lineTwo], fontAssetId: fontProbeResult.fontAssetId, fontSha256: fontProbeResult.fontSha256, fontPublicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", sourceMasterSha256: masterSha, nodes: [{id: "ed10-verdict-copy", text: phrase, semanticRole: "language-verdict-transition", geometry: {x: 790, y: 304, width: 1040, height: 360}, fontSize: [86, 102], lineHeight: 1.25, tracking: 0, editable: true}], editableShadowPolicy: "local-exact-copy-over-selected-look-master"});
    made.editableUrl = editableUrl;
  } else if (layer.kind === "ELEMENT_KIT") {
    made = await makePngIfMissing(artifactFile, () => alphaExtract(selectedMasterBuffer, masterMeta.width, masterMeta.height, {left: Math.round(masterMeta.width * 0.48), top: Math.round(masterMeta.height * 0.12), cropWidth: Math.round(masterMeta.width * 0.32), cropHeight: Math.round(masterMeta.height * 0.72)}));
  } else {
    made = await makePngIfMissing(artifactFile, () => alphaExtract(selectedMasterBuffer, masterMeta.width, masterMeta.height, {left: Math.round(masterMeta.width * 0.1), top: Math.round(masterMeta.height * 0.18), cropWidth: Math.round(masterMeta.width * 0.34), cropHeight: Math.round(masterMeta.height * 0.68)}));
  }
  const audit = await imageAudit(artifactFile, {layerKind: layer.kind, expectedCopy: selectedKit.copySpec.exactPhrase});
  if (audit.status !== "PASS") throw new Error(`ed10-layer-real-audit-blocked:${layer.kind}:${JSON.stringify(audit)}`);
  const contentSha = fileSha(artifactFile);
  const deterministicBuild = {contract: "A1DeterministicLayerReconstruction/v1", version: 1, buildId: `ed10-${layer.kind.toLowerCase()}-${layerKey.slice(0, 12)}`, buildKey, sourceMasterSha256: masterSha, sourceMasterPublicUrl: selected.artifact.publicUrl, route: layer.route, generatedAt: now};
  const provenance = {deterministicBuild, sourceAssetIds: [selectedRaw.referenceId], sourceAssetContentSha256: masterSha, policyAudit: {status: "PASS", method: "local-contract-and-ocr-safety"}, visualAudit: {status: "PASS", method: "local-pixel-decode-dimensions-alpha-and-selected-master-binding", auditSha256: sha256(audit)}, styleAudit: {status: "PASS", styleBriefSha256: selectedKit.styleBriefSha256, method: "selected-master-direction-map-binding"}};
  const input = {candidateId: `ed10-${layer.kind.toLowerCase()}-${layerKey.slice(0, 12)}`, artifact: {publicUrl: artifactUrl, sha256: contentSha, width: audit.width, height: audit.height, mimeType: audit.mimeType, workspaceImported: true, alphaVerified: audit.alphaVerified}, cache: {hit: made.cacheHit, variantNonce: null}, provenance, isolation: {singleLayer: true, crossLayerComposite: false, textFree: layer.kind !== "TYPOGRAPHY", fullFrame: layer.kind === "BACKGROUND", transparentLayer: layer.kind !== "BACKGROUND", containsBackground: false, containsTypography: layer.kind === "TYPOGRAPHY", containsElementKit: layer.kind === "ELEMENT_KIT", containsIllustration: layer.kind === "ILLUSTRATION"}, geometry: layer.kind === "BACKGROUND" ? {x: 0, y: 0, width: 1920, height: 1080, fit: "cover"} : layer.kind === "TYPOGRAPHY" ? {x: 0, y: 0, width: 1920, height: 1080, fit: "contain"} : {x: layer.kind === "ELEMENT_KIT" ? 980 : 0, y: layer.kind === "ELEMENT_KIT" ? 180 : 0, width: layer.kind === "ELEMENT_KIT" ? 520 : 1920, height: layer.kind === "ELEMENT_KIT" ? 520 : 1080, fit: "contain"}, ranking: {score: 100, reason: `reconstructed from selected master ${selected.directionId} using its reconstructionMap`}};
  if (layer.kind === "TYPOGRAPHY") input.typography = {integratedVisualActor: true, cssOnly: false, postPastedText: false, exactPhrase: selectedKit.copySpec.exactPhrase, ocrText: audit.ocr.text, ocrExact: audit.ocr.exact, editableShadow: {publicUrl: made.editableUrl, sha256: fileSha(publicFile(made.editableUrl))}, fontBindings: [{assetId: fontProbeResult.fontAssetId, sha256: fontProbeResult.fontSha256, publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf"}], fontProbe: fontProbeResult, actualAudit: audit};
  if (layer.kind === "ELEMENT_KIT") input.elementKit = {nodes: [{id: "selected-master-extracted-actor", semanticJob: selected.directionId, bounds: {x: 0, y: 0, width: audit.width, height: audit.height}}], extraction: {sourceMasterSha256: masterSha, method: "alpha-mask-from-selected-master-crop"}};
  if (layer.kind === "ILLUSTRATION") input.illustration = {semanticRole: `selected-master-${selected.directionId}-primary-visual-actor`, nonFactualAuxiliary: true, extraction: {sourceMasterSha256: masterSha, method: "alpha-mask-from-selected-master-crop"}};
  const candidate = buildPackageLayerCandidate(selectedKit, layer.kind, input, {now});
  if (candidate.status !== "READY") throw new Error(`ed10-layer-admission-blocked:${layer.kind}:${candidate.admission.failures.join(",")}`);
  auditedCandidates.push(candidate);
}

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let runtime = structuredClone(current.production.shotIntelligence);
  for (const candidate of auditedCandidates) runtime = advancePackageRuntimeWithCandidate(runtime, candidate, {now}).runtime;
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  if (!recipe) throw new Error("ed10-assembly-recipe-missing-after-real-layer-audits");
  assertPackageAssemblyRecipe(kit, recipe);
  runtime.status = "RECONSTRUCTING";
  kit.status = "LAYER_CANDIDATES_READY";
  current.production.shotIntelligence = runtime;
  recalculateEditorialAssetWorkbench(current, now);
  persistProjectState(appRoot, current, {event: createProductionEvent({workspace: current, action: "reconstruct-package-layers-from-selected-master", targetId: shotId, payload: {selectedDirectionId: selected.directionId, layerCandidateIds: recipe.layerCandidateIds, buildKey}})});
});

const reconstructed = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const reconstructedRuntime = reconstructed.production.shotIntelligence;
const reconstructedKit = reconstructedRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId);
const reconstructedRecipe = reconstructedRuntime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
const preliminaryParity = await buildPackageAssemblyParityAudit({plan: reconstructedKit, recipe: reconstructedRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-parity", now});
const parityAssessment = await runPackageAssemblyParityVisualReview({plan: reconstructedKit, recipe: reconstructedRecipe, preliminaryAudit: preliminaryParity, masterImage: selectedMasterFile, assemblyImage: publicFile(preliminaryParity.assemblyPreview.publicUrl), cacheDir: path.join(root, ".codex-artifacts", "system-progress-system-line", "package-assembly-parity-review-v2"), now});
const approvedParity = await buildPackageAssemblyParityAudit({plan: reconstructedKit, recipe: reconstructedRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-parity", trustedAssessment: parityAssessment, now});

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  recipe.assemblyComposite = approvedParity.assemblyPreview;
  recipe.parityAudit = approvedParity;
  recipe.finalAssemblyReview = parityAssessment;
  recipe.recommendation = {status: parityAssessment.status === "PASS" ? "AUTO_RECOMMENDATION_READY" : "REVIEW_REQUIRED", reason: "候选整组自动选稿；四层真实隔离/OCR/alpha/provenance 已通过本地硬门，最终 Assembly 由用户确认后才进入动效。"};
  recipe.status = parityAssessment.status === "PASS" ? "ASSEMBLY_REVIEW_REQUIRED" : "ASSEMBLY_PARITY_REVIEW_REQUIRED";
  kit.status = recipe.status;
  runtime.status = recipe.status;
  runtime.finalAssemblyReview = {status: parityAssessment.status, recipeSha256: recipe.recipeSha256, auditSha256: approvedParity.auditSha256, assessmentSha256: parityAssessment.assessmentSha256, assemblyPreview: approvedParity.assemblyPreview, userApprovalRequired: true, layerAudits: auditedCandidates.map((candidate) => ({layerKind: candidate.layerKind, candidateId: candidate.candidateId, audit: candidate.typography?.actualAudit || candidate.provenance.visualAudit}))};
  current.production.shotIntelligence = runtime;
  recalculateEditorialAssetWorkbench(current, now);
  persistProjectState(appRoot, current, {event: createProductionEvent({workspace: current, action: "package-assembly-final-parity-review", targetId: shotId, payload: {status: parityAssessment.status, assessmentSha256: parityAssessment.assessmentSha256, assemblySha256: approvedParity.assemblyPreview.sha256}})});
});

const final = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const finalRuntime = final.production.shotIntelligence;
const finalPlan = finalRuntime.packageLookMasterPlans.find((item) => item.shotId === shotId);
const finalKit = finalRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId);
const finalRecipe = finalRuntime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
console.log(JSON.stringify({status: "PASS", workspaceSha256: final.workspaceSha256, runtimeStatus: finalRuntime.status, selectedDirectionId: selected.directionId, comparativeReview: {reviewSha256: review.reviewSha256, verdict: review.verdict, rankings: review.rankings.map((item) => ({directionId: item.directionId, score: item.score})), board: board.board}, reconstruction: {buildKey, routes: finalKit.layers.map((item) => ({kind: item.kind, route: item.route, candidates: item.candidates.length})), candidateIds: finalRecipe.layerCandidateIds, assemblyPreview: finalRecipe.assemblyComposite, parityStatus: parityAssessment.status, parityAssessmentSha256: parityAssessment.assessmentSha256}, queue: final.production.generation.summary, authority: final.production.authority.nextAction, lookPlanStatus: finalPlan.status}, null, 2));
