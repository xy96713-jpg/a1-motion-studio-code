#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {selectScreenMotionTechniques} from "../apps/studio-next/src/lib/a1-screen-motion-technique-selector-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const out=path.join(root,"work/screen-motion-technique-system-v1");
const decomposition=JSON.parse(fs.readFileSync(path.join(root,"work/screen-director-brain-v2/reference-motion-decomposition-v1.json"),"utf8"));
const a={x:.12,y:.2,width:.18,height:.12},b={x:.62,y:.55,width:.24,height:.18};
const fixtureInputs=[
  {id:"product-demo",genre:"product-demo",input:{shotId:"fixture-product",shotFunction:"ACTION",durationMs:4200,primaryTarget:a,targetVisibleMs:700,cursorIsDecisive:true}},
  {id:"tutorial",genre:"tutorial",input:{shotId:"fixture-tutorial",shotFunction:"ACTION",durationMs:3800,primaryTarget:a,targetVisibleMs:500,nativeActionReadable:true}},
  {id:"editorial",genre:"editorial-judgment",input:{shotId:"fixture-editorial",shotFunction:"RESULT",durationMs:4600,primaryTarget:a,targetVisibleMs:1100,resultNeedsReading:true}},
  {id:"state-switch",genre:"state-switch",input:{shotId:"fixture-state",shotFunction:"COMPARISON",durationMs:5200,primaryTarget:a,secondaryTarget:b,targetVisibleMs:800,secondaryVisibleMs:2400,stateChangeKind:"SAME_SURFACE",resultNeedsReading:true}},
];
const fixtures=fixtureInputs.map((fixture)=>({...fixture,result:selectScreenMotionTechniques(fixture.input)}));
const failures=[];
if(decomposition.segments.length<12)failures.push("REFERENCE_SEGMENTS_BELOW_TWELVE");
if(fixtures.some((fixture)=>fixture.result.status!=="PASS"))failures.push("BLIND_FIXTURE_FAILED");
const vocabulary=new Set(decomposition.segments.flatMap((segment)=>segment.techniques));
for(const required of ["LOCK_WIDE","SOURCE_ACTION_ONLY","CURSOR_PUNCH","SEMANTIC_PUSH","TRACKED_PAN","HARD_CUT_STATE_REPLACE","RESULT_HOLD","CHAPTER_CUT"])if(!vocabulary.has(required))failures.push(`REFERENCE_TECHNIQUE_MISSING:${required}`);
const body={contract:"A1ScreenMotionTechniqueSystemAudit/v1",status:failures.length?"FAIL":"PASS",reference:{sourceSha256:decomposition.source.sha256,segmentCount:decomposition.segments.length,techniques:[...vocabulary]},fixtures:fixtures.map((fixture)=>({id:fixture.id,genre:fixture.genre,status:fixture.result.status,decisionSha256:fixture.result.decisionSha256,techniques:fixture.result.techniques.map((row)=>row.technique)})),gates:{storyboardTechniquePlanRequired:true,packagingCannotSubstitute:true,nativeActionPreferred:true,cameraRequiresVerifiedTarget:true,panRequiresTwoSameSurfaceTargets:true,resultHoldRequired:true,continuousPlaybackReviewRequired:true},failures};
body.auditSha256=crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,"audit-report.json"),`${JSON.stringify(body,null,2)}\n`);
console.log(JSON.stringify(body,null,2));
if(failures.length)process.exitCode=1;
