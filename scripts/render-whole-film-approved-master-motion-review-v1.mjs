#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const appPublicRoot=path.join(appRoot,"public");
const rendererRoot=path.join(root,"remotion-renderer");
const rendererPublicRoot=path.join(rendererRoot,"public");
const relativeRoot="whole-film-motion-plan-v1";
const phaseRelativeRoot="generated/system-line/editorial-asset-workbench-v1";
const phaseRoot=path.join(appPublicRoot,phaseRelativeRoot);
const planPath=path.join(phaseRoot,relativeRoot,"plan.json");
const propsPath=path.join(phaseRoot,relativeRoot,"input-props.json");
const expectedWorkspaceSha256=process.argv[2];
if(!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256||""))) throw new Error("whole-film-motion-render-valid-workspace-sha-required");

const require=createRequire(path.join(rendererRoot,"package.json"));
const {bundle}=require("@remotion/bundler");
const {openBrowser,renderMedia,renderStill,selectComposition}=require("@remotion/renderer");
const sharp=require("sharp");
const sha256=(value)=>crypto.createHash("sha256").update(Buffer.isBuffer(value)||typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const shaFile=(file)=>sha256(fs.readFileSync(file));
const readJson=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));
const appPublicPath=(publicUrl)=>path.join(appPublicRoot,String(publicUrl).replace(/^\//u,""));
const rendererPublicPath=(publicUrl)=>path.join(rendererPublicRoot,String(publicUrl).replace(/^\//u,""));

function assertSemanticHash(value,key,mode="body"){
  const expected=value[key];
  const body=structuredClone(value);
  delete body[key];
  if(mode==="plan") delete body.generatedAt;
  const actual=sha256(body);
  if(expected!==actual) throw new Error(`whole-film-motion-render-${key}-mismatch:${expected}:${actual}`);
}

function collectBindings(props){
  const bindings=[props.media.presenterVideo,props.media.narrationAudio,props.media.subtitles];
  for(const beat of props.beats){
    if(beat.kind==="SCREEN_EVIDENCE") bindings.push(beat.screen.asset);
    if(beat.kind!=="PACKAGE") continue;
    bindings.push(beat.package.selectedLookMaster,beat.package.finalComposite,...Object.values(beat.package.layers||{}));
    if(beat.package.presenterMatte) bindings.push(beat.package.presenterMatte);
  }
  return bindings.filter(Boolean);
}

function mirrorAndVerifyAssets(props){
  const byUrl=new Map();
  for(const binding of collectBindings(props)){
    if(!binding.publicUrl||!/^[a-f0-9]{64}$/u.test(String(binding.sha256||""))) throw new Error(`whole-film-motion-render-invalid-binding:${JSON.stringify(binding)}`);
    const previous=byUrl.get(binding.publicUrl);
    if(previous&&previous!==binding.sha256) throw new Error(`whole-film-motion-render-binding-sha-conflict:${binding.publicUrl}`);
    byUrl.set(binding.publicUrl,binding.sha256);
  }
  const mirrored=[];
  for(const [publicUrl,expectedSha256] of byUrl){
    const source=appPublicPath(publicUrl);
    if(!fs.existsSync(source)) throw new Error(`whole-film-motion-render-source-missing:${publicUrl}`);
    const sourceSha256=shaFile(source);
    if(sourceSha256!==expectedSha256) throw new Error(`whole-film-motion-render-source-sha-mismatch:${publicUrl}:${expectedSha256}:${sourceSha256}`);
    const target=rendererPublicPath(publicUrl);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    if(!fs.existsSync(target)||shaFile(target)!==sourceSha256) fs.copyFileSync(source,target);
    mirrored.push({publicUrl,sha256:sourceSha256,bytes:fs.statSync(source).size});
  }
  return mirrored;
}

function binding(file,name){
  return {publicUrl:`/${phaseRelativeRoot}/${relativeRoot}/${name}`,sha256:shaFile(file),bytes:fs.statSync(file).size};
}

async function nonBlankFrame(file){
  const {channels}=await sharp(file).resize(320,180,{fit:"fill"}).removeAlpha().stats();
  const range=Math.max(...channels.map((channel)=>channel.max-channel.min));
  const stdev=Math.max(...channels.map((channel)=>channel.stdev));
  return {range,stdev,status:range>=18&&stdev>=4?"PASS":"FAIL"};
}

const initial=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if(initial.workspaceSha256!==expectedWorkspaceSha256) throw new Error(`whole-film-motion-render-workspace-cas-failed:${initial.workspaceSha256}`);
if(initial.production.generation.summary.queued!==0||initial.production.generation.summary.running!==0||initial.production.generation.workerStatus!=="frozen"||initial.production.generation.automaticDispatchAllowed!==false) throw new Error("whole-film-motion-render-frozen-runtime-required");
const authority=initial.production.shotIntelligence.wholeFilmApprovedMasterMotionPlan;
if(authority?.status!=="PLAN_READY_REVIEW_ONLY"||authority.wholeFilmReviewRenderAllowed!==true||authority.assemblyAllowed!==false||authority.final1080RenderAllowed!==false) throw new Error(`whole-film-motion-render-authority-invalid:${authority?.status||"missing"}`);

const plan=readJson(planPath);
const inputProps=readJson(propsPath);
assertSemanticHash(plan,"planSha256","plan");
assertSemanticHash(inputProps,"propsSha256");
if(plan.planSha256!==authority.planSha256||plan.propsSha256!==authority.propsSha256||inputProps.propsSha256!==authority.propsSha256) throw new Error("whole-film-motion-render-pointer-mismatch");
if(plan.status!=="PLAN_READY_REVIEW_ONLY"||plan.gates?.wholeFilmReviewRenderAllowed!==true||plan.gates?.assemblyAllowed!==false||plan.gates?.final1080RenderAllowed!==false) throw new Error("whole-film-motion-render-plan-gate-invalid");
if(inputProps.reviewOnly!==true||inputProps.promotedRender!==false||inputProps.finalRelease!==false||inputProps.beats.length!==34||inputProps.totalFrames!==6567) throw new Error("whole-film-motion-render-props-invalid");
const routeCounts=inputProps.beats.reduce((counts,beat)=>({...counts,[beat.kind]:(counts[beat.kind]||0)+1}),{});
if(routeCounts.PACKAGE!==13||routeCounts.SCREEN_EVIDENCE!==16||routeCounts.PRESENTER_BASE!==5) throw new Error(`whole-film-motion-render-route-counts-invalid:${JSON.stringify(routeCounts)}`);

const mirroredAssets=mirrorAndVerifyAssets(inputProps);
const rendererSources=[path.join(rendererRoot,"src/WholeFilmApprovedMasterMotionReview.tsx"),path.join(rendererRoot,"src/Root.tsx"),path.join(root,"lib/a1-motion-ir-parity-v1.js")];
const rendererSourceSha256=sha256(rendererSources.map((file)=>({file:path.relative(root,file),sha256:shaFile(file)})));
const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),"a1-whole-film-motion-review-"));
const preflightRoot=path.join(tempRoot,"preflight-frames");
fs.mkdirSync(preflightRoot,{recursive:true});
const videoPath=path.join(tempRoot,"whole-film-motion-review-960x540.mp4");
const sheetPath=path.join(tempRoot,"whole-film-motion-review-preflight-contact-sheet.png");

console.log(JSON.stringify({stage:"BUNDLE",mirroredAssetCount:mirroredAssets.length,tempRoot}));
const serveUrl=await bundle({entryPoint:path.join(rendererRoot,"src/index.ts"),publicDir:rendererPublicRoot,rootDir:rendererRoot,enableCaching:true});
const browser=await openBrowser("chrome",{chromeMode:"headless-shell",logLevel:"warn"});
let composition;
const preflight=[];
try{
  composition=await selectComposition({serveUrl,id:"A1WholeFilmApprovedMasterMotionReviewV1",inputProps,puppeteerInstance:browser,logLevel:"warn"});
  if(composition.durationInFrames!==plan.totalFrames||composition.fps!==plan.fps||composition.width!==1920||composition.height!==1080) throw new Error(`whole-film-motion-render-composition-mismatch:${composition.durationInFrames}:${composition.fps}:${composition.width}x${composition.height}`);
  const targets=[
    {shotId:"ED-02",phase:"screen-mid",offsetRatio:.5},
    {shotId:"ED-08",phase:"dynamic-presenter-hold",offsetRatio:.72},
    {shotId:"ED-13",phase:"transformed-presenter-hold",offsetRatio:.72},
    {shotId:"ED-31",phase:"cutout-workflow-hold",offsetRatio:.72},
    {shotId:"ED-19",phase:"fullscreen-typography-hold",offsetRatio:.72},
  ];
  for(const target of targets){
    const beat=inputProps.beats.find((item)=>item.shotId===target.shotId);
    if(!beat) throw new Error(`whole-film-motion-render-preflight-shot-missing:${target.shotId}`);
    const frame=Math.min(composition.durationInFrames-1,beat.startFrame+Math.max(1,Math.floor(beat.durationInFrames*target.offsetRatio)));
    const file=path.join(preflightRoot,`${target.shotId.toLowerCase()}-${target.phase}-f${String(frame).padStart(4,"0")}.png`);
    await renderStill({serveUrl,composition,inputProps,frame,output:file,imageFormat:"png",scale:.5,overwrite:true,puppeteerInstance:browser,logLevel:"warn"});
    const pixelGate=await nonBlankFrame(file);
    preflight.push({...target,frame,file,pixelGate});
    console.log(JSON.stringify({stage:"PREFLIGHT",shotId:target.shotId,frame,pixelGate}));
  }
  const preflightFailures=preflight.filter((item)=>item.pixelGate.status!=="PASS");
  if(preflightFailures.length) throw new Error(`whole-film-motion-render-preflight-fail:${preflightFailures.map((item)=>item.shotId).join(",")}`);
  console.log(JSON.stringify({stage:"RENDER_START",frames:composition.durationInFrames,durationMs:plan.durationMs,scale:.5,concurrency:2}));
  let lastProgressBucket=-1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    outputLocation:videoPath,
    frameRange:[0,composition.durationInFrames-1],
    scale:.5,
    codec:"h264",
    pixelFormat:"yuv420p",
    imageFormat:"jpeg",
    jpegQuality:88,
    crf:22,
    concurrency:2,
    hardwareAcceleration:"if-possible",
    overwrite:true,
    puppeteerInstance:browser,
    logLevel:"warn",
    onProgress:({progress})=>{
      const bucket=Math.floor(progress*20);
      if(bucket>lastProgressBucket){lastProgressBucket=bucket;console.log(JSON.stringify({stage:"RENDER_PROGRESS",progress:Number(progress.toFixed(4))}));}
    },
  });
}finally{
  await browser.close({silent:true});
}

