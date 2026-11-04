#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {buildDefaultTypographyTemplateContinuation, buildDefaultTypographyTemplateReview} from "../apps/studio-next/src/lib/a1-default-typography-template-review-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const libraryRoot = "default-design-asset-library-v1/typography-template-specimens-v1";
const fontRoot = path.join(phaseRoot, "font-cache");
const backgroundReviewPath = path.join(phaseRoot, "default-design-asset-library-v1/imagegen-background-final-wave-v4/review.json");
const elementRoot = path.join(phaseRoot, "default-design-asset-library-v1/imagegen-element-kit-wave-v1");
const connectorRoot = path.join(phaseRoot, "default-design-asset-library-v1/imagegen-process-connector-wave-v1");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");

const definitions = [
  {templateId: "pixel-correction-anchor", exactText: "不是模型的问题", supportText: "CORRECTION / 01", font: "fusion-pixel.ttf", fontId: "type-pixel-correction", background: "background-cool-uniform-micro-dot-imagegen-v1.png", element: "article-element-pencil-circle-imagegen-v1.png", foreground: "#16191c", accent: "#173fdb", lines: [{text: "不是", x: 170, y: 200, size: 270, tracking: -6}, {text: "模型的问题", x: 170, y: 490, size: 214, tracking: -7}], support: {x: 180, y: 900, size: 31}, elementPlacement: {left: 1260, top: 150, width: 430, height: 430}, pixelTag: {text: "NO. 02", x: 1440, y: 730, size: 80}},
];

const historyOnlyTemplateIds = ["verdict-crop-collision", "source-evidence-rail", "chapter-signal-split", "stacked-question-impact", "quiet-one-bit-caption"];
const fontComparisonDecision = {
  contract: "A1TypographyFontComparisonDecision/v1",
  status: "ONE_CANONICAL_FONT_SELECTED",
  researchedAt: "2026-08-14",
  selected: {
    family: "A1 Fusion Pixel",
    assetId: "type-pixel-correction",
    localFile: "fusion-pixel.ttf",
    license: "SIL Open Font License 1.1",
    reason: "成熟的中文/CJK 像素字体，当前已有 hash-verified 本地资产；足以覆盖标题和辅助字，不引入第二套视觉语法。",
    sourceUrl: "https://github.com/TakWolf/fusion-pixel-font",
  },
  candidates: [
    {family: "Zpix", decision: "REJECTED_LICENSE_RISK", reason: "支持中日韩，但官方仓库列出商业/单产品授权费用，不纳入当前无额外授权路线。", sourceUrl: "https://github.com/SolidZORO/zpix-pixel-font"},
    {family: "Pulse Pixel", decision: "REJECTED_UNFINISHED", reason: "官方仓库明确为 concept proof，未提供可用字体实例。", sourceUrl: "https://github.com/TakWolf/pulse-pixel-font"},
    {family: "Capsule Pixel", decision: "REJECTED_UNFINISHED", reason: "官方仓库明确为 concept proof，未提供可用字体实例。", sourceUrl: "https://github.com/TakWolf/capsule-pixel-font"},
    {family: "GNU Unifont", decision: "REJECTED_AS_UTILITY_FALLBACK", reason: "Unicode/CJK 覆盖强，但本轮将其视为兼容性兜底，不作为当前编辑视觉身份。", sourceUrl: "https://unifoundry.com/unifont/index.html"},
  ],
  policy: {currentDefaultFontCount: 1, currentDefaultSpecimenCount: 1, alternateFontsAllowedInCurrentDefaultLibrary: false, historyOnlyAlternatesAllowed: true},
};

