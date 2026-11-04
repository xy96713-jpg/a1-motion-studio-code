#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
const root=path.resolve(import.meta.dirname,".."),publicRoot=path.join(root,"apps/studio-next/public"),phase="generated/system-line/editorial-asset-workbench-v1",ffmpeg=path.join(root,".tools/bin/ffmpeg");
const require=createRequire(path.join(root,"apps/studio-next/package.json")),sharp=require("sharp"),read=(rel)=>JSON.parse(fs.readFileSync(path.join(publicRoot,rel),"utf8"));
const render=read(`${phase}/current-full-film-540p-v1/report.json`),ledger=read(`${phase}/current-visual-decision-ledger-v1/ledger.json`),video=path.join(publicRoot,render.video.publicUrl.replace(/^\//u,"")),presenter=path.join(publicRoot,phase,"imported-film-media-v1/presenter-video-093bc1315163.mov"),out=path.join(publicRoot,phase,"current-full-film-540p-v1/pixel-audit");
fs.mkdirSync(out,{recursive:true});const entryByShot=new Map(ledger.entries.map((item)=>[item.shotId,item])),resetByShot=new Map((render.screenRunBreathing?.resets||[]).map((item)=>[item.afterShotId,item])),shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if(!fs.existsSync(video)||shaFile(video)!==render.video.sha256)throw new Error("full-film-pixel-audit-video-invalid");
const normalized=async(file)=>sharp(file).resize(320,180,{fit:"fill"}).removeAlpha().grayscale().raw().toBuffer();
const delta=(a,b)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return Number((sum/a.length/255).toFixed(5));};
const grab=(source,time,file)=>{const result=spawnSync(ffmpeg,["-y","-ss",String(time),"-i",source,"-vf","scale=960:540","-frames:v","1",file],{encoding:"utf8",maxBuffer:100000});if(result.status!==0)throw new Error(`full-film-pixel-frame-failed:${path.basename(file)}`);};
const results=[];let cursor=0;
for(const clip of render.clips){
  const entry=entryByShot.get(clip.shotId),approved=path.join(publicRoot,entry.selectedFrame.publicUrl.replace(/^\//u,"")),reset=resetByShot.get(clip.shotId);
  if(!fs.existsSync(approved)||shaFile(approved)!==entry.selectedFrame.sha256)throw new Error(`full-film-pixel-approved-invalid:${clip.shotId}`);
  const actionOffset=clip.route==="TRUE_TRANSPARENT_LAYERS"?Math.min(clip.duration*.28,1.8):clip.duration*.52;
  const finalGlobal=reset?reset.startMs/1000-.08:cursor+Math.max(.04,clip.duration-.08);
  const times={first:cursor+.04,middle:cursor+actionOffset,final:finalGlobal},frames={};
  for(const [state,time]of Object.entries(times)){const file=path.join(out,`${clip.shotId}-${state}.png`);grab(video,time,file);frames[state]=file;}
  const [first,middle,final,approvedPixels]=await Promise.all([normalized(frames.first),normalized(frames.middle),normalized(frames.final),normalized(approved)]),actionDelta=delta(first,middle),finalApprovedDelta=delta(final,approvedPixels),firstApprovedDelta=delta(first,approvedPixels),failures=[];
  if(actionDelta<.0012&&!clip.route.includes("PRESENTER_SOURCE_HOLD"))failures.push(`motion-not-visible:${actionDelta}`);
  if(finalApprovedDelta>.09)failures.push(`final-ledger-parity-drift:${finalApprovedDelta}`);
  if(clip.shotId==="ED-01"&&firstApprovedDelta>.025)failures.push(`opening-not-approved-fullscreen:${firstApprovedDelta}`);
  let resetPresenterDelta=null;
  if(reset){const time=(reset.startMs+reset.endMs)/2000,filmReset=path.join(out,`${clip.shotId}-breathing-reset.png`),sourceReset=path.join(out,`${clip.shotId}-presenter-source.png`);grab(video,time,filmReset);grab(presenter,time,sourceReset);resetPresenterDelta=delta(await normalized(filmReset),await normalized(sourceReset));if(resetPresenterDelta>.08)failures.push(`breathing-reset-not-real-presenter:${resetPresenterDelta}`);}
  results.push({shotId:clip.shotId,route:clip.route,status:failures.length?"FAIL":"PASS",startSec:Number(cursor.toFixed(3)),durationSec:clip.duration,actionDelta,firstApprovedDelta,finalApprovedDelta,breathingResetApplied:Boolean(reset),resetPresenterDelta,failures});cursor+=clip.duration;
}
const failures=results.flatMap((item)=>item.failures.map((failure)=>`${item.shotId}:${failure}`)),black=spawnSync(ffmpeg,["-v","warning","-i",video,"-vf","blackdetect=d=0.2:pix_th=0.02","-an","-f","null","-"],{encoding:"utf8",maxBuffer:300000}),blackSegments=(black.stderr.match(/black_start:/gu)||[]).length,silence=spawnSync(ffmpeg,["-v","warning","-i",video,"-af","silencedetect=n=-50dB:d=1.0","-vn","-f","null","-"],{encoding:"utf8",maxBuffer:300000}),silenceSegments=(silence.stderr.match(/silence_start:/gu)||[]).length;
if(blackSegments)failures.push(`unexpected-black-segments:${blackSegments}`);const suppressed=render.screenRunBreathing?.suppressedLegacyPresenterResetShotIds||[],approvedBackgroundPrehold=suppressed.length===3&&(render.screenRunBreathing?.resetCount||0)===0&&Number(render.screenRunBreathing?.approvedPreHoldMs||0)>=550;if(!approvedBackgroundPrehold&&(render.screenRunBreathing?.resetCount||0)!==3)failures.push("screen-run-breathing-reset-count-invalid");
const report={contract:"A1CurrentFullFilm540pActualPixelAudit/v2",status:failures.length?"FAIL":"PASS",sourceVideoSha256:render.video.sha256,sourceVisualLedgerSha256:render.sourceVisualLedgerSha256,sourceScreenRunBreathingPlanSha256:render.screenRunBreathing?.planSha256||null,shotCount:results.length,timelineDurationSec:Number(cursor.toFixed(3)),results,blackSegments,silenceSegments,failures,auditedAt:new Date().toISOString()};
fs.writeFileSync(path.join(out,"report.json"),`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify({status:report.status,shotCount:report.shotCount,timelineDurationSec:report.timelineDurationSec,breathingResetCount:render.screenRunBreathing?.resetCount||0,blackSegments,silenceSegments,failures,failedShots:results.filter((item)=>item.status==="FAIL")},null,2));if(failures.length)process.exitCode=2;
