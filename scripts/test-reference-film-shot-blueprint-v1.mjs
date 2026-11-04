import assert from "node:assert/strict";
import {compileReferenceFilmShotBlueprintV1} from "../apps/studio-next/src/lib/a1-reference-film-shot-blueprint-v1.mjs";

const sha = "a".repeat(64);
const plan = {
  source: {videoSha256: sha, fps: 3, totalFrames: 12},
  spokenCues: [
    {index: 0, text: "a real statement", reviewStatus: "ASR_DRAFT"},
    {index: 1, text: "the next statement", reviewStatus: "LOCKED"},
  ],
  sequencePlans: [
    {sequenceId: "opening", sourceInterval: {startFrame: 2, endFrameExclusive: 8}, spokenCueIndices: [0],
      semanticJobDraft: "set up", designedCopy: {status: "REVIEW_REQUIRED", items: []},
      assetIdentityStatus: "UNRESOLVED", referenceFrames: [{state: "HOLD", sourceFrame: 4}], overlaps: ["page"]},
    {sequenceId: "page", sourceInterval: {startFrame: 5, endFrameExclusive: 10}, spokenCueIndices: [1],
      semanticJobDraft: "show evidence", designedCopy: {status: "REVIEW_REQUIRED", items: []},
      assetIdentityStatus: "UNRESOLVED", referenceFrames: [{state: "ENTRY", sourceFrame: 5}], overlaps: ["opening"]},
  ],
  timeline: [
    {startFrame: 0, endFrameExclusive: 2, activeSequenceIds: [], baselineDecision: "PURE_BASE"},
    {startFrame: 2, endFrameExclusive: 5, activeSequenceIds: ["opening"], baselineDecision: "PACKAGE"},
    {startFrame: 5, endFrameExclusive: 8, activeSequenceIds: ["opening", "page"], baselineDecision: "PACKAGE"},
    {startFrame: 8, endFrameExclusive: 10, activeSequenceIds: ["page"], baselineDecision: "PACKAGE"},
    {startFrame: 10, endFrameExclusive: 12, activeSequenceIds: [], baselineDecision: "PURE_BASE"},
  ],
};
const decision = {opening: {visualJob: "original authored plate", designedCopy: [{text: "exact year", status: "VISIBLE_COPY_BOUND"}],
  candidateAsset: "work/original.png", sourceIdentityStatus: "ILLUSTRATIVE_NOT_EVIDENCE", blockers: ["MOTION_PENDING"]}};
const result = compileReferenceFilmShotBlueprintV1(plan, {sourcePlanSha256: sha, sourceDecisions: decision});
assert.equal(result.summary.shotCount, 2);
assert.equal(result.summary.timelineIntervalCount, 5);
assert.equal(result.summary.overlapIntervalCount, 1);
assert.deepEqual(result.timeline[2].activeShotIds, ["opening", "page"]);
assert.equal(result.shots[0].designedCopy[0].text, "exact year");
assert.equal(result.shots[0].visualApproval, false);
assert.equal(result.productionAdmission, false);
assert.equal(result.shots[0].routeStatus, "BLOCKED_UNTIL_DIRECTOR_AND_SOURCE_REVIEW");
assert.equal(result.sha256, compileReferenceFilmShotBlueprintV1(plan, {sourcePlanSha256: sha, sourceDecisions: decision}).sha256);
assert.throws(() => compileReferenceFilmShotBlueprintV1({...plan, timeline: [
  plan.timeline[0], {...plan.timeline[1], startFrame: 3}, ...plan.timeline.slice(2),
]}, {sourcePlanSha256: sha}), /timeline-interval-invalid/);
assert.throws(() => compileReferenceFilmShotBlueprintV1({...plan, sequencePlans: [
  {...plan.sequencePlans[0], overlaps: []}, plan.sequencePlans[1],
]}, {sourcePlanSha256: sha}), /overlap-invalid/);
assert.throws(() => compileReferenceFilmShotBlueprintV1(plan, {sourcePlanSha256: sha,
  sourceDecisions: {missing: decision.opening}}), /decision-unknown-shot/);
assert.throws(() => compileReferenceFilmShotBlueprintV1({...plan, sequencePlans: [
  {...plan.sequencePlans[0], spokenCueIndices: [42]}, plan.sequencePlans[1],
]}, {sourcePlanSha256: sha}), /cue-missing/);
console.log(JSON.stringify({status: "PASS", checks: 12, scope: "review-only-structural-bridge"}));
