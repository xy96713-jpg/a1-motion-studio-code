#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import sharp from "sharp";
import {compileProjectDiagramSvgV1} from "../apps/studio-next/src/lib/a1-project-diagram-svg-v1.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "work/project-diagram-output-v1");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json"), "utf8"));
const specs = [
  {id: "holdout-evidence-water", shotIndex: 0, kind: "sequence", labels: ["城市用水报告", "三组可复核数据"], relations: ["supports"]},
  {id: "holdout-evidence-sleep", shotIndex: 0, kind: "sequence", labels: ["睡眠实验", "三种光照条件", "真实结果"], relations: ["before-after", "supports"]},
  {id: "holdout-tutorial-backup", shotIndex: 3, kind: "sequence", labels: ["暂停同步", "源目录", "目标盘剩余空间"], relations: ["before-after", "before-after"]},
  {id: "holdout-tutorial-camera", shotIndex: 5, kind: "comparison", labels: ["自动档", "固定曝光", "补光后的画面"], relations: ["compares", "compares"]},
  {id: "holdout-opinion-meeting", shotIndex: 6, kind: "sequence", labels: ["只保留问题", "负责人", "截止时间"], relations: ["before-after", "before-after"]},
  {id: "holdout-opinion-reading", shotIndex: 6, kind: "sequence", labels: ["无法回答问题", "能改变行动"], relations: ["before-after"]},
];
const fontPath = path.join(root, "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf");
const fontBytes = fs.readFileSync(fontPath);
const fontSha256 = sha(fontBytes);
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const normalize = (value) => String(value || "").normalize("NFC").replace(/[\s\u3000]+/gu, "");
const editDistance = (left, right) => {
  const a = [...left], b = [...right];
  let previous = Array.from({length: b.length + 1}, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let col = 1; col <= b.length; col += 1) current[col] = Math.min(current[col - 1] + 1, previous[col] + 1, previous[col - 1] + (a[row - 1] === b[col - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
};
const minimumSubstringDistance = (expected, actual) => {
  const target = [...expected], text = [...actual];
  let minimum = target.length;
  for (let start = 0; start < text.length; start += 1) {
    for (let length = Math.max(1, target.length - 1); length <= target.length + 1 && start + length <= text.length; length += 1) {
      minimum = Math.min(minimum, editDistance(target.join(""), text.slice(start, start + length).join("")));
    }
  }
  return minimum;
};
const nodeOcrCropBounds = (node, width, height, padding = 18) => {
  const bounds = node?.glyphBounds;
  if (!bounds || ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)
    || bounds.right <= bounds.left || bounds.bottom <= bounds.top
    || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1
    || !Number.isFinite(padding) || padding < 0) throw new Error("diagram-node-ocr-bounds-invalid");
  const left = Math.max(0, Math.floor(bounds.left - padding));
  const top = Math.max(0, Math.floor(bounds.top - padding));
  const right = Math.min(width, Math.ceil(bounds.right + padding));
  const bottom = Math.min(height, Math.ceil(bounds.bottom + padding));
  if (right <= left || bottom <= top) throw new Error("diagram-node-ocr-crop-empty");
  return {left, top, width: right - left, height: bottom - top};
};
fs.mkdirSync(path.join(outputDir, "svg"), {recursive: true});
fs.mkdirSync(path.join(outputDir, "previews"), {recursive: true});
const results = [];
const ocrTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-project-diagram-ocr-"));
process.once("exit", () => fs.rmSync(ocrTempDir, {recursive: true, force: true}));

for (const fixtureSpec of specs) {
  const article = fixtures.articles.find((item) => item.id === fixtureSpec.id);
  assert.ok(article, `fixture-missing:${fixtureSpec.id}`);
  const sourceText = article.shots[fixtureSpec.shotIndex];
  for (const label of fixtureSpec.labels) assert.ok(sourceText.includes(label), `diagram-label-not-exact-source-substring:${fixtureSpec.id}:${label}`);
  const nodes = fixtureSpec.labels.map((label, index) => ({id: `node-${index + 1}`, label}));
  const edges = fixtureSpec.relations.map((relation, index) => ({from: nodes[index].id, to: nodes[index + 1].id, relation}));
  const spec = {contract: "A1DeterministicDiagramSpec/v1", kind: fixtureSpec.kind, nodes, edges};
  const compiled = compileProjectDiagramSvgV1({diagramSpec: spec, sourceText, sourceTextSha256: sha(sourceText), fontPath, fontSha256});
  assert.equal(compiled.status, "READY_FOR_REVIEW_ONLY", fixtureSpec.id);
  assert.equal(compiled.sourceMode, "TRANSCRIPT_ONLY_EXPLANATORY");
  assert.equal(compiled.fontSha256, fontSha256);
  const svgBytes = Buffer.from(compiled.svgMarkup, "utf8");
  assert.equal(sha(svgBytes), compiled.svgSha256);
  const svgPath = path.join(outputDir, "svg", `${fixtureSpec.id}.svg`);
  fs.writeFileSync(svgPath, svgBytes);
  const raster = await sharp(svgBytes).png().toBuffer();
  const darkSurface = await sharp({create: {width: compiled.width, height: compiled.height, channels: 4, background: "#15191b"}}).composite([{input: raster, left: 0, top: 0}]).png().toBuffer();
  const previewPath = path.join(outputDir, "previews", `${fixtureSpec.id}.png`);
  fs.writeFileSync(previewPath, darkSurface);
  const nodeOcr = [];
  let fullFrameFallbackOcr = null;
  for (const node of compiled.nodeLayout) {
    const crop = nodeOcrCropBounds(node, compiled.width, compiled.height);
    const cropPath = path.join(ocrTempDir, `${fixtureSpec.id}-${node.id}.png`);
    await sharp(darkSurface).extract(crop).png().toFile(cropPath);
    const cropRawOcr = JSON.parse((await execFileAsync("/usr/bin/swift", [path.join(root, "scripts/a1-typography-visual-context-ocr-v1.swift"), cropPath], {timeout: 30_000, maxBuffer: 1_000_000})).stdout);
    const expected = normalize(node.label);
    const cropRecognizedText = (cropRawOcr.recognizedText || []).map((item) => item.text);
    const cropOcrText = normalize(cropRecognizedText.join(""));
    const cropEditDistance = cropOcrText.includes(expected) ? 0 : minimumSubstringDistance(expected, cropOcrText);
    const cropWithinOneGlyph = cropEditDistance <= 1;
    let fallbackRawOcr = null, fallbackRecognizedText = [], fallbackOcrText = "", fallbackEditDistance = null;
    if (!cropWithinOneGlyph) {
      if (!fullFrameFallbackOcr) {
        fullFrameFallbackOcr = JSON.parse((await execFileAsync("/usr/bin/swift", [path.join(root, "scripts/a1-typography-visual-context-ocr-v1.swift"), previewPath], {timeout: 30_000, maxBuffer: 1_000_000})).stdout);
      }
      fallbackRawOcr = fullFrameFallbackOcr;
      fallbackRecognizedText = (fallbackRawOcr.recognizedText || []).map((item) => item.text);
      fallbackOcrText = normalize(fallbackRecognizedText.join(""));
      fallbackEditDistance = fallbackOcrText.includes(expected) ? 0 : minimumSubstringDistance(expected, fallbackOcrText);
    }
    const fallbackWithinOneGlyph = fallbackEditDistance == null ? null : fallbackEditDistance <= 1;
    const passSurface = cropWithinOneGlyph ? "crop" : fallbackWithinOneGlyph === true ? "full-frame-fallback" : "none";
    const passedText = passSurface === "full-frame-fallback" ? fallbackOcrText : cropOcrText;
    const distance = passSurface === "full-frame-fallback" ? fallbackEditDistance
      : fallbackWithinOneGlyph ? cropEditDistance : Math.min(cropEditDistance, fallbackEditDistance ?? Infinity);
    nodeOcr.push({id: node.id, exactCopy: node.label, crop,
      recognizedInCrop: cropEditDistance === 0, cropEditDistance, cropWithinOneGlyph,
      cropOcrText, cropRecognizedText, cropRawOcr,
      fallbackUsed: fallbackRawOcr !== null, fallbackRecognizedInFrame: fallbackEditDistance == null ? null : fallbackEditDistance === 0,
      fallbackEditDistance, fallbackWithinOneGlyph, fallbackOcrText, fallbackRecognizedText, fallbackRawOcr,
      passSurface, editDistance: distance, withinOneGlyph: cropWithinOneGlyph || fallbackWithinOneGlyph === true,
      ocrText: passedText, rawOcr: {crop: cropRawOcr, fullFrameFallback: fallbackRawOcr}});
  }
  const exactSourceLabelsBound = compiled.visibleLabels.length === fixtureSpec.labels.length && compiled.visibleLabels.every((label, index) => label === fixtureSpec.labels[index]);
  const ocrLegible = nodeOcr.length === fixtureSpec.labels.length && nodeOcr.every((item) => item.withinOneGlyph);
  const layoutWithinCanvas = compiled.nodeLayout.every((node) => node.centerX - node.width / 2 >= 0 && node.centerX + node.width / 2 <= compiled.width);
  const minimumInterNodeGap = Math.min(...compiled.nodeLayout.slice(1).map((node, index) => node.centerX - node.width / 2 - (compiled.nodeLayout[index].centerX + compiled.nodeLayout[index].width / 2)));
  assert.equal(exactSourceLabelsBound, true, `diagram-vector-copy-binding-failed:${fixtureSpec.id}`);
  assert.equal(ocrLegible, true, `diagram-label-ocr-failed:${fixtureSpec.id}`);
  assert.equal(layoutWithinCanvas, true, `diagram-label-outside-canvas:${fixtureSpec.id}`);
  assert.ok(minimumInterNodeGap >= 159, `diagram-connector-gap-too-small:${fixtureSpec.id}`);
  results.push({id: fixtureSpec.id, genre: article.genre, kind: spec.kind, sourceCopy: sourceText, sourceTextSha256: sha(sourceText), diagramSpec: spec,
    specSha256: sha(JSON.stringify(spec)), fontAssetId: "type-pixel-correction", fontSha256, sourceMode: compiled.sourceMode,
    nodeCount: nodes.length, edgeCount: edges.length, nodeOcr, svg: path.relative(root, svgPath), svgSha256: compiled.svgSha256,
    preview: path.relative(root, previewPath), previewSha256: sha(darkSurface), ocrMode: "PER_NODE_GEOMETRY_CROP",
    ocrEngine: nodeOcr[0]?.cropRawOcr?.ocrEngine || null, ocrFallbackMode: "FULL_FRAME_ONLY_ON_CROP_FAIL",
    perNodeRecognizedLabels: nodeOcr.map((item) => ({id: item.id, text: item.ocrText, passSurface: item.passSurface, withinOneGlyph: item.withinOneGlyph})),
    exactSourceLabelsBound, ocrLegible, layoutWithinCanvas, minimumInterNodeGap, productionAdmission: false});
}

const W = 640, H = 360, C = 80, G = 18, cols = 3, rows = 2, boardW = cols * W + (cols + 1) * G, boardH = 52 + rows * (H + C) + (rows + 1) * G;
const layers = [];
for (let index = 0; index < results.length; index += 1) {
  const item = results[index], x = G + (index % cols) * (W + G), y = 52 + G + Math.floor(index / cols) * (H + C + G);
  const thumb = await sharp(path.join(root, item.preview)).resize({width: W, height: H, fit: "contain", background: "#15191b"}).png().toBuffer();
  layers.push({input: thumb, left: x, top: y});
  const label = `${item.genre} · ${item.kind} · ${item.nodeCount} nodes / ${item.edgeCount} edges`;
  const svg = `<svg width="${W}" height="${C}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101315"/><text x="14" y="32" fill="#eee9dc" font-family="Arial" font-size="16">${escapeXml(item.id)}</text><text x="14" y="61" fill="#8fd6dc" font-family="Arial" font-size="15">${escapeXml(label)} · REVIEW ONLY</text></svg>`;
  layers.push({input: Buffer.from(svg), left: x, top: y + H});
}
const header = Buffer.from(`<svg width="${boardW}" height="52" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#080a0b"/><text x="${G}" y="33" fill="#eee9dc" font-family="Arial" font-size="20">DETERMINISTIC DIAGRAM SVG CANARIES · TRANSCRIPT ONLY · NOT EVIDENCE</text></svg>`);
const board = await sharp({create: {width: boardW, height: boardH, channels: 4, background: "#080a0b"}}).composite([{input: header, left: 0, top: 0}, ...layers]).png().toBuffer();
const contactSheetPath = path.join(outputDir, "contact-sheet.png");
fs.writeFileSync(contactSheetPath, board);
const result = {contract: "A1ProjectDiagramMaterializationTest/v1", status: "PASS", fixtureCount: results.length, genreCount: new Set(results.map((item) => item.genre)).size,
  transcriptOnly: true, sourceEvidenceClaims: 0, fontSha256, ocrMode: "PER_NODE_GEOMETRY_CROP",
  exactSourceLabelsBoundCount: results.filter((item) => item.exactSourceLabelsBound).length, ocrLegibleCount: results.filter((item) => item.ocrLegible).length,
  contactSheet: path.relative(root, contactSheetPath), contactSheetSha256: sha(board), results, productionAdmission: false};
const resultPath = path.join(outputDir, "result.json");
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtureCount, genreCount: result.genreCount, ocrMode: result.ocrMode,
  exactSourceLabelsBoundCount: result.exactSourceLabelsBoundCount, ocrLegibleCount: result.ocrLegibleCount,
  contactSheet: result.contactSheet, contactSheetSha256: result.contactSheetSha256, result: path.relative(root, resultPath)}, null, 2));
