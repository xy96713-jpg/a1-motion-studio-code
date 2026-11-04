#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileArticleEffectRoute} from "./lib/compile-article-effect-route-v1.mjs";

const baseScenario = {id: "test-article", discovery: {confidence: {route: .9, image: .9, body: .9, root: .9}}};
const baseReport = {contract: "A1GenericBrowserScreenProof/v1", status: "READY_FOR_CAP_REVIEW", output: {fullDecodePass: true}, geometryTruth: {status: "PASS_REVIEW_ONLY", targets: [{targetKey: "paragraph", kind: "TEXT", sourceRect: {x: .2, y: .2, width: .5, height: .2}, lineRects: new Array(9).fill({x: .2, y: .2, width: .4, height: .02})}, {targetKey: "image", kind: "REGION", sourceRect: {x: .3, y: .5, width: .3, height: .2}, detailRect: {x: .34, y: .56, width: .08, height: .07}, lineRects: []}]}, scrollTelemetry: [{event: "scroll-a", velocityPxPerMs: .1}, {event: "scroll-a", velocityPxPerMs: 0}], cursorTelemetry: {moves: [], clicks: []}, dragTelemetry: []};
const article = compileArticleEffectRoute({scenario: baseScenario, report: baseReport});
assert.equal(article.status, "ROUTE_COMPILED_REVIEW_ONLY");
assert.ok(article.eligible.some((row) => row.id === "SCROLL_BRAKE"));
assert.ok(article.eligible.some((row) => row.id === "DETAIL_LENS"));
assert.ok(article.blocked.some((row) => row.id === "BEFORE_AFTER_SPLIT"));
assert.ok(article.blocked.some((row) => row.id === "CLICK_BOUNCE"));
const declaredOnly = compileArticleEffectRoute({scenario: {...baseScenario, comparisonEvidence: {before: {}, after: {}}}, report: baseReport});
assert.ok(declaredOnly.blocked.some((row) => row.id === "BEFORE_AFTER_SPLIT"));
const withBeforeAfter = compileArticleEffectRoute({scenario: baseScenario, report: {...baseReport, comparisonEvidence: {verified: true, before: {sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, after: {sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}, sharedGeometry: {sourceSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", frameId: "frame-1"}}}});
assert.ok(withBeforeAfter.eligible.some((row) => row.id === "BEFORE_AFTER_SPLIT"));
const fakeComparison = compileArticleEffectRoute({scenario: baseScenario, report: {...baseReport, comparisonEvidence: {before: {sha256: "not-a-hash"}, after: {path: "/missing.png"}, sharedGeometry: {frameId: "made-up"}}}});
assert.ok(fakeComparison.blocked.some((row) => row.id === "BEFORE_AFTER_SPLIT"));
const noDetailRoi = compileArticleEffectRoute({scenario: baseScenario, report: {...baseReport, geometryTruth: {...baseReport.geometryTruth, targets: baseReport.geometryTruth.targets.map((target) => ({...target, detailRect: undefined}))}}});
assert.ok(noDetailRoi.blocked.some((row) => row.id === "DETAIL_DOLLY_IN_OUT"));
console.log(JSON.stringify({status: "PASS", tests: ["article-baseline-effects-eligible", "missing-interaction-effects-blocked", "declared-comparison-is-not-evidence", "real-comparison-evidence-unblocks", "fake-comparison-evidence-blocked"]}));
