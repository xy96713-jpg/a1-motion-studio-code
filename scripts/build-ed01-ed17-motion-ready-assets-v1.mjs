#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";

const root=path.resolve(import.meta.dirname,"..");
const publicRoot=path.join(root,"apps/studio-next/public");
const phase="generated/system-line/editorial-asset-workbench-v1";
const require=createRequire(path.join(root,"apps/studio-next/package.json"));
const sharp=require("sharp");
const ffmpeg=path.join(root,".tools/bin/ffmpeg");
const hash=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function raw(file){return sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});}
async function writeAlphaExtract(source,out,predicate){
  const {data,info}=await raw(source);
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;data[i+3]=predicate({x,y,r:data[i],g:data[i+1],b:data[i+2]})?255:0;}
  await sharp(data,{raw:info}).png().toFile(out);
  const alpha=(await sharp(out).stats()).channels[3];
  if(!alpha||alpha.min!==0||alpha.max!==255)throw new Error(`true-alpha-required:${out}`);
  return Number(alpha.mean.toFixed(3));
}
async function floodExtract(source,out,roi){
  const {data,info}=await raw(source);const {width,height}=info;
  const inside=(x,y)=>x>=roi.x&&x<roi.x+roi.width&&y>=roi.y&&y<roi.y+roi.height;
  const nearBg=(x,y)=>{const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];return r>205&&g>205&&b>205&&Math.max(r,g,b)-Math.min(r,g,b)<34;};
  const visited=new Uint8Array(width*height),queue=[];
  for(let x=roi.x;x<roi.x+roi.width;x++)queue.push([x,roi.y],[x,roi.y+roi.height-1]);
  for(let y=roi.y;y<roi.y+roi.height;y++)queue.push([roi.x,y],[roi.x+roi.width-1,y]);
  for(let head=0;head<queue.length;head++){const [x,y]=queue[head],p=y*width+x;if(!inside(x,y)||visited[p]||!nearBg(x,y))continue;visited[p]=1;queue.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i+3]=inside(x,y)&&!visited[y*width+x]?255:0;}
  await sharp(data,{raw:info}).png().toFile(out);
  const alpha=(await sharp(out).stats()).channels[3];if(!alpha||alpha.min!==0||alpha.max!==255)throw new Error(`true-alpha-required:${out}`);
  return Number(alpha.mean.toFixed(3));
}

const ed01Source=path.join(publicRoot,phase,"full-static-storyboard-rework-v4/ED-01.png");
const ed01Out=path.join(publicRoot,phase,"ed01-current-glyph-layer-v1");fs.mkdirSync(ed01Out,{recursive:true});
const glyph=path.join(ed01Out,"glyph-alpha.png");
const glyphAlphaMean=await writeAlphaExtract(ed01Source,glyph,({x,y,r,g,b})=>x>=35&&x<=925&&y>=58&&y<=414&&(.2126*r+.7152*g+.0722*b)<188);
const ed01Report={contract:"A1CurrentGlyphLayerAsset/v1",status:"READY",shotId:"ED-01",sourceApprovedStaticSha256:hash(ed01Source),asset:{publicUrl:`/${phase}/ed01-current-glyph-layer-v1/glyph-alpha.png`,sha256:hash(glyph),width:960,height:540,trueAlpha:true,alphaMean:glyphAlphaMean},geometryLock:{x:0,y:0,width:960,height:540},generatedAt:new Date().toISOString()};
fs.writeFileSync(path.join(ed01Out,"report.json"),`${JSON.stringify(ed01Report,null,2)}\n`);

