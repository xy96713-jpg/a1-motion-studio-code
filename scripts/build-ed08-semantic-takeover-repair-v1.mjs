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
const outputRoot = path.join(generatedRoot, "ed08-semantic-takeover-repair-v1");
const frameRoot = path.join(outputRoot, "frames");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const overridesFile = path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json");
const fontFile = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const workspace = readJson(workspaceFile);
const overrides = readJson(overridesFile);
const authorityWorkspace = structuredClone(workspace);
authorityWorkspace.production.creatorPackagingProjectOverrides = overrides;
const sequence = buildCanonicalCreatorPackagingSequence(authorityWorkspace, {now: new Date().toISOString()});
const decision = sequence.decisions.find((item) => item.shotId === "ED-08");
if (decision?.packageDecision !== "PACKAGE" || decision.assemblyMode !== "TYPOGRAPHY" || decision.presentationMode !== "FULLSCREEN_TYPOGRAPHY_TAKEOVER") throw new Error("ed08-takeover-canonical-mode-invalid");
if (JSON.stringify(decision.requiredFormalText) !== JSON.stringify(["AI 常常不说人话"])) throw new Error("ed08-takeover-exact-copy-invalid");
if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") throw new Error("ed08-takeover-runtime-not-frozen-idle");
if ((workspace.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("ed08-takeover-assembly-must-remain-empty");
if (workspace.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("ed08-takeover-user-approval-boundary-invalid");

fs.mkdirSync(frameRoot, {recursive: true});
const fontBytes = fs.readFileSync(fontFile);
const fontSha256 = sha256(fontBytes);
const expectedFontSha256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
if (fontSha256 !== expectedFontSha256) throw new Error(`ed08-takeover-font-sha-mismatch:${fontSha256}`);
const font = fontkit.create(fontBytes);
const fontBinding = {assetId: "type-a1-fusion-pixel", family: font.familyName || "Fusion Pixel", sha256: fontSha256, publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", license: "OFL-1.1"};

function glyphLine({id, text, x, baseline, size, tracking = 0, fill, opacity = 1}) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`ed08-takeover-glyph-missing:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${baseline.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return {
    width: cursor - x,
    markup: `<g fill="${fill}" opacity="${opacity}">${paths.join("")}</g>`,
    spec: {id, text, fontAssetId: fontBinding.assetId, fontFamily: fontBinding.family, fontSha256, x, y: baseline, size, tracking, fill, editable: true, generated: false, glyphIds},
  };
}

const kicker = glyphLine({id: "verdict-prefix", text: "AI 常常", x: 178, baseline: 300, size: 126, tracking: 8, fill: "#7898ff"});
const first = glyphLine({id: "verdict-first", text: "不说", x: 172, baseline: 735, size: 278, tracking: 12, fill: "#f2f5f4"});
const secondX = 172 + first.width + 34;
const secondShadow = glyphLine({id: "semantic-misregistration-shadow", text: "人话", x: secondX + 22, baseline: 758, size: 278, tracking: 12, fill: "#2452ff", opacity: 0.52});
const second = glyphLine({id: "verdict-second", text: "人话", x: secondX, baseline: 735, size: 278, tracking: 12, fill: "#f2f5f4"});
const frameSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <rect width="1920" height="1080" fill="#090d12"/>
  <rect x="0" y="0" width="1920" height="322" fill="#0c1119"/>
  <rect x="0" y="856" width="1920" height="224" fill="#080b0f"/>
  <rect x="158" y="836" width="1448" height="10" fill="#1d2e66"/>
  <rect x="1606" y="836" width="156" height="10" fill="#2452ff"/>
  ${kicker.markup}
  ${first.markup}
  ${secondShadow.markup}
  ${second.markup}
</svg>`);
const frameBytes = await sharp(frameSvg).png({compressionLevel: 9}).toBuffer();
const frameFile = path.join(frameRoot, "ED-08.png");
fs.writeFileSync(frameFile, frameBytes);
const frameSha256 = sha256(frameBytes);

const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const priorItem = board.items.find((item) => item.shotId === "ED-08");
if (!priorItem) throw new Error("ed08-takeover-prior-board-item-missing");
const textNodes = [kicker.spec, first.spec, second.spec];
const nextItem = {
  ...structuredClone(priorItem),
  sourceText: decision.sourceText,
  semanticJob: decision.rationale,
  assemblyMode: decision.assemblyMode,
  presentationMode: decision.presentationMode,
  artifactSha256: frameSha256,
  artifactPublicUrl: publicUrlFor(frameFile),
  previewPublicUrl: publicUrlFor(frameFile),
  previewSha256: frameSha256,
  compositeSha256: frameSha256,
  textNodes,
  styleLineage: {
    contract: "A1StaticBoardStyleLineage/v1",
    styleSystemId: board.styleLineageAuthority.styleSystem.id,
    styleSystemSha256: board.styleLineageAuthority.styleSystem.sha256,
    pixelTreatment: "PRESERVED_STRONG_MASTER",
    pixelRecomposed: false,
    compositionMethod: "HASH_BOUND_LOCAL_FULLSCREEN_TYPOGRAPHY_COMPLETE_LOOK_MASTER",
    compositeSha256: frameSha256,
    sourceArtifactSha256: frameSha256,
    preservationReason: "NEW_HASH_BOUND_LOCAL_COMPLETE_TYPOGRAPHY_LOOK_MASTER",
    preservedActualPixelReview: false,
    typographyMasterId: "A1FusionPixelFormalTypography/v1",
    typographyMasterSha256: fontSha256,
    fontBindings: [fontBinding],
    backgroundBinding: null,
    presenterBinding: null,
    visualMaterialRoute: "TYPOGRAPHY_DOMINANT",
    illustrationBinding: null,
    elementBindings: [],
    sourceEvidenceBinding: null,
    typographyJustification: "本镜是全片仅两次的短时判断接管之一；完整判断文字是唯一信息主角，错位仅承担语言断裂这一项语义动作。",
    selectionOnly: false,
    auditBytesUnchanged: false,
    priorCompositeSha256: priorItem.artifactSha256,
    compositeVisualAudit: {contract: "A1StaticBoardCompositeVisualAudit/v1", status: "PENDING_ACTUAL_PIXEL_REVIEW", compositeSha256: frameSha256, actualPixelsViewed: false, semanticAgreement: "PENDING", visualActorDominant: true, formalTextRendererBound: true, generatedFormalText: false},
    minimalCompositionAudit: {contract: "A1ShotMinimalEditorialCompositionAudit/v1", status: "PENDING_ACTUAL_PIXEL_REVIEW", actualPixelsViewed: false, primaryActorCount: 1, semanticActionCount: 1, decorativeMotifCount: 0, referenceConstructionMatch: "PENDING", independentPosterProduct: false, compositionRole: "EARNED_VERDICT_TAKEOVER"},
  },
};
const items = board.items.map((item) => item.shotId === "ED-08" ? nextItem : structuredClone(item));
const timelineItems = board.timelineBoard.items.map((item) => item.shotId === "ED-08" ? {
  ...structuredClone(item),
  route: "PACKAGE_LOOK_MASTER",
  routeLabel: "FULLSCREEN_TYPOGRAPHY_TAKEOVER PACKAGE",
  sourceRole: "TYPOGRAPHY",
  titleRole: "HERO_TAKEOVER",
  sourceText: decision.sourceText,
  preview: {publicUrl: nextItem.previewPublicUrl, sha256: frameSha256, provenance: "CURRENT_SEMANTIC_TYPOGRAPHY_COMPOSITE"},
  artifactSha256: frameSha256,
  previewPublicUrl: nextItem.previewPublicUrl,
  packageCandidateSha256: frameSha256,
  styleCompositeSha256: frameSha256,
  labelLines: [`ED-08 · ${Number(item.timeRange.startMs / 1000).toFixed(2)}s–${Number(item.timeRange.endMs / 1000).toFixed(2)}s`, "PACKAGE_LOOK_MASTER · TYPOGRAPHY · title:HERO_TAKEOVER", decision.sourceText, "CURRENT_SEMANTIC_TYPOGRAPHY_COMPOSITE"],
} : structuredClone(item));

async function buildContactSheet(sheetItems, outputFile, {columns, tileWidth, imageHeight, labelHeight, timeline = false}) {
  const tileHeight = imageHeight + labelHeight;
  const tiles = await Promise.all(sheetItems.map(async (item) => {
    const previewUrl = timeline ? item.preview.publicUrl : item.previewPublicUrl;
    const image = await sharp(publicFile(previewUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const title = timeline ? `${item.shotId} · ${item.route}` : `${item.shotId} · ${item.presentationMode}`;
    const subtitle = timeline ? (item.packageBoardItem ? "A1 PACKAGE" : "EDITOR SOURCE") : item.styleLineage.visualMaterialRoute;
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="6" height="100%" fill="${timeline && !item.packageBoardItem ? "#4b5358" : "#7898ff"}"/><text x="18" y="24" fill="#f3f5f2" font-family="Arial" font-size="14" font-weight="700">${escapeXml(title)}</text><text x="18" y="47" fill="#7898ff" font-family="Arial" font-size="10">${escapeXml(subtitle)}</text>${timeline ? `<text x="18" y="68" fill="#8d9690" font-family="Arial" font-size="9">${escapeXml(String(item.sourceText || "").slice(0, 28))}</text>` : ""}</svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f13"}}).composite([{input: image}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const rows = Math.ceil(sheetItems.length / columns);
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}}).composite(tiles.map((input, index) => ({input, left: index % columns * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {publicUrl: publicUrlFor(outputFile), sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight};
}

const packageBoard = await buildContactSheet(items, path.join(outputRoot, "whole-film-package-board.png"), {columns: 3, tileWidth: 480, imageHeight: 270, labelHeight: 64});
const timelineBoard = await buildContactSheet(timelineItems, path.join(outputRoot, "whole-film-timeline-board.png"), {columns: 4, tileWidth: 360, imageHeight: 203, labelHeight: 86, timeline: true});
const body = {
  contract: "A1ED08SemanticTakeoverRepair/v1",
  status: "PENDING_AGENT_ACTUAL_PIXEL_REVIEW",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  userVisualApproval: "NOT_APPROVED",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceBoardSha256: board.sha256,
  sourceTimelineBoardSha256: board.timelineBoard.sha256,
  canonicalSequenceSha256: sequence.sequenceSha256,
  targetShotIds: ["ED-08"],
  exactFormalText: "AI 常常不说人话",
  fontBinding,
  item: nextItem,
  items,
  timelineItems,
  frame: {publicUrl: publicUrlFor(frameFile), sha256: frameSha256, width: 1920, height: 1080},
  packageBoard,
  timelineBoard,
  boundaries: {imageGenerationPerformed: false, imagegenCallCount: 0, motionPerformed: false, assemblyCreated: false, layerExtractionPerformed: false, resolveUsed: false, finalRenderUsed: false},
  generatedAt: new Date().toISOString(),
};
const manifest = {...body, manifestSha256: sha256(body)};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: manifest.status, frame: manifest.frame, packageBoard, timelineBoard, manifestSha256: manifest.manifestSha256, imagegenCallCount: 0}, null, 2)}\n`);
