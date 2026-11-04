#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileScreenCoveragePlan} from "../apps/studio-next/src/lib/a1-screen-coverage-director-v1.mjs";

const fixtures = [
  {genre: "preference-judgment", actionId: "negativePreferenceRecord", durationMs: 10340, firstMs: 5000, resultMs: 8139, family: {id: "JUDGMENT_STATE_COMPARE", target: "FIRST"}},
  {genre: "paragraph-expansion", actionId: "paragraph", durationMs: 12940, firstMs: 5160, resultMs: 11231, family: {id: "GAP_EXPANSION", target: "LAST"}},
  {genre: "review-findings", actionId: "review", durationMs: 5960, firstMs: 815, resultMs: 4790, family: {id: "RESULT_PANEL_REVEAL", target: "LAST"}},
  {genre: "presentation-state", actionId: "presentation", durationMs: 4830, firstMs: 1200, resultMs: 3760, family: {id: "FULLSCREEN_RESULT_TRANSITION", target: "NONE"}},
  {genre: "short-selection-rewrite", actionId: "causalRewrite", durationMs: 1987, firstMs: 420, resultMs: 1120, family: {id: "SELECTION_REPLACEMENT", target: "FIRST"}},
];

const plans = fixtures.map((fixture) => compileScreenCoveragePlan({
  actionId: fixture.actionId,
  durationMs: fixture.durationMs,
  interactions: [{anchorMs: fixture.firstMs, geometry: {x: .34, y: .42, width: .2, height: .12}}],
  resultHold: {startMs: fixture.resultMs, endMs: fixture.durationMs, durationMs: fixture.durationMs - fixture.resultMs},
  directorFamily: fixture.family,
  resultRegion: fixture.family.target === "NONE" ? null : {x: .62, y: .58, width: .24, height: .2},
}));

assert.ok(plans.every((plan) => plan.status === "PASS" && plan.poses.length >= 2 && plan.poses.length <= 3));
assert.ok(plans.every((plan) => plan.poses.map((pose) => pose.transition).every((item) => item === "HARD_CUT")));
assert.ok(plans.every((plan) => plan.poses.at(-1).atMs <= plan.durationMs - 800));
assert.ok(plans.slice(0, 3).every((plan) => plan.strategy === "WIDE_MEDIUM_RESULT_COVERAGE"));
assert.deepEqual(plans.slice(0, 3).map((plan) => plan.poses.slice(1).map((pose) => pose.scale)), [[1.24, 1.42], [1.38, 1.58], [1.22, 1.48]]);
assert.equal(new Set(plans.slice(0, 3).map((plan) => plan.poses[1].atMs)).size, 3);
assert.ok(plans.slice(0, 3).every((plan) => plan.resultRegionSource === "VERIFIED_PIXEL_DELTA" && plan.poses[2].center.x === .74 && plan.poses[2].center.y === .68));
assert.equal(plans[3].strategy, "WIDE_TO_STABLE_STATE_CUT");
assert.ok(plans[3].poses.every((pose) => pose.scale === 1));
assert.equal(plans[4].strategy, "MEDIUM_RESULT_COVERAGE_SHORT");
assert.deepEqual(plans[4].poses.map((pose) => pose.id), ["MEDIUM_ACTION", "RESULT_DETAIL"]);
assert.deepEqual(plans[4].poses.map((pose) => pose.scale), [1.44, 1.6]);
assert.equal(plans[4].poses.at(-1).atMs, 1120);
assert.throws(() => compileScreenCoveragePlan({actionId: "review", durationMs: 4000, interactions: [], resultHold: {startMs: 3000}, directorFamily: {target: "LAST"}}), /action-region-required/);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ScreenCoverageDirectorTest/v1",
  genres: fixtures.map((item) => item.genre),
  coverageShas: plans.map((item) => item.coverageSha256),
  failClosedWithoutActionRegion: true,
}, null, 2));
