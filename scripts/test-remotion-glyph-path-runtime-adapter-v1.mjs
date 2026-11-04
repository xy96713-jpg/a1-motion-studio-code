#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {getGlyphPathFrameStateV1} from "../remotion-renderer/src/A1GlyphPathRuntimeStateV1.ts";

const root=path.resolve(import.meta.dirname,"..");
const props=JSON.parse(fs.readFileSync(path.join(root,"remotion-renderer/src/generated/glyphPathAdapterCanaryProps.json"),"utf8"));
const profileFor=(effectId)=>effectId==="EVA_COMPRESS"?"EVA_MINCHO":effectId==="PIXEL_TRACKING_LOCK"?"FUSION_PIXEL":"SANS_HEAVY";
const frames=[0,36,60,100,136,149];
for(const effectId of props.effectIds){
  const manifest=props.manifests[profileFor(effectId)];
  const states=frames.map((frame)=>getGlyphPathFrameStateV1({manifest,effectId,frame,durationInFrames:150,canvasWidth:640,canvasHeight:360,fontSize:effectId==="PIXEL_TRACKING_LOCK"?90:effectId==="EVA_COMPRESS"?172:132}));
  assert.equal(states[0].phase,"PRE");
  assert.equal(states[1].phase,"ENTER");
  assert.equal(states[2].phase,"PEAK");
  assert.equal(states[3].phase,"HOLD");
  assert.equal(states[3].cleanReadableHold,true);
  assert.equal(states[4].phase,"EXIT");
  assert.equal(states[5].phase,"POST");
  assert.equal(JSON.stringify(getGlyphPathFrameStateV1({manifest,effectId,frame:60,durationInFrames:150,canvasWidth:640,canvasHeight:360,fontSize:132})),JSON.stringify(getGlyphPathFrameStateV1({manifest,effectId,frame:60,durationInFrames:150,canvasWidth:640,canvasHeight:360,fontSize:132})));
  assert.ok(states[3].glyphs.every((glyph)=>glyph.primaryPath.length>0&&glyph.bounds.width>0&&glyph.bounds.height>0&&glyph.subpathCount>0));
  const canaryHold=getGlyphPathFrameStateV1({manifest,effectId,frame:100,durationInFrames:150,canvasWidth:384,canvasHeight:360,fontSize:effectId==="PIXEL_TRACKING_LOCK"?72:effectId==="EVA_COMPRESS"?128:80});
  assert.ok(canaryHold.glyphs.every((glyph)=>glyph.bounds.x1>=0&&glyph.bounds.y1>=0&&glyph.bounds.x2<=384&&glyph.bounds.y2<=360),`${effectId}:hold-visible-bounds`);
  assert.ok(states.every((state)=>state.outputBoundary.outputMode==="TRANSPARENT_GLYPH_ASSET"&&state.outputBoundary.authoredBackgroundAllowed===false&&state.outputBoundary.runtimeFontParserAllowed===false&&state.outputBoundary.secondRenderAuthority===false));
  for(const api of ["scalePath","translatePath","warpPath","interpolatePath","getBoundingBox","getSubpaths","getLength","cutPath","evolvePath"])assert.ok(states[3].pathApiUsage.includes(api));
}
const runtimeSource=fs.readFileSync(path.join(root,"remotion-renderer/src/A1GlyphPathRuntimeStateV1.ts"),"utf8");
assert.ok(runtimeSource.includes('from "@remotion/paths"'));
assert.equal(/fontkit/iu.test(runtimeSource),false);
for(const banned of ["Math.random","Date.now","performance.now","setTimeout","setInterval"])assert.equal(runtimeSource.includes(banned),false,banned);
const blindDir=path.join(root,"work/fontkit-remotion-paths-glyph-adapter-v1/blind-manifests");
const blindFiles=fs.readdirSync(blindDir).filter((file)=>file.endsWith(".json"));
assert.equal(blindFiles.length,6);
for(const file of blindFiles){const manifest=JSON.parse(fs.readFileSync(path.join(blindDir,file),"utf8"));assert.equal(manifest.outputBoundary.runtimeConsumesPathsOnly,true);assert.equal(manifest.outputBoundary.runtimeFontParserAllowed,false);assert.equal(manifest.shaping.fallbackUsed,false);}
console.log(JSON.stringify({contract:"A1RemotionGlyphPathRuntimeAdapterTest/v1",status:"PASS",effectCount:props.effectIds.length,frameSamples:frames,blindManifestCount:blindFiles.length,checks:["official-remotion-paths","no-runtime-fontkit","ten-effects","pre-enter-peak-hold-exit-post","clean-readable-hold","hold-visible-bounds","duplicate-seek-stable","transparent-output","no-second-renderer","six-blind-manifests"]},null,2));
