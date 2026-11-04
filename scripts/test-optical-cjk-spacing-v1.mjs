#!/usr/bin/env node

import assert from "node:assert/strict";
import {fitCjkLine, layoutAdvanceCjkLine, layoutOpticalCjkLine, opticalGapEmForPair} from "../apps/studio-next/src/lib/a1-optical-cjk-spacing-v1.mjs";

const glyphs = [
  {character: "数", advance: 1000, bounds: {minX: 52, minY: -80, maxX: 950, maxY: 890}},
  {character: "据", advance: 1000, bounds: {minX: 78, minY: -76, maxX: 918, maxY: 872}},
  {character: "，", advance: 1000, bounds: {minX: 110, minY: -130, maxX: 430, maxY: 170}},
  {character: "不", advance: 1000, bounds: {minX: 34, minY: -62, maxX: 968, maxY: 850}},
];
const transforms = [
  {scaleX: 0.76, scaleY: 1, rotate: -2, skew: -1},
  {scaleX: 1.18, scaleY: 0.94, rotate: 1.5, skew: 2},
  {scaleX: 0.88, scaleY: 1, rotate: 0, skew: 0},
  {scaleX: 1.08, scaleY: 0.96, rotate: 2, skew: -1},
];

const common = {glyphs, unitsPerEm: 1000, fontSize: 360, profileScaleX: 0.6, profileScaleY: 1, transforms, centerX: 960, baseline: 620};
const advance = layoutAdvanceCjkLine({...common, trackingEm: -0.025});
const optical = layoutOpticalCjkLine({...common, baseGapEm: 0.034});
const fitted = fitCjkLine({...common, preferredSize: 420, minimumSize: 120, maxWidth: 1500, baseGapEm: 0.034});

assert.equal(optical.glyphs.length, glyphs.length);
assert(optical.maximumGapResidualPx < 0.001);
assert(advance.maximumGapResidualPx > 10);
assert(optical.visualGaps[1] < optical.visualGaps[0]);
assert(opticalGapEmForPair("据", "，", 0.034) < opticalGapEmForPair("数", "据", 0.034));
assert(fitted.fits);
assert(fitted.width <= 1500);
assert(optical.glyphs.every((glyph, index) => glyph.character === glyphs[index].character));

console.log(JSON.stringify({
  contract: "A1OpticalCjkSpacingTest/v1",
  status: "PASS",
  advanceMaximumGapResidualPx: advance.maximumGapResidualPx,
  opticalMaximumGapResidualPx: optical.maximumGapResidualPx,
  fittedSize: fitted.fontSize,
  fittedWidth: fitted.width,
  checks: ["transformed-ink-bounds", "pairwise-optical-gap", "punctuation-aware-gap", "fit-without-copy-change"],
}, null, 2));
