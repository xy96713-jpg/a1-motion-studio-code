#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "style-lineage-static-board-v1");
const frameRoot = path.join(outputRoot, "frames");
const briefRoot = path.join(outputRoot, "style-briefs");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(briefRoot, {recursive: true});

const typographyManifestFile = path.join(root, ".codex-artifacts/system-progress-system-line/dual-font-typography-layout-masters-v6/manifest.json");
const backgroundReviewFile = path.join(generatedRoot, "default-design-asset-library-v1/imagegen-background-final-wave-v4/review.json");
const mappingFile = path.join(generatedRoot, "default-design-asset-library-v1/storyboard-library-binding-v1/mapping.json");
const currentBoardReportFile = path.join(generatedRoot, "whole-film-static-board-v1/report.json");
const typographyManifest = readJson(typographyManifestFile);
const backgroundReview = readJson(backgroundReviewFile);
const mapping = readJson(mappingFile);
const currentBoard = readJson(currentBoardReportFile);

const fontSpecs = {
  editorial: typographyManifest.fonts.find((font) => font.assetId === "type-frex-sans-gb-bold-review"),
  pixel: typographyManifest.fonts.find((font) => font.assetId === "type-boutique-9x9-bold-review"),
};
for (const [key, spec] of Object.entries(fontSpecs)) {
  if (!spec) throw new Error(`style-lineage-font-missing:${key}`);
  spec.absoluteFile = path.join(root, spec.file);
  if (!fs.existsSync(spec.absoluteFile) || fileSha256(spec.absoluteFile) !== spec.sha256) throw new Error(`style-lineage-font-sha-mismatch:${key}`);
  spec.font = fontkit.create(fs.readFileSync(spec.absoluteFile));
}

const backgroundById = new Map(backgroundReview.candidates.map((candidate) => [candidate.candidateId, candidate]));
const assignmentByShot = new Map(mapping.assignments.map((assignment) => [assignment.shotId, assignment]));
const currentItemByShot = new Map(currentBoard.items.map((item) => [item.shotId, item]));

const styleSystemInput = {
  contract: "A1AppliedEditorialStyleSystem/v1",
  id: "a1-dual-font-multi-background-editorial-v1",
  typographyManifestSha256: fileSha256(typographyManifestFile),
  typographyMasterManifestSha256: typographyManifest.manifestSha256,
  backgroundReviewSha256: fileSha256(backgroundReviewFile),
  backgroundMappingSha256: mapping.mappingSha256,
  referencePackId: "pinterest-retro-pixel-v1",
  rules: [
    "frex-editorial-primary-boutique-pixel-signature",
    "multiple-role-bound-low-contrast-backgrounds",
    "real-presenter-hold-frame-only",
    "one-primary-message-per-frame",
    "no-metadata-only-style-upgrade",
  ],
};
const styleSystem = {...styleSystemInput, sha256: sha256(styleSystemInput)};

const referenceCatalog = {
  "pinterest-retro-pixel-01": {sha256: "0121b23ce4b1b37225ba313dd156a15e9f41ebb0af0b1dac413f1a0ba48284fc", publicUrl: "/style-guides/pinterest-retro-pixel-v1/user-reference-01-board-overview.png"},
  "pinterest-retro-pixel-02": {sha256: "291c9c7dd80bbc38ad3aeeba9adedb049de5202e82f5ae758d275e66dd77a115", publicUrl: "/style-guides/pinterest-retro-pixel-v1/user-reference-02-pinterest-board-a.png"},
  "pinterest-retro-pixel-03": {sha256: "5b85a6e3e5cac7f136911293f0fb4025ccb2678d3be53d6e4561b9c94baa6433", publicUrl: "/style-guides/pinterest-retro-pixel-v1/user-reference-03-pinterest-board-b.png"},
  "pinterest-retro-pixel-04": {sha256: "37f605d78250e56c4eff9e7f58de40cd2210be2aeaf0b8aea8b31d1dc2b61bf2", publicUrl: "/style-guides/pinterest-retro-pixel-v1/user-reference-04-pinterest-board-c.png"},
  "pinterest-retro-pixel-05": {sha256: "be0a9f9367c09f2aed28b3568d08e6216c7e0759534e18459e7e022c69ca9670", publicUrl: "/style-guides/pinterest-retro-pixel-v1/user-reference-05-pinterest-board-d.png"},
  "pinterest-retro-pixel-06": {sha256: "b3e70105fc69e2722f22c4466aa6f98af65c5102270cdf536ca06f0aa2f9afab", publicUrl: "/style-guides/pinterest-retro-pixel-v1/user-reference-06-pinterest-board-e.png"},
  "pinterest-retro-pixel-07": {sha256: "0e1c79f5a444a5131cef7f9e7c1b53dbb9a3eac0bb2d6d0e26e4890eb47033df", publicUrl: "/style-guides/pinterest-retro-pixel-v1/user-reference-07-pinterest-board-f.png"},
};

