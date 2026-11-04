#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileScreenAttentionProgram} from "../apps/studio-next/src/lib/a1-screen-attention-orchestrator-v1.mjs";
import {compileEventTimedScreenCamera} from "../apps/studio-next/src/lib/a1-event-timed-screen-camera-v1.mjs";
import {selectScreenMotionTechniques} from "../apps/studio-next/src/lib/a1-screen-motion-technique-selector-v1.mjs";
import {solveScreenFraming} from "../apps/studio-next/src/lib/a1-screen-framing-solver-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const dir=path.join(root,"work/storyboard-attention-wave-plan-v1");
const plan=JSON.parse(fs.readFileSync(path.join(dir,"highdpi-reconciled-plan.json"),"utf8"));
const hash=(value)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalize=(rect,report)=>rect?{x:rect.x/report.output.width,y:rect.y/report.output.height,width:rect.width/report.output.width,height:rect.height/report.output.height}:null;
const compiled=[],suppressed=[];let retainedFocusCount=0;

for(const item of plan.items){
  if(!item.cameraGate.requested||!item.cameraGate.production1080Allowed){if(item.cameraGate.requested)suppressed.push({shotId:item.shotId,reason:item.cameraGate.suppressionReason||item.cameraGate.status});continue;}
  if(["BLUE_EVIDENCE_UNDERLINE","SOURCE_NATIVE_HIGHLIGHT"].includes(item.decision.effect)){suppressed.push({shotId:item.shotId,reason:"MORE_INFORMATIVE_NON_CAMERA_EFFECT_SELECTED"});continue;}
  if(item.decision.effect==="RESULT_FOCUS_WINDOW"&&retainedFocusCount<1){retainedFocusCount+=1;suppressed.push({shotId:item.shotId,reason:"SEQUENCE_DIVERSITY_RETAINS_ONE_RESULT_FOCUS"});continue;}
  const report=JSON.parse(fs.readFileSync(path.join(root,item.source.reportPath),"utf8"));
  const persistent=report.persistentResultDom?.status==="PASS"?{visibleMs:(report.events||[]).find((event)=>event.name===report.persistentResultDom.resultEvent)?.outputTimeMs,region:normalize(report.persistentResultDom.finalRect,report)}:null;
  if(!persistent||!Number.isFinite(persistent.visibleMs)||item.durationMs-persistent.visibleMs<1320){suppressed.push({shotId:item.shotId,reason:"INSUFFICIENT_EVENT_TO_FINAL_HOLD_WINDOW"});continue;}
  let cameraProgram,route="SEMANTIC_PUSH";
  const domTarget=(report.domTargets||[])[0]?.sourceRect;
  if(domTarget){
    const combinedLeft=Math.min(domTarget.x,persistent.region.x),combinedRight=Math.max(domTarget.x+domTarget.width,persistent.region.x+persistent.region.width);
    if(combinedRight-combinedLeft>.68){
      const contextAnchor={x:.16,y:.28,width:.5,height:.5};
      const action=solveScreenFraming({shotId:`${item.shotId}-action`,intent:"ACTION_MEDIUM",primaryTarget:domTarget,contextAnchor,minScale:1.15,maxScale:1.3,margin:.045,minContextRetention:.72});
      const result=solveScreenFraming({shotId:`${item.shotId}-result`,intent:"CAUSE_RESULT_TWO_ZONE",primaryTarget:domTarget,secondaryTarget:persistent.region,contextAnchor,continuityAnchor:domTarget,minScale:1.05,maxScale:1.3,margin:.035,minContextRetention:.72});
      if(action.status==="PASS"&&result.status==="PASS"){
        route="CONTEXT_REFIT";
        const firstVisible=(report.domTargets||[])[0].capturedAtMs,moveEnd=firstVisible+620,refitEnd=Math.min(item.durationMs-800,persistent.visibleMs+520);
        const track=[{atMs:0,x:.5,y:.5,scale:1,easingToNext:"hold"},{atMs:firstVisible,x:.5,y:.5,scale:1,easingToNext:"cinematic-in-out"},{atMs:moveEnd,...action.pose,easingToNext:"hold"},{atMs:persistent.visibleMs,...action.pose,easingToNext:"cinematic-in-out"},{atMs:refitEnd,...result.pose,easingToNext:"hold"},{atMs:item.durationMs,...result.pose,easingToNext:"hold"}];
        cameraProgram={contract:"A1EventTimedContextRefit/v1",status:"PASS",track,cameraPerformance:{moveCount:2,maximumScale:Math.max(...track.map((key)=>key.scale)),finalHoldMs:item.durationMs-refitEnd},sourceBinding:{primaryTarget:domTarget,secondaryTarget:persistent.region,primaryVisibleMs:firstVisible,secondaryVisibleMs:persistent.visibleMs},framing:{action,result},cameraProgramSha256:hash({track,action:action.framingSha256,result:result.framingSha256})};
      }
    }
  }
  if(!cameraProgram){
    const techniquePlan=selectScreenMotionTechniques({shotId:item.shotId,shotFunction:"RESULT",durationMs:item.durationMs,primaryTarget:persistent.region,targetVisibleMs:persistent.visibleMs,resultNeedsReading:true});
    cameraProgram=compileEventTimedScreenCamera({shotId:item.shotId,durationMs:item.durationMs,techniquePlan,primaryTarget:persistent.region,primaryVisibleMs:persistent.visibleMs,moveDurationMs:520,minimumResultHoldMs:800,minimumAllowedScale:1.15,maximumAllowedScale:1.3});
    if(cameraProgram.status!=="PASS"){suppressed.push({shotId:item.shotId,reason:cameraProgram.failures.join(",")});continue;}
  }
  const cameraMoves=[];
  for(let index=1;index<cameraProgram.track.length-1;index+=2){const start=cameraProgram.track[index],end=cameraProgram.track[index+1];if(end.atMs>start.atMs)cameraMoves.push({id:`${item.shotId}-camera-${cameraMoves.length+1}`,startMs:start.atMs,endMs:end.atMs});}
  const sourceAction=item.attentionProgram.program.find((actor)=>actor.kind==="SOURCE_ACTION");
  const resultHold={id:`${item.shotId}-camera-result-hold`,startMs:cameraProgram.track.at(-2).atMs,endMs:item.durationMs};
  const attentionProgram=compileScreenAttentionProgram({shotId:item.shotId,durationMs:item.durationMs,targetVisibleMs:persistent.visibleMs,sourceActions:sourceAction?[sourceAction]:[],cameraMoves,cursorActions:[],emphasisActors:[],resultHold});
  if(attentionProgram.status!=="PASS")throw new Error(`${item.shotId}:${attentionProgram.failures.join(",")}`);
  item.decision={...item.decision,effect:route,reason:"HIGH_DPI_EVENT_BOUND_CAMERA_SELECTED",priorEffect:item.decision.effect};item.cameraProgram=cameraProgram;item.attentionProgram=attentionProgram;
  compiled.push({shotId:item.shotId,route,sourceSha256:item.source.sha256,maximumScale:cameraProgram.cameraPerformance.maximumScale,finalHoldMs:cameraProgram.cameraPerformance.finalHoldMs,cameraProgramSha256:cameraProgram.cameraProgramSha256});
}
plan.cameraCompilation={contract:"A1StoryboardCameraProgramCompilation/v1",compiled,suppressed,compiledCount:compiled.length};plan.counts=plan.items.reduce((acc,item)=>({...acc,[item.decision.effect]:(acc[item.decision.effect]||0)+1}),{});delete plan.planSha256;plan.planSha256=hash(plan);fs.writeFileSync(path.join(dir,"camera-compiled-plan.json"),`${JSON.stringify(plan,null,2)}\n`);console.log(JSON.stringify({status:"PASS",planSha256:plan.planSha256,counts:plan.counts,cameraCompilation:plan.cameraCompilation},null,2));
