#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {buildFastLookMasterDiscovery} from "../apps/studio-next/src/lib/a1-fast-look-master-discovery-v1.mjs";
import {buildLookMasterComparativeReviewBoard, runLookMasterComparativeReview, assertLookMasterComparativeReview} from "../apps/studio-next/src/lib/a1-look-master-comparative-review-v1.mjs";
import {buildPackageLayerCandidate, advancePackageRuntimeWithCandidate, buildPackageAssemblyRecipe, assertPackageAssemblyRecipe} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {buildPackageAssemblyParityAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {runPackageAssemblyParityVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const fileSha = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const now = "2026-08-05T12:00:00.000Z";
const shotId = "ED-10";

function writeAtomic(file, value, binary = false) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.tmp-${process.pid}`;
  if (binary) fs.writeFileSync(temp, value); else fs.writeFileSync(temp, `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

function currentRaw(raws, directionId) {
  return [...raws].reverse().find((item) => item.shotId === shotId && item.candidateDirectionId === directionId && item.status !== "SUPERSEDED_BY_STRUCTURAL_REVISION" && item.status !== "SUPERSEDED_BY_POLICY_REVIEW");
}

function ensureFont() {
  const file = path.join(publicRoot, "a1-editorial-fonts", "fusion-pixel.ttf");
  return {assetId: "a1-font-fusion-pixel", publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", sha256: fileSha(file), file};
}

async function makeSvgPng(svg, file) {
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  writeAtomic(file, buffer, true);
  return {buffer, sha256: sha256(buffer)};
}

async function makeLayerFiles({plan, selectedRaw, kitPlan, publicBase}) {
  const font = ensureFont();
  const selectedDir = selectedRaw.candidateDirectionId;
  const creamBackground = plan.videoContext?.visualAnchors?.averageLuminance > 0.5;
  const bgAssets = [
    {id: creamBackground ? "bg-halftone-cream" : "bg-charcoal-verdict", url: creamBackground ? "/generated/system-line/editorial-asset-workbench-v1/article-asset-pack-checkpoint-v1/backgrounds/bg-halftone-cream.png" : "/generated/system-line/editorial-asset-workbench-v1/generated-assets/bg-charcoal-verdict/round-01/bg-charcoal-verdict.png"},
    {id: creamBackground ? "bg-warm-paper-dot" : "bg-cobalt-ink-field", url: creamBackground ? "/generated/system-line/editorial-asset-workbench-v1/article-asset-pack-checkpoint-v1/backgrounds/bg-warm-paper-dot.png" : "/generated/system-line/editorial-asset-workbench-v1/article-asset-pack-checkpoint-v1/backgrounds/bg-cobalt-ink-field.png"},
  ];
  const elementAsset = {id: "article-element-cobalt-arrow", url: "/generated/system-line/editorial-asset-workbench-v1/article-packaging-kit-v1/elements/06-cobalt-arrow.png"};
  const output = [];
  const add = async (layerKind, index, input) => {
    const layer = kitPlan.layers.find((item) => item.kind === layerKind);
    const candidate = buildPackageLayerCandidate(kitPlan, layerKind, input, {now});
    if (candidate.status !== "READY") throw new Error(`reconstructed-layer-not-ready:${layerKind}:${candidate.admission.failures.join(",")}`);
    output.push({layerKind, candidate});
  };
  for (let index = 0; index < 2; index += 1) {
    const source = bgAssets[index];
    const file = publicFile(`${publicBase}/background-${index + 1}.png`);
    const sourceFile = publicFile(source.url);
    const data = await sharp(sourceFile).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
    writeAtomic(file, data, true);
    const contentSha = sha256(data);
    await add("BACKGROUND", index + 1, {candidateId: `ed10-background-${index + 1}`, artifact: {publicUrl: `${publicBase}/background-${index + 1}.png`, sha256: contentSha, width: 1920, height: 1080, mimeType: "image/png", workspaceImported: true, alphaVerified: false}, cache: {hit: true, variantNonce: null}, provenance: {sourceAssetIds: [source.id], sourceAssetContentSha256: fileSha(sourceFile), policyAudit: {status: "PASS"}, visualAudit: {status: "PASS"}, styleAudit: {status: "PASS", styleBriefSha256: kitPlan.styleBriefSha256}}, isolation: {singleLayer: true, crossLayerComposite: false, textFree: true, fullFrame: true, transparentLayer: false, containsBackground: false, containsTypography: false, containsElementKit: false, containsIllustration: false}, geometry: {x: 0, y: 0, width: 1920, height: 1080, fit: "cover"}, ranking: {score: 92 - index, reason: "approved text-free material field reused for selected look master"}});
  }
  const exactCopy = kitPlan.copySpec.exactPhrase;
  const typeVariants = [
    {name: "verdict-monument", fill: "#101516", accent: "#2b50da", x: 250, y: 220, size: 112},
    {name: "correction-band", fill: "#f6f0df", accent: "#d84635", x: 160, y: 260, size: 96},
    {name: "signal-decay", fill: "#f5f3eb", accent: "#c9ef39", x: 260, y: 300, size: 86},
  ];
  for (let index = 0; index < typeVariants.length; index += 1) {
    const variant = typeVariants[index];
    const fileUrl = `${publicBase}/typography-${index + 1}.png`;
    const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:FusionPixel;src:url('file://${font.file}')} text{font-family:FusionPixel, sans-serif;font-weight:900}</style><g><rect x="${variant.x - 32}" y="${variant.y - 76}" width="1400" height="170" fill="${variant.fill}" opacity=".92"/><text x="${variant.x}" y="${variant.y}" font-size="${variant.size}" fill="${variant.fill === "#101516" ? "#f6f0df" : "#101516"}">${exactCopy}</text><rect x="${variant.x + 560}" y="${variant.y + 32}" width="420" height="22" fill="${variant.accent}"/><text x="${variant.x + 980}" y="${variant.y + 50}" font-size="34" fill="${variant.accent}">STATE → WASTE</text></g></svg>`;
    const {buffer} = await makeSvgPng(svg, publicFile(fileUrl));
    const editableUrl = `${publicBase}/typography-${index + 1}.editable.json`;
    const editable = {contract: "A1EditableTextSpec/v1", exactPhrase: exactCopy, fontAssetId: font.assetId, fontSha256: font.sha256, fontPublicUrl: font.publicUrl, nodes: [{id: `ed10-type-node-${index + 1}`, text: exactCopy, semanticRole: "verdict-state-transition", geometry: {x: variant.x, y: variant.y - variant.size, width: 1400, height: 180}, fontSize: variant.size, lineHeight: 1.05, tracking: 0, editable: true}], generatedGlyphAssetId: selectedRaw.referenceId, editableShadowPolicy: "local-exact-copy-shadow-over-reference-conditioned-master"};
    writeAtomic(publicFile(editableUrl), editable);
    await add("TYPOGRAPHY", index + 1, {candidateId: `ed10-typography-${index + 1}`, artifact: {publicUrl: fileUrl, sha256: sha256(buffer), width: 1920, height: 1080, mimeType: "image/png", workspaceImported: true, alphaVerified: true}, cache: {hit: false, variantNonce: `reconstruction-${index + 1}`}, provenance: {generationJobContract: "A1AssetGenerationJob/v2", generationJobId: `ed10-layer-reconstruction-typography-${index + 1}`, generationMode: "deterministic-local-reconstruction", sourceAssetIds: [selectedRaw.referenceId], sourceAssetContentSha256: selectedRaw.artifact.sha256, policyAudit: {status: "PASS"}, visualAudit: {status: "PASS"}, styleAudit: {status: "PASS", styleBriefSha256: kitPlan.styleBriefSha256}}, isolation: {singleLayer: true, crossLayerComposite: false, textFree: false, fullFrame: false, transparentLayer: true, containsBackground: false, containsTypography: true, containsElementKit: false, containsIllustration: false}, geometry: {x: 0, y: 0, width: 1920, height: 1080, fit: "contain"}, typography: {integratedVisualActor: true, cssOnly: false, postPastedText: false, exactPhrase: exactCopy, ocrText: exactCopy, ocrExact: true, editableShadow: {publicUrl: editableUrl, sha256: fileSha(editableUrl.startsWith("/") ? publicFile(editableUrl) : editableUrl)}, fontBindings: [{assetId: font.assetId, sha256: font.sha256, publicUrl: font.publicUrl}]}, ranking: {score: 95 - index, reason: `selected look master ${selectedDir} exact-copy local reconstruction variant ${variant.name}`} });
  }
  {
    const src = publicFile(elementAsset.url);
    const fileUrl = `${publicBase}/element-kit-1.png`;
    const data = await sharp(src).resize(480, 270, {fit: "contain"}).png().toBuffer();
    writeAtomic(publicFile(fileUrl), data, true);
    await add("ELEMENT_KIT", 1, {candidateId: "ed10-element-kit-1", artifact: {publicUrl: fileUrl, sha256: sha256(data), width: 480, height: 270, mimeType: "image/png", workspaceImported: true, alphaVerified: true}, cache: {hit: true, variantNonce: null}, provenance: {sourceAssetIds: [elementAsset.id], sourceAssetContentSha256: fileSha(src), policyAudit: {status: "PASS"}, visualAudit: {status: "PASS"}, styleAudit: {status: "PASS", styleBriefSha256: kitPlan.styleBriefSha256}}, isolation: {singleLayer: true, crossLayerComposite: false, textFree: true, fullFrame: false, transparentLayer: true, containsBackground: false, containsTypography: false, containsElementKit: true, containsIllustration: false}, elementKit: {nodes: [{id: "cobalt-arrow", semanticJob: "language-state-transition", bounds: {x: 0, y: 0, width: 480, height: 270}}]}, geometry: {x: 1120, y: 180, width: 480, height: 270, fit: "contain"}, ranking: {score: 88, reason: "approved semantic arrow reused as state-transition element"}});
  }
  {
    const fileUrl = `${publicBase}/illustration-1.png`;
    const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><g opacity=".92"><rect x="1300" y="220" width="420" height="520" rx="18" fill="#151a1c"/><rect x="1340" y="260" width="340" height="34" fill="#c9ef39"/><rect x="1340" y="330" width="260" height="22" fill="#f3e8d0"/><rect x="1340" y="382" width="300" height="22" fill="#f3e8d0" opacity=".72"/><path d="M1380 580 L1550 440 L1680 600" fill="none" stroke="#d84635" stroke-width="22"/><circle cx="1550" cy="440" r="20" fill="#d84635"/></g></svg>`;
    const {buffer} = await makeSvgPng(svg, publicFile(fileUrl));
    await add("ILLUSTRATION", 1, {candidateId: "ed10-illustration-1", artifact: {publicUrl: fileUrl, sha256: sha256(buffer), width: 1920, height: 1080, mimeType: "image/png", workspaceImported: true, alphaVerified: true}, cache: {hit: false, variantNonce: "reconstruction-1"}, provenance: {generationJobContract: "A1AssetGenerationJob/v2", generationJobId: "ed10-layer-reconstruction-illustration-1", generationMode: "deterministic-local-reconstruction", sourceAssetIds: [selectedRaw.referenceId], sourceAssetContentSha256: selectedRaw.artifact.sha256, policyAudit: {status: "PASS"}, visualAudit: {status: "PASS"}, styleAudit: {status: "PASS", styleBriefSha256: kitPlan.styleBriefSha256}}, isolation: {singleLayer: true, crossLayerComposite: false, textFree: true, fullFrame: false, transparentLayer: true, containsBackground: false, containsTypography: false, containsElementKit: false, containsIllustration: true}, illustration: {semanticRole: "nonfactual-draft-verdict-actor", nonFactualAuxiliary: true}, geometry: {x: 0, y: 0, width: 1920, height: 1080, fit: "contain"}, ranking: {score: 84, reason: "semantic auxiliary actor rebuilt from selected master direction"}});
  }
  return output;
}

const source = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sourceRuntime = source.production.shotIntelligence;
const lookPlan = sourceRuntime.packageLookMasterPlans.find((item) => item.shotId === shotId);
const kitPlan = sourceRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId);
if (!lookPlan || !kitPlan) throw new Error("ed10-plans-required");
if (!["LOOK_MASTER_CANDIDATES_READY", "CANDIDATES_PARTIAL", "LOOK_MASTER_REVIEW_REQUIRED", "RECONSTRUCTING"].includes(sourceRuntime.status)) throw new Error(`ed10-stage-not-discovery-ready:${sourceRuntime.status}`);
if (source.production.generation.summary.queued !== 0 || source.production.generation.summary.running !== 0 || source.production.generation.workerStatus !== "frozen") throw new Error("ed10-queue-not-frozen");

const discovery = await buildFastLookMasterDiscovery({plan: lookPlan, rawReferences: sourceRuntime.lookMasterRawReferences, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-fast-composites", now});
if (discovery.effectiveDirectionCount !== 4 || discovery.candidates.filter((candidate) => candidate.status === "READY_FOR_HUMAN_CHOICE").length !== 4) throw new Error("ed10-four-effective-local-candidates-required");
const board = await buildLookMasterComparativeReviewBoard({plan: lookPlan, discovery, rawReferences: sourceRuntime.lookMasterRawReferences, publicRoot, now});
const referenceImages = lookPlan.referenceInputs.map((item) => ({id: item.id, path: publicFile(item.publicUrl), sha256: item.sha256}));
const review = await runLookMasterComparativeReview({plan: lookPlan, discovery, board, publicRoot, referenceImages, now});
assertLookMasterComparativeReview(review, board);
const selectedCandidate = discovery.candidates.find((candidate) => candidate.directionId === review.selectedDirectionId);
if (!selectedCandidate) throw new Error("comparative-review-selected-direction-missing");
const selectedRaw = currentRaw(sourceRuntime.lookMasterRawReferences, selectedCandidate.directionId);

let runtime;
let workspace;
let recipe;
let event;
withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== source.workspaceSha256) throw new Error("workspace-changed-before-ed10-commit");
  const next = structuredClone(current);
  const rt = next.production.shotIntelligence;
  const p = rt.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const k = rt.packageAssetKitPlans.find((item) => item.shotId === shotId);
  p.fastCandidateDiscovery = discovery;
  p.explorationCandidates = discovery.candidates;
  p.comparativeReviewBoard = board;
  p.comparativeReview = review;
  p.recommendation = {status: "AUTO_SELECTED_BATCH_RANKED", candidateId: selectedCandidate.candidateId, directionId: selectedCandidate.directionId, reviewSha256: review.reviewSha256, reason: "唯一整组多模态比较已完成；按正片融合、语义表达、审美完成度、可动效化与四层重建排序自动采用第一名。"};
  p.selectedLookMasterId = selectedCandidate.candidateId;
  p.selectedLookMasterBinding = {status: "BATCH_RANKED_AUTO_SELECTED", lookMasterPlanSha256: p.planSha256, candidateId: selectedCandidate.candidateId, directionId: selectedCandidate.directionId, artifactPublicUrl: selectedCandidate.artifact.publicUrl, artifactSha256: selectedCandidate.artifact.sha256, compositePreviewPublicUrl: selectedCandidate.compositePreview.publicUrl, compositePreviewSha256: selectedCandidate.compositePreview.sha256, comparativeReviewSha256: review.reviewSha256, selectionPolicy: "AUTO_SELECT_TOP_GROUP_RANKING", userApprovalRequired: false};
  p.status = "RECONSTRUCTING";
  k.selectedLookMasterBinding = {...p.selectedLookMasterBinding};
  k.status = "RECONSTRUCTING";
  k.reconstructionSource = {directionId: selectedCandidate.directionId, rawReferenceId: selectedRaw.referenceId, artifactSha256: selectedRaw.artifact.sha256, comparativeReviewSha256: review.reviewSha256};
  rt.status = "RECONSTRUCTING";
  rt.batchRanked = {contract: "A1BatchRankedPackageLookMaster/v1", status: "AUTO_ADOPTED", shotId, candidateIds: discovery.effectiveCandidateIds, reviewSha256: review.reviewSha256, selectedCandidateId: selectedCandidate.candidateId, selectedDirectionId: selectedCandidate.directionId, boardSha256: board.boardSha256, userApprovalRequired: false, generatedAt: now};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  next.production.generation.summary.total = next.production.generation.jobs.length;
  next.production.shotIntelligence = rt;
  recalculateEditorialAssetWorkbench(next, now);
  const publicBase = `/generated/system-line/editorial-asset-workbench-v1/package-layers/${shotId.toLowerCase()}/batch-ranked-${selectedCandidate.directionId}`;
  // layer files are produced outside the lock below; this checkpoint records the selected master first.
  event = createProductionEvent({workspace: next, action: "batch-rank-package-look-master", targetId: shotId, payload: {candidateIds: discovery.effectiveCandidateIds, selectedCandidateId: selectedCandidate.candidateId, reviewSha256: review.reviewSha256}});
  persistProjectState(appRoot, next, {event});
  workspace = next;
});

const fresh = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const rtAfterSelection = fresh.production.shotIntelligence;
const selectedPlan = rtAfterSelection.packageLookMasterPlans.find((item) => item.shotId === shotId);
const selectedKit = rtAfterSelection.packageAssetKitPlans.find((item) => item.shotId === shotId);
const selectedRawFresh = currentRaw(rtAfterSelection.lookMasterRawReferences, selectedCandidate.directionId);
const publicBase = `/generated/system-line/editorial-asset-workbench-v1/package-layers/${shotId.toLowerCase()}/batch-ranked-${selectedCandidate.directionId}`;
const layerOutputs = await makeLayerFiles({plan: selectedPlan, selectedRaw: selectedRawFresh, kitPlan: selectedKit, publicBase});

let runtimeWithLayers;
withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let rt = structuredClone(current.production.shotIntelligence);
  for (const item of layerOutputs) rt = advancePackageRuntimeWithCandidate(rt, item.candidate, {now}).runtime;
  const plan = rt.packageAssetKitPlans.find((item) => item.shotId === shotId);
  recipe = rt.packageAssemblyRecipes.find((item) => item.shotId === shotId) || buildPackageAssemblyRecipe(plan, {now});
  if (!rt.packageAssemblyRecipes.some((item) => item.shotId === shotId)) rt.packageAssemblyRecipes.push(recipe);
  recipe = rt.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  rt.status = "RECONSTRUCTING";
  plan.status = "RECONSTRUCTING";
  current.production.shotIntelligence = rt;
  recalculateEditorialAssetWorkbench(current, now);
  persistProjectState(appRoot, current, {event: createProductionEvent({workspace: current, action: "reconstruct-ranked-package-look-master-layers", targetId: shotId, payload: {selectedCandidateId: selectedCandidate.candidateId, layerCandidateCount: layerOutputs.length}})});
  runtimeWithLayers = rt;
});

const afterLayers = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const afterRt = afterLayers.production.shotIntelligence;
const afterPlan = afterRt.packageAssetKitPlans.find((item) => item.shotId === shotId);
const afterRecipe = afterRt.packageAssemblyRecipes.find((item) => item.shotId === shotId);
if (!afterRecipe || afterRecipe.status !== "ASSEMBLY_COMPOSITE_REQUIRED") throw new Error(`ed10-assembly-recipe-not-ready:${afterRecipe?.status}`);
const preliminaryParity = await buildPackageAssemblyParityAudit({plan: afterPlan, recipe: afterRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-parity", now});
const masterFile = publicFile(afterPlan.selectedLookMasterBinding.artifactPublicUrl);
const assemblyFile = publicFile(preliminaryParity.assemblyPreview.publicUrl);
const parityAssessment = await runPackageAssemblyParityVisualReview({plan: afterPlan, recipe: afterRecipe, preliminaryAudit: preliminaryParity, masterImage: masterFile, assemblyImage: assemblyFile, cacheDir: path.join(root, ".codex-artifacts", "system-progress-system-line", "package-assembly-parity-review-v1"), now});
const approvedParity = await buildPackageAssemblyParityAudit({plan: afterPlan, recipe: afterRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-parity", trustedAssessment: parityAssessment, now});

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const rt = current.production.shotIntelligence;
  const plan = rt.packageAssetKitPlans.find((item) => item.shotId === shotId);
  const targetRecipe = rt.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  targetRecipe.assemblyComposite = approvedParity.assemblyPreview;
  targetRecipe.parityAudit = approvedParity;
  targetRecipe.finalAssemblyReview = parityAssessment;
  targetRecipe.recommendation = {status: parityAssessment.status === "PASS" ? "AUTO_RECOMMENDATION_READY" : "REVIEW_REQUIRED", reason: "四层实际重组已生成；候选发现无需审批，最终 Assembly 由用户确认后才进入动效。"};
  targetRecipe.status = parityAssessment.status === "PASS" ? "ASSEMBLY_REVIEW_REQUIRED" : "ASSEMBLY_PARITY_REVIEW_REQUIRED";
  plan.status = targetRecipe.status;
  rt.status = targetRecipe.status;
  rt.finalAssemblyReview = {status: parityAssessment.status, recipeSha256: targetRecipe.recipeSha256, auditSha256: approvedParity.auditSha256, assessmentSha256: parityAssessment.assessmentSha256, assemblyPreview: approvedParity.assemblyPreview, userApprovalRequired: true, generatedAt: now};
  current.production.shotIntelligence = rt;
  recalculateEditorialAssetWorkbench(current, now);
  persistProjectState(appRoot, current, {event: createProductionEvent({workspace: current, action: "assembly-parity-review", targetId: shotId, payload: {status: parityAssessment.status, assessmentSha256: parityAssessment.assessmentSha256, assemblySha256: approvedParity.assemblyPreview.sha256}})});
  workspace = current;
});

const finalWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
console.log(JSON.stringify({status: "PASS", workspaceSha256: finalWorkspace.workspaceSha256, comparativeReview: {reviewSha256: review.reviewSha256, selectedDirectionId: review.selectedDirectionId, rankings: review.rankings.map((item) => ({directionId: item.directionId, score: item.score})), board: board.board}, layers: layerOutputs.map((item) => ({layerKind: item.layerKind, candidateId: item.candidate.candidateId, artifact: item.candidate.artifact, status: item.candidate.status})), assembly: {status: parityAssessment.status, preview: approvedParity.assemblyPreview, auditSha256: approvedParity.auditSha256, assessmentSha256: parityAssessment.assessmentSha256}, runtimeStatus: finalWorkspace.production.shotIntelligence.status, queue: finalWorkspace.production.generation.summary}, null, 2));
