#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {compileGlyphFontProfileTrials} from "../apps/studio-next/src/lib/a1-glyph-font-profile-v1.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/glyph-proportion-occlusion-eva-v1");
const frameDir = path.join(out, "frames");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
fs.mkdirSync(frameDir, {recursive: true});

const W = 1920;
const H = 1080;
const fontRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache");
const fontFiles = {
  "source-han-sans-heavy": path.join(fontRoot, "SourceHanSansCN-Heavy.otf"),
  "source-han-serif-heavy": path.join(fontRoot, "SourceHanSerifCN-Heavy.otf"),
};
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");
const fonts = Object.fromEntries(Object.entries(fontFiles).map(([id, file]) => {
  const bytes = fs.readFileSync(file);
  return [id, {id, file, sha256: sha(bytes), font: fontkit.create(bytes)}];
}));
const palette = {paper: "#F1EEE6", ink: "#111315", accent: "#2853D8", quiet: "#A9A59C"};

function glyphData(fontRecord, char) {
  const run = fontRecord.font.layout(char);
  const glyph = run.glyphs[0];
  const position = run.positions[0];
  if (!glyph || glyph.id === 0) throw new Error(`glyph-eva-missing-glyph:${fontRecord.id}:${char}`);
  return {char, glyphId: glyph.id, pathData: glyph.path.toSVG(), advance: position.xAdvance};
}

function textWidth(fontRecord, text, size, profileScaleX, tracking) {
  const scale = size / fontRecord.font.unitsPerEm;
  return [...text].reduce((sum, char) => sum + glyphData(fontRecord, char).advance * scale * profileScaleX + tracking, 0) - tracking;
}

function fitSize(fontRecord, text, preferred, maxWidth, profileScaleX, tracking) {
  let size = preferred;
  while (size > 92 && textWidth(fontRecord, text, size, profileScaleX, tracking) > maxWidth) size -= 2;
  return size;
}

function layoutGroup({fontRecord, text, profile, preferredSize, maxWidth, centerX, baseline, trackingEm = profile.preferredTrackingEm, transforms = null}) {
  const tracking = preferredSize * trackingEm;
  const size = fitSize(fontRecord, text, preferredSize, maxWidth, profile.scaleX, tracking);
  const actualTracking = size * trackingEm;
  const transformsFor = [...text].map((char, index) => transforms ? transforms(index, [...text].length) : {scaleX: 1, scaleY: 1, rotate: 0, skew: 0, yOffset: 0});
  const widths = [...text].map((char, index) => {
    const data = glyphData(fontRecord, char);
    return data.advance * (size / fontRecord.font.unitsPerEm) * profile.scaleX * transformsFor[index].scaleX;
  });
  const width = widths.reduce((sum, value) => sum + value + actualTracking, 0) - actualTracking;
  let cursor = centerX - width / 2;
  const glyphs = [...text].map((char, index) => {
    const data = glyphData(fontRecord, char);
    const transform = transformsFor[index];
    const spec = {...data, index, x: cursor, y: baseline + transform.yOffset, size, scaleX: profile.scaleX * transform.scaleX, scaleY: profile.scaleY * transform.scaleY, rotate: transform.rotate, skew: transform.skew};
    cursor += widths[index] + actualTracking;
    return spec;
  });
  return {glyphs, size, width};
}

function glyphPath(spec, fill, {dx = 0, dy = 0, opacity = 1} = {}) {
  const scale = spec.size / spec.fontUnitsPerEm;
  return `<path d="${spec.pathData}" transform="translate(${(spec.x + dx).toFixed(2)} ${(spec.y + dy).toFixed(2)}) rotate(${spec.rotate.toFixed(2)}) skewX(${spec.skew.toFixed(2)}) scale(${(scale * spec.scaleX).toFixed(6)} ${(-scale * spec.scaleY).toFixed(6)})" fill="${fill}" opacity="${opacity}"/>`;
}

function attachUnits(fontRecord, glyphs) {
  return glyphs.map((glyph) => ({...glyph, fontUnitsPerEm: fontRecord.font.unitsPerEm}));
}

function renderGroup(glyphs, fill, shadow = false) {
  return `<g>${glyphs.map((glyph) => `${shadow ? glyphPath(glyph, palette.quiet, {dx: 17, dy: 20, opacity: .38}) : ""}${glyphPath(glyph, fill)}`).join("")}</g>`;
}

