#!/usr/bin/env node

import assert from "node:assert/strict";
import {resolveMatureScreenPostPolicy} from "../apps/studio-next/src/lib/a1-mature-screen-post-policy-v1.mjs";
import {selectMatureScreenMotionTechniques} from "../apps/studio-next/src/lib/a1-screen-motion-technique-selector-v2.mjs";

const smallTarget = {x: 0.58, y: 0.44, width: 0.16, height: 0.08};
const focusTarget = {x: 0.54, y: 0.4, width: 0.2, height: 0.12};
const largeTarget = {x: 0.42, y: 0.2, width: 0.48, height: 0.46};

const fixtures = [
  {
    id: "document-editor",
    genre: "document-editor",
    result: resolveMatureScreenPostPolicy({shotFunction: "ACTION", primaryTarget: smallTarget, nativeActionReadable: true, cursorIsDecisive: true, explicitEmphasisRequired: false}),
    expected: {cursor: "NONE", camera: "NONE", emphasis: "NONE", transition: "NONE"},
  },
  {
    id: "learning-workflow",
    genre: "learning-workflow",
    result: resolveMatureScreenPostPolicy({shotFunction: "ACTION", primaryTarget: smallTarget, cursorIsDecisive: true, explicitEmphasisRequired: false}),
    expected: {cursor: "TELEMETRY_BOUND_TRANSIENT", camera: "NONE", emphasis: "NONE", transition: "NONE"},
  },
  {
    id: "portfolio-navigation",
    genre: "portfolio-navigation",
    result: resolveMatureScreenPostPolicy({shotFunction: "ACTION", primaryTarget: largeTarget, nativeActionReadable: true, cursorIsDecisive: false, explicitEmphasisRequired: false}),
    expected: {cursor: "NONE", camera: "NONE", emphasis: "NONE", transition: "NONE"},
  },
];

for (const fixture of fixtures) {
  assert.equal(fixture.result.status, "PASS");
  assert.equal(fixture.result.decision.cursor.mode, fixture.expected.cursor);
  assert.equal(fixture.result.decision.camera.mode, fixture.expected.camera);
  assert.equal(fixture.result.decision.emphasis.mode, fixture.expected.emphasis);
  assert.equal(fixture.result.decision.transition.mode, fixture.expected.transition);
  assert.equal(fixture.result.policy.effectsDefault, "SKIP");
  assert.equal(fixture.result.policy.decorativeTransitionsForbidden, true);
  assert.equal(fixture.result.policy.defaultFocusRectanglesForbidden, true);
  assert.equal(fixture.result.policy.clickRingsForbidden, true);
}

const camera = resolveMatureScreenPostPolicy({shotFunction: "RESULT", primaryTarget: smallTarget, requestedScale: 1.5, contextRetention: 0.9});
assert.equal(camera.decision.camera.mode, "RESTRAINED_SEMANTIC_PUSH");
assert.equal(camera.decision.camera.scale, 1.08);
const unsafeCamera = resolveMatureScreenPostPolicy({shotFunction: "RESULT", primaryTarget: {x: 0.94, y: 0.92, width: 0.05, height: 0.04}, requestedScale: 1.08});
assert.equal(unsafeCamera.decision.camera.mode, "NONE");
const explicitFocus = resolveMatureScreenPostPolicy({shotFunction: "RESULT", primaryTarget: focusTarget, explicitEmphasisRequired: true, geometryConfidence: 1});
assert.equal(explicitFocus.decision.emphasis.mode, "INVERSE_SPOTLIGHT");
assert.equal(explicitFocus.decision.emphasis.coloredRectangle, false);

const selector = selectMatureScreenMotionTechniques({shotId: "decisive-click", shotFunction: "ACTION", durationMs: 4200, primaryTarget: smallTarget, targetVisibleMs: 1200, cursorIsDecisive: true, resultNeedsReading: true});
assert.equal(selector.status, "PASS");
assert.equal(selector.techniques[0].technique, "CURSOR_PUNCH");
assert.equal(selector.techniques[0].clickRing, false);
assert.equal(selector.techniques.some((item) => item.technique === "SEMANTIC_PUSH"), false);
assert.equal(selector.admission.decorativeTransitionsAllowed, false);
assert.equal(selector.admission.defaultFocusRectanglesAllowed, false);
assert.ok(selector.techniques.some((item) => item.technique === "RESULT_HOLD"));

console.log(JSON.stringify({
  contract: "A1MatureScreenPostPolicyTest/v1",
  status: "PASS",
  fixtures: fixtures.map(({id, genre, result}) => ({id, genre, decisionSha256: result.decisionSha256})),
  gates: {
    effectsDefaultSkip: true,
    nativeActionSuppressesExtras: true,
    cursorAndCameraDoNotCompete: true,
    cameraScaleCappedAt108: true,
    unsafeEdgeCameraSuppressed: true,
    defaultFocusRectanglesForbidden: true,
    decorativeTransitionsForbidden: true,
  },
}, null, 2));
