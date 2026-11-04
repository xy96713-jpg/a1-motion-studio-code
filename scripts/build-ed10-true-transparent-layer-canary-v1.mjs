#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root=path.resolve(import.meta.dirname,"..");
const require=createRequire(path.join(root,"apps/studio-next/package.json"));
const sharp=require("sharp");
const source=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/full-static-storyboard-rework-v4/ED-10.png");
const outputRoot=path.join(root,"apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/ed10-true-layer-canary-v1");
fs.mkdirSync(outputRoot,{recursive:true});
const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const svgMask=(shape)=>Buffer.from(`<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><path d="${shape}" fill="white"/></svg>`);
const layers=[
  {id:"exact-copy-left",role:"EXACT_COPY",z:20,path:"M0 267H356V349H0Z"},
  {id:"verdict-tool",role:"SEMANTIC_TOOL",z:30,path:"M322 105L355 78L390 119L405 185L474 194L481 346L459 419L401 398L384 357L350 359L338 328L350 273L323 235L339 207L320 164Z"},
  {id:"waste-verdict",role:"EXACT_VERDICT",z:40,path:"M498 214H882V382H498Z"},
];
const sourceBytes=fs.readFileSync(source);
const outputs=[];
const background=path.join(outputRoot,"background-clean.png");
await sharp({create:{width:960,height:540,channels:4,background:{r:17,g:18,b:18,alpha:1}}}).composite([{input:Buffer.from(`<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence baseFrequency=".7" numOctaves="2" seed="17"/><feColorMatrix values=".08 0 0 0 0  0 .08 0 0 0  0 0 .08 0 0  0 0 0 .16 0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity=".25"/></svg>`)}]).png().toFile(background);
outputs.push({id:"background-clean",role:"BACKGROUND",z:0,file:background,alpha:false});
for(const layer of layers){
  const file=path.join(outputRoot,`${layer.id}.png`);
  await sharp(sourceBytes).ensureAlpha().composite([{input:svgMask(layer.path),blend:"dest-in"}]).png().toFile(file);
  const stats=await sharp(file).stats();
  const alpha=stats.channels[3];
  if(!alpha||alpha.min!==0||alpha.max!==255)throw new Error(`true-alpha-required:${layer.id}`);
  outputs.push({id:layer.id,role:layer.role,z:layer.z,file,alpha:true,alphaMean:Number(alpha.mean.toFixed(3))});
}
const checker=Buffer.from(`<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#d7d7d7"/><path d="M0 0H16V16H0ZM16 16H32V32H16Z" fill="#f3f3f3"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
const contact=path.join(outputRoot,"layer-contact-sheet.png");
const thumbs=[];
for(const output of outputs){
  const input=await sharp(output.file).resize(480,270).png().toBuffer();
  const label=Buffer.from(`<svg width="480" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0c0f13"/><text x="12" y="23" fill="#dfff68" font-family="monospace" font-size="15">${output.id} · z${output.z}</text></svg>`);
  thumbs.push(await sharp(checker).resize(480,270).composite([{input},{input:label,top:236,left:0}]).png().toBuffer());
}
await sharp({create:{width:960,height:Math.ceil(thumbs.length/2)*270,channels:4,background:"#0c0f13"}}).composite(thumbs.map((input,index)=>({input,left:(index%2)*480,top:Math.floor(index/2)*270}))).png().toFile(contact);
const manifestBody={contract:"A1TrueTransparentLayerCanary/v1",status:"READY_FOR_LAYER_MOTION_CANARY",shotId:"ED-10",source:{publicUrl:"/generated/system-line/editorial-asset-workbench-v1/full-static-storyboard-rework-v4/ED-10.png",sha256:shaFile(source),width:960,height:540},geometryLock:{x:0,y:0,width:960,height:540},layers:outputs.map((item)=>({id:item.id,role:item.role,z:item.z,publicUrl:`/generated/system-line/editorial-asset-workbench-v1/ed10-true-layer-canary-v1/${path.basename(item.file)}`,sha256:shaFile(item.file),trueAlpha:item.alpha,alphaMean:item.alphaMean??255})),proceduralActors:[{id:"impact-debris",role:"TEXT_FREE_IMPACT_SIGNAL",z:50,source:"DETERMINISTIC_VECTOR_NO_RASTER_COPY"}],contactSheet:{publicUrl:"/generated/system-line/editorial-asset-workbench-v1/ed10-true-layer-canary-v1/layer-contact-sheet.png",sha256:shaFile(contact)},boundaries:{flatRasterRegionMotionForbidden:true,duplicatedSemanticActorForbidden:true,finalExactApprovedFrameRequired:true,productionAdmitted:false},generatedAt:new Date().toISOString()};
const manifest={...manifestBody,manifestSha256:crypto.createHash("sha256").update(JSON.stringify(manifestBody)).digest("hex")};
fs.writeFileSync(path.join(outputRoot,"manifest.json"),`${JSON.stringify(manifest,null,2)}\n`);
console.log(JSON.stringify(manifest,null,2));
