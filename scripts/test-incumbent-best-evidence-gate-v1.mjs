#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertIncumbentBestEvidenceGate, compareCandidateAgainstIncumbentBest} from "../apps/studio-next/src/lib/a1-incumbent-best-evidence-gate-v1.mjs";

const dimensions = (score, suffix) => Object.fromEntries(["semanticFit", "sourceIntegrity", "readability", "subjectSafety", "visualHierarchy", "sequenceFit"].map((name) => [name, {score, evidence: `${name}-${suffix}`}]))
const comparable = (candidateId, artifactSha256, score, suffix) => ({candidateId, artifactSha256, semanticGoalKey: "same-semantic-goal", baseCarrierKey: "VERIFIED_SOURCE", sourceClaimKey: "same-source-claim", dimensions: dimensions(score, suffix)});
const incumbent = {...comparable("incumbent-1", "a".repeat(64), 95, "incumbent"), selectedAt: "2026-08-16T00:00:00.000Z"};
const first = compareCandidateAgainstIncumbentBest({shotId: "ED-14", candidate: comparable("candidate-first", "b".repeat(64), 90, "first"), generatedAt: "2026-08-17T00:00:00.000Z"});
const better = compareCandidateAgainstIncumbentBest({shotId: "ED-14", candidate: comparable("candidate-better", "c".repeat(64), 96, "better"), incumbent});
const equal = compareCandidateAgainstIncumbentBest({shotId: "ED-14", candidate: comparable("candidate-equal", "d".repeat(64), 95, "equal"), incumbent});
const worse = compareCandidateAgainstIncumbentBest({shotId: "ED-14", candidate: comparable("candidate-worse", "e".repeat(64), 94, "worse"), incumbent});
const newerButIncomplete = compareCandidateAgainstIncumbentBest({shotId: "ED-14", candidate: {candidateId: "candidate-newer", artifactSha256: "f".repeat(64), score: 100, createdAt: "2026-08-18T00:00:00.000Z"}, incumbent});
for (const gate of [first, better, equal, worse, newerButIncomplete]) assertIncumbentBestEvidenceGate(gate);
assert.equal(first.decision, "NO_INCUMBENT_REPLACE");
assert.equal(better.decision, "REPLACE_INCUMBENT");
assert.equal(equal.decision, "KEEP_INCUMBENT");
assert.equal(worse.decision, "KEEP_INCUMBENT");
assert.equal(newerButIncomplete.decision, "KEEP_INCUMBENT");
assert.ok(newerButIncomplete.comparison.failures.includes("SEMANTIC_GOAL_KEY_MISSING"));
console.log(JSON.stringify({status: "PASS", contract: "A1IncumbentBestEvidenceGateTest/v2", decisions: [first.decision, better.decision, equal.decision, worse.decision, newerButIncomplete.decision], newerIncompleteBlocked: true}, null, 2));