const tileWidth=480;
const tileHeight=270;
const labelHeight=34;
const tiles=[];
for(const sample of preflight){
  const label=Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0c0f13"/><text x="12" y="23" fill="#dfff68" font-family="monospace" font-size="13" font-weight="700">${sample.shotId} · ${sample.phase} · F${sample.frame}</text></svg>`);
  tiles.push(await sharp(sample.file).resize(tileWidth,tileHeight,{fit:"fill"}).extend({top:labelHeight,bottom:0,left:0,right:0,background:"#0c0f13"}).composite([{input:label,top:0,left:0}]).png().toBuffer());
}
await sharp({create:{width:tileWidth*2,height:(tileHeight+labelHeight)*Math.ceil(tiles.length/2),channels:4,background:"#0c0f13"}}).composite(tiles.map((input,index)=>({input,left:index%2*tileWidth,top:Math.floor(index/2)*(tileHeight+labelHeight)}))).png().toFile(sheetPath);

const video=binding(videoPath,path.basename(videoPath));
const contactSheet=binding(sheetPath,path.basename(sheetPath));
const preflightFrames=Object.fromEntries(preflight.map((sample)=>[sample.shotId,binding(sample.file,`preflight-frames/${path.basename(sample.file)}`)]));
const renderedAt=new Date().toISOString();
const reportBody={
  contract:"A1WholeFilmApprovedMasterMotionReviewRenderReport/v1",
  status:"WHOLE_FILM_540P_REVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW",
  reviewOnly:true,
  promotedRender:false,
  finalRelease:false,
  sourceWorkspaceSha256:initial.workspaceSha256,
  sourcePlanSha256:plan.planSha256,
  sourcePropsSha256:inputProps.propsSha256,
  rendererSourceSha256,
  composition:{id:composition.id,durationInFrames:composition.durationInFrames,durationMs:Math.round(composition.durationInFrames/composition.fps*1000),fps:composition.fps,width:960,height:540,codec:"h264",pixelFormat:"yuv420p",crf:22},
  routeCounts:{PACKAGE:13,SCREEN_EVIDENCE:16,PRESENTER_BASE:5},
  mirroredAssetCount:mirroredAssets.length,
  preflight:preflight.map(({file,...item})=>item),
  artifacts:{video,contactSheet,preflightFrames},
  actualPixelVisualReviewStatus:"PENDING",
  gates:{wholeFilmRenderCompleted:true,wholeFilmActualPixelVisualReviewPassed:false,assemblyAllowed:false,final1080RenderAllowed:false,resolveAllowed:false,releaseAllowed:false},
  workerStatus:"frozen",
  renderedAt,
};
const report={...reportBody,reportSha256:sha256({...reportBody,renderedAt:undefined})};
const binaryFiles={
  [`${relativeRoot}/${path.basename(videoPath)}`]:fs.readFileSync(videoPath),
  [`${relativeRoot}/${path.basename(sheetPath)}`]:fs.readFileSync(sheetPath),
};
for(const sample of preflight) binaryFiles[`${relativeRoot}/preflight-frames/${path.basename(sample.file)}`]=fs.readFileSync(sample.file);

