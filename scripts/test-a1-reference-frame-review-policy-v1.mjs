import assert from "node:assert/strict";
import {
  A1_REFERENCE_FRAME_REVIEW_POLICY_V1,
  REFERENCE_FRAME_REVIEW_LIMITS_V1,
  assessMotionSufficiencyV1,
  compileReferenceFrameReviewPlanV1,
  resolveSamplingQuestionV1,
} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";

const videoSha = "a".repeat(64);
const makePlan = (sequences, hardCuts = [], overrides = {}) => compileReferenceFrameReviewPlanV1({
  sourceVideoSha256: videoSha,
  fps: 60,
  totalFrames: 1_000,
  sequences,
  hardCuts,
  ...overrides,
});

function testStableHoldUsesOneRepresentative() {
  const plan = makePlan([
    {sequenceId: "hold-default", startFrame: 10, endFrameExclusive: 20, mode: "stable-hold"},
    {sequenceId: "hold-selected", startFrame: 30, endFrameExclusive: 40, mode: "stable-hold", representativeFrame: 33},
  ]);
  assert.equal(plan.contract, A1_REFERENCE_FRAME_REVIEW_POLICY_V1);
  assert.deepEqual(plan.references.map(({role, sourceFrame}) => ({role, sourceFrame})), [
    {role: "REPRESENTATIVE_HOLD", sourceFrame: 15},
    {role: "REPRESENTATIVE_HOLD", sourceFrame: 33},
  ]);
  assert.equal(plan.summary.extractedImages, 0);
  assert.equal(plan.summary.visualApproval, false);
  assert.equal(plan.summary.productionAdmission, false);
}

function testSemanticAnchorsAndFivePointFallback() {
  const plan = makePlan([
    {sequenceId: "mapped", startFrame: 100, endFrameExclusive: 200, mode: "semantic-motion", anchors: [
      {role: "ENTER", sourceFrame: 105},
      {role: "PEAK", sourceFrame: 130},
      {role: "HOLD", sourceFrame: 170},
      {role: "EXIT", sourceFrame: 195},
    ]},
    {sequenceId: "unmapped", startFrame: 300, endFrameExclusive: 401, mode: "unmapped-motion", fallbackReason: "No reliable event timing or path was available."},
  ]);
  assert.deepEqual(plan.references.filter((item) => item.sequenceId === "mapped").map(({role, sourceFrame}) => [role, sourceFrame]), [
    ["ENTER", 105], ["PEAK", 130], ["HOLD", 170], ["EXIT", 195],
  ]);
  assert.deepEqual(plan.references.filter((item) => item.sequenceId === "unmapped").map(({role, sourceFrame, reason}) => [role, sourceFrame, reason]), [
    ["START", 300, "unmapped-motion-fallback:No reliable event timing or path was available."],
    ["QUARTER", 325, "unmapped-motion-fallback:No reliable event timing or path was available."],
    ["MIDPOINT", 350, "unmapped-motion-fallback:No reliable event timing or path was available."],
    ["THREE_QUARTER", 375, "unmapped-motion-fallback:No reliable event timing or path was available."],
    ["END", 400, "unmapped-motion-fallback:No reliable event timing or path was available."],
  ]);
  assert.equal(plan.summary.visualApproval, false);
  assert.equal(plan.summary.extractedImages, 0);
}

function testGlobalDedupKeepsEveryRoleAndHardCutPair() {
  const plan = makePlan([
    {sequenceId: "left", startFrame: 0, endFrameExclusive: 10, mode: "stable-hold"},
    {sequenceId: "right", startFrame: 5, endFrameExclusive: 15, mode: "explicit-reference", anchors: [
      {role: "PARALLEL_LAYER", sourceFrame: 5},
    ]},
    {sequenceId: "after-cut", startFrame: 15, endFrameExclusive: 30, mode: "stable-hold"},
  ], [{id: "cut-one", beforeSequenceId: "left", afterSequenceId: "right", cutFrame: 6}]);
  const frameFive = plan.assets.find((asset) => asset.sourceFrame === 5);
  assert.deepEqual(frameFive.references.map(({sequenceId, role}) => [sequenceId, role]), [
    ["left", "REPRESENTATIVE_HOLD"],
    ["right", "PARALLEL_LAYER"],
    ["left", "CUT_BEFORE"],
  ]);
  assert.ok(plan.references.some((item) => item.sequenceId === "right" && item.role === "CUT_AFTER" && item.sourceFrame === 6 && item.reason === "confirmed-hard-cut:cut-one"));
  assert.equal(plan.summary.referenceCount, 5);
  assert.equal(plan.summary.uniqueSourceFrames, 3);
  assert.equal(plan.summary.reusedReferences, 2);
  assert.equal(plan.summary.extractedImages, 0);
  assert.equal(plan.summary.visualApproval, false);
  assert.equal(plan.sha256, makePlan([
    {sequenceId: "left", startFrame: 0, endFrameExclusive: 10, mode: "stable-hold"},
    {sequenceId: "right", startFrame: 5, endFrameExclusive: 15, mode: "explicit-reference", anchors: [
      {role: "PARALLEL_LAYER", sourceFrame: 5},
    ]},
    {sequenceId: "after-cut", startFrame: 15, endFrameExclusive: 30, mode: "stable-hold"},
  ], [{id: "cut-one", beforeSequenceId: "left", afterSequenceId: "right", cutFrame: 6}]).sha256);
}

