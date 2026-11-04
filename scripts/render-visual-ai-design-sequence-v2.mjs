#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "visual-ai-design-sequence-v2-proof";
const rendererRoot = path.join(root, "remotion-renderer");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const boardPath = path.join(root, "apps/studio-next/public/generated/system-line/visual-ai-design-board-v2-proof/design-board.json");
const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
if (board.status !== "READY_FOR_STATIC_CANDIDATE_RENDER" || board.aiDesigned !== true || board.fallbackUsed !== false) throw new Error(`visual-ai-design-board-not-renderable:${board.status}`);
const authorityPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => {fs.mkdirSync(path.dirname(file), {recursive:true});fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);};

async function main(){
  fs.mkdirSync(publicDir,{recursive:true});fs.mkdirSync(artifactDir,{recursive:true});
  const authorityBefore=shaFile(authorityPath);
  const serveUrl=await bundle({entryPoint:path.join(rendererRoot,"src/system-line-h-frame-index.tsx"),publicDir:path.join(rendererRoot,"public"),rootDir:rendererRoot,enableCaching:true});
  const browser=await openBrowser("chrome",{chromeMode:"headless-shell",logLevel:"warn"});
  try{
    const composition=await selectComposition({serveUrl,id:"A1VisualAiDesignSequenceV2",inputProps:board,puppeteerInstance:browser,logLevel:"warn"});
    const framesDir=path.join(publicDir,"shot-frames");fs.mkdirSync(framesDir,{recursive:true});
    const proofFrames=[];let from=0;
    for(const shot of board.shots){
      const frame=from+Math.min(76,shot.motionIrScene.timing.frameDuration-1);from+=shot.motionIrScene.timing.frameDuration;
      const output=path.join(framesDir,`${String(shot.order).padStart(2,"0")}-${shot.shotId}.png`);
      await renderStill({serveUrl,composition,inputProps:board,frame,output,imageFormat:"png",scale:.5,overwrite:true,puppeteerInstance:browser,logLevel:"warn"});
      proofFrames.push({shotId:shot.shotId,topology:shot.selectedTopology,frame,publicUrl:`/generated/system-line/${phaseId}/shot-frames/${path.basename(output)}`,sha256:shaFile(output)});
    }
    const videoPath=path.join(publicDir,"visual-ai-design-sequence-v2-review.mp4");
    await renderMedia({serveUrl,composition,inputProps:board,outputLocation:videoPath,scale:.5,codec:"h264",pixelFormat:"yuv420p",imageFormat:"jpeg",jpegQuality:82,crf:25,concurrency:2,hardwareAcceleration:"if-possible",overwrite:true,puppeteerInstance:browser,logLevel:"warn"});
    const tileWidth=480,tileHeight=270,labelHeight=42;
    const tiles=[];
    for(const frame of proofFrames){
      const file=path.join(root,"apps/studio-next/public",frame.publicUrl);
      const label=Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111214"/><text x="12" y="26" fill="#eee9dd" font-family="monospace" font-size="14">${frame.shotId} · ${frame.topology.slice(0,3)} · F${frame.frame}</text></svg>`);
      tiles.push(await sharp(file).resize(tileWidth,tileHeight).extend({top:labelHeight,bottom:0,left:0,right:0,background:"#111214"}).composite([{input:label,top:0,left:0}]).png().toBuffer());
    }
    const sheetPath=path.join(publicDir,"visual-ai-design-sequence-v2-contact-sheet.png");
    await sharp({create:{width:tileWidth*3,height:(tileHeight+labelHeight)*2,channels:4,background:"#111214"}}).composite(tiles.map((input,index)=>({input,left:index%3*tileWidth,top:Math.floor(index/3)*(tileHeight+labelHeight)}))).png().toFile(sheetPath);
    const transitionFrames=[];
    for(let boundary=120;boundary<composition.durationInFrames;boundary+=120){transitionFrames.push(boundary-1,boundary);}
    const transitionTiles=[];const transitionDir=path.join(publicDir,"transition-frames");fs.mkdirSync(transitionDir,{recursive:true});
    for(const frame of transitionFrames){
      const output=path.join(transitionDir,`f${String(frame).padStart(3,"0")}.png`);
      await renderStill({serveUrl,composition,inputProps:board,frame,output,imageFormat:"png",scale:.25,overwrite:true,puppeteerInstance:browser,logLevel:"warn"});
      const label=Buffer.from(`<svg width="320" height="30"><rect width="100%" height="100%" fill="#111214"/><text x="10" y="20" fill="#eee9dd" font-family="monospace" font-size="12">F${frame} · ${(frame/composition.fps).toFixed(2)}s</text></svg>`);
      transitionTiles.push(await sharp(output).resize(320,180).extend({top:30,bottom:0,left:0,right:0,background:"#111214"}).composite([{input:label,top:0,left:0}]).png().toBuffer());
    }
    const transitionSheetPath=path.join(publicDir,"visual-ai-design-sequence-v2-transition-strip.png");
    await sharp({create:{width:320*5,height:210*2,channels:4,background:"#111214"}}).composite(transitionTiles.map((input,index)=>({input,left:index%5*320,top:Math.floor(index/5)*210}))).png().toFile(transitionSheetPath);
    const authorityAfter=shaFile(authorityPath);
    const report={contract:"A1VisualAiDesignSequenceRenderReport/v2",phaseId,status:"PASS",truth:{aiDesigned:true,fallbackUsed:false,visualApproval:"PENDING"},board:{path:path.relative(root,boardPath),sha256:shaFile(boardPath)},composition:{id:composition.id,durationInFrames:composition.durationInFrames,fps:composition.fps,width:composition.width,height:composition.height},proofFrames,video:{publicUrl:`/generated/system-line/${phaseId}/${path.basename(videoPath)}`,sha256:shaFile(videoPath),bytes:fs.statSync(videoPath).size,durationSec:composition.durationInFrames/composition.fps},contactSheet:{publicUrl:`/generated/system-line/${phaseId}/${path.basename(sheetPath)}`,sha256:shaFile(sheetPath)},transitionStrip:{publicUrl:`/generated/system-line/${phaseId}/${path.basename(transitionSheetPath)}`,sha256:shaFile(transitionSheetPath),frames:transitionFrames},currentAuthority:{sha256Before:authorityBefore,sha256After:authorityAfter,unchanged:authorityBefore===authorityAfter},gates:{humanVisualApproval:"PENDING",rendererAdoptionAllowed:false,h47ExpansionAllowed:false}};
    writeJson(path.join(publicDir,"render-report.json"),report);writeJson(path.join(artifactDir,"render-report.json"),report);console.log(JSON.stringify(report,null,2));
  }finally{await browser.close({silent:true});}
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
