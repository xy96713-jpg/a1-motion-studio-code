#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  A1_SEMANTIC_MOTION_STYLE_ROUTER_CONTRACT,
  auditSemanticMotionStyleSequence,
  compileSemanticMotionStylePlan,
  routeSemanticMotionStyle,
} from "../apps/studio-next/src/lib/a1-semantic-motion-style-router-v1.mjs";

const fixture = [
  {shotId: "fixture-identity", semanticRole: "IDENTITY", semanticJob: "建立产品身份", mode: "PRESENTER_OVERLAY"},
  {shotId: "fixture-verdict", semanticRole: "VERDICT", semanticJob: "给出关键判断", mode: "FULLSCREEN_TYPOGRAPHY"},
  {shotId: "fixture-confusion", semanticRole: "CONFUSION", semanticJob: "解释看不懂重点", mode: "EXPLAINER"},
  {shotId: "fixture-method", semanticRole: "METHOD", semanticJob: "材料、角度、动笔", mode: "EXPLAINER"},
  {shotId: "fixture-process", semanticRole: "BACKSTAGE_PROCESS", semanticJob: "后台编排", mode: "PRESENTER_OVERLAY"},
  {shotId: "fixture-source-edit", semanticRole: "SOURCE_EDIT", semanticJob: "真实录屏展示文档编辑", mode: "SCREEN_EVIDENCE"},
  {shotId: "fixture-source-save", semanticRole: "SOURCE_SAVE", semanticJob: "Command+S 保存", mode: "SCREEN_EVIDENCE"},
  {shotId: "fixture-conclusion", semanticRole: "CONCLUSION", semanticJob: "收束为可控工作流", mode: "PRESENTER_OVERLAY"},
];

const plan = compileSemanticMotionStylePlan(fixture);
assert.equal(plan.routes.length, fixture.length);
assert.equal(plan.audit.status, "PASS");
assert.equal(plan.routes[0].contract, A1_SEMANTIC_MOTION_STYLE_ROUTER_CONTRACT);
assert.equal(plan.routes[0].styleId, "editorial-identity-overlay");
assert.equal(plan.routes[3].styleId, "material-transform-explainer");
assert.equal(plan.routes[5].styleId, "source-evidence-focus-choreography");
assert.equal(plan.routes[6].styleId, "source-evidence-action-confirmation");
assert.equal(plan.routes[0].typography.sourceHanAllowed, false);
assert(plan.routes.every((route) => route.typography.generatedFormalTextAllowed === false));
assert(plan.routes.every((route) => route.rules.decorativeLineBudget === 0));
assert(plan.routes.filter((route) => route.mode.includes("PRESENTER")).every((route) => route.densityProfile !== "poster-dense"));
assert.notEqual(plan.routes[0].fingerprint, plan.routes[1].fingerprint);
assert.notEqual(plan.routes[2].fingerprint, plan.routes[3].fingerprint);

const duplicate = routeSemanticMotionStyle({semanticRole: "IDENTITY", mode: "PRESENTER_OVERLAY"});
const failed = auditSemanticMotionStyleSequence([duplicate, duplicate, duplicate]);
assert.equal(failed.status, "FAIL");
assert(failed.failures.some((failure) => failure.includes("same-primary-family-three-in-row")));
assert(failed.failures.some((failure) => failure.includes("duplicate-fingerprint-within-three")));

process.stdout.write(`${JSON.stringify({status: "PASS", planSha256: plan.planSha256, diversity: plan.audit.diversity, styleIds: plan.routes.map((route) => route.styleId)}, null, 2)}\n`);
