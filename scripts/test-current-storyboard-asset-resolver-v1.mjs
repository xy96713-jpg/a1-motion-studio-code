#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertCurrentStoryboardAssetBinding, resolveCurrentStoryboardAsset} from "../apps/studio-next/src/lib/a1-current-storyboard-asset-resolver-v1.mjs";

const sha = (digit) => digit.repeat(64);
const shot = (shotId, route, packageType, source, artifactSha256 = sha("b")) => ({
  shotId,
  order: Number(shotId.slice(3)),
  current: true,
  versionId: `${shotId.toLowerCase()}-current-v1`,
  artifactPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/current/${shotId}.png`,
  artifactSha256,
  assetBindingStatus: "USER_APPROVED_FOR_WHOLE_FILM_540P_REVIEW",
  route,
  packageType,
  source,
  assetProducer: route === "PACKAGE_LOOK_MASTER" ? "IMAGEGEN_THEN_XIAOYUNQUE" : "REAL_SOURCE",
});
const workspace = {
  contract: "A1EditorialAssetWorkbench/v2",
  workspaceSha256: sha("a"),
  production: {shotIntelligence: {currentStoryboardAuthority: {
    contract: "A1CurrentStoryboardAuthority/v1",
    current: true,
    status: "APPROVED",
    userVisualApproval: "APPROVED",
    productionAdmission: true,
    lastRevisionSha256: sha("c"),
    updatedAt: "2026-09-01T00:00:00.000Z",
    shots: [
      shot("ED-01", "PACKAGE_LOOK_MASTER", "EXPLAINER_PACKAGE", "GENERATED_EDITORIAL"),
      shot("ED-02", "SCREEN_EVIDENCE", null, "REAL_SOURCE"),
      shot("ED-03", "PRESENTER_BASE", null, "REAL_SOURCE"),
    ],
  }}},
};

const packageBinding = resolveCurrentStoryboardAsset(workspace, {shotId: "ED-01"});
assert.equal(packageBinding.status, "CURRENT_PRODUCTION_BOUND");
assert.equal(packageBinding.externalGenerationEligible, true);
assert.equal(packageBinding.candidateDiscoveryAllowed, false);
assert.equal(packageBinding.locks.filenameSearchSelectionForbidden, true);
assertCurrentStoryboardAssetBinding(packageBinding, {shotId: "ED-01", artifactSha256: sha("b")});
assert.equal(resolveCurrentStoryboardAsset(workspace, {shotId: "ED-02"}).externalGenerationEligible, false);
assert.equal(resolveCurrentStoryboardAsset(workspace, {shotId: "ED-03"}).externalGenerationEligible, false);
assert.throws(() => resolveCurrentStoryboardAsset(workspace, {shotId: "ED-01", expectedVersionId: "historical-version"}), /current-storyboard-version-stale/u);
assert.throws(() => resolveCurrentStoryboardAsset(workspace, {shotId: "ED-01", expectedArtifactSha256: sha("d")}), /current-storyboard-artifact-sha-stale/u);
assert.throws(() => resolveCurrentStoryboardAsset(workspace, {shotId: "ED-01", expectedArtifactPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/candidates/wrong.png"}), /current-storyboard-artifact-url-stale/u);
const missingSha = structuredClone(workspace);
missingSha.production.shotIntelligence.currentStoryboardAuthority.shots[0].artifactSha256 = null;
assert.throws(() => resolveCurrentStoryboardAsset(missingSha, {shotId: "ED-01"}), /current-storyboard-artifact-sha-missing/u);
const stale = structuredClone(workspace);
stale.production.shotIntelligence.currentStoryboardAuthority.shots[0].assetBindingStatus = "STALE_REVIEW_REQUIRED";
assert.equal(resolveCurrentStoryboardAsset(stale, {shotId: "ED-01"}).productionEligible, false);
const partial = structuredClone(workspace);
partial.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval = "NOT_APPROVED";
partial.production.shotIntelligence.currentStoryboardAuthority.productionAdmission = false;
partial.production.storyboardLaneApprovals = [{contract: "A1StoryboardLaneApproval/v1", status: "APPROVED", laneId: "XIAOYUNQUE_MOTION", storyboardRevisionSha256: sha("c"), decisionSha256: sha("e"), approvedAt: "2026-09-01T00:01:00.000Z", items: [{shotId: "ED-01", versionId: "ed-01-current-v1", artifactSha256: sha("b")}]}];
const partialBinding = resolveCurrentStoryboardAsset(partial, {shotId: "ED-01"});
assert.equal(partialBinding.globalProductionEligible, false);
assert.equal(partialBinding.laneProductionEligible, true);
assert.equal(partialBinding.externalGenerationEligible, true);
assert.equal(resolveCurrentStoryboardAsset(partial, {shotId: "ED-02"}).productionEligible, false);

console.log(JSON.stringify({status: "PASS", contract: "A1CurrentStoryboardAssetResolverTest/v1", fixtureFamilies: ["PACKAGE_LOOK_MASTER", "SCREEN_EVIDENCE", "PRESENTER_BASE"], rejectionCases: 4, partialLaneApproval: true}, null, 2));
