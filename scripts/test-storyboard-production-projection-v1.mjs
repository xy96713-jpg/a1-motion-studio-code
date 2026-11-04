import assert from "node:assert/strict";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertStoryboardProductionProjection, deriveStoryboardProductionProjection} from "../apps/studio-next/src/lib/a1-storyboard-production-projection-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const first = assertStoryboardProductionProjection(deriveStoryboardProductionProjection(workspace, {now: "2026-08-12T12:00:00.000Z"}), workspace);
const second = assertStoryboardProductionProjection(deriveStoryboardProductionProjection(workspace, {now: "2026-08-12T12:00:00.000Z"}), workspace);
assert.equal(first.projectionSha256, second.projectionSha256);
assert.equal(first.sourceAuthority.mode, "SEMANTIC_TIMELINE_DECISION_SET");
assert.equal(first.sourceAuthority.planAuthorityScope, "HISTORY_READ_ONLY");
assert.deepEqual(first.counts, {total: 34, package: 11, noPackage: 23, tasteBound: 11, tasteUnbound: 0, temporalPlanPass: 11, temporalUnbound: 0, legacyReview: 0, downstreamStale: 0, legacyPlanDrift: 0, attention: 11});
assert.deepEqual(first.items.filter((item) => item.productionStatus === "LEGACY_REVIEW").map((item) => item.shotId), []);
assert.deepEqual(first.items.filter((item) => item.parityAudit.legacyDrift.length).map((item) => item.shotId), []);
assert.equal(first.items.find((item) => item.shotId === "ED-23").packageDecision, "NO_PACKAGE");
assert.equal(first.items.find((item) => item.shotId === "ED-32").packageDecision, "NO_PACKAGE");
assert.equal(first.gate.generationFrozen, true);
assert.equal(first.gate.imageGenerationAllowed, false);
assert.equal(first.gate.userVisualApproval, "NOT_APPROVED");
assert.equal(first.sourceAuthority.temporalReadabilityAuthoritySha256, workspace.production.packagingTemporalReadabilityAuthority.authoritySha256);
assert.equal(first.temporalReadability.packageShotCount, 11);
assert.equal(first.temporalReadability.actualArtifactTimingReviewStatus, "AWAITING_ACTUAL_ARTIFACT_TIMING_REVIEW");
assert.equal(first.gate.temporalActualArtifactReviewPass, false);
assert.equal(first.gate.motionAllowed, false);
assert(first.items.filter((item) => item.packageDecision === "PACKAGE").every((item) => item.temporalBinding.status === "STATIC_TIMING_PLAN_PASS"));
assert(first.items.every((item) => item.approval.machinePassCannotApprove === true));

const staleTemporalWorkspace = structuredClone(workspace);
staleTemporalWorkspace.production.packagingTemporalReadabilityAuthority.source.storyboardRevisionSha256 = "a".repeat(64);
staleTemporalWorkspace.production.packagingTemporalReadabilityAuthority.authoritySha256 = "b".repeat(64);
assert.throws(() => deriveStoryboardProductionProjection(staleTemporalWorkspace, {now: "2026-08-12T12:00:00.000Z"}), /packaging-temporal-readability-authority-invalid:sha/u);

const revisedWorkspace = structuredClone(workspace);
revisedWorkspace.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === "ED-10").sourceText += " revision";
revisedWorkspace.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === "ED-10").decisionHash = "a".repeat(64);
const revised = deriveStoryboardProductionProjection(revisedWorkspace, {now: "2026-08-12T12:00:00.000Z"});
assert.notEqual(revised.storyboardRevisionSha256, first.storyboardRevisionSha256);
assert.notEqual(revised.items.find((item) => item.shotId === "ED-10").itemRevisionSha256, first.items.find((item) => item.shotId === "ED-10").itemRevisionSha256);

const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(workspace), "2026-08-12T12:00:00.000Z"));
assert.equal(recalculated.production.storyboardProductionProjection.contract, "A1StoryboardProductionProjection/v1");
console.log(JSON.stringify({status: "PASS", contract: first.contract, revision: first.storyboardRevisionSha256, counts: first.counts, freeze: first.gate, legacyReviewShotIds: [], legacyPlanDriftShotIds: []}, null, 2));
