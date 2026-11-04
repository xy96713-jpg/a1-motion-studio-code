#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  A1_CONTENT_AWARE_FRAME_REVIEW_BUDGET_V1,
  A1_REFERENCE_FRAME_REVIEW_POLICY_V1,
  A1_SOURCE_BOUND_FRAME_SIGNALS_V1,
  CONTENT_AWARE_SYNTHETIC_CONFIDENCE_THRESHOLD_V1,
  planContentAwareFrameReviewBudgetV1,
} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";

const sourceVideoSha256 = "a".repeat(64);
const fps = 25;
const totalFrames = 200;

function signalRow(sequenceId, kind, events, overrides = {}) {
  return {sequenceId, sourceVideoSha256, kind, complete: true, confidence: 0.98, events, ...overrides};
}

function makeInput(sequences, signalSequences, {hardCuts = [], signals: signalOverrides = {}, ...inputOverrides} = {}) {
  return {
    sourceVideoSha256, fps, totalFrames, sequences,
    signals: {
      contract: A1_SOURCE_BOUND_FRAME_SIGNALS_V1,
      sourceVideoSha256, fps, totalFrames,
      coverage: {startFrame: 0, endFrameExclusive: totalFrames},
      complete: true, confidence: 0.98, hardCutsComplete: true,
      sequences: signalSequences, hardCuts,
      ...signalOverrides,
    },
    ...inputOverrides,
  };
}

function assertReviewOnly(result) {
  assert.equal(result.contract, A1_CONTENT_AWARE_FRAME_REVIEW_BUDGET_V1);
  assert.equal(result.plan.contract, A1_REFERENCE_FRAME_REVIEW_POLICY_V1);
  assert.equal(result.summary.visualApproval, false);
  assert.equal(result.summary.productionAdmission, false);
  assert.equal(result.summary.confidenceThreshold, CONTENT_AWARE_SYNTHETIC_CONFIDENCE_THRESHOLD_V1);
  assert.equal(result.summary.realDetectorCalibration, "NOT_ESTABLISHED");
  assert.equal(result.summary.signalCompleteness, "DECLARED_BY_INPUT_NOT_INDEPENDENTLY_VERIFIED");
  assert.equal(result.plan.summary.visualApproval, false);
  assert.equal(result.plan.summary.productionAdmission, false);
  assert.equal(result.summary.missedBoundaryFreeClaim, false);
  const {sha256, ...body} = result;
  assert.equal(sha256, nodeInputHash(body), "budget result SHA must bind the complete decision and plan");
}

function testStableHoldUsesOneSourceBoundRepresentative() {
  const input = makeInput([
    {sequenceId: "hold", startFrame: 10, endFrameExclusive: 110, kind: "stable-hold", requiredRoles: ["HOLD"]},
  ], [signalRow("hold", "stable-hold", [{role: "HOLD", sourceFrame: 62, confidence: 0.99}])]);
  const result = planContentAwareFrameReviewBudgetV1(input);
  assertReviewOnly(result);
  assert.equal(result.status, "SIGNAL_AWARE_PLAN_READY");
  assert.deepEqual(result.sequenceDecisions[0].selectedFrames, [62]);
  assert.deepEqual(result.plan.references.map(({role, sourceFrame}) => [role, sourceFrame]), [["REPRESENTATIVE_HOLD", 62]]);
  assert.equal(result.summary.reductionAchieved, true);
}

