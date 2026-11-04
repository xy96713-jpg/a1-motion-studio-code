#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertPackagingParagraphCanaryPlan, buildPackagingParagraphCanaryPlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-plan-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const fixture = structuredClone(workspace);
fixture.production.authority.nextAction = {...fixture.production.authority.nextAction, id: "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY", targetShotIds: ["ED-12", "ED-13", "ED-14"], requiresUser: true};
const first = assertPackagingParagraphCanaryPlan(buildPackagingParagraphCanaryPlan(fixture, {appRoot, now: "2026-08-12T18:30:00.000Z"}), {appRoot});
const second = assertPackagingParagraphCanaryPlan(buildPackagingParagraphCanaryPlan(fixture, {appRoot, now: "2026-08-13T06:30:00.000Z"}), {appRoot});
assert.equal(first.planSha256, second.planSha256);
assert.deepEqual(first.shots.map((shot) => shot.shotId), ["ED-12", "ED-13", "ED-14"]);
assert.deepEqual(first.styleBriefs.map((brief) => brief.tasteDimensions.densityProfile), ["quiet-iconic", "editorial-collision", "poster-dense"]);
assert.deepEqual(first.shots.map((shot) => shot.productionMethod), ["EXACT_SOURCE_REBIND_PLUS_RENDERER", "IMAGEGEN_TEXTLESS_MECHANISM_PLUS_RENDERER", "EXACT_SOURCE_REBIND_PLUS_RENDERER"]);
assert.equal(first.staticStage.imageGenerationRequestCount, 1);
assert.equal(first.playbackStage.minimumReadableDurationMs, 12858);
assert.equal(first.playbackStage.sourceAlignedPlaybackDurationMs, 18921);
assert.equal(first.playbackStage.targetDurationMs, 18921);
assert.deepEqual(first.shots.map((shot) => shot.timelineRange), [
  {startMs: 51559, endMs: 56720, durationMs: 5161},
  {startMs: 56720, endMs: 61720, durationMs: 5000},
  {startMs: 61720, endMs: 70480, durationMs: 8760},
]);
assert.equal(first.shots[0].exactSourceBindings.length, 5);
assert.equal(first.shots[0].exactSourceBindings.every((binding, index) => binding.sourceKind === "VERIFIED_ENTITY_MARK" && binding.spokenOrder === index + 1), true);
assert.equal(first.shots[0].sourceAtlasReferences[0].productionAssetAllowed, false);
assert.equal(first.shots[0].sourceAtlasReferences[0].debugOrReferenceCopyAllowedInFormalCanvas, false);
assert.equal(first.shots[0].evidencePresentationPolicy.rankingOrCapabilityComparisonAllowed, false);
assert.equal(first.shots[2].claimBoundary.status, "BOUND");
assert.match(first.shots[2].claimBoundary.supportedScope, /英文新闻样本/u);
assert.equal(first.shots[2].claimBoundary.prohibitedExpansions.includes("优先走常见、稳妥、可复用"), true);
assert.equal(first.proof.imageGenerationPerformed, false);
assert.equal(first.approvalBoundary.userVisualApprovalRemains, "NOT_APPROVED");

const unauthorized = structuredClone(fixture);
unauthorized.production.authority.nextAction.id = "AUTHORIZE_TASTE_BOUND_BOUNDED_CANARY";
assert.throws(() => buildPackagingParagraphCanaryPlan(unauthorized, {appRoot}), /authority-gate/u);

console.log(JSON.stringify({status: "PASS", contract: first.contract, planSha256: first.planSha256, shotIds: first.shots.map((shot) => shot.shotId), densitySequence: first.styleBriefs.map((brief) => brief.tasteDimensions.densityProfile), imageGenerationRequestCount: first.staticStage.imageGenerationRequestCount, deterministicSourceCompositeCount: first.staticStage.deterministicSourceCompositeCount, playbackMinimumReadableDurationMs: first.playbackStage.minimumReadableDurationMs, sourceAlignedPlaybackDurationMs: first.playbackStage.sourceAlignedPlaybackDurationMs, ed12VerifiedEntityMarkCount: first.shots[0].exactSourceBindings.length, ed14ClaimBoundaryBound: first.shots[2].claimBoundary.status === "BOUND", imageGenerationPerformed: false}, null, 2));
