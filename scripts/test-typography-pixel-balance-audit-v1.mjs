#!/usr/bin/env node
import assert from "node:assert/strict";

import {measureTypographyPixelBalance} from "./lib/a1-typography-pixel-balance-audit-v1.mjs";

const width = 10;
const height = 6;
const pixels = width * height;
const alpha = () => Buffer.alloc(pixels);
const titleAlpha = alpha();
const subjectAlpha = alpha();
const microphoneAlpha = alpha();
const sourceRgb = Buffer.alloc(pixels * 3, 80);
const candidateRgb = Buffer.from(sourceRgb);
for (let x = 0; x < width; x += 1) titleAlpha[2 * width + x] = 255;
for (let y = 1; y < height; y += 1) for (const x of [4, 5]) subjectAlpha[y * width + x] = 255;
for (let y = 3; y < 5; y += 1) microphoneAlpha[y * width + 2] = 255;
for (let x = 0; x < width; x += 1) {
  const index = 2 * width + x;
  if (!subjectAlpha[index]) {
    candidateRgb[index * 3] = 240;
    candidateRgb[index * 3 + 1] = 220;
  }
}
const audit = measureTypographyPixelBalance({
  width,
  height,
  titleAlpha,
  subjectAlpha,
  microphoneAlpha,
  sourceRgb,
  candidateRgb,
  contactMasks: {head: subjectAlpha, microphone: microphoneAlpha},
});
assert.equal(audit.contract, "A1TypographyPixelBalanceAudit/v1");
assert.equal(audit.status, "MEASURED_REVIEW_REQUIRED");
assert.equal("overallAestheticScore" in audit, false);
assert.ok(Math.abs(audit.centroids.title.x - 0.5) < 1e-9);
assert.ok(Math.abs(audit.centroids.subject.x - 0.5) < 1e-9);
assert.ok(audit.scanlineContinuation.continuousCrossingRows >= 1);
assert.equal(audit.scanlineContinuation.ratio, 1);
assert.ok(audit.contacts.length >= 1);
assert.ok(Object.values(audit.actorQuadrantWeights).every((value) => value >= 0 && value <= 1));
assert.ok(Math.abs(Object.values(audit.actorQuadrantWeights).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
assert.equal(audit.productionAdmission, false);

const leftTitle = alpha();
for (let y = 1; y < 5; y += 1) for (let x = 0; x < 3; x += 1) leftTitle[y * width + x] = 255;
const leftAudit = measureTypographyPixelBalance({width, height, titleAlpha: leftTitle, subjectAlpha, microphoneAlpha, sourceRgb, candidateRgb: sourceRgb, contactMasks: {}});
assert.ok(leftAudit.moments.title.horizontal < -0.15);
assert.equal(leftAudit.scanlineContinuation.continuousCrossingRows, 0);
assert.throws(() => measureTypographyPixelBalance({width, height, titleAlpha: Buffer.alloc(1), subjectAlpha, microphoneAlpha, sourceRgb, candidateRgb, contactMasks: {}}), /pixel-balance-buffer-invalid/u);

console.log("A1 typography pixel balance audit PASS");
