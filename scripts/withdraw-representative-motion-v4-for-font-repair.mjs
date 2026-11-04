#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const phaseRoot=path.join(appRoot,"public/generated/system-line/editorial-asset-workbench-v1");
const expected=process.argv[2];
if(!/^[a-f0-9]{64}$/u.test(String(expected||"")))throw new Error("withdraw-v4-font-repair-expected-workspace-sha-required");
const read=(name)=>JSON.parse(fs.readFileSync(path.join(phaseRoot,name),"utf8"));
const v2Plan=read("approved-master-layer-motion-pilot-v2/plan.json");
const v2Props=read("approved-master-layer-motion-pilot-v2/input-props.json");
const v2Report=read("approved-master-layer-motion-pilot-v2/render-report.json");
const v2Review=read("approved-master-layer-motion-pilot-v2/actual-visual-review.json");
const result=await withProjectLock(appRoot,()=>{
 const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
 if(current.workspaceSha256!==expected)throw new Error(`withdraw-v4-font-repair-cas-failed:${current.workspaceSha256}`);
 const v4=current.production.shotIntelligence.representativeApprovedMasterMotionPilot;
 if(!String(v4?.publicUrl||"").includes("approved-master-layer-motion-pilot-v4"))throw new Error("withdraw-v4-font-repair-current-v4-required");
 const now=new Date().toISOString();
 const superseded=[...(v4.supersededPreviews||[]),{status:"WITHDRAWN_FOR_PIXEL_FONT_ACTUAL_VISUAL_REPAIR",video:v4.video,planSha256:v4.planSha256,reportSha256:v4.reportSha256,supersededAt:now}];
 let next=structuredClone(current);
 next.production.shotIntelligence.representativeApprovedMasterMotionPilot={contract:v2Plan.contract,status:v2Review.status,planSha256:v2Plan.planSha256,propsSha256:v2Props.propsSha256,reportSha256:v2Report.reportSha256,shotIds:v2Plan.shotIds,durationMs:v2Plan.durationMs,placementGate:v2Plan.placementGate,reviewOnly:true,promotedRender:false,video:v2Report.artifacts.video,contactSheet:v2Report.artifacts.contactSheet,actualPixelGate:{status:"PASS",shotCount:5,failedShotIds:[],thresholds:v2Report.thresholds},actualVisualReviewStatus:"PASS",actualVisualReviewSha256:v2Review.reviewSha256,timelineContactSheet:v2Review.timelineContactSheet,wholeFilmMotionPlanCompilationAllowed:false,wholeFilmLayerExpansionAllowed:false,wholeFilmMotionRenderAllowed:false,wholeFilmMotionAllowed:false,supersededPreviews:superseded,publicUrl:"/generated/system-line/editorial-asset-workbench-v1/approved-master-layer-motion-pilot-v2/plan.json",updatedAt:now};
 next.production.motion={...next.production.motion,status:"preview-ready-for-review",previewArtifact:v2Report.artifacts.video,representativePlan:{contract:v2Plan.contract,sha256:v2Plan.planSha256,shotIds:v2Plan.shotIds,durationMs:v2Plan.durationMs,reviewOnly:true},review:{status:"objective-pass-awaiting-user-visual-review",score:null,maxScore:24,hardFailures:[],reviewedAt:now},fullMotionAllowed:false,motionApproved:false,aeLevelProven:false,updatedAt:now};
 next.production.assembly={...next.production.assembly,productionWired:false,userVisualApproval:"NOT_APPROVED"};
 next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,now));
 const event=createProductionEvent({workspace:current,action:"withdraw-representative-motion-v4-for-font-repair",targetId:"ED-31",payload:{withdrawnVideoSha256:v4.video.sha256,restoredV2VideoSha256:v2Report.artifacts.video.sha256,reason:"A1_FUSION_PIXEL_ACTUAL_GLYPH_REQUIRED"},now});
 next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;
 const committed=persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:current.workspaceSha256,commitId:`withdraw-v4-font-repair-${now.replace(/[-:.TZ]/gu,"").slice(0,14)}`});
 return{status:"V4_WITHDRAWN_FOR_PIXEL_FONT_REPAIR",workspaceSha256After:committed.workspaceSha256,transitionSha256:committed.transitionSha256,currentVideo:v2Report.artifacts.video};
});
console.log(JSON.stringify(result,null,2));
