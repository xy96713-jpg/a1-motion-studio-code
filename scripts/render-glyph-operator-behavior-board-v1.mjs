#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {compileGlyphBehaviorFamilies} from "../apps/studio-next/src/lib/a1-glyph-operator-system-v1.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/glyph-operator-behavior-families-v1");
const frameDir = path.join(out, "frames");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
fs.mkdirSync(frameDir, {recursive: true});

const W = 1920;
const H = 1080;
const fontFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache/SourceHanSansCN-Heavy.otf");
const fontBytes = fs.readFileSync(fontFile);
const font = fontkit.create(fontBytes);
const fontSha256 = crypto.createHash("sha256").update(fontBytes).digest("hex");
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");
const palette = {paper: "#F1EEE6", ink: "#111315", accent: "#2853D8", quiet: "#A9A59C"};

function splitTitle(copy, max = 6) {
  const chars = [...copy];
  if (chars.length <= max) return [copy];
  const punctuation = new Set(["，", "。", "：", "？", "！", "、", ",", ":", "?", "!"]);
  const midpoint = chars.length / 2;
  const candidates = chars.map((char, index) => punctuation.has(char) ? index + 1 : -1).filter((index) => index > 1 && index < chars.length - 1).sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint));
  const splitAt = candidates[0] || Math.ceil(chars.length / 2);
  return [chars.slice(0, splitAt).join(""), chars.slice(splitAt).join("")];
}

function glyphData(char) {
  const run = font.layout(char);
  const glyph = run.glyphs[0];
  const position = run.positions[0];
  if (!glyph || glyph.id === 0) throw new Error(`glyph-operator-missing-glyph:${char}`);
  return {char, glyphId: glyph.id, pathData: glyph.path.toSVG(), advance: position.xAdvance};
}

function lineWidth(text, size, tracking = -10, scaleX = 1) {
  const scale = size / font.unitsPerEm;
  return [...text].reduce((sum, char) => sum + glyphData(char).advance * scale * scaleX + tracking, 0) - tracking;
}

function fitSize(lines, preferred, maxWidth, tracking = -10, scaleX = 1) {
  let size = preferred;
  while (size > 104 && Math.max(...lines.map((line) => lineWidth(line, size, tracking, scaleX))) > maxWidth) size -= 2;
  return size;
}

function baseGlyphSpecs(copy, {alignment = "center", preferredSize = 300, maxWidth = 1760, lineGap = -28, tracking = -12, xShift = 0, yShift = 0} = {}) {
  const lines = splitTitle(copy, 6);
  const size = fitSize(lines, lines.length === 1 ? preferredSize + 34 : preferredSize, maxWidth, tracking);
  const specs = [];
  lines.forEach((line, lineIndex) => {
    const width = lineWidth(line, size, tracking);
    let x = alignment === "left" ? 56 + xShift : alignment === "right" ? W - 56 - width + xShift : (W - width) / 2 + xShift;
    const baseline = (lines.length === 1 ? 650 : 410 + lineIndex * (size + lineGap)) + yShift;
    [...line].forEach((char, index) => {
      const data = glyphData(char);
      specs.push({...data, lineIndex, index, x, y: baseline, size, scaleX: 1, scaleY: 1, rotate: 0, skew: 0});
      x += data.advance * (size / font.unitsPerEm) + tracking;
    });
  });
  return specs;
}

function glyphPath(spec, {fill = palette.ink, stroke = "none", strokeWidth = 0, opacity = 1, dx = 0, dy = 0, scaleX = spec.scaleX, scaleY = spec.scaleY, rotate = spec.rotate, skew = spec.skew} = {}) {
  const scale = spec.size / font.unitsPerEm;
  return `<path d="${spec.pathData}" transform="translate(${(spec.x + dx).toFixed(2)} ${(spec.y + dy).toFixed(2)}) rotate(${rotate.toFixed(2)}) skewX(${skew.toFixed(2)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale * scaleY).toFixed(6)})" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" paint-order="stroke fill" opacity="${opacity}" stroke-linejoin="miter"/>`;
}

