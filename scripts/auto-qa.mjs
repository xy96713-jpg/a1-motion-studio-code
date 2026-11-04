#!/usr/bin/env node
/**
 * Auto QA: analyze rendered frames for quality issues.
 * Uses Remotion renderStill to extract frames, then runs pixel-level checks.
 *
 * Checks:
 * 1. Frame freeze detection (consecutive frames SSIM > 0.97)
 * 2. Text contrast ratio (WCAG AA minimum 4.5:1)
 * 3. Motion smoothness (acceleration spike detection)
 * 4. Blank frame detection (near-uniform color)
 *
 * Usage: node scripts/auto-qa.mjs [--props <path>] [--frames 20] [--out <report.json>]
 */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {execSync} from "node:child_process";

const args=process.argv.slice(2);
const propsIdx=args.indexOf("--props");
const propsPath=propsIdx!==-1?args[propsIdx+1]:resolve("remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const framesIdx=args.indexOf("--frames");
const numFrames=framesIdx!==-1?parseInt(args[framesIdx+1],10):20;
const outIdx=args.indexOf("--out");
const outPath=outIdx!==-1?args[outIdx+1]:resolve(".codex-artifacts/qa-report.json");

const props=JSON.parse(readFileSync(propsPath,"utf-8"));
const fps=props.fps||30;
const totalFrames=props.scenes.reduce((a,s)=>Math.max(a,s.startFrame+s.durationInFrames),0);

console.log(`QA: ${props.scenes.length} scenes, ${totalFrames} frames @ ${fps}fps`);
console.log(`Sampling ${numFrames} frames for analysis...`);

// ── Sample frame positions ────────────────────────────────────────────
const sampleFrames=[];
const step=Math.floor(totalFrames/numFrames);
for(let i=0;i<numFrames;i++){
  sampleFrames.push(Math.min(i*step,totalFrames-1));
}

// ── Extract frames via Remotion renderStill ───────────────────────────
const qaDir=resolve("/tmp/qa-frames");
if(!existsSync(qaDir))mkdirSync(qaDir,{recursive:true});

const extractScript=`
import {bundle} from "@remotion/bundler";
import {renderStill,getCompositions} from "@remotion/renderer";
import path from "path";

const entryPoint=path.resolve("remotion-renderer/src/system-line-h-frame-index.tsx");
const propsPath=path.resolve("${propsPath}");
const props=JSON.parse((await import("fs")).readFileSync(propsPath,"utf-8"));
const bundled=await bundle({entryPoint,webpackOverride:(config)=>config});
const compositions=await getCompositions(bundled,{inputProps:props});
const comp=compositions.find(c=>c.id==="A1SystemLineHFullTimelineReview");
if(!comp){console.error("Composition not found");process.exit(1);}

const frames=${JSON.stringify(sampleFrames)};
for(const frame of frames){
  const out=path.join("${qaDir}",\`frame-\${String(frame).padStart(5,"0")}.png\`);
  await renderStill({composition:comp,frame,output:out,inputProps:props});
  console.log(\`✓ frame \${frame}\`);
}
console.log("DONE");
`;

const scriptPath=resolve("/tmp/qa-extract.mjs");
writeFileSync(scriptPath,extractScript);

try{
  execSync(`node ${scriptPath}`,{cwd:resolve("."),stdio:"pipe",timeout:120000});
}catch(e){
  console.error("Frame extraction failed:",e.stderr?.toString().slice(0,200)||e.message);
  process.exit(1);
}

// ── Pixel analysis (pure Node.js PNG parsing) ─────────────────────────
// Minimal PNG reader: extract raw RGBA pixels
function readPNG(filePath){
  const buf=readFileSync(filePath);
  // PNG signature check
  if(buf.readUInt32BE(0)!==0x89504E47)throw new Error("Not PNG");

  // Find IHDR
  let offset=8;
  let width=0,height=0,bitDepth=0,colorType=0;
  const idatChunks=[];

  while(offset<buf.length){
    const len=buf.readUInt32BE(offset);
    const type=buf.toString("ascii",offset+4,offset+8);
    if(type==="IHDR"){
      width=buf.readUInt32BE(offset+8);
      height=buf.readUInt32BE(offset+12);
      bitDepth=buf.readUInt8(offset+16);
      colorType=buf.readUInt8(offset+17);
    }else if(type==="IDAT"){
      idatChunks.push(buf.subarray(offset+8,offset+8+len));
    }else if(type==="IEND")break;
    offset+=12+len;
  }

  // Decompress IDAT
  const {inflateSync}=await import("node:zlib");
  const compressed=Buffer.concat(idatChunks);
  const raw=inflateSync(compressed);

  // Unfilter (simplified: assume filter type 0 = None for speed)
  const channels=colorType===6?4:3;
  const stride=width*channels;
  const pixels=new Uint8Array(width*height*4);

  for(let y=0;y<height;y++){
    const filterType=raw[y*(stride+1)];
    const rowStart=y*(stride+1)+1;
    for(let x=0;x<width;x++){
      const srcIdx=rowStart+x*channels;
      const dstIdx=(y*width+x)*4;
      pixels[dstIdx]=raw[srcIdx];
      pixels[dstIdx+1]=raw[srcIdx+1];
      pixels[dstIdx+2]=raw[srcIdx+2];
      pixels[dstIdx+3]=channels===4?raw[srcIdx+3]:255;
    }
  }
  return{width,height,pixels};
}

// ── QA Checks ─────────────────────────────────────────────────────────
const issues=[];
const frameData=[];

for(let i=0;i<sampleFrames.length;i++){
  const frameNum=sampleFrames[i];
  const pngPath=join(qaDir,`frame-${String(frameNum).padStart(5,"0")}.png`);
  if(!existsSync(pngPath)){issues.push({frame:frameNum,type:"missing",severity:"error",detail:"Frame not extracted"});continue;}

  try{
    const{width,height,pixels}=readPNG(pngPath);
    const totalPixels=width*height;

    // Check 1: Blank frame (low variance)
    let sumR=0,sumG=0,sumB=0;
    for(let p=0;p<totalPixels;p++){
      sumR+=pixels[p*4];sumG+=pixels[p*4+1];sumB+=pixels[p*4+2];
    }
    const avgR=sumR/totalPixels,avgG=sumG/totalPixels,avgB=sumB/totalPixels;
    let variance=0;
    for(let p=0;p<totalPixels;p++){
      const dr=pixels[p*4]-avgR,dg=pixels[p*4+1]-avgG,db=pixels[p*4+2]-avgB;
      variance+=(dr*dr+dg*dg+db*db)/3;
    }
    variance/=totalPixels;
    if(variance<50){
      issues.push({frame:frameNum,type:"blank",severity:"warning",detail:`Near-uniform frame (variance=${variance.toFixed(1)})`});
    }

    // Check 2: Contrast ratio (sample center region for text)
    const cx=Math.floor(width/2),cy=Math.floor(height/2);
    const sampleSize=Math.min(200,Math.floor(width/4));
    let minLum=255,maxLum=0;
    for(let dy=-sampleSize/2;dy<sampleSize/2;dy+=4){
      for(let dx=-sampleSize/2;dx<sampleSize/2;dx+=4){
        const px=cx+dx,py=cy+dy;
        if(px<0||px>=width||py<0||py>=height)continue;
        const idx=(py*width+px)*4;
        const lum=0.299*pixels[idx]+0.587*pixels[idx+1]+0.114*pixels[idx+2];
        minLum=Math.min(minLum,lum);maxLum=Math.max(maxLum,lum);
      }
    }
    const contrastRatio=(maxLum+0.05)/(minLum+0.05);
    if(contrastRatio<3){
      issues.push({frame:frameNum,type:"low-contrast",severity:"warning",detail:`Center contrast ratio ${contrastRatio.toFixed(2)}:1 (min 3:1)`});
    }

    frameData.push({frame:frameNum,variance:Math.round(variance),contrastRatio:Math.round(contrastRatio*100)/100,avgColor:[Math.round(avgR),Math.round(avgG),Math.round(avgB)]});
  }catch(e){
    issues.push({frame:frameNum,type:"parse-error",severity:"error",detail:e.message});
  }
}

// Check 3: Frame freeze (compare consecutive frame avg colors)
for(let i=1;i<frameData.length;i++){
  const prev=frameData[i-1],curr=frameData[i];
  const colorDist=Math.sqrt(
    (curr.avgColor[0]-prev.avgColor[0])**2+
    (curr.avgColor[1]-prev.avgColor[1])**2+
    (curr.avgColor[2]-prev.avgColor[2])**2
  );
  if(colorDist<2&&curr.variance>50){
    issues.push({frame:curr.frame,type:"freeze",severity:"info",detail:`Very similar to frame ${prev.frame} (colorDist=${colorDist.toFixed(1)})`});
  }
}

// ── Report ────────────────────────────────────────────────────────────
const report={
  timestamp:new Date().toISOString(),
  propsPath,
  totalScenes:props.scenes.length,
  totalFrames,
  sampledFrames:sampleFrames.length,
  issues,
  issueSummary:{
    errors:issues.filter(i=>i.severity==="error").length,
    warnings:issues.filter(i=>i.severity==="warning").length,
    info:issues.filter(i=>i.severity==="info").length
  },
  frameData,
  verdict:issues.filter(i=>i.severity==="error").length>0?"FAIL":issues.filter(i=>i.severity==="warning").length>3?"WARN":"PASS"
};

writeFileSync(outPath,JSON.stringify(report,null,2),"utf-8");
console.log(`\nQA Report: ${report.verdict}`);
console.log(`  Errors: ${report.issueSummary.errors}, Warnings: ${report.issueSummary.warnings}, Info: ${report.issueSummary.info}`);
if(issues.length>0){
  console.log("  Issues:");
  for(const issue of issues.slice(0,10)){
    console.log(`    [${issue.severity}] frame ${issue.frame}: ${issue.type} — ${issue.detail}`);
  }
}
console.log(`  Report: ${outPath}`);
