import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {assertMotionReviewReceipt, motionReviewHash} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";
const root=path.resolve(import.meta.dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.resolve(root,p))),hash=p=>crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root,p))).digest("hex");
const config=read(process.argv[2]),workspace=read("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const all=workspace.production.shotIntelligence.currentStoryboardAuthority.shots;
const items=config.receiptPaths.map(file=>{const receipt=read(file),shot=all.find(s=>s.shotId===receipt.shotId);if(!shot)throw new Error("sequence-shot-missing");assertMotionReviewReceipt(shot,receipt);if(hash(receipt.video.path)!==receipt.video.sha256||motionReviewHash(receipt.rendererFiles.map(p=>[p,hash(p)]))!==receipt.rendererSha256)throw new Error("sequence-input-changed");return {receiptPath:file,receiptSha256:hash(file),shotId:shot.shotId,timeRange:shot.timeRange,video:receipt.video};});
if(!items.length)throw new Error("sequence-inputs-required");
for(let i=1;i<items.length;i++)if(items[i-1].timeRange.endMs!==items[i].timeRange.startMs)throw new Error("sequence-gap-requires-continuous-source-integration");
const startMs=items[0].timeRange.startMs,endMs=items.at(-1).timeRange.endMs,fps=60;
for(const item of items){item.fromFrame=Math.round((item.timeRange.startMs-startMs)*fps/1000);item.endFrame=Math.round((item.timeRange.endMs-startMs)*fps/1000);}
const input={items,narrationPath:config.narrationPath,narrationSha256:hash(config.narrationPath),builderSha256:hash("scripts/build-current-internal-review-sequence-v1.mjs")};
const identity=motionReviewHash(input),dir=path.join(root,"work/screen-production-integration-v1",`review-sequence-${identity.slice(0,16)}`);fs.mkdirSync(dir,{recursive:true});
const output=path.join(dir,"narrated.mp4"),manifestPath=path.join(dir,"manifest.json");
if(fs.existsSync(manifestPath)){const cached=read(manifestPath);if(hash(output)!==cached.videoSha256)throw new Error("sequence-cache-corrupt");console.log(JSON.stringify({status:"CACHE_HIT",manifestPath}));process.exit(0);}
const args=["-v","error","-y",...items.flatMap(i=>["-i",path.resolve(root,i.video.path)]),"-ss",String(startMs/1000),"-i",path.resolve(root,config.narrationPath)];
const filter=items.map((item,i)=>`[${i}:v]fps=60,trim=end_frame=${item.endFrame-item.fromFrame},setpts=PTS-STARTPTS[v${i}]`).join(";")+`;${items.map((_,i)=>`[v${i}]`).join("")}concat=n=${items.length}:v=1:a=0[v]`;
const totalFrames=items.at(-1).endFrame;
execFileSync("ffmpeg",[...args,"-filter_complex",filter,"-map","[v]","-map",`${items.length}:a:0`,"-t",String(totalFrames/fps),"-r","60","-fps_mode","cfr","-video_track_timescale","15360","-c:v","libx264","-crf","17","-c:a","aac",output]);
const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-of","json",output],{encoding:"utf8"})),video=probe.streams.find(s=>s.codec_type==="video");
if(Number(video.nb_frames)!==totalFrames||video.width!==960||video.height!==540||video.avg_frame_rate!=="60/1"||!probe.streams.some(s=>s.codec_type==="audio"))throw new Error("sequence-media-contract-invalid");
execFileSync("ffmpeg",["-v","error","-i",output,"-f","null","-"],{stdio:"pipe"});
const manifest={contract:"A1CurrentInternalReviewSequence/v1",status:"INTERNAL_VIEWING_REQUIRED",...input,path:path.relative(root,output),videoSha256:hash(output),includedShotVideoSha256s:items.map(i=>i.video.sha256),startMs,endMs,totalFrames,normalSpeedPlayback:false,withNarration:true,productionAdmission:false,notAProductionRenderer:true};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));console.log(JSON.stringify({status:manifest.status,manifestPath,path:manifest.path,videoSha256:manifest.videoSha256}));
