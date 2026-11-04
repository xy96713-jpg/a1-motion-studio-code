#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const relativeRoot = "approved-master-layer-motion-pilot-v3/shot-assets";
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("representative-motion-v3-assets-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const binding = (buffer, publicUrl, width, height) => ({publicUrl, sha256: sha256(buffer), bytes: buffer.length, width, height});
const publicUrl = (relative) => `/generated/system-line/editorial-asset-workbench-v1/${relativeRoot}/${relative}`;
const referenceRoot = path.join(publicRoot, "generated/system-line/reference-packs/pinterest-retro-pixel-v1");
const referenceManifest = JSON.parse(fs.readFileSync(path.join(referenceRoot, "manifest.json"), "utf8"));
const fontRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/font-cache");
const styleAuditScript = "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/scripts/audit-style-brief.mjs";

function verifiedReference(id, adoptedTraits) {
  const source = referenceManifest.sources.find((item) => item.id === id);
  if (!source) throw new Error(`representative-motion-v3-reference-missing:${id}`);
  const file = path.join(referenceRoot, source.file);
  if (!fs.existsSync(file) || shaFile(file) !== source.sha256) throw new Error(`representative-motion-v3-reference-sha-mismatch:${id}`);
  return {id, publicUrl: source.publicUrl, sha256: source.sha256, role: source.role, adoptedTraits};
}

function verifiedFont(assetId, family, file, expectedSha256) {
  const absolutePath = path.join(fontRoot, file);
  if (!fs.existsSync(absolutePath) || shaFile(absolutePath) !== expectedSha256) throw new Error(`representative-motion-v3-font-sha-mismatch:${assetId}`);
  return {assetId, family, path: absolutePath, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/font-cache/${file}`, sha256: expectedSha256};
}

const references = [
  verifiedReference("pinterest-retro-pixel-03", ["kit-of-parts explanation", "singular machine clarity", "compact staged vocabulary"]),
  verifiedReference("pinterest-retro-pixel-04", ["process rhythm", "dominant black-white actor", "controlled cobalt state emphasis"]),
  verifiedReference("pinterest-retro-pixel-07", ["asymmetric diagram marks", "halftone as structural form", "controlled two-color field"]),
];
const fonts = [
  verifiedFont("type-editorial-heavy", "A1 Source Han Heavy", "SourceHanSansCN-Heavy.otf", "f178cae1188a31e7f5bdb268da9253b32c893aec56e0977118371aaf4cfc90f6"),
  verifiedFont("type-pixel-correction", "A1 Fusion Pixel", "fusion-pixel.ttf", "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"),
];

const styleBriefBody = {
  contract: "A1RetroPixelEditorialStyleBrief/v1",
  referencePackId: "pinterest-retro-pixel-v1",
  semanticJob: "将整理、编排、读取、检查组织成一条在 540p 可读并收束到可控工作流的因果路径",
  packageType: "FULLSCREEN_WORKFLOW_TAKEOVER",
  styleProfile: {id: "minimal-retro-pixel-editorial-v1", complexity: "minimal", rules: ["one-primary-actor", "one-semantic-action", "neutral-light-or-charcoal-base-plus-one-accent", "pixel-or-halftone-is-structural", "quiet-space-before-decoration"], backgroundPolicy: "neutral-canvas-v1", maxVisibleActors: 3, maxSemanticTextBlocks: 2, maxAccentColors: 1, maxSupportingFamilies: 1},
  surfacePolicy: {backgroundTone: "neutral-white", yellowCastForbidden: true, warmBackgroundUserApproved: false},
  visualWeight: {profile: "base-minimal", interfaceChrome: "none", maxControlRegions: 2, maxAccentCoveragePercent: 8},
  sourceReferences: references,
  atmosphere: {earlyComputerIntimacy: true, editorialUrgency: true, tactileImperfection: true, playfulIntelligence: true},
  variation: {primaryFamily: "modular-pixel-infographic", supportingFamilies: [], surfaceLogic: "ordered-halftone-stage-modules", dominantActor: "four-stage-causal-workflow-system", composition: "title-path-result-three-tier-full-frame", palette: "neutral-white-charcoal-cobalt", material: "single-structured-pixel-halftone", motionEnergy: "sequential-causal-build-then-result-lock"},
  typography: {displayFontAssetId: "type-editorial-heavy", supportFontAssetId: "type-pixel-correction", fontFiles: fonts, editableTextRequired: true, systemFallbackForbidden: true, editableTextSpec: {exactStrings: ["把写作的不便", "变成流程力", "整理", "编排", "读取", "检查", "可控工作流"], localRetypesettingAllowed: false}},
  formalOutput: {debugFree: true, referenceOnlyAssetsExcluded: true, fakeEvidenceForbidden: true},
  fingerprint: "modular-pixel-infographic|ordered-halftone-stage-modules|four-stage-causal-workflow-system|title-path-result-three-tier-full-frame|neutral-white-charcoal-cobalt",
  diversityHistoryPointer: "CURRENT_PROJECT_RECENT_APPROVED_OUTPUTS_READ_ONLY",
};
const styleBrief = {...styleBriefBody, styleBriefSha256: sha256(styleBriefBody)};

const fontCss = `@font-face{font-family:'A1 Source Han Heavy';src:url(data:font/otf;base64,${fs.readFileSync(fonts[0].path).toString("base64")}) format('opentype');font-weight:900;}@font-face{font-family:'A1 Fusion Pixel';src:url(data:font/ttf;base64,${fs.readFileSync(fonts[1].path).toString("base64")}) format('truetype');}`;
const svg = (body, {background = false} = {}) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><style>${fontCss}.heavy{font-family:'A1 Source Han Heavy';font-weight:900}.pixel{font-family:'A1 Fusion Pixel'}</style>${background ? '<rect width="1920" height="1080" fill="#f4f6f8"/>' : ''}${body}</svg>`);
const renderSvg = (body, options) => sharp(svg(body, options)).png().toBuffer();

const halftone = `<defs><pattern id="stageDots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.2" fill="#14191e" opacity=".11"/></pattern></defs>`;
const backgroundBody = `${halftone}<rect width="1920" height="1080" fill="#f4f6f8"/><rect x="96" y="82" width="14" height="204" fill="#1854d8"/><text x="145" y="142" class="heavy" font-size="46" fill="#14191e">把写作的不便</text><text x="140" y="242" class="heavy" font-size="94" letter-spacing="-3" fill="#14191e">变成<tspan fill="#1854d8">流程力</tspan></text><rect x="140" y="292" width="510" height="18" fill="url(#stageDots)"/>`;
const pathBody = `${halftone}<path d="M125 575 H430 V685 H765 V575 H1100 V685 H1455" fill="none" stroke="#d9dde2" stroke-width="126" stroke-linejoin="miter"/><path d="M125 575 H430 V685 H765 V575 H1100 V685 H1494" fill="none" stroke="#1854d8" stroke-width="14" stroke-linejoin="miter"/><path d="M1472 663 L1512 685 L1472 707 Z" fill="#1854d8"/><path d="M145 533 H405 V617 H145Z M480 643 H740 V727 H480Z M815 533 H1075 V617 H815Z M1150 643 H1410 V727 H1150Z" fill="url(#stageDots)"/>`;
const stages = [
  {id:"workflow-stage-1", index:"01", label:"整理", x:150, y:455, icon:`<rect x="220" y="491" width="72" height="56" fill="none" stroke="#14191e" stroke-width="9"/><rect x="236" y="475" width="72" height="56" fill="#f4f6f8" stroke="#14191e" stroke-width="9"/>`},
  {id:"workflow-stage-2", index:"02", label:"编排", x:485, y:565, icon:`<rect x="555" y="585" width="82" height="72" fill="#f4f6f8" stroke="#14191e" stroke-width="9"/><path d="M596 585V657M555 621H637" stroke="#1854d8" stroke-width="9"/>`},
  {id:"workflow-stage-3", index:"03", label:"读取", x:820, y:455, icon:`<path d="M886 516Q928 474 970 516Q928 558 886 516Z" fill="#f4f6f8" stroke="#14191e" stroke-width="9"/><rect x="918" y="506" width="20" height="20" fill="#1854d8"/>`},
  {id:"workflow-stage-4", index:"04", label:"检查", x:1155, y:565, icon:`<rect x="1225" y="583" width="78" height="78" fill="#f4f6f8" stroke="#14191e" stroke-width="9"/><path d="M1243 622L1261 640L1290 604" fill="none" stroke="#1854d8" stroke-width="11" stroke-linecap="square"/>`},
];
const stageBody = (stage) => `<rect x="${stage.x}" y="${stage.y}" width="64" height="44" fill="#14191e"/><text x="${stage.x+11}" y="${stage.y+34}" class="pixel" font-size="28" fill="#ffffff">${stage.index}</text>${stage.icon}<text x="${stage.x+78}" y="${stage.y+132}" class="heavy" font-size="58" fill="#14191e">${stage.label}</text>`;
const resultBody = `${halftone}<rect x="1515" y="366" width="310" height="420" fill="#14191e"/><rect x="1545" y="396" width="250" height="360" fill="#f4f6f8"/><rect x="1570" y="425" width="200" height="62" fill="url(#stageDots)"/><text x="1580" y="581" class="heavy" font-size="58" fill="#1854d8">可控的</text><text x="1580" y="661" class="heavy" font-size="58" fill="#1854d8">工作流</text><rect x="1580" y="700" width="112" height="16" fill="#1854d8"/>`;

const ed31LayerBuffers = {
  background: await renderSvg(backgroundBody),
  "workflow-path": await renderSvg(pathBody),
  ...Object.fromEntries(await Promise.all(stages.map(async (stage) => [stage.id, await renderSvg(stageBody(stage))]))),
  "workflow-result": await renderSvg(resultBody),
};
const ed31Master = await sharp(ed31LayerBuffers.background).composite(["workflow-path", ...stages.map((item) => item.id), "workflow-result"].map((id) => ({input: ed31LayerBuffers[id]}))).png().toBuffer();

const ed13SourcePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/whole-film-layer-reconstruction-v4/layers/ED-13/typography.png");
const ed13SourceSha256 = "8ffed53fa4ef7a47e72bd4edd9078f94009dd44a931434849ee235959c4a34c0";
if (shaFile(ed13SourcePath) !== ed13SourceSha256) throw new Error("representative-motion-v3-ed13-source-typography-sha-mismatch");
const {data: ed13Pixels, info: ed13Info} = await sharp(ed13SourcePath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const titleRects = [{id:"secondary-improvement-title",x:50,y:165,width:650,height:202,alpha:0.72},{id:"primary-unresolved-title",x:1080,y:165,width:530,height:202,alpha:1}];
for (let y = 0; y < ed13Info.height; y += 1) for (let x = 0; x < ed13Info.width; x += 1) {
  const rect = titleRects.find((item) => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height);
  const pixelIndex = (y * ed13Info.width + x) * 4;
  const alphaIndex = pixelIndex + 3;
  const removePixel = !rect || (rect.id === "secondary-improvement-title" && y >= 360);
  if (removePixel) ed13Pixels.fill(0, pixelIndex, pixelIndex + 4);
  else if (rect.alpha < 1) ed13Pixels[alphaIndex] = Math.round(ed13Pixels[alphaIndex] * rect.alpha);
}
const ed13Typography = await sharp(ed13Pixels, {raw: ed13Info}).png().toBuffer();
const {data: ed13OutputPixels, info: ed13OutputInfo} = await sharp(ed13Typography).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const alphaCountInRect = (rect) => {
  let count = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) for (let x = rect.x; x < rect.x + rect.width; x += 1) if (ed13OutputPixels[(y * ed13OutputInfo.width + x) * 4 + 3] > 0) count += 1;
  return count;
};
const forbiddenRegions = [{id:"decorative-blue-underline",x:50,y:360,width:650,height:32},{id:"lower-right-small-icon",x:1370,y:700,width:120,height:120}];
const forbiddenRegionAlphaPixels = Object.fromEntries(forbiddenRegions.map((rect) => [rect.id, alphaCountInRect(rect)]));
let alphaPixelsOutsideTitleRects = 0;
for (let y = 0; y < ed13OutputInfo.height; y += 1) for (let x = 0; x < ed13OutputInfo.width; x += 1) {
  const inside = titleRects.some((rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height && !(rect.id === "secondary-improvement-title" && y >= 360));
  if (!inside && ed13OutputPixels[(y * ed13OutputInfo.width + x) * 4 + 3] > 0) alphaPixelsOutsideTitleRects += 1;
}
const titleAlphaPixels = Object.fromEntries(titleRects.map((rect) => [rect.id, alphaCountInRect({...rect, height: Math.min(rect.height, 195)})]));
if (Object.values(forbiddenRegionAlphaPixels).some((count) => count !== 0) || alphaPixelsOutsideTitleRects !== 0 || Object.values(titleAlphaPixels).some((count) => count < 10_000)) throw new Error(`representative-motion-v3-ed13-actual-pixel-residue-failed:${JSON.stringify({forbiddenRegionAlphaPixels,alphaPixelsOutsideTitleRects,titleAlphaPixels})}`);
const ed13DecodedPixelSha256 = sha256(ed13OutputPixels);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-representative-v3-style-"));
const tempBrief = path.join(tempRoot, "ed31-style-brief.json");
fs.writeFileSync(tempBrief, JSON.stringify(styleBrief, null, 2));
const styleAudit = JSON.parse(execFileSync(process.execPath, [styleAuditScript, tempBrief], {encoding: "utf8"}));
if (styleAudit.status !== "PASS") throw new Error(`representative-motion-v3-style-audit-blocked:${styleAudit.errors?.join(",")}`);

const binaryFiles = {};
const ed31Bindings = {};
for (const [id, buffer] of Object.entries(ed31LayerBuffers)) {
  const relative = `ED-31/${id}.png`;
  binaryFiles[`${relativeRoot}/${relative}`] = buffer;
  ed31Bindings[id] = binding(buffer, publicUrl(relative), 1920, 1080);
}
binaryFiles[`${relativeRoot}/ED-31/look-master.png`] = ed31Master;
const ed31MasterBinding = binding(ed31Master, publicUrl("ED-31/look-master.png"), 1920, 1080);
binaryFiles[`${relativeRoot}/ED-13/typography-clean.png`] = ed13Typography;
const ed13Binding = binding(ed13Typography, publicUrl("ED-13/typography-clean.png"), ed13Info.width, ed13Info.height);

const residueGateBody = {
  contract: "A1RepresentativeVisualResidueGate/v1",
  shotId: "ED-31",
  status: "PASS",
  visualPrimitive: "modular-pixel-infographic",
  sourceRasterImports: [],
  actorIds: ["title", "workflow-path", ...stages.map((item) => item.id), "workflow-result"],
  forbiddenActorPatterns: ["presenter", "microphone", "boom", "chair", "keyboard", "desk", "base-frame", "furniture", "person-cutout"],
  forbiddenActorMatches: [],
  baseScenePixelReuse: false,
  presenterPixelReuse: false,
  referencePixelsIncludedInOutput: false,
  reason: "shot-local master is constructed only from bound fonts and deterministic vector workflow actors; no prior ED-31 scene raster is imported",
};
const residueGate = {...residueGateBody, gateSha256: sha256(residueGateBody)};
const proofBody = {
  contract: "A1RepresentativeShotLocalLookMasterProof/v1",
  shotId: "ED-31",
  status: "ENGINEERING_PASS_READY_FOR_ACTUAL_PIXEL_REVIEW",
  visualApproval: "NOT_APPROVED",
  primitiveSwitch: {from: "presenter-integrated-master", to: "modular-pixel-infographic", oldMasterReuseForbidden: true, oldPixelParityNotAcceptedAsNewVisualProof: true},
  styleBriefSha256: styleBrief.styleBriefSha256,
  styleAudit: {...styleAudit, briefPath: publicUrl("ED-31/style-brief.json")},
  referenceBindings: references,
  fontBindings: fonts,
  lookMaster: ed31MasterBinding,
  layers: ed31Bindings,
  semanticSystem: {title: ["把写作的不便", "变成流程力"], orderedStages: stages.map((item) => item.label), result: "可控工作流", direction: "LEFT_TO_RIGHT_CAUSAL_PATH", allPathsSemantic: true},
  readability540p: {minimumStageFontPx: 29, resultFontPx: 29, titlePrimaryFontPx: 47, requiredLabels: ["整理", "编排", "读取", "检查", "可控工作流"], status: "LAYOUT_METRICS_PASS_ACTUAL_PIXEL_REVIEW_REQUIRED"},
  residueGateSha256: residueGate.gateSha256,
};
const proof = {...proofBody, proofSha256: sha256(proofBody)};
const ed13ActualPixelResidueGateBody = {contract:"A1ED13TypographyActualPixelResidueGate/v1",status:"PASS",outputSha256:ed13Binding.sha256,decodedPixelSha256:ed13DecodedPixelSha256,forbiddenRegions,forbiddenRegionAlphaPixels,alphaPixelsOutsideTitleRects,titleAlphaPixels,requiredZeroAlpha:true};
const ed13ActualPixelResidueGate = {...ed13ActualPixelResidueGateBody,gateSha256:sha256(ed13ActualPixelResidueGateBody)};
const ed13ProofBody = {contract:"A1RepresentativeShotLocalTypographyReductionProof/v1",shotId:"ED-13",status:"PASS",sourceTypographySha256:ed13SourceSha256,output:ed13Binding,actualPixelResidueGateSha256:ed13ActualPixelResidueGate.gateSha256,extractionRects:titleRects,secondaryTitleAlpha:0.72,removedPixelPolicy:"ZERO_RGBA_OUTSIDE_TITLE_RECTS_AND_BELOW_SECONDARY_GLYPH_BASELINE_Y360",removedActors:["lower-right-icon","decorative-blue-underline","decorative-short-lines","nonsemantic-noise-outside-title-bounds"],exactGlyphPixelsRetyped:false,editableTextClaim:false,presenterBoundsChanged:false,baseFrameChanged:false};
const ed13Proof = {...ed13ProofBody, proofSha256:sha256(ed13ProofBody)};
const manifestBody = {contract:"A1RepresentativeMotionV3ShotAssetManifest/v1",status:"SHOT_LOCAL_VISUALS_READY_FOR_MOTION_COMPILE",affectedShotIds:["ED-13","ED-31"],unchangedShotIds:["ED-10","ED-14","ED-17"],styleBriefSha256:styleBrief.styleBriefSha256,ed31ProofSha256:proof.proofSha256,ed13ProofSha256:ed13Proof.proofSha256,ed13ActualPixelResidueGateSha256:ed13ActualPixelResidueGate.gateSha256,residueGateSha256:residueGate.gateSha256,outputs:{ed31Master:ed31MasterBinding,ed31Layers:ed31Bindings,ed13Typography:ed13Binding}};
const manifest = {...manifestBody, manifestSha256:sha256(manifestBody)};

const committed = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`representative-motion-v3-assets-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.assembly.status !== "NOT_CREATED" || current.production.assembly.productionWired !== false || current.production.motion.aeLevelProven !== false || current.production.assembly.userVisualApproval !== "NOT_APPROVED") throw new Error("representative-motion-v3-assets-locks-required");
  const now = new Date().toISOString();
  let next = structuredClone(current);
  next.production.shotIntelligence.representativeMotionV3ShotAssets = {...manifest, publicUrl: publicUrl("manifest.json"), updatedAt: now};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "build-representative-motion-v3-shot-assets", targetId: "ED-13,ED-31", payload: {manifestSha256: manifest.manifestSha256, ed31ProofSha256: proof.proofSha256, ed13ProofSha256: ed13Proof.proofSha256, oldMasterReuse: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `representative-motion-v3-shot-assets-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${relativeRoot}/ED-31/style-brief.json`]: styleBrief, [`${relativeRoot}/ED-31/style-brief-audit.json`]: styleAudit, [`${relativeRoot}/ED-31/visual-residue-gate.json`]: residueGate, [`${relativeRoot}/ED-31/look-master-proof.json`]: proof, [`${relativeRoot}/ED-13/actual-pixel-residue-gate.json`]: ed13ActualPixelResidueGate, [`${relativeRoot}/ED-13/typography-reduction-proof.json`]: ed13Proof, [`${relativeRoot}/manifest.json`]: manifest}, binaryFiles});
});

const {artifactDir} = projectDirs(appRoot);
for (const [label, file, expectedSha] of [
  ["public-ed13", path.join(publicRoot, ed13Binding.publicUrl.replace(/^\//u, "")), ed13Binding.sha256],
  ["artifact-ed13", path.join(artifactDir, relativeRoot, "ED-13/typography-clean.png"), ed13Binding.sha256],
  ["public-ed31", path.join(publicRoot, ed31MasterBinding.publicUrl.replace(/^\//u, "")), ed31MasterBinding.sha256],
  ["artifact-ed31", path.join(artifactDir, relativeRoot, "ED-31/look-master.png"), ed31MasterBinding.sha256],
]) if (!fs.existsSync(file) || shaFile(file) !== expectedSha) throw new Error(`representative-motion-v3-post-persist-sha-mismatch:${label}`);

console.log(JSON.stringify({status: manifest.status, workspaceSha256Before: expectedWorkspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256, manifestSha256: manifest.manifestSha256, styleBriefSha256: styleBrief.styleBriefSha256, styleAudit: styleAudit.status, ed31Master: ed31MasterBinding, ed13Typography: ed13Binding, residueGate: residueGate.status, affectedShotIds: manifest.affectedShotIds}, null, 2));
