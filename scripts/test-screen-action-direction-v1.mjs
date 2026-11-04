#!/usr/bin/env node

import {compileScreenActionDirection} from "../apps/studio-next/src/lib/a1-continuous-screen-evidence-v2.mjs";

const assert = (condition, message) => {
  if (!condition) throw new Error(`screen-action-direction-v1:${message}`);
};

const region = (beat, x, y, width, height) => ({beat, focusRegion: {x, y, width, height}});
const directed = compileScreenActionDirection({
  durationMs: 6200,
  sourceActionId: "causalRewrite",
  pointerTelemetry: null,
  evidenceFrames: [
    region("selection", 0.28, 0.46, 0.39, 0.08),
    region("result", 0.76, 0.12, 0.2, 0.3),
  ],
});

assert(directed.contract === "A1ScreenActionDirection/v1", "contract");
assert(directed.grammar === "SELECT_EDIT_CONFIRM", "grammar");
assert(directed.cameraModel === "C4_BEZIER_EVENT_FOCUS_HOLD_V1", "camera-model");
assert(directed.rules.curveContinuity === "MINIMUM_JERK_BEZIER_POSITION_LOG_SCALE", "curve-continuity");
assert(directed.rules.sourceTimeMonotonic === true, "source-time-monotonic");
assert(directed.cameraTrack[0].scale === 1, "wide-establish");
assert(directed.cameraTrack.at(-1).scale > 1, "must-hold-result-not-restore");
assert(directed.cameraTrack.at(-1).atMs === 6200, "duration-bound");
assert(Math.max(...directed.cameraTrack.map((item) => item.scale)) <= 1.8, "zoom-bound");
assert(directed.attentionTrack.length === 2, "attention-targets");
assert(directed.rules.maximumPrimaryMoves === 2, "move-budget");

const unverified = compileScreenActionDirection({
  durationMs: 4000,
  sourceActionId: "historyIsolation",
  pointerTelemetry: null,
  evidenceFrames: [{beat: "context", focusRegion: null}],
});
assert(unverified.cameraTrack.every((item) => item.scale === 1 && item.x === 0.5 && item.y === 0.5), "no-target-must-not-drift");
assert(unverified.attentionTrack.length === 0, "no-fake-attention");

console.log(JSON.stringify({
  status: "PASS",
  cameraModel: directed.cameraModel,
  grammar: directed.grammar,
  directedMoves: new Set(directed.cameraTrack.map((item) => `${item.x}:${item.y}:${item.scale}`)).size - 1,
  unverifiedTargetMovement: false,
  forcedWideRestore: directed.rules.forcedWideRestore,
}, null, 2));
