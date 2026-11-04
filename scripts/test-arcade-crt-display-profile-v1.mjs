#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertArcadeCrtDisplayProfile, selectArcadeCrtDisplayProfile} from "../apps/studio-next/src/lib/a1-arcade-crt-display-profile-v1.mjs";

const fixtures = [
  {id: "coarse-full", input: {sourceRole: "GENERATED_EDITORIAL", presentationMode: "FULLSCREEN", contentDetailLevel: "COARSE", minimumTextPx: 64}, expected: "FULL_CRT"},
  {id: "fine-balanced", input: {sourceRole: "GENERATED_EDITORIAL", presentationMode: "FULLSCREEN", contentDetailLevel: "FINE", minimumTextPx: 18}, expected: "BALANCED_CRT"},
  {id: "presenter-local", input: {sourceRole: "GENERATED_EDITORIAL", presentationMode: "PRESENTER_NEGATIVE_SPACE_OVERLAY", contentDetailLevel: "COARSE", realBaseSourcePresent: true, generatedLayerOnly: true}, expected: "LOCAL_CRT"},
  {id: "paper-preserve", input: {sourceRole: "PAPER_EVIDENCE", presentationMode: "FULLSCREEN", contentDetailLevel: "FINE", minimumTextPx: 12}, expected: "PRESERVE_SOURCE"},
  {id: "screen-preserve", input: {sourceRole: "SCREEN_EVIDENCE", presentationMode: "FULLSCREEN", contentDetailLevel: "FINE", minimumTextPx: 14}, expected: "PRESERVE_SOURCE"},
];
const results = fixtures.map((fixture) => {
  const profile = selectArcadeCrtDisplayProfile(fixture.input);
  assert.equal(profile.profileId, fixture.expected);
  assert.equal(assertArcadeCrtDisplayProfile(profile), profile);
  return {id: fixture.id, status: "PASS", profileId: profile.profileId, strength: profile.strength};
});
assert.throws(() => selectArcadeCrtDisplayProfile({sourceRole: "GENERATED_EDITORIAL", presentationMode: "PRESENTER_NEGATIVE_SPACE_OVERLAY", realBaseSourcePresent: true}), /generated-layer-only-required/);
assert.throws(() => selectArcadeCrtDisplayProfile({sourceRole: "GENERATED_EDITORIAL", inputHasCrt: true}), /double-processing-forbidden/);
console.log(JSON.stringify({contract: "A1ArcadeCrtDisplayProfileTest/v1", status: "PASS", results}, null, 2));
