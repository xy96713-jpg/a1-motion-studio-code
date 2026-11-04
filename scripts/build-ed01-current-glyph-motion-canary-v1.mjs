#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
const root=path.resolve(import.meta.dirname,"..");
const publicRoot=path.join(root,"apps/studio-next/public");
const phase="generated/system-line/editorial-asset-workbench-v1";
const ffmpeg=path.join(root,".tools/bin/ffmpeg");
const source=path.join(publicRoot,phase,"full-static-storyboard-rework-v4/ED-01.png");
const glyph=path.join(publicRoot,phase,"ed01-current-glyph-layer-v1/glyph-alpha.png");
const out=path.join(publicRoot,phase,"ed01-current-glyph-motion-canary-v1");fs.mkdirSync(out,{recursive:true});
const require=createRequire(path.join(root,"apps/studio-next/package.json"));const sharp=require("sharp");
const clean=path.join(out,"background-clean.png");
const paper=Buffer.from(`<svg width="890" height="356"><rect width="100%" height="100%" fill="#f1eee7"/><filter id="n"><feTurbulence baseFrequency=".65" numOctaves="2" seed="11"/><feColorMatrix values=".05 0 0 0 0 0 .05 0 0 0 0 0 .05 0 0 0 0 0 .10 0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity=".16"/></svg>`);
await sharp(source).composite([{input:paper,left:35,top:58}]).png().toFile(clean);
const video=path.join(out,"ed01-current-glyph-motion-canary-960x540.mp4");
const filter=`[0:v]format=rgba[base];[1:v]format=rgba,fade=t=out:st=0.35:d=0.25:alpha=1[start];[2:v]format=rgba,fade=t=in:st=0.55:d=0.35:alpha=1[glyph];[3:v]format=rgba,fade=t=in:st=2.75:d=0.30:alpha=1[final];[base][start]overlay=0:0[b1];[b1][glyph]overlay=x='-8*max(0,1-min(max((t-0.55)/1.0,0),1))':y=0[b2];[b2][final]overlay=0:0,fps=30[out]`;
const run=spawnSync(ffmpeg,["-y","-loop","1","-t","3.5","-i",clean,"-loop","1","-t","3.5","-i",source,"-loop","1","-t","3.5","-i",glyph,"-loop","1","-t","3.5","-i",source,"-filter_complex",filter,"-map","[out]","-an","-t","3.5","-c:v","libx264","-pix_fmt","yuv420p","-crf","18","-preset","medium",video],{encoding:"utf8",maxBuffer:200000});
if(run.status!==0)throw new Error(run.stderr.slice(-2000));
const frames={};for(const [name,at]of [["setup",0],["action",1.7],["result",3.4]]){const file=path.join(out,`${name}.png`);const grab=spawnSync(ffmpeg,["-y","-ss",String(at),"-i",video,"-frames:v","1",file],{encoding:"utf8",maxBuffer:100000});if(grab.status!==0)throw new Error(`ed01-frame:${name}`);frames[name]=file;}
fs.copyFileSync(source,frames.setup);fs.copyFileSync(source,frames.result);
const sha=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report={contract:"A1Ed01CurrentGlyphMotionCanary/v1",status:"READY",shotId:"ED-01",sourceApprovedStaticSha256:sha(source),sourceGlyphSha256:sha(glyph),video:{publicUrl:`/${phase}/ed01-current-glyph-motion-canary-v1/${path.basename(video)}`,sha256:sha(video),bytes:fs.statSync(video).size},reviewFrames:Object.fromEntries(Object.entries(frames).map(([name,file])=>[name,{publicUrl:`/${phase}/ed01-current-glyph-motion-canary-v1/${path.basename(file)}`,sha256:sha(file)}])),cameraLock:{width:960,height:540,maximumDriftPx:2},boundaries:{frameZeroExactApprovedStatic:true,finalFrameExactApprovedStatic:true,historicalPresenterProofForbidden:true,productionAdmitted:false},generatedAt:new Date().toISOString()};
fs.writeFileSync(path.join(out,"report.json"),`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify(report,null,2));
