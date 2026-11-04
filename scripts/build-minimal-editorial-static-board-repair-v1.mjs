#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "minimal-editorial-static-board-repair-v1");
const frameRoot = path.join(outputRoot, "frames");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

fs.mkdirSync(frameRoot, {recursive: true});
const workspace = readJson(path.join(generatedRoot, "workspace.json"));
const overrides = readJson(path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json"));
const authorityWorkspace = structuredClone(workspace);
authorityWorkspace.production.creatorPackagingProjectOverrides = overrides;
const sequence = buildCanonicalCreatorPackagingSequence(authorityWorkspace, {now: new Date().toISOString()});
const packageDecisions = sequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE");
const packageShotIds = packageDecisions.map((decision) => decision.shotId);
const expectedPackageShotIds = ["ED-01", "ED-07", "ED-08", "ED-09", "ED-12", "ED-13", "ED-14", "ED-16", "ED-19", "ED-31", "ED-34"];
if (JSON.stringify(packageShotIds) !== JSON.stringify(expectedPackageShotIds)) throw new Error(`minimal-board-package-membership-drift:${JSON.stringify(packageShotIds)}`);

const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const currentItems = new Map(board.items.map((item) => [item.shotId, item]));
const timelineByShot = new Map(board.timelineBoard.items.map((item) => [item.shotId, item]));
const plansByShot = new Map(workspace.production.shotIntelligence.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
const videoContexts = new Map((workspace.production.shotIntelligence.videoPackagingContexts?.items || []).map((context) => [context.shotId, context]));
const decisionByShot = new Map(sequence.decisions.map((decision) => [decision.shotId, decision]));
const styleSystem = board.styleLineageAuthority.styleSystem;
const typographyManifest = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/dual-font-typography-layout-masters-v6/manifest.json"));
const fonts = Object.fromEntries(typographyManifest.fonts.map((spec) => {
  const file = path.join(root, spec.file);
  if (!fs.existsSync(file) || fileSha256(file) !== spec.sha256) throw new Error(`minimal-board-font-sha-mismatch:${spec.assetId}`);
  return [spec.assetId.includes("boutique") ? "pixel" : "editorial", {...spec, file, font: fontkit.create(fs.readFileSync(file))}];
}));
const fontBindings = Object.values(fonts).map((font) => ({assetId: font.assetId, family: font.family, sha256: font.sha256}));

function glyphLine({id, font, text, x, y, size, tracking = 0, fill}) {
  const scale = size / font.font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`minimal-board-glyph-missing:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return {
    markup: `<g fill="${fill}">${paths.join("")}</g>`,
    spec: {id, text, fontAssetId: font.assetId, fontFamily: font.family, fontSha256: font.sha256, x, y, size, tracking, fill, editable: true, generated: false, glyphIds},
  };
}

async function renderPresenterOverlay({shotId, basePublicUrl, lines, veilWidth = 760}) {
  const baseFile = publicFile(basePublicUrl);
  if (!fs.existsSync(baseFile)) throw new Error(`minimal-board-presenter-frame-missing:${shotId}`);
  const nodes = lines.map(glyphLine);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="v" x1="0" x2="1"><stop offset="0" stop-color="#090d12" stop-opacity="0.84"/><stop offset="0.72" stop-color="#090d12" stop-opacity="0.42"/><stop offset="1" stop-color="#090d12" stop-opacity="0"/></linearGradient></defs><rect width="${veilWidth}" height="1080" fill="url(#v)"/>${nodes.map((node) => node.markup).join("")}</svg>`);
  const pixels = await sharp(baseFile).resize(1920, 1080, {fit: "cover"}).composite([{input: overlay}]).png({compressionLevel: 9}).toBuffer();
  const file = path.join(frameRoot, `${shotId}.png`);
  fs.writeFileSync(file, pixels);
  return {pixels, file, textNodes: nodes.map((node) => node.spec), baseFile, baseSha256: fileSha256(baseFile)};
}

async function renderConclusion() {
  const support = glyphLine({id: "support", font: fonts.editorial, text: "真正写出", x: 176, y: 286, size: 82, tracking: 5, fill: "#8faeff"});
  const title = glyphLine({id: "title", font: fonts.pixel, text: "自己的风格", x: 170, y: 730, size: 242, tracking: 12, fill: "#f4f6f3"});
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#0b0f13"/>${support.markup}${title.markup}</svg>`);
  const pixels = await sharp(overlay).png({compressionLevel: 9}).toBuffer();
  const file = path.join(frameRoot, "ED-34.png");
  fs.writeFileSync(file, pixels);
  return {pixels, file, textNodes: [support.spec, title.spec]};
}

const generated = new Map();
generated.set("ED-07", await renderPresenterOverlay({
  shotId: "ED-07",
  basePublicUrl: "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-07.jpg",
  lines: [
    {id: "question-a", font: fonts.editorial, text: "直接写完", x: 72, y: 170, size: 94, tracking: 4, fill: "#8faeff"},
    {id: "question-b", font: fonts.pixel, text: "全文？", x: 70, y: 352, size: 156, tracking: 10, fill: "#f4f6f3"},
  ],
  veilWidth: 780,
}));
generated.set("ED-19", await renderPresenterOverlay({
  shotId: "ED-19",
  basePublicUrl: "/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-19-hold-frame.jpg",
  lines: [
    {id: "backstage-a", font: fonts.editorial, text: "Codex", x: 72, y: 168, size: 96, tracking: 4, fill: "#8faeff"},
    {id: "backstage-b", font: fonts.pixel, text: "在后台", x: 70, y: 338, size: 132, tracking: 10, fill: "#f4f6f3"},
  ],
  veilWidth: 690,
}));
generated.set("ED-34", await renderConclusion());

const minimalAuditPending = (role) => ({contract: "A1ShotMinimalEditorialCompositionAudit/v1", status: "PENDING_ACTUAL_PIXEL_REVIEW", actualPixelsViewed: false, primaryActorCount: 1, semanticActionCount: 1, decorativeMotifCount: 0, referenceConstructionMatch: "PENDING", independentPosterProduct: false, compositionRole: role});

function newIntegratedItem(shotId, role) {
  const decision = decisionByShot.get(shotId);
  const rendered = generated.get(shotId);
  const artifactSha256 = sha256(rendered.pixels);
  const presenter = shotId === "ED-34" ? null : {publicUrl: publicUrlFor(rendered.baseFile), sha256: rendered.baseSha256, source: "VERIFIED_EDITOR_OWNED_HOLD_FRAME"};
  const route = presenter ? "PRESENTER_INTEGRATED" : "TYPOGRAPHY_DOMINANT";
  return {
    shotId,
    sourceText: decision.sourceText,
    semanticJob: decision.rationale,
    assemblyMode: decision.assemblyMode,
    presentationMode: decision.presentationMode,
    artifactSha256,
    artifactPublicUrl: publicUrlFor(rendered.file),
    previewPublicUrl: publicUrlFor(rendered.file),
    previewSha256: artifactSha256,
    compositeSha256: artifactSha256,
    textNodes: rendered.textNodes,
    styleLineage: {
      contract: "A1StaticBoardStyleLineage/v1",
      styleSystemId: styleSystem.id,
      styleSystemSha256: styleSystem.sha256,
      pixelTreatment: "PRESERVED_STRONG_MASTER",
      pixelRecomposed: false,
      compositionMethod: "HASH_BOUND_LOCAL_MINIMAL_EDITORIAL_COMPLETE_LOOK_MASTER",
      compositeSha256: artifactSha256,
      sourceArtifactSha256: artifactSha256,
      preservationReason: "NEW_MINIMAL_EDITORIAL_ACTUAL_PIXEL_MASTER_PENDING_REVIEW",
      preservedActualPixelReview: false,
      typographyMasterId: typographyManifest.contract,
      typographyMasterSha256: typographyManifest.manifestSha256,
      fontBindings,
      backgroundBinding: null,
      presenterBinding: presenter,
      visualMaterialRoute: route,
      illustrationBinding: null,
      elementBindings: [],
      sourceEvidenceBinding: null,
      typographyJustification: route === "TYPOGRAPHY_DOMINANT" ? "终局只保留一个方向性结论，语言本身承担片尾停顿。" : null,
      selectionOnly: false,
      auditBytesUnchanged: false,
      compositeVisualAudit: {contract: "A1StaticBoardCompositeVisualAudit/v1", status: "PENDING_ACTUAL_PIXEL_REVIEW", compositeSha256: artifactSha256, actualPixelsViewed: false, semanticAgreement: "PENDING", visualActorDominant: true, formalTextRendererBound: true, generatedFormalText: false},
      minimalCompositionAudit: minimalAuditPending(role),
    },
  };
}

const compositionRole = {
  "ED-01": "PRESENTER_IDENTITY_OVERLAY",
  "ED-07": "PRESENTER_QUESTION_OVERLAY",
  "ED-08": "EARNED_VERDICT_TAKEOVER",
  "ED-09": "READING_FAILURE_EXPLAINER",
  "ED-12": "SOURCE_BOUND_ENTITY_EXPLAINER",
  "ED-13": "PRESENTER_UNRESOLVED_OVERLAY",
  "ED-14": "VERIFIED_SOURCE_EVIDENCE",
  "ED-16": "SINGLE_CAUSAL_MECHANISM",
  "ED-19": "PRESENTER_BACKSTAGE_OVERLAY",
  "ED-31": "PRESENTER_CONTROL_OVERLAY",
  "ED-34": "EARNED_CONCLUSION_TAKEOVER",
};

const items = packageShotIds.map((shotId) => {
  if (generated.has(shotId)) return newIntegratedItem(shotId, compositionRole[shotId]);
  const current = structuredClone(currentItems.get(shotId));
  if (!current) throw new Error(`minimal-board-current-item-missing:${shotId}`);
  const decision = decisionByShot.get(shotId);
  current.sourceText = decision.sourceText;
  current.assemblyMode = decision.assemblyMode;
  current.presentationMode = decision.presentationMode;
  current.styleLineage.minimalCompositionAudit = minimalAuditPending(compositionRole[shotId]);
  return current;
});

async function buildContactSheet(sheetItems, outputFile, {columns, tileWidth, imageHeight, labelHeight, timeline = false}) {
  const tileHeight = imageHeight + labelHeight;
  const tiles = await Promise.all(sheetItems.map(async (item) => {
    const previewPublicUrl = timeline ? item.preview.publicUrl : item.previewPublicUrl;
    const image = await sharp(publicFile(previewPublicUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const title = timeline ? `${item.shotId} · ${item.route}` : `${item.shotId} · ${compositionRole[item.shotId]}`;
    const subtitle = timeline ? (item.packageBoardItem ? "MINIMAL A1 PACKAGE" : "EDITOR SOURCE") : `${item.presentationMode} · ${item.styleLineage.visualMaterialRoute}`;
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="6" height="100%" fill="${timeline && !item.packageBoardItem ? "#4b5358" : "#8faeff"}"/><text x="18" y="24" fill="#f3f5f2" font-family="Arial" font-size="14" font-weight="700">${escapeXml(title)}</text><text x="18" y="47" fill="#8faeff" font-family="Arial" font-size="10">${escapeXml(subtitle)}</text>${timeline ? `<text x="18" y="68" fill="#8d9690" font-family="Arial" font-size="9">${escapeXml(String(item.sourceText || "").slice(0, 28))}</text>` : ""}</svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f13"}}).composite([{input: image}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const rows = Math.ceil(sheetItems.length / columns);
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}}).composite(tiles.map((input, index) => ({input, left: index % columns * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {publicUrl: publicUrlFor(outputFile), sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight};
}

const itemByShot = new Map(items.map((item) => [item.shotId, item]));
const timelineItems = sequence.decisions.map((decision) => {
  const current = structuredClone(timelineByShot.get(decision.shotId));
  if (!current) throw new Error(`minimal-board-timeline-item-missing:${decision.shotId}`);
  const packageItem = itemByShot.get(decision.shotId);
  if (packageItem) return {...current, route: "PACKAGE_LOOK_MASTER", packageBoardItem: true, sourceText: decision.sourceText, preview: {publicUrl: packageItem.previewPublicUrl, sha256: packageItem.artifactSha256, provenance: "CURRENT_MINIMAL_EDITORIAL_COMPOSITE"}, artifactSha256: packageItem.artifactSha256, previewPublicUrl: packageItem.previewPublicUrl, styleCompositeSha256: packageItem.artifactSha256};
  const contextFrame = videoContexts.get(decision.shotId)?.baseFrame || null;
  if (["ED-10", "ED-17", "ED-33"].includes(decision.shotId) && !contextFrame?.publicUrl) throw new Error(`minimal-board-demoted-presenter-frame-missing:${decision.shotId}`);
  return {...current, route: decision.route, packageBoardItem: false, sourceText: decision.sourceText, preview: contextFrame?.publicUrl ? {publicUrl: contextFrame.publicUrl, sha256: contextFrame.sha256, provenance: "VERIFIED_EDITOR_OWNED_HOLD_FRAME"} : current.preview, artifactSha256: contextFrame?.sha256 || current.artifactSha256, previewPublicUrl: contextFrame?.publicUrl || current.previewPublicUrl, packageCandidateSha256: null, styleCompositeSha256: null};
});

const packageBoard = await buildContactSheet(items, path.join(outputRoot, "whole-film-package-board.png"), {columns: 3, tileWidth: 480, imageHeight: 270, labelHeight: 64});
const timelineBoard = await buildContactSheet(timelineItems, path.join(outputRoot, "whole-film-timeline-board.png"), {columns: 4, tileWidth: 360, imageHeight: 203, labelHeight: 86, timeline: true});
const manifestBase = {
  contract: "A1MinimalEditorialStaticBoardRepair/v1",
  status: "AWAITING_AGENT_ACTUAL_PIXEL_REVIEW",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  userVisualApproval: "NOT_APPROVED",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceBoardSha256: board.sha256,
  sourceTimelineBoardSha256: board.timelineBoard.sha256,
  sequenceSha256: sequence.sequenceSha256,
  compositionDirective: overrides.wholeFilmCompositionDirective,
  packageShotIds,
  demotedBreathingBeatShotIds: ["ED-10", "ED-17", "ED-33"],
  newlyCompositedShotIds: [...generated.keys()],
  styleSystem,
  items,
  timelineItems,
  packageBoard,
  timelineBoard,
  counts: {shotCount: sequence.decisions.length, packageCount: items.length, noPackageCount: sequence.decisions.length - items.length, presenterIntegratedCount: packageDecisions.filter((decision) => decision.frameOccupation === "OVERLAY").length, standaloneTypographyTakeoverCount: packageDecisions.filter((decision) => decision.contentTreatment === "HERO_TYPOGRAPHY" && decision.frameOccupation === "FULL_FRAME_TAKEOVER").length, sourceOrExplainerCount: packageDecisions.filter((decision) => decision.contentTreatment === "EDITORIAL_EXPLAINER").length},
  boundaries: {imageGenerationPerformed: false, imagegenCallCount: 0, motionPerformed: false, assemblyCreated: false, layerExtractionPerformed: false, resolveUsed: false, finalRenderUsed: false},
  generatedAt: new Date().toISOString(),
};
const manifest = {...manifestBase, manifestSha256: sha256(manifestBase)};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, outputRoot, packageBoard, timelineBoard, counts: manifest.counts, manifestSha256: manifest.manifestSha256}, null, 2));