function testContextFramesAndAmbiguityWindow() {
  const plan = makePlan([
    {sequenceId: "context", startFrame: 100, endFrameExclusive: 200, mode: "explicit-reference", anchors: [
      {role: "BEFORE_CONTEXT", sourceFrame: 99},
    ]},
    {sequenceId: "question", startFrame: 300, endFrameExclusive: 500, mode: "ambiguity-probe", question: "Does the highlight move before the page changes?", probeFrames: [320, 390, 420]},
  ]);
  assert.equal(plan.references[0].scope, "CONTEXT");
  assert.deepEqual(plan.references.filter((item) => item.sequenceId === "question").map((item) => item.role), [
    "QUESTION_PROBE_01", "QUESTION_PROBE_02", "QUESTION_PROBE_03",
  ]);
  assert.throws(() => makePlan([
    {sequenceId: "wide-question", startFrame: 0, endFrameExclusive: 300, mode: "ambiguity-probe", question: "Resolve the transition", probeFrames: [0, 121]},
  ]), /ambiguity-window-too-wide/u);
  assert.throws(() => makePlan([
    {sequenceId: "duplicate-question-frame", startFrame: 0, endFrameExclusive: 300, mode: "ambiguity-probe", question: "Resolve the transition", probeFrames: [50, 50]},
  ]), /ambiguity-probe-duplicate-frame/u);
  assert.throws(() => makePlan([
    {sequenceId: "empty-question", startFrame: 0, endFrameExclusive: 10, mode: "ambiguity-probe", question: "  ", probeFrames: [3]},
  ]), /ambiguity-question-required/u);
}

function testQuestionStopsAfterOneExpansion() {
  assert.deepEqual(resolveSamplingQuestionV1({status: "UNRESOLVED", expansionCount: 0, decisionImpact: true}), {
    status: "ONE_EXPANSION_AVAILABLE", next: "CAPTURE_ONE_NARROW_EXPANSION", expansionAllowed: true, visualApproval: false,
  });
  assert.deepEqual(resolveSamplingQuestionV1({status: "UNRESOLVED", expansionCount: 1, decisionImpact: true}), {
    status: "UNRESOLVED", next: "STOP_AND_KEEP_BLOCKER", expansionAllowed: false, visualApproval: false,
  });
  assert.deepEqual(resolveSamplingQuestionV1({status: "RESOLVED", expansionCount: 0, decisionImpact: true}), {
    status: "RESOLVED", next: "STOP_SAMPLING", expansionAllowed: false, visualApproval: false,
  });
  assert.deepEqual(resolveSamplingQuestionV1({status: "UNRESOLVED", expansionCount: 0, decisionImpact: false}), {
    status: "NO_DECISION_IMPACT", next: "STOP_SAMPLING", expansionAllowed: false, visualApproval: false,
  });
  assert.throws(() => resolveSamplingQuestionV1({status: "UNRESOLVED", expansionCount: 2, decisionImpact: true}), /question-state-invalid/u);
  assert.throws(() => resolveSamplingQuestionV1({status: "UNRESOLVED", expansionCount: 0}), /question-state-invalid/u);
}

