#!/usr/bin/env node

import assert from "node:assert/strict";

import {evaluateApprovedMasterLayerCanary} from "../apps/studio-next/src/lib/a1-approved-master-layer-canary-gate-v1.mjs";
import {queuePackageLayerGenerationJobs} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";

const base = {
  candidateSize: {width: 1672, height: 941},
  masterSize: {width: 1672, height: 941},
  candidateHasAlpha: true,
  transparentRatio: 0.9,
  partialAlphaRatio: 0.01,
  opaqueRatio: 0.09,
  visibleAreaRatio: 0.1,
  exactMasterRgbRatioWithinVisible: 1,
  wholeOverlapExactMasterRgbRatio: 0.95,
  meanAbsoluteRgbDifferenceWithinVisible: 0,
};

assert.equal(evaluateApprovedMasterLayerCanary({layerKind: "TYPOGRAPHY", metrics: base, outputOcrNormalized: "AI常常不说人话", masterOcrNormalized: "AI常常不说人话"}).status, "PASS");
const checkerboardRgb = evaluateApprovedMasterLayerCanary({layerKind: "TYPOGRAPHY", metrics: {...base, candidateSize: {width: 1671, height: 941}, candidateHasAlpha: false, transparentRatio: 0, visibleAreaRatio: 1, exactMasterRgbRatioWithinVisible: 0.00001}, outputOcrNormalized: "我一直以来用AI写稿的感受是AI常常不说人话", masterOcrNormalized: "AI常常不说人话"});
assert.equal(checkerboardRgb.status, "FAIL");
assert.ok(checkerboardRgb.failures.includes("FULL_CANVAS_DIMENSIONS_MISMATCH"));
assert.ok(checkerboardRgb.failures.includes("REAL_RGBA_ISOLATION_MISSING"));
assert.ok(checkerboardRgb.failures.includes("VISIBLE_COPY_DIFFERS_FROM_APPROVED_MASTER"));

assert.equal(evaluateApprovedMasterLayerCanary({layerKind: "BACKGROUND", metrics: {...base, transparentRatio: 0, partialAlphaRatio: 0, opaqueRatio: 1, wholeOverlapExactMasterRgbRatio: 0.92, meanAbsoluteRgbDifferenceWithinVisible: 2}}).status, "PASS");
const redrawnBackground = evaluateApprovedMasterLayerCanary({layerKind: "BACKGROUND", metrics: {...base, opaqueRatio: 0.9994, wholeOverlapExactMasterRgbRatio: 0.003, meanAbsoluteRgbDifferenceWithinVisible: 14.8}});
assert.equal(redrawnBackground.status, "FAIL");
assert.ok(redrawnBackground.failures.includes("BACKGROUND_PLATE_NOT_FULLY_OPAQUE"));
assert.ok(redrawnBackground.failures.includes("UNMASKED_APPROVED_MASTER_PIXELS_REDRAWN"));

assert.throws(() => queuePackageLayerGenerationJobs({production: {packagingBoundary: {contract: "A1EditorialPackagingBoundary/v1"}, shotIntelligence: {approvedMasterLayerCanaryAudit: {status: "FAIL_METHOD_INVALID"}, packageAssetKitPlans: [{shotId: "ED-X", current: true, authorityScope: "CURRENT", masterPreservationPolicy: {}}]}}}, "ED-X"), /package-layer-imagegen-extraction-retired-use-deterministic-master-mask-partition/u);

console.log(JSON.stringify({status: "PASS", checks: 5}, null, 2));
