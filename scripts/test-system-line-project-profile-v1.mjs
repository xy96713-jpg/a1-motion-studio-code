#!/usr/bin/env node
import assert from "node:assert/strict";
import {normalizeSystemLineProjectProfile, selectDiverseReviewShotIds} from "../apps/studio-next/src/lib/a1-system-line-project-profile-v1.mjs";

const fixtures = [
  {id: "profile-research-a", projectId: "evidence-project", shotIds: ["EV-A", "EV-B", "EV-C", "EV-D", "EV-E"]},
  {id: "profile-tutorial-b", projectId: "tutorial-project", shotIds: ["STEP-1", "STEP-2", "STEP-3", "STEP-4"]},
  {id: "profile-opinion-c", projectId: "opinion-project", shotIds: ["OPEN", "CLAIM", "SCENE", "TURN", "END", "CODA"]},
];

const results = fixtures.map((fixture) => {
  const profile = normalizeSystemLineProjectProfile({}, {projectId: fixture.projectId, availableShotIds: fixture.shotIds});
  const selected = selectDiverseReviewShotIds(fixture.shotIds.map((shotId) => ({shotId})), 3);
  assert.equal(profile.status, "GENERIC_PROFILE");
  assert.equal(profile.tasteReviewShotIds.length, 0);
  assert.equal(selected.length, 3);
  assert.equal(selected[0], fixture.shotIds[0]);
  assert.equal(selected.at(-1), fixture.shotIds.at(-1));
  return {id: fixture.id, status: "PASS", projectId: fixture.projectId, selectedReviewShotIds: selected};
});

assert.throws(() => normalizeSystemLineProjectProfile({}, {}), /project-id-required/u);
assert.throws(() => normalizeSystemLineProjectProfile({contract: "wrong"}, {projectId: "x"}), /contract-invalid/u);
console.log(JSON.stringify({contract: "A1SystemLineProjectProfileTest/v1", status: "PASS", results}, null, 2));
