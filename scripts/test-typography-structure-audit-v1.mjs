#!/usr/bin/env node
import assert from "node:assert/strict";

import {auditTypographyStructurePixels} from "./lib/a1-typography-structure-audit-v1.mjs";

const width = 6;
const height = 4;
const pixels = width * height;
const alpha = (...indices) => {
  const value = Buffer.alloc(pixels);
  for (const index of indices) value[index] = 255;
  return value;
};
const rgb = (value = 0) => Buffer.alloc(pixels * 3, value);
const source = rgb(10);
const candidate = rgb(10);
for (const index of [0, 1, 4, 5, 6, 11, 12, 17]) candidate[index * 3] = 240;
const masks = {
  unified: alpha(8, 9, 14, 15),
  protectedPresenter: alpha(8, 9, 14),
  face: alpha(8, 9),
  eyes: alpha(8),
  mouth: alpha(9),
  hair: alpha(2, 8),
  leftShoulder: alpha(7, 13),
  rightShoulder: alpha(10, 16),
  microphone: alpha(15, 21),
};
const titleAlpha = alpha(0, 1, 2, 4, 5, 6, 7, 8, 10, 11, 13, 14, 16, 17);
const gates = {
  minimumContactZones: 2,
  minimumTitleContinuationSides: 2,
  minimumAffectedRunOcclusionRatio: 0.03,
  maximumAffectedRunOcclusionRatio: 0.4,
  minimumKeyGlyphVisibleRatio: 0.5,
  minimumGlyphCanvasCoverageRatio: 0.9,
};
const glyphs = [
  {id: "g1", alpha: alpha(0, 1, 2, 8), bounds: {left: 0, top: 0, right: 3, bottom: 2}},
  {id: "g2", alpha: alpha(10, 11, 16, 17), bounds: {left: 4, top: 1, right: 6, bottom: 3}},
];
const audit = auditTypographyStructurePixels({width, height, sourceRgb: source, candidateRgb: candidate, titleAlpha, glyphs, masks, subjectBounds: {left: 2, top: 1, right: 4, bottom: 4}, gates});
assert.equal(audit.status, "PASS");
assert.equal(audit.sourceProtection.changedPixels, 0);
assert.equal(audit.sourceProtection.maskRole, "protectedPresenter");
assert.ok(audit.titleRelationship.occlusionRatio > 0);
assert.equal(audit.titleRelationship.continuationSides, 2);
assert.ok(audit.contactGraph.actualZones.length >= 2);
assert.ok(audit.glyphVisibility.every((glyph) => glyph.visibleRatio >= 0.5));

const microphoneCovered = Buffer.from(candidate);
microphoneCovered[15 * 3] = 255;
const microphoneTitleAlpha = Buffer.from(titleAlpha);
microphoneTitleAlpha[15] = 255;
const microphoneCoverageAllowed = auditTypographyStructurePixels({width, height, sourceRgb: source, candidateRgb: microphoneCovered, titleAlpha: microphoneTitleAlpha, glyphs, masks, subjectBounds: {left: 2, top: 1, right: 4, bottom: 4}, gates});
assert.equal(microphoneCoverageAllowed.sourceProtection.changedPixels, 0);
assert.equal(microphoneCoverageAllowed.equipmentCoverage.microphone.changedPixels, 1);
assert.equal(microphoneCoverageAllowed.failures.includes("SOURCE_PROTECTION_CHANGED"), false);

const changedProtected = Buffer.from(candidate);
changedProtected[8 * 3] = 255;
const protectionFailure = auditTypographyStructurePixels({width, height, sourceRgb: source, candidateRgb: changedProtected, titleAlpha, masks, subjectBounds: {left: 2, top: 1, right: 4, bottom: 4}, gates});
assert.equal(protectionFailure.status, "FAIL");
assert.ok(protectionFailure.failures.includes("SOURCE_PROTECTION_CHANGED"));

const hiddenGlyph = auditTypographyStructurePixels({width, height, sourceRgb: source, candidateRgb: candidate, titleAlpha, glyphs: [{id: "hidden", alpha: alpha(8, 9, 14, 15), bounds: {left: 2, top: 1, right: 4, bottom: 3}}], masks, subjectBounds: {left: 2, top: 1, right: 4, bottom: 4}, gates});
assert.equal(hiddenGlyph.status, "FAIL");
assert.ok(hiddenGlyph.failures.includes("KEY_GLYPH_VISIBILITY_LOW"));

const noContact = auditTypographyStructurePixels({width, height, sourceRgb: source, candidateRgb: candidate, titleAlpha: alpha(0, 1, 4, 5), masks, subjectBounds: {left: 2, top: 1, right: 4, bottom: 4}, gates});
assert.equal(noContact.status, "FAIL");
assert.ok(noContact.failures.includes("CONTACT_ZONES_INSUFFICIENT"));

console.log("A1 typography structure pixel audit PASS");