const backgroundReview = JSON.parse(fs.readFileSync(backgroundReviewPath, "utf8"));
const backgroundPathByFile = new Map(backgroundReview.candidates.map((candidate) => [path.basename(candidate.publicUrl), path.join(appRoot, "public", candidate.publicUrl.replace(/^\//u, ""))]));

function textPath(font, text, {x, y, size, tracking = 0, scaleX = 1}) {
  let cursor = x;
  const scale = size / font.unitsPerEm;
  const segments = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`typography-template-missing-glyph:${character}:${font.fullName}`);
    const d = glyph.path.toSVG();
    segments.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  return {markup: segments.join(""), width: cursor - x};
}

function lineGroup(font, line, color) {
  const pathResult = textPath(font, line.text, line);
  return {markup: `<g fill="${color}">${pathResult.markup}</g>`, width: pathResult.width};
}

function smallTextGroup(font, text, placement, color, tracking = 0) {
  const pathResult = textPath(font, text, {...placement, tracking});
  return `<g fill="${color}">${pathResult.markup}</g>`;
}

async function renderTemplate(definition) {
  const fontPath = path.join(fontRoot, definition.font);
  const font = fontkit.openSync(fontPath);
  const lineResults = definition.lines.map((line) => ({line, ...lineGroup(font, line, definition.foreground)}));
  const supportMarkup = smallTextGroup(font, definition.supportText, definition.support, definition.accent, 3);
  const pixelTag = definition.pixelTag ? smallTextGroup(font, definition.pixelTag.text, definition.pixelTag, definition.accent, 2) : "";
  const railText = definition.railText ? `<g transform="rotate(90 1785 180)">${smallTextGroup(font, definition.railText, {x: 1785, y: 180, size: 24}, definition.accent, 4)}</g>` : "";
  const titleSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><g>${lineResults.map((item) => item.markup).join("")}</g>${supportMarkup}${pixelTag}${railText}</svg>`);
  const backgroundPath = backgroundPathByFile.get(definition.background);
  if (!backgroundPath || !fs.existsSync(backgroundPath)) throw new Error(`typography-template-background-missing:${definition.background}`);
  const elementPath = path.join(definition.elementSource === "connector" ? connectorRoot : elementRoot, definition.element);
  let element = await sharp(elementPath).resize(definition.elementPlacement.width, definition.elementPlacement.height, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
  if (Number.isFinite(Number(definition.elementRotation)) && Number(definition.elementRotation) !== 0) element = await sharp(element).rotate(Number(definition.elementRotation), {background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
  if (Number(definition.elementOpacity) < 1) {
    const {data, info} = await sharp(element).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    for (let index = 3; index < data.length; index += 4) data[index] = Math.round(data[index] * Number(definition.elementOpacity));
    element = await sharp(data, {raw: {width: info.width, height: info.height, channels: 4}}).png().toBuffer();
  }
  const elementLayer = {input: element, left: definition.elementPlacement.left, top: definition.elementPlacement.top};
  const composites = definition.elementLayer === "behind-type" ? [elementLayer, {input: titleSvg, left: 0, top: 0}] : [{input: titleSvg, left: 0, top: 0}, elementLayer];
  const pixels = await sharp(backgroundPath).resize(1920, 1080, {fit: "cover"}).composite(composites).png({compressionLevel: 9}).toBuffer();
  const layoutSpec = {templateId: definition.templateId, exactText: definition.exactText, supportText: definition.supportText, fontId: definition.fontId, fontFile: definition.font, lines: definition.lines, support: definition.support, elementActorFile: definition.element, elementPlacement: definition.elementPlacement, backgroundFile: definition.background, foreground: definition.foreground, accent: definition.accent, pixelTag: definition.pixelTag || null, railText: definition.railText || null, humanNote: definition.humanNote || null};
  return {pixels, layoutSpec, fontPath, fontFamily: font.familyName, lineMetrics: lineResults.map((item) => ({text: item.line.text, width: Number(item.width.toFixed(2)), x: item.line.x, y: item.line.y, size: item.line.size}))};
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  if (authority.imagegenElementKitContinuation?.review?.actorCount !== 12 || authority.imagegenProcessConnectorContinuation?.review?.actorCount !== 3 || authority.imagegenBackgroundContinuation?.review?.candidateCount !== 24) throw new Error("typography-template-current-library-inputs-required");
  const now = new Date().toISOString();
  const binaryFiles = {};
  const files = {};
  const templates = [];
  const historyOnlyTemplates = historyOnlyTemplateIds.map((templateId) => {
    const relativePath = `${libraryRoot}/${templateId}.png`;
    const layoutRelativePath = `${libraryRoot}/${templateId}.layout.json`;
    const pngPath = path.join(appRoot, "public", "generated/system-line/editorial-asset-workbench-v1", relativePath);
    const layoutPath = path.join(appRoot, "public", "generated/system-line/editorial-asset-workbench-v1", layoutRelativePath);
    return {templateId, status: "SUPERSEDED", historyOnly: true, reason: "用户明确不采用当前单字体默认方向", publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`, sha256: fs.existsSync(pngPath) ? sha256(fs.readFileSync(pngPath)) : null, layoutSpecPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${layoutRelativePath}`, layoutSpecSha256: fs.existsSync(layoutPath) ? sha256(fs.readFileSync(layoutPath)) : null};
  });
  const historyOnlyManifest = {contract: "A1DefaultTypographyTemplateHistory/v1", status: "HISTORY_ONLY", policy: "excluded-from-current-default-library", templates: historyOnlyTemplates, createdAt: new Date().toISOString()};
  files[`${libraryRoot}/history-only.json`] = historyOnlyManifest;
  files[`${libraryRoot}/font-comparison-decision.json`] = fontComparisonDecision;
  const tileWidth = 900;
  const tileHeight = 506;
  const lefts = [510];
  const reviewComposites = [];
  for (const [index, definition] of definitions.entries()) {
    const rendered = await renderTemplate(definition);
    const relativePath = `${libraryRoot}/${definition.templateId}.png`;
    const layoutRelativePath = `${libraryRoot}/${definition.templateId}.layout.json`;
    binaryFiles[relativePath] = rendered.pixels;
    files[layoutRelativePath] = rendered.layoutSpec;
    const metadata = await sharp(rendered.pixels).metadata();
    const lineBoundsPass = rendered.lineMetrics.every((line) => line.x >= 0 && line.y >= 0 && line.x + line.width <= 1920 && line.y <= 1080);
    if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.format !== "png" || !lineBoundsPass) throw new Error(`typography-template-machine-gate-failed:${definition.templateId}`);
    templates.push({templateId: definition.templateId, exactText: definition.exactText, supportText: definition.supportText, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`, sha256: sha256(rendered.pixels), width: 1920, height: 1080, mimeType: "image/png", fontId: definition.fontId, fontFamily: rendered.fontFamily, fontPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/font-cache/${definition.font}`, fontFileSha256: sha256(fs.readFileSync(rendered.fontPath)), layoutSpecPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${layoutRelativePath}`, layoutSpecSha256: sha256(rendered.layoutSpec), lineMetrics: rendered.lineMetrics, editableText: true, generatedFormalText: false, fontFallbackUsed: false, machineStatus: "PASS", visualReviewStatus: "READY_FOR_USER_REVIEW", currentDirectionApproved: false, productionAdmitted: false});
    reviewComposites.push({input: await sharp(rendered.pixels).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left: lefts[index], top: 90});
  }
  const sheetWidth = 1920;
  const sheetHeight = 960;
  const labels = definitions.map((definition, index) => { const x = lefts[index]; const y = 90 + tileHeight + 24; return `<text x="${x}" y="${y}" fill="#e8edf0" font-family="monospace" font-size="13">${definition.templateId}</text><text x="${x}" y="${y + 21}" fill="#91a6b4" font-family="monospace" font-size="12">A1 FUSION PIXEL · EDITABLE · NOT APPROVED</text>`; }).join("");
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}"><rect width="${sheetWidth}" height="${sheetHeight}" fill="#0b1015"/><text x="15" y="38" fill="#dfff68" font-family="monospace" font-size="20">DEFAULT TYPOGRAPHY SPECIMEN · ONE FONT · ONE STANDARD · USER REVIEW REQUIRED</text>${labels}<text x="15" y="935" fill="#697b87" font-family="monospace" font-size="13">A1 FUSION PIXEL ONLY · REAL GLYPH OUTLINES · EDITABLE LAYOUT SPEC · IMAGEGEN FOR BACKGROUNDS/ELEMENTS ONLY</text></svg>`);
  const reviewSheet = await sharp(sheetSvg).composite(reviewComposites).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/review-sheet.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const review = buildDefaultTypographyTemplateReview({templates, historyOnlyTemplates, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: sheetWidth, height: sheetHeight}, createdAt: now});
  const continuation = buildDefaultTypographyTemplateContinuation({review, userDirective: "继续吧；做可编辑字体标题参考", createdAt: now});
  const next = structuredClone(current);
  const nextAuthority = structuredClone(authority);
  delete nextAuthority.authoritySha256;
  nextAuthority.defaultTypographyTemplateContinuation = continuation;
  nextAuthority.lanes.typographyTemplates = {...nextAuthority.lanes.typographyTemplates, status: "DEFAULT_TYPOGRAPHY_TEMPLATE_SPECIMENS_READY_FOR_USER_REVIEW", candidateTemplateCount: review.templateCount, approvedTemplateCount: 0, editableTextRequired: true, generatedFormalTextAllowed: false, laneComplete: false};
  nextAuthority.updatedAt = now;
  nextAuthority.authoritySha256 = sha256(nextAuthority);
  next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "default-typography-template-specimens-ready-for-user-review", targetId: continuation.continuationSha256, payload: {templateCount: review.templateCount, editableText: true, generatedFormalText: false, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `default-typography-template-specimens-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation, ...files}, binaryFiles});
  return {review, continuation, persisted};
});

console.log(JSON.stringify({status: result.review.status, templateCount: result.review.templateCount, reviewSha256: result.review.reviewSha256, continuationSha256: result.continuation.continuationSha256, reviewSheet: result.review.reviewSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, editableText: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
