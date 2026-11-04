#!/usr/bin/env node
import assert from "node:assert/strict";
import {auditSourcePointerBinding} from "./lib/a1-screen-pointer-provenance-v1.mjs";

const capture = {
  cursorPixelPolicy: "CAP_NATIVE_CURSOR_REPLAY_FROM_SOURCE_EVENTS",
  sourcePointerReplay: {contract:"A1CapSourcePointerReplay/v1",renderStage:"CAP_NATIVE_CURSOR_LAYER",interpolation:"RAW_CAPTURED_EVENT_POINTS"},
  sourcePointerTimeOrigin: {alignmentUncertaintyMs: .8},
  sourcePointerEvents: [
    {type: "pointermove", isTrusted: true, pointerType: "mouse", pagePerformanceTimeMs: 10, captureTimeMs: 10, cssX: 25, cssY: 30},
    {type: "pointerdown", isTrusted: true, pointerType: "mouse", pagePerformanceTimeMs: 100, captureTimeMs: 100, cssX: 50, cssY: 60,cursorCss:"pointer",displayedCursorStyle:"CAP_OFFICIAL_BROWSER_MATCHED"},
    {type: "pointerup", isTrusted: true, pointerType: "mouse", pagePerformanceTimeMs: 140, captureTimeMs: 140, cssX: 50, cssY: 60,cursorCss:"pointer",displayedCursorStyle:"CAP_OFFICIAL_BROWSER_MATCHED"},
  ],
  clickTargetProof: [{event: "save", clickAtMs: 100, insideTarget: true, pointerCss: {x:50,y:60}, targetRectCss: {x: 40, y: 50, width: 30, height: 20}}],
};
const receipt = {sourcePointerEvidence: {policy: capture.cursorPixelPolicy, capCursorOverlay: "CAP_NATIVE_ASSET_REPLAY", trustedMouseDownCount:1, captureEventCount:3, assetHashes: {"0":"a","2":"b"}}, feedback: {cursorOverlay: "CAP_NATIVE_ASSET_NO_SPRING_OR_BLUR"}};
const config = {cursor: {hide: false, raw: true, size: 68, motionBlur: 0, clickSpring: null}};
const pass = auditSourcePointerBinding({capture, receipt, config});
assert.equal(pass.status, "PASS_REVIEW_ONLY");
assert.equal(pass.eventCounts.verifiedClickTargets, 1);
const moved = structuredClone(capture);moved.sourcePointerEvents[1].cssX = 92;
assert.ok(auditSourcePointerBinding({capture: moved, receipt, config}).failures.includes("SOURCE_MOUSE_MISSES_TARGET:save"));
const stale = structuredClone(capture);stale.sourcePointerEvents[1].captureTimeMs = 220;
assert.ok(auditSourcePointerBinding({capture: stale, receipt, config}).failures.includes("CLICK_SOURCE_EVENT_MISSING_OR_AMBIGUOUS:save"));
const hidden = structuredClone(capture);hidden.sourcePointerEvents[1].cursorCss = "none";
const hiddenProof = auditSourcePointerBinding({capture: hidden, receipt, config});
assert.ok(hiddenProof.failures.includes("TARGET_HIDES_NATIVE_CURSOR:save"));
const synthetic = structuredClone(receipt);synthetic.feedback.cursorOverlay = "CAP_SPRING_REDRAW";
assert.ok(auditSourcePointerBinding({capture, receipt: synthetic, config}).failures.includes("SOURCE_EVENT_NATIVE_CURSOR_POLICY_MISMATCH"));
const absent = structuredClone(capture);absent.cursorPixelPolicy = "SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY";
assert.ok(auditSourcePointerBinding({capture: absent, receipt, config}).failures.includes("SOURCE_CURSOR_REPLAY_POLICY_MISSING"));
console.log(JSON.stringify({contract:"A1ScreenPointerProvenanceTest/v1",status:"PASS",cases:6,scope:"BINDING_FAULTS_ONLY",visualAcceptance:"NOT_REVIEWED"}));
