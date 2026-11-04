#!/usr/bin/env node
import assert from "node:assert/strict";
import {directScreenDemoMotion} from "../apps/studio-next/src/lib/a1-screen-demo-motion-director-v1.mjs";

const fixtures = [
  {id:"research-read",genre:"research",input:{semanticAction:"READ_ONLY",verifiedTarget:false,nativeEmphasis:false,persistentResult:false,durationMs:2600},expected:"CLEAN_HOLD"},
  {id:"product-submit",genre:"product-demo",input:{semanticAction:"FORM_SUBMIT",verifiedTarget:true,nativeEmphasis:false,persistentResult:true,durationMs:6200},expected:"SEMANTIC_PUSH"},
  {id:"tutorial-text",genre:"tutorial",input:{semanticAction:"TEXT_ATTENTION",verifiedTarget:true,nativeEmphasis:false,persistentResult:false,durationMs:5200},expected:"SOURCE_ANNOTATION"},
  {id:"native-selection",genre:"editorial",input:{semanticAction:"TEXT_ATTENTION",verifiedTarget:true,nativeEmphasis:true,persistentResult:false,durationMs:4200},expected:"CLEAN_HOLD"},
].map((fixture)=>{
  const decision=directScreenDemoMotion(fixture.input);
  assert.equal(decision.status,"PASS");
  assert.equal(decision.presentation,fixture.expected);
  assert.equal(decision.policy.storyboardSemanticsBeforeMotion,true);
  if(decision.presentation==="SEMANTIC_PUSH"){
    assert.ok(decision.profile.moveDurationMs>=1000);
    assert.ok(decision.profile.minimumResultHoldMs>=1400);
    assert.equal(decision.profile.curveId,"EDITORIAL_MINIMUM_JERK_FOCUS");
  }
  if(decision.presentation==="SOURCE_ANNOTATION"){
    assert.ok(decision.profile.annotationEnterMs>=480);
    assert.ok(decision.profile.annotationHoldMs>=1400);
  }
  return {id:fixture.id,genre:fixture.genre,status:"PASS",presentation:decision.presentation,decisionSha256:decision.decisionSha256};
});
console.log(JSON.stringify({contract:"A1ScreenDemoMotionDirectorProof/v1",status:"PASS",fixtures},null,2));
