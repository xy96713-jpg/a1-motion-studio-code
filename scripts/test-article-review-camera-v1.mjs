import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {compileArticleReviewCamera, assertContinuousCameraTrack} from "./lib/compile-article-review-camera-v1.mjs";
const require = createRequire(new URL("../remotion-renderer/package.json", import.meta.url));
const {Easing} = require("remotion");
const base = new URL("../work/screen-recording-maturity-test-v1/", import.meta.url);
const report = JSON.parse(fs.readFileSync(new URL("blind-test-v1/capture/blind-nasa-ocean-v2/capture-report.json", base)));
const plan = JSON.parse(fs.readFileSync(new URL("article-effect-readiness-v1/nasa-article-effect-execution-plan-v1.json", base)));
const entries = plan.entries.filter((entry) => ["SEMANTIC_PUSH", "DETAIL_DOLLY_IN_OUT"].includes(entry.effectId));
const {track, moves} = compileArticleReviewCamera({entries, report, durationMs: report.output.durationMs});
assertContinuousCameraTrack(track);
// This exact former defect must remain rejected, regardless of the zoom magnitude.
assert.throws(() => assertContinuousCameraTrack([{atMs: 0, x: .5, y: .5, scale: 1, easingToNext: "hold"}, {atMs: 9663, x: .576, y: .424, scale: 1.18}]), /camera-jump-after-hold/);
const at = (ms) => {
  const next = track.findIndex((row) => row.atMs > ms);
  if (next < 0) return track.at(-1);
  const a = track[Math.max(0, next - 1)], b = track[next];
  if (a.easingToNext === "hold") return a;
  const t = (ms - a.atMs) / (b.atMs - a.atMs);
  const u = a.easingToNext === "restore" ? t*t*t*(10-15*t+6*t*t) : Easing.bezier(.65, 0, .35, 1)(t);
  return {x: a.x + (b.x-a.x)*u, y: a.y+(b.y-a.y)*u, scale: Math.exp(Math.log(a.scale)+(Math.log(b.scale)-Math.log(a.scale))*u)};
};
let maxFrameScaleDelta = 0;
for (let frame = 1; frame < report.output.durationMs / 1000 * 60; frame++) {
  maxFrameScaleDelta = Math.max(maxFrameScaleDelta, Math.abs(at(frame/60*1000).scale-at((frame-1)/60*1000).scale));
}
assert.ok(maxFrameScaleDelta < .012, `one-frame-scale-jump:${maxFrameScaleDelta}`);
for (const move of moves) {
  assert.equal(at(move.startMs).scale, 1);
  assert.ok(at(move.startMs + 350).scale > 1.04 && at(move.startMs + 350).scale < move.maximumScale);
  assert.ok(Math.abs(at(move.peakMs + 400).scale - move.maximumScale) < 1e-8);
  assert.equal(at(move.endMs).scale, 1);
}
assert.throws(() => compileArticleReviewCamera({entries, report, durationMs: 11000}), /camera-window-overlap/);
console.log(JSON.stringify({status: "PASS", oldJumpRejected: true, maxFrameScaleDelta, moves, finalScale: at(17500).scale}, null, 2));