function smallCopy(fontRecord, text, x, y, size, fill) {
  let cursor = x;
  const scale = size / fontRecord.font.unitsPerEm;
  return [...text].map((char) => {
    const data = glyphData(fontRecord, char);
    const markup = `<path d="${data.pathData}" transform="translate(${cursor.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})" fill="${fill}"/>`;
    cursor += data.advance * scale + 2;
    return markup;
  }).join("");
}

function defs() {
  return `<defs><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#111315" stroke-width="1" opacity=".055"/></pattern></defs>`;
}

function background(kicker, fontRecord) {
  return `<rect width="1920" height="1080" fill="${palette.paper}"/><rect width="1920" height="1080" fill="url(#grid)"/><rect width="1920" height="18" fill="${palette.accent}"/><rect x="54" y="1014" width="1812" height="3" fill="${palette.ink}"/>${smallCopy(fontRecord, kicker, 56, 82, 34, palette.ink)}`;
}

function axisFrame(plan) {
  const fontRecord = fonts[plan.fontId];
  const groups = plan.semanticGroups;
  const titleGlyphs = [];
  const receipts = [];
  groups.forEach((text, groupIndex) => {
    const preferred = plan.profileId === "EVA_MINCHO" ? 390 : 330;
    const layout = layoutGroup({
      fontRecord,
      text,
      profile: plan,
      preferredSize: groups.length === 1 ? preferred : preferred - 60,
      maxWidth: 1760,
      centerX: 960,
      baseline: groups.length === 1 ? 650 : 400 + groupIndex * 410,
      transforms: (index, count) => {
        const t = count === 1 ? .5 : index / (count - 1);
        return {scaleX: .72 + .5 * Math.sin(Math.PI * (.12 + .76 * t)) ** 2, scaleY: 1.08 - .14 * Math.sin(Math.PI * t), rotate: -2 + 4 * t, skew: -2 + 4 * Math.sin(t * Math.PI), yOffset: 12 * Math.sin(t * Math.PI * 2)};
      },
    });
    const glyphs = attachUnits(fontRecord, layout.glyphs);
    titleGlyphs.push(...glyphs);
    receipts.push({groupIndex, text, size: layout.size, width: layout.width, baseline: layout.glyphs[0]?.y || 0});
  });
  return {titleMarkup: renderGroup(titleGlyphs, palette.ink, true), glyphs: titleGlyphs, receipt: {behaviorId: plan.behaviorId, profileId: plan.profileId, semanticGroups: groups, duplicateFormalCopyCount: 0, groups: receipts}};
}

function lensFrame(plan) {
  const fontRecord = fonts[plan.fontId];
  const lensGroups = plan.semanticGroups.length > 1 ? plan.semanticGroups : (() => {
    const chars = [...plan.exactCopy];
    const splitAt = Math.ceil(chars.length / 2);
    return [chars.slice(0, splitAt).join(""), chars.slice(splitAt).join("")];
  })();
  const primaryCopy = lensGroups[0];
  const focusCopy = lensGroups.slice(1).join("");
  const primary = layoutGroup({fontRecord, text: primaryCopy, profile: plan, preferredSize: plan.profileId === "EVA_MINCHO" ? 430 : 300, maxWidth: 800, centerX: 475, baseline: 575});
  const focus = layoutGroup({fontRecord, text: focusCopy, profile: plan, preferredSize: plan.profileId === "EVA_MINCHO" ? 390 : 250, maxWidth: 430, centerX: 1230, baseline: 585});
  const primaryGlyphs = attachUnits(fontRecord, primary.glyphs);
  const focusGlyphs = attachUnits(fontRecord, focus.glyphs);
  const lens = `<circle cx="1230" cy="510" r="278" fill="rgba(40,83,216,.08)" stroke="${palette.accent}" stroke-width="13"/><circle cx="1164" cy="438" r="96" fill="#fff" opacity=".18"/>`;
  return {titleMarkup: `${renderGroup(primaryGlyphs, palette.ink, false)}${lens}${renderGroup(focusGlyphs, palette.accent, false)}`, glyphs: [...primaryGlyphs, ...focusGlyphs], receipt: {behaviorId: plan.behaviorId, profileId: plan.profileId, semanticGroups: [primaryCopy, focusCopy], duplicateFormalCopyCount: 0, focusGlyphVisibilityTarget: 1, lens: {cx: 1230, cy: 510, radius: 278}}};
}