function testShortPulseAndPlateauPreserveRequiredRoles() {
  const input = makeInput([
    {sequenceId: "pulse", startFrame: 10, endFrameExclusive: 30, kind: "motion", requiredRoles: ["ENTER", "PULSE_PEAK", "EXIT"]},
    {sequenceId: "plateau", startFrame: 40, endFrameExclusive: 100, kind: "motion", requiredRoles: ["ENTER", "PLATEAU", "EXIT"]},
  ], [
    signalRow("pulse", "pulse", [
      {role: "ENTER", sourceFrame: 11, confidence: 0.98},
      {role: "PULSE_PEAK", sourceFrame: 14, confidence: 0.97},
      {role: "EXIT", sourceFrame: 18, confidence: 0.99},
    ]),
    signalRow("plateau", "plateau", [
      {role: "ENTER", sourceFrame: 44, confidence: 0.99},
      {role: "PLATEAU", sourceFrame: 70, confidence: 0.96},
      {role: "EXIT", sourceFrame: 95, confidence: 0.98},
    ]),
  ]);
  const result = planContentAwareFrameReviewBudgetV1(input);
  assertReviewOnly(result);
  assert.equal(result.status, "SIGNAL_AWARE_PLAN_READY");
  assert.deepEqual(result.sequenceDecisions.map((item) => item.strategy), ["SEMANTIC_EVENTS", "SEMANTIC_EVENTS"]);
  assert.deepEqual(result.sequenceDecisions.map((item) => item.selectedFrames), [[11, 14, 18], [44, 70, 95]]);
  assert.deepEqual(result.plan.references.filter((item) => item.sequenceId === "pulse").map((item) => item.role),
    ["ENTER", "PULSE_PEAK", "EXIT"]);
  assert.deepEqual(result.plan.references.filter((item) => item.sequenceId === "plateau").map((item) => item.role),
    ["ENTER", "PLATEAU", "EXIT"]);
  assert.equal(result.summary.plannedReferenceCount, 6);
  assert.equal(result.summary.fivePointBaselineReferenceCount, 10);
  assert.equal(result.summary.reductionAchieved, true);
}

function testAdjacentConfirmedCutsKeepBothExactSides() {
  const sequences = [
    {sequenceId: "before", startFrame: 0, endFrameExclusive: 50, kind: "stable-hold", requiredRoles: ["HOLD"]},
    {sequenceId: "between", startFrame: 50, endFrameExclusive: 51, kind: "motion", requiredRoles: ["CUT_STATE"]},
    {sequenceId: "after", startFrame: 51, endFrameExclusive: 100, kind: "stable-hold", requiredRoles: ["HOLD"]},
  ];
  const cuts = [
    {id: "cut-a", beforeSequenceId: "before", afterSequenceId: "between", sourceVideoSha256, cutFrame: 50, confirmed: true, confidence: 0.99},
    {id: "cut-b", beforeSequenceId: "between", afterSequenceId: "after", sourceVideoSha256, cutFrame: 51, confirmed: true, confidence: 0.97},
  ];
  const signals = [
    signalRow("before", "stable-hold", [{role: "HOLD", sourceFrame: 25, confidence: 0.98}]),
    signalRow("between", "motion", [{role: "CUT_STATE", sourceFrame: 50, confidence: 0.96}]),
    signalRow("after", "stable-hold", [{role: "HOLD", sourceFrame: 75, confidence: 0.99}]),
  ];
  const result = planContentAwareFrameReviewBudgetV1(makeInput(sequences, signals, {hardCuts: cuts}));
  assertReviewOnly(result);
  assert.equal(result.status, "SIGNAL_AWARE_PLAN_READY");
  assert.deepEqual(result.plan.references.filter((item) => ["CUT_BEFORE", "CUT_AFTER"].includes(item.role))
    .map(({role, sourceFrame, reason}) => [role, sourceFrame, reason]), [
    ["CUT_BEFORE", 49, "confirmed-hard-cut:cut-a"],
    ["CUT_AFTER", 50, "confirmed-hard-cut:cut-a"],
    ["CUT_BEFORE", 50, "confirmed-hard-cut:cut-b"],
    ["CUT_AFTER", 51, "confirmed-hard-cut:cut-b"],
  ]);
  assert.equal(result.summary.reductionAchieved, true);
}

