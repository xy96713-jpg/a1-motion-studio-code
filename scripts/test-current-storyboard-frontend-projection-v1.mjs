#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const workbenchRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const bootstrap = JSON.parse(fs.readFileSync(path.join(workbenchRoot, "client-bootstrap.json"), "utf8"));
const receipt = JSON.parse(fs.readFileSync(path.join(workbenchRoot, "transition-receipt.json"), "utf8"));
const workspace = bootstrap.workspace;
const authority = workspace?.production?.shotIntelligence?.currentStoryboardAuthority;
const coverage = workspace?.production?.shotVisualCoveragePlan?.shotPlans || [];
const review540p = workspace?.production?.release?.review540p;
const motionPlan = workspace?.production?.motion?.fullFilmMotionSpecPlan;

assert.equal(bootstrap.contract, "A1EditorialWorkbenchClientBootstrap/v1");
assert.equal(bootstrap.snapshotKind, "PACKAGING_ONLY");
assert.equal(bootstrap.workspaceSha256, receipt.workspaceSha256);
const screenStoryboardReview=workspace.production.authority?.nextAction?.id==="review-screen-storyboard-wave-15";
if(screenStoryboardReview){
  assert.equal(authority?.contract,"A1CurrentStoryboardAuthority/v1");
  assert.equal(authority?.shots?.length,34);
  assert.equal(authority?.screenStoryboardWave?.status,"READY_FOR_USER_SHOT_BY_SHOT_REVIEW");
  assert.equal(authority?.screenStoryboardWave?.shotIds?.length,15);
  const eventSettle=authority?.screenStoryboardWave?.version==="EVENT_SETTLE_V1";
  const evidenceTyped=authority?.screenStoryboardWave?.version==="EVIDENCE_TYPED_SCREEN_EMPHASIS_V1";
  assert.match(authority?.screenStoryboardWave?.contactSheet?.publicUrl||"",evidenceTyped?/screen-storyboard-wave-15-v4-evidence-emphasis\/evidence-emphasis-grammar-overview\.png$/u:eventSettle?/screen-storyboard-wave-15-v3-event-settle\/event-settle-wave15-contact-sheet\.png$/u:/screen-storyboard-wave-15-v2\/screen-storyboard-wave-15-v2-contact-sheet\.png$/u,"current-review-must-project-current-wave-contact-sheet");
  assert.ok(fs.existsSync(path.join(publicRoot,authority.screenStoryboardWave.contactSheet.publicUrl.replace(/^\//u,""))),"current-wave-contact-sheet-must-exist");
  assert.match(authority?.screenStoryboardWave?.continuousReview?.publicUrl||"",evidenceTyped?/screen-storyboard-wave-15-v4-evidence-emphasis\/evidence-emphasis-wave15-review-reel-960x540\.mp4$/u:eventSettle?/screen-storyboard-wave-15-v3-event-settle\/event-settle-wave15-review-reel-960x540\.mp4$/u:/screen-storyboard-wave-15-v2\/wave15-coverage-review-reel-960x540\.mp4$/u,"current-review-must-project-continuous-reel");
  assert.ok(fs.existsSync(path.join(publicRoot,authority.screenStoryboardWave.continuousReview.publicUrl.replace(/^\//u,""))),"continuous-review-reel-must-exist");
  if(evidenceTyped){assert.match(authority?.screenStoryboardWave?.curatedReview?.sequenceOverview?.publicUrl||"",/screen-storyboard-wave-15-v4-evidence-emphasis\/evidence-emphasis-sequence-overview\.png$/u,"evidence-typed-wave-must-project-sequence-overview");assert.ok(fs.existsSync(path.join(publicRoot,authority.screenStoryboardWave.curatedReview.sequenceOverview.publicUrl.replace(/^\//u,""))),"sequence-overview-must-exist");}
  assert.equal(authority?.screenStoryboardWave?.screenCoverage?.routeShotCount,16);
  assert.equal(authority?.screenStoryboardWave?.screenCoverage?.reviewReadyCount,15);
  assert.deepEqual(authority?.screenStoryboardWave?.screenCoverage?.blockedShotIds,["ED-20"]);
  assert.equal(coverage.length,0,"screen-storyboard-snapshot-uses-authority-without-heavy-coverage-plan");
  assert.notEqual(review540p?.status,"READY_FOR_USER_WHOLE_FILM_REVIEW");
  assert.notEqual(motionPlan?.status,"READY");
}
else{assert.equal(authority,undefined,"540p-review-must-not-ship-full-storyboard-authority");assert.equal(coverage.length,0,"540p-review-must-not-ship-full-coverage-plan");assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard?.status,"APPROVED");assert.equal(workspace.production.authority?.currentStage,"whole-film-540p-review");assert.equal(workspace.production.authority?.nextAction?.id,"review-current-whole-film-540p");assert.equal(review540p?.status,"READY_FOR_USER_WHOLE_FILM_REVIEW");assert.equal(motionPlan?.status,"READY");assert.equal(motionPlan?.readyShotIds?.length,34);assert.equal(motionPlan?.blockedShotIds?.length,0);}

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1CurrentStoryboardFrontendProjectionTest/v1",
  shotCount: workspace.article.shotCount,
  coverageCount: coverage.length,
  storyboardAuthorityOmitted: authority === undefined,
  screenStoryboardReview,
  motionSpecReadyCount: motionPlan?.readyShotIds?.length||0,
  workspaceSha256: bootstrap.workspaceSha256,
}, null, 2));
