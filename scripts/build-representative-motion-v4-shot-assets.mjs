#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths, verifyFontGlyphOutlineProof} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRoot = "generated/system-line/editorial-asset-workbench-v1";
const relativeRoot = "approved-master-layer-motion-pilot-v4/shot-assets";
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("representative-motion-v4-assets-expected-workspace-sha-required");

const imagegenSource = "/Users/a1/.codex/generated_images/019fef52-dee2-73f1-9e2d-53cec9b0b4ae/exec-f84875e1-0e20-4ce1-b9d0-b772e1bf5985.png";
const expectedImagegenSha256 = "bbc847fc8db8d59edee96f2dc5dadcd44e6e531cceef38332445f1732a390db7";
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const url = (relative) => `/${phaseRoot}/${relativeRoot}/${relative}`;
const binding = (buffer, publicUrl, width, height) => ({publicUrl, sha256: sha256(buffer), bytes: buffer.length, width, height});

const rejectionPath = path.join(publicRoot, phaseRoot, "approved-master-layer-motion-pilot-v3/deterministic-draft-rejection.json");
const rejection = JSON.parse(fs.readFileSync(rejectionPath, "utf8"));
if (rejection.status !== "VISUAL_REJECTED_DETERMINISTIC_DRAFT" || rejection.current !== false || rejection.supersededEvidence !== true || rejection.gates?.motionRenderAllowed !== false || rejection.gates?.workbenchCurrentAllowed !== false) throw new Error("representative-motion-v4-v3-rejection-gate-required");
if (!fs.existsSync(imagegenSource) || shaFile(imagegenSource) !== expectedImagegenSha256) throw new Error("representative-motion-v4-imagegen-source-sha-mismatch");
const imagegenMetadata = await sharp(imagegenSource).metadata();
if (imagegenMetadata.width !== 1672 || imagegenMetadata.height !== 941 || imagegenMetadata.format !== "png") throw new Error("representative-motion-v4-imagegen-source-dimensions-mismatch");
const imagegenBuffer = fs.readFileSync(imagegenSource);

const referenceRoot = path.join(publicRoot, "generated/system-line/reference-packs/pinterest-retro-pixel-v1");
const referenceManifest = JSON.parse(fs.readFileSync(path.join(referenceRoot, "manifest.json"), "utf8"));
const verifiedReference = (id, adoptedTraits) => {
  const item = referenceManifest.sources.find((entry) => entry.id === id);
  if (!item) throw new Error(`representative-motion-v4-reference-missing:${id}`);
  const file = path.join(referenceRoot, item.file);
  if (!fs.existsSync(file) || shaFile(file) !== item.sha256) throw new Error(`representative-motion-v4-reference-sha-mismatch:${id}`);
  return {id, publicUrl: item.publicUrl, sha256: item.sha256, role: item.role, adoptedTraits};
};
const references = [
  verifiedReference("pinterest-retro-pixel-03", ["singular machine clarity", "physical kit-of-parts causality"]),
  verifiedReference("pinterest-retro-pixel-06", ["dithered editorial image field", "controlled two-color printing"]),
  verifiedReference("pinterest-retro-pixel-07", ["halftone as dominant image logic", "asymmetric directional composition"]),
];

const fontRoot = path.join(publicRoot, phaseRoot, "font-cache");
const fonts = [
  {assetId: "type-editorial-heavy", family: "A1 Source Han Heavy", file: "SourceHanSansCN-Heavy.otf", sha256: "f178cae1188a31e7f5bdb268da9253b32c893aec56e0977118371aaf4cfc90f6"},
  {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", file: "fusion-pixel.ttf", sha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"},
].map((font) => {
  const filePath = path.join(fontRoot, font.file);
  if (!fs.existsSync(filePath) || shaFile(filePath) !== font.sha256) throw new Error(`representative-motion-v4-font-sha-mismatch:${font.assetId}`);
  return {...font, path: filePath, publicUrl: `/${phaseRoot}/font-cache/${font.file}`};
});

