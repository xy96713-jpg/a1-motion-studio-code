#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/current-production-lanes-v1.json");
const lanes = JSON.parse(fs.readFileSync(file, "utf8"));
assert.equal(lanes.contract, "A1CurrentProductionLanes/v1");
assert.equal(lanes.status, "PASS");
assert.ok(lanes.source.packagingDirectorPlanSha256);
assert.equal(lanes.shots.length, 34);
assert.equal(lanes.approvalPolicy.preflight, "APPROVE_WHOLE_FILM_STORYBOARD_ONCE");
assert.equal(lanes.approvalPolicy.perShotApproval, "EXCEPTION_ONLY_ON_AUTHORITY_OR_CONTRACT_CHANGE");
assert.equal(lanes.ordering.staticBeforeMotion, true);
assert.equal(lanes.ordering.screenCaptureMayRunInParallelWithStaticMaster, true);
assert.equal(lanes.ordering.presenterMayRunInParallelWithStaticMaster, true);
const groups = new Map(lanes.groups.map((group) => [group.id, group]));
assert.equal(groups.get("PACKAGE_STATIC_MASTER").shotIds.length, 11);
assert.equal(groups.get("SCREEN_CAPTURE_PREP").shotIds.length, 16);
assert.equal(groups.get("PRESENTER_SOURCE").shotIds.length, 7);
assert.equal(groups.get("XIAOYUNQUE_MOTION").shotIds.length, 3);
assert.equal(groups.get("LOCAL_DETERMINISTIC_MOTION").shotIds.length, 3);
assert.equal(groups.get("LOCAL_EVIDENCE_MOTION").shotIds.length, 1);
assert.equal(groups.get("PACKAGE_COMPOSITION").shotIds.length, 4);
assert.equal(groups.get("SCREEN_CAP_NATIVE").shotIds.length, 16);
for (const shot of lanes.shots) {
  assert.ok(shot.shotId && shot.lane && shot.prerequisite && shot.nextAction);
  assert.ok(shot.sourceBinding || shot.sourceBindingFailure, `binding-result-required:${shot.shotId}`);
  if (shot.sourceBinding) {
    assert.equal(shot.sourceBinding.contract, "A1CurrentStoryboardAssetBinding/v1");
    assert.equal(shot.sourceBinding.shotId, shot.shotId);
    assert.equal(shot.sourceBinding.candidateDiscoveryAllowed, false);
    assert.equal(shot.sourceBinding.locks.filenameSearchSelectionForbidden, true);
    assert.equal(shot.directorPlanSha256, lanes.source.packagingDirectorPlanSha256);
    assert.equal(shot.directorPlanStatus, "READY");
    assert.equal(shot.motionDesignContract?.contract, "A1StoryboardMotionDesignContract/v1");
  } else {
    assert.equal(shot.nextAction, "REPAIR_CURRENT_STORYBOARD_ASSET_BINDING");
  }
  if (shot.lane === "XIAOYUNQUE_MOTION") assert.equal(shot.prerequisite, "PACKAGE_STATIC_MASTER");
  if (shot.lane === "LOCAL_DETERMINISTIC_MOTION") {
    assert.equal(
      shot.motionDesignContract.exactIdentityBinding || shot.motionDesignContract.formalCopyRequired,
      true,
      `local-deterministic-requires-identity-or-formal-copy:${shot.shotId}`,
    );
  }
  if (shot.lane === "LOCAL_EVIDENCE_MOTION") assert.equal(shot.motionDesignContract.source.artifactSha256, shot.sourceBinding.artifactSha256);
  if (shot.lane === "SCREEN_CAP_NATIVE") assert.equal(shot.prerequisite, "SCREEN_CAPTURE_PREP");
}
console.log(JSON.stringify({status: "PASS", contract: "A1CurrentProductionLanesTest/v1", shotCount: lanes.shots.length, groups: Object.fromEntries([...groups].map(([id, group]) => [id, group.shotIds.length]))}, null, 2));
