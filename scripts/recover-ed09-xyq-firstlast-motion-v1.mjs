#!/usr/bin/env node
// Register the recovered no-text first/last-frame Xiaoyunque (XYQ) ED-09 outputs as the
// authoritative-route pending candidates, and withdraw the off-route Remotion local composite.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {readProjectWorkspace, withProjectLock, persistProjectState} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {motionReviewHash, motionReviewSource} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {execFileSync} from "node:child_process";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const sha=(input)=>crypto.createHash("sha256").update(input).digest("hex");
const shaFile=(file)=>sha(fs.readFileSync(file));
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:["pipe","pipe","pipe"],encoding:"utf8"});

const xyqRoot=path.join(root,"work/xyq-non-screen/ED-09");
const runs=[
  {id:"v2",file:path.join(xyqRoot,"run-v2/result/v0dc76g10004dabu0di7dld0n12mdvg0.mp4"),threadId:"skill_e0674896-9835-46da-ac05-940b3ca1e30b",runId:"skill_a21aeaef-9af1-44bb-92a4-acd61ccb08c8",role:"PRIMARY",note:"语义修正版：阅读焦点尝试锁定重点后逐次失焦消散，停在空白结论位"},
  {id:"v1",file:path.join(xyqRoot,"run-v1/result/v02c76g10004dabtu8i7dld15m3pvulg.mp4"),threadId:"skill_da690900-27af-4611-96e8-7d87992f400a",runId:"skill_c0a842cd-6309-4508-8bb8-1dacaceceaa1",role:"ALTERNATIVE",note:"首版：纸张/滚轴/蓝色信号连续机械运动"},
];
const firstFrameSha=shaFile(path.join(xyqRoot,"first-last-v1/first.png"));
const lastFrameSha=shaFile(path.join(xyqRoot,"first-last-v1/last.png"));

const published=[];
for(const item of runs){
  if(!fs.existsSync(item.file)) throw new Error(`ed09-xyq-${item.id}-missing`);
  const bytes=fs.readFileSync(item.file);
  const videoSha=sha(bytes);
  run("ffmpeg",["-v","error","-i",item.file,"-f","null","-"]);
  const probe=JSON.parse(run("ffprobe",["-v","error","-show_streams","-show_format","-of","json",item.file]));
  const video=probe.streams.find(s=>s.codec_type==="video");
  if(Number(video.width)!==1256||Number(video.height)!==720||Number(video.nb_frames)!==193) throw new Error(`ed09-xyq-${item.id}-media-contract-failed`);
  const identity=motionReviewHash({contract:"A1Ed09XyqNoTextFirstLastMotion/v1",runId:item.runId,videoSha,firstFrameSha,lastFrameSha});
  const relative=`shot-motion-review-v1/ed09-xyq-firstlast/${identity}`;
  const receipt={
    contract:"A1ShotMotionReviewReceipt/v1",
    shotId:"ED-09",
    route:"XIAOYUNQUE_MOTION",
    executionRoute:"XIAOYUNQUE_MOTION",
    status:"RECOVERED_PENDING_USER_VISUAL_REVIEW",
    role:item.role,
    note:item.note,
    productionAdmission:false,
    userVisualApproval:"NOT_APPROVED",
    provider:"pippit/Seedance_2.0_mini_lite",
    threadId:item.threadId,
    runId:item.runId,
    noTextFirstLastFrame:true,
    firstFrame:{path:"work/xyq-non-screen/ED-09/first-last-v1/first.png",sha256:firstFrameSha},
    lastFrame:{path:"work/xyq-non-screen/ED-09/first-last-v1/last.png",sha256:lastFrameSha},
    sourceStoryboardSha256:"98adefe6eb5de7b67dc538fbe0ffa200d6f5b6ff716655e5b8e131507d009be6",
    video:{path:path.relative(root,item.file),publicUrl:`/generated/system-line/editorial-asset-workbench-v1/${relative}/ED-09-${item.id}.mp4`,sha256:videoSha,bytes:bytes.length,width:1256,height:720,frames:193,durationSeconds:Number(probe.format.duration)},
    knownDefects:{providerAigcCornerMark:"平台强制左上角「AI生成」角标，属 LOCAL_HANDOFF 阶段本地处理，不重造运动"},
    recoveredAt:new Date().toISOString(),
  };
  published.push({item,bytes,videoSha,identity,relative,receipt,publicUrl:receipt.video.publicUrl});
}