const styleBriefBody = {
  contract: "A1RetroPixelEditorialStyleBrief/v1",
  referencePackId: "pinterest-retro-pixel-v1",
  semanticJob: "一条连续纸带把左侧混乱写作材料演化为右侧可控工作流，四个阶段是同一因果动作而不是流程卡片",
  packageType: "FULLSCREEN_WORKFLOW_TAKEOVER",
  styleProfile: {id: "minimal-retro-pixel-editorial-v1", complexity: "minimal", rules: ["one-primary-actor", "one-semantic-action", "neutral-light-or-charcoal-base-plus-one-accent", "pixel-or-halftone-is-structural", "quiet-space-before-decoration"], backgroundPolicy: "neutral-canvas-v1", maxVisibleActors: 3, maxSemanticTextBlocks: 2, maxAccentColors: 1, maxSupportingFamilies: 1},
  surfacePolicy: {backgroundTone: "neutral-white", yellowCastForbidden: true, warmBackgroundUserApproved: false},
  visualWeight: {profile: "base-minimal", interfaceChrome: "none", maxControlRegions: 2, maxAccentCoveragePercent: 18},
  sourceReferences: references,
  atmosphere: {earlyComputerIntimacy: true, editorialUrgency: true, tactileImperfection: true, playfulIntelligence: true},
  variation: {primaryFamily: "dithered-editorial-poster", supportingFamilies: ["isometric-machine-collage"], surfaceLogic: "continuous-paper-ribbon-halftone-evolution", dominantActor: "single-paper-ribbon-causal-system", composition: "left-chaos-through-ribbon-to-right-terminal", palette: "neutral-white-charcoal-cobalt", material: "structured-pixel-halftone-paper", motionEnergy: "left-to-right-causal-unfold-and-lock"},
  typography: {displayFontAssetId: "type-pixel-correction", supportFontAssetId: "type-pixel-correction", fontFiles: fonts, editableTextRequired: true, systemFallbackForbidden: true, actualGlyphSourcePolicy: "ALL_VISIBLE_ED31_CHINESE_USES_A1_FUSION_PIXEL", editableTextSpec: {exactStrings: ["把写作的不便", "变成流程力", "整理", "编排", "读取", "检查", "可控工作流"], imagegenMicrotextPolicy: "TEXTURE_ONLY_NOT_EVIDENCE"}},
  formalOutput: {debugFree: true, referenceOnlyAssetsExcluded: true, fakeEvidenceForbidden: true},
  fingerprint: "dithered-editorial-poster|continuous-paper-ribbon-halftone-evolution|single-paper-ribbon-causal-system|left-chaos-through-ribbon-to-right-terminal|neutral-white-charcoal-cobalt",
  diversityHistoryPointer: "CURRENT_PROJECT_RECENT_APPROVED_OUTPUTS_READ_ONLY",
};
const styleBrief = {...styleBriefBody, styleBriefSha256: sha256(styleBriefBody)};
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-representative-v4-assets-"));
const tempBrief = path.join(tempRoot, "style-brief.json");
fs.writeFileSync(tempBrief, JSON.stringify(styleBrief, null, 2));
const styleAudit = JSON.parse(execFileSync(process.execPath, ["/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/scripts/audit-style-brief.mjs", tempBrief], {encoding: "utf8"}));
if (styleAudit.status !== "PASS") throw new Error(`representative-motion-v4-style-audit-blocked:${styleAudit.errors?.join(",")}`);

const fusionFont = fonts.find((font) => font.assetId === "type-pixel-correction");
const targetWidth = 960;
const targetHeight = 540;
const glyphRuns = Object.fromEntries(["把写作的不便", "变成", "流程力", "整理", "编排", "读取", "检查", "可控工作流"].map((text) => [text, buildFontGlyphOutlineRun({fontPath: fusionFont.path, text})]));
const glyphText = (text, options) => glyphOutlineRunToSvgPaths(glyphRuns[text], options);
const svgLayer = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">${body}</svg>`);
const renderPixelLayer = async (body) => {
  const {data, info} = await sharp(svgLayer(body)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 128) data.fill(0, index, index + 4);
    else data[index + 3] = 255;
  }
  const target = await sharp(data, {raw: info}).png().toBuffer();
  const formal = await sharp(target).resize(1672, 941, {fit: "fill", kernel: "nearest"}).png().toBuffer();
  return {target, formal};
};
const titleRaster = await renderPixelLayer(`<rect x="33" y="31" width="276" height="105" fill="#f5f5f2"/>${glyphText("把写作的不便", {x: 44, baseline: 72, fontSize: 32, fill: "#171b20"})}${glyphText("变成", {x: 44, baseline: 122, fontSize: 44, fill: "#171b20"})}${glyphText("流程力", {x: 125, baseline: 122, fontSize: 44, fill: "#164fe5"})}`);
const stageSpecs = [
  {id: "stage-organize", label: "整理", x: 201},
  {id: "stage-arrange", label: "编排", x: 379},
  {id: "stage-read", label: "读取", x: 557},
  {id: "stage-check", label: "检查", x: 707},
];
const stageRasters = Object.fromEntries(await Promise.all(stageSpecs.map(async ({id, label, x}, index) => [id, await renderPixelLayer(`<rect x="${x - 42}" y="472" width="84" height="39" fill="#f5f5f2"/><rect x="${x - 42}" y="472" width="15" height="39" fill="#171b20"/><text x="${x - 34.5}" y="497" font-family="monospace" font-size="11" text-anchor="middle" fill="#ffffff">${String(index + 1).padStart(2, "0")}</text>${glyphText(label, {x: x + 8, baseline: 502, fontSize: 28, fill: "#171b20", anchor: "middle"})}`)])));
const resultRaster = await renderPixelLayer(`<rect x="748" y="48" width="181" height="48" fill="#164fe5"/>${glyphText("可控工作流", {x: 838.5, baseline: 82, fontSize: 28, fill: "#ffffff", anchor: "middle"})}`);
const titleLayer = titleRaster.formal;
const stageLayers = Object.fromEntries(stageSpecs.map(({id}) => [id, stageRasters[id].formal]));
const resultLayer = resultRaster.formal;

