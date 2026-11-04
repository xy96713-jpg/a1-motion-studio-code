#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const propsPath=path.join(root,"work/screen-director-brain-v2/hero-props.json");
const props=JSON.parse(fs.readFileSync(propsPath,"utf8"));
const centre=(region)=>region?{x:region.x+region.width/2,y:region.y+region.height/2}:null;

for(const item of props.scenes.filter((scene)=>scene.kind!=="BRIDGE")){
  const direction=item.sourceScene.screenDirection;
  const regions=(direction.attentionTrack||[]).map((actor)=>centre(actor.region)).filter(Boolean);
  const mode=["DETAIL_INSERT","STATE_COMPARE"].includes(item.layout)?"PAN":"PUSH";
  const first=regions[0]||(mode==="PAN"?{x:.32,y:.5}:{x:.5,y:.5});
  const last=regions.length>1?regions.at(-1):(mode==="PAN"?{x:first.x<.5?.72:.32,y:first.y}:first);
  const duration=item.durationMs;
  const pushEnd=Math.min(duration-500,1350);
  const panEnd=Math.min(duration-260,Math.max(pushEnd+700,duration*.68));
  const scale=mode==="PAN"?1.58:1.64;
  const track=mode==="PAN"?[
    {atMs:0,x:.5,y:.5,scale:1,easingToNext:"hold"},
    {atMs:Math.min(520,duration*.18),x:.5,y:.5,scale:1,easingToNext:"cinematic-in-out"},
    {atMs:pushEnd,x:first.x,y:first.y,scale,easingToNext:"hold"},
    {atMs:Math.max(pushEnd+1,panEnd-620),x:first.x,y:first.y,scale,easingToNext:"cinematic-in-out"},
    {atMs:panEnd,x:last.x,y:last.y,scale,easingToNext:"hold"},
    {atMs:duration,x:last.x,y:last.y,scale,easingToNext:"hold"},
  ]:[
    {atMs:0,x:.5,y:.5,scale:1,easingToNext:"hold"},
    {atMs:Math.min(600,duration*.22),x:.5,y:.5,scale:1,easingToNext:"cinematic-in-out"},
    {atMs:pushEnd,x:last.x,y:last.y,scale,easingToNext:"hold"},
    {atMs:duration,x:last.x,y:last.y,scale,easingToNext:"hold"},
  ];
  item.sourceScene.cameraTrack=track;
  item.sourceScene.screenDirection={...direction,cameraPath:"CINEMATIC_EASE_IN_OUT_RESTORE",motionBlurPolicy:"TEMPORAL_CAMERA_ONLY",temporalMotionBlur:{shutterAngle:140,samples:6},cameraTrack:track,cameraPerformance:{mode:`REFERENCE_${mode}`,moveCount:mode==="PAN"?2:1,maximumScale:scale,finalSharpHoldMs:duration-track.at(-2).atMs}};
}

fs.writeFileSync(propsPath,`${JSON.stringify(props,null,2)}\n`);
console.log(JSON.stringify({contract:"A1ReferenceCameraTrackApplication/v1",status:"PASS",sourceSceneCount:props.scenes.filter((scene)=>scene.kind!=="BRIDGE").length,modes:props.scenes.filter((scene)=>scene.kind!=="BRIDGE").map((scene)=>scene.sourceScene.screenDirection.cameraPerformance.mode)},null,2));
