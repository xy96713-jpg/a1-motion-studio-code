#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_PACKAGING_PARAGRAPH_QUALITY_AUTHORITY, assertPackagingParagraphCanary, assertPackagingParagraphQualityAuthority, assertPackagingParagraphUpgradeMarker, buildCurrentPackagingParagraphCanary, buildPackagingParagraphUpgradeMarker} from "../apps/studio-next/src/lib/a1-packaging-paragraph-quality-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
assert.equal(assertPackagingParagraphQualityAuthority().status, "PASS");
const upgradeMarker = assertPackagingParagraphUpgradeMarker(buildPackagingParagraphUpgradeMarker());
assert.deepEqual(upgradeMarker.targetShotIds, ["ED-12", "ED-13", "ED-14"]);
assert.equal(upgradeMarker.productionBudget.imageGenerationRequestCount, 1);
assert.equal(upgradeMarker.imageGenerationPerformed, false);
assert.throws(() => buildCurrentPackagingParagraphCanary(workspace, {now: "2026-08-12T18:00:00.000Z"}), /no-qualified-adjacent-triple/);
const fixtureWorkspace = structuredClone(workspace);
for (const item of fixtureWorkspace.production.storyboardProductionProjection.items) {
  if (!["ED-12", "ED-13", "ED-14"].includes(item.shotId)) continue;
  item.packageDecision = "PACKAGE";
  item.tasteBinding = {...item.tasteBinding, status: "TASTE_BOUND"};
}
fixtureWorkspace.production.packagingTemporalReadabilityAuthority.shots.push({
  shotId: "ED-13",
  displayCopy: ["国产模型写中文确实会顺一些", "问题也并没有彻底解决"],
  minimumReadableDurationMs: 4929,
  sourceShotWindowDurationMs: 5000,
  effectivePlannedDurationMs: 5000,
  actualArtifactTimingReviewRequired: true,
  finalMotionAdmissionAllowed: false,
});
const first = assertPackagingParagraphCanary(buildCurrentPackagingParagraphCanary(fixtureWorkspace, {now: "2026-08-12T18:00:00.000Z"}));
const second = assertPackagingParagraphCanary(buildCurrentPackagingParagraphCanary(fixtureWorkspace, {now: "2026-08-13T06:00:00.000Z"}));
assert.equal(first.canarySha256, second.canarySha256);
assert.deepEqual(first.targetShotIds, ["ED-12", "ED-13", "ED-14"]);
assert.deepEqual(first.beats.map((beat) => beat.paragraphRole), ["EVIDENCE", "MECHANISM", "VERDICT"]);
assert.deepEqual(first.beats.map((beat) => beat.primitiveType), ["EVIDENCE_WINDOW", "MECHANISM_EXPLAINER", "DATA_VERDICT"]);
assert.deepEqual(first.beats.map((beat) => beat.tasteDirection.densityProfile), ["quiet-iconic", "editorial-collision", "poster-dense"]);
assert.deepEqual(first.beats.map((beat) => beat.imageGenerationRequired), [false, true, false]);
assert.equal(first.productionBudget.imageGenerationRequestCount, 1);
assert.equal(first.productionBudget.deterministicSourceCompositeCount, 2);
assert.equal(first.playbackProof.minimumReadableDurationMs, 12858);
assert.equal(first.playbackProof.sourceAlignedPlaybackDurationMs, 18921);
assert.equal(first.playbackProof.targetDurationMs, 18921);
assert.match(first.playbackProof.nominalMaximumWaiverReason, /source-audio windows/u);
assert.equal(first.playbackProof.nominalMaximumExceeded, true);
assert.equal(first.playbackProof.status, "BLOCKED_UNTIL_ALL_STATIC_PROPOSITIONS_PASS");
assert.equal(first.proof.imageGenerationPerformed, false);
assert.equal(first.approvalBoundary.userVisualApprovalRemains, "NOT_APPROVED");
assert(Object.values(A1_PACKAGING_PARAGRAPH_QUALITY_AUTHORITY.antiCopyBoundary).every((allowed) => allowed === false));

const forged = structuredClone(first);
forged.beats[1].tasteDirection.densityProfile = "quiet-iconic";
forged.canarySha256 = "0".repeat(64);
assert.throws(() => assertPackagingParagraphCanary(forged), /sha|density-sequence/u);

console.log(JSON.stringify({
  status: "PASS",
  contract: first.contract,
  authoritySha256: A1_PACKAGING_PARAGRAPH_QUALITY_AUTHORITY.authoritySha256,
  upgradeMarkerSha256: upgradeMarker.markerSha256,
  canarySha256: first.canarySha256,
  targetShotIds: first.targetShotIds,
  roles: first.beats.map((beat) => beat.paragraphRole),
  densitySequence: first.beats.map((beat) => beat.tasteDirection.densityProfile),
  imageGenerationRequestCount: first.productionBudget.imageGenerationRequestCount,
  deterministicSourceCompositeCount: first.productionBudget.deterministicSourceCompositeCount,
  minimumReadableDurationMs: first.playbackProof.minimumReadableDurationMs,
  sourceAlignedPlaybackDurationMs: first.playbackProof.sourceAlignedPlaybackDurationMs,
  nominalMaximumExceeded: first.playbackProof.nominalMaximumExceeded,
  imageGenerationPerformed: first.proof.imageGenerationPerformed,
}, null, 2));
