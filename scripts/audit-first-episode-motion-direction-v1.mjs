#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const planFile = path.join(root, "work/first-episode-motion-direction-v1/plan.json");
const ledgerFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/current-visual-decision-ledger-v1/ledger.json");
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
const ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
const {planSha256, ...body} = plan;

assert.equal(plan.contract, "A1FirstEpisodeMotionDirection/v1");
assert.equal(plan.status, "PLANNING_READY_STATIC_APPROVAL_REQUIRED");
assert.equal(plan.planningOnly, true);
assert.equal(plan.productionMotionAllowed, false);
assert.equal(planSha256, sha256(body));
assert.equal(plan.source.ledgerSha256, ledger.ledgerSha256);
assert.equal(plan.source.boardSha256, ledger.board.sha256);
assert.equal(plan.scenes.length, 34);
assert.equal(new Set(plan.scenes.map((scene) => scene.shotId)).size, 34);
assert.deepEqual(plan.scenes.map((scene) => scene.shotId), ledger.entries.map((entry) => entry.shotId));
assert.ok(plan.scenes.every((scene) => scene.pptLikeForbidden && scene.wholeFrameEntranceForbidden && scene.sourceIdentityPreserved));
assert.ok(plan.scenes.filter((scene) => scene.sceneClass === "SEMANTIC_PACKAGE_ACTION").every((scene) => scene.semanticAction && scene.dominantActor && scene.fullCardMoveForbidden));
assert.ok(plan.scenes.filter((scene) => scene.sceneClass === "VERIFIED_SCREEN_OPERATION").every((scene) => scene.fabricatedClickForbidden && scene.fakeUiForbidden && scene.realSourcePixelsRequired));
assert.ok(plan.scenes.filter((scene) => scene.sceneClass === "PRESENTER_SOURCE_HOLD").every((scene) => scene.motionPrimitive === "DIRECT_SOURCE_PLAYBACK" && scene.graphicActorCount === 0 && scene.presenterFaceSafe));
assert.equal(plan.engineDecision.productionAuthority, "REMOTION_A1_MOTION_IR");
assert.equal(plan.engineDecision.hyperframes, "REVIEW_ONLY_PATTERN_PROTOTYPE_FROM_SAME_MOTION_IR");
assert.equal(plan.engineDecision.heygenAvatar, "NOT_USED_FIRST_EPISODE_REAL_PRESENTER_EXISTS");
assert.equal(plan.canary.status, "BLOCKED_UNTIL_STATIC_BOARD_USER_APPROVAL");
assert.equal(plan.canary.shotIds.length, 5);
assert.equal(plan.providerPolicy.externalOutputsMustBeDownloadedAndShaBound, true);
assert.ok(plan.antiPptContract.wholeFrameSlideInForbidden && plan.antiPptContract.cardStackAsDefaultForbidden && plan.antiPptContract.fadeScaleOnlySceneForbidden);

console.log(JSON.stringify({status: "PASS", contract: plan.contract, planSha256, shotCount: plan.scenes.length, packageActionCount: plan.scenes.filter((scene) => scene.sceneClass === "SEMANTIC_PACKAGE_ACTION").length, screenOperationCount: plan.scenes.filter((scene) => scene.sceneClass === "VERIFIED_SCREEN_OPERATION").length, presenterSourceCount: plan.scenes.filter((scene) => scene.sceneClass === "PRESENTER_SOURCE_HOLD").length, antiPptContract: "PASS", productionMotionAllowed: plan.productionMotionAllowed}, null, 2));