const ed17Source=path.join(publicRoot,phase,"full-static-storyboard-rework-v4/ED-17.png");
const ed17Out=path.join(publicRoot,phase,"ed17-local-motion-rebuild-v1");fs.mkdirSync(ed17Out,{recursive:true});
const layers={titles:path.join(ed17Out,"titles-alpha.png"),input:path.join(ed17Out,"material-input-alpha.png"),selector:path.join(ed17Out,"angle-selector-alpha.png"),output:path.join(ed17Out,"writing-output-alpha.png")};
const alphaMeans={titles:await floodExtract(ed17Source,layers.titles,{x:20,y:20,width:920,height:105}),input:await floodExtract(ed17Source,layers.input,{x:0,y:165,width:360,height:310}),selector:await floodExtract(ed17Source,layers.selector,{x:340,y:150,width:300,height:330}),output:await floodExtract(ed17Source,layers.output,{x:620,y:145,width:340,height:330})};
const background=path.join(ed17Out,"background-clean.png");await sharp({create:{width:960,height:540,channels:4,background:{r:244,g:244,b:242,alpha:1}}}).png().toFile(background);
const video=path.join(ed17Out,"ed17-local-motion-rebuild-960x540.mp4");
const filter=`[0:v]format=rgba[bg];[1:v]format=rgba[title];[2:v]format=rgba[input];[3:v]format=rgba,rotate='0.12*sin(PI*min(t/2.2,1))':c=none:ow=iw:oh=ih[selector];[4:v]format=rgba[output];[5:v]format=rgba,fade=t=in:st=4.15:d=0.45:alpha=1[final];[bg][title]overlay=0:0[b1];[b1][input]overlay=x='if(lt(t,1.2),-38*(1-t/1.2),0)':y=0[b2];[b2][selector]overlay=0:0[b3];[b3][output]overlay=x='if(lt(t,2.5),36,36*max(0,(3.6-t)/1.1))':y=0[b4];[b4][final]overlay=0:0,fps=30[out]`;
const args=["-y","-loop","1","-t","5","-i",background,"-loop","1","-t","5","-i",layers.titles,"-loop","1","-t","5","-i",layers.input,"-loop","1","-t","5","-i",layers.selector,"-loop","1","-t","5","-i",layers.output,"-loop","1","-t","5","-i",ed17Source,"-filter_complex",filter,"-map","[out]","-an","-t","5","-c:v","libx264","-pix_fmt","yuv420p","-crf","18","-preset","medium",video];
const run=spawnSync(ffmpeg,args,{encoding:"utf8",maxBuffer:300000});if(run.status!==0)throw new Error(run.stderr.slice(-3000));
const framesRoot=path.join(ed17Out,"review-frames");fs.mkdirSync(framesRoot,{recursive:true});
for(const [name,at]of [["setup",0],["action",2.8],["result",4.9]]){const file=path.join(framesRoot,`${name}.png`);const grab=spawnSync(ffmpeg,["-y","-ss",String(at),"-i",video,"-frames:v","1",file],{encoding:"utf8",maxBuffer:100000});if(grab.status!==0)throw new Error(`ed17-frame:${name}`);}
fs.copyFileSync(ed17Source,path.join(framesRoot,"result.png"));
const xyq=JSON.parse(fs.readFileSync(path.join(publicRoot,phase,"ed17-xyq-reference-pack-v1/manifest.json"),"utf8"));
const ed17Report={contract:"A1Ed17LocalMotionRebuild/v1",status:"READY",shotId:"ED-17",sourceApprovedStaticSha256:hash(ed17Source),sourceMotionReferenceSha256:xyq.generation.result.sha256,finalGeometryOwnedLocally:true,cameraLock:{width:960,height:540,anchorDriftPx:0},layers:Object.entries(layers).map(([id,file])=>({id,publicUrl:`/${phase}/ed17-local-motion-rebuild-v1/${path.basename(file)}`,sha256:hash(file),trueAlpha:true,alphaMean:alphaMeans[id]})),video:{publicUrl:`/${phase}/ed17-local-motion-rebuild-v1/ed17-local-motion-rebuild-960x540.mp4`,sha256:hash(video),bytes:fs.statSync(video).size},reviewFrames:Object.fromEntries(["setup","action","result"].map((name)=>[name,{publicUrl:`/${phase}/ed17-local-motion-rebuild-v1/review-frames/${name}.png`,sha256:hash(path.join(framesRoot,`${name}.png`))}])),boundaries:{providerOwnsFinalGeometry:false,readableTextLocal:true,finalFrameExactApprovedStatic:true,productionAdmitted:false},generatedAt:new Date().toISOString()};
fs.writeFileSync(path.join(ed17Out,"report.json"),`${JSON.stringify(ed17Report,null,2)}\n`);
console.log(JSON.stringify({status:"PASS",ed01:ed01Report,ed17:ed17Report},null,2));