const shots = [
  {shotId: "ED-01", mode: "OVERLAY", semanticJob: "用真实口播开场并以大标题建立智能写作工作台的产品身份", primaryFamily: "pixel-type-actor", refs: ["pinterest-retro-pixel-01", "pinterest-retro-pixel-06"], presenter: "imported-film-media-v1/presenter-shot-frames/ED-01.jpg", nodes: [
    ["editorial", "智能写作", 72, 150, 126, 5, "#8faeff"], ["pixel", "工作台", 66, 420, 212, 12, "#f3f5f2"],
  ]},
  {shotId: "ED-07", mode: "FULLSCREEN", semanticJob: "替观众抛出为什么不让 AI 直接写完全文的尖锐反问", primaryFamily: "dithered-editorial-poster", refs: ["pinterest-retro-pixel-02", "pinterest-retro-pixel-06"], nodes: [
    ["editorial", "既然都用 AI 了", 90, 190, 92, 4, "#8faeff"], ["pixel", "为什么", 84, 545, 214, 14, "#f3f5f2"], ["editorial", "不让它直接写完全文？", 520, 835, 105, 3, "#f3f5f2"],
  ]},
  {shotId: "ED-08", mode: "FULLSCREEN", semanticJob: "把作者长期使用判断 AI 常常不说人话变成一眼可读的结论", primaryFamily: "pixel-type-actor", refs: ["pinterest-retro-pixel-04", "pinterest-retro-pixel-06"], nodes: [
    ["editorial", "我的长期感受", 92, 210, 98, 4, "#0b0f13"], ["editorial", "AI 常常", 108, 480, 150, 3, "#0b0f13"], ["pixel", "不说人话", 390, 890, 248, 12, "#2452ff"],
  ]},
  {shotId: "ED-09", mode: "FULLSCREEN", semanticJob: "表现中文看似通顺却看不懂并且通篇没有重点的阅读断裂", primaryFamily: "dithered-editorial-poster", refs: ["pinterest-retro-pixel-02", "pinterest-retro-pixel-07"], nodes: [
    ["editorial", "明明都是中文", 90, 230, 128, 5, "#f3f5f2"], ["pixel", "却看不懂", 600, 635, 206, 10, "#2452ff"], ["editorial", "通篇也没重点", 1120, 900, 80, 3, "#f3f5f2"],
  ]},
  {shotId: "ED-10", mode: "FULLSCREEN", semanticJob: "用完成度很高与废稿的尺度冲突完成章节结论", primaryFamily: "pixel-type-actor", refs: ["pinterest-retro-pixel-04", "pinterest-retro-pixel-06"], nodes: [
    ["editorial", "完成度很高的", 112, 220, 112, 6, "#8faeff"], ["pixel", "废稿", 420, 900, 500, 24, "#f3f5f2"],
  ]},
  {shotId: "ED-12", mode: "EXPLAINER", semanticJob: "用五个来源绑定的官方实体标识说明作者实际试过的模型范围", preserve: true, preservationReason: "SOURCE_BOUND_FIVE_OFFICIAL_ENTITY_MASTER_RETAINS_VERIFIED_LOGOS", primaryFamily: "icon-atlas-interface-language", refs: ["pinterest-retro-pixel-01", "pinterest-retro-pixel-03"]},
  {shotId: "ED-13", mode: "OVERLAY", semanticJob: "在真实人物口播中承认中文更顺但强调根因仍未解决", primaryFamily: "dithered-editorial-poster", refs: ["pinterest-retro-pixel-04", "pinterest-retro-pixel-06"], presenter: "imported-film-media-v1/presenter-shot-frames/ED-13.jpg", veil: 0.34, nodes: [
    ["editorial", "中文确实顺了一些", 1180, 170, 68, 3, "#8faeff"], ["pixel", "还没解决", 1350, 420, 88, 8, "#f3f5f2"],
  ]},
  {shotId: "ED-14", mode: "EXPLAINER", semanticJob: "保留真实论文来源并准确呈现句法与词汇多样性下降的有限结论", preserve: true, preservationReason: "VERIFIED_RESEARCH_SOURCE_EVIDENCE_MASTER_MUST_NOT_BE_REDRAWN", primaryFamily: "modular-pixel-infographic", refs: ["pinterest-retro-pixel-03", "pinterest-retro-pixel-06"]},
  {shotId: "ED-16", mode: "TYPOGRAPHY", semanticJob: "把材料不足和角度不清汇聚为泛泛而谈的根因结论", primaryFamily: "modular-pixel-infographic", refs: ["pinterest-retro-pixel-03", "pinterest-retro-pixel-07"], nodes: [
    ["editorial", "材料不够", 100, 225, 112, 4, "#0b0f13"], ["editorial", "角度不清", 730, 500, 112, 4, "#2452ff"], ["pixel", "泛泛而谈", 720, 905, 218, 10, "#2452ff"],
  ], semanticConnectors: [[560, 190, 690, 420], [1240, 470, 1380, 720]]},
  {shotId: "ED-17", mode: "EXPLAINER", semanticJob: "用清晰流程呈现先给材料再找角度最后让 AI 动笔的方法顺序", primaryFamily: "modular-pixel-infographic", refs: ["pinterest-retro-pixel-03", "pinterest-retro-pixel-06"], nodes: [
    ["editorial", "先给材料", 90, 250, 116, 4, "#0b0f13"], ["editorial", "再找角度", 690, 530, 116, 4, "#0b0f13"], ["pixel", "动笔", 1260, 895, 230, 14, "#f3f5f2"],
  ], semanticConnectors: [[520, 215, 670, 420], [1120, 495, 1260, 735]]},
  {shotId: "ED-19", mode: "FULLSCREEN", semanticJob: "解释 Codex 在后台承担整理编排读取风格库与收稿检查的职责边界", primaryFamily: "pixel-type-actor", refs: ["pinterest-retro-pixel-02", "pinterest-retro-pixel-06"], nodes: [
    ["editorial", "Codex 在后台", 90, 200, 100, 4, "#8faeff"], ["pixel", "整理", 100, 620, 250, 14, "#f3f5f2"], ["editorial", "编排 / 读取 / 检查", 710, 865, 112, 4, "#f3f5f2"],
  ]},
  {shotId: "ED-31", mode: "OVERLAY", semanticJob: "在真实口播留白中把写作不便转化为可控工作流的单一结论", primaryFamily: "pixel-type-actor", refs: ["pinterest-retro-pixel-01", "pinterest-retro-pixel-06"], presenter: "imported-film-media-v1/presenter-shot-frames/ED-31.jpg", veil: 0.4, nodes: [
    ["editorial", "把不方便变成", 76, 165, 72, 4, "#8faeff"], ["pixel", "可控", 68, 510, 244, 14, "#f3f5f2"], ["editorial", "工作流", 82, 785, 112, 4, "#8faeff"],
  ]},
  {shotId: "ED-33", mode: "FULLSCREEN", semanticJob: "保留纸卷与修订动作形成的可控而非推翻重来的成熟结论母版", preserve: true, preservationReason: "MATURE_SEMANTIC_PAPER_REVISION_MASTER_ALREADY_MATCHES_CURRENT_AESTHETIC", primaryFamily: "dithered-editorial-poster", refs: ["pinterest-retro-pixel-06", "pinterest-retro-pixel-07"]},
  {shotId: "ED-34", mode: "FULLSCREEN", semanticJob: "保留道路转向与自己的风格形成的成熟结尾视觉母版", preserve: true, preservationReason: "MATURE_CONCLUSION_DIRECTION_MASTER_ALREADY_MATCHES_CURRENT_AESTHETIC", primaryFamily: "dithered-editorial-poster", refs: ["pinterest-retro-pixel-02", "pinterest-retro-pixel-06"]},
];

