#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertEffectPrimitiveVisualDisposition,
  assertImagegenBackgroundContinuation,
  assertImagegenBackgroundWaveReview,
} from "../apps/studio-next/src/lib/a1-imagegen-background-library-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const authority = workspace.production.articleAssetProductionAuthority;
const continuation = assertImagegenBackgroundContinuation(authority.imagegenBackgroundContinuation);
const review = assertImagegenBackgroundWaveReview(continuation.review);
const disposition = assertEffectPrimitiveVisualDisposition(authority.effectPrimitiveVisualDisposition);

assert.equal(review.candidateCount, 24);
assert.equal(review.universalCandidateCount, 15);
assert.equal(review.emphasisCandidateCount, 4);
assert.equal(review.candidates.filter((candidate) => candidate.libraryTier === "ROLE_SPECIFIC").length, 5);
assert.equal(new Set(review.candidates.map((candidate) => candidate.candidateId)).size, 24);
assert.equal(review.candidates.every((candidate) => candidate.generation.provider === "codex-built-in-imagegen"), true);
assert.equal(review.candidates.every((candidate) => candidate.machineStatus === "PASS" && candidate.currentDirectionApproved === false), true);
assert.equal(disposition.status, "VISUAL_REJECTED_DO_NOT_ADOPT");
assert.equal(disposition.defaultLibraryAllowed, false);
assert.equal(authority.boundaries.motionAllowed, false);
assert.equal(authority.boundaries.productionAdmitted, false);

console.log(JSON.stringify({status: "PASS", candidateCount: review.candidateCount, universalCandidateCount: review.universalCandidateCount, emphasisCandidateCount: review.emphasisCandidateCount, effectPrimitiveDisposition: disposition.status, productionAdmitted: false}, null, 2));