function cleanMarkup(specs, fill = "#fff") {
  return `<g>${specs.map((spec) => glyphPath(spec, {fill})).join("")}</g>`;
}

function smallCopy(text, x, y, size, fill) {
  let cursor = x;
  const scale = size / font.unitsPerEm;
  return [...text].map((char) => {
    const data = glyphData(char);
    const pathData = `<path d="${data.pathData}" transform="translate(${cursor.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})" fill="${fill}"/>`;
    cursor += data.advance * scale + 2;
    return pathData;
  }).join("");
}

function commonDefs() {
  return `<defs>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#111315" stroke-width="1" opacity="0.055"/></pattern>
    <pattern id="halftone" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.45" fill="#111315" opacity="0.38"/></pattern>
    <mask id="printDamage"><rect width="1920" height="1080" fill="#fff"/><path d="M120 360L1760 286M80 690L1820 610" stroke="#000" stroke-width="18" opacity=".82"/><g fill="#000">${Array.from({length: 62}, (_, index) => `<circle cx="${80 + (index * 137) % 1760}" cy="${210 + (index * 83) % 640}" r="${4 + index % 11}"/>`).join("")}</g></mask>
    <clipPath id="bandTop"><rect x="0" y="180" width="1920" height="220"/></clipPath>
    <clipPath id="bandMid"><rect x="0" y="400" width="1920" height="210"/></clipPath>
    <clipPath id="bandBottom"><rect x="0" y="610" width="1920" height="230"/></clipPath>
    <clipPath id="lens"><circle cx="1230" cy="510" r="250"/></clipPath>
  </defs>`;
}

function commonBackground(kicker) {
  return `<rect width="1920" height="1080" fill="${palette.paper}"/><rect width="1920" height="1080" fill="url(#grid)"/><rect x="0" y="0" width="1920" height="18" fill="${palette.accent}"/><rect x="54" y="1014" width="1812" height="3" fill="${palette.ink}"/>${smallCopy(kicker, 56, 82, 34, palette.ink)}`;
}

function axisResponsive(plan) {
  const base = baseGlyphSpecs(plan.exactCopy);
  const count = base.length;
  const drafted = base.map((spec, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    return {...spec, scaleX: 0.62 + 0.82 * Math.sin(Math.PI * (.1 + .8 * t)) ** 2, scaleY: 1.22 - .32 * Math.sin(Math.PI * t), rotate: -3 + 6 * t, y: spec.y + 18 * Math.sin(t * Math.PI * 2)};
  });
  const effectSpecs = [];
  for (const lineIndex of [...new Set(drafted.map((spec) => spec.lineIndex))]) {
    const originalLine = drafted.filter((spec) => spec.lineIndex === lineIndex);
    const tracking = -12;
    const originalWidth = originalLine.reduce((sum, spec) => sum + spec.advance * (spec.size / font.unitsPerEm) * spec.scaleX + tracking, 0) - tracking;
    const widthFit = Math.min(1, 1760 / originalWidth);
    const line = originalLine.map((spec) => ({...spec, scaleX: spec.scaleX * widthFit}));
    const width = line.reduce((sum, spec) => sum + spec.advance * (spec.size / font.unitsPerEm) * spec.scaleX + tracking, 0) - tracking;
    let cursor = (W - width) / 2;
    for (const spec of line) {
      effectSpecs.push({...spec, x: cursor});
      cursor += spec.advance * (spec.size / font.unitsPerEm) * spec.scaleX + tracking;
    }
  }
  const effect = `<g>${effectSpecs.map((spec) => glyphPath(spec, {fill: palette.ink, dx: 18, dy: 20, opacity: .18}) + glyphPath(spec, {fill: palette.ink})).join("")}</g>`;
  return {effectMarkup: effect, cleanMarkup: cleanMarkup(base), receipt: {behavior: plan.behaviorId, glyphCount: count, operators: plan.geometryOperators}};
}

