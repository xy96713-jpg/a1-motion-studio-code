import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertTasteBoundBoundedCanaryPlan, buildTasteBoundBoundedCanaryPlan} from "../apps/studio-next/src/lib/a1-taste-bound-bounded-canary-plan-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const now = "2026-08-12T15:30:00.000Z";
const first = assertTasteBoundBoundedCanaryPlan(buildTasteBoundBoundedCanaryPlan(workspace, {appRoot, now}));
const second = assertTasteBoundBoundedCanaryPlan(buildTasteBoundBoundedCanaryPlan(workspace, {appRoot, now}));
const differentWallClock = assertTasteBoundBoundedCanaryPlan(buildTasteBoundBoundedCanaryPlan(workspace, {appRoot, now: "2026-08-13T03:00:00.000Z"}));
assert.equal(first.planSha256, second.planSha256);
assert.equal(first.planSha256, differentWallClock.planSha256);
assert.deepEqual(first.waves.map((wave) => wave.shotIds), [["ED-10", "ED-31"], ["ED-13"]]);
assert.equal(first.executionPolicy.globalMaxConcurrentJobs, 2);
assert.equal(first.proof.imageGenerationPerformed, false);
assert(first.shots.every((shot) => shot.execution.candidateBudget === 1 && shot.typography.generatedFormalTextAllowed === false));
assert(first.shots.every((shot) => shot.execution.effectivePlannedDurationMs >= shot.execution.minimumReadableDurationMs && shot.execution.actualArtifactTimingReviewRequired === true && shot.execution.finalMotionAdmissionAllowed === false));
assert.equal(first.shots.find((shot) => shot.shotId === "ED-13").execution.effectivePlannedDurationMs, 4929);
assert(first.shots.every((shot) => shot.referenceInputs.every((reference) => reference.productionAssetAllowed === false)));
assert.equal(first.shots.find((shot) => shot.shotId === "ED-13").routeAuthority.status, "CURRENT_CANONICAL_OVERRIDE_APPLIED");
assert.equal(first.shots.find((shot) => shot.shotId === "ED-13").routeAuthority.effectiveRoute.presentationMode, "FULLSCREEN");
assert.equal(first.shots.find((shot) => shot.shotId === "ED-31").productionInputs.matteLayers.length, 4);
assert.equal(first.shots.find((shot) => shot.shotId === "ED-31").review.presenterFaceBodyMicrophoneBoomPreservationRequired, true);

const routeDrift = structuredClone(workspace);
routeDrift.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === "ED-31").presentationMode = "FULLSCREEN";
assert.throws(() => buildTasteBoundBoundedCanaryPlan(routeDrift, {appRoot, now}), /video-context-route/u);

const unfrozen = structuredClone(workspace);
unfrozen.production.generation.automaticDispatchAllowed = true;
assert.throws(() => buildTasteBoundBoundedCanaryPlan(unfrozen, {appRoot, now}), /generation-not-frozen/u);

console.log(JSON.stringify({status: "PASS", contract: first.contract, planSha256: first.planSha256, waves: first.waves.map((wave) => ({waveId: wave.waveId, shotIds: wave.shotIds, maxConcurrentJobs: wave.maxConcurrentJobs})), routeOverrideShotIds: first.shots.filter((shot) => shot.routeAuthority.status === "CURRENT_CANONICAL_OVERRIDE_APPLIED").map((shot) => shot.shotId), imageGenerationPerformed: first.proof.imageGenerationPerformed}, null, 2));