const committed=await withProjectLock(appRoot,()=>{
  const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if(current.workspaceSha256!==initial.workspaceSha256) throw new Error(`whole-film-motion-render-persist-cas-failed:${current.workspaceSha256}`);
  const currentAuthority=current.production.shotIntelligence.wholeFilmApprovedMasterMotionPlan;
  if(currentAuthority?.planSha256!==plan.planSha256||currentAuthority?.propsSha256!==inputProps.propsSha256) throw new Error("whole-film-motion-render-current-plan-drift");
  let next=structuredClone(current);
  next.production.shotIntelligence.wholeFilmApprovedMasterMotionPlan={...currentAuthority,status:report.status,renderReportSha256:report.reportSha256,video,preflightContactSheet:contactSheet,actualPixelVisualReviewStatus:"PENDING",wholeFilmReviewRenderAllowed:false,assemblyAllowed:false,final1080RenderAllowed:false,resolveAllowed:false,releaseAllowed:false,updatedAt:renderedAt};
  next.production.shotIntelligence.approvedMasterLayerPilot={...next.production.shotIntelligence.approvedMasterLayerPilot,status:"WHOLE_FILM_540P_REVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW",wholeFilmReviewRenderSha256:video.sha256,wholeFilmReviewRenderReportSha256:report.reportSha256,assemblyAllowed:false,final1080RenderAllowed:false};
  next.production.generation.workerStatus="frozen";
  next.production.generation.automaticDispatchAllowed=false;
  next=assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next,renderedAt));
  const event=createProductionEvent({workspace:current,action:"render-whole-film-approved-master-motion-review",targetId:"34-beats",payload:{status:report.status,reportSha256:report.reportSha256,videoSha256:video.sha256,contactSheetSha256:contactSheet.sha256,routeCounts:report.routeCounts,reviewOnly:true,assemblyAllowed:false,final1080RenderAllowed:false,workerStatus:"frozen"},now:renderedAt});
  next.production.eventLedger.eventCount+=1;
  next.production.eventLedger.lastEventId=event.eventId;
  next.production.eventLedger.lastEventAt=event.createdAt;
  return persistProjectState(appRoot,next,{event,expectedWorkspaceSha256:current.workspaceSha256,commitId:`whole-film-motion-render-${renderedAt.replace(/[-:.TZ]/gu,"").slice(0,14)}`,files:{[`${relativeRoot}/render-report.json`]:report},binaryFiles});
});

console.log(JSON.stringify({status:report.status,workspaceSha256Before:initial.workspaceSha256,workspaceSha256After:committed.workspaceSha256,reportSha256:report.reportSha256,video,contactSheet,preflight:report.preflight,workerStatus:"frozen",assemblyAllowed:false,final1080RenderAllowed:false,tempRoot},null,2));