function spliceReassemble(plan) {
  const base = baseGlyphSpecs(plan.exactCopy);
  const group = cleanMarkup(base, palette.ink);
  const effect = `<g clip-path="url(#bandTop)" transform="translate(-34 0)">${group}</g><g clip-path="url(#bandMid)" transform="translate(28 -2)">${group}</g><g clip-path="url(#bandBottom)" transform="translate(-18 3)">${group}</g><g clip-path="url(#bandMid)" transform="translate(62 0)" opacity=".72"><g fill="${palette.accent}">${base.map((spec) => glyphPath(spec, {fill: palette.accent})).join("")}</g></g>`;
  return {effectMarkup: effect, cleanMarkup: cleanMarkup(base), receipt: {behavior: plan.behaviorId, glyphCount: base.length, bands: 3, operators: plan.geometryOperators}};
}

function lensOcclusion(plan) {
  const groups = splitTitle(plan.exactCopy, 5);
  const primaryCopy = groups[0];
  const focusCopy = groups.slice(1).join("") || groups[0];
  const primary = baseGlyphSpecs(primaryCopy, {alignment: "left", preferredSize: 290, maxWidth: 800, lineGap: -20, tracking: -12, xShift: 40, yShift: -70});
  const focus = baseGlyphSpecs(focusCopy, {alignment: "center", preferredSize: 245, maxWidth: 430, lineGap: -18, tracking: -10, xShift: 270, yShift: -70});
  const clean = baseGlyphSpecs(plan.exactCopy);
  const effect = `<g>${primary.map((spec) => glyphPath(spec, {fill: palette.ink})).join("")}</g><circle cx="1230" cy="510" r="278" fill="rgba(40,83,216,.08)" stroke="${palette.accent}" stroke-width="13"/><circle cx="1164" cy="438" r="96" fill="#fff" opacity=".18"/><g>${focus.map((spec) => glyphPath(spec, {fill: palette.accent})).join("")}</g>`;
  return {effectMarkup: effect, cleanMarkup: cleanMarkup(clean), receipt: {behavior: plan.behaviorId, glyphCount: primary.length + focus.length, semanticGroups: [primaryCopy, focusCopy], duplicateFormalCopyCount: 0, lens: {cx: 1230, cy: 510, radius: 278}, operators: plan.geometryOperators}};
}

function pathField(plan) {
  const chars = [...plan.exactCopy];
  const size = fitSize([plan.exactCopy], 230, 1480, -4, 1);
  const span = 1420;
  const startX = 250;
  const effect = [];
  const baseline = [];
  chars.forEach((char, index) => {
    const data = glyphData(char);
    const t = chars.length === 1 ? .5 : index / (chars.length - 1);
    const x = startX + span * t;
    const y = 555 + Math.sin(t * Math.PI * 2) * 105;
    const slope = Math.cos(t * Math.PI * 2) * 105 * Math.PI * 2 / span;
    const rotate = Math.atan(slope) * 180 / Math.PI;
    const spec = {...data, x, y, size, scaleX: .9, scaleY: 1, rotate, skew: 0};
    effect.push(glyphPath(spec, {fill: palette.ink}));
    const cleanSpec = {...spec, x: startX + span * t, y: 610, rotate: 0, scaleX: .9};
    baseline.push(glyphPath(cleanSpec, {fill: "#fff"}));
  });
  const guide = `<path d="M250 555 C500 330 710 780 960 555 C1210 330 1420 780 1670 555" fill="none" stroke="${palette.accent}" stroke-width="5" opacity=".65"/>`;
  return {effectMarkup: `${guide}<g>${effect.join("")}</g>`, cleanMarkup: `<g>${baseline.join("")}</g>`, receipt: {behavior: plan.behaviorId, glyphCount: chars.length, field: "single-sine", operators: plan.geometryOperators}};
}

function printRegistration(plan) {
  const base = baseGlyphSpecs(plan.exactCopy);
  const plate = (fill, dx, dy, opacity, mask = "") => `<g transform="translate(${dx} ${dy})" fill="${fill}" opacity="${opacity}" ${mask}>${base.map((spec) => glyphPath(spec, {fill})).join("")}</g>`;
  const effect = `${plate(palette.accent, -14, 9, .72)}${plate(palette.quiet, 16, -7, .78)}${plate(palette.ink, 0, 0, 1, 'mask="url(#printDamage)"')}<rect x="110" y="842" width="1700" height="34" fill="url(#halftone)"/>`;
  return {effectMarkup: effect, cleanMarkup: cleanMarkup(base), receipt: {behavior: plan.behaviorId, glyphCount: base.length, plateOffsets: [[-14, 9], [16, -7], [0, 0]], operators: plan.geometryOperators}};
}

