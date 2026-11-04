#!/usr/bin/env node
import assert from "node:assert/strict";
import sharp from "sharp";

import {composeLayeredPresenterTitle} from "./lib/a1-layered-presenter-matte-v1.mjs";

const width = 64;
const height = 36;
const pixels = width * height;
const sourceRgb = Buffer.alloc(pixels * 3);
const presenterRgb = Buffer.alloc(pixels * 3);
const titleRgba = Buffer.alloc(pixels * 4);
const presenter = Buffer.alloc(pixels);
const microphone = Buffer.alloc(pixels);
const boom = Buffer.alloc(pixels);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    sourceRgb[index * 3] = 40 + x;
    sourceRgb[index * 3 + 1] = 50 + y;
    sourceRgb[index * 3 + 2] = 70;
    presenterRgb[index * 3] = sourceRgb[index * 3];
    presenterRgb[index * 3 + 1] = sourceRgb[index * 3 + 1];
    presenterRgb[index * 3 + 2] = sourceRgb[index * 3 + 2];
    if (y >= 18 && y <= 30) {
      titleRgba[index * 4] = 240;
      titleRgba[index * 4 + 1] = 220;
      titleRgba[index * 4 + 2] = 80;
      titleRgba[index * 4 + 3] = 255;
    }
    if (x >= 24 && x <= 42 && y >= 16) {
      presenter[index] = x === 24 || x === 42 ? 128 : 255;
      if (presenter[index] === 128) {
        presenterRgb[index * 3] = 255;
        presenterRgb[index * 3 + 1] = 0;
        presenterRgb[index * 3 + 2] = 0;
      }
    }
    if (x >= 10 && x <= 18 && y >= 20 && y <= 27) microphone[index] = 255;
    if (x <= 14 && y >= 25 && y <= 27) boom[index] = 255;
  }
}
const result = await composeLayeredPresenterTitle({
  width,
  height,
  sourceRgb,
  presenterRgb,
  titleRgba,
  masks: {presenter, microphone, boom},
  contactTreatment: {titleBlurSigma: 1.5, titleDarkness: 0.12},
});
assert.equal(result.report.contract, "A1LayeredPresenterMatteComposite/v1");
assert.equal(result.report.status, "PASS", JSON.stringify(result.report));
assert.deepEqual(result.report.zOrder, ["SOURCE_WITH_EQUIPMENT", "TITLE_WALL", "PRESENTER"]);
assert.deepEqual(result.report.protectedRoles, ["PRESENTER"]);
assert.deepEqual(result.report.titleMayCover, ["MICROPHONE", "BOOM_ARM", "STAND"]);
assert.equal(result.report.protectedCoreChangedPixels, 0);
assert.ok(result.report.softEdgePixels > 0);
assert.ok(result.report.contactShadowPixels > 0);
assert.ok(result.report.contactBlurPixels > 0);
assert.deepEqual(result.report.contactTreatment, {titleBlurSigma: 1.5, titleDarkness: 0.12});
assert.equal(result.report.softEdgeColorSource, "ESTIMATED_FOREGROUND_RGB");
assert.equal(result.report.productionAdmission, false);
const metadata = await sharp(result.png).metadata();
assert.deepEqual([metadata.width, metadata.height], [width, height]);
const outputRgb = await sharp(result.png).removeAlpha().raw().toBuffer();
const coreIndex = 22 * width + 30;
assert.deepEqual([...outputRgb.subarray(coreIndex * 3, coreIndex * 3 + 3)], [...sourceRgb.subarray(coreIndex * 3, coreIndex * 3 + 3)]);
const titleIndex = 19 * width + 5;
assert.notDeepEqual([...outputRgb.subarray(titleIndex * 3, titleIndex * 3 + 3)], [...sourceRgb.subarray(titleIndex * 3, titleIndex * 3 + 3)]);
const microphoneIndex = 22 * width + 12;
assert.deepEqual([...outputRgb.subarray(microphoneIndex * 3, microphoneIndex * 3 + 3)], [240, 220, 80]);
assert.notDeepEqual([...outputRgb.subarray(microphoneIndex * 3, microphoneIndex * 3 + 3)], [...sourceRgb.subarray(microphoneIndex * 3, microphoneIndex * 3 + 3)]);
assert.ok(result.report.equipmentTitleOverlap.microphonePixels > 0);
const boomIndex = 26 * width + 5;
assert.deepEqual([...outputRgb.subarray(boomIndex * 3, boomIndex * 3 + 3)], [240, 220, 80]);
assert.ok(result.report.equipmentTitleOverlap.boomPixels > 0);

const colorResult = await composeLayeredPresenterTitle({
  width,
  height,
  sourceRgb,
  presenterRgb,
  titleRgba,
  masks: {presenter, microphone, boom},
  contactTreatment: {titleBlurSigma: 0, titleDarkness: 0},
});
const colorRgb = await sharp(colorResult.png).removeAlpha().raw().toBuffer();
const softIndex = 22 * width + 24;
const softAlpha = 128 / 255;
const expectedSoft = [255, 0, 0].map((foreground, channel) => Math.round(foreground * softAlpha + [240, 220, 80][channel] * (1 - softAlpha)));
assert.deepEqual([...colorRgb.subarray(softIndex * 3, softIndex * 3 + 3)], expectedSoft);
assert.deepEqual([...colorRgb.subarray(coreIndex * 3, coreIndex * 3 + 3)], [...sourceRgb.subarray(coreIndex * 3, coreIndex * 3 + 3)]);

console.log("A1 layered presenter matte compositor PASS");
