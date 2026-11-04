#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {createSequenceAssemblyNodeAdapterV1,A1_SEQUENCE_ASSEMBLY_PLAN_V1} from "../apps/studio-next/src/lib/a1-node-sequence-assembly-adapter-v1.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),workRoot=path.join(root,"work");
const ffmpegPath=fs.existsSync(path.join(root,".tools/bin/ffmpeg"))?path.join(root,".tools/bin/ffmpeg"):"ffmpeg";
const ffprobePath=fs.existsSync(path.join(root,".tools/bin/ffprobe"))?path.join(root,".tools/bin/ffprobe"):"ffprobe";
const execFileAsync=promisify(execFile);
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const tempRoot=fs.realpathSync(fs.mkdtempSync(path.join(workRoot,".a1-sequence-assembly-test-")));
const artifactRoot=path.join(tempRoot,"node-artifacts");fs.mkdirSync(artifactRoot,{recursive:true});
let concatRenderCount=0;
const adapter=createSequenceAssemblyNodeAdapterV1({ffmpegPath,exec:async(file,args,options)=>{if(args.includes("concat"))concatRenderCount+=1;return execFileAsync(file,args,options);}});

try{
  const clips=[{shotId:"shot-one",color:"red"},{shotId:"shot-two",color:"blue"}].map((item,index)=>{
    const filename=path.join(tempRoot,`${item.shotId}.mp4`);
    execFileSync(ffmpegPath,["-nostdin","-hide_banner","-loglevel","error","-y","-f","lavfi","-i",`color=c=${item.color}:s=320x180:r=30:d=0.5`,
      "-an","-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",filename],{timeout:30_000});
    const bytes=fs.readFileSync(filename),inputSha256=sha(Buffer.from(`${item.shotId}-input`)),manifestSha256=sha(Buffer.from(`${item.shotId}-manifest`)),artifactSha256=sha(bytes);
    return {shotId:item.shotId,nodeId:`${item.shotId}:remotion-render`,inputSha256,manifestSha256,filename,bytes,artifactSha256,orderIndex:index};
  });
  const segments=clips.map(item=>({shotId:item.shotId,nodeId:item.nodeId,orderIndex:item.orderIndex,artifactRole:"candidate-video",artifactKind:"VIDEO"}));
  const dependencies=Object.fromEntries(clips.map(item=>[item.nodeId,{state:"succeeded",nodeId:item.nodeId,inputSha256:item.inputSha256,manifestSha256:item.manifestSha256,
    artifacts:[{path:path.basename(item.filename),absolutePath:item.filename,role:"candidate-video",kind:"VIDEO",sha256:item.artifactSha256,bytes:item.bytes.length}],
    visualReview:{status:"PASS",reviewerId:"synthetic-sequence-reviewer",inputSha256:item.inputSha256,reviewedArtifactSha256:[item.artifactSha256],findings:[],reviewedAt:"2026-09-29T00:00:00.000Z",productionAdmission:false}}]));
  const input={module:"sequence-assembly",need:true,moduleVersion:1,parameters:{contract:"A1SequenceAssemblyRequest/v1",required:true,reviewOnly:true,width:320,height:180,
    fpsNumerator:30,fpsDenominator:1,audioMode:"SILENT_REVIEW",maxDurationMs:60_000,segments}};
  const node={id:"sequence-assembly:sequence-assembly",shotId:"sequence-assembly",module:"sequence-assembly",inputSha256:sha(Buffer.from(JSON.stringify(input))),input,dependencies:clips.map(item=>item.nodeId)};
  const result=await adapter.execute(node,{artifactRoot,dependencies,ffprobePath,heartbeat:async()=>{}});
  assert.equal(result.state,"needs-review");assert.equal(result.productionAdmission,false);assert.equal(result.visualApproval,"NOT_GRANTED");
  assert.equal(result.sequencePlan.contract,A1_SEQUENCE_ASSEMBLY_PLAN_V1);assert.deepEqual(result.sequencePlan.segmentCount,2);assert.equal(concatRenderCount,1);
  const video=result.artifactManifest.artifacts.find(item=>item.kind==="VIDEO");assert.ok(video);assert.equal(video.role,"sequence-review");
  const output=path.join(artifactRoot,video.path),metadata=JSON.parse(execFileSync(ffprobePath,["-v","error","-show_entries","stream=codec_type,width,height,avg_frame_rate","-show_entries","format=duration","-of","json",output],{encoding:"utf8"}));
  assert.equal(metadata.streams.filter(stream=>stream.codec_type==="audio").length,0);assert.equal(metadata.streams[0].width,320);assert.equal(metadata.streams[0].height,180);
  const cached=await adapter.execute(node,{artifactRoot,dependencies,ffprobePath,heartbeat:async()=>{}});assert.equal(cached.state,"needs-review");assert.equal(concatRenderCount,1,"identical sequence inputs reuse the content-addressed output");
  const hypitClips=clips.map(item=>({...item,nodeId:`${item.shotId}:hypit-render`}));
  const hypitSegments=hypitClips.map(item=>({shotId:item.shotId,nodeId:item.nodeId,orderIndex:item.orderIndex,artifactRole:"candidate-video",artifactKind:"VIDEO"}));
  const hypitDependencies=Object.fromEntries(hypitClips.map(item=>[item.nodeId,{...dependencies[`${item.shotId}:remotion-render`],nodeId:item.nodeId}]));
  const hypitInput={...input,parameters:{...input.parameters,segments:hypitSegments}};
  const hypitNode={...node,input:hypitInput,inputSha256:sha(Buffer.from(JSON.stringify(hypitInput))),dependencies:hypitClips.map(item=>item.nodeId)};
  const hypitAssembly=await adapter.execute(hypitNode,{artifactRoot,dependencies:hypitDependencies,ffprobePath,heartbeat:async()=>{}});
  assert.equal(hypitAssembly.state,"needs-review","visually accepted Hypit candidate-video artifacts can enter the incumbent sequence assembly");
  assert.equal(hypitAssembly.sequencePlan.segmentCount,2);
  const noVisual={...dependencies,[clips[0].nodeId]:{...dependencies[clips[0].nodeId],visualReview:{status:"FAIL",productionAdmission:false,inputSha256:clips[0].inputSha256,reviewedArtifactSha256:[clips[0].artifactSha256]}}};
  const blockedArtifacts=path.join(tempRoot,"blocked-artifacts");fs.mkdirSync(blockedArtifacts,{recursive:true});
  const blockedByReview=await adapter.execute({...node,inputSha256:sha(Buffer.from("different-review-input"))},{artifactRoot:blockedArtifacts,dependencies:noVisual,ffprobePath});
  assert.equal(blockedByReview.state,"blocked");assert.equal(blockedByReview.reason,"SEQUENCE_SEGMENT_VISUAL_REVIEW_PASS_REQUIRED");
  const missingVisual={...dependencies,[clips[0].nodeId]:{...dependencies[clips[0].nodeId],visualReview:undefined}};
  const missingArtifacts=path.join(tempRoot,"missing-artifacts");fs.mkdirSync(missingArtifacts,{recursive:true});
  const blockedMissing=await adapter.execute({...node,inputSha256:sha(Buffer.from("missing-review-input"))},{artifactRoot:missingArtifacts,dependencies:missingVisual,ffprobePath});
  assert.equal(blockedMissing.reason,"SEQUENCE_SEGMENT_VISUAL_REVIEW_PASS_REQUIRED");
  const audioInput={...input,parameters:{...input.parameters,audioMode:"KEEP_AUDIO"}};
  const audioArtifacts=path.join(tempRoot,"audio-artifacts");fs.mkdirSync(audioArtifacts,{recursive:true});
  const badPolicy=await adapter.execute({...node,input:audioInput,inputSha256:sha(Buffer.from("audio-policy-input"))},{artifactRoot:audioArtifacts,dependencies,ffprobePath});
  assert.equal(badPolicy.reason,"SEQUENCE_ASSEMBLY_REVIEW_POLICY_REQUIRED");
  console.log(JSON.stringify({contract:"A1NodeSequenceAssemblyAdapterTest/v1",status:"PASS_REVIEW_ONLY",segmentCount:clips.length,outputSha256:video.sha256,
    checks:["declared segment order and stable video metadata","silent output and full decode","each segment needs a bound visual PASS","visual review SHA participates in cache identity","Hypit candidate-video uses the same visually gated sequence assembly","identical assembly inputs reuse the output","sequence output remains review-only"]},null,2));
}finally{fs.rmSync(tempRoot,{recursive:true,force:true});}
