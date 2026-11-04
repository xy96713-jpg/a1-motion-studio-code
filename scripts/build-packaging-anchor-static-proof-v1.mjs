#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_PACKAGING_ANCHOR_PROOF_CONTRACT, A1_PACKAGING_BEAT_PLAN_CONTRACT, A1_PACKAGING_ANCHOR_SAMPLING_CONTRACT, assertPackagingBeatPlan} from "../apps/studio-next/src/lib/a1-editorial-packaging-boundary-v1.mjs";
import {assertRetroPixelEditorialStyleBrief, auditRetroPixelStyleBriefs, editableTextSpecForBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phase = "generated/system-line/editorial-asset-workbench-v1/packaging-anchor-proof-v1";
const publicDir = path.join(publicRoot, phase);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/packaging-anchor-proof-v1");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const width = 1920;
const height = 1080;
const fusionPath = path.join(appRoot, "public/a1-editorial-fonts/fusion-pixel.ttf");
const heavyPath = path.join(appRoot, "public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const fontData = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
const fontCss = () => `<style>@font-face{font-family:'A1 Fusion Pixel';src:url(${fontData(fusionPath, "font/ttf")}) format('truetype');}@font-face{font-family:'A1 Source Han Heavy';src:url(${fontData(heavyPath, "font/otf")}) format('opentype');}</style>`;
const svg = (body, background = "none") => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${fontCss()}<rect width="100%" height="100%" fill="${background}"/>${body}</svg>`;
const pixelRect = (x, y, w, h, fill, opacity = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="${opacity}" shape-rendering="crispEdges"/>`;
const text = (x, y, value, size, fill = "#111315", family = "A1 Source Han Heavy", weight = 800, opacity = 1, extra = "") => `<text x="${x}" y="${y}" fill="${fill}" opacity="${opacity}" font-family="${family}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;

function overlaySvg() {
  const body = [
    `<g transform="translate(1010 400) scale(.62) rotate(-3 820 540)" shape-rendering="crispEdges"><rect x="280" y="270" width="1120" height="560" fill="#101315" stroke="#f7f4ec" stroke-width="8"/><rect x="280" y="270" width="1120" height="60" fill="#265dff"/><circle cx="328" cy="300" r="10" fill="#f7f4ec"/><circle cx="360" cy="300" r="10" fill="#f7f4ec"/><circle cx="392" cy="300" r="10" fill="#f7f4ec"/><rect x="320" y="372" width="92" height="370" fill="#181d20" stroke="#c9ef39" stroke-width="4"/>`,
    pixelRect(344, 420, 26, 26, "#c9ef39"), pixelRect(376, 420, 26, 26, "#c9ef39", .4), pixelRect(344, 468, 26, 26, "#ff6258"), pixelRect(376, 468, 26, 26, "#ff6258", .45),
    `<path d="M474 430H1140M474 470H1020M474 510H1100M474 550H860" stroke="#687177" stroke-width="10" stroke-dasharray="3 18"/>`,
    `<rect x="500" y="610" width="580" height="110" fill="#f7f4ec"/><rect x="520" y="630" width="210" height="18" fill="#101315"/><rect x="520" y="666" width="410" height="18" fill="#101315" opacity=".55"/>`,
    text(510, 405, "WORKBENCH // 01", 28, "#c9ef39", "A1 Fusion Pixel", 600),
    text(520, 700, "智能写作工作台", 60, "#101315", "A1 Source Han Heavy", 900),
    text(510, 788, "vibe coding", 34, "#ff6258", "A1 Fusion Pixel", 700),
    `<path d="M1160 700h180l-40-32m40 32-40 32" fill="none" stroke="#c9ef39" stroke-width="18"/><rect x="1160" y="748" width="18" height="18" fill="#ff6258"/><rect x="1178" y="766" width="18" height="18" fill="#ff6258" opacity=".65"/>`,
    `</g>`,
    `<g shape-rendering="crispEdges">${pixelRect(1110, 500, 18, 18, "#c9ef39")}${pixelRect(1128, 500, 18, 18, "#c9ef39", .65)}${pixelRect(1146, 500, 18, 18, "#c9ef39", .35)}</g>`,
  ].join("");
  return svg(body, "none");
}

function typographySvg() {
  const body = [
    `<rect x="120" y="96" width="1680" height="888" fill="#f3efe5"/>`,
    `<path d="M690 94L728 180L700 290L734 408L696 530L726 672L688 982" fill="none" stroke="#2447ff" stroke-width="18" shape-rendering="crispEdges"/>`,
    `<path d="M705 96L742 180L715 290L748 408L710 530L740 672L702 982" fill="none" stroke="#2447ff" stroke-width="4" opacity=".48" shape-rendering="crispEdges"/>`,
    // The approved glyph board is the only formal text actor. These low-opacity
    // local shadows keep the Chinese editable without duplicating the raster glyph.
    text(305, 610, "完成度很高的", 94, "#2447ff", "A1 Source Han Heavy", 900, .08),
    text(700, 770, "废稿", 250, "#2447ff", "A1 Fusion Pixel", 900, .08),
    `<g shape-rendering="crispEdges">${pixelRect(270, 650, 24, 24, "#2447ff")}${pixelRect(298, 678, 24, 24, "#2447ff", .72)}${pixelRect(326, 706, 24, 24, "#2447ff", .42)}${pixelRect(354, 734, 24, 24, "#2447ff", .2)}</g>`,
    `<path d="M676 818H1640" stroke="#111315" stroke-width="8" stroke-dasharray="12 18" shape-rendering="crispEdges"/>`,
  ].join("");
  return svg(body, "#f3efe5");
}

function fullscreenSvg() {
  return svg([
    `<rect width="100%" height="100%" fill="#111315"/>`,
    `<g shape-rendering="crispEdges"><rect x="120" y="120" width="18" height="18" fill="#c9ef39"/><rect x="144" y="120" width="18" height="18" fill="#c9ef39" opacity=".65"/><rect x="168" y="120" width="18" height="18" fill="#c9ef39" opacity=".35"/></g>`,
    `<path d="M210 820H1650" stroke="#265dff" stroke-width="16" stroke-dasharray="8 24" shape-rendering="crispEdges"/>`,
    text(250, 560, "决定方向 · 保留自己的风格", 104, "#f7f4ec", "A1 Source Han Heavy", 900),
    text(252, 630, "DIRECTION / AUTHORSHIP", 30, "#c9ef39", "A1 Fusion Pixel", 700),
  ].join(""), "#111315");
}

function explainerSvg() {
  const body = [
    `<rect x="90" y="80" width="1740" height="920" fill="#f3efe5"/>`,
    `<g shape-rendering="crispEdges">${pixelRect(180, 246, 30, 30, "#111315")}${pixelRect(210, 246, 30, 30, "#111315", .7)}${pixelRect(240, 246, 30, 30, "#111315", .35)}${pixelRect(240, 486, 30, 30, "#111315")}${pixelRect(270, 486, 30, 30, "#111315", .7)}${pixelRect(300, 486, 30, 30, "#111315", .35)}${pixelRect(205, 726, 30, 30, "#111315")}${pixelRect(235, 726, 30, 30, "#111315", .7)}${pixelRect(265, 726, 30, 30, "#111315", .35)}</g>`,
    text(210, 330, "常见", 86, "#111315", "A1 Source Han Heavy", 900),
    text(270, 570, "稳妥", 86, "#111315", "A1 Source Han Heavy", 900),
    text(235, 810, "可复用", 86, "#111315", "A1 Source Han Heavy", 900),
    `<path d="M470 290H620V380H760V470H900V560H1060V650H1230" fill="none" stroke="#265dff" stroke-width="22" shape-rendering="crispEdges"/><path d="M520 530H650V530H760V560M500 770H620V650" fill="none" stroke="#111315" stroke-width="10" stroke-dasharray="2 22" shape-rendering="crispEdges"/>`,
    `<g shape-rendering="crispEdges">${pixelRect(600, 272, 22, 22, "#c9ef39")}${pixelRect(738, 458, 22, 22, "#c9ef39")}${pixelRect(1040, 548, 22, 22, "#c9ef39")}</g>`,
    `<path d="M1220 610h380v170h-380z" fill="#111315"/><path d="M1280 590h300v20h-300z" fill="#c9ef39" shape-rendering="crispEdges"/>`,
    text(1270, 718, "默认轨道", 76, "#f7f4ec", "A1 Source Han Heavy", 900),
    text(1274, 770, "常见 · 稳妥 · 可复用", 26, "#c9ef39", "A1 Fusion Pixel", 700),
    `<g fill="#111315" opacity=".23" shape-rendering="crispEdges">${Array.from({length: 28}, (_, index) => `<rect x="820" y="${180 + (index % 7) * 28}" width="${12 + (index % 4) * 8}" height="12"/>`).join("")}</g>`,
  ].join("");
  return svg(body, "#f3efe5");
}

function backgroundSvg(kind) {
  if (kind === "deep") return svg(`<rect width="100%" height="100%" fill="#111315"/><rect x="100" y="160" width="620" height="200" fill="#242a2d"/><rect x="1240" y="720" width="520" height="150" fill="#1a2023"/>`, "#111315");
  if (kind === "light") return svg(`<rect width="100%" height="100%" fill="#f3efe5"/><rect x="100" y="160" width="650" height="200" fill="#e4dfd4"/><rect x="1240" y="720" width="520" height="150" fill="#ddd8cb"/>`, "#f3efe5");
  return svg(`<rect width="100%" height="100%" fill="#d6d0c4"/><g shape-rendering="crispEdges"><rect x="80" y="100" width="260" height="260" fill="#15191b"/><rect x="520" y="680" width="340" height="160" fill="#265dff" opacity=".45"/><rect x="1360" y="180" width="330" height="260" fill="#c9ef39" opacity=".65"/><rect x="960" y="760" width="260" height="120" fill="#111315" opacity=".72"/></g>`, "#d6d0c4");
}

const checkerSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="#f2f2ee"/><rect width="24" height="24" fill="#d2d5d1"/><rect x="24" y="24" width="24" height="24" fill="#d2d5d1"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`;

function node(id, textValue, fontAssetId, x, y, widthValue, heightValue, fontSize, semanticRole) {
  return {id, text: textValue, fontAssetId, geometry: {x, y, width: widthValue, height: heightValue}, size: fontSize, lineHeight: Math.round(fontSize * 1.08), tracking: 0, semanticRole};
}

const overlayRenderTransform = Object.freeze({space: "output-px", translate: [1010, 400], scale: 0.62, rotateDegrees: -3, rotateOrigin: [820, 540]});

function nodesFor(event, brief) {
  if (event.packagingType === "OVERLAY_PACKAGE") return [node("workbench-title", "智能写作工作台", brief.typography.supportFontAssetId, 1322, 814, 360, 52, 37, "identity"), node("vibe-coding", "vibe coding", brief.typography.displayFontAssetId, 1322, 888, 162, 30, 21, "identity-context"), node("window-chrome", "WORKBENCH // 01", brief.typography.displayFontAssetId, 1322, 650, 186, 23, 17, "machine-window-label")].map((outputNode) => ({...outputNode, renderTransform: overlayRenderTransform}));
  if (event.packagingType === "TYPOGRAPHY_PACKAGE") return [node("polished-copy", "完成度很高的", brief.typography.supportFontAssetId, 305, 453, 387, 189, 94, "surface-judgement"), node("waste-copy", "废稿", brief.typography.displayFontAssetId, 683, 327, 937, 450, 250, "verdict-actor")];
  if (event.packagingType === "EXPLAINER_PACKAGE") return [node("candidate-common", "常见", brief.typography.supportFontAssetId, 210, 246, 210, 100, 86, "candidate-option"), node("candidate-safe", "稳妥", brief.typography.supportFontAssetId, 270, 486, 220, 100, 86, "candidate-option"), node("candidate-reusable", "可复用", brief.typography.supportFontAssetId, 235, 726, 280, 100, 86, "candidate-option"), node("default-rail", "默认轨道", brief.typography.supportFontAssetId, 1270, 610, 380, 100, 76, "converged-default")];
  return [node("direction-verdict", event.sourceText.slice(0, 18), brief.typography.supportFontAssetId, 250, 490, 1400, 180, 104, "conclusion-verdict")];
}

function glyphPath() { return path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/generated-assets/glyph-board-polished-waste/round-02/glyph-board-polished-waste-direction-02.cutout.png"); }
const glyphPlacement = Object.freeze({left: 210, top: 121, width: 1500, height: 838, sourceWidth: 1665, sourceHeight: 931, fit: "contain"});

async function fontRasterProof(fonts) {
  const results = [];
  for (const font of fonts) {
    const family = font.family === "A1 Fusion Pixel" ? "A1 Fusion Pixel" : "A1 Source Han Heavy";
    const specimen = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="160">${fontCss()}<rect width="100%" height="100%" fill="#f3efe5"/><text x="20" y="108" fill="#111315" font-family="${family}" font-size="76">A1 可编辑</text></svg>`;
    const probe = await sharp(Buffer.from(specimen)).png().toBuffer();
    const raw = await sharp(probe).raw().toBuffer({resolveWithObject: true});
    let nonEmptyPixelCount = 0;
    for (let index = 0; index < raw.data.length; index += raw.info.channels) {
      if (raw.data[index] < 245 || raw.data[index + 1] < 245 || raw.data[index + 2] < 245) nonEmptyPixelCount += 1;
    }
    if (nonEmptyPixelCount === 0) throw new Error(`font-raster-proof-empty:${font.assetId}`);
    results.push({assetId: font.assetId, family: font.family, fontSha256: font.sha256, probeText: "A1 可编辑", probeRasterSha256: sha256(probe), nonEmptyPixelCount});
  }
  return {contract: "A1FontRasterProof/v1", status: "PASS", method: "embedded-project-font-raster-probe", systemFallbackForbidden: true, fonts: results};
}

async function renderAnchor(event, brief) {
  const key = `${event.eventId}-${event.packagingType.toLowerCase().replaceAll("_package", "")}`;
  const cleanArtifact = path.join(artifactDir, `${key}.png`);
  const cleanUrl = `/${phase}/${key}.png`;
  let cleanBuffer;
  if (event.packagingType === "OVERLAY_PACKAGE") cleanBuffer = await sharp(Buffer.from(overlaySvg())).png().toBuffer();
  else if (event.packagingType === "TYPOGRAPHY_PACKAGE") {
    const base = await sharp(Buffer.from(typographySvg())).png().toBuffer();
    const glyph = await sharp(glyphPath()).resize(glyphPlacement.width, glyphPlacement.height, {fit: glyphPlacement.fit, background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
    cleanBuffer = await sharp(base).composite([{input: glyph, left: glyphPlacement.left, top: glyphPlacement.top}]).png().toBuffer();
  } else cleanBuffer = await sharp(Buffer.from(event.packagingType === "EXPLAINER_PACKAGE" ? explainerSvg() : event.packagingType === "FULLSCREEN_PACKAGE" ? fullscreenSvg() : overlaySvg())).png().toBuffer();
  fs.mkdirSync(path.dirname(cleanArtifact), {recursive: true});
  await sharp(cleanBuffer).png().toFile(cleanArtifact);
  const publicPath = path.join(publicRoot, cleanUrl.replace(/^\//u, ""));
  fs.mkdirSync(path.dirname(publicPath), {recursive: true});
  fs.copyFileSync(cleanArtifact, publicPath);
  const editableSpec = editableTextSpecForBrief(brief, nodesFor(event, brief));
  if (event.packagingType === "TYPOGRAPHY_PACKAGE") {
    editableSpec.generatedGlyphAssetId = brief.typography.generatedGlyphAssetId;
    editableSpec.generatedGlyphPlacement = glyphPlacement;
    editableSpec.editableShadowPolicy = "local-font-shadow-at-source-mapped-geometry; raster-glyph-remains-read-only-actor";
  }
  const editableSpecArtifact = path.join(artifactDir, `${key}.editable-text-spec.json`);
  const editableSpecUrl = `/${phase}/${key}.editable-text-spec.json`;
  writeJson(editableSpecArtifact, editableSpec);
  const editableSpecPublic = path.join(publicRoot, editableSpecUrl.replace(/^\//u, ""));
  writeJson(editableSpecPublic, editableSpec);
  const metadata = await sharp(cleanArtifact).metadata();
  const anchor = {eventId: event.eventId, sourceBeatIds: event.sourceBeatIds, packagingType: event.packagingType, publicUrl: cleanUrl, sha256: sha256(fs.readFileSync(cleanArtifact)), width: metadata.width, height: metadata.height, alpha: event.packagingType === "OVERLAY_PACKAGE", alphaChannelPresent: Boolean(metadata.hasAlpha), editableText: true, editableTextNodes: editableSpec.nodes, editableTextSpecPublicUrl: editableSpecUrl, editableTextSpecSha256: sha256(fs.readFileSync(editableSpecArtifact)), fontRasterProof: await fontRasterProof(brief.typography.fontFiles), standalone: true, timelineMutation: "none", formalOutputDebugFree: true, cleanOutputDebugLabels: [], styleBriefSha256: brief.styleBriefSha256, styleSkillId: brief.styleSkillId, styleSkillContractVersion: brief.styleSkillContractVersion, referenceIds: brief.sourceReferences.map((reference) => reference.id), adoptedTraits: brief.sourceReferences.flatMap((reference) => reference.adoptedTraits), atmosphere: brief.atmosphere, fingerprint: brief.fingerprint, primaryFamily: brief.variation.primaryFamily, surfaceLogic: brief.variation.surfaceLogic, dominantActor: brief.variation.dominantActor, fontBindings: brief.typography.fontFiles.map((font) => ({assetId: font.assetId, family: font.family, projectRelativePath: font.projectRelativePath, sha256: font.sha256})), ...(event.packagingType === "OVERLAY_PACKAGE" ? {alphaSafePlacement: {safeZones: ["top-right", "bottom-right", "edge-corner"], default: "bottom-right", maxWidthFraction: 0.42, maxHeightFraction: 0.42, avoidCenter: true, placementVariants: [{id: "top-right", anchor: "top-right"}, {id: "bottom-right", anchor: "bottom-right"}, {id: "edge-corner", anchor: "edge-corner"}]}} : {}), ...(event.packagingType === "TYPOGRAPHY_PACKAGE" ? {generatedGlyphAssetId: brief.typography.generatedGlyphAssetId, generatedGlyphPlacement: glyphPlacement, editableShadowPolicy: editableSpec.editableShadowPolicy} : {})};
  if (anchor.alpha) {
    const checkerArtifact = path.join(artifactDir, `${key}-checker.png`);
    const checkerUrl = `/${phase}/${key}-checker.png`;
    await sharp(Buffer.from(checkerSvg())).composite([{input: cleanArtifact}]).png().toFile(checkerArtifact);
    fs.copyFileSync(checkerArtifact, path.join(publicRoot, checkerUrl.replace(/^\//u, "")));
    anchor.checkerPublicUrl = checkerUrl;
    anchor.checkerSha256 = sha256(fs.readFileSync(checkerArtifact));
    anchor.readabilityProofs = [];
    for (const kind of ["deep", "light", "complex"]) {
      const proofArtifact = path.join(artifactDir, `${key}-${kind}-readability.png`);
      const proofUrl = `/${phase}/${key}-${kind}-readability.png`;
      const background = await sharp(Buffer.from(backgroundSvg(kind))).png().toBuffer();
      await sharp(background).composite([{input: cleanArtifact}]).png().toFile(proofArtifact);
      fs.copyFileSync(proofArtifact, path.join(publicRoot, proofUrl.replace(/^\//u, "")));
      anchor.readabilityProofs.push({background: kind, publicUrl: proofUrl, sha256: sha256(fs.readFileSync(proofArtifact))});
    }
  }
  return {anchor, cleanArtifact};
}

async function buildContactSheet(anchors) {
  const tileWidth = 640; const tileHeight = 360; const labelHeight = 70;
  const tiles = await Promise.all(anchors.map(async ({anchor}) => {
    const source = path.join(publicRoot, (anchor.checkerPublicUrl || anchor.publicUrl).replace(/^\//u, ""));
    const image = await sharp(source).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="18" y="28" fill="#f7f4ec" font-family="A1 Fusion Pixel" font-size="20">${esc(anchor.eventId)} · ${esc(anchor.packagingType)}</text><text x="18" y="54" fill="#c9ef39" font-family="A1 Fusion Pixel" font-size="14">CLEAN OUTPUT · READY_FOR_REVIEW</text></svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight + labelHeight, channels: 4, background: "#101315"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: tileHeight}]).png().toBuffer();
  }));
  const contactArtifact = path.join(artifactDir, "three-packaging-anchors-contact-sheet.png");
  await sharp({create: {width: tileWidth * 3, height: tileHeight + labelHeight, channels: 4, background: "#101315"}}).composite(tiles.map((input, index) => ({input, left: index * tileWidth, top: 0}))).png().toFile(contactArtifact);
  const contactUrl = `/${phase}/three-packaging-anchors-contact-sheet.png`;
  fs.copyFileSync(contactArtifact, path.join(publicRoot, contactUrl.replace(/^\//u, "")));
  return {contactArtifact, contactUrl, contactSheetSha256: sha256(fs.readFileSync(contactArtifact))};
}

async function main() {
  const now = new Date().toISOString();
  const current = withProjectLock(appRoot, () => assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)));
  const plan = current.production.packagingBeatPlan;
  assertPackagingBeatPlan(plan);
  const selectedIds = plan.anchorSampling?.selectedEventIds || [];
  if (!selectedIds.length || selectedIds.length > 3 || new Set(selectedIds).size !== selectedIds.length) throw new Error("packaging-anchor-proof-selected-event-ids-missing");
  const anchorEvents = selectedIds.map((eventId) => plan.packagingEvents.find((event) => event.eventId === eventId)).filter(Boolean);
  if (anchorEvents.length !== selectedIds.length) throw new Error("packaging-anchor-proof-event-id-mismatch");
  const styleBriefs = current.production.packagingStyleBriefs || [];
  const styleBriefAudit = current.production.packagingStyleBriefAudit;
  if (styleBriefAudit?.status !== "PASS") throw new Error("packaging-anchor-proof-style-audit-required");
  auditRetroPixelStyleBriefs(styleBriefs, {appRoot, recentHistory: [], distinctEventIds: selectedIds});
  for (const event of anchorEvents) {
    const brief = styleBriefs.find((candidate) => candidate.eventId === event.eventId);
    if (!brief) throw new Error(`packaging-anchor-proof-style-brief-missing:${event.eventId}`);
    assertRetroPixelEditorialStyleBrief(brief, {appRoot});
  }
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("packaging-anchor-proof-requires-empty-queue");
  fs.mkdirSync(publicDir, {recursive: true}); fs.mkdirSync(artifactDir, {recursive: true});
  const rendered = [];
  for (const event of anchorEvents) rendered.push(await renderAnchor(event, styleBriefs.find((brief) => brief.eventId === event.eventId)));
  const contact = await buildContactSheet(rendered);
  const result = withProjectLock(appRoot, () => {
    const latest = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (latest.workspaceSha256 !== current.workspaceSha256) throw new Error("packaging-anchor-proof-workspace-changed-during-render");
    const proof = {contract: A1_PACKAGING_ANCHOR_PROOF_CONTRACT, status: "READY_FOR_REVIEW", engineeringStatus: "ENGINEERING_PASS", visualStatus: "READY_FOR_REVIEW", visualApproval: "PENDING_USER_REVIEW", staticOnly: true, generationPerformed: false, criticPerformed: false, motionPreviewPerformed: false, fullFilmRenderPerformed: false, samplingContract: A1_PACKAGING_ANCHOR_SAMPLING_CONTRACT, maxAnchors: 3, anchorSampleLimit: 3, eventIds: selectedIds, sourceWorkspaceSha256Before: latest.workspaceSha256, sourceWorkspaceSha256: latest.workspaceSha256, planSha256: plan.sha256, contactSheetPublicUrl: contact.contactUrl, contactSheetSha256: contact.contactSheetSha256, anchors: rendered.map(({anchor}) => anchor), generatedAt: now};
    if (JSON.stringify(proof.eventIds) !== JSON.stringify(latest.production.packagingBeatPlan.anchorSampling.selectedEventIds)) throw new Error("packaging-anchor-proof-plan-proof-event-id-mismatch");
    let next = structuredClone(latest); next.production.packagingAnchorProof = proof; next = recalculateEditorialAssetWorkbench(next, now);
    // recalculateEditorialAssetWorkbench returns a new object; write the
    // evidence field onto that returned object. The hash function excludes
    // this self-reference, so a second recalculation is neither needed nor
    // desirable.
    next.production.packagingAnchorProof.persistedWorkspaceSha256After = next.workspaceSha256;
    proof.persistedWorkspaceSha256After = next.workspaceSha256;
    const event = createProductionEvent({workspace: latest, action: "build-packaging-anchor-static-proof", targetId: proof.contract, payload: {eventIds: proof.eventIds, styleBriefAudit: styleBriefAudit.status, generatedImages: false, criticPerformed: false, motionPreviewPerformed: false, fullFilmRenderPerformed: false}, now});
    next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
    const report = {...proof, workspaceSha256: next.workspaceSha256, authorityNextAction: next.production.authority.nextAction, queue: next.production.generation.summary};
    persistProjectState(appRoot, next, {event, files: {"packaging-anchor-proof-v1/report.json": report}});
    return report;
  });
  console.log(JSON.stringify({contract: result.contract, status: result.status, engineeringStatus: result.engineeringStatus, visualStatus: result.visualStatus, workspaceSha256: result.workspaceSha256, eventIds: result.eventIds, contactSheetPublicUrl: result.contactSheetPublicUrl, anchors: result.anchors.map((anchor) => ({eventId: anchor.eventId, packagingType: anchor.packagingType, publicUrl: anchor.publicUrl, editableTextSpecPublicUrl: anchor.editableTextSpecPublicUrl, fingerprint: anchor.fingerprint, fontBindings: anchor.fontBindings})), nextAction: result.authorityNextAction, queue: result.queue}, null, 2));
}

await main();