const primary=published.find(x=>x.item.role==="PRIMARY");
const alt=published.find(x=>x.item.role==="ALTERNATIVE");

const result=withProjectLock(appRoot,()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const source=current.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==="ED-09");
  if(!source) throw new Error("ed09-shot-missing");
  const binding=motionReviewSource(source);
  if(binding.artifactSha256!=="98adefe6eb5de7b67dc538fbe0ffa200d6f5b6ff716655e5b8e131507d009be6") throw new Error("ed09-current-source-stale");
  const next=structuredClone(current);
  const target=next.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==="ED-09");
  const prior=target.motionReviewPlan.viewerReview||{};
  target.motionReviewPlan={
    ...target.motionReviewPlan,
    action:"REUSE_REVIEW_REQUIRED",
    reason:"路线纠偏：ED-09 契约 executionRoute=XIAOYUNQUE_MOTION（assetProducer=IMAGEGEN_THEN_XIAOYUNQUE，USER_APPROVED_XIAOYUNQUE_LANE）。找回按用户规则提交的无文字首尾帧小云雀成片两版，交用户视觉裁决；撤回越线的 Remotion 本地合成候选。本地仅允许 LOCAL_HANDOFF（角标/交接/终帧对齐），不得重造生成式运动。",
    viewerReview:{
      status:"PENDING_USER_VISUAL_REVIEW",
      normalSpeedSequenceReview:"NOT_DONE",
      route:"XIAOYUNQUE_MOTION",
      candidateVideoSha256:primary.videoSha,
      candidateVideoPublicUrl:primary.publicUrl,
      candidateRunId:primary.item.runId,
      alternativeVideoSha256:alt.videoSha,
      alternativeVideoPublicUrl:alt.publicUrl,
      alternativeRunId:alt.item.runId,
      noTextFirstLastFrame:true,
      productionAdmission:false,
      withdrawnCandidate:{
        kind:"REMOTION_LOCAL_COMPOSITE_OFF_ROUTE",
        sha256:prior.candidateVideoSha256,
        publicUrl:prior.candidateVideoPublicUrl,
        reason:"以本地确定性合成顶替小云雀生成式运动，违背 XIAOYUNQUE_MOTION 路线",
        withdrawnAt:new Date().toISOString(),
      },
    },
  };
  const now=new Date().toISOString();
  const recalculated=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,now));
  const event=createProductionEvent({workspace:current,action:"recover-ed09-xyq-firstlast-motion-v1",targetId:primary.identity,payload:{shotId:"ED-09",route:"XIAOYUNQUE_MOTION",primarySha:primary.videoSha,alternativeSha:alt.videoSha,withdrawn:prior.candidateVideoSha256,productionAdmission:false},now});
  recalculated.production.eventLedger.eventCount+=1;
  recalculated.production.eventLedger.lastEventId=event.eventId;
  recalculated.production.eventLedger.lastEventAt=event.createdAt;
  const files={};
  const binaryFiles={};
  for(const p of published){
    files[`${p.relative}/receipt-${p.item.id}.json`]=p.receipt;
    binaryFiles[`${p.relative}/ED-09-${p.item.id}.mp4`]=p.bytes;
  }
  const saved=persistProjectState(appRoot,recalculated,{
    event,
    expectedWorkspaceSha256:current.workspaceSha256,
    files,
    binaryFiles,
  });
  return {workspaceSha256After:saved.workspaceSha256,primary:{sha:primary.videoSha,url:primary.publicUrl,identity:primary.identity},alternative:{sha:alt.videoSha,url:alt.publicUrl}};
});
console.log(JSON.stringify({status:"PASS",...result,productionAdmission:false},null,2));
