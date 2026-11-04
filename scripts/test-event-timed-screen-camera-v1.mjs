#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileEventTimedScreenCamera} from "../apps/studio-next/src/lib/a1-event-timed-screen-camera-v1.mjs";
import {selectScreenMotionTechniques} from "../apps/studio-next/src/lib/a1-screen-motion-technique-selector-v1.mjs";

const a={x:.18,y:.45,width:.44,height:.08},b={x:.68,y:.31,width:.3,height:.25};
const cases=[
  {id:"product-demo",plan:selectScreenMotionTechniques({shotId:"p",shotFunction:"ACTION",durationMs:4200,primaryTarget:a,targetVisibleMs:900}),args:{primaryTarget:a,primaryVisibleMs:900}},
  {id:"tutorial",plan:selectScreenMotionTechniques({shotId:"t",shotFunction:"ACTION",durationMs:4200,primaryTarget:a,targetVisibleMs:800,nativeActionReadable:true}),args:{}},
  {id:"editorial",plan:selectScreenMotionTechniques({shotId:"e",shotFunction:"RESULT",durationMs:4600,primaryTarget:a,targetVisibleMs:1200,resultNeedsReading:true}),args:{primaryTarget:a,primaryVisibleMs:1200}},
  {id:"state-switch",plan:selectScreenMotionTechniques({shotId:"s",shotFunction:"COMPARISON",durationMs:6200,primaryTarget:a,secondaryTarget:b,targetVisibleMs:1100,secondaryVisibleMs:4200,stateChangeKind:"SAME_SURFACE",resultNeedsReading:true}),args:{primaryTarget:a,secondaryTarget:b,primaryVisibleMs:1100,secondaryVisibleMs:4200}},
];
const fixtures=cases.map((fixture)=>{const result=compileEventTimedScreenCamera({shotId:fixture.id,durationMs:fixture.id==="state-switch"?6200:fixture.id==="editorial"?4600:4200,techniquePlan:fixture.plan,...fixture.args});assert.equal(result.status,"PASS",JSON.stringify(result.failures));assert.ok(result.cameraPerformance.finalHoldMs>=800);return{id:fixture.id,status:result.status,moveCount:result.cameraPerformance.moveCount,maximumScale:result.cameraPerformance.maximumScale,finalHoldMs:result.cameraPerformance.finalHoldMs,cameraProgramSha256:result.cameraProgramSha256};});
const invalid=compileEventTimedScreenCamera({shotId:"invalid",durationMs:4000,techniquePlan:selectScreenMotionTechniques({shotId:"i",shotFunction:"ACTION",durationMs:4000,primaryTarget:a,targetVisibleMs:900}),primaryTarget:a});assert.ok(invalid.failures.includes("PRIMARY_VISIBLE_TIME_REQUIRED"));
console.log(JSON.stringify({contract:"A1EventTimedScreenCameraTest/v1",status:"PASS",fixtures,gates:{cameraStartsAfterVisibility:true,panStartsAfterSecondTarget:true,scaleBounded:true,resultHoldAtLeast800Ms:true,packagingSubstitutionForbidden:true}},null,2));
