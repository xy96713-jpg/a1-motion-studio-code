#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {readProjectWorkspace,persistProjectState,withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertEditorialAssetWorkbench,recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {approveWholeFilmStaticBoardAndQueueLayerReconstruction,buildWholeFilmStaticBoardApprovalAuthority} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
const root=path.resolve(import.meta.dirname,".."),appRoot=path.join(root,"apps/studio-next");
const [expected,boardSha,evidencePath]=process.argv.slice(2);
if(!/^[a-f0-9]{64}$/.test(expected||"")||!/^[a-f0-9]{64}$/.test(boardSha||"")||!evidencePath)throw Error("usage: expected-workspace-sha board-sha approval-evidence.json");
const e=JSON.parse(fs.readFileSync(evidencePath));
const line=fs.readFileSync(e.sourceSession,"utf8").split("\n")[e.sourceLine-1];
const event=JSON.parse(line),message=event.payload,text=(message.content||[]).map(c=>c.text||"").join("").trim();
if(message.role!=="user"||message.id!==e.userMessageId||text!==e.userQuote.trim()||event.timestamp!==e.approvedAt)throw Error("approval-user-message-not-verified");
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const result=await withProjectLock(appRoot,()=>{
 const w=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot)),b=w.production.shotIntelligence.wholeFilmStaticBoard;
 if(w.workspaceSha256!==expected||b.sha256!==boardSha||e.currentBoardSha256!==boardSha)throw Error("approval-current-board-cas-failed");
 for(const s of w.production.shotIntelligence.currentStoryboardAuthority.shots){if(s.designApproval?.status!=="APPROVED")continue;const bytes=fs.readFileSync(path.join(appRoot,"public",s.artifactPublicUrl));if(hash(bytes)!==s.artifactSha256)throw Error("approved-current-source-bytes-changed:"+s.shotId);}
 const approvalAuthority=buildWholeFilmStaticBoardApprovalAuthority({userQuote:e.userQuote,userMessageId:e.userMessageId,approvedAt:e.approvedAt});
 let restoreNoOpEdit=null;
 if(process.argv.includes("--restore-noop")) {
  const auditPath=path.join(root,".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json"),auditBytes=fs.readFileSync(auditPath),audit=JSON.parse(auditBytes);
  const ledger=fs.readFileSync(path.join(root,".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/events.jsonl"),"utf8");
  const edit=JSON.parse(ledger.trim().split("\n").at(-1));
  if(edit.action!=="edit-current-storyboard-shot"||edit.eventId!==w.production.eventLedger.lastEventId||audit.status!=="PASS"||audit.nextAction!=="review-semantic-screen-wave15"||audit.authority?.workspaceSha256!==edit.workspaceSha256Before)throw Error("noop-recovery-prior-approved-audit-required");
  const shot=w.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId===edit.targetId);
  restoreNoOpEdit={contract:"A1VerifiedNoOpStoryboardEdit/v1",lastEventId:edit.eventId,priorWorkspaceSha256:edit.workspaceSha256Before,priorAuditSha256:hash(auditBytes),boardSha256:boardSha,shotId:edit.targetId,source:shot?.motionReviewPlan?.source};
 }
 const approved=approveWholeFilmStaticBoardAndQueueLayerReconstruction(w,{expectedWorkspaceSha256:expected,expectedBoardSha256:boardSha,expectedBoardItemSeedSha256:b.itemSeedSha256,approvalAuthority,restoreNoOpEdit});
 const next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(approved.workspace));
 if(next.production.generation.automaticDispatchAllowed)throw Error("approval-must-not-start-generation");
 persistProjectState(appRoot,next,{expectedWorkspaceSha256:expected});
 return {status:"PASS",workspaceSha256:next.workspaceSha256,boardStatus:next.production.shotIntelligence.wholeFilmStaticBoard.status,userVisualApproval:next.production.shotIntelligence.wholeFilmStaticBoard.userVisualApproval,nextAction:next.production.authority.nextAction};
});
console.log(JSON.stringify(result,null,2));
