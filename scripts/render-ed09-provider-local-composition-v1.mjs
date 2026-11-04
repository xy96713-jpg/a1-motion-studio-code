#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";

import {readProjectWorkspace, withProjectLock, persistProjectState} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {motionReviewHash, motionReviewSource} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const rendererRoot=path.join(root,"remotion-renderer");
const require=createRequire(path.join(rendererRoot,"package.json"));
const {bundle}=require("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition}=require("@remotion/renderer");
const sha=(input)=>crypto.createHash("sha256").update(input).digest("hex");
const shaFile=(file)=>sha(fs.readFileSync(file));
const run=(cmd,args,options={})=>execFileSync(cmd,args,{stdio:["pipe","pipe","pipe"],encoding:"utf8",...options});
const chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if(!fs.existsSync(chrome)) throw new Error("ed09-local-chrome-required");

const expected={
  shotId:"ED-09",
  providerPath:"work/xyq-non-screen/ED-09/v0dc76g10004dabt21i7dldbdncrl890.mp4",
  providerSha:"50598a04a18c9a4f9cd90c2b2c420d471be29d8f375fa8d21e6f4601437197c2",
  narrationPath:"work/five-shot-canary-20260911/ED-09/ED-09-narration.wav",
  narrationSha:"87ee273de48521d87f031a5ef7f991fcda22f07d1b4d60da91708b749d4778e3",
};
const jobRoot=path.join(root,"work/ed09-provider-local-composition-v1");
const stage=path.join(jobRoot,"remotion-stage");
const output=path.join(jobRoot,"ed09-provider-local-remotion-v1.mp4");
const renderedRaw=path.join(jobRoot,"ed09-provider-local-remotion-v1.raw.mp4");
fs.rmSync(stage,{recursive:true,force:true});
fs.mkdirSync(path.join(stage,"public"),{recursive:true});
const provider=path.join(root,expected.providerPath);
const narration=path.join(root,expected.narrationPath);
if(shaFile(provider)!==expected.providerSha) throw new Error("ed09-provider-sha-mismatch");
if(shaFile(narration)!==expected.narrationSha) throw new Error("ed09-narration-sha-mismatch");
fs.copyFileSync(provider,path.join(stage,"public/provider.mp4"));
fs.copyFileSync(narration,path.join(stage,"public/narration.wav"));

const props={
  contract:"A1ProviderMotionLocalComposite/v1",
  shotId:"ED-09",
  providerVideo:"provider.mp4",
  narrationAudio:"narration.wav",
  canvasWidth:1920,
  canvasHeight:1080,
  sourceWidth:1256,
  sourceHeight:720,
  paperColor:"#d6cfc6",
  covers:[
    {id:"provider-aigc-label",x:0,y:14,width:110,height:84},
    {id:"provider-baked-headline",x:20,y:132,width:448,height:424},
  ],
};
const rendererFiles=[
  "remotion-renderer/src/Ed09ProviderMotionLocalCompositeV1.tsx",
  "remotion-renderer/src/ed09-provider-motion-local-composite-index.tsx",
  "scripts/render-ed09-provider-local-composition-v1.mjs",
];
fs.writeFileSync(path.join(stage,"props.json"),JSON.stringify(props,null,2));
const serveUrl=await bundle({
  entryPoint:path.join(rendererRoot,"src/ed09-provider-motion-local-composite-index.tsx"),
  publicDir:path.join(stage,"public"),
  rootDir:rendererRoot,
  enableCaching:true,
});
const browser=await openBrowser("chrome",{chromeMode:"headless-shell",browserExecutable:chrome,logLevel:"warn"});
try{
  const selected=await selectComposition({serveUrl,id:"ED09ProviderMotionLocalCompositeV1",inputProps:props,puppeteerInstance:browser,logLevel:"warn"});
  const composition={...selected,fps:30,durationInFrames:228};
  await renderMedia({serveUrl,composition,inputProps:props,codec:"h264",pixelFormat:"yuv420p",imageFormat:"jpeg",jpegQuality:90,crf:18,outputLocation:renderedRaw,scale:1,concurrency:2,puppeteerInstance:browser,logLevel:"warn",overwrite:true,audioCodec:"aac",audioBitrate:"192K"});
} finally { await browser.close({silent:true}); }
run("ffmpeg",["-y","-v","error","-i",renderedRaw,"-map","0:v:0","-map","0:a?","-vf","scale=in_range=pc:out_range=tv,format=yuv420p","-c:v","libx264","-preset","medium","-crf","18","-color_range","tv","-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709","-c:a","copy","-movflags","+faststart",output]);
fs.rmSync(renderedRaw,{force:true});

run("ffmpeg",["-v","error","-i",output,"-f","null","-"]);
const probe=JSON.parse(run("ffprobe",["-v","error","-show_streams","-show_format","-of","json",output]));
const video=probe.streams.find(s=>s.codec_type==="video");
const audio=probe.streams.find(s=>s.codec_type==="audio");
if(Number(video.width)!==1920||Number(video.height)!==1080||Number(video.nb_frames)!==228||Math.abs(Number(probe.format.duration)-7.633)>.05) throw new Error("ed09-composition-media-contract-failed");
if(!audio||Number(audio.sample_rate)!==48000) throw new Error("ed09-composition-audio-contract-failed");
const bytes=fs.readFileSync(output);
const videoSha=sha(bytes);
const rendererSha=motionReviewHash(rendererFiles.map(file=>[file,shaFile(path.join(root,file))]));
const identity=motionReviewHash({contract:"A1Ed09ProviderMotionLocalComposite/v1",providerSha:expected.providerSha,narrationSha:expected.narrationSha,props,rendererSha});
const relative=`shot-motion-review-v1/ed09-provider-local-composition/${identity}`;
const publicUrl=`/generated/system-line/editorial-asset-workbench-v1/${relative}/ED-09.mp4`;
const narratedPreviewUrl=`/generated/system-line/editorial-asset-workbench-v1/${relative}/narrated.mp4`;
const recipe={
  contract:"A1Ed09ProviderMotionLocalCompositeRecipe/v1",
  shotId:"ED-09",
  identity,
  status:"RENDERED_PENDING_INTERNAL_SEQUENCE_REVIEW",
  usageMode:"INTERNAL_REVIEW_CANARY_ONLY",
  productionAdmission:false,
  userVisualApproval:"NOT_APPROVED",
  providerVideo:{path:expected.providerPath,sha256:expected.providerSha,videoId:"46601262860"},
  narration:{path:expected.narrationPath,sha256:expected.narrationSha},
  rendererFiles,
  rendererSha,
  props,
  video:{path:path.relative(root,output),publicUrl,sha256:videoSha,bytes:bytes.length,width:1920,height:1080,fps:30,durationMs:Number(probe.format.duration)*1000,frames:228},
  validation:{decoded:true,providerMotionConsumed:true,providerBakedTextCovered:true,providerAigcLabelCovered:true,narrationAttached:true,normalSpeedSequenceReview:false},
  renderedAt:new Date().toISOString(),
};
fs.writeFileSync(path.join(jobRoot,"remotion-recipe.json"),JSON.stringify(recipe,null,2)+"\n");
const recipeSha=shaFile(path.join(jobRoot,"remotion-recipe.json"));

const result=withProjectLock(appRoot,()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const shot=current.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==="ED-09");
  if(!shot) throw new Error("ed09-shot-missing");
  const source=motionReviewSource(shot);
  if(source.artifactSha256!=="98adefe6eb5de7b67dc538fbe0ffa200d6f5b6ff716655e5b8e131507d009be6"||source.durationMs!==7600) throw new Error("ed09-current-source-stale");
  if(shot.motionReviewPlan?.action!=="BUILD_LOCAL_CANARY") throw new Error("ed09-plan-action-invalid");
  const next=structuredClone(current);
  const target=next.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==="ED-09");
  target.motionReviewPlan={
    ...target.motionReviewPlan,
    action:"BUILD_LOCAL_CANARY",
    reason:"真实 provider 运动经本地确定性 Remotion 合成：本地控制画幅、覆盖 provider 直出标题/AIGC 标记并接既有旁白；仅为内部待审候选，不设默认、不入片。",
    viewerReview:{
      ...(target.motionReviewPlan.viewerReview||{}),
      status:"PENDING_INTERNAL_SEQUENCE_REVIEW",
      candidateVideoSha256:videoSha,
      candidateVideoPublicUrl:publicUrl,
      narratedPreviewUrl,
      candidateReceiptPath:"work/ed09-provider-local-composition-v1/remotion-recipe.json",
      candidateReceiptSha256:recipeSha,
      providerMotionComposite:true,
      productionAdmission:false,
    },
  };
  const now=new Date().toISOString();
  const recalculated=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,now));
  const event=createProductionEvent({workspace:current,action:"render-ed09-provider-local-composition-v1",targetId:identity,payload:{shotId:"ED-09",identity,providerSha:expected.providerSha,narrationSha:expected.narrationSha,productionAdmission:false},now});
  recalculated.production.eventLedger.eventCount+=1;
  recalculated.production.eventLedger.lastEventId=event.eventId;
  recalculated.production.eventLedger.lastEventAt=event.createdAt;
  const saved=persistProjectState(appRoot,recalculated,{
    event,
    expectedWorkspaceSha256:current.workspaceSha256,
    files:{[`${relative}/recipe.json`]:recipe},
    binaryFiles:{[`${relative}/ED-09.mp4`]:bytes,[`${relative}/narrated.mp4`]:bytes},
  });
  return {status:"PASS",workspaceSha256After:saved.workspaceSha256,identity,videoSha,publicUrl,productionAdmission:false};
});
console.log(JSON.stringify(result,null,2));
