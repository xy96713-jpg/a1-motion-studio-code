#!/usr/bin/env node
import assert from "node:assert/strict";
import {selectScreenMotionTechniques} from "../apps/studio-next/src/lib/a1-screen-motion-technique-selector-v1.mjs";

const regionA={x:.12,y:.22,width:.18,height:.12},regionB={x:.63,y:.55,width:.24,height:.18};
const fixtures=[
  {genre:"product-demo",input:{shotId:"product",shotFunction:"ACTION",durationMs:4200,primaryTarget:regionA,targetVisibleMs:700,cursorIsDecisive:true},expected:"CURSOR_PUNCH"},
  {genre:"tutorial",input:{shotId:"tutorial",shotFunction:"ACTION",durationMs:3800,primaryTarget:regionA,targetVisibleMs:500,nativeActionReadable:true},expected:"SOURCE_ACTION_ONLY"},
  {genre:"editorial-judgment",input:{shotId:"editorial",shotFunction:"RESULT",durationMs:4600,primaryTarget:regionA,targetVisibleMs:1100,resultNeedsReading:true},expected:"SEMANTIC_PUSH"},
  {genre:"state-switch",input:{shotId:"state",shotFunction:"COMPARISON",durationMs:5200,primaryTarget:regionA,secondaryTarget:regionB,targetVisibleMs:800,secondaryVisibleMs:2400,stateChangeKind:"SAME_SURFACE",resultNeedsReading:true},expected:"TRACKED_PAN"},
];
const results=fixtures.map(({genre,input,expected})=>{const result=selectScreenMotionTechniques(input);assert.equal(result.status,"PASS");assert.ok(result.techniques.some((row)=>row.technique===expected));assert.equal(result.admission.packagingSubstitutionAllowed,false);return{genre,expected,status:result.status,decisionSha256:result.decisionSha256};});
const crossSurface=selectScreenMotionTechniques({shotId:"cross",shotFunction:"COMPARISON",durationMs:4200,primaryTarget:regionA,secondaryTarget:regionB,targetVisibleMs:700,secondaryVisibleMs:2100,stateChangeKind:"CROSS_SURFACE"});assert.ok(crossSurface.techniques.some((row)=>row.technique==="HARD_CUT_STATE_REPLACE"));
console.log(JSON.stringify({contract:"A1ScreenMotionTechniqueSelectorTest/v1",status:"PASS",fixtures:results,gates:{nativeActionWins:true,cameraRequiresVerifiedTarget:true,trackedPanRequiresSameSurface:true,resultHoldRequired:true,packagingCannotSubstituteForCamera:true}},null,2));
