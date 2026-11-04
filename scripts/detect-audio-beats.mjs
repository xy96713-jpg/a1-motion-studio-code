#!/usr/bin/env node
/**
 * Beat/onset detection for WAV audio (pure Node.js, no dependencies).
 * Reads 16-bit PCM mono WAV, computes energy-based onset detection,
 * outputs beat timestamps as JSON.
 *
 * Usage: node scripts/detect-audio-beats.mjs <wav-path> [--out <json-path>] [--threshold 1.4] [--fps 30]
 */
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const args=process.argv.slice(2);
const wavPath=args[0];
if(!wavPath){console.error("Usage: node detect-audio-beats.mjs <wav-path> [--out <json>] [--threshold 1.4] [--fps 30]");process.exit(1);}

const outIdx=args.indexOf("--out");
const outPath=outIdx!==-1?args[outIdx+1]:null;
const thrIdx=args.indexOf("--threshold");
const threshold=thrIdx!==-1?parseFloat(args[thrIdx+1]):1.4;
const fpsIdx=args.indexOf("--fps");
const fps=fpsIdx!==-1?parseInt(args[fpsIdx+1],10):30;

// ── Parse WAV header ──────────────────────────────────────────────────
const buf=readFileSync(resolve(wavPath));
const riff=buf.toString("ascii",0,4);
if(riff!=="RIFF"){console.error("Not a RIFF file");process.exit(1);}
const wave=buf.toString("ascii",8,12);
if(wave!=="WAVE"){console.error("Not a WAVE file");process.exit(1);}

// Find fmt chunk
let offset=12;
let sampleRate=16000,bitsPerSample=16,numChannels=1,dataOffset=0,dataSize=0;
while(offset<buf.length-8){
  const chunkId=buf.toString("ascii",offset,offset+4);
  const chunkSize=buf.readUInt32LE(offset+4);
  if(chunkId==="fmt "){
    numChannels=buf.readUInt16LE(offset+10);
    sampleRate=buf.readUInt32LE(offset+12);
    bitsPerSample=buf.readUInt16LE(offset+22);
  }else if(chunkId==="data"){
    dataOffset=offset+8;
    dataSize=chunkSize;
  }
  offset+=8+chunkSize+(chunkSize%2); // pad to even
}

if(!dataOffset){console.error("No data chunk found");process.exit(1);}

const bytesPerSample=bitsPerSample/8;
const totalSamples=Math.floor(dataSize/(bytesPerSample*numChannels));
const durationSec=totalSamples/sampleRate;

console.log(`Audio: ${sampleRate}Hz, ${bitsPerSample}-bit, ${numChannels}ch, ${durationSec.toFixed(2)}s, ${totalSamples} samples`);

// ── Read samples (downmix to mono if needed) ──────────────────────────
const samples=new Float32Array(totalSamples);
for(let i=0;i<totalSamples;i++){
  let sum=0;
  for(let ch=0;ch<numChannels;ch++){
    const idx=dataOffset+(i*numChannels+ch)*bytesPerSample;
    if(bitsPerSample===16){
      sum+=buf.readInt16LE(idx)/32768;
    }else if(bitsPerSample===24){
      const b0=buf.readUInt8(idx),b1=buf.readUInt8(idx+1),b2=buf.readUInt8(idx+2);
      sum+=((b0|(b1<<8)|(b2<<16))<<8>>8)/8388608; // sign-extend 24-bit
    }else if(bitsPerSample===32){
      sum+=buf.readInt32LE(idx)/2147483648;
    }
  }
  samples[i]=sum/numChannels;
}

// ── Energy-based onset detection ──────────────────────────────────────
const windowSize=Math.round(sampleRate*0.025); // 25ms windows
const hopSize=Math.round(windowSize/2); // 50% overlap
const numWindows=Math.floor((totalSamples-windowSize)/hopSize);

const energies=new Float32Array(numWindows);
for(let w=0;w<numWindows;w++){
  let energy=0;
  const start=w*hopSize;
  for(let i=0;i<windowSize;i++){
    const s=samples[start+i];
    energy+=s*s;
  }
  energies[w]=energy/windowSize;
}

// Spectral flux (positive half-wave rectified difference)
const flux=new Float32Array(numWindows);
for(let w=1;w<numWindows;w++){
  flux[w]=Math.max(0,energies[w]-energies[w-1]);
}

// Adaptive threshold: local median * multiplier
const medianWindow=Math.round(0.5*sampleRate/hopSize); // ~500ms window
const beats=[];
let lastBeatTime=-1;
const minBeatInterval=0.25; // minimum 250ms between beats

for(let w=1;w<numWindows-1;w++){
  // Local median
  const start=Math.max(0,w-medianWindow);
  const end=Math.min(numWindows,w+medianWindow);
  const localSlice=Array.from(flux.slice(start,end)).sort((a,b)=>a-b);
  const median=localSlice[Math.floor(localSlice.length/2)];
  const localThreshold=Math.max(median*threshold,0.0001);

  // Peak picking
  if(flux[w]>localThreshold&&flux[w]>=flux[w-1]&&flux[w]>flux[w+1]){
    const timeSec=(w*hopSize)/sampleRate;
    if(timeSec-lastBeatTime>=minBeatInterval){
      beats.push({
        timeSec:Math.round(timeSec*1000)/1000,
        frame:Math.round(timeSec*fps),
        energy:Math.round(energies[w]*10000)/10000,
        strength:Math.round((flux[w]/localThreshold)*100)/100
      });
      lastBeatTime=timeSec;
    }
  }
}

console.log(`Detected ${beats.length} beats/onsets (threshold=${threshold}, minInterval=${minBeatInterval}s)`);
if(beats.length>0){
  console.log(`  First: ${beats[0].timeSec}s (frame ${beats[0].frame})`);
  console.log(`  Last: ${beats[beats.length-1].timeSec}s (frame ${beats[beats.length-1].frame})`);
  const intervals=beats.slice(1).map((b,i)=>b.timeSec-beats[i].timeSec);
  const avgInterval=intervals.reduce((a,b)=>a+b,0)/intervals.length;
  console.log(`  Avg interval: ${(avgInterval*1000).toFixed(0)}ms (~${(60/avgInterval).toFixed(1)} BPM)`);
}

// ── Output ────────────────────────────────────────────────────────────
const output={
  source:wavPath,
  sampleRate,
  durationSec:Math.round(durationSec*100)/100,
  fps,
  threshold,
  beatCount:beats.length,
  beats
};

if(outPath){
  writeFileSync(resolve(outPath),JSON.stringify(output,null,2),"utf-8");
  console.log(`  Written to: ${outPath}`);
}else{
  console.log(JSON.stringify(output,null,2));
}