const ed31Final = await sharp(imagegenBuffer).composite([
  {input: titleLayer},
  ...stageSpecs.map(({id}) => ({input: stageLayers[id]})),
  {input: resultLayer},
]).png().toBuffer();
const ed31TargetComposite = await sharp(imagegenBuffer).resize(targetWidth, targetHeight, {fit: "fill"}).composite([{input: titleRaster.target}, ...stageSpecs.map(({id}) => ({input: stageRasters[id].target})), {input: resultRaster.target}]).png().toBuffer();
const cropSpecs = {
  title: {left: 24, top: 18, width: 310, height: 126},
  stages: {left: 120, top: 455, width: 650, height: 80},
  result: {left: 748, top: 34, width: 202, height: 74},
};
const fontProofCrops = Object.fromEntries(await Promise.all(Object.entries(cropSpecs).map(async ([id, crop]) => [id, await sharp(ed31TargetComposite).extract(crop).png().toBuffer()])));

const ed13Source = path.join(publicRoot, phaseRoot, "approved-master-layer-motion-pilot-v3/shot-assets/ED-13/typography-clean.png");
const ed13SourceProof = JSON.parse(fs.readFileSync(path.join(publicRoot, phaseRoot, "approved-master-layer-motion-pilot-v3/shot-assets/ED-13/typography-reduction-proof.json"), "utf8"));
if (ed13SourceProof.status !== "PASS" || shaFile(ed13Source) !== ed13SourceProof.output.sha256) throw new Error("representative-motion-v4-ed13-retained-clean-layer-invalid");
const ed13Buffer = fs.readFileSync(ed13Source);
const {data: ed13Pixels, info: ed13Info} = await sharp(ed13Buffer).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const forbiddenRegions = [{id: "decorative-blue-underline", x: 50, y: 360, width: 650, height: 32}, {id: "lower-right-small-icon", x: 1370, y: 700, width: 120, height: 120}];
const alphaCount = (rect) => {
  let count = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) for (let x = rect.x; x < rect.x + rect.width; x += 1) if (ed13Pixels[(y * ed13Info.width + x) * 4 + 3] > 0) count += 1;
  return count;
};
const forbiddenRegionAlphaPixels = Object.fromEntries(forbiddenRegions.map((rect) => [rect.id, alphaCount(rect)]));
if (Object.values(forbiddenRegionAlphaPixels).some((count) => count !== 0)) throw new Error(`representative-motion-v4-ed13-actual-pixel-residue:${JSON.stringify(forbiddenRegionAlphaPixels)}`);
const v2Props = JSON.parse(fs.readFileSync(path.join(publicRoot, phaseRoot, "approved-master-layer-motion-pilot-v2/input-props.json"), "utf8"));
const ed13Base = v2Props.shots.find((shot) => shot.shotId === "ED-13")?.baseFrame;
if (!ed13Base) throw new Error("representative-motion-v4-ed13-base-frame-missing");
const ed13BasePath = path.join(publicRoot, ed13Base.publicUrl.replace(/^\//u, ""));
if (shaFile(ed13BasePath) !== ed13Base.sha256) throw new Error("representative-motion-v4-ed13-base-frame-sha-mismatch");
const ed13Final = await sharp(ed13BasePath).resize(1672, 941, {fit: "fill"}).composite([{input: ed13Buffer}]).png().toBuffer();

const ed31MasterBinding = binding(imagegenBuffer, url("ED-31/imagegen-look-master-paper-ribbon-v1.png"), 1672, 941);
const titleBinding = binding(titleLayer, url("ED-31/text-title.png"), 1672, 941);
const stageBindings = Object.fromEntries(stageSpecs.map(({id}) => [id, binding(stageLayers[id], url(`ED-31/text-${id}.png`), 1672, 941)]));
const resultBinding = binding(resultLayer, url("ED-31/text-result.png"), 1672, 941);
const ed31FinalBinding = binding(ed31Final, url("ED-31/stable-composite.png"), 1672, 941);
const ed13Binding = binding(ed13Buffer, url("ED-13/typography-clean.png"), 1672, 941);
const ed13FinalBinding = binding(ed13Final, url("ED-13/stable-composite.png"), 1672, 941);
const fontProofCropBindings = Object.fromEntries(Object.entries(fontProofCrops).map(([id, buffer]) => [id, binding(buffer, url(`ED-31/font-proof-${id}-960x540-crop.png`), cropSpecs[id].width, cropSpecs[id].height)]));
const outlineProof = Object.fromEntries(Object.entries(glyphRuns).map(([text, run]) => [text, {postscriptName: run.postscriptName, glyphIds: run.glyphs.map((glyph) => glyph.glyphId), outlineSha256: run.outlineSha256}]));
const fontProofBody = {contract: "A1RepresentativeED31ActualPixelFontProof/v2", shotId: "ED-31", status: "ACTUAL_PIXEL_FONT_PASS", targetRaster: {width: targetWidth, height: targetHeight, resamplingToFormal: "NEAREST_NEIGHBOR"}, actualGlyphSource: {assetId: fusionFont.assetId, family: fusionFont.family, file: fusionFont.file, sha256: fusionFont.sha256, publicUrl: fusionFont.publicUrl, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", cssFontDeclarationAcceptedAsProof: false}, visibleChineseStrings: ["把写作的不便", "变成流程力", "整理", "编排", "读取", "检查", "可控工作流"], outlineProof, sourceHanVisibleGlyphCount: 0, binaryAlphaEdges: true, crops: fontProofCropBindings, targetCompositeDecodedPixelSha256: sha256((await sharp(ed31TargetComposite).ensureAlpha().raw().toBuffer()))};
const fontProof = {...fontProofBody, proofSha256: sha256(fontProofBody)};
verifyFontGlyphOutlineProof({proof: fontProof, fontPath: fusionFont.path, expectedFontSha256: fusionFont.sha256});

const imagegenProofBody = {
  contract: "A1RepresentativeImageGenLookMasterProof/v1",
  shotId: "ED-31",
  status: "USER_SELECTED_IMAGEGEN_MASTER_READY_FOR_BOUNDED_MOTION",
  visualApproval: "NOT_APPROVED",
  provider: "built-in-imagegen",
  costPolicy: "SUBSCRIPTION_ZERO_EXTRA_COST_ONLY",
  source: {absolutePath: imagegenSource, sha256: expectedImagegenSha256, width: 1672, height: 941, candidate: "B", direction: "paper-ribbon-evolution"},
  importedMaster: ed31MasterBinding,
  finalStableComposite: ed31FinalBinding,
  preservation: {rasterIsPrimaryArtComposition: true, redrawForbidden: true, genericCardOrFlowchartReconstructionForbidden: true, localCodeScope: ["mask", "crop", "motion", "exact-chinese-typography"], microGeneratedTextPolicy: "TEXTURE_ONLY_NOT_READABLE_EVIDENCE"},
  semanticSequence: ["left-paper-pile-entry", "paper-ribbon-unfold-and-converge", "organize", "arrange", "magnifier-read", "check", "right-blue-terminal-lock"],
  exactChinese: ["把写作的不便", "变成流程力", "整理", "编排", "读取", "检查", "可控工作流"],
  styleBriefSha256: styleBrief.styleBriefSha256,
  referenceBindings: references,
  fontBindings: fonts,
  actualPixelFontProofSha256: fontProof.proofSha256,
  oldDeterministicDraft: {status: rejection.status, current: false, supersededEvidence: true, motionRenderAllowed: false},
};
const imagegenProof = {...imagegenProofBody, proofSha256: sha256(imagegenProofBody)};
const ed13ProofBody = {contract: "A1RepresentativeED13ActualPixelReductionProof/v1", shotId: "ED-13", status: "ACTUAL_PIXEL_PASS", sourceSha256: ed13SourceProof.output.sha256, output: ed13Binding, stableComposite: ed13FinalBinding, exactGlyphPixelsRetyped: false, baseFrameSha256: ed13Base.sha256, forbiddenRegions, forbiddenRegionAlphaPixels, requiredZeroAlpha: true, presenterDominancePreserved: true};
const ed13Proof = {...ed13ProofBody, proofSha256: sha256(ed13ProofBody)};
const manifestBody = {contract: "A1RepresentativeMotionV4ShotAssetManifest/v1", status: "IMAGEGEN_MASTER_AND_ED13_REDUCTION_READY", affectedShotIds: ["ED-13", "ED-31"], reusedShotIds: ["ED-10", "ED-14", "ED-17"], sourceV2PropsSha256: v2Props.propsSha256, rejectedV3Status: rejection.status, imagegenMasterSha256: ed31MasterBinding.sha256, imagegenProofSha256: imagegenProof.proofSha256, styleBriefSha256: styleBrief.styleBriefSha256, ed31ActualPixelFontProofSha256: fontProof.proofSha256, ed13ProofSha256: ed13Proof.proofSha256, outputs: {ed31Master: ed31MasterBinding, ed31Title: titleBinding, ed31Stages: stageBindings, ed31Result: resultBinding, ed31StableComposite: ed31FinalBinding, ed31FontProofCrops: fontProofCropBindings, ed13Typography: ed13Binding, ed13StableComposite: ed13FinalBinding}};
const manifest = {...manifestBody, manifestSha256: sha256(manifestBody)};

const binaryFiles = {
  [`${relativeRoot}/ED-31/imagegen-look-master-paper-ribbon-v1.png`]: imagegenBuffer,
  [`${relativeRoot}/ED-31/text-title.png`]: titleLayer,
  ...Object.fromEntries(stageSpecs.map(({id}) => [`${relativeRoot}/ED-31/text-${id}.png`, stageLayers[id]])),
  [`${relativeRoot}/ED-31/text-result.png`]: resultLayer,
  [`${relativeRoot}/ED-31/stable-composite.png`]: ed31Final,
  ...Object.fromEntries(Object.entries(fontProofCrops).map(([id, buffer]) => [`${relativeRoot}/ED-31/font-proof-${id}-960x540-crop.png`, buffer])),
  [`${relativeRoot}/ED-13/typography-clean.png`]: ed13Buffer,
  [`${relativeRoot}/ED-13/stable-composite.png`]: ed13Final,
};

const committed = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`representative-motion-v4-assets-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.assembly.status !== "NOT_CREATED" || current.production.assembly.productionWired !== false || current.production.motion.aeLevelProven !== false || current.production.assembly.userVisualApproval !== "NOT_APPROVED") throw new Error("representative-motion-v4-assets-locks-required");
  const now = new Date().toISOString();
  let next = structuredClone(current);
  next.production.shotIntelligence.representativeMotionV4ShotAssets = {...manifest, publicUrl: url("manifest.json"), updatedAt: now};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "build-representative-motion-v4-shot-assets", targetId: "ED-13,ED-31", payload: {manifestSha256: manifest.manifestSha256, imagegenMasterSha256: ed31MasterBinding.sha256, ed13ProofSha256: ed13Proof.proofSha256}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `representative-motion-v4-assets-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${relativeRoot}/ED-31/style-brief.json`]: styleBrief, [`${relativeRoot}/ED-31/style-brief-audit.json`]: styleAudit, [`${relativeRoot}/ED-31/imagegen-look-master-proof.json`]: imagegenProof, [`${relativeRoot}/ED-31/actual-pixel-font-proof.json`]: fontProof, [`${relativeRoot}/ED-13/actual-pixel-reduction-proof.json`]: ed13Proof, [`${relativeRoot}/manifest.json`]: manifest}, binaryFiles});
});

console.log(JSON.stringify({status: manifest.status, workspaceSha256Before: expectedWorkspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256, manifestSha256: manifest.manifestSha256, imagegenMaster: ed31MasterBinding, ed31StableComposite: ed31FinalBinding, actualPixelFontProofSha256: fontProof.proofSha256, fontProofCrops: fontProofCropBindings, ed13Typography: ed13Binding, ed13ForbiddenRegionAlphaPixels: forbiddenRegionAlphaPixels, styleAuditStatus: styleAudit.status, v3Status: rejection.status}, null, 2));
