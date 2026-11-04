#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import {compileFontkitGlyphPathManifestV1, assertFontkitGlyphPathManifestV1} from "../apps/studio-next/src/lib/a1-fontkit-glyph-path-compiler-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const profiles = [
  ["SANS_HEAVY", "source-han-sans-heavy", "apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf", "字效系统"],
  ["EVA_MINCHO", "source-han-serif-heavy", "apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf", "判断先行"],
  ["FUSION_PIXEL", "fusion-pixel", "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf", "状态锁定"],
];

for (const [fontProfile, fontId, relativeFont, exactCopy] of profiles) {
  const input = {manifestId: `test-${fontProfile}`, genre: "generic", exactCopy, fontProfile, fontId, fontFile: path.join(root, relativeFont), semanticGroups: [exactCopy]};
  const first = assertFontkitGlyphPathManifestV1(compileFontkitGlyphPathManifestV1(input));
  const second = compileFontkitGlyphPathManifestV1(input);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.exactCopy, exactCopy);
  assert.equal(first.shaping.fallbackUsed, false);
  assert.equal(first.outputBoundary.runtimeFontParserAllowed, false);
  assert.equal(first.outputBoundary.runtimeConsumesPathsOnly, true);
  assert.ok(first.run.visibleGlyphCount > 0);
  assert.ok(first.glyphs.filter((glyph) => !glyph.emptyOutline).every((glyph) => glyph.pathData.length > 0 && /^[a-f0-9]{64}$/u.test(glyph.pathSha256)));
}

assert.throws(() => compileFontkitGlyphPathManifestV1({manifestId: "missing", exactCopy: "🧬", fontId: "source-han-sans-heavy", fontFile: path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf")}), /missing-codepoint/);
const fontFile = path.join(root, profiles[0][2]);
const space = assertFontkitGlyphPathManifestV1(compileFontkitGlyphPathManifestV1({manifestId: "space", exactCopy: "  ", fontId: "heavy", fontFile}));
assert.equal(space.exactCopy, "  ");
assert.equal(space.run.visibleGlyphCount, 0);
assert.ok(space.run.advanceWidth > 0);
assert.deepEqual(space.run.visibleBounds, {minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0});
assert.throws(() => compileFontkitGlyphPathManifestV1({manifestId: "empty", exactCopy: "", fontId: "heavy", fontFile}), /copy-required/);
const fixtureBytes = fs.readFileSync(path.join(root, "fixtures/typography-inputs.json"));
assert.equal(crypto.createHash("sha256").update(fixtureBytes).digest("hex"), "a1f83d50f5c2d4e7cf60a2aafc60113222612b86f5d51cdd87e1ba1f6cb4030f");
let frozenRuns = 0;
for (const fixture of JSON.parse(fixtureBytes).inputs.filter((item) => ["P22", "P23", "P24"].includes(item.id))) {
  const p = fixture.parameters, exactCopy = p.exactCopy ?? p.runs.map((run) => run.text).join("");
  assert.equal(crypto.createHash("sha256").update(exactCopy).digest("hex"), p.copyLock.sha256);
  for (const [index, run] of p.runs.entries()) {
    const binding = p.fontBindings.find((font) => font.id === run.fontId);
    const input = {manifestId: `${fixture.id}-${index}`, exactCopy: run.text, fontId: binding.id,
      fontFile: path.join(root, "apps/studio-next/public/a1-editorial-fonts", path.basename(binding.path)), placement: run};
    const m = assertFontkitGlyphPathManifestV1(compileFontkitGlyphPathManifestV1(input));
    assert.equal(m.exactCopy, run.text);
    assert.equal(m.font.sha256, binding.sha256);
    assert.equal(m.glyphs.map((glyph) => glyph.characters).join(""), run.text, "frozen CJK/Latin/punctuation code points survive shaping");
    assert.ok(m.glyphs.every((glyph) => !glyph.emptyOutline));
    const b = m.run.canvasInkBounds;
    assert.ok(b.minX >= 0 && b.minY >= 0 && b.maxX <= p.canvas.width && b.maxY <= p.canvas.height);
    const shifted = compileFontkitGlyphPathManifestV1({...input, placement: {...run, x: run.x + 11, baselineY: run.baselineY + 7}});
    for (const key of ["minX", "maxX"]) assert.ok(Math.abs(shifted.run.canvasInkBounds[key] - b[key] - 11) < 1e-7);
    for (const key of ["minY", "maxY"]) assert.ok(Math.abs(shifted.run.canvasInkBounds[key] - b[key] - 7) < 1e-7);
    frozenRuns++;
  }
}
assert.throws(() => compileFontkitGlyphPathManifestV1({manifestId: "bad-placement", exactCopy: "字", fontId: "heavy", fontFile,
  placement: {x: 0, baselineY: 0, fontSize: 0}}), /placement-invalid/);
const placement = {x: 100, baselineY: 200, fontSize: 64, horizontalScale: 0.7, letterSpacing: 7};
const baseInput = {manifestId: "vertical-scale", exactCopy: "智能写作工具台", fontId: "serif", fontFile: path.join(root, profiles[1][2]), placement};
const basePlaced = compileFontkitGlyphPathManifestV1(baseInput);
assert.deepEqual(basePlaced, compileFontkitGlyphPathManifestV1({...baseInput, placement: {...placement, verticalScale: 1}}));
for (const verticalScale of [0.5, 1.15, 1.5]) {
  const scaled = assertFontkitGlyphPathManifestV1(compileFontkitGlyphPathManifestV1({...baseInput, placement: {...placement, verticalScale}}));
  for (const [index, glyph] of scaled.glyphs.entries()) {
    const original = basePlaced.glyphs[index].canvasInkBounds;
    for (const key of ["minX", "maxX"]) assert.ok(Math.abs(glyph.canvasInkBounds[key] - original[key]) < 1e-7, "world x/spacing unchanged");
    for (const key of ["minY", "maxY"]) assert.ok(Math.abs(glyph.canvasInkBounds[key] - (placement.baselineY + (original[key] - placement.baselineY) * verticalScale)) < 1e-7);
  }
  assert.equal(scaled.exactCopy, basePlaced.exactCopy);
  assert.equal(scaled.font.sha256, basePlaced.font.sha256);
}
for (const verticalScale of [0.49, 1.51, NaN, Infinity, "1.15"]) {
  assert.throws(() => compileFontkitGlyphPathManifestV1({...baseInput, placement: {...placement, verticalScale}}), /placement-invalid/);
}
console.log("PASS verticalScale: default identity, 0.5/1.15/1.5, fixed baseline/world spacing, finite range guards");
console.log(`PASS frozen glyphs: ${frozenRuns} P22–P24 runs, copy/font SHA, CJK punctuation, baseline translations, space-only run`);
console.log(JSON.stringify({contract: "A1FontkitGlyphPathCompilerTest/v1", status: "PASS", profileCount: profiles.length, checks: ["exact-copy", "font-sha", "glyph-ids", "path-sha", "deterministic-manifest", "missing-glyph-block", "no-runtime-font-parser", "no-fallback"]}, null, 2));