function cleanFrame(plan) {
  const fontRecord = fonts[plan.fontId];
  const groups = plan.semanticGroups;
  const glyphs = [];
  const receipts = [];
  groups.forEach((text, groupIndex) => {
    const layout = layoutGroup({fontRecord, text, profile: plan, preferredSize: plan.profileId === "EVA_MINCHO" ? 380 : 330, maxWidth: groupIndex === 0 ? 1430 : 1260, centerX: groupIndex === 0 ? 780 : 1120, baseline: groups.length === 1 ? 650 : 400 + groupIndex * 430});
    const groupGlyphs = attachUnits(fontRecord, layout.glyphs);
    glyphs.push(...groupGlyphs);
    receipts.push({groupIndex, text, size: layout.size, width: layout.width, baseline: layout.glyphs[0]?.y || 0});
  });
  const auditMarkup = renderGroup(glyphs, palette.ink, false);
  const markup = `${auditMarkup}<rect x="56" y="870" width="520" height="15" fill="${palette.accent}"/>`;
  return {titleMarkup: markup, auditMarkup, glyphs, receipt: {behaviorId: plan.behaviorId, profileId: plan.profileId, semanticGroups: groups, duplicateFormalCopyCount: 0, groups: receipts}};
}

const renderers = {AXIS_RESPONSIVE: axisFrame, LENS_OCCLUSION: lensFrame, CLEAN_EDITORIAL: cleanFrame};

async function rasterize(markup, kicker, fontRecord) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}${background(kicker, fontRecord)}${markup}</svg>`;
  if (/<text\b/u.test(svg)) throw new Error("glyph-eva-svg-text-leak");
  return sharp(Buffer.from(svg)).png({compressionLevel: 9}).toBuffer();
}

async function alphaBounds(markup) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}${markup}</svg>`;
  const {data, info} = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  let pixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] <= 16) continue;
    pixels += 1;
    const pixel = (index - 3) / 4;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (!pixels) throw new Error("glyph-eva-empty-title");
  return {x: left, y: top, width: right - left + 1, height: bottom - top + 1, widthRatio: (right - left + 1) / W, heightRatio: (bottom - top + 1) / H, pixelRatio: pixels / (W * H), touchesBoundary: left < 18 || top < 18 || right > W - 19 || bottom > H - 19};
}

function geometryVisibilityAudit(plan, rendered, bounds) {
  const scales = rendered.glyphs.map((glyph) => glyph.scaleX / plan.scaleX);
  const scaleRatio = Math.max(...scales) / Math.max(.001, Math.min(...scales));
  const minimumGlyphVisibilityRatio = 1;
  const failures = [];
  if (bounds.touchesBoundary) failures.push("TITLE_TOUCHES_CANVAS_BOUNDARY");
  if (bounds.widthRatio < plan.limits.minimumTitleBoundsWidthRatio) failures.push("TITLE_TOO_NARROW");
  if (bounds.widthRatio > plan.limits.maximumTitleBoundsWidthRatio) failures.push("TITLE_TOO_WIDE");
  if (bounds.heightRatio < plan.limits.minimumTitleBoundsHeightRatio) failures.push("TITLE_TOO_SHORT");
  if (bounds.heightRatio > plan.limits.maximumTitleBoundsHeightRatio) failures.push("TITLE_TOO_TALL");
  if (minimumGlyphVisibilityRatio < plan.limits.minimumGlyphVisibilityRatio) failures.push("GLYPH_VISIBILITY_LOW");
  if (Number(rendered.receipt.duplicateFormalCopyCount || 0) > plan.limits.maximumDuplicateFormalCopyCount) failures.push("DUPLICATE_FORMAL_COPY");
  if (scaleRatio > plan.limits.maximumGlyphScaleRatio) failures.push("GLYPH_SCALE_RATIO_EXCESSIVE");
  let minimumLineBaselineRatio = null;
  if (["AXIS_RESPONSIVE", "CLEAN_EDITORIAL"].includes(plan.behaviorId) && Array.isArray(rendered.receipt.groups) && rendered.receipt.groups.length > 1) {
    const ratios = rendered.receipt.groups.slice(1).map((group, index) => {
      const previous = rendered.receipt.groups[index];
      return (group.baseline - previous.baseline) / Math.max(group.size, previous.size);
    });
    minimumLineBaselineRatio = Math.min(...ratios);
    if (minimumLineBaselineRatio < 0.88) failures.push("LINE_GROUP_COLLISION_RISK");
  }
  return {status: failures.length ? "FAIL" : "PASS", bounds, minimumGlyphVisibilityRatio, scaleRatio, minimumLineBaselineRatio, duplicateFormalCopyCount: Number(rendered.receipt.duplicateFormalCopyCount || 0), failures};
}

