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
const expectedWorkspaceSha256=process.argv[2];
const sha=(value)=>crypto.createHash("sha256").update(Buffer.isBuffer(value)||typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const shaFile=(file)=>sha(fs.readFileSync(file));
const publicPath=(url)=>path.join(publicRoot,url.replace(/^\//u,""));
if(!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256||""))) throw new Error("visual-decision-ledger-workspace-sha-required");

const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if(current.workspaceSha256!==expectedWorkspaceSha256) throw new Error(`visual-decision-ledger-workspace-cas:${current.workspaceSha256}`);
if(current.production.staticStoryboardRework?.status!=="READY_FOR_FULL_STATIC_STORYBOARD_REVIEW"||!["compile-current-visual-decision-ledger","review-full-static-storyboard-rework"].includes(current.production.authority?.nextAction?.id)||current.production.currentVisualDecisionLedger?.current===true) throw new Error("visual-decision-ledger-static-rework-authority-required");
const candidate=current.production.staticStoryboardRework.candidate;
const reportFile=path.join(path.dirname(publicPath(candidate.board.publicUrl)),"report.json");
const report=JSON.parse(fs.readFileSync(reportFile,"utf8"));
const reportHashBody=structuredClone(report);delete reportHashBody.reportSha256;delete reportHashBody.builtAt;
if(!["A1FullStaticStoryboardRework/v2","A1FullStaticStoryboardRework/v3","A1FullStaticStoryboardRework/v4"].includes(report.contract)||report.status!=="READY_FOR_FULL_STATIC_STORYBOARD_REVIEW"||report.reportSha256!==candidate.reportSha256||sha(reportHashBody)!==report.reportSha256) throw new Error("visual-decision-ledger-source-report-invalid");
if(report.shotCount!==34||report.frames.length!==34||new Set(report.frames.map((item)=>item.shotId)).size!==34) throw new Error("visual-decision-ledger-shot-set-invalid");
const boardFile=publicPath(report.board.publicUrl);
if(!fs.existsSync(boardFile)||shaFile(boardFile)!==report.board.sha256) throw new Error("visual-decision-ledger-board-invalid");
const openingRoot=path.join(root,".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1");
const openingStates=["state-a-fullscreen-title.png","state-b-title-extract-reveal.png","state-c-presenter-light-overlay.png"].map((name)=>{const file=path.join(openingRoot,name);if(!fs.existsSync(file))throw new Error(`visual-decision-ledger-opening-state-missing:${name}`);return{name,sha256:shaFile(file),artifactPath:path.relative(root,file)};});
const decisions=new Map(current.production.canonicalCreatorPackagingSequence.decisions.map((item)=>[item.shotId,item]));
const entries=report.frames.map((frame)=>{
  const decision=decisions.get(frame.shotId);const file=publicPath(frame.publicUrl);
  if(!decision||!fs.existsSync(file)||shaFile(file)!==frame.sha256) throw new Error(`visual-decision-ledger-frame-invalid:${frame.shotId}`);
  return{shotId:frame.shotId,order:frame.order,packageDecision:decision.packageDecision,visualRole:frame.kind,sourceText:decision.sourceText,selectedFrame:{publicUrl:frame.publicUrl,sha256:frame.sha256,width:frame.width,height:frame.height},lockedUserDecision:frame.shotId==="ED-01"?{id:"ED01_OPENING_THREE_STATE",status:"LOCKED",states:openingStates}:frame.shotId==="ED-31"?{id:"ED31_CURRENT_FUSION_PIXEL_COBALT",status:"LOCKED",exactCopy:"可控的工作流",pink3dVersionForbidden:true}:null,animationAllowed:false};
});
const body={contract:"A1CurrentVisualDecisionLedger/v1",version:1,status:"READY_FOR_USER_FULL_STATIC_STORYBOARD_REVIEW",current:true,authorityScope:"CURRENT",sourceWorkspaceSha256:current.workspaceSha256,sourceSequenceSha256:current.production.canonicalCreatorPackagingSequence.sequenceSha256,sourceCandidateReportSha256:report.reportSha256,sourceBoardSha256:report.board.sha256,shotCount:entries.length,entries,globalLocks:{singleCurrentVisualPerShot:true,fileExistenceSelectionForbidden:true,ed01OpeningThreeStateRequired:true,ed31CurrentFusionPixelCobaltRequired:true,downstreamInvalidatedOnStaticChange:true,animationFrozenUntilLedgerBoundBoardApproval:true},board:report.board,userVisualApproval:"PENDING",generatedAt:new Date().toISOString()};
const ledger={...body,ledgerSha256:sha({...body,generatedAt:undefined})};
const now=ledger.generatedAt;
const result=withProjectLock(appRoot,()=>{
  const locked=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if(locked.workspaceSha256!==current.workspaceSha256) throw new Error(`visual-decision-ledger-persist-cas:${locked.workspaceSha256}`);
  let next=structuredClone(locked);
  next.production.currentVisualDecisionLedger={contract:"A1CurrentVisualDecisionLedgerPointer/v1",status:ledger.status,current:true,ledgerSha256:ledger.ledgerSha256,publicUrl:"/generated/system-line/editorial-asset-workbench-v1/current-visual-decision-ledger-v1/ledger.json",sourceCandidateReportSha256:report.reportSha256,sourceBoardSha256:report.board.sha256,targetShotCount:entries.length,userVisualApproval:"PENDING",animationAllowed:false};
  next.production.staticStoryboardRework={...next.production.staticStoryboardRework,ledger:{ledgerSha256:ledger.ledgerSha256,sourceCandidateReportSha256:report.reportSha256,ed01OpeningStateSha256s:openingStates.map((item)=>item.sha256),ed31DecisionId:"ED31_CURRENT_FUSION_PIXEL_COBALT"},animationFrozen:true};
  next.production.motion.status="frozen-pending-ledger-bound-static-review";
  next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,now));
  if(next.production.authority?.nextAction?.id!=="review-full-static-storyboard-rework"||next.production.authority?.currentStage!=="full-static-storyboard-rework-review") throw new Error(`visual-decision-ledger-next-authority-invalid:${next.production.authority?.currentStage}:${next.production.authority?.nextAction?.id}`);
  const event=createProductionEvent({workspace:locked,action:"compile-current-visual-decision-ledger",targetId:ledger.ledgerSha256,payload:{contract:ledger.contract,status:ledger.status,ledgerSha256:ledger.ledgerSha256,sourceBoardSha256:report.board.sha256,shotCount:entries.length,ed01OpeningThreeStateRequired:true,ed31CurrentFusionPixelCobaltRequired:true,animationFrozen:true},now});
  next.production.eventLedger.eventCount+=1;next.production.eventLedger.lastEventId=event.eventId;next.production.eventLedger.lastEventAt=event.createdAt;
  const committed=persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:locked.workspaceSha256,commitId:`visual-decision-ledger-${now.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{"current-visual-decision-ledger-v1/ledger.json":ledger}});
  return{status:ledger.status,workspaceSha256After:committed.workspaceSha256,ledgerSha256:ledger.ledgerSha256,shotCount:entries.length,board:ledger.board,nextAction:next.production.authority.nextAction,animationFrozen:true};
});
console.log(JSON.stringify(result,null,2));
