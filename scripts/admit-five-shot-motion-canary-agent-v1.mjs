#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench,recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState,readProjectWorkspace,withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const publicRoot=path.join(appRoot,"public");
const expected=process.argv[2];
if(!/^[a-f0-9]{64}$/u.test(String(expected||"")))throw new Error("five-shot-agent-admission-cas-required");
const audit=JSON.parse(fs.readFileSync(path.join(publicRoot,"generated/system-line/editorial-asset-workbench-v1/current-five-shot-motion-specs-v1/pixel-audit/report.json"),"utf8"));
const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const result=withProjectLock(appRoot,()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if(current.workspaceSha256!==expected)throw new Error(`five-shot-agent-admission-cas:${current.workspaceSha256}`);
  const canary=current.production.motion?.representativeCanary;
  if(canary?.status!=="PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW")throw new Error("five-shot-agent-internal-review-required");
  if(audit.status!=="PASS"||audit.failures.length||audit.sourceCanaryReportSha256!==canary.reportSha256||audit.sourceCanaryVideoSha256!==canary.video.sha256||audit.results.length!==canary.representativeShotIds.length||audit.results.some((item)=>item.status!=="PASS"))throw new Error("five-shot-agent-actual-pixel-pass-required");
  for(const artifact of [canary.video,audit.contactSheet]){const file=path.join(publicRoot,artifact.publicUrl.replace(/^\//u,""));if(!fs.existsSync(file)||shaFile(file)!==artifact.sha256)throw new Error("five-shot-agent-artifact-invalid");}
  const now=new Date().toISOString();let next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current),now));
  if(next.production.authority?.nextAction?.id!=="auto-admit-representative-motion-canary")throw new Error(`five-shot-agent-auto-review-projection-required:${next.production.authority?.nextAction?.id}`);
  next.production.motion.representativeCanary={...canary,status:"AGENT_OBJECTIVE_PASS",userVisualApproval:"NOT_REQUESTED_INTERNAL_GATE",agentReview:{contract:"A1RepresentativeMotionAgentAdmission/v1",status:"PASS",pixelAuditContactSheet:audit.contactSheet,pixelAuditSourceCanaryReportSha256:audit.sourceCanaryReportSha256,reviewedAt:now},fullFilmExpansionAllowed:true};
  next.production.motion.status="representative-agent-pass-full-film-spec-compilation-ready";next.production.motion.fullMotionAllowed=true;
  next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,now));
  if(next.production.authority?.nextAction?.id!=="compile-full-film-motion-specs")throw new Error(`five-shot-agent-next-action-invalid:${next.production.authority?.nextAction?.id}`);
  const report={contract:"A1FiveShotMotionAgentAdmission/v1",status:"PASS",sourceCanaryReportSha256:canary.reportSha256,sourcePixelAuditContactSheetSha256:audit.contactSheet.sha256,representativeShotIds:canary.representativeShotIds,userVisualApprovalSerialized:false,fullFilmExpansionAllowed:true,admittedAt:now};
  const event=createProductionEvent({workspace:current,action:"admit-five-shot-motion-canary-agent",targetId:canary.reportSha256,payload:report,now});next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;
  const committed=persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:current.workspaceSha256,files:{"current-five-shot-motion-specs-v1/agent-admission.json":report}});
  return{...report,workspaceSha256After:committed.workspaceSha256,nextAction:next.production.authority.nextAction};
});
console.log(JSON.stringify(result,null,2));