function makeStyleBrief(shot) {
  const dark = ["ED-01", "ED-07", "ED-13", "ED-16", "ED-19", "ED-31"].includes(shot.shotId);
  const supporting = shot.primaryFamily === "pixel-type-actor" ? ["dithered-editorial-poster"] : ["pixel-type-actor"];
  const variation = {
    primaryFamily: shot.primaryFamily,
    supportingFamilies: supporting,
    surfaceLogic: `${shot.shotId.toLowerCase()}-${dark ? "charcoal" : "cool"}-bound-editorial-surface`,
    dominantActor: `${shot.shotId.toLowerCase()}-${shot.preserve ? "preserved-semantic-master" : "dual-font-semantic-actor"}`,
    composition: `${shot.shotId.toLowerCase()}-${shot.mode.toLowerCase()}-asymmetric-reading-path`,
    palette: dark ? "charcoal-coolwhite-cobalt" : "coolwhite-charcoal-cobalt",
    material: shot.preserve ? "source-bound-existing-pixels" : "role-bound-halftone-or-real-footage",
    motionEnergy: "single-semantic-action-then-hold",
  };
  const brief = {
    contract: "A1RetroPixelEditorialStyleBrief/v1",
    referencePackId: "pinterest-retro-pixel-v1",
    semanticJob: shot.semanticJob,
    packageType: `${shot.mode}_PACKAGE`,
    styleProfile: {id: shot.mode === "OVERLAY" ? "minimal-retro-pixel-editorial-v2" : "editorial-collision-retro-pixel-v2", complexity: shot.mode === "OVERLAY" ? "minimal" : "editorial", rules: ["one-primary-actor", "one-semantic-action", "neutral-light-or-charcoal-base-plus-one-accent", "pixel-or-halftone-is-structural", "quiet-space-before-decoration"], backgroundPolicy: "neutral-canvas-v1", maxVisibleActors: shot.mode === "OVERLAY" ? 2 : 3, maxSemanticTextBlocks: shot.mode === "OVERLAY" ? 1 : 2, maxAccentColors: 1, maxSupportingFamilies: 1, maxDominantMasses: shot.mode === "OVERLAY" ? 2 : 3, maxCompositionClusters: shot.mode === "OVERLAY" ? 2 : 3, maxDecorativeMotifs: 0, minimumQuietFieldRatio: shot.mode === "OVERLAY" ? 0.35 : 0.2},
    surfacePolicy: {backgroundTone: shot.presenter ? "footage-derived" : dark ? "charcoal" : "cool-gray", yellowCastForbidden: true, warmBackgroundUserApproved: false},
    visualWeight: {profile: shot.mode === "OVERLAY" ? "base-minimal" : "editorial-collision", interfaceChrome: "thin", maxControlRegions: 2, maxAccentCoveragePercent: 12},
    sourceReferences: shot.refs.map((id) => ({id, publicUrl: referenceCatalog[id].publicUrl, sha256: referenceCatalog[id].sha256, adoptedTraits: id === "pinterest-retro-pixel-06" ? ["giant pixel glyph", "editorial image/type collision"] : id === "pinterest-retro-pixel-03" ? ["kit-of-parts explanation", "sparse object stage"] : id === "pinterest-retro-pixel-07" ? ["halftone as dominant image logic", "asymmetric diagram marks"] : id === "pinterest-retro-pixel-04" ? ["dominant black/white actor", "intentional error state"] : id === "pinterest-retro-pixel-02" ? ["poster cropping", "dense and quiet contrast"] : ["hard pixel silhouettes", "playful machine intimacy"]})),
    atmosphere: {earlyComputerIntimacy: true, editorialUrgency: true, tactileImperfection: true, playfulIntelligence: true},
    variation,
    typography: {displayFontAssetId: fontSpecs.pixel.assetId, supportFontAssetId: fontSpecs.editorial.assetId, fontFiles: [fontSpecs.pixel, fontSpecs.editorial].map((font) => ({assetId: font.assetId, path: font.absoluteFile, sha256: font.sha256})), editableTextRequired: true, systemFallbackForbidden: true, generatedFormalTextAllowed: false, exactCopyRequired: true, rendererBoundFonts: [fontSpecs.pixel.family, fontSpecs.editorial.family]},
    formalOutput: {debugFree: true, referenceOnlyAssetsExcluded: true, fakeEvidenceForbidden: true},
  };
  brief.fingerprint = [variation.primaryFamily, variation.surfaceLogic, variation.dominantActor, variation.composition, variation.palette].join("|");
  return brief;
}

