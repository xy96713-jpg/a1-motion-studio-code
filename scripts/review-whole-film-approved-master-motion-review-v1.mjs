#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root=path.resolve(import.meta.dirname,"..");
const appRoot=path.join(root,"apps/studio-next");
const publicRoot=path.join(appRoot,"public");
const relativeRoot="generated/system-line/editorial-asset-workbench-v1/whole-film-motion-plan-v1";
const phaseRoot=path.join(publicRoot,relativeRoot);
const reviewRoot=path.join(phaseRoot,"actual-pixel-review-v1");
const frameRoot=path.join(reviewRoot,"frames");
const propsPath=path.join(phaseRoot,"input-props.json");
const renderReportPath=path.join(phaseRoot,"render-report.json");
const videoPath=path.join(phaseRoot,"whole-film-motion-review-960x540.mp4");
const expectedWorkspaceSha256=process.argv[2];
if(!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256||""))) throw new Error("whole-film-motion-review-valid-workspace-sha-required");

const require=createRequire(path.join(root,"package.json"));
const sharp=require("sharp");
const ffmpeg=path.join(root,".tools/bin/ffmpeg");
const ffprobe=path.join(root,".tools/bin/ffprobe");
const sha256=(value)=>crypto.createHash("sha256").update(Buffer.isBuffer(value)||typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const shaFile=(file)=>sha256(fs.readFileSync(file));
const publicUrl=(file)=>`/${path.relative(publicRoot,file).split(path.sep).join("/")}`;

function command(binary,args){
  const result=spawnSync(binary,args,{cwd:root,encoding:"utf8",maxBuffer:64*1024*1024});
  if(result.status!==0) throw new Error(`whole-film-motion-review-command-failed:${binary}:${result.stderr||result.stdout}`);
  return result.stdout;
}

function outputBinding(file){
  return {publicUrl:publicUrl(file),sha256:shaFile(file),bytes:fs.statSync(file).size};
}

function xml(value){
  return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

async function normalizedPixels(file,{excludeCaption=false}={}){
  const metadata=await sharp(file).metadata();
  let image=sharp(file);
  if(excludeCaption) image=image.extract({left:0,top:0,width:metadata.width,height:Math.max(1,Math.floor(metadata.height*.82))});
  return image.resize(320,180,{fit:"fill"}).removeAlpha().greyscale().raw().toBuffer();
}

function meanAbsolutePixelDelta(left,right){
  if(left.length!==right.length) throw new Error(`whole-film-motion-review-pixel-buffer-length-mismatch:${left.length}:${right.length}`);
  let total=0;
  for(let index=0;index<left.length;index+=1) total+=Math.abs(left[index]-right[index]);
  return Math.round(total/Math.max(1,left.length)/255*100000)/100000;
}

async function imageGate(file){
  const {channels}=await sharp(file).resize(320,180,{fit:"fill"}).removeAlpha().stats();
  const range=Math.max(...channels.map((channel)=>channel.max-channel.min));
  const stdev=Math.max(...channels.map((channel)=>channel.stdev));
  return {range,stdev,status:range>=18&&stdev>=4?"PASS":"FAIL"};
}

async function contactSheet({samples,file,columns=4,tileWidth=360,tileHeight=203}){
  const labelHeight=32;
  const tiles=[];
  for(const sample of samples){
    const label=Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0c0f13"/><text x="10" y="21" fill="#dfff68" font-family="monospace" font-size="12" font-weight="700">${xml(`${sample.shotId} · ${sample.label} · F${sample.frame}`)}</text></svg>`);
    tiles.push(await sharp(sample.file).resize(tileWidth,tileHeight,{fit:"fill"}).extend({top:labelHeight,bottom:0,left:0,right:0,background:"#0c0f13"}).composite([{input:label,top:0,left:0}]).png().toBuffer());
  }
  const rows=Math.ceil(tiles.length/columns);
  await sharp({create:{width:tileWidth*columns,height:(tileHeight+labelHeight)*rows,channels:4,background:"#0c0f13"}}).composite(tiles.map((input,index)=>({input,left:index%columns*tileWidth,top:Math.floor(index/columns)*(tileHeight+labelHeight)}))).png().toFile(file);
}

const current=assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if(current.workspaceSha256!==expectedWorkspaceSha256) throw new Error(`whole-film-motion-review-workspace-cas-failed:${current.workspaceSha256}`);
if(current.production.generation.summary.queued!==0||current.production.generation.summary.running!==0||current.production.generation.workerStatus!=="frozen"||current.production.generation.automaticDispatchAllowed!==false) throw new Error("whole-film-motion-review-frozen-runtime-required");
const authority=current.production.shotIntelligence.wholeFilmApprovedMasterMotionPlan;
if(authority?.status!=="WHOLE_FILM_540P_REVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW"||authority.actualPixelVisualReviewStatus!=="PENDING"||authority.assemblyAllowed!==false||authority.final1080RenderAllowed!==false) throw new Error(`whole-film-motion-review-authority-invalid:${authority?.status||"missing"}`);
const inputProps=JSON.parse(fs.readFileSync(propsPath,"utf8"));
const renderReport=JSON.parse(fs.readFileSync(renderReportPath,"utf8"));
if(authority.renderReportSha256!==renderReport.reportSha256||authority.video.sha256!==shaFile(videoPath)||renderReport.sourcePropsSha256!==inputProps.propsSha256) throw new Error("whole-film-motion-review-pointer-mismatch");
if(inputProps.beats.length!==34||inputProps.beats.filter((beat)=>beat.kind==="PACKAGE").length!==13) throw new Error("whole-film-motion-review-counts-invalid");

fs.mkdirSync(frameRoot,{recursive:true});
const timelineSamples=inputProps.beats.map((beat)=>({shotId:beat.shotId,label:beat.kind,frame:beat.startFrame+Math.max(0,Math.min(beat.durationInFrames-1,Math.floor(beat.durationInFrames*.5))),kind:beat.kind}));
const packageSamples=inputProps.beats.filter((beat)=>beat.kind==="PACKAGE").flatMap((beat)=>{
  const phases=beat.package.motionIrScene.phases;
  const localFrames={
    setup:Math.max(1,Math.min(beat.durationInFrames-1,phases.setup.endFrame)),
    action:Math.max(1,Math.min(beat.durationInFrames-1,Math.round((phases.action.startFrame+phases.action.endFrame)/2))),
    hold:Math.max(1,Math.min(beat.durationInFrames-1,phases.stableReadingHold.startFrame+Math.min(10,Math.max(0,phases.stableReadingHold.endFrame-phases.stableReadingHold.startFrame-1)))),
  };
  return Object.entries(localFrames).map(([label,localFrame])=>({shotId:beat.shotId,label,frame:beat.startFrame+localFrame,kind:beat.kind,localFrame}));
});
const allSamples=[...timelineSamples,...packageSamples];
const uniqueFrames=[...new Set(allSamples.map((sample)=>sample.frame))].sort((a,b)=>a-b);
const selectExpression=uniqueFrames.map((frame)=>`eq(n\\,${frame})`).join("+");
const extractedPattern=path.join(frameRoot,"decoded-%03d.png");
command(ffmpeg,["-v","error","-i",videoPath,"-vf",`select=${selectExpression}`,"-vsync","0","-compression_level","6",extractedPattern]);
const extracted=fs.readdirSync(frameRoot).filter((name)=>/^decoded-\d+\.png$/u.test(name)).sort().map((name)=>path.join(frameRoot,name));
if(extracted.length!==uniqueFrames.length) throw new Error(`whole-film-motion-review-extracted-count-mismatch:${extracted.length}:${uniqueFrames.length}`);
const fileByFrame=new Map(uniqueFrames.map((frame,index)=>[frame,extracted[index]]));
for(const sample of allSamples) sample.file=fileByFrame.get(sample.frame);

const timelineSheetPath=path.join(reviewRoot,"timeline-34-beat-midframes.png");
const packageSheetAPath=path.join(reviewRoot,"package-motion-phases-01-07.png");
const packageSheetBPath=path.join(reviewRoot,"package-motion-phases-08-13.png");
const dynamicSheetPath=path.join(reviewRoot,"dynamic-original-presenter-ed08-ed13-ed31.png");
await contactSheet({samples:timelineSamples,file:timelineSheetPath,columns:4});
const packageIds=[...new Set(packageSamples.map((sample)=>sample.shotId))];
await contactSheet({samples:packageSamples.filter((sample)=>packageIds.slice(0,7).includes(sample.shotId)),file:packageSheetAPath,columns:3,tileWidth:480,tileHeight:270});
await contactSheet({samples:packageSamples.filter((sample)=>packageIds.slice(7).includes(sample.shotId)),file:packageSheetBPath,columns:3,tileWidth:480,tileHeight:270});
await contactSheet({samples:packageSamples.filter((sample)=>["ED-08","ED-13","ED-31"].includes(sample.shotId)),file:dynamicSheetPath,columns:3,tileWidth:480,tileHeight:270});

const minimumMeaningfulMotionDelta=.002;
const maximumBoundedMotionDelta=.5;
const maximumStableMasterDelta=.08;
const packageAudits=[];
for(const beat of inputProps.beats.filter((item)=>item.kind==="PACKAGE")){
  const samples=packageSamples.filter((sample)=>sample.shotId===beat.shotId);
  const [setupPixels,actionPixels,holdPixels]=await Promise.all(samples.map((sample)=>normalizedPixels(sample.file,{excludeCaption:true})));
  const setupToActionDelta=meanAbsolutePixelDelta(setupPixels,actionPixels);
  const actionToHoldDelta=meanAbsolutePixelDelta(actionPixels,holdPixels);
  const finalMasterPixels=await normalizedPixels(path.join(publicRoot,beat.package.finalComposite.publicUrl.replace(/^\//u,"")),{excludeCaption:true});
  const stableMasterDelta=meanAbsolutePixelDelta(holdPixels,finalMasterPixels);
  const dynamicPresenter=Boolean(beat.package.presenterMatte);
  const meaningfulMotionPass=setupToActionDelta>=minimumMeaningfulMotionDelta||actionToHoldDelta>=minimumMeaningfulMotionDelta;
  const boundedMotionPass=setupToActionDelta<=maximumBoundedMotionDelta&&actionToHoldDelta<=maximumBoundedMotionDelta;
  const stableMasterPass=dynamicPresenter?true:stableMasterDelta<=maximumStableMasterDelta;
  packageAudits.push({shotId:beat.shotId,mode:beat.package.mode,dynamicPresenter,phaseFrames:Object.fromEntries(samples.map((sample)=>[sample.label,sample.frame])),setupToActionDelta,actionToHoldDelta,stableMasterDelta,stableMasterComparison:dynamicPresenter?"DYNAMIC_ORIGINAL_PRESENTER_EXPECTED":"STATIC_APPROVED_MASTER",meaningfulMotionPass,boundedMotionPass,stableMasterPass,status:meaningfulMotionPass&&boundedMotionPass&&stableMasterPass?"ACTUAL_PIXEL_GATE_PASS":"ACTUAL_PIXEL_GATE_FAIL"});
}

const timelineImageGates=[];
for(const sample of timelineSamples) timelineImageGates.push({shotId:sample.shotId,kind:sample.kind,frame:sample.frame,...await imageGate(sample.file)});
const mediaProbe=JSON.parse(command(ffprobe,["-v","error","-show_entries","format=duration:stream=index,codec_name,codec_type,width,height,sample_rate,channels","-of","json",videoPath]));
const durationSeconds=Number(mediaProbe.format?.duration||0);
const videoStream=mediaProbe.streams?.find((stream)=>stream.codec_type==="video");
const audioStream=mediaProbe.streams?.find((stream)=>stream.codec_type==="audio");
const mediaGatePass=videoStream?.codec_name==="h264"&&videoStream.width===960&&videoStream.height===540&&Boolean(audioStream)&&Math.abs(durationSeconds-inputProps.durationMs/1000)<=.1;
const failures={package:packageAudits.filter((item)=>item.status!=="ACTUAL_PIXEL_GATE_PASS").map((item)=>item.shotId),timeline:timelineImageGates.filter((item)=>item.status!=="PASS").map((item)=>item.shotId),media:mediaGatePass?[]:["MEDIA_PROBE"]};
const status=[...failures.package,...failures.timeline,...failures.media].length?"ACTUAL_PIXEL_GATE_FAIL":"ACTUAL_PIXEL_GATE_PASS_PENDING_VISUAL_REVIEW";
const createdAt=new Date().toISOString();
const reportBody={contract:"A1WholeFilmApprovedMasterMotionActualPixelReview/v1",status,reviewOnly:true,promotedRender:false,finalRelease:false,sourceWorkspaceSha256:current.workspaceSha256,sourcePlanSha256:authority.planSha256,sourceRenderReportSha256:renderReport.reportSha256,sourceVideoSha256:shaFile(videoPath),sourcePropsSha256:inputProps.propsSha256,routeCounts:{PACKAGE:13,SCREEN_EVIDENCE:16,PRESENTER_BASE:5},timelineBeatCount:34,thresholds:{minimumMeaningfulMotionDelta,maximumBoundedMotionDelta,maximumStableMasterDelta},mediaProbe:{durationSeconds,videoStream,audioStream,status:mediaGatePass?"PASS":"FAIL"},packageAudits,timelineImageGates,failures,artifacts:{timelineContactSheet:outputBinding(timelineSheetPath),packageContactSheets:[outputBinding(packageSheetAPath),outputBinding(packageSheetBPath)],dynamicPresenterContactSheet:outputBinding(dynamicSheetPath)},visualReviewStatus:"PENDING",gates:{actualPixelGatePassed:status!=="ACTUAL_PIXEL_GATE_FAIL",actualVisualReviewPassed:false,assemblyAllowed:false,final1080RenderAllowed:false,resolveAllowed:false,releaseAllowed:false},workerStatus:"frozen",createdAt};
const report={...reportBody,reviewSha256:sha256({...reportBody,createdAt:undefined})};
fs.writeFileSync(path.join(reviewRoot,"actual-pixel-review.json"),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({status,reviewSha256:report.reviewSha256,mediaProbe:report.mediaProbe,failures,packageAudits,artifacts:report.artifacts,workerStatus:"frozen",assemblyAllowed:false,final1080RenderAllowed:false},null,2));
