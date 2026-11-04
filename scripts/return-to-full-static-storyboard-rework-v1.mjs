#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const expectedWorkspaceSha256=process.argv[2];
const sha=(value)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
if(!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256||""))) throw new Error("static-storyboard-rework-workspace-sha-required");
const result=withProjectLock(appRoot,()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if(current.workspaceSha256!==expectedWorkspaceSha256) throw new Error(`static-storyboard-rework-cas:${current.workspaceSha256}`);
  if(current.production.authority?.nextAction?.id!=="review-representative-motion-action-storyboard") throw new Error("static-storyboard-rework-action-storyboard-review-required");
  const now=new Date().toISOString();
  const targetShotIds=current.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items.map((item)=>item.shotId);
  const body={contract:"A1FullStaticStoryboardReworkDecision/v1",status:"FULL_STATIC_STORYBOARD_REWORK_REQUIRED",reason:"UPSTREAM_STATIC_STORYBOARD_NOT_ACTION_READY",userDirective:"静帧版还没有真正做好，不该开始做动画包装。执行。",sourceApprovedBoardSha256:current.production.shotIntelligence.wholeFilmStaticBoard.sha256,rejectedCanaryReportSha256:current.production.motion.representativeCanary.reportSha256,rejectedActionStoryboardReportSha256:current.production.motion.actionStoryboard.reportSha256,targetShotIds,animationFrozen:true,requestedAt:now};
  const decision={...body,decisionSha256:sha(body)};
  let next=structuredClone(current);
  next.production.staticStoryboardRework={...decision,candidate:null,userVisualApproval:"PENDING"};
  next.production.motion.actionStoryboard={...next.production.motion.actionStoryboard,status:"HISTORY_READ_ONLY_REJECTED_UPSTREAM_STATIC_INCOMPLETE",current:false,renderAllowed:false};
  next.production.motion.status="frozen-pending-full-static-storyboard-rework";
  next.production.generation.workerStatus="frozen";next.production.generation.automaticDispatchAllowed=false;
  next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,now));
  if(next.production.authority?.nextAction?.id!=="build-full-static-storyboard-rework") throw new Error(`static-storyboard-rework-next-action-invalid:${next.production.authority?.nextAction?.id}`);
  const event=createProductionEvent({workspace:current,action:"return-to-full-static-storyboard-rework",targetId:decision.decisionSha256,payload:decision,now});
  next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;
  const committed=persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:current.workspaceSha256,commitId:`return-static-storyboard-${now.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{"full-static-storyboard-rework-v1/decision.json":decision}});
  return{status:decision.status,decisionSha256:decision.decisionSha256,workspaceSha256After:committed.workspaceSha256,nextAction:next.production.authority.nextAction,animationFrozen:true};
});
console.log(JSON.stringify(result,null,2));
