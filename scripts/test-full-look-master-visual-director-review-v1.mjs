#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  A1_FULL_LOOK_MASTER_VISUAL_DIRECTOR_REVIEW_CONTRACT,
  applyFullLookMasterVisualDirectorGate,
  assertFullLookMasterVisualDirectorReview,
  visualDirectorReviewForRaw,
} from "../apps/studio-next/src/lib/a1-full-look-master-visual-director-review-v1.mjs";

const sha = "a".repeat(64);
const job = {id: "look-master-ed-09-c01-test", shotId: "ED-09", candidateIndex: 1, output: {sha256: sha}};
const manifest = {
  contract: A1_FULL_LOOK_MASTER_VISUAL_DIRECTOR_REVIEW_CONTRACT,
  status: "PASS",
  waveDispatchMaturityRunSha256: "b".repeat(64),
  reviewScope: "SYSTEM_VISUAL_DIRECTOR_ACTUAL_FULL_FRAME",
  userVisualApproval: "NOT_REQUESTED",
  items: [{generationJobId: job.id, shotId: job.shotId, candidateIndex: 1, artifactSha256: sha, decision: "REJECT", reasonCodes: ["GENERIC_UI_CARD"], actualFullFrameInspected: true, boardScaleInspected: true, fullLookMasterActualPixelPass: false}],
  shotRepairs: [{shotId: "ED-09", status: "STRUCTURAL_RETRY_REQUIRED", failureCodes: ["GENERIC_UI_CARD"], requiredVisualAction: "Use one full-frame language action.", forbiddenPatterns: ["cards"]}],
};
assert.equal(assertFullLookMasterVisualDirectorReview(manifest, {waveDispatchMaturityRunSha256: manifest.waveDispatchMaturityRunSha256, jobs: [job]}), manifest);
const review = visualDirectorReviewForRaw(manifest, {referenceId: `look-master-raw-${job.id}`, artifact: {sha256: sha}});
assert.equal(review?.decision, "REJECT");
assert.deepEqual(applyFullLookMasterVisualDirectorGate({machinePass: true, hardFailures: [], review}), {pass: false, hardFailures: ["VISUAL_DIRECTOR_REJECTED:GENERIC_UI_CARD"], review});
assert.throws(() => assertFullLookMasterVisualDirectorReview({...manifest, items: [{...manifest.items[0], decision: "PASS"}]}, {waveDispatchMaturityRunSha256: manifest.waveDispatchMaturityRunSha256, jobs: [job]}), /pass-proof-invalid/u);
console.log(JSON.stringify({status: "PASS", reviewContract: manifest.contract, visualRejectOverridesMachinePass: true}, null, 2));