function testLowConfidenceNoisyAndOmittedRolesRetainFivePointFallback() {
  const sequence = {sequenceId: "uncertain", startFrame: 20, endFrameExclusive: 120,
    kind: "motion", requiredRoles: ["ENTER", "PEAK", "EXIT"]};
  const lowConfidence = planContentAwareFrameReviewBudgetV1(makeInput([sequence], [signalRow("uncertain", "motion", [
    {role: "ENTER", sourceFrame: 25, confidence: 0.99},
    {role: "PEAK", sourceFrame: 61, confidence: 0.55},
    {role: "EXIT", sourceFrame: 110, confidence: 0.99},
  ])]));
  assertReviewOnly(lowConfidence);
  assert.equal(lowConfidence.status, "REVIEW_REQUIRED");
  assert.equal(lowConfidence.sequenceDecisions[0].strategy, "FIVE_POINT_FALLBACK");
  assert.deepEqual(lowConfidence.sequenceDecisions[0].selectedFrames, [20, 45, 70, 94, 119]);
  assert.equal(lowConfidence.summary.reductionAchieved, false);

  const noisy = planContentAwareFrameReviewBudgetV1(makeInput([sequence], [signalRow("uncertain", "pulse", [
    {role: "ENTER", sourceFrame: 24, confidence: 0.99},
    {role: "ENTER", sourceFrame: 26, confidence: 0.97},
    {role: "PEAK", sourceFrame: 60, confidence: 0.98},
    {role: "EXIT", sourceFrame: 108, confidence: 0.99},
  ])]));
  assert.equal(noisy.status, "REVIEW_REQUIRED");
  assert.equal(noisy.sequenceDecisions[0].strategy, "FIVE_POINT_FALLBACK");
  assert.match(noisy.sequenceDecisions[0].reason, /event-role-conflict/u);

  const omittedRole = planContentAwareFrameReviewPlanForTest(sequence, [
    {role: "ENTER", sourceFrame: 25, confidence: 0.99},
    {role: "EXIT", sourceFrame: 110, confidence: 0.99},
  ]);
  assert.equal(omittedRole.status, "REVIEW_REQUIRED");
  assert.equal(omittedRole.sequenceDecisions[0].strategy, "FIVE_POINT_FALLBACK");
  assert.match(omittedRole.sequenceDecisions[0].reason, /required-role-missing:PEAK/u);
}

function planContentAwareFrameReviewPlanForTest(sequence, events) {
  return planContentAwareFrameReviewBudgetV1(makeInput([sequence], [signalRow(sequence.sequenceId, "motion", events)]));
}

function testIncompleteCoverageAndSourceBindingsDoNotReduce() {
  const sequence = {sequenceId: "partial", startFrame: 10, endFrameExclusive: 80,
    kind: "motion", requiredRoles: ["ENTER", "EXIT"]};
  const input = makeInput([sequence], [signalRow("partial", "motion", [
    {role: "ENTER", sourceFrame: 12, confidence: 0.99}, {role: "EXIT", sourceFrame: 78, confidence: 0.99},
  ])], {signals: {coverage: {startFrame: 0, endFrameExclusive: 150}}});
  const result = planContentAwareFrameReviewBudgetV1(input);
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.sequenceDecisions[0].strategy, "FIVE_POINT_FALLBACK");
  assert.throws(() => planContentAwareFrameReviewBudgetV1({...input, signals: {...input.signals,
    sourceVideoSha256: "b".repeat(64)}}), /signals-source-binding-invalid/u);
  const badFrame = makeInput([sequence], [signalRow("partial", "motion", [
    {role: "ENTER", sourceFrame: 12, confidence: 0.99}, {role: "EXIT", sourceFrame: totalFrames, confidence: 0.99},
  ])]);
  assert.throws(() => planContentAwareFrameReviewBudgetV1(badFrame), /signal-frame-invalid/u);
}

function testDeterministicResultSHAAndNoApprovalBoundary() {
  const input = makeInput([
    {sequenceId: "pulse", startFrame: 3, endFrameExclusive: 23, kind: "motion", requiredRoles: ["ENTER", "PEAK", "EXIT"]},
  ], [signalRow("pulse", "pulse", [
    {role: "ENTER", sourceFrame: 4, confidence: 0.99},
    {role: "PEAK", sourceFrame: 9, confidence: 0.99},
    {role: "EXIT", sourceFrame: 20, confidence: 0.99},
  ])]);
  const first = planContentAwareFrameReviewBudgetV1(input);
  const second = planContentAwareFrameReviewBudgetV1(input);
  assert.deepEqual(second, first);
  assert.equal(first.sha256, nodeInputHash(Object.fromEntries(Object.entries(first).filter(([key]) => key !== "sha256"))));
  assert.equal(first.summary.visualApproval, false);
  assert.equal(first.summary.productionAdmission, false);
  assert.equal(first.summary.missedBoundaryFreeClaim, false);
}

testStableHoldUsesOneSourceBoundRepresentative();
testShortPulseAndPlateauPreserveRequiredRoles();
testAdjacentConfirmedCutsKeepBothExactSides();
testLowConfidenceNoisyAndOmittedRolesRetainFivePointFallback();
testIncompleteCoverageAndSourceBindingsDoNotReduce();
testDeterministicResultSHAAndNoApprovalBoundary();
console.log("PASS content-aware-frame-review-budget-v1: stable hold, pulse, plateau, adjacent cut sides, uncertain and omitted roles, source SHA/bounds, deterministic SHA, review-only boundary");
