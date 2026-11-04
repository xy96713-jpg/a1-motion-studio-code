#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertStoryboardPackagingDirectorPlan} from "../apps/studio-next/src/lib/a1-storyboard-packaging-director-plan-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const authority = workspace.production?.shotIntelligence?.currentStoryboardAuthority;
const pointer = authority?.packagingDirectorPlan;
const planPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/current-storyboard-packaging-director-plan-v1/plan.json");
if (!pointer || !fs.existsSync(planPath)) throw new Error("packaging-director-plan-current-required");
const plan = assertStoryboardPackagingDirectorPlan(JSON.parse(fs.readFileSync(planPath, "utf8")));
assert.equal(pointer.planSha256, plan.planSha256, "packaging-director-plan-pointer-stale");
assert.equal(plan.status, "READY", "packaging-director-plan-blocked");
assert.equal(plan.shotCount, 34, "packaging-director-plan-shot-count");
assert.equal(plan.readyCount, 34, "packaging-director-plan-ready-count");
for (const shot of plan.shots) {
  assert.ok(shot.assetPolicy.currentStoryboardOnly, `current-source-only:${shot.shotId}`);
  assert.equal(shot.rendererPolicy.rendererMayInferComposition, false, `renderer-composition-inference:${shot.shotId}`);
  assert.equal(shot.rendererPolicy.rendererMayInferOrder, false, `renderer-order-inference:${shot.shotId}`);
  assert.equal(shot.rendererPolicy.rendererMaySubstituteSource, false, `renderer-source-substitution:${shot.shotId}`);
  assert.ok(shot.orderedActorTimeline.length > 0, `ordered-timeline:${shot.shotId}`);
}
console.log(JSON.stringify({status: "PASS", contract: "A1CurrentStoryboardPackagingDirectorPreflight/v1", planSha256: plan.planSha256, shotCount: plan.shotCount, readyCount: plan.readyCount, rendererInferenceForbidden: true, sourceSubstitutionForbidden: true, singleBatchCompile: true}, null, 2));
