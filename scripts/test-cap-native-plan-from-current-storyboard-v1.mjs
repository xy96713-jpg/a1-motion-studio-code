#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const plan=JSON.parse(fs.readFileSync(path.join(root,"work/cap-native-production-v2/plan.json"),"utf8"));
const workspace=JSON.parse(fs.readFileSync(path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"),"utf8"));
const authorizedShotIds=workspace.production.screenCaptureAuthorization.targetShotIds;
assert.equal(plan.contract,"A1CapNativeStoryboardExecutionPlan/v1");
assert.equal(plan.status,"READY");
assert.equal(plan.summary.shotCount,authorizedShotIds.length);
assert.deepEqual(plan.shots.map((shot)=>shot.shotId),authorizedShotIds);
assert.ok(plan.shots.every((shot)=>shot.authority.versionId&&shot.authority.revisionSha256&&shot.authority.actionContract&&shot.authority.timeRange));
assert.ok(plan.shots.every((shot)=>shot.execution.actionId&&shot.execution.expectedProductIdentity==="A1_WRITING_WORKBENCH_V2"));
assert.ok(plan.shots.every((shot)=>shot.execution.cameraRecipe?.contract==="A1CapStoryboardCameraRecipe/v1"&&shot.execution.cameraRecipe.recipeSha256));
assert.ok(plan.shots.every((shot)=>shot.execution.cameraRecipe.intent==="SEMANTIC_INTERACTION_TIMELINE"&&shot.execution.cameraRecipe.interactionIntent?.contract==="A1ScreenInteractionIntent/v1"));
assert.ok(plan.shots.every((shot)=>{
  const intent=shot.execution.cameraRecipe.interactionIntent;
  const expectedZooms=intent.directorFamily.target==="NONE"?0:1;
  return intent.maximumSemanticZooms===expectedZooms&&intent.minimumResultHoldMs===800;
}));
assert.ok(plan.shots.every((shot)=>shot.execution.cameraRecipe.interactionIntent.coveragePolicy?.contract==="A1ScreenCoverageDirector/v1"));
assert.ok(plan.shots.every((shot)=>shot.execution.cameraRecipe.interactionIntent.coveragePolicy?.hardCutsOnly===true&&shot.execution.cameraRecipe.interactionIntent.coveragePolicy?.continuousPanForbidden===true));
assert.equal(plan.policy.solePlanningAuthority,"workspace.production.shotIntelligence.currentStoryboardAuthority");
assert.equal(plan.policy.titleOnlyWindowSelectionForbidden,true);
console.log(JSON.stringify({status:"PASS",contract:"A1CapNativeStoryboardExecutionPlanTest/v1",shotCount:plan.shots.length,captureRequiredCount:plan.summary.captureRequiredCount},null,2));
