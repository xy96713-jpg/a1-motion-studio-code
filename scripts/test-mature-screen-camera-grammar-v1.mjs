#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileMatureScreenCameraGrammar} from "../apps/studio-next/src/lib/a1-mature-screen-camera-grammar-v1.mjs";

const moveTrack = ({durationMs, startMs, endMs, anchor, scale, beatId}) => [
  {atMs: 0, x: .5, y: .5, scale: 1, easingToNext: "hold", phase: "HOLD", beatId: null},
  {atMs: startMs, x: .5, y: .5, scale: 1, easingToNext: "cinematic-in", phase: "MOVE_START", beatId},
  {atMs: endMs, x: anchor.x, y: anchor.y, scale, easingToNext: "hold", phase: "SETTLED_HOLD", beatId},
  {atMs: durationMs, x: anchor.x, y: anchor.y, scale, easingToNext: "hold", phase: "HOLD_END", beatId},
];

const fixtures = [
  {
    id: "dense-editorial-workbench",
    durationMs: 5_800,
    cameraTrack: moveTrack({durationMs: 5_800, startMs: 900, endMs: 1_320, anchor: {x: .5, y: .55}, scale: 1.24, beatId: "editor-result"}),
    attentionTrack: [{beat: "editor-result", region: {x: .2, y: .32, width: .6, height: .42}}],
    expectedGrammar: "ANCHOR_PUSH",
  },
  {
    id: "analytics-dashboard",
    durationMs: 7_000,
    cameraTrack: [
      {atMs: 0, x: .5, y: .5, scale: 1, easingToNext: "hold", phase: "HOLD", beatId: null},
      {atMs: 700, x: .5, y: .5, scale: 1, easingToNext: "cinematic-in", phase: "MOVE_START", beatId: "filter-action"},
      {atMs: 1_040, x: .28, y: .42, scale: 1.16, easingToNext: "hold", phase: "SETTLED_HOLD", beatId: "filter-action"},
      {atMs: 3_240, x: .28, y: .42, scale: 1.16, easingToNext: "glide", phase: "MOVE_START", beatId: "insight-result"},
      {atMs: 3_620, x: .86, y: .48, scale: 1.28, easingToNext: "hold", phase: "SETTLED_HOLD", beatId: "insight-result"},
      {atMs: 7_000, x: .86, y: .48, scale: 1.28, easingToNext: "hold", phase: "HOLD_END", beatId: "insight-result"}
    ],
    attentionTrack: [{beat: "insight-result", region: {x: .73, y: .28, width: .25, height: .42}}],
    expectedGrammar: "WIDE_RESET_THEN_PUSH",
  },
  {
    id: "form-driven-admin",
    durationMs: 6_200,
    cameraTrack: moveTrack({durationMs: 6_200, startMs: 1_000, endMs: 1_420, anchor: {x: .5, y: .88}, scale: 1.3, beatId: "submit-result"}),
    attentionTrack: [{beat: "submit-result", region: {x: .28, y: .75, width: .44, height: .23}}],
    expectedGrammar: "ANCHOR_PUSH",
  },
];

const results = fixtures.map((fixture) => {
  const compiled = compileMatureScreenCameraGrammar(fixture);
  assert.equal(compiled.status, "PASS", `${fixture.id}:${compiled.failures.join(",")}`);
  assert.ok(compiled.decisions.some((decision) => decision.grammar === fixture.expectedGrammar), fixture.id);
  assert.equal(compiled.motionBlur.kind, "TEMPORAL_CAMERA_ONLY", fixture.id);
  assert.equal(compiled.motionBlur.samples, 6, fixture.id);
  assert.ok(compiled.summary.maximumAnchorDriftPx < .01, fixture.id);
  assert.ok(compiled.audits.every((audit) => audit.roiVisible === true), fixture.id);
  assert.ok(compiled.summary.resultHoldMs >= 900, fixture.id);
  assert.ok(compiled.cameraTrack.some((keyframe) => keyframe.phase === "ANCHOR_RETURN_START" && keyframe.easingToNext === "cinematic-return"), fixture.id);
  return {id: fixture.id, genre: fixture.id, status: compiled.status, decisions: compiled.decisions, summary: compiled.summary, motionBlur: compiled.motionBlur};
});

const noCamera = compileMatureScreenCameraGrammar({
  durationMs: 2_400,
  cameraTrack: [
    {atMs: 0, x: .5, y: .5, scale: 1, easingToNext: "hold", phase: "HOLD", beatId: null},
    {atMs: 2_400, x: .5, y: .5, scale: 1, easingToNext: "hold", phase: "HOLD_END", beatId: null},
  ],
  attentionTrack: [],
});
assert.equal(noCamera.status, "PASS");
assert.equal(noCamera.motionBlur.kind, "NONE");
assert.equal(noCamera.summary.finalGrammar, "NO_CAMERA");

console.log(JSON.stringify({contract: "A1MatureScreenCameraGrammarTest/v1", status: "PASS", fixtures: results, noCamera: noCamera.summary}, null, 2));
