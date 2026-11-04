#!/usr/bin/env node
import assert from "node:assert/strict";
import {deriveSystemLineReviewQueue} from "../apps/studio-next/src/lib/a1-system-line-review-queue-v1.mjs";

const workspaceSha256 = "a".repeat(64);
const fixtures = [
  {id: "queue-narration-a", item: {shotId: "N-A", status: "NARRATION_REPAIR_REQUIRED"}, shots: [], narrationCandidates: [{shotId: "N-A", kind: "narration", publicUrl: "/n.wav", sha256: "b".repeat(64)}], expected: "READY_FOR_USER_REVIEW"},
  {id: "queue-viewing-b", item: {shotId: "V-B", status: "REUSE_REVIEW_REQUIRED"}, shots: [{shotId: "V-B", motionReviewReceipt: {video: {publicUrl: "/v.mp4", sha256: "c".repeat(64)}}}], narrationCandidates: [], expected: "READY_FOR_INTERNAL_REVIEW"},
  {id: "queue-static-c", item: {shotId: "S-C", status: "STATIC_DESIGN_REVIEW_REQUIRED"}, shots: [{shotId: "S-C", artifactPublicUrl: "/old.png", artifactSha256: "d".repeat(64), motionReviewPlan: {designCandidate: {publicUrl: "/new.png", sha256: "e".repeat(64)}}}], narrationCandidates: [], expected: "READY_FOR_USER_REVIEW", expectedCandidateSha256: "e".repeat(64)},
];
const results = fixtures.map((fixture) => {const queue = deriveSystemLineReviewQueue({workspaceSha256, items: [fixture.item], shots: fixture.shots, narrationCandidates: fixture.narrationCandidates}); assert.equal(queue.items[0].queueStatus, fixture.expected); if (fixture.expectedCandidateSha256) assert.equal(queue.items[0].candidate.sha256, fixture.expectedCandidateSha256); assert.equal(queue.boundaries.userApprovalGranted, false); return {id: fixture.id, status: "PASS", queueStatus: fixture.expected};});
const missing = deriveSystemLineReviewQueue({workspaceSha256, items: [{shotId: "M", status: "BUILD_LOCAL_CANARY"}]}); assert.equal(missing.items[0].queueStatus, "PRODUCTION_REQUIRED");
console.log(JSON.stringify({contract: "A1SystemLineReviewQueueTest/v1", status: "PASS", results}, null, 2));
