#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {readProductionState, assertProductionState} from "../apps/studio-next/src/lib/a1-production-state-v1.mjs";
import {compileMotionStoryboard, assertMotionStoryboard, A1_MOTION_TEMPLATES} from "../apps/studio-next/src/lib/a1-motion-storyboard-contract-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const state = assertProductionState(readProductionState({appRoot: path.join(root, "apps/studio-next")}));
const storyboard = assertMotionStoryboard(compileMotionStoryboard(state));
assert.equal(state.contract, "A1ProductionState/v1");
assert.equal(state.visualAuthority.id, "presenter-light-overlay-system-v2");
assert.equal(state.gates.generationAllowed, false);
assert.equal(state.gates.motionAllowed, false);
assert.ok(storyboard.shotCount > 0);
assert.equal(storyboard.productionAllowed, false);
assert.ok(storyboard.shots.every((shot) => shot.sourceBoardManifestSha256 === state.source.boardManifestSha256));
assert.ok(storyboard.shots.every((shot) => !shot.template || A1_MOTION_TEMPLATES.includes(shot.template)));
assert.ok(storyboard.shots.filter((shot) => shot.motionProvider === "XIAOYUNQUE_CANDIDATE").every((shot) => shot.motionDesignContract?.executionRoute === "XIAOYUNQUE_MOTION"));
assert.ok(storyboard.shots.filter((shot) => shot.motionDesignContract?.exactIdentityBinding === true).every((shot) => shot.motionProvider === "REMOTION_COMPOSITE" && shot.assetRoute === "EXACT_IDENTITY_BINDINGS"));
console.log(JSON.stringify({status:"PASS", contract:"A1ProductionCreativeSystemContractTest/v1", stage:state.stage, shotCount:storyboard.shotCount, motionStoryboardStatus:storyboard.status, missingActionShotIds:storyboard.missingActionShotIds, prototypeShotIds:storyboard.prototypeShotIds, generationLocked:state.gates.generationAllowed === false, motionLocked:state.gates.motionAllowed === false}, null, 2));
