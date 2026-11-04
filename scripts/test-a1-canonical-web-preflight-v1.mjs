#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertCanonicalWebPresentationRoute,
  headlineLayoutBudget,
  resolveCanonicalWebPresentationRoute,
} from "../apps/studio-next/src/lib/a1-canonical-web-preflight-v1.mjs";

const narrowPresenterContext = {availableRegions: [{id: "expanded-left", x: 0.04, y: 0.285, width: 0.33, height: 0.55}]};
const ed07Budget = headlineLayoutBudget("为什么不让它直接写完全文");
assert.equal(ed07Budget.lineCount, 2);
assert.ok(ed07Budget.requiredWidth > 0.33);

const blocked = resolveCanonicalWebPresentationRoute({
  shotId: "ED-07",
  visualRole: "PRESENTER_HEADLINE",
  assemblyMode: "OVERLAY",
  visibleCopy: "为什么不让它直接写完全文",
  videoContext: narrowPresenterContext,
});
assert.equal(blocked.status, "BLOCKED");
assert.equal(blocked.reasonCode, "HEADLINE_CAPACITY_INSUFFICIENT_FOR_OVERLAY");
assert.throws(() => assertCanonicalWebPresentationRoute(blocked), /canonical-web-preflight-blocked/u);

const takeover = resolveCanonicalWebPresentationRoute({
  shotId: "ED-07",
  visualRole: "PRESENTER_HEADLINE",
  assemblyMode: "OVERLAY",
  visibleCopy: "为什么不让它直接写完全文",
  videoContext: {...narrowPresenterContext, frameTakeoverAllowed: true},
});
assert.equal(takeover.status, "PASS");
assert.equal(takeover.resolvedAssemblyMode, "FULLSCREEN");
assert.equal(takeover.reasonCode, "HEADLINE_CAPACITY_REQUIRES_SHORT_TAKEOVER");
assert.equal(takeover.takeover.mode, "SHORT_TAKEOVER_1_2S");
assert.doesNotThrow(() => assertCanonicalWebPresentationRoute(takeover));
assert.throws(() => assertCanonicalWebPresentationRoute(takeover, {expectedAssemblyMode: "OVERLAY"}), /plan-recompile-required/u);

const declaredShortTakeover = resolveCanonicalWebPresentationRoute({
  shotId: "ED-07",
  visualRole: "PRESENTER_HEADLINE",
  assemblyMode: "FULLSCREEN",
  visibleCopy: "为什么不让它直接写完全文",
  videoContext: {...narrowPresenterContext, frameTakeoverAllowed: true, baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER"},
});
assert.equal(declaredShortTakeover.status, "PASS");
assert.equal(declaredShortTakeover.resolvedAssemblyMode, "FULLSCREEN");
assert.equal(declaredShortTakeover.reasonCode, "SHORT_TAKEOVER_DECLARED");
assert.equal(declaredShortTakeover.takeover.mode, "SHORT_TAKEOVER_1_2S");

const presenterPass = resolveCanonicalWebPresentationRoute({
  shotId: "ED-08",
  visualRole: "PRESENTER_HEADLINE",
  assemblyMode: "OVERLAY",
  visibleCopy: "AI 常常不说人话",
  videoContext: narrowPresenterContext,
});
assert.equal(presenterPass.status, "PASS");
assert.equal(presenterPass.resolvedAssemblyMode, "OVERLAY");

const ed13BlockedOverlay = resolveCanonicalWebPresentationRoute({
  shotId: "ED-13",
  visualRole: "PRESENTER_HEADLINE",
  assemblyMode: "OVERLAY",
  visibleCopy: "更顺一些 / 没解决",
  videoContext: narrowPresenterContext,
});
assert.equal(ed13BlockedOverlay.status, "BLOCKED");
assert.equal(ed13BlockedOverlay.budget.requiredWidth, 0.45);
const ed13ShortTakeover = resolveCanonicalWebPresentationRoute({
  shotId: "ED-13",
  visualRole: "PRESENTER_HEADLINE",
  assemblyMode: "OVERLAY",
  visibleCopy: "更顺一些 / 没解决",
  videoContext: {...narrowPresenterContext, frameTakeoverAllowed: true},
});
assert.equal(ed13ShortTakeover.status, "PASS");
assert.equal(ed13ShortTakeover.resolvedAssemblyMode, "FULLSCREEN");
assert.equal(ed13ShortTakeover.reasonCode, "HEADLINE_CAPACITY_REQUIRES_SHORT_TAKEOVER");

const fullscreenPass = resolveCanonicalWebPresentationRoute({
  shotId: "ED-19",
  visualRole: "HERO_TAKEOVER",
  assemblyMode: "FULLSCREEN",
  visibleCopy: "整理 / 编排 / 读取 / 检查",
  videoContext: {},
});
assert.equal(fullscreenPass.status, "PASS");
assert.equal(fullscreenPass.resolvedAssemblyMode, "FULLSCREEN");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1CanonicalWebPreflightTest/v1",
  ed07: {blockedWithoutTakeover: true, shortTakeoverSelected: true, requiredWidth: ed07Budget.requiredWidth},
  ed08Overlay: true,
  ed13ShortTakeover: true,
  ed19Fullscreen: true,
  imageGenCalls: 0,
  boardRebuilt: false,
  assemblyStarted: false,
}, null, 2));