function glyphLine([fontKey, text, x, y, size, tracking, fill], index) {
  const spec = fontSpecs[fontKey];
  const scale = size / spec.font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = spec.font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`style-lineage-missing-glyph:${spec.family}:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return {markup: `<g fill="${fill}">${paths.join("")}</g>`, spec: {id: `type-${index + 1}`, text, fontAssetId: spec.assetId, fontFamily: spec.family, fontSha256: spec.sha256, x, y, size, tracking, fill, editable: true, generated: false}};
}

function connectorMarkup(connectors = []) {
  return connectors.map(([x1, y1, x2, y2]) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 18;
    const ax = x2 - Math.cos(angle - Math.PI / 6) * head;
    const ay = y2 - Math.sin(angle - Math.PI / 6) * head;
    const bx = x2 - Math.cos(angle + Math.PI / 6) * head;
    const by = y2 - Math.sin(angle + Math.PI / 6) * head;
    return `<path d="M${x1} ${y1} L${x2} ${y2} M${ax} ${ay} L${x2} ${y2} L${bx} ${by}" fill="none" stroke="#2452ff" stroke-width="10" stroke-linecap="square" stroke-linejoin="miter"/>`;
  }).join("");
}

async function renderRecomposed(shot, brief, briefSha256) {
  const assignment = assignmentByShot.get(shot.shotId);
  let baseFile;
  let backgroundBinding = null;
  let presenterBinding = null;
  if (shot.presenter) {
    baseFile = path.join(generatedRoot, shot.presenter);
    presenterBinding = {publicUrl: publicUrlFor(baseFile), sha256: fileSha256(baseFile), provenance: "verified-editor-owned-presenter-source"};
  } else {
    const background = backgroundById.get(assignment?.backgroundCandidateId);
    if (!background) throw new Error(`style-lineage-background-missing:${shot.shotId}:${assignment?.backgroundCandidateId}`);
    baseFile = publicFile(background.publicUrl);
    if (fileSha256(baseFile) !== background.sha256) throw new Error(`style-lineage-background-sha-mismatch:${shot.shotId}`);
    backgroundBinding = {assetId: background.candidateId, publicUrl: background.publicUrl, sha256: background.sha256, roleId: background.roleId, visualReviewStatus: background.visualReviewStatus};
  }
  let base = sharp(baseFile).resize(1920, 1080, {fit: "cover"});
  if (shot.presenter) base = base.modulate({brightness: 0.62, saturation: 0.62});
  const basePixels = await base.png().toBuffer();
  const nodes = (shot.nodes || []).map(glyphLine);
  const overlaySvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${connectorMarkup(shot.semanticConnectors)}${nodes.map((node) => node.markup).join("")}</svg>`);
  const outputFile = path.join(frameRoot, `${shot.shotId}.png`);
  const outputPixels = await sharp(basePixels).composite([{input: overlaySvg}]).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, outputPixels);
  return {
    shotId: shot.shotId,
    presentationMode: shot.mode,
    assemblyMode: shot.mode,
    semanticJob: shot.semanticJob,
    artifactPublicUrl: publicUrlFor(outputFile),
    previewPublicUrl: publicUrlFor(outputFile),
    artifactSha256: sha256(outputPixels),
    width: 1920,
    height: 1080,
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    productionAdmitted: false,
    userVisualApproval: "NOT_APPROVED",
    textNodes: nodes.map((node) => node.spec),
    styleBrief: {publicUrl: publicUrlFor(path.join(briefRoot, `${shot.shotId}.json`)), sha256: briefSha256, fingerprint: brief.fingerprint},
    styleLineage: {contract: "A1StaticBoardStyleLineage/v1", styleSystemId: styleSystem.id, styleSystemSha256: styleSystem.sha256, pixelTreatment: "RECOMPOSED", pixelRecomposed: true, compositionMethod: "DETERMINISTIC_FONTKIT_SHARP_COMPLETE_LOOK_MASTER", compositeSha256: sha256(outputPixels), sourceArtifactSha256: currentItemByShot.get(shot.shotId)?.artifactSha256 || null, typographyMasterId: typographyManifest.contract, typographyMasterSha256: typographyManifest.manifestSha256, fontBindings: [fontSpecs.editorial, fontSpecs.pixel].map((font) => ({assetId: font.assetId, family: font.family, sha256: font.sha256})), backgroundBinding, presenterBinding, selectionOnly: false, auditBytesUnchanged: false},
  };
}

