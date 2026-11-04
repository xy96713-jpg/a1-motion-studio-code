#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  assertExistingEffectPreservation,
  compileExistingEffectPreservation,
} from "../apps/studio-next/src/lib/a1-existing-effect-preservation-v1.mjs";

const fixtures = [
  {id: "effect-tutorial", genre: "product-tutorial", kind: "SOURCE_BOUND_HIGHLIGHT"},
  {id: "effect-evidence", genre: "evidence-explainer", kind: "DASHED_PATH"},
  {id: "effect-opinion", genre: "personal-opinion", kind: "DIRECTIONAL_PATH"},
];
for (const fixture of fixtures) {
  const plan = assertExistingEffectPreservation(
    compileExistingEffectPreservation({
      currentArtifactSha256: "a".repeat(64),
      effects: [{kind: fixture.kind, role: "PRIMARY_EXISTING_EFFECT"}],
      requestedChanges: ["TIMING", "EASING", "ENTER_HOLD_EXIT"],
    }),
  );
  assert.equal(plan.status, "MOTION_TUNING_ONLY");
  assert.equal(plan.policy.preserveCurrentPixels, true);
}
assert.equal(
  compileExistingEffectPreservation({
    currentArtifactSha256: "b".repeat(64),
    effects: [{kind: "DASHED_PATH"}],
    requestedChanges: ["LAYOUT_REDESIGN"],
  }).status,
  "STATIC_REDESIGN_FORBIDDEN",
);
console.log(JSON.stringify({contract:"A1ExistingEffectPreservationTest/v1",status:"PASS",fixtures,preservePixels:true,motionTuningOnly:true},null,2));
