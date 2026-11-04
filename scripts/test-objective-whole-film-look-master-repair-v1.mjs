#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {buildPackageLookMasterPrompt} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const workspace = readProjectWorkspace(appRoot);
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "objective-whole-film-look-master-repair-v1/manifest.json"), "utf8"));
const plans = new Map(workspace.production.shotIntelligence.packageLookMasterPlans.map((item) => [item.shotId, item]));
const expectedShotIdsArg = process.argv.find((value) => value.startsWith("--expectedShotIds="))?.slice("--expectedShotIds=".length);
const expectedShotIds = expectedShotIdsArg ? expectedShotIdsArg.split(",").map((value) => value.trim()).filter(Boolean) : ["ED-16", "ED-17"];
const expectedProtectedPhrases = new Map([
  ["ED-01", ["用 vibe coding 做的", "智能写作工作台"]],
  ["ED-16", ["材料不够", "角度不清", "泛泛而谈"]],
  ["ED-17", ["先给材料", "再找角度", "最后再让 AI 动笔"]],
  ["ED-34", ["真正写出自己的风格"]],
]);

assert.equal(manifest.contract, "A1ObjectiveWholeFilmLookMasterRepair/v1");
assert.equal(manifest.status, "GENERATION_REQUIRED");
assert.deepEqual(manifest.targetShotIds, expectedShotIds);

for (const shotId of manifest.targetShotIds) {
  const plan = plans.get(shotId);
  assert.ok(plan, `target plan missing: ${shotId}`);
  assert.equal(plan.provisionalWholeFilmBoardSelection, null, `target selection must be cleared: ${shotId}`);
  assert.deepEqual(plan.displayProtectedPhrases, expectedProtectedPhrases.get(shotId));
  assert.equal(plan.fullLookMasterRepairDirective.status, "STRUCTURAL_RETRY_REQUIRED");
  assert.equal(plan.referencePackaging.contract, "A1UniversalReferenceToImagegenPackaging/v1");
  for (let candidateIndex = 1; candidateIndex <= 2; candidateIndex += 1) {
    const prompt = buildPackageLookMasterPrompt(plan, candidateIndex, {generationMode: "LOOK_MASTER_REFERENCE_ATTACHED"});
    assert.match(prompt, /attached real images are mandatory multimodal inputs/iu);
    assert.match(prompt, /Design the complete 16:9 frame/iu);
    assert.match(prompt, /warm-yellow, cream, beige, sepia, or old-paper dominant background is forbidden/iu);
    if (plan.baseVisualCarrier === "PRESENTER_BASE") {
      assert.match(prompt, /true transparent alpha overlay/iu);
      assert.match(prompt, /every visible pixel must stay within x=/iu);
      assert.match(prompt, /EDITOR_SELECTS_OPEN_REGION_AT_INSERTION/iu);
    } else {
      assert.doesNotMatch(prompt, /every visible pixel must stay within x=/iu);
      assert.doesNotMatch(prompt, /EDITOR_SELECTS_OPEN_REGION_AT_INSERTION/iu);
    }
  }
}

const currentTargetRawReferences = (workspace.production.shotIntelligence.lookMasterRawReferences || [])
  .filter((item) => manifest.targetShotIds.includes(item.shotId) && item.current === true);
assert.equal(currentTargetRawReferences.length, 0, "target raw references must be retired from current authority");
const threeAnchorReview = workspace.production.threeAnchorVisualRepairReview;
if (JSON.stringify(manifest.targetShotIds) === JSON.stringify(["ED-01", "ED-17", "ED-34"])) {
  assert.equal(threeAnchorReview.contract, "A1ThreeAnchorVisualRepairCheckpoint/v1");
  assert.equal(threeAnchorReview.status, "READY_FOR_USER_VISUAL_REVIEW");
  assert.deepEqual(threeAnchorReview.targetShotIds, manifest.targetShotIds);
  assert.equal(threeAnchorReview.actualPixelReview.status, "PASS_AGENT_RECOMMENDS_USER_REVIEW");
  assert.equal(threeAnchorReview.actualPixelReview.userVisualApproval, "NOT_APPROVED");
  assert.equal(workspace.production.authority.nextAction.id, "review-three-anchor-visual-repair");
  assert.equal(workspace.production.authority.nextAction.requiresUser, true);
  assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.status, "VISUAL_REPAIR_REQUIRED");
  assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.approvalAllowed, false);
}

const nonTargets = workspace.production.canonicalCreatorPackagingSequence.decisions
  .filter((item) => item.packageDecision === "PACKAGE" && !manifest.targetShotIds.includes(item.shotId));
const packageCount = workspace.production.canonicalCreatorPackagingSequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length;
assert.equal(nonTargets.length, packageCount - manifest.targetShotIds.length);
assert.ok(nonTargets.every((item) => plans.get(item.shotId)?.provisionalWholeFilmBoardSelection?.artifact?.sha256));
assert.ok(workspace.production.creatorPaletteShotBindingManifest.passCount >= 11 && workspace.production.creatorPaletteShotBindingManifest.passCount <= 13);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);

console.log(JSON.stringify({status: "PASS", targetShotIds: manifest.targetShotIds, nonTargetSelectedCount: nonTargets.length, bindingPassCount: workspace.production.creatorPaletteShotBindingManifest.passCount, bindingBlockedShotIds: workspace.production.creatorPaletteShotBindingManifest.blockedShotIds, queue: workspace.production.generation.summary.queued, running: workspace.production.generation.summary.running, worker: workspace.production.generation.workerStatus}, null, 2));
