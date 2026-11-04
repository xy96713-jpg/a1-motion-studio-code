#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileArticleEffectRoute} from "./lib/compile-article-effect-route-v1.mjs";
import {compileArticleEffectExecutionPlan} from "./lib/compile-article-effect-execution-plan-v1.mjs";

const scenario = {id: "test-article", discovery: {confidence: {route: .9, image: .9, body: .9, root: .9}}, directorPlan: {beats: [{id: "hero-beat", technique: "ESTABLISH_WIDE", event: "hero"}, {id: "evidence-beat", technique: "EVIDENCE_UNDERLINE", event: "evidence"}]}};
const report = {contract: "A1GenericBrowserScreenProof/v1", status: "READY_FOR_CAP_REVIEW", output: {fullDecodePass: true}, events: [{name: "hero", type: "observation", tMs: 700}, {name: "image", type: "scroll-target", tMs: 4600}, {name: "evidence", type: "scroll-target", tMs: 15000}], geometryTruth: {status: "PASS_REVIEW_ONLY", targets: [{targetKey: "hero", event: "hero", kind: "TEXT", sourceRect: {x: .2, y: .2, width: .5, height: .1}, lineRects: []}, {targetKey: "image", event: "image", kind: "REGION", sourceRect: {x: .3, y: .3, width: .3, height: .2}, detailRect: {x: .36, y: .36, width: .08, height: .06}, lineRects: []}, {targetKey: "evidence", event: "evidence", kind: "TEXT", sourceRect: {x: .2, y: .5, width: .5, height: .1}, lineRects: [{x: .2, y: .5, width: .5, height: .02}]}]}, scrollTelemetry: [{event: "scroll-a", velocityPxPerMs: 0}]};
const route = compileArticleEffectRoute({scenario, report});
const plan = compileArticleEffectExecutionPlan({scenario, report, route});
assert.equal(plan.status, "READY_FOR_REVIEW_EXECUTION");
assert.ok(plan.entries.some((entry) => entry.effectId === "EVIDENCE_UNDERLINE" && entry.target.lineRects.length === 1));
assert.ok(plan.entries.some((entry) => entry.effectId === "ESTABLISH_WIDE" && entry.beatId === "hero-beat"));
assert.ok(plan.entries.every((entry) => entry.timing.atMs >= 0));
const duplicateBeats = compileArticleEffectExecutionPlan({scenario: {...scenario, directorPlan: {beats: [{id: "p1", technique: "SEMANTIC_PUSH", event: "hero"}, {id: "p2", technique: "SEMANTIC_PUSH", event: "evidence"}]}}, report, route});
assert.deepEqual(duplicateBeats.entries.filter((entry) => entry.effectId === "SEMANTIC_PUSH").map((entry) => [entry.beatId, entry.event]), [["p1", "hero"], ["p2", "evidence"]]);
const unknown = compileArticleEffectExecutionPlan({scenario: {...scenario, directorPlan: {beats: [{id: "unknown", technique: "UNIMPLEMENTED_EFFECT", event: "hero"}]}}, report, route});
assert.equal(unknown.status, "BLOCKED_UNSUPPORTED_EFFECT");
const missingTarget = compileArticleEffectExecutionPlan({scenario: {...scenario, directorPlan: {beats: [{id: "missing", technique: "SEMANTIC_PUSH", event: "missing-event"}]}}, report, route});
assert.equal(missingTarget.status, "BLOCKED_REQUIRED_EVIDENCE");
const unsupportedExecutor = compileArticleEffectExecutionPlan({scenario: {...scenario, directorPlan: {beats: [{id: "focus", technique: "FOCUS_DIM", event: "hero"}]}}, report, route});
assert.equal(unsupportedExecutor.status, "BLOCKED_REQUIRED_EVIDENCE");
const incomplete = compileArticleEffectExecutionPlan({scenario, report: {...report, geometryTruth: {status: "PASS_REVIEW_ONLY", targets: []}}, route});
assert.equal(incomplete.status, "BLOCKED_REQUIRED_EVIDENCE");
assert.ok(incomplete.blocked.length > 0);
console.log(JSON.stringify({status: "PASS", tests: ["events-bind-to-geometry", "annotation-preserves-line-rects", "review-only-plan-has-timing", "duplicate-beats-preserved", "unknown-effects-blocked", "missing-targets-blocked", "unsupported-executors-blocked", "missing-geometry-blocks-plan"]}));
