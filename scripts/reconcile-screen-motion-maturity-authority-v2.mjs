#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench,recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState,readProjectWorkspace,withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(import.meta.dirname,".."),appRoot=path.join(root,"apps/studio-next"),expected=process.argv[2];
if(!/^[a-f0-9]{64}$/u.test(String(expected||"")))throw new Error("screen-motion-authority-cas-required");
const result=withProjectLock(appRoot,()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if(current.workspaceSha256!==expected)throw new Error(`screen-motion-authority-cas:${current.workspaceSha256}`);
  const candidate=current.production.motion.screenMotionMaturityMasters;
  if(candidate?.status!=="READY_FOR_USER_ACTUAL_PIXEL_REVIEW"||candidate?.policy?.storyboardSemanticsBeforeMotion!==true)throw new Error("semantic-screen-motion-candidate-required");
  const now=new Date().toISOString(),next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current),now)),action=next.production.authority.nextAction;
  if(action?.id!=="review-screen-motion-maturity-masters"||!action.label.includes("语义适配")||!action.label.includes("稳定结果停留"))throw new Error(`semantic-screen-motion-authority-invalid:${action?.id}:${action?.label}`);
  const event=createProductionEvent({workspace:current,action:"reconcile-screen-motion-maturity-authority-v2",targetId:candidate.auditSha256,payload:{auditSha256:candidate.auditSha256,reviewVideoSha256:candidate.reviewVideo.sha256,nextActionLabel:action.label,userVisualApproval:"NOT_APPROVED",productionAdmission:false},now});
  next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;
  const committed=persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:current.workspaceSha256});
  return{status:"PASS",workspaceSha256After:committed.workspaceSha256,nextAction:action};
});
console.log(JSON.stringify(result,null,2));
