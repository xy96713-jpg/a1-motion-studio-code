#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_PACKAGING_ANCHOR_PROOF_CONTRACT, A1_PACKAGING_ANCHOR_SAMPLING_CONTRACT, assertPackagingBeatPlan} from "../apps/studio-next/src/lib/a1-editorial-packaging-boundary-v1.mjs";
import {assertRetroPixelEditorialStyleBrief, auditRetroPixelStyleBriefs, editableTextSpecForBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phase = "generated/system-line/editorial-asset-workbench-v1/reference-conditioned-imagegen-v1";
const publicDir = path.join(publicRoot, phase);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/reference-conditioned-imagegen-v1");
const width = 1920; const height = 1080;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fusionPath = path.join(appRoot, "public/a1-editorial-fonts/fusion-pixel.ttf");
const heavyPath = path.join(appRoot, "public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const imagegenDir = path.join(publicDir);
const masters = {
  "packaging-event-01": path.join(imagegenDir, "ed01-imagegen-master-alpha.png"),
  "packaging-event-02": path.join(imagegenDir, "ed10-imagegen-master.png"),
  "packaging-event-03": path.join(imagegenDir, "ed14-imagegen-master.png"),
};
const sourceMasters = {
  "packaging-event-01": "/Users/a1/.codex/generated_images/019fc66e-1cdf-7dd0-9662-30a85431e10b/exec-ac7ab715-7cd8-4c58-8a38-b2afb3569686.png",
  "packaging-event-02": "/Users/a1/.codex/generated_images/019fc66e-1cdf-7dd0-9662-30a85431e10b/exec-a73160b9-5da2-45c0-a0e4-97b272e8c322.png",
  "packaging-event-03": "/Users/a1/.codex/generated_images/019fc66e-1cdf-7dd0-9662-30a85431e10b/exec-89e4c35b-3647-4e14-a60a-7dca1bdc4099.png",
};
const fontData = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
const fontCss = () => `<style>@font-face{font-family:'A1 Fusion Pixel';src:url(${fontData(fusionPath, "font/ttf")}) format('truetype');font-weight:400 900;}@font-face{font-family:'A1 Source Han Heavy';src:url(${fontData(heavyPath, "font/otf")}) format('opentype');font-weight:400 900;}</style>`;
const svg = (body, background = "none") => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${fontCss()}<rect width="100%" height="100%" fill="${background}"/>${body}</svg>`;
const text = (x, y, value, size, fill, family = "A1 Source Han Heavy", weight = 900, extra = "") => `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
const pixel = (x, y, w, h, fill, opacity = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="${opacity}" shape-rendering="crispEdges"/>`;

function node(id, value, fontAssetId, x, y, nodeWidth, nodeHeight, size, semanticRole) {
  return {id, text: value, fontAssetId, geometry: {x, y, width: nodeWidth, height: nodeHeight}, size, lineHeight: Math.round(size * 1.08), tracking: 0, semanticRole};
}

function nodesFor(event, brief) {
  const support = brief.typography.supportFontAssetId;
  const display = brief.typography.displayFontAssetId;
  if (event.eventId === "packaging-event-01") return [node("workbench-title", "智能写作工作台", support, 1280, 400, 440, 70, 48, "identity"), node("vibe-coding", "vibe coding", display, 1284, 470, 230, 38, 28, "identity-context")];
  if (event.eventId === "packaging-event-02") return [node("polished-copy", "完成度很高的", support, 178, 360, 610, 138, 112, "surface-judgement"), node("replacement-action", "替换", display, 820, 560, 150, 48, 32, "semantic-action"), node("waste-copy", "废稿", display, 1040, 820, 560, 190, 188, "verdict-actor")];
  return [node("candidate-common", "常见", support, 125, 250, 220, 110, 88, "candidate-option"), node("candidate-safe", "稳妥", support, 130, 485, 220, 110, 88, "candidate-option"), node("candidate-reusable", "可复用", support, 112, 720, 300, 110, 88, "candidate-option"), node("selection-action", "筛选", display, 875, 530, 130, 48, 32, "selection-mechanism"), node("default-rail", "默认轨道", support, 1265, 655, 400, 110, 82, "converged-default")];
}

function overlayTextSvg() {
  return svg([
    `<rect x="1250" y="332" width="520" height="154" fill="#f3efe5" opacity=".92"/>`,
    `<g shape-rendering="crispEdges">${pixel(1260, 348, 20, 20, "#265dff")}${pixel(1284, 348, 20, 20, "#265dff", .65)}${pixel(1308, 348, 20, 20, "#265dff", .3)}</g>`,
    text(1280, 410, "智能写作工作台", 48, "#101315"),
    text(1284, 466, "vibe coding", 28, "#265dff", "A1 Fusion Pixel", 700),
  ].join(""));
}

function typographyTextSvg() {
  return svg([
    `<path d="M760 286H920V560H1006" fill="none" stroke="#265dff" stroke-width="10" stroke-dasharray="4 18" shape-rendering="crispEdges"/>`,
    `<path d="M780 306H940V580H1026" fill="none" stroke="#c9ef39" stroke-width="4" opacity=".75" shape-rendering="crispEdges"/>`,
    `<rect x="140" y="230" width="690" height="170" fill="#f3efe5" opacity=".88"/>`,
    text(178, 360, "完成度很高的", 112, "#265dff"),
    text(820, 600, "替换", 32, "#111315", "A1 Fusion Pixel", 800),
    `<rect x="1000" y="650" width="630" height="260" fill="#f3efe5" opacity=".72"/>`,
    text(1040, 820, "废稿", 188, "#111315", "A1 Fusion Pixel", 900),
    `<g shape-rendering="crispEdges">${pixel(1044, 852, 22, 22, "#265dff")}${pixel(1072, 880, 22, 22, "#265dff", .6)}${pixel(1100, 908, 22, 22, "#265dff", .3)}</g>`,
  ].join(""));
}

function explainerTextSvg() {
  return svg([
    `<rect x="92" y="150" width="250" height="132" fill="#f3efe5" opacity=".88"/><rect x="96" y="385" width="250" height="132" fill="#f3efe5" opacity=".88"/><rect x="78" y="620" width="340" height="132" fill="#f3efe5" opacity=".88"/>`,
    text(125, 250, "常见", 88, "#111315"), text(130, 485, "稳妥", 88, "#111315"), text(112, 720, "可复用", 88, "#111315"),
    text(875, 530, "筛选", 32, "#111315", "A1 Fusion Pixel", 800), text(1265, 655, "默认轨道", 82, "#111315"),
    `<g shape-rendering="crispEdges">${pixel(835, 500, 18, 18, "#c9ef39")}${pixel(859, 500, 18, 18, "#c9ef39", .7)}${pixel(883, 500, 18, 18, "#c9ef39", .4)}</g>`,
  ].join(""));
}

function testBackgroundSvg(kind) {
  if (kind === "deep") return svg(`<rect width="100%" height="100%" fill="#111315"/><rect x="120" y="150" width="580" height="190" fill="#2a3033"/><rect x="1320" y="760" width="420" height="160" fill="#1d2427"/>`, "#111315");
  if (kind === "light") return svg(`<rect width="100%" height="100%" fill="#f3efe5"/><rect x="120" y="150" width="580" height="190" fill="#e2ddd1"/><rect x="1320" y="760" width="420" height="160" fill="#ddd7cb"/>`, "#f3efe5");
  return svg(`<rect width="100%" height="100%" fill="#b9b2a6"/><g shape-rendering="crispEdges"><rect x="70" y="90" width="270" height="220" fill="#15191b"/><rect x="500" y="750" width="350" height="150" fill="#265dff" opacity=".6"/><rect x="1380" y="180" width="300" height="250" fill="#c9ef39" opacity=".7"/><rect x="1000" y="760" width="260" height="100" fill="#111315" opacity=".75"/></g>`, "#b9b2a6");
}

async function fontRasterProof(brief) {
  const fonts = [];
  for (const font of brief.typography.fontFiles) {
    const family = font.family;
    const specimen = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="160">${fontCss()}<text x="20" y="110" fill="#111315" font-family="${family}" font-size="76">A1 可编辑</text></svg>`;
    const buffer = await sharp(Buffer.from(specimen)).png().toBuffer();
    const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    let ink = 0;
    for (let i = 0; i < raw.data.length; i += raw.info.channels) if (raw.data[i] < 245 || raw.data[i + 1] < 245 || raw.data[i + 2] < 245) ink += 1;
    if (ink < 100) throw new Error(`font-raster-proof-empty:${font.assetId}`);
    fonts.push({assetId: font.assetId, family, fontSha256: font.sha256, probeText: "A1 可编辑", probeRasterSha256: fileSha(await (async () => { const file = path.join(artifactDir, `${font.assetId}-font-probe.png`); fs.writeFileSync(file, buffer); return file; })()), nonBackgroundPixelCount: ink});
  }
  return {contract: "A1FontRasterProof/v1", status: "PASS", method: "embedded-project-font-raster-probe", systemFallbackForbidden: true, fonts};
}

async function renderEvent(event, brief) {
  const master = masters[event.eventId];
  if (!fs.existsSync(master)) throw new Error(`imagegen-master-missing:${event.eventId}`);
  const masterMetadata = await sharp(master).metadata();
  const masterSha256 = fileSha(master);
  const textLayer = event.eventId === "packaging-event-01" ? overlayTextSvg() : event.eventId === "packaging-event-02" ? typographyTextSvg() : explainerTextSvg();
  let clean;
  let alpha = false;
  if (event.eventId === "packaging-event-01") {
    const trimmed = await sharp(master).trim({background: {r: 0, g: 0, b: 0, alpha: 0}}).resize({width: 650, height: 430, fit: "inside"}).png().toBuffer();
    const transparentBase = await sharp({create: {width, height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).png().toBuffer();
    const positioned = await sharp(transparentBase).composite([{input: trimmed, left: 1230, top: 520}, {input: Buffer.from(textLayer)}]).png().toBuffer();
    clean = positioned; alpha = true;
  } else {
    const base = await sharp(master).resize(width, height, {fit: "cover"}).png().toBuffer();
    clean = await sharp(base).composite([{input: Buffer.from(textLayer)}]).png().toBuffer();
  }
  const key = `${event.eventId}-${event.packagingType.toLowerCase().replaceAll("_package", "")}`;
  const cleanFile = path.join(artifactDir, `${key}-clean.png`); const cleanUrl = `/${phase}/${key}-clean.png`;
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  fs.writeFileSync(cleanFile, clean); fs.copyFileSync(cleanFile, path.join(publicDir, `${key}-clean.png`));
  const editableSpec = editableTextSpecForBrief(brief, nodesFor(event, brief));
  editableSpec.contract = "A1EditableTextSpec/v1";
  editableSpec.imagegenMasterPolicy = "imagegen-is-material-actor; exact semantic text remains local editable layer";
  editableSpec.nodes = editableSpec.nodes.map((node) => ({...node, fontSha256: brief.typography.fontFiles.find((font) => font.assetId === node.fontAssetId)?.sha256 || null}));
  if (editableSpec.nodes.some((node) => !node.fontSha256)) throw new Error(`editable-text-font-binding-missing:${event.eventId}`);
  const specFile = path.join(artifactDir, `${key}.editable-text-spec.json`); const specUrl = `/${phase}/${key}.editable-text-spec.json`;
  writeJson(specFile, editableSpec); writeJson(path.join(publicDir, `${key}.editable-text-spec.json`), editableSpec);
  const metadata = await sharp(cleanFile).metadata();
  const fontProof = await fontRasterProof(brief);
  const sourcePath = sourceMasters[event.eventId];
  const anchor = {eventId: event.eventId, sourceBeatIds: event.sourceBeatIds, packagingType: event.packagingType, route: "reference-conditioned-imagegen-plus-editable-compositor", publicUrl: cleanUrl, sha256: fileSha(cleanFile), width: metadata.width, height: metadata.height, alpha, alphaChannelPresent: Boolean(metadata.hasAlpha), editableText: true, editableTextSpecPublicUrl: specUrl, editableTextSpecSha256: fileSha(specFile), editableTextNodes: editableSpec.nodes, styleBriefSha256: brief.styleBriefSha256, styleSkillId: brief.styleSkillId, styleSkillContractVersion: brief.styleSkillContractVersion, referenceIds: brief.sourceReferences.map((reference) => reference.id), adoptedTraits: brief.sourceReferences.flatMap((reference) => reference.adoptedTraits), atmosphere: brief.atmosphere, fingerprint: brief.fingerprint, primaryFamily: brief.variation.primaryFamily, surfaceLogic: brief.variation.surfaceLogic, dominantActor: brief.variation.dominantActor, fontBindings: brief.typography.fontFiles.map((font) => ({assetId: font.assetId, family: font.family, projectRelativePath: font.projectRelativePath, sha256: font.sha256})), fontRasterProof: fontProof, imagegenMaster: {workspacePublicUrl: `/${phase}/${path.basename(master)}`, workspaceSha256: masterSha256, sourcePath, sourceSha256: fs.existsSync(sourcePath) ? fileSha(sourcePath) : null, attempt: 1, status: "IMAGEGEN_STYLE_MASTER_READY", visualApproval: "PENDING_USER_REVIEW", generatedReadableText: false}, imagegenMaterialPolicy: "material-and-composition-only; no factual UI, brand, or authoritative Chinese text", formalOutputDebugFree: true, cleanOutputDebugLabels: [], standalone: true, timelineMutation: "none", criticPerformed: false, motionPreviewPerformed: false, fullFilmRenderPerformed: false};
  if (alpha) {
    const checker = await sharp(Buffer.from(testBackgroundSvg("complex"))).composite([{input: cleanFile}]).png().toBuffer();
    const checkerFile = path.join(artifactDir, `${key}-checker.png`); fs.writeFileSync(checkerFile, checker); fs.copyFileSync(checkerFile, path.join(publicDir, `${key}-checker.png`));
    anchor.checkerPublicUrl = `/${phase}/${key}-checker.png`;
    anchor.checkerSha256 = fileSha(checkerFile);
    anchor.alphaSafePlacement = {
      default: "bottom-right",
      safeZones: ["top-right", "bottom-right", "edge-corner"],
      maxWidthFraction: 0.42,
      maxHeightFraction: 0.42,
      avoidCenter: true,
      placementVariants: [
        {id: "top-right", anchor: "top-right"},
        {id: "bottom-right", anchor: "bottom-right"},
        {id: "edge-corner", anchor: "edge-corner"},
      ],
    };
    anchor.readabilityProofs = [];
    for (const kind of ["deep", "light", "complex"]) { const out = path.join(artifactDir, `${key}-${kind}-test-background.png`); const buffer = await sharp(Buffer.from(testBackgroundSvg(kind))).composite([{input: cleanFile}]).png().toBuffer(); fs.writeFileSync(out, buffer); fs.copyFileSync(out, path.join(publicDir, path.basename(out))); anchor.readabilityProofs.push({background: kind, label: "TEST BACKGROUND", publicUrl: `/${phase}/${path.basename(out)}`, sha256: fileSha(out)}); }
  }
  return {anchor, cleanFile};
}

async function buildComparisonSheet(anchors) {
  const tileWidth = 640; const tileHeight = 360; const labelHeight = 92;
  const tiles = await Promise.all(anchors.map(async ({anchor}) => { const source = path.join(publicRoot, anchor.publicUrl.replace(/^\//u, "")); const image = await sharp(source).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(); const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="18" y="28" fill="#f7f4ec" font-family="monospace" font-size="18">${esc(anchor.eventId)} · ${esc(anchor.packagingType)}</text><text x="18" y="53" fill="#c9ef39" font-family="monospace" font-size="14">IMAGEGEN MASTER + EDITABLE COMPOSITOR</text><text x="18" y="77" fill="#e8c765" font-family="monospace" font-size="12">READY_FOR_REVIEW · not visual approved</text></svg>`); return sharp({create: {width: tileWidth, height: tileHeight + labelHeight, channels: 4, background: "#101315"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: tileHeight}]).png().toBuffer(); }));
  const file = path.join(artifactDir, "three-reference-conditioned-anchors-comparison-proof.png"); await sharp({create: {width: tileWidth * 3, height: tileHeight + labelHeight, channels: 4, background: "#101315"}}).composite(tiles.map((input, index) => ({input, left: tileWidth * index, top: 0}))).png().toFile(file); const publicFile = path.join(publicDir, path.basename(file)); fs.copyFileSync(file, publicFile); return {publicUrl: `/${phase}/${path.basename(file)}`, sha256: fileSha(file), file};
}

async function main() {
  const now = new Date().toISOString();
  const current = withProjectLock(appRoot, () => assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)));
  const oldProof = current.production.packagingAnchorProof;
  const canBuildFromSuperseded = oldProof?.visualStatus === "VISUAL_REJECTED" && oldProof?.replacementRoute === "reference-conditioned-imagegen-plus-editable-compositor";
  const canRefineCurrent = oldProof?.route === "reference-conditioned-imagegen-plus-editable-compositor" && oldProof?.visualStatus === "READY_FOR_REVIEW";
  if ((!canBuildFromSuperseded && !canRefineCurrent) || Number(oldProof?.compositorRevision || 0) >= 1) throw new Error("reference-conditioned-proof-requires-superseded-proof-or-one-time-structure-refinement");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("reference-conditioned-proof-requires-frozen-empty-queue");
  const plan = current.production.packagingBeatPlan; assertPackagingBeatPlan(plan);
  const selectedIds = plan.anchorSampling?.selectedEventIds || [];
  if (JSON.stringify(selectedIds) !== JSON.stringify(oldProof.eventIds) || selectedIds.length !== 3) throw new Error("reference-conditioned-proof-anchor-selection-mismatch");
  const briefs = current.production.packagingStyleBriefs || []; if (current.production.packagingStyleBriefAudit?.status !== "PASS") throw new Error("reference-conditioned-proof-style-audit-required");
  auditRetroPixelStyleBriefs(briefs, {appRoot, recentHistory: [], distinctEventIds: selectedIds});
  const events = selectedIds.map((eventId) => plan.packagingEvents.find((event) => event.eventId === eventId));
  for (const event of events) { if (!event) throw new Error(`anchor-event-missing:${event}`); const brief = briefs.find((candidate) => candidate.eventId === event.eventId); if (!brief) throw new Error(`style-brief-missing:${event.eventId}`); assertRetroPixelEditorialStyleBrief(brief, {appRoot}); if (!fs.existsSync(masters[event.eventId])) throw new Error(`imagegen-master-missing:${event.eventId}`); }
  fs.mkdirSync(artifactDir, {recursive: true});
  const manifest = {contract: "A1ReferenceConditionedImagegenManifest/v1", generatedAt: now, attemptPolicy: "max one first pass plus one controlled retry; same content hash is never re-run", anchors: [
    {eventId: "packaging-event-01", attempts: [{attempt: 1, status: "IMAGEGEN_STYLE_MASTER_READY", sourcePath: sourceMasters["packaging-event-01"], sourceSha256: fs.existsSync(sourceMasters["packaging-event-01"]) ? fileSha(sourceMasters["packaging-event-01"]) : null, workspacePath: masters["packaging-event-01"], workspaceSha256: fileSha(masters["packaging-event-01"])}]},
    {eventId: "packaging-event-02", attempts: [{attempt: 1, status: "IMAGEGEN_STYLE_MASTER_READY", sourcePath: sourceMasters["packaging-event-02"], sourceSha256: fs.existsSync(sourceMasters["packaging-event-02"]) ? fileSha(sourceMasters["packaging-event-02"]) : null, workspacePath: masters["packaging-event-02"], workspaceSha256: fileSha(masters["packaging-event-02"])}]},
    {eventId: "packaging-event-03", attempts: [{attempt: 1, status: "BLOCKED_IMAGEGEN_SERVICE", errorCode: 403}, {attempt: 2, status: "IMAGEGEN_STYLE_MASTER_READY", sourcePath: sourceMasters["packaging-event-03"], sourceSha256: fs.existsSync(sourceMasters["packaging-event-03"]) ? fileSha(sourceMasters["packaging-event-03"]) : null, workspacePath: masters["packaging-event-03"], workspaceSha256: fileSha(masters["packaging-event-03"])}]},
  ], imagegenOnly: true, criticPerformed: false, motionPreviewPerformed: false, fullFilmRenderPerformed: false};
  writeJson(path.join(artifactDir, "imagegen-manifest.json"), manifest); writeJson(path.join(publicDir, "imagegen-manifest.json"), manifest);
  const rendered = []; for (const event of events) rendered.push(await renderEvent(event, briefs.find((brief) => brief.eventId === event.eventId)));
  const comparison = await buildComparisonSheet(rendered);
  const result = withProjectLock(appRoot, () => {
    const latest = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)); if (latest.workspaceSha256 !== current.workspaceSha256) throw new Error("reference-conditioned-proof-workspace-changed-during-build");
    const proof = {contract: "A1ReferenceConditionedPackagingAnchorProof/v1", supersedesContract: A1_PACKAGING_ANCHOR_PROOF_CONTRACT, status: "READY_FOR_REVIEW", engineeringStatus: "ENGINEERING_PASS", visualStatus: "READY_FOR_REVIEW", visualApproval: "PENDING_USER_REVIEW", route: "reference-conditioned-imagegen-plus-editable-compositor", compositorRevision: canRefineCurrent ? 1 : 0, previousProofWorkspaceSha256: canRefineCurrent ? oldProof.persistedWorkspaceSha256After : null, previousProofStatus: canRefineCurrent ? oldProof.visualStatus : null, statusHistory: canRefineCurrent ? [{status: oldProof.visualStatus, workspaceSha256: oldProof.persistedWorkspaceSha256After, reason: "one-time-layout-clarity-refinement"}] : [], generationPerformed: true, criticPerformed: false, motionPreviewPerformed: false, fullFilmRenderPerformed: false, staticOnly: true, samplingContract: A1_PACKAGING_ANCHOR_SAMPLING_CONTRACT, maxAnchors: 3, anchorSampleLimit: 3, eventIds: selectedIds, sourceWorkspaceSha256Before: current.workspaceSha256, planSha256: plan.sha256, styleBriefAudit: latest.production.packagingStyleBriefAudit, imagegenManifestPublicUrl: `/${phase}/imagegen-manifest.json`, comparisonProofPublicUrl: comparison.publicUrl, comparisonProofSha256: comparison.sha256, anchors: rendered.map(({anchor}) => anchor), generatedAt: now, testBackgroundLabel: "TEST BACKGROUND · readability fixture only", cleanOutputPolicy: "debug-free independent package files; debug labels only in comparison proof", timelineMutation: "none", nextStep: "user-aesthetic-review"};
    if (JSON.stringify(proof.eventIds) !== JSON.stringify(latest.production.packagingBeatPlan.anchorSampling.selectedEventIds)) throw new Error("reference-conditioned-proof-plan-proof-event-id-mismatch");
    let next = structuredClone(latest); next.production.packagingAnchorProof = proof; next = recalculateEditorialAssetWorkbench(next, now); proof.persistedWorkspaceSha256After = next.workspaceSha256; next.production.packagingAnchorProof.persistedWorkspaceSha256After = next.workspaceSha256;
    const event = createProductionEvent({workspace: latest, action: "build-reference-conditioned-packaging-anchor-proof", targetId: proof.contract, payload: {eventIds: selectedIds, route: proof.route, generatedImages: true, criticPerformed: false, motionPreviewPerformed: false, fullFilmRenderPerformed: false}, now}); next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
    const report = {...proof, workspaceSha256: next.workspaceSha256, queue: next.production.generation.summary, worker: next.production.generation.workerStatus}; persistProjectState(appRoot, next, {event, files: {"reference-conditioned-imagegen-v1/report.json": report}}); return report;
  });
  console.log(JSON.stringify({contract: result.contract, status: result.status, visualStatus: result.visualStatus, workspaceSha256: result.workspaceSha256, eventIds: result.eventIds, comparisonProofPublicUrl: result.comparisonProofPublicUrl, anchors: result.anchors.map((anchor) => ({eventId: anchor.eventId, publicUrl: anchor.publicUrl, checkerPublicUrl: anchor.checkerPublicUrl, editableTextSpecPublicUrl: anchor.editableTextSpecPublicUrl, imagegenMaster: anchor.imagegenMaster, fingerprint: anchor.fingerprint})), queue: result.queue, worker: result.worker, nextStep: result.nextStep}, null, 2));
}

await main();
