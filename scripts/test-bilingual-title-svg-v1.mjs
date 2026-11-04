#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";

import {assertBilingualTitleLayout, buildGlyphPathRun, loadBilingualTitleFont} from "./lib/a1-bilingual-title-svg-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const zh = loadBilingualTitleFont(path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf"), "zh-hero");
const en = loadBilingualTitleFont("/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf", "en-partner");
const roundedEn = loadBilingualTitleFont("/System/Library/Fonts/Supplemental/Futura.ttc", "en-rounded-partner", {postscriptName: "Futura-Bold"});
const runs = [
  buildGlyphPathRun({id: "zh-primary", fontBinding: zh, text: "智能写作", left: 110, top: 20, size: 245, scaleX: 0.60, scaleY: 1}),
  buildGlyphPathRun({id: "en-primary", fontBinding: en, text: "AI WRITING", left: 40, top: 265, size: 105, scaleX: 0.70, scaleY: 1.15}),
  buildGlyphPathRun({id: "zh-turn", fontBinding: zh, text: "工具台", left: 180, top: 360, size: 245, scaleX: 0.60, scaleY: 1}),
  buildGlyphPathRun({id: "en-turn", fontBinding: en, text: "WORKBENCH", left: 40, top: 605, size: 105, scaleX: 0.70, scaleY: 1.15}),
];
const audit = assertBilingualTitleLayout(runs, {minimumGap: 8});
assert.deepEqual(audit.readingOrder, ["zh-primary", "en-primary", "zh-turn", "en-turn"]);
assert.ok(runs[0].bounds.width > runs[1].bounds.width);
assert.ok(runs[2].bounds.width < runs[0].bounds.width);
assert.ok(runs[3].bounds.width > runs[2].bounds.width);
assert.equal(runs[0].glyphIds.length, 4);
assert.equal(runs[1].glyphIds.length, 10);
assert.equal(runs[2].glyphIds.length, 3);
assert.equal(runs[3].glyphIds.length, 9);
assert.equal(runs[0].glyphBounds.length, runs[0].glyphIds.length);
assert.equal(runs[0].glyphMarkups.length, runs[0].glyphIds.length);
for (const glyph of runs[0].glyphBounds) {
  assert.ok(glyph.bounds.left >= runs[0].bounds.left);
  assert.ok(glyph.bounds.top >= runs[0].bounds.top);
  assert.ok(glyph.bounds.right <= runs[0].bounds.right);
  assert.ok(glyph.bounds.bottom <= runs[0].bounds.bottom);
}
assert.match(runs[0].glyphMarkups[0], /<path data-glyph-id=/u);
assert.match(runs[0].markup, /<path data-glyph-id=/u);
const roundedRun = buildGlyphPathRun({id: "en-rounded-probe", fontBinding: roundedEn, text: "AI WRITING", left: 0, top: 0, size: 105, scaleX: 0.86, scaleY: 1, tracking: 4});
assert.equal(roundedEn.postscriptName, "Futura-Bold");
assert.equal(roundedRun.glyphIds.length, 10);
assert.equal(roundedRun.tracking, 4);
assert.ok(roundedRun.bounds.width > 0 && roundedRun.bounds.height > 0);
assert.throws(() => assertBilingualTitleLayout([runs[0], {...runs[1], bounds: {...runs[1].bounds, top: runs[0].bounds.bottom - 1}}]), /line-collision/);
console.log(JSON.stringify({contract: "A1BilingualTitleSvgTest/v1", status: "PASS", fonts: {zh: zh.family, en: en.family, roundedEn: roundedEn.postscriptName}, roundedRun: {bounds: roundedRun.bounds, glyphCount: roundedRun.glyphIds.length, tracking: roundedRun.tracking}, runs: runs.map(({id, text, bounds, glyphIds}) => ({id, text, bounds, glyphCount: glyphIds.length})), audit}, null, 2));