function cleanEditorial(plan) {
  const specs = baseGlyphSpecs(plan.exactCopy, {alignment: "left", preferredSize: 330, maxWidth: 1670, lineGap: -48, tracking: -16, xShift: -12, yShift: 12});
  const baseline = baseGlyphSpecs(plan.exactCopy);
  const effect = `<g>${specs.map((spec, index) => glyphPath(spec, {fill: index % 5 === 0 ? palette.accent : palette.ink})).join("")}</g><rect x="56" y="865" width="520" height="15" fill="${palette.accent}"/>`;
  return {effectMarkup: effect, cleanMarkup: cleanMarkup(baseline), receipt: {behavior: plan.behaviorId, glyphCount: specs.length, alignment: "optical-left", operators: plan.geometryOperators}};
}

const behaviorRenderers = {AXIS_RESPONSIVE: axisResponsive, SPLICE_REASSEMBLE: spliceReassemble, LENS_OCCLUSION: lensOcclusion, PATH_FIELD: pathField, PRINT_REGISTRATION: printRegistration, CLEAN_EDITORIAL: cleanEditorial};

async function rasterize(markup, kicker = "") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${commonDefs()}${commonBackground(kicker)}${markup}</svg>`;
  if (/<text\b/u.test(svg)) throw new Error("glyph-operator-svg-text-leak");
  return sharp(Buffer.from(svg)).png({compressionLevel: 9}).toBuffer();
}

async function alphaDelta(effectMarkup, cleanTitleMarkup) {
  const only = async (markup) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${commonDefs()}${markup}</svg>`)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const effect = await only(effectMarkup);
  const clean = await only(cleanTitleMarkup);
  let union = 0;
  let difference = 0;
  for (let index = 3; index < effect.data.length; index += 4) {
    const ea = effect.data[index];
    const ca = clean.data[index];
    if (ea > 16 || ca > 16) union += 1;
    if (Math.abs(ea - ca) > 32) difference += 1;
  }
  return difference / Math.max(1, union);
}

const results = [];
const pixelBuffers = new Map();
for (const fixture of fixtures) {
  for (const plan of compileGlyphBehaviorFamilies(fixture)) {
    const rendered = behaviorRenderers[plan.behaviorId](plan);
    const pixels = await rasterize(rendered.effectMarkup, plan.kickerCopy);
    const delta = await alphaDelta(rendered.effectMarkup, rendered.cleanMarkup);
    if (plan.behaviorId !== "CLEAN_EDITORIAL" && delta < .08) throw new Error(`glyph-operator-insufficient-delta:${fixture.id}:${plan.behaviorId}:${delta.toFixed(4)}`);
    const file = path.join(frameDir, `${fixture.id}--${plan.behaviorId}.png`);
    fs.writeFileSync(file, pixels);
    pixelBuffers.set(`${fixture.id}:${plan.behaviorId}`, pixels);
    const metadata = await sharp(pixels).metadata();
    results.push({id: fixture.id, genre: fixture.genre, behaviorId: plan.behaviorId, behaviorLabel: plan.behaviorLabel, exactCopy: plan.exactCopy, fontBinding: plan.fontBinding, paletteBinding: plan.paletteBinding, geometryOperators: plan.geometryOperators, compositingOperators: plan.compositingOperators, alphaDifferenceRatio: delta, planSha256: plan.planSha256, operatorReceipt: rendered.receipt, artifact: {path: path.relative(root, file), sha256: sha(pixels), width: metadata.width, height: metadata.height}, reviewBoundary: plan.reviewBoundary});
  }
}

