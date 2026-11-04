#!/usr/bin/env node

import assert from "node:assert/strict";
import {compileSemanticGlyphBehaviorPlan, compileSemanticGlyphSequence} from "../apps/studio-next/src/lib/a1-semantic-glyph-behavior-router-v1.mjs";

const sequence = compileSemanticGlyphSequence([
  {id: "case-a", genre: "evidence-explainer", role: "EVIDENCE", narrativeVerb: "verify", carrier: "FULLSCREEN_TYPE", copy: "来源改变结论"},
  {id: "case-b", genre: "product-tutorial", role: "PROCESS", narrativeVerb: "transform", carrier: "FULLSCREEN_TYPE", copy: "把步骤连成系统"},
  {id: "case-c", genre: "personal-opinion", role: "VERDICT", narrativeVerb: "challenge", carrier: "FULLSCREEN_TYPE", copy: "速度不代表判断"},
  {id: "case-d", genre: "evidence-explainer", role: "EVIDENCE", narrativeVerb: "verify", carrier: "FULLSCREEN_TYPE", copy: "证据还要复核"},
  {id: "case-e", genre: "evidence-explainer", role: "EVIDENCE", narrativeVerb: "verify", carrier: "FULLSCREEN_TYPE", copy: "第二来源补充"},
  {id: "case-f", genre: "product-tutorial", role: "PROCESS", narrativeVerb: "flow", carrier: "FULLSCREEN_TYPE", copy: "输入流向结果"},
]);

assert.equal(sequence.length, 6);
assert.equal(sequence[0].behaviorId, "PRINT_REGISTRATION");
assert.equal(sequence[1].behaviorId, "SPLICE_REASSEMBLE");
assert.equal(sequence[2].behaviorId, "AXIS_RESPONSIVE");
assert.equal(sequence[4].behaviorId, "LOCAL_GRADIENT");
assert.equal(sequence[5].behaviorId, "BASELINE_CASCADE");
assert(sequence.every((plan, index) => index === 0 || plan.behaviorId !== sequence[index - 1].behaviorId));
assert(sequence.every((plan) => plan.circleGeometryAllowed === false && plan.authoredSceneElementsAllowed === false && plan.outputMode === "TRANSPARENT_GLYPH_ASSET"));

const focus = compileSemanticGlyphBehaviorPlan({id: "counter-focus", genre: "evidence-explainer", role: "EVIDENCE", narrativeVerb: "explain", carrier: "FULLSCREEN_TYPE", copy: "检查字腔细节", semanticIntents: ["focus"], allowLens: true});
assert.equal(focus.behaviorId, "COUNTERFORM_REVEAL");
assert.equal(focus.circleGeometryAllowed, false);
const marker = compileSemanticGlyphBehaviorPlan({id: "marker", genre: "product-tutorial", role: "MARKER", narrativeVerb: "label", carrier: "PRESENTER", copy: "状态已锁定"});
assert.equal(marker.behaviorId, "PIXEL_TRACKING_LOCK");

console.log(JSON.stringify({contract: "A1SemanticGlyphBehaviorRouterTest/v1", status: "PASS", caseCount: sequence.length + 2, routedBehaviors: sequence.map((plan) => plan.behaviorId), checks: ["semantic-verb-routing", "role-fallback", "sequence-repeat-avoidance", "counterform-not-lens", "pixel-marker", "transparent-glyph-only", "no-production-admission"]}, null, 2));
