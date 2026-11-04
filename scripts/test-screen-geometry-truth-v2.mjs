#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  auditScreenGeometryTruth,
  buildScreenGeometryFrame,
  compileScreenGeometryTruth,
  cssRectToSourcePixels,
  validateScreenGeometryStability,
} from "../apps/studio-next/src/lib/a1-screen-geometry-truth-v2.mjs";

const sourceSha256 = "a".repeat(64);
const source = {width: 2560, height: 1440};
const frame = buildScreenGeometryFrame({
  sourceWidth: source.width,
  sourceHeight: source.height,
  viewportCss: {x: 0, y: 0, width: 1280, height: 720},
  captureRectCss: {x: 0, y: 0, width: 1280, height: 720},
  devicePixelRatio: 2,
  pageZoom: 1.25,
  visualViewport: {offsetX: 0, offsetY: 240, scale: 1, zoom: 1.25, width: 1280, height: 720},
  scroll: {x: 0, y: 240},
  screenshotScale: "device",
  pointPixelScale: {x: 2, y: 2},
  frameId: "frame-001",
});
assert.equal(frame.contract, "A1ScreenGeometryFrame/v2");
const mapped = cssRectToSourcePixels({x: 320, y: 180, width: 240, height: 48}, frame);
assert.deepEqual(mapped.visible, {x: 640, y: 360, width: 480, height: 96});

const truth = compileScreenGeometryTruth({
  sourceSha256,
  source,
  frame,
  targets: [{
    targetKey: "result-text",
    kind: "TEXT",
    selector: "#result",
    identity: {text: "真实结果", nodeToken: "result-1"},
    confidence: 1,
    observedAtMs: 1200,
    lineRectsCss: [{x: 320, y: 180, width: 240, height: 48}, {x: 320, y: 238, width: 190, height: 48}],
  }],
});
assert.equal(truth.status, "PASS_REVIEW_ONLY");
assert.equal(truth.targets[0].lineRects.length, 2);
assert.equal(auditScreenGeometryTruth(truth, {sourceSha256, sourceWidth: 2560, sourceHeight: 1440, targetKey: "result-text"}).status, "PASS");

const drift = validateScreenGeometryStability({
  sourceWidth: source.width,
  sourceHeight: source.height,
  observations: [
    {sourceRect: {x: 640, y: 360, width: 480, height: 96}},
    {sourceRect: {x: 641, y: 361, width: 479, height: 96}},
    {sourceRect: {x: 642, y: 362, width: 480, height: 95}},
  ],
});
assert.equal(drift.status, "PASS");
const unsafe = compileScreenGeometryTruth({
  sourceSha256,
  source,
  frame,
  targets: [{targetKey: "low-confidence", kind: "UI", rectCss: {x: 20, y: 20, width: 100, height: 40}, confidence: .7}],
});
assert.equal(unsafe.status, "FALLBACK_CLEAN_SOURCE");
assert.ok(unsafe.failures.includes("TARGET_CONFIDENCE_REQUIRED:low-confidence"));
const badDrift = validateScreenGeometryStability({
  sourceWidth: source.width,
  sourceHeight: source.height,
  observations: [{sourceRect: {x: 0, y: 0, width: 200, height: 100}}, {sourceRect: {x: 20, y: 0, width: 200, height: 100}}],
});
assert.equal(badDrift.status, "FALLBACK_CLEAN_SOURCE");

console.log(JSON.stringify({
  contract: "A1ScreenGeometryTruthTest/v1",
  status: "PASS",
  checks: {
    cssToDevicePixelMapping: true,
    pageZoomAndScrollRecorded: true,
    lineRectsPreserved: true,
    sourceShaBound: true,
    confidenceFallback: true,
    temporalStability: true,
    temporalDriftFallback: true,
  },
}, null, 2));
