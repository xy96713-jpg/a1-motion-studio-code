#!/usr/bin/env node
/**
 * Fast single-scene preview: render one scene as a still image in seconds.
 * Usage: node scripts/preview-scene.mjs <beatId|index> [--frame <n>] [--out <path>]
 *
 * Examples:
 *   node scripts/preview-scene.mjs H01-B01          # first frame of scene H01-B01
 *   node scripts/preview-scene.mjs 5                 # 6th scene (0-indexed)
 *   node scripts/preview-scene.mjs H03-B02 --frame 40  # frame 40 of scene H03-B02
 */
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const args=process.argv.slice(2);
const target=args[0];
if(!target){console.error("Usage: node preview-scene.mjs <beatId|index> [--frame <n>] [--out <path>]");process.exit(1);}
const frameIdx=args.indexOf("--frame");
const localFrame=frameIdx!==-1?parseInt(args[frameIdx+1],10):null;
const outIdx=args.indexOf("--out");
const outPath=outIdx!==-1?args[outIdx+1]:null;

const propsPath=resolve("remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const props=JSON.parse(readFileSync(propsPath,"utf-8"));

// Find scene
let scene,sceneIndex;
if(/^\d+$/.test(target)){
  sceneIndex=parseInt(target,10);
  scene=props.scenes[sceneIndex];
}else{
  sceneIndex=props.scenes.findIndex(s=>s.beatId===target);
  scene=props.scenes[sceneIndex];
}
if(!scene){console.error(`Scene not found: ${target}`);process.exit(1);}

const frame=localFrame!==null?localFrame:Math.round(scene.durationInFrames*0.4); // default: 40% into scene (emphasize phase)
const globalFrame=scene.startFrame+Math.min(frame,scene.durationInFrames-1);

console.log(`Scene: ${scene.beatId} (${scene.family}, ${scene.motionPlan.motionStyle})`);
console.log(`Frame: ${frame}/${scene.durationInFrames} (global: ${globalFrame})`);
console.log(`Text: ${scene.screenText.slice(0,30)}...`);

// Generate preview script
const previewScript=`
import {bundle} from "@remotion/bundler";
import {renderStill,getCompositions} from "@remotion/renderer";
import path from "path";
import {readFileSync} from "fs";

const entryPoint=path.resolve("remotion-renderer/src/system-line-h-frame-index.tsx");
const props=JSON.parse(readFileSync(path.resolve("${propsPath}"),"utf-8"));
const bundled=await bundle({entryPoint,webpackOverride:(config)=>config});
const compositions=await getCompositions(bundled,{inputProps:props});
const comp=compositions.find(c=>c.id==="A1SystemLineHFullTimelineReview");
if(!comp){console.error("Composition not found");process.exit(1);}

const outPath="${outPath||resolve(`/tmp/preview-${scene.beatId}-f${frame}.png`)}";
await renderStill({composition:comp,frame:${globalFrame},output:outPath,inputProps:props});
console.log("✓ "+outPath);
`;

const scriptPath=resolve("/tmp/preview-scene.mjs");
writeFileSync(scriptPath,previewScript);

const{execSync}=await import("node:child_process");
const startTime=Date.now();
try{
  const result=execSync(`node ${scriptPath}`,{cwd:resolve("."),stdio:"pipe",timeout:60000});
  const elapsed=((Date.now()-startTime)/1000).toFixed(1);
  console.log(result.toString().trim());
  console.log(`Rendered in ${elapsed}s`);
}catch(e){
  console.error("Preview failed:",e.stderr?.toString().slice(0,300)||e.message);
  process.exit(1);
}