async function renderPreserved(shot, brief, briefSha256) {
  const current = currentItemByShot.get(shot.shotId);
  if (!current?.artifactPublicUrl) throw new Error(`style-lineage-preserved-master-missing:${shot.shotId}`);
  const file = publicFile(current.artifactPublicUrl);
  if (!fs.existsSync(file) || fileSha256(file) !== current.artifactSha256) throw new Error(`style-lineage-preserved-master-sha-mismatch:${shot.shotId}`);
  return {
    ...current,
    previewPublicUrl: current.artifactPublicUrl,
    previewSha256: current.artifactSha256,
    compositeSha256: current.artifactSha256,
    semanticJob: shot.semanticJob,
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    productionAdmitted: false,
    userVisualApproval: "NOT_APPROVED",
    styleBrief: {publicUrl: publicUrlFor(path.join(briefRoot, `${shot.shotId}.json`)), sha256: briefSha256, fingerprint: brief.fingerprint},
    styleLineage: {contract: "A1StaticBoardStyleLineage/v1", styleSystemId: styleSystem.id, styleSystemSha256: styleSystem.sha256, pixelTreatment: "PRESERVED_STRONG_MASTER", pixelRecomposed: false, compositionMethod: "EXPLICIT_STRONG_MASTER_PRESERVATION", compositeSha256: current.artifactSha256, sourceArtifactSha256: current.artifactSha256, preservationReason: shot.preservationReason, preservedActualPixelReview: true, typographyMasterId: null, typographyMasterSha256: null, fontBindings: [], backgroundBinding: null, presenterBinding: null, selectionOnly: false, auditBytesUnchanged: true},
  };
}

