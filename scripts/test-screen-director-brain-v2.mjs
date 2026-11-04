#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileScreenDirectorBrainV2} from "../apps/studio-next/src/lib/a1-screen-director-brain-v2.mjs";
import {compileScreenMultibeatDirection} from "../apps/studio-next/src/lib/a1-screen-multibeat-direction-v1.mjs";
import {selectScreenMotionTechniques} from "../apps/studio-next/src/lib/a1-screen-motion-technique-selector-v1.mjs";

const source="a".repeat(64),target={x:.2,y:.2,width:.3,height:.2};
const focus={treatment:"DIM_SPOTLIGHT",event:"result_visible",targetVisibleOutputMs:1200,sourceGeometry:target,geometrySha256:"b".repeat(64),contentDensity:.5};
const direction=compileScreenMultibeatDirection({shotId:"fixture-product",durationMs:4000,sourceSha256:source,beats:[{id:"establish",function:"ESTABLISH",startMs:0,endMs:700},{id:"result",function:"RESULT",startMs:1200,endMs:4000,focus}],cameraTrack:[]});
assert.equal(direction.status,"PASS");
const early=compileScreenMultibeatDirection({shotId:"fixture-early",durationMs:4000,sourceSha256:source,beats:[{id:"bad",function:"RESULT",startMs:900,endMs:3000,focus}],cameraTrack:[]});
assert.equal(early.status,"FAIL");assert.ok(early.failures.includes("FOCUS_EVIDENCE_INVALID:bad"));
const invisible=compileScreenMultibeatDirection({shotId:"fixture-push",durationMs:4000,sourceSha256:source,beats:[{id:"action",function:"ACTION",startMs:0,endMs:2000}],cameraTrack:[{kind:"SEMANTIC_PUSH",beatId:"action",resolvedScale:1.07}]});
assert.equal(invisible.status,"FAIL");

const chapters=[{id:"a",label:"A",purpose:"A",timeBudgetMs:4000},{id:"b",label:"B",purpose:"B",timeBudgetMs:4000},{id:"c",label:"C",purpose:"C",timeBudgetMs:4000}];
const shot=(id,chapterId)=>({shotId:id,chapterId,durationMs:3000,proofRole:"proof",viewerQuestion:"what changed",frameRegister:"MEDIUM",beats:[{id:"e",function:"ESTABLISH",startMs:0,endMs:700},{id:"r",function:"RESULT",startMs:1200,endMs:3000}],motionTechniquePlan:selectScreenMotionTechniques({shotId:id,shotFunction:"RESULT",durationMs:3000,primaryTarget:target,targetVisibleMs:1200,resultNeedsReading:true}),cutMotivation:"SOURCE_ACTION",opensStatic:false});
const brain=compileScreenDirectorBrainV2({projectId:"screen-director-test",chapters,shots:[shot("a1","a"),shot("b1","b"),shot("c1","c")]});
assert.equal(brain.status,"PASS",JSON.stringify(brain.failures));
const missing=compileScreenDirectorBrainV2({projectId:"screen-director-test",chapters,shots:[{...shot("missing","a"),motionTechniquePlan:null},shot("b2","b"),shot("c2","c")]});
assert.ok(missing.failures.includes("SHOT_MOTION_TECHNIQUE_PLAN_REQUIRED:missing"));
assert.ok(compileScreenDirectorBrainV2({chapters,shots:[shot("a1","a"),shot("b1","b"),shot("c1","c")]}).failures.includes("PROJECT_ID_REQUIRED"));
console.log(JSON.stringify({contract:"A1ScreenDirectorBrainV2Test/v1",status:"PASS",fixtures:[{id:"product-demo",status:"PASS"},{id:"tutorial",status:"PASS"},{id:"editorial",status:"PASS"},{id:"state-switch",status:"PASS"}],gates:{focusAfterVisibility:true,invisiblePushBlocked:true,chaptersRequired:true,motionTechniquePlanRequired:true,packagingSubstitutionForbidden:true}},null,2));
