#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  buildTypographyPairwiseReview,
  compileTypographyMotionSpec,
  createTypographyPreferenceLedger,
  recordTypographyPreference,
  scoreTypographyCandidate,
} from "./lib/a1-typography-decision-system-v1.mjs";

const candidate = (id, topology, recipe, ratio = 0.08) => ({
  candidateId: id,
  topology,
  materialRecipeId: recipe,
  exactCopy: "智能写作工具台",
  planSha256: id.padEnd(64, "a").slice(0, 64),
  output: {file: `${id}.png`, sha256: id.padEnd(64, "b").slice(0, 64)},
  pixelAudit: {
    status: "PASS",
    sourceProtection: {changedPixels: 0},
    titleRelationship: {occlusionRatio: ratio, continuationSides: 2},
    contactGraph: {actualZones: [{role: "hair"}, {role: "microphone"}]},
    glyphVisibility: [
      {visibleRatio: 0.86, canvasCoverageRatio: 1},
      {visibleRatio: 0.78, canvasCoverageRatio: 0.98},
    ],
  },
  productionAdmission: false,
  userVisualApproval: "NOT_APPROVED",
});
const candidates = [
  candidate("candidate-a", "SUBJECT_CARVED_WALL", "EDITORIAL_IVORY_CARMINE", 0.1),
  candidate("candidate-b", "ORBITAL_PHRASE_FIELD", "COBALT_CYAN_STEEL", 0.06),
  candidate("candidate-c", "EDGE_CROP_TAKEOVER", "MAGENTA_CYAN_SIGNAL", 0.05),
];

const score = scoreTypographyCandidate(candidates[0]);
assert.equal(score.contract, "A1TypographyMechanicalScore/v1");
assert.equal(score.machineEligibility, "PASS");
assert.equal("overallAestheticScore" in score, false);
assert.deepEqual(Object.keys(score.dimensions).sort(), ["canvasCoverage", "contactCoverage", "glyphLegibility", "occlusionFitness", "sourceIntegrity", "titleContinuity"].sort());
assert.ok(Object.values(score.dimensions).every((value) => value >= 0 && value <= 1));

const pairwise = buildTypographyPairwiseReview({candidates, maximumCandidates: 6});
assert.equal(pairwise.contract, "A1TypographyPairwiseVisualReview/v1");
assert.equal(pairwise.candidates.length, 3);
assert.equal(pairwise.pairs.length, 3);
assert.equal(pairwise.userVisualApproval, "NOT_APPROVED");
assert.ok(pairwise.criteria.includes("subjectTypeInterdependence"));
assert.ok(pairwise.pairs.every((pair) => pair.left.outputSha256 && pair.right.outputSha256));
assert.throws(() => buildTypographyPairwiseReview({candidates: [...candidates, {...candidates[0], candidateId: "failed", pixelAudit: {...candidates[0].pixelAudit, status: "FAIL"}}]}), /pairwise-hard-pass-candidates-only/u);

const ledger = createTypographyPreferenceLedger({shotId: "ED-01", candidateIds: candidates.map((item) => item.candidateId)});
assert.equal(ledger.status, "AWAITING_USER_DECISION");
assert.equal(ledger.entries.length, 0);
assert.throws(() => recordTypographyPreference(ledger, {actor: "AGENT", selectedCandidateId: "candidate-a", evidence: "looks best"}), /explicit-user-decision-required/u);
assert.throws(() => recordTypographyPreference(ledger, {actor: "USER", selectedCandidateId: "unknown", evidence: "用户明确选择"}), /candidate-not-in-ledger/u);
const decided = recordTypographyPreference(ledger, {actor: "USER", selectedCandidateId: "candidate-b", rejectedCandidateIds: ["candidate-a"], evidence: "用户明确选择 candidate-b"});
assert.equal(decided.status, "USER_SELECTION_RECORDED");
assert.equal(decided.entries.length, 1);
assert.equal(ledger.entries.length, 0);

const motion = compileTypographyMotionSpec(candidates[1], {fps: 30, durationFrames: 90, motionAllowed: false});
assert.equal(motion.contract, "A1TypographyPhysicsMotionSpec/v1");
assert.deepEqual(motion.phases.map((phase) => phase.id), ["PRE", "ENTER", "PEAK", "HOLD", "EXIT", "POST"]);
assert.equal(motion.renderAllowed, false);
assert.equal(motion.productionAdmission, false);
assert.equal(motion.physics.model, "DAMPED_SPRING");
assert.ok(motion.physics.dampingRatio >= 0.7 && motion.physics.dampingRatio <= 1);
assert.ok(motion.phases.every((phase, index) => index === 0 || phase.startFrame === motion.phases[index - 1].endFrame + 1));
assert.equal(motion.phases.at(-1).endFrame, 89);
assert.ok(motion.allowedChannels.every((channel) => ["x", "y", "scale", "rotation", "opacity"].includes(channel)));

console.log("A1 typography decision system contract PASS");
