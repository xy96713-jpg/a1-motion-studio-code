#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {auditSubjectOcclusionGeometry} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-face-geometry-"));
const make = async (name, x, y, width, height) => {
  const file = path.join(dir, name);
  const svg = Buffer.from(`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect x="${x * 100}" y="${y * 100}" width="${width * 100}" height="${height * 100}" fill="#111"/></svg>`);
  await sharp({create: {width: 100, height: 100, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: svg}]).png().toFile(file);
  return file;
};

const subject = {x: 0.4, y: 0.2, width: 0.4, height: 0.7};
const faceOverlap = await auditSubjectOcclusionGeometry({candidateFile: await make("face.png", 0.5, 0.3, 0.1, 0.08), subjectBounds: subject, availableRegions: [{x: 0, y: 0, width: 1, height: 1}], targetWidth: 100, targetHeight: 100});
assert.equal(faceOverlap.status, "FAIL");
assert.equal(faceOverlap.face.status, "FAIL", "a small face card must fail even when the whole subject average is low");
assert.equal(faceOverlap.eyes.status, "FAIL", "eye overlap is a hard exclusion");

const overflow = await auditSubjectOcclusionGeometry({candidateFile: await make("overflow.png", 0.5, 0.05, 0.1, 0.1), subjectBounds: {x: 0.72, y: 0.2, width: 0.2, height: 0.7}, availableRegions: [{x: 0.04, y: 0.04, width: 0.28, height: 0.24}], targetWidth: 100, targetHeight: 100});
assert.equal(overflow.status, "FAIL");
assert.equal(overflow.availableRegionOverflow.status, "FAIL", "visible pixels outside the declared available region must hard-fail");

const safe = await auditSubjectOcclusionGeometry({candidateFile: await make("safe.png", 0.08, 0.08, 0.16, 0.12), subjectBounds: subject, availableRegions: [{x: 0.04, y: 0.04, width: 0.28, height: 0.24}], targetWidth: 100, targetHeight: 100});
assert.equal(safe.status, "PASS");
assert.equal(safe.face.status, "PASS");
assert.equal(safe.availableRegionOverflow.status, "PASS");

const unifiedMask = await auditSubjectOcclusionGeometry({
  candidateFile: await make("unified-mask.png", 0.12, 0.12, 0.06, 0.06),
  subjectBounds: subject,
  allowedRegionPolygon: [{x: 0.04, y: 0.04}, {x: 0.28, y: 0.04}, {x: 0.28, y: 0.24}, {x: 0.04, y: 0.24}],
  exclusionMask: [{id: "buffered-editorial-mask", bounds: {x: 0.1, y: 0.1, width: 0.1, height: 0.1}}],
  targetWidth: 100,
  targetHeight: 100,
});
assert.equal(unifiedMask.status, "FAIL");
assert.equal(unifiedMask.availableRegionOverflow.status, "PASS");
assert.equal(unifiedMask.exclusionMaskIntersection.status, "FAIL", "visible pixels intersecting the unified mask must hard-fail");

fs.rmSync(dir, {recursive: true, force: true});
console.log(JSON.stringify({status: "PASS", contract: "A1PackageLookMasterFaceGeometryGate/v1", faceHardExclusion: true, eyesHardExclusion: true, bodyThreshold: safe.body.threshold, availableRegionHardExclusion: true, unifiedExclusionMaskHardExclusion: true}, null, 2));
