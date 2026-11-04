#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertLocalVideoSegmentIndex, compileLocalVideoSegmentIndex} from "../apps/studio-next/src/lib/a1-local-video-segment-index-v1.mjs";

const sha = (letter) => letter.repeat(64);
const valid = compileLocalVideoSegmentIndex({
  id: "fixture",
  source: {path: "/source.mp4", sha256: sha("a"), rights: "REFERENCE_REVIEW_ONLY", referenceOnly: true},
  clip: {path: "/clip.mp4", sha256: sha("b"), sourceInMs: 10000, sourceOutMs: 20000},
  media: {durationMs: 10000, fps: 25, width: 640, height: 360, hasAudio: true},
  query: {text: "person interview product", ocrTerms: ["interview"], requiresPerson: true, viewerTask: "Find the relevant interview", narrativeRole: "IDENTITY", minimumMs: 3000, maximumMs: 7000},
  analysis: {
    scenes: [{id: "scene-1", startMs: 0, endMs: 4200}, {id: "scene-2", startMs: 4200, endMs: 10000}],
    transcript: [{startMs: 200, endMs: 3900, text: "person interview"}, {startMs: 4500, endMs: 9000, text: "unrelated room"}],
    keyframes: [{id: "frame-1", sceneId: "scene-1", atMs: 2100, path: "/frame-1.png", sha256: sha("c"), visualScore: .72, attentionSalience: .1, personConfidence: .9, ocrText: "interview"}, {id: "frame-2", sceneId: "scene-2", atMs: 7000, path: "/frame-2.png", sha256: sha("d"), visualScore: .2, attentionSalience: .8, personConfidence: .1, ocrText: "other"}],
    toolchain: {scene: "test", transcript: "test", visual: "test"},
  },
});
assert.equal(valid.status, "READY_FOR_REVIEW");
assert.equal(valid.selected.scene.id, "scene-1");
assert.equal(valid.selected.selectedRange.absoluteSourceInMs, 10000);
assert.equal(valid.boundaries.sourceOrderPreserved, true);
assertLocalVideoSegmentIndex(valid);

const authorityUpgrade = compileLocalVideoSegmentIndex({
  ...valid,
  source: {...valid.source, referenceOnly: false},
});
assert.equal(authorityUpgrade.status, "BLOCKED");
assert.ok(authorityUpgrade.failures.includes("QUALIFICATION_SOURCE_MUST_REMAIN_REFERENCE_ONLY"));

const badScene = compileLocalVideoSegmentIndex({
  ...valid,
  analysis: {...valid.analysis, scenes: [{id: "scene-1", startMs: 9000, endMs: 12000}]},
});
assert.equal(badScene.status, "BLOCKED");
assert.ok(badScene.failures.includes("SCENE_RANGE_INVALID"));

const missingFrame = compileLocalVideoSegmentIndex({
  ...valid,
  analysis: {...valid.analysis, keyframes: []},
});
assert.equal(missingFrame.status, "BLOCKED");
assert.ok(missingFrame.failures.includes("KEYFRAME_COVERAGE_INSUFFICIENT"));

assert.throws(() => assertLocalVideoSegmentIndex({...valid, indexSha256: sha("f")}), /sha-invalid/u);

console.log(JSON.stringify({contract: "A1LocalVideoSegmentIndexTest/v1", status: "PASS", selected: valid.selected, blockedChecks: [authorityUpgrade.failures, badScene.failures, missingFrame.failures]}, null, 2));
