#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {deriveCurrentShotReviewSummary} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";

const workspace = JSON.parse(fs.readFileSync("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json", "utf8"));
const summary = deriveCurrentShotReviewSummary(workspace);
const expected = ["ED-01", "ED-09", "ED-12", "ED-16", "ED-17", "ED-34"];
const rows = expected.map((shotId) => {
  const shot = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === shotId);
  const item = summary.items.find((candidate) => candidate.shotId === shotId);
  assert.ok(shot.motionReviewPlan.designCandidate.sha256 !== shot.artifactSha256);
  assert.equal(item.status, "STATIC_DESIGN_REVIEW_REQUIRED");
  return {shotId, status: item.status, currentSha256: shot.artifactSha256, candidateSha256: shot.motionReviewPlan.designCandidate.sha256, receiptPresent: Boolean(shot.motionReviewReceipt)};
});
console.log(JSON.stringify({contract: "A1ShotReviewDesignCandidatePrecedenceTest/v1", status: "PASS", rows}, null, 2));
