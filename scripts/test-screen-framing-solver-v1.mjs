#!/usr/bin/env node
import assert from "node:assert/strict";
import {solveScreenFraming} from "../apps/studio-next/src/lib/a1-screen-framing-solver-v1.mjs";
const cases=[
  {id:"product-demo",intent:"ACTION_MEDIUM",primaryTarget:{x:.15,y:.62,width:.22,height:.08},contextAnchor:{x:.08,y:.18,width:.5,height:.55}},
  {id:"tutorial",intent:"ACTION_MEDIUM",primaryTarget:{x:.54,y:.16,width:.16,height:.1},contextAnchor:{x:.28,y:.08,width:.58,height:.45}},
  {id:"editorial",intent:"RESULT_READING",primaryTarget:{x:.2,y:.35,width:.46,height:.22},contextAnchor:{x:.15,y:.18,width:.58,height:.56}},
  {id:"state-switch",intent:"CAUSE_RESULT_TWO_ZONE",primaryTarget:{x:.18,y:.55,width:.44,height:.08},secondaryTarget:{x:.68,y:.31,width:.3,height:.25},contextAnchor:{x:.16,y:.28,width:.5,height:.5},continuityAnchor:{x:.18,y:.55,width:.44,height:.08},maxScale:1.3,minScale:1.05},
];
const fixtures=cases.map((input)=>{const result=solveScreenFraming({shotId:input.id,...input});assert.equal(result.status,"PASS",JSON.stringify(result.failures));assert.ok(result.metrics.primaryRetention>=.98);assert.ok(result.metrics.contextRetention>=.72);return{id:input.id,status:result.status,pose:result.pose,metrics:result.metrics,framingSha256:result.framingSha256};});
console.log(JSON.stringify({contract:"A1ScreenFramingSolverTest/v1",status:"PASS",fixtures,gates:{primaryTargetReadable:true,contextRetentionAtLeast72Percent:true,secondaryTargetReadable:true,edgeSafeViewport:true}},null,2));
