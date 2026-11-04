#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";

const root=path.resolve(import.meta.dirname,"..");
const appPublic=path.join(root,"apps/studio-next/public");
const rendererRoot=path.join(root,"remotion-renderer");
const rendererPublic=path.join(rendererRoot,"public");
const require=createRequire(path.join(rendererRoot,"package.json"));
const {bundle}=require("@remotion/bundler");
const {openBrowser,renderMedia,renderStill,selectComposition}=require("@remotion/renderer");
const sharp=require("sharp");
const manifest=JSON.parse(fs.readFileSync(path.join(appPublic,"generated/system-line/editorial-asset-workbench-v1/ed10-true-layer-canary-v1/manifest.json"),"utf8"));
if(manifest.status!=="READY_FOR_LAYER_MOTION_CANARY"||manifest.layers.filter((item)=>item.trueAlpha).length!==3)throw new Error("ed10-true-layer-manifest-required");
const shaFile=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const binding=(id)=>{const item=manifest.layers.find((entry)=>entry.id===id);return{publicUrl:item.publicUrl,sha256:item.sha256};};
for(const item of [...manifest.layers,{publicUrl:manifest.source.publicUrl,sha256:manifest.source.sha256}]){
  const source=path.join(appPublic,item.publicUrl.replace(/^\//u,""));
  if(!fs.existsSync(source)||shaFile(source)!==item.sha256)throw new Error(`ed10-layer-source-invalid:${item.publicUrl}`);
  const target=path.join(rendererPublic,item.publicUrl.replace(/^\//u,""));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
}
const track=(property,from,to,startFrame,endFrame)=>({contract:"A1MotionPropertyTrack/v1",property,from,to,startFrame,endFrame,easing:[.16,1,.3,1]});
const actor=(id,role,semanticJob,tracks)=>({id,role,semanticJob,startFrame:Math.min(...tracks.map((item)=>item.startFrame)),endFrame:Math.max(...tracks.map((item)=>item.endFrame)),curveId:"semantic-causal-action",easing:[.16,1,.3,1],propertyTracks:tracks});
const actors=[
  actor("exact-copy-left","EXACT_COPY","establish the polished-draft premise",[track("x",-120,0,4,26),track("opacity",0,1,4,18)]),
  actor("verdict-tool","SEMANTIC_TOOL","strike the draft once",[track("y",-190,0,22,39),track("rotate",-12,0,22,39),track("opacity",0,1,18,27)]),
  actor("waste-verdict","EXACT_VERDICT","resolve the causal verdict after impact",[track("scale",.58,1,37,53),track("opacity",0,1,37,48)]),
  actor("final-lock","APPROVED_FINAL","restore exact approved pixels for reading",[track("opacity",0,1,70,82)]),
];
const sourceBinding={publicUrl:manifest.source.publicUrl,sha256:manifest.source.sha256};
const props={contract:"A1ApprovedMasterLayerMotionPilotProps/v1",reviewOnly:true,promotedRender:false,fps:30,overlapInFrames:0,shots:[{shotId:"ED-10",durationInFrames:120,mode:"TRUE_TRANSPARENT_LAYER_CAUSAL_STAMP",semanticIntent:"premise -> tool strike -> waste verdict",finalComposite:sourceBinding,layers:{BACKGROUND:binding("background-clean")},workflowActors:{"exact-copy-left":binding("exact-copy-left"),"verdict-tool":binding("verdict-tool"),"waste-verdict":binding("waste-verdict")},motionIrScene:{contract:"A1MotionIRScene/v2",sceneId:"ED-10",sourceAuthority:"CURRENT_APPROVED_LEDGER_TRUE_LAYERS",reviewOnly:true,promotedRender:false,timing:{fps:30,frameStart:0,frameDuration:120,duration:4},phases:{setup:{startFrame:0,endFrame:4},action:{startFrame:4,endFrame:70},stableReadingHold:{startFrame:82,endFrame:119}},actors}}]};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"a1-ed10-true-layer-"));const video=path.join(temp,"ed10-true-layer-motion-canary-960x540.mp4");const frames=[];
const serveUrl=await bundle({entryPoint:path.join(rendererRoot,"src/index.ts"),publicDir:rendererPublic,rootDir:rendererRoot,enableCaching:true});
const browser=await openBrowser("chrome",{chromeMode:"headless-shell",logLevel:"warn"});
try{const composition=await selectComposition({serveUrl,id:"A1ApprovedMasterLayerMotionPilotV1",inputProps:props,puppeteerInstance:browser,logLevel:"warn"});for(const [name,frame]of [["setup",0],["premise",18],["impact",36],["verdict",52],["hold",96]]){const file=path.join(temp,`${name}.png`);await renderStill({serveUrl,composition,inputProps:props,frame,output:file,imageFormat:"png",scale:.5,overwrite:true,puppeteerInstance:browser,logLevel:"warn"});frames.push({name,frame,file});}await renderMedia({serveUrl,composition,inputProps:props,outputLocation:video,scale:.5,codec:"h264",pixelFormat:"yuv420p",imageFormat:"jpeg",jpegQuality:90,crf:20,concurrency:2,muted:true,overwrite:true,puppeteerInstance:browser,logLevel:"warn"});}finally{await browser.close({silent:true});}
const out=path.join(appPublic,"generated/system-line/editorial-asset-workbench-v1/ed10-true-layer-motion-canary-v1");fs.mkdirSync(out,{recursive:true});fs.copyFileSync(video,path.join(out,path.basename(video)));
const tiles=[];for(const sample of frames){const label=Buffer.from(`<svg width="480" height="34"><rect width="100%" height="100%" fill="#0c0f13"/><text x="12" y="23" fill="#dfff68" font-family="monospace" font-size="14">ED-10 · ${sample.name} · F${sample.frame}</text></svg>`);tiles.push(await sharp(sample.file).resize(480,270).extend({top:34,bottom:0,left:0,right:0,background:"#0c0f13"}).composite([{input:label,top:0,left:0}]).png().toBuffer());}
const contact=path.join(out,"ed10-true-layer-motion-contact-sheet.png");await sharp({create:{width:960,height:Math.ceil(tiles.length/2)*304,channels:4,background:"#0c0f13"}}).composite(tiles.map((input,index)=>({input,left:(index%2)*480,top:Math.floor(index/2)*304}))).png().toFile(contact);
const report={contract:"A1Ed10TrueLayerMotionCanary/v1",status:"READY_FOR_USER_VISUAL_REVIEW",shotId:"ED-10",sourceLayerManifestSha256:manifest.manifestSha256,actors:actors.map((item)=>({id:item.id,semanticJob:item.semanticJob})),video:{publicUrl:`/generated/system-line/editorial-asset-workbench-v1/ed10-true-layer-motion-canary-v1/${path.basename(video)}`,sha256:shaFile(path.join(out,path.basename(video))),bytes:fs.statSync(path.join(out,path.basename(video))).size},contactSheet:{publicUrl:"/generated/system-line/editorial-asset-workbench-v1/ed10-true-layer-motion-canary-v1/ed10-true-layer-motion-contact-sheet.png",sha256:shaFile(contact)},boundaries:{trueTransparentLayers:true,flatRasterRegionMotion:false,fullFilmRendered:false,productionAdmitted:false},renderedAt:new Date().toISOString()};fs.writeFileSync(path.join(out,"report.json"),`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify(report,null,2));
