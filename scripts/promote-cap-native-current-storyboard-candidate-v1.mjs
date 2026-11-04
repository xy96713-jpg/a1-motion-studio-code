#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState,readProjectWorkspace,withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const appRoot=path.join(root,"apps/studio-next");
const shotId=process.env.A1_CAP_NATIVE_SHOT_ID||"ED-04";
const receiptPath=path.join(root,"work/cap-native-production-v2/candidates",shotId,"receipt.json");
const receipt=JSON.parse(fs.readFileSync(receiptPath,"utf8"));
assert.equal(receipt.status,"READY_FOR_USER_SHOT_REVIEW");
assert.equal(receipt.shotId,shotId);
const videoPath=path.join(root,receipt.video.path);
const captureRoot=path.dirname(videoPath);
const contactPath=path.join(captureRoot,`${shotId.toLowerCase()}-current-storyboard-contact.png`);
const captureReportPath=path.join(captureRoot,"report.json");
for (const file of [videoPath,contactPath,captureReportPath]) assert.ok(fs.existsSync(file),`cap-promotion-file-missing:${file}`);
const fileSha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(fileSha(videoPath),receipt.video.sha256);
const now=new Date().toISOString();
const family="current-storyboard-authority-v1/cap-native";
const videoName=`${shotId}-current-${receipt.sourceStoryboardRevisionSha256.slice(0,12)}.mp4`;
const posterName=`${shotId}-current-${receipt.sourceStoryboardRevisionSha256.slice(0,12)}-contact.png`;
const videoPublicUrl=`/generated/system-line/editorial-asset-workbench-v1/${family}/${videoName}`;
const posterPublicUrl=`/generated/system-line/editorial-asset-workbench-v1/${family}/${posterName}`;

const result=await withProjectLock(appRoot,async()=>{
  const current=readProjectWorkspace(appRoot);
  assert.equal(current.workspaceSha256,receipt.sourceWorkspaceSha256,"cap-promotion-workspace-drift");
  const next=structuredClone(current);
  const runtime=next.production.shotIntelligence;
  const shot=runtime.currentStoryboardAuthority.shots.find((item)=>item.shotId===shotId);
  const coverage=next.production.shotVisualCoveragePlan.shotPlans.find((item)=>item.shotId===shotId);
  const boardItem=runtime.wholeFilmStaticBoard.items.find((item)=>item.shotId===shotId);
  const timelineItem=runtime.wholeFilmStaticBoard.timelineBoard.items.find((item)=>item.shotId===shotId);
  assert.ok(shot&&coverage&&timelineItem,"cap-promotion-storyboard-target-missing");
  assert.equal(shot.versionId,receipt.sourceStoryboardVersionId,"cap-promotion-version-drift");
  assert.equal(shot.revisionSha256,receipt.sourceStoryboardRevisionSha256,"cap-promotion-revision-drift");
  const binding={
    contract:"A1CapNativeCurrentStoryboardBinding/v1",
    status:"CURRENT_USER_CONFIRMED_DIRECTION",
    videoPublicUrl,videoSha256:receipt.video.sha256,
    posterPublicUrl,posterSha256:fileSha(contactPath),
    candidateReceiptSha256:receipt.receiptSha256,
    cameraRecipeSha256:receipt.cameraRecipe.recipeSha256,
    sourceWorkspaceSha256:receipt.sourceWorkspaceSha256,
    sourceStoryboardVersionId:receipt.sourceStoryboardVersionId,
    sourceStoryboardRevisionSha256:receipt.sourceStoryboardRevisionSha256,
    userVisualApproval:"APPROVED_BY_USER",
    productionAdmission:false,
    promotedAt:now,
  };
  Object.assign(shot,{artifactPublicUrl:posterPublicUrl,artifactSha256:binding.posterSha256,assetBindingStatus:"CURRENT_USER_CONFIRMED_DIRECTION",capNativeCandidate:binding,reviewOnly:true,productionAdmission:false,userVisualApproval:"APPROVED_BY_USER"});
  Object.assign(coverage,{preview:{publicUrl:posterPublicUrl,sha256:binding.posterSha256,width:1920,height:360},actualVisualReady:true,planOnly:false,semanticRecompileRequired:false,productionStatus:"CURRENT_USER_CONFIRMED_DIRECTION",storyboardRevisionStatus:"CURRENT_USER_CONFIRMED_DIRECTION",capNativeCandidate:binding});
  for (const item of [boardItem,timelineItem].filter(Boolean)) Object.assign(item,{artifactPublicUrl:posterPublicUrl,artifactSha256:binding.posterSha256,previewPublicUrl:posterPublicUrl,previewSha256:binding.posterSha256,currentStoryboardVersionId:shot.versionId,currentStoryboardVersionStatus:"CURRENT_USER_CONFIRMED_DIRECTION",capNativeCandidate:binding,reviewOnly:true,productionAdmission:false});
  runtime.currentStoryboardAuthority.status="PENDING_USER_APPROVAL";
  runtime.currentStoryboardAuthority.userVisualApproval="NOT_APPROVED";
  runtime.currentStoryboardAuthority.productionAdmission=false;
  runtime.currentStoryboardAuthority.motionAllowed=false;
  runtime.currentStoryboardAuthority.updatedAt=now;
  runtime.currentStoryboardAuthority.lastEditedShotId=shotId;
  runtime.wholeFilmStaticBoard.status="PENDING_USER_APPROVAL";
  runtime.wholeFilmStaticBoard.userVisualApproval="NOT_APPROVED";
  runtime.wholeFilmStaticBoard.productionAdmission=false;
  if (next.production.motion) {next.production.motion.fullMotionAllowed=false;next.production.motion.status="storyboard-cap-candidate-promoted-review-required";}
  if (next.production.release?.review540p) next.production.release.review540p.status="blocked-by-current-storyboard-source-change";
  if (next.production.release?.final1080p) next.production.release.final1080p.status="blocked-by-current-storyboard-source-change";
  const recalculated=recalculateEditorialAssetWorkbench(next,now);
  const event=createProductionEvent({workspace:current,action:"promote-cap-native-current-storyboard-candidate",targetId:shotId,payload:{...binding,userConfirmedDirection:true},now});
  recalculated.production.eventLedger.eventCount+=1;
  recalculated.production.eventLedger.lastEventId=event.eventId;
  recalculated.production.eventLedger.lastEventAt=event.createdAt;
  await persistProjectState(appRoot,recalculated,{event,expectedWorkspaceSha256:current.workspaceSha256,binaryFiles:{[`${family}/${videoName}`]:fs.readFileSync(videoPath),[`${family}/${posterName}`]:fs.readFileSync(contactPath)},files:{[`${family}/${shotId}-candidate-receipt.json`]:receipt,[`${family}/${shotId}-capture-report.json`]:JSON.parse(fs.readFileSync(captureReportPath,"utf8")),[`${family}/${shotId}-promotion.json`]:{contract:"A1CapNativeCurrentStoryboardPromotion/v1",status:"PASS",shotId,binding,workspaceSha256Before:current.workspaceSha256,workspaceSha256After:recalculated.workspaceSha256,promotedAt:now}}});
  return {workspace:recalculated,binding};
});
console.log(JSON.stringify({status:"PASS",shotId,workspaceSha256:result.workspace.workspaceSha256,binding:result.binding,wholeFilmUserVisualApproval:result.workspace.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval,productionAdmission:false},null,2));
