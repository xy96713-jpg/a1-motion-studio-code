import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertPackagingTemporalReadabilityAudit, auditPackagingTemporalReadability, buildPackagingTemporalActualArtifactReview, buildPackagingTemporalReadabilityAuthority, packagingTemporalMotionAdmission} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const withoutAuthority = structuredClone(workspace);
delete withoutAuthority.production.packagingTemporalReadabilityAuthority;
const baseline = assertPackagingTemporalReadabilityAudit(auditPackagingTemporalReadability(withoutAuthority, {now: "2026-08-12T16:30:00.000Z"}), {workspace: withoutAuthority});
assert.equal(baseline.status, "DURATION_REPAIR_REQUIRED");
assert(baseline.repairRequiredShotIds.length > 0);
assert(baseline.repairRequiredShotIds.every((shotId) => baseline.shots.find((shot) => shot.shotId === shotId)?.status === "DURATION_REPAIR_REQUIRED"));
assert.equal(baseline.blockedSourceWindowShotIds.length, 0);
const expectedPackageShotCount = withoutAuthority.production.canonicalCreatorPackagingSequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE").length;
assert.equal(baseline.summary.packageShotCount, expectedPackageShotCount);
assert(baseline.summary.timedTakeoverCount >= 1);
assert(baseline.shots.filter((shot) => baseline.repairRequiredShotIds.includes(shot.shotId)).every((shot) => shot.sourceWindowCanCarryRequiredDuration));

const authority = buildPackagingTemporalReadabilityAuthority(withoutAuthority, {now: "2026-08-12T16:30:00.000Z"});
assert.deepEqual(authority.summary.overrideShotIds, baseline.repairRequiredShotIds);
const repairedWorkspace = structuredClone(withoutAuthority);
repairedWorkspace.production.packagingTemporalReadabilityAuthority = authority;
const repaired = assertPackagingTemporalReadabilityAudit(auditPackagingTemporalReadability(repairedWorkspace, {now: "2026-08-12T16:30:00.000Z"}), {workspace: repairedWorkspace, requirePass: true});
assert.equal(repaired.repairRequiredShotIds.length, 0);
assert.equal(repaired.approvalBoundary.staticTimingPlanPassDoesNotApproveMotion, true);
assert.equal(packagingTemporalMotionAdmission(repairedWorkspace).allowed, false);
assert.equal(packagingTemporalMotionAdmission(repairedWorkspace).status, "AWAITING_ACTUAL_ARTIFACT_TIMING_REVIEW");
const actualArtifactReview = buildPackagingTemporalActualArtifactReview(repairedWorkspace, {
  humanReviewerId: "test-human-reviewer",
  now: "2026-08-12T16:45:00.000Z",
  shotReviews: authority.shots.map((shot, index) => ({shotId: shot.shotId, artifactPublicUrl: `/test/temporal-${shot.shotId}.mp4`, artifactSha256: String((index % 9) + 1).repeat(64), artifactByteVerified: true, frameSequenceReviewed: true, exactVisibleCopyPass: true, measuredReadableHoldMs: shot.effectivePlannedDurationMs})),
});
const actualReviewWorkspace = structuredClone(repairedWorkspace);
actualReviewWorkspace.production.packagingTemporalActualArtifactReview = actualArtifactReview;
assert.equal(packagingTemporalMotionAdmission(actualReviewWorkspace).allowed, true);
assert.equal(packagingTemporalMotionAdmission(actualReviewWorkspace).status, "PASS_ACTUAL_ARTIFACT_TIMING_REVIEW");
const forgedReviewWorkspace = structuredClone(repairedWorkspace);
forgedReviewWorkspace.production.packagingTemporalActualArtifactReview = {contract: "A1PackagingTemporalActualArtifactReview/v1", version: 1, status: "PASS_ACTUAL_ARTIFACT_TIMING_REVIEW", reviewSha256: "a".repeat(64)};
assert.equal(packagingTemporalMotionAdmission(forgedReviewWorkspace).allowed, false);
assert.equal(packagingTemporalMotionAdmission(forgedReviewWorkspace).status, "INVALID_OR_STALE_ACTUAL_ARTIFACT_TIMING_REVIEW");
assert.throws(() => assertPackagingTemporalReadabilityAudit(baseline, {requirePass: true}), /packaging-temporal-readability-failed/u);

const dynamicFixture = structuredClone(withoutAuthority);
const extraDecision = structuredClone(dynamicFixture.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === "ED-01"));
extraDecision.shotId = "ED-DYNAMIC";
extraDecision.order = 999;
extraDecision.packageDecision = "PACKAGE";
extraDecision.contentTreatment = "HERO_TYPOGRAPHY";
extraDecision.frameOccupation = "OVERLAY";
extraDecision.assemblyMode = "OVERLAY";
extraDecision.presentationMode = "OVERLAY";
extraDecision.sourceText = "动态包装数量测试";
extraDecision.decisionSha256 = "d".repeat(64);
dynamicFixture.production.canonicalCreatorPackagingSequence.decisions.push(extraDecision);
dynamicFixture.production.shotIntelligence.videoPackagingContexts.items.push({...structuredClone(dynamicFixture.production.shotIntelligence.videoPackagingContexts.items[0]), shotId: "ED-DYNAMIC", decisionHash: extraDecision.decisionSha256});
dynamicFixture.production.shotIntelligence.packageLookMasterPlans.push({...structuredClone(dynamicFixture.production.shotIntelligence.packageLookMasterPlans[0]), shotId: "ED-DYNAMIC", protectedPhrases: []});
const dynamicAudit = auditPackagingTemporalReadability(dynamicFixture, {now: "2026-08-12T16:30:00.000Z"});
assert.equal(dynamicAudit.summary.packageShotCount, baseline.summary.packageShotCount + 1);

console.log(JSON.stringify({status: "PASS", contract: baseline.contract, packageShotCount: baseline.summary.packageShotCount, dynamicPackageShotCount: dynamicAudit.summary.packageShotCount, baselineStatus: baseline.status, repairRequiredShotIds: baseline.repairRequiredShotIds, sourceWindowBlockedCount: baseline.summary.sourceWindowBlockedCount, authoritySha256: authority.authoritySha256, effectiveDurations: Object.fromEntries(authority.shots.filter((shot) => shot.overrideApplied).map((shot) => [shot.shotId, shot.effectivePlannedDurationMs])), repairedFixtureStatus: repaired.status, staticPassCannotApproveMotion: repaired.approvalBoundary.staticTimingPlanPassDoesNotApproveMotion}, null, 2));
