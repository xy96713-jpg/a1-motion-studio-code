#!/usr/bin/env node
/**
 * Align scene transitions to audio beats.
 * Reads props JSON + beats JSON, snaps each scene's startFrame to nearest beat,
 * adjusts durationInFrames accordingly, updates motionPlan phases.
 *
 * Usage: node scripts/align-scenes-to-beats.mjs <props.json> <beats.json> [--out <path>]
 */
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const args=process.argv.slice(2);
const propsPath=args[0],beatsPath=args[1];
if(!propsPath||!beatsPath){console.error("Usage: node align-scenes-to-beats.mjs <props.json> <beats.json> [--out <path>]");process.exit(1);}
const outIdx=args.indexOf("--out");
const outPath=outIdx!==-1?args[outIdx+1]:propsPath; // overwrite by default

const props=JSON.parse(readFileSync(resolve(propsPath),"utf-8"));
const beatsData=JSON.parse(readFileSync(resolve(beatsPath),"utf-8"));
const beats=beatsData.beats.map(b=>b.frame);
const fps=props.fps||30;

if(beats.length===0){console.error("No beats found");process.exit(1);}

// Find nearest beat frame
function nearestBeat(frame){
  let best=beats[0],bestDist=Math.abs(frame-beats[0]);
  for(const b of beats){
    const d=Math.abs(frame-b);
    if(d<bestDist){best=b;bestDist=d;}
  }
  return best;
}

// Snap scene starts to beats, preserve minimum duration
const MIN_DURATION=40; // ~1.3s minimum per scene
let adjusted=0;
let totalShift=0;

for(let i=0;i<props.scenes.length;i++){
  const scene=props.scenes[i];
  const originalStart=scene.startFrame;
  const snappedStart=nearestBeat(originalStart);

  // Don't snap if it would make scene too short or overlap previous
  const prevEnd=i>0?props.scenes[i-1].startFrame+props.scenes[i-1].durationInFrames:0;
  const minStart=Math.max(prevEnd,snappedStart);
  const newStart=Math.max(minStart,snappedStart);

  if(newStart!==originalStart){
    const shift=newStart-originalStart;
    scene.startFrame=newStart;
    // Adjust duration: keep end time roughly the same
    scene.durationInFrames=Math.max(MIN_DURATION,scene.durationInFrames-shift);
    adjusted++;
    totalShift+=Math.abs(shift);
  }

  // Recalculate motionPlan phases proportionally
  const dur=scene.durationInFrames;
  const mp=scene.motionPlan;
  const enterEnd=Math.min(mp.phases.enter.endFrame,Math.round(dur*0.18));
  const establishEnd=Math.round(dur*0.28);
  const emphasizeEnd=Math.round(dur*0.45);
  const holdEnd=dur-Math.round(dur*0.14);

  mp.phases.enter={startFrame:0,endFrame:enterEnd};
  mp.phases.establish={startFrame:Math.round(enterEnd*0.82),endFrame:establishEnd};
  mp.phases.emphasize={startFrame:establishEnd,endFrame:emphasizeEnd};
  mp.phases.hold={startFrame:emphasizeEnd,endFrame:holdEnd};
  mp.phases.exit={startFrame:holdEnd,endFrame:dur};

  // Update transition track
  const transTrack=mp.tracks.find(t=>t.role==="transition");
  if(transTrack){transTrack.startFrame=holdEnd;transTrack.endFrame=dur;}

  // Update layer motion timings
  for(const layer of scene.layers){
    const m=layer.motion;
    if(m.hold)m.hold=[Math.min(m.hold[0],holdEnd),holdEnd];
    if(m.exit)m.exit=[holdEnd,dur];
  }

  // Update sourceStartMs/sourceEndMs
  scene.sourceStartMs=Math.round(scene.startFrame/fps*1000);
  scene.sourceEndMs=Math.round((scene.startFrame+scene.durationInFrames)/fps*1000);
}

// Also snap emphasize frames to nearby beats for accent alignment
let accentAligned=0;
for(const scene of props.scenes){
  const emphStart=scene.startFrame+scene.motionPlan.phases.emphasize.startFrame;
  const nearestEmph=nearestBeat(emphStart);
  const shift=nearestEmph-emphStart;
  if(Math.abs(shift)<=8){ // within ~270ms: snap
    const mp=scene.motionPlan;
    mp.phases.emphasize.startFrame+=shift;
    mp.phases.emphasize.endFrame+=shift;
    mp.phases.hold.startFrame+=shift;
    accentAligned++;
  }
}

writeFileSync(resolve(outPath),JSON.stringify(props,null,2),"utf-8");

const totalFrames=props.scenes.reduce((a,s)=>Math.max(a,s.startFrame+s.durationInFrames),0);
console.log(`✓ Aligned ${adjusted}/${props.scenes.length} scene starts to beats`);
console.log(`  Avg shift: ${adjusted>0?(totalShift/adjusted).toFixed(1):0} frames`);
console.log(`  Accent-aligned: ${accentAligned} emphasize phases`);
console.log(`  Total duration: ${totalFrames} frames (${(totalFrames/fps).toFixed(1)}s)`);
console.log(`  Output: ${outPath}`);
