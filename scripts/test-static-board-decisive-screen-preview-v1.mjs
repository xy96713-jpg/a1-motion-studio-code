#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  focusCropFor,
  preferredScreenReviewPanel,
  preferredScreenStateBinding,
  sourcePreviewFor,
} from "./build-whole-film-static-board-pending-v1.mjs";

const resultLed = {
  route: "SCREEN_EVIDENCE",
  preview: {publicUrl: "/generated/system-line/fallback.png"},
  screenStateBindings: [
    {role: "ACTION", publicUrl: "/generated/system-line/action.png", sha256: "action-sha", focus: {x: 100, y: 100, width: 600, height: 260}},
    {role: "RESULT", publicUrl: "/generated/system-line/result.png", sha256: "result-sha", focus: {x: 480, y: 390, width: 980, height: 430}},
  ],
};
const selectedResult = preferredScreenStateBinding(resultLed);
assert.equal(selectedResult.role, "RESULT");
assert.equal(selectedResult.publicUrl, "/generated/system-line/result.png");
assert.deepEqual(sourcePreviewFor(resultLed), {
  publicUrl: "/generated/system-line/result.png",
  sha256: "result-sha",
  focus: {x: 480, y: 390, width: 980, height: 430},
  selectedStateRole: "RESULT",
  provenance: "CURRENT_SCREEN_RESULT_FOCUSED",
});

const actionFallback = {
  route: "SCREEN_EVIDENCE",
  screenStateBindings: [
    {role: "BEFORE", publicUrl: "/generated/system-line/before.png"},
    {role: "ACTION", publicUrl: "/generated/system-line/action.png"},
    {role: "RESULT", publicUrl: null},
  ],
};
assert.equal(preferredScreenStateBinding(actionFallback).role, "ACTION");
assert.equal(sourcePreviewFor(actionFallback).provenance, "CURRENT_SCREEN_ACTION_FOCUSED");

const noState = {
  route: "SCREEN_EVIDENCE",
  preview: {kind: "VERIFIED_SCREEN_SOURCE", publicUrl: "/generated/system-line/current.png", sha256: "current-sha"},
  screenStateBindings: [],
};
assert.equal(sourcePreviewFor(noState).publicUrl, "/generated/system-line/current.png");
assert.equal(sourcePreviewFor(noState).provenance, "VERIFIED_SCREEN_SOURCE");
assert.equal(preferredScreenStateBinding({route: "PACKAGE_LOOK_MASTER", screenStateBindings: resultLed.screenStateBindings}), null);

const reviewEntry = {
  sourcePlansSha256: "review-plan-sha",
  panels: [
    {state: "FOCUS", sourceFrame: {publicUrl: "/generated/system-line/focus.png", sha256: "focus-sha", frameMatchStatus: "PASS"}},
    {state: "RESULT", sourceFrame: {publicUrl: "/generated/system-line/review-result.png", sha256: "review-result-sha", frameMatchStatus: "PASS", focusRegion: {x: 0.25, y: 0.3, width: 0.5, height: 0.2}}},
  ],
};
assert.equal(preferredScreenReviewPanel(reviewEntry).state, "RESULT");
assert.deepEqual(sourcePreviewFor(noState, null, null, reviewEntry), {
  publicUrl: "/generated/system-line/review-result.png",
  sha256: "review-result-sha",
  focusNormalized: {x: 0.25, y: 0.3, width: 0.5, height: 0.2},
  focusDerived: false,
  selectedStateRole: "RESULT",
  provenance: "CURRENT_SCREEN_REVIEW_RESULT_FOCUSED",
  staticReviewManifestSha256: "review-plan-sha",
});

const crop = focusCropFor({
  focus: {x: 500, y: 350, width: 980, height: 460},
  sourceWidth: 1920,
  sourceHeight: 1080,
  targetWidth: 360,
  targetHeight: 202,
});
assert.ok(crop.left >= 0 && crop.top >= 0);
assert.ok(crop.left + crop.width <= 1920 && crop.top + crop.height <= 1080);
assert.ok(Math.abs(crop.width / crop.height - 360 / 202) < 0.01);
assert.ok(crop.left <= 500 && crop.top <= 350);
assert.ok(crop.left + crop.width >= 1480 && crop.top + crop.height >= 810);

console.log(JSON.stringify({
  status: "PASS",
  resultPriority: true,
  actionFallback: true,
  currentPreviewFallback: true,
  reviewResultPriority: true,
  boundedFocusCrop: crop,
}, null, 2));