function testMotionSufficiencyGates() {
  const base = {
    requiredRoles: ["ENTER", "PEAK", "HANDOFF"],
    observations: [
      {role: "ENTER", status: "VISIBLE"},
      {role: "PEAK", status: "VISIBLE"},
      {role: "HANDOFF", status: "VISIBLE"},
    ],
    focusPath: "CLEAR",
    handoff: "CLEAR",
    readability: "PASS",
    motionAfterLastUsefulInformation: "NONE",
  };
  const sufficient = assessMotionSufficiencyV1(base);
  assert.equal(sufficient.status, "SUFFICIENT");
  assert.equal(sufficient.sufficient, true);
  assert.equal(sufficient.visualApproval, false);
  assert.equal(assessMotionSufficiencyV1({...base, observations: base.observations.slice(0, 2)}).status, "REPAIR_REQUIRED");
  assert.equal(assessMotionSufficiencyV1({...base, observations: [{role: "ENTER", status: "UNKNOWN"}, ...base.observations.slice(1)]}).status, "UNRESOLVED_REVIEW_EVIDENCE");
  assert.equal(assessMotionSufficiencyV1({...base, focusPath: "UNCLEAR"}).status, "REPAIR_REQUIRED");
  assert.equal(assessMotionSufficiencyV1({...base, handoff: "UNKNOWN"}).status, "UNRESOLVED_REVIEW_EVIDENCE");
  assert.equal(assessMotionSufficiencyV1({...base, readability: "FAIL"}).status, "REPAIR_REQUIRED");
  assert.equal(assessMotionSufficiencyV1({...base, motionAfterLastUsefulInformation: "REDUNDANT"}).status, "SIMPLIFY_MOTION");
  assert.equal(assessMotionSufficiencyV1({...base, motionAfterLastUsefulInformation: "NEW_INFORMATION"}).status, "ADD_SEMANTIC_STATE_AND_REVIEW");
  assert.equal(assessMotionSufficiencyV1({...base, focusPath: "NOT_REQUIRED", handoff: "NOT_REQUIRED", readability: "NOT_REQUIRED"}).status, "SUFFICIENT");
  assert.throws(() => assessMotionSufficiencyV1({...base, observations: [...base.observations, base.observations[0]]}), /observation-invalid/u);
  assert.throws(() => assessMotionSufficiencyV1({...base, observations: [{role: "EXTRA", status: "VISIBLE"}]}), /observation-invalid/u);
}

function testBoundsAndFailClosedValidation() {
  assert.throws(() => makePlan([{sequenceId: "s", startFrame: 0, endFrameExclusive: 2, mode: "stable-hold"}], [], {sourceVideoSha256: "bad"}), /plan-input-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "s", startFrame: 0, endFrameExclusive: 2, mode: "stable-hold"}], [], {fps: REFERENCE_FRAME_REVIEW_LIMITS_V1.maxFps + 1}), /plan-input-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "s", startFrame: 0, endFrameExclusive: 2, mode: "stable-hold"}], [], {fps: REFERENCE_FRAME_REVIEW_LIMITS_V1.minFps / 2}), /plan-input-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "s", startFrame: 0, endFrameExclusive: 2, mode: "stable-hold"}], [], {totalFrames: REFERENCE_FRAME_REVIEW_LIMITS_V1.maxTotalFrames + 1}), /plan-input-invalid/u);
  assert.throws(() => makePlan([
    {sequenceId: "duplicate", startFrame: 0, endFrameExclusive: 2, mode: "stable-hold"},
    {sequenceId: "duplicate", startFrame: 2, endFrameExclusive: 4, mode: "stable-hold"},
  ]), /sequence-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "outside", startFrame: 0, endFrameExclusive: 2, mode: "stable-hold", representativeFrame: 2}]), /frame-outside-sequence/u);
  assert.throws(() => makePlan([{sequenceId: "short", startFrame: 0, endFrameExclusive: 4, mode: "unmapped-motion", fallbackReason: "No map"}]), /fallback-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "no-reason", startFrame: 0, endFrameExclusive: 10, mode: "unmapped-motion", fallbackReason: "  "}]), /fallback-reason-required/u);
  assert.throws(() => makePlan([{sequenceId: "bad-role", startFrame: 0, endFrameExclusive: 10, mode: "semantic-motion", anchors: [{role: "Bad Role!", sourceFrame: 2}]}]), /semantic-anchors-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "reverse-motion", startFrame: 0, endFrameExclusive: 10, mode: "semantic-motion", anchors: [
    {role: "EXIT", sourceFrame: 8}, {role: "ENTER", sourceFrame: 2},
  ]}]), /semantic-anchor-order-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "too-many-anchors", startFrame: 0, endFrameExclusive: 100, mode: "semantic-motion", anchors: Array.from({length: 13}, (_, i) => ({role: `STATE_${i}`, sourceFrame: i}))}]), /semantic-anchors-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "unsupported", startFrame: 0, endFrameExclusive: 10, mode: "guess"}]), /mode-unsupported/u);
  assert.throws(() => makePlan([{sequenceId: "unknown-input", startFrame: 0, endFrameExclusive: 10, mode: "stable-hold", extraField: "must-not-be-read"}]), /sequence-invalid/u);
  assert.throws(() => makePlan([{sequenceId: "s", startFrame: 0, endFrameExclusive: 10, mode: "stable-hold"}], [{beforeSequenceId: "s", afterSequenceId: "missing", cutFrame: 5}]), /hard-cut-invalid/u);
}

testStableHoldUsesOneRepresentative();
testSemanticAnchorsAndFivePointFallback();
testGlobalDedupKeepsEveryRoleAndHardCutPair();
testContextFramesAndAmbiguityWindow();
testQuestionStopsAfterOneExpansion();
testMotionSufficiencyGates();
testBoundsAndFailClosedValidation();
console.log("PASS a1-reference-frame-review-policy-v1: stable hold, semantic/fallback anchors, cut pairs, dedup, bounded ambiguity, sufficiency gates, validation, and non-approval boundary");
