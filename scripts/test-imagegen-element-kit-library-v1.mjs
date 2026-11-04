#!/usr/bin/env node

import assert from "node:assert/strict";
import {buildImagegenElementKitContinuation, buildImagegenElementKitWaveReview} from "../apps/studio-next/src/lib/a1-imagegen-element-kit-library-v1.mjs";

const sha = "a".repeat(64);
const kits = Array.from({length: 4}, (_, kitIndex) => ({
  kitId: `kit-${kitIndex}`,
  semanticJobs: ["test"],
  actorCount: 3,
  actors: Array.from({length: 3}, (_, actorIndex) => ({candidateId: `actor-${kitIndex}-${actorIndex}`, sha256: sha, width: 640, height: 640, mimeType: "image/png", transparent: true, machineStatus: "PASS", visualReviewStatus: "READY_FOR_USER_REVIEW", currentDirectionApproved: false, productionAdmitted: false, generation: {provider: "codex-built-in-imagegen"}})),
}));
const review = buildImagegenElementKitWaveReview({kits, reviewSheet: {sha256: sha, width: 1920, height: 1350}, sourceReferencePackId: "pinterest-retro-pixel-v1", sourceReferenceManifestSha256: sha, createdAt: "2026-08-14T00:00:00.000Z"});
const continuation = buildImagegenElementKitContinuation({review, userDirective: "继续吧", createdAt: "2026-08-14T00:00:01.000Z"});

assert.equal(review.kitCount, 4);
assert.equal(review.actorCount, 12);
assert.equal(review.userVisualApproval, "NOT_APPROVED");
assert.equal(continuation.productionAdmitted, false);
assert.throws(() => buildImagegenElementKitWaveReview({kits: kits.slice(0, 3), reviewSheet: {sha256: sha, width: 1920, height: 1350}, sourceReferencePackId: "pinterest-retro-pixel-v1", sourceReferenceManifestSha256: sha}), /imagegen-element-kit-review-contract-invalid/u);

console.log(JSON.stringify({status: "PASS", reviewSha256: review.reviewSha256, continuationSha256: continuation.continuationSha256, kitCount: review.kitCount, actorCount: review.actorCount}, null, 2));