const pairwise = [];
for (const fixture of fixtures) {
  const rows = results.filter((result) => result.id === fixture.id);
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const left = await sharp(pixelBuffers.get(`${fixture.id}:${rows[leftIndex].behaviorId}`)).resize(320, 180).removeAlpha().raw().toBuffer();
      const right = await sharp(pixelBuffers.get(`${fixture.id}:${rows[rightIndex].behaviorId}`)).resize(320, 180).removeAlpha().raw().toBuffer();
      let changed = 0;
      for (let index = 0; index < left.length; index += 3) {
        if (Math.abs(left[index] - right[index]) + Math.abs(left[index + 1] - right[index + 1]) + Math.abs(left[index + 2] - right[index + 2]) > 44) changed += 1;
      }
      pairwise.push({fixtureId: fixture.id, left: rows[leftIndex].behaviorId, right: rows[rightIndex].behaviorId, pixelDifferenceRatio: changed / (320 * 180)});
    }
  }
}
const minPairwiseDifference = Math.min(...pairwise.map((item) => item.pixelDifferenceRatio));
if (minPairwiseDifference < .06) throw new Error(`glyph-operator-behaviors-too-similar:${minPairwiseDifference.toFixed(4)}`);

const tileWidth = 640;
const tileHeight = 360;
const labelHeight = 44;
const columns = 3;
const layers = await Promise.all(results.map(async (result, index) => {
  const frame = await sharp(path.join(root, result.artifact.path)).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0A0B0D"/><text x="14" y="19" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#F3F0E8">${result.behaviorLabel}</text><text x="14" y="36" font-family="monospace" font-size="11" fill="#8FA2A8">${result.genre} · neutral behavior proof</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: tileHeight + labelHeight, channels: 4, background: "#0A0B0D"}}).composite([{input: label, left: 0, top: 0}, {input: frame, left: 0, top: labelHeight}]).png().toBuffer();
  return {input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)};
}));
const rows = Math.ceil(results.length / columns);
const sheet = await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#0A0B0D"}}).composite(layers).png({compressionLevel: 9}).toBuffer();
const sheetFile = path.join(out, "glyph-behavior-contact-sheet.png");
fs.writeFileSync(sheetFile, sheet);

const baselineFile = path.join(root, "work/fullscreen-glyph-effect-program-v1/glyph-effect-contact-sheet.png");
fs.writeFileSync(path.join(out, "baseline.json"), `${JSON.stringify({contract: "A1GlyphOperatorBehaviorBaseline/v1", status: "FAIL", source: path.relative(root, baselineFile), sourceSha256: fs.existsSync(baselineFile) ? sha(baselineFile) : null, userFinding: "The first three programs were visually coupled to one knowledge-entertainment lane and changed behavior, material and carrier together.", observedFailures: ["creator-style-coupling", "palette-coupling", "material-coupling", "insufficient-behavior-family-coverage"]}, null, 2)}\n`);

const result = {
  contract: "A1GlyphOperatorBehaviorBlindBoard/v1",
  status: "PASS",
  fixtures: fixtures.map((fixture) => ({id: fixture.id, genre: fixture.genre, behaviorCount: results.filter((result) => result.id === fixture.id).length})),
  behaviorCount: 6,
  frameCount: results.length,
  fontBinding: {id: "source-han-sans-heavy", path: path.relative(root, fontFile), sha256: fontSha256},
  paletteBinding: {id: "neutral-paper-ink-cobalt", palette},
  behaviors: [...new Set(results.map((result) => result.behaviorId))],
  pairwise,
  minPairwiseDifference,
  visibleArtifact: {path: path.relative(root, sheetFile), sha256: sha(sheet), width: columns * tileWidth, height: rows * (tileHeight + labelHeight)},
  results,
  boundary: {reviewOnly: true, aestheticApproval: "NONE_USER_REVIEW_REQUIRED", userVisualApproval: "NOT_APPROVED", productionAdmission: false, currentWorkspaceMutated: false, currentBoardMutated: false, motionAdmission: false},
};
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtures.length, behaviorCount: result.behaviorCount, frameCount: result.frameCount, minPairwiseDifference: result.minPairwiseDifference, visibleArtifact: result.visibleArtifact, boundary: result.boundary}, null, 2));
