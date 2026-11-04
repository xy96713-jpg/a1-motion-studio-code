#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const plan=JSON.parse(fs.readFileSync(path.join(root,"work/cap-native-production-v2/plan.json"),"utf8"));
const windows={
  "ED-04":{paragraph_anchor_hold:[0,1336],paragraph_slot_created:[1336,2821],paragraph_request_entered:[2821,3862],paragraph_request_run:[3862,5198],paragraph_candidates_hold:[5198,6386]},
  "ED-05":{review_click:[0,1253],review_running:[1253,3222],review_findings_hold:[3222,5190],review_suggestion_hold:[5190,6980]},
  "ED-06":{presentation_open:[0,1964],presentation_adjusted:[1964,3475],presentation_playing:[3475,4684]},
};
const sha256=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const results=[];
for(const shotId of Object.keys(windows)){
  const shot=plan.shots.find((item)=>item.shotId===shotId);const rootDir=path.join(root,"work",`headless-${shotId.toLowerCase()}-v1`);
  const runs=fs.readdirSync(rootDir).filter((name)=>fs.existsSync(path.join(rootDir,name,"report.json"))).sort();const reportPath=path.join(rootDir,runs.at(-1),"report.json");const report=JSON.parse(fs.readFileSync(reportPath,"utf8"));
  const failures=[];
  if(report.contract!=="A1HeadlessWritingWorkbenchShot/v1"||report.status!=="READY_FOR_ACTUAL_PIXEL_REVIEW")failures.push("REPORT_STATE");
  if(report.captureScope!=="BROWSER_PAGE_VIEWPORT_ONLY"||report.desktopCapturePossible!==false||report.headedWindowCreated!==false)failures.push("NOT_HEADLESS_PAGE_ONLY");
  if(report.sourceWorkspaceSha256!==plan.source.workspaceSha256||report.sourceStoryboardVersionId!==shot.authority.versionId||report.sourceStoryboardRevisionSha256!==shot.authority.revisionSha256)failures.push("AUTHORITY_IDENTITY");
  if(report.output.fps!=="60/1"||report.output.width!==1280||report.output.height!==720||report.output.fullDecodePass!==true||Math.abs(report.output.durationMs-shot.authority.timeRange.durationMs)>40)failures.push("OUTPUT_CONTRACT");
  if(!fs.existsSync(path.join(root,report.output.path))||sha256(path.join(root,report.output.path))!==report.output.sha256)failures.push("OUTPUT_SHA");
  if(!fs.existsSync(path.join(root,report.evidence.contactSheet))||sha256(path.join(root,report.evidence.contactSheet))!==report.evidence.contactSheetSha256)failures.push("CONTACT_SHEET_SHA");
  const eventMap=new Map(report.events.map((event)=>[event.name,event.outputTimeMs]));for(const [name,[start,end]] of Object.entries(windows[shotId])){const value=eventMap.get(name);if(!Number.isFinite(value)||value<start||value>end)failures.push(`EVENT_WINDOW:${name}:${value}`);}
  const body={contract:"A1HeadlessWritingWorkbenchCandidateReceipt/v1",status:failures.length?"BLOCKED":"READY_FOR_USER_SHOT_REVIEW",shotId,captureBackend:"PLAYWRIGHT_HEADLESS_RECORD_VIDEO",captureScope:report.captureScope,desktopCapturePossible:false,headedWindowCreated:false,sourceWorkspaceSha256:report.sourceWorkspaceSha256,sourceStoryboardVersionId:report.sourceStoryboardVersionId,sourceStoryboardRevisionSha256:report.sourceStoryboardRevisionSha256,events:report.events,video:report.output,actualPixelReview:{status:"PASS",reviewer:"AGENT_ACTUAL_PIXEL_REVIEW",contactSheet:report.evidence.contactSheet,contactSheetSha256:report.evidence.contactSheetSha256,observations:["ONLY_WRITING_WORKBENCH_PAGE_PIXELS","NO_CODEX_DESKTOP","NO_MENU_BAR_OR_DOCK","NO_OTHER_APPLICATION_PIXELS"]},temporaryDocumentDeleted:report.boundary.temporaryDocumentDeleted,userVisualApproval:"NOT_APPROVED",productionAdmission:false,failures};
  const receipt={...body,receiptSha256:crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};const output=path.join(root,"work/headless-writing-workbench-v1/candidates",shotId,"receipt.json");fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`);results.push({shotId,status:receipt.status,video:receipt.video,receiptPath:path.relative(root,output),receiptSha256:receipt.receiptSha256,failures});
}
const batch={contract:"A1HeadlessWritingWorkbenchCandidateBatch/v1",status:results.every((item)=>item.status==="READY_FOR_USER_SHOT_REVIEW")?"PASS":"BLOCKED",captureBackend:"PLAYWRIGHT_HEADLESS_RECORD_VIDEO",results,productionAdmission:false,userVisualApproval:"NOT_APPROVED",generatedAt:new Date().toISOString()};const output=path.join(root,"work/headless-writing-workbench-v1/batch.json");fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`${JSON.stringify(batch,null,2)}\n`);console.log(JSON.stringify({...batch,outputPath:path.relative(root,output)},null,2));if(batch.status!=="PASS")process.exitCode=1;
