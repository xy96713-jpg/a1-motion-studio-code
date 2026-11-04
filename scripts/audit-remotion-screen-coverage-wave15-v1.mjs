#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, ".."), outputRoot = path.join(root, "work/remotion-screen-coverage-wave15-v1");
const plan = JSON.parse(fs.readFileSync(path.join(outputRoot, "plan.json"), "utf8")), batch = JSON.parse(fs.readFileSync(path.join(outputRoot, "render-batch.json"), "utf8"));
if (plan.status !== "READY" || batch.status !== "PASS" || batch.sourcePlanSha256 !== plan.planSha256) throw new Error("coverage-wave15-plan-batch-binding");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg"), ffprobe = path.join(root, ".tools/bin/ffprobe"), require = createRequire(path.join(root, "apps/studio-next/package.json")), sharp = require("sharp");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const extract = (video, ms, file) => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.max(0, ms) / 1000), "-i", video, "-frames:v", "1", file]);
const delta = async (left, right) => {const [a,b]=await Promise.all([left,right].map((file)=>sharp(file).resize(320,180).removeAlpha().grayscale().raw().toBuffer()));let sum=0;for(let i=0;i<a.length;i+=1)sum+=Math.abs(a[i]-b[i]);return Number((sum/a.length/255).toFixed(6));};
const luma = async (file) => {const stats=await sharp(file).stats();return Number((stats.channels.slice(0,3).reduce((sum,item)=>sum+item.mean,0)/765).toFixed(6));};
const items=[],failures=[],tiles=[];
const emphasisCounts={SOURCE_BOUND_CIRCLE:0,SOURCE_BOUND_FOCUS_WINDOW:0,CLEAN:0};
for(const item of plan.items){
  const renderRecord=batch.results.find((candidate)=>candidate.shotId===item.shotId),video=path.join(root,item.outputPath),props=JSON.parse(fs.readFileSync(path.join(root,item.propsPath),"utf8")),durationMs=Number(props.scenes[0].durationMs),shotFailures=[];
  if(!renderRecord||!fs.existsSync(video)||sha256(video)!==renderRecord.outputSha256||renderRecord.propsSha256!==item.propsSha256)shotFailures.push("RENDER_BINDING");
  const probe=JSON.parse(execFileSync(ffprobe,["-v","error","-count_frames","-show_entries","stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames:format=duration,size","-of","json",video],{encoding:"utf8"})),stream=probe.streams.find((entry)=>entry.codec_type==="video"),audio=probe.streams.find((entry)=>entry.codec_type==="audio"),actualDurationMs=Math.round(Number(probe.format.duration)*1000);
  if(stream?.width!==960||stream?.height!==540||stream?.r_frame_rate!=="60/1"||!audio)shotFailures.push("MEDIA_CONTRACT");
  if(Math.abs(actualDurationMs-durationMs)>100||Math.abs(Number(stream?.nb_read_frames)-Math.round(durationMs/1000*60))>2)shotFailures.push("TIMING_CONTRACT");
  const mediumPose=item.poses.find((pose)=>pose.id==="MEDIUM_ACTION")||item.poses[0],resultPose=item.poses.find((pose)=>pose.id==="RESULT_DETAIL")||item.poses.at(-1);
  const mediumFile=path.join(outputRoot,`${item.shotId.toLowerCase()}-audit-medium.jpg`),resultFile=path.join(outputRoot,`${item.shotId.toLowerCase()}-audit-result.jpg`),finalFile=path.join(outputRoot,`${item.shotId.toLowerCase()}-audit-final.jpg`);
  extract(video,Math.min(durationMs-150,mediumPose.atMs+200),mediumFile);extract(video,Math.min(durationMs-150,resultPose.atMs+200),resultFile);extract(video,durationMs-120,finalFile);
  const [mediumLuma,resultLuma,finalLuma,coverageCutDelta,finalHoldDelta]=await Promise.all([luma(mediumFile),luma(resultFile),luma(finalFile),delta(mediumFile,resultFile),delta(resultFile,finalFile)]);
  if([mediumLuma,resultLuma,finalLuma].some((value)=>value<.08))shotFailures.push("BLACK_FRAME");
  if(finalHoldDelta>.06)shotFailures.push("RESULT_HOLD_UNSTABLE");
  if(item.cameraTransitionMode!=="SINGLE_SETTLE_LOCK")shotFailures.push("CAMERA_TRANSITION_MODE");
  const movingSegments=item.cameraTrack.slice(0,-1).map((keyframe,index)=>({from:keyframe,to:item.cameraTrack[index+1]})).filter(({from,to})=>from.x!==to.x||from.y!==to.y||from.scale!==to.scale);
  if(movingSegments.length>1)shotFailures.push("CAMERA_MOVE_BUDGET");
  if(Math.max(...item.cameraTrack.map((keyframe)=>keyframe.scale))>1.18)shotFailures.push("CAMERA_SCALE_BUDGET");
  if(movingSegments.some(({from,to})=>from.easingToNext!=="cinematic-in"||to.atMs-from.atMs<280||to.atMs-from.atMs>440))shotFailures.push("CAMERA_MOVE_WINDOW");
  if(movingSegments.some(({to},index)=>{const next=item.cameraTrack[item.cameraTrack.indexOf(to)+1];return next&&next.atMs-to.atMs<160;}))shotFailures.push("CAMERA_SETTLED_HOLD_TOO_SHORT");
  const treatments=item.emphasisActors||[];
  if(treatments.length>1)shotFailures.push("EMPHASIS_ACTOR_BUDGET");
  if(treatments.length&&(item.coordinateBoundEmphasisPolicy!=="FULL_FRAME_LOCK"||item.cameraTrack.some((keyframe)=>keyframe.x!==.5||keyframe.y!==.5||keyframe.scale!==1)))shotFailures.push("COORDINATE_BOUND_ACTOR_CAMERA_NOT_LOCKED");
  for(const attention of props.scenes[0].screenDirection.attentionTrack||[]){const region=attention.region,left=Math.max(0,region.x),top=Math.max(0,region.y),right=Math.min(1,region.x+region.width),bottom=Math.min(1,region.y+region.height),visibleRatio=Math.max(0,right-left)*Math.max(0,bottom-top)/Math.max(.000001,region.width*region.height);if(visibleRatio<.95)shotFailures.push("PROJECTED_ACTOR_VISIBILITY_BELOW_95_PERCENT");}
  if(!treatments.length)emphasisCounts.CLEAN+=1;
  else for(const treatment of treatments){if(!(treatment in emphasisCounts))shotFailures.push("EMPHASIS_TREATMENT");else emphasisCounts[treatment]+=1;}
  const expectedRegionSource=item.directorFamily==="STATE_SWITCH_HARD_CUT"||item.directorFamily==="FULLSCREEN_RESULT_TRANSITION"?"FULL_STATE":"VERIFIED_PIXEL_DELTA";if(item.resultRegionSource!==expectedRegionSource)shotFailures.push("RESULT_REGION_SOURCE");
  failures.push(...shotFailures.map((failure)=>`${item.shotId}:${failure}`));
  const label=(text)=>Buffer.from(`<svg width="480" height="34"><rect width="100%" height="100%" fill="#0c0f13"/><text x="10" y="23" fill="#dfff68" font-family="monospace" font-size="12">${text}</text></svg>`);for(const [role,file] of [["MEDIUM",mediumFile],["RESULT",resultFile]]){const image=await sharp(file).resize(480,270).jpeg({quality:90}).toBuffer();tiles.push(await sharp({create:{width:480,height:304,channels:3,background:"#0c0f13"}}).composite([{input:image,left:0,top:0},{input:label(`${item.shotId} · ${item.directorFamily} · ${role}`),left:0,top:270}]).jpeg({quality:90}).toBuffer());}
  items.push({shotId:item.shotId,status:shotFailures.length?"FAIL":"PASS",directorFamily:item.directorFamily,strategy:item.strategy,coverageSha256:item.coverageSha256,resultRegionSource:item.resultRegionSource,render:{path:item.outputPath,sha256:sha256(video),frameCount:Number(stream?.nb_read_frames),durationMs:actualDurationMs,audioCodec:audio?.codec_name||null},pixels:{mediumLuma,resultLuma,finalLuma,coverageCutDelta,finalHoldDelta,mediumSha256:sha256(mediumFile),resultSha256:sha256(resultFile),finalSha256:sha256(finalFile)},failures:shotFailures});
}
const contact=path.join(outputRoot,"wave15-coverage-contact-sheet.jpg");await sharp({create:{width:960,height:items.length*304,channels:3,background:"#0c0f13"}}).composite(tiles.map((input,index)=>({input,left:(index%2)*480,top:Math.floor(index/2)*304}))).jpeg({quality:92}).toFile(contact);
if(JSON.stringify(emphasisCounts)!==JSON.stringify({SOURCE_BOUND_CIRCLE:1,SOURCE_BOUND_FOCUS_WINDOW:4,CLEAN:10}))failures.push(`EMPHASIS_SEQUENCE_COUNTS:${JSON.stringify(emphasisCounts)}`);
const body={contract:"A1RemotionScreenCoverageWave15Audit/v5",status:failures.length?"FAIL":"PASS",sourcePlanSha256:plan.planSha256,sourceRenderBatchSha256:batch.batchSha256,shotCount:items.length,familyCount:new Set(items.map((item)=>item.directorFamily)).size,requirements:{width:960,height:540,fps:60,audioRequired:true,cameraTransitionMode:"SINGLE_SETTLE_LOCK",maximumCameraMovesPerShot:1,maximumCameraScale:1.18,coordinateBoundEmphasisCameraPolicy:"FULL_FRAME_LOCK",minimumProjectedActorVisibleRatio:.95,moveDurationRangeMs:[280,440],minimumSettledHoldMs:160,resultCausalitySource:"VERIFIED_CAPTURE_EVENTS_AND_PERSISTENT_RESULT_EVIDENCE",visibleSecondReframeRequired:false,maximumFinalHoldDelta:.06,maximumEmphasisActorsPerShot:1},emphasisCounts,items,contactSheet:{path:path.relative(root,contact),sha256:sha256(contact)},boundary:{reviewOnly:true,productionAdmission:false,currentAuthorityMutated:false,userVisualApproval:"NOT_APPROVED"},failures};const report={...body,auditSha256:crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};fs.writeFileSync(path.join(outputRoot,"audit-report.json"),`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify({status:report.status,shotCount:report.shotCount,familyCount:report.familyCount,emphasisCounts:report.emphasisCounts,failures:report.failures,contactSheet:report.contactSheet,auditSha256:report.auditSha256},null,2));if(failures.length)process.exitCode=1;