async function buildBoard(items, outputFile) {
  const tileWidth = 480;
  const imageHeight = 270;
  const labelHeight = 58;
  const tileHeight = imageHeight + labelHeight;
  const columns = 3;
  const rows = Math.ceil(items.length / columns);
  const tiles = await Promise.all(items.map(async (item) => {
    const image = await sharp(publicFile(item.previewPublicUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const treatment = item.styleLineage.pixelTreatment === "RECOMPOSED" ? "NEW STYLE APPLIED" : "STRONG MASTER KEPT";
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="7" height="100%" fill="#8faeff"/><text x="20" y="23" fill="#f3f5f2" font-family="Arial,sans-serif" font-size="15" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.presentationMode)}</text><text x="20" y="45" fill="#8faeff" font-family="Arial,sans-serif" font-size="10">${treatment} · ${item.artifactSha256.slice(0, 12)}</text></svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f13"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  }));
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {publicUrl: publicUrlFor(outputFile), sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight};
}

const styleBriefAuditor = process.env.A1_STYLE_BRIEF_AUDITOR || "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/scripts/audit-style-brief.mjs";
const items = [];
const briefAudits = [];
for (const shot of shots) {
  const brief = makeStyleBrief(shot);
  const briefFile = path.join(briefRoot, `${shot.shotId}.json`);
  fs.writeFileSync(briefFile, `${JSON.stringify(brief, null, 2)}\n`);
  const briefSha256 = fileSha256(briefFile);
  const audit = JSON.parse(execFileSync(process.execPath, [styleBriefAuditor, briefFile], {encoding: "utf8"}));
  const auditFile = path.join(briefRoot, `${shot.shotId}.audit.json`);
  fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`);
  briefAudits.push({shotId: shot.shotId, status: audit.status, briefSha256, auditPublicUrl: publicUrlFor(auditFile), auditSha256: fileSha256(auditFile)});
  items.push(shot.preserve ? await renderPreserved(shot, brief, briefSha256) : await renderRecomposed(shot, brief, briefSha256));
}

const packageBoard = await buildBoard(items, path.join(outputRoot, "whole-film-package-board.png"));
const manifestBase = {
  contract: "A1StyleLineageStaticBoardReview/v1",
  status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  userVisualApproval: "NOT_APPROVED",
  styleSystem,
  sourceBoard: {publicUrl: currentBoard.board?.publicUrl || "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png", sha256: currentBoard.board?.sha256 || null},
  packageBoard,
  counts: {itemCount: items.length, recomposedCount: items.filter((item) => item.styleLineage.pixelTreatment === "RECOMPOSED").length, preservedStrongMasterCount: items.filter((item) => item.styleLineage.pixelTreatment === "PRESERVED_STRONG_MASTER").length, distinctBackgroundCount: new Set(items.map((item) => item.styleLineage.backgroundBinding?.assetId).filter(Boolean)).size, presenterFrameCount: items.filter((item) => item.styleLineage.presenterBinding).length},
  briefAudits,
  items,
  boundaries: {imageGenerationPerformed: false, motionPerformed: false, assemblyCreated: false, layerExtractionPerformed: false, resolveUsed: false, finalRenderUsed: false},
  generatedAt: new Date().toISOString(),
};
const manifest = {...manifestBase, manifestSha256: sha256(manifestBase)};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, outputRoot, packageBoard, counts: manifest.counts, manifestSha256: manifest.manifestSha256}, null, 2));