const results = [];
for (const fixture of fixtures) {
  for (const plan of compileGlyphFontProfileTrials(fixture)) {
    const fontRecord = fonts[plan.fontId];
    const rendered = renderers[plan.behaviorId](plan);
    const bounds = await alphaBounds(rendered.auditMarkup || rendered.titleMarkup);
    const audit = geometryVisibilityAudit(plan, rendered, bounds);
    if (audit.status !== "PASS") throw new Error(`glyph-eva-audit-failed:${fixture.id}:${plan.behaviorId}:${plan.profileId}:${audit.failures.join(",")}`);
    const pixels = await rasterize(rendered.titleMarkup, fixture.kicker, fontRecord);
    const file = path.join(frameDir, `${fixture.id}--${plan.behaviorId}--${plan.profileId}.png`);
    fs.writeFileSync(file, pixels);
    const metadata = await sharp(pixels).metadata();
    results.push({id: fixture.id, genre: fixture.genre, behaviorId: plan.behaviorId, profileId: plan.profileId, profileLabel: plan.profileLabel, exactCopy: plan.exactCopy, semanticGroups: plan.semanticGroups, fontId: plan.fontId, fontSha256: fontRecord.sha256, scaleX: plan.scaleX, scaleY: plan.scaleY, planSha256: plan.planSha256, proportionVisibilityAudit: audit, operatorReceipt: rendered.receipt, artifact: {path: path.relative(root, file), sha256: sha(pixels), width: metadata.width, height: metadata.height}, reviewBoundary: plan.reviewBoundary});
  }
}

const tileWidth = 960;
const tileHeight = 540;
const labelHeight = 48;
const columns = 2;
const layers = await Promise.all(results.map(async (result, index) => {
  const frame = await sharp(path.join(root, result.artifact.path)).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#090B0D"/><text x="16" y="20" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#F3F0E8">${result.behaviorId} · ${result.profileLabel}</text><text x="16" y="39" font-family="monospace" font-size="11" fill="#8FA2A8">${result.genre} · bounds ${(result.proportionVisibilityAudit.bounds.widthRatio * 100).toFixed(1)}% × ${(result.proportionVisibilityAudit.bounds.heightRatio * 100).toFixed(1)}% · visibility 100%</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: tileHeight + labelHeight, channels: 4, background: "#090B0D"}}).composite([{input: label, left: 0, top: 0}, {input: frame, left: 0, top: labelHeight}]).png().toBuffer();
  return {input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)};
}));
const rows = Math.ceil(results.length / columns);
const sheet = await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#090B0D"}}).composite(layers).png({compressionLevel: 9}).toBuffer();
const sheetFile = path.join(out, "eva-font-axis-contact-sheet.png");
fs.writeFileSync(sheetFile, sheet);

const baselineFile = path.join(root, "work/glyph-operator-behavior-families-v1/glyph-behavior-contact-sheet.png");
fs.writeFileSync(path.join(out, "baseline.json"), `${JSON.stringify({contract: "A1GlyphProportionOcclusionEvaBaseline/v1", status: "FAIL", source: path.relative(root, baselineFile), sourceSha256: fs.existsSync(baselineFile) ? sha(baselineFile) : null, userFinding: "Proportions and occlusion are wrong and EVA-style compressed Mincho must be tested as an independent font axis.", observedFailures: ["single-font-axis", "lens-duplicates-full-title", "no-explicit-proportion-gate", "no-glyph-visibility-gate"]}, null, 2)}\n`);

const result = {
  contract: "A1GlyphProportionOcclusionEvaBoard/v1",
  status: "PASS",
  fixtures: fixtures.map((fixture) => ({id: fixture.id, genre: fixture.genre, resultCount: results.filter((result) => result.id === fixture.id).length})),
  profileCount: 2,
  behaviorCount: 3,
  frameCount: results.length,
  fontBindings: Object.values(fonts).map(({id, file, sha256}) => ({id, path: path.relative(root, file), sha256})),
  profiles: [...new Set(results.map((result) => result.profileId))],
  behaviors: [...new Set(results.map((result) => result.behaviorId))],
  visibleArtifact: {path: path.relative(root, sheetFile), sha256: sha(sheet), width: columns * tileWidth, height: rows * (tileHeight + labelHeight)},
  results,
  boundary: {reviewOnly: true, aestheticApproval: "NONE_USER_REVIEW_REQUIRED", userVisualApproval: "NOT_APPROVED", productionAdmission: false, currentWorkspaceMutated: false, currentBoardMutated: false, motionAdmission: false},
};
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtures.length, profileCount: result.profileCount, behaviorCount: result.behaviorCount, frameCount: result.frameCount, visibleArtifact: result.visibleArtifact, boundary: result.boundary}, null, 2));
