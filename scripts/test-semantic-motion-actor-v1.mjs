#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileSemanticMotionActor,assertSemanticMotionActor} from "../apps/studio-next/src/lib/a1-semantic-motion-actor-v1.mjs";
const fixtures=[
 {genre:"personal-opinion",primitive:"question-select-reject-hold",family:"QUESTION_CURSOR"},
 {genre:"research-evidence",primitive:"source-scan-bound-conclusion",family:"EVIDENCE_SCAN"},
 {genre:"technical-process",primitive:"signal-loss-causal-progression",family:"SIGNAL_DEGRADATION"},
 {genre:"product-workflow",primitive:"state-cursor-sequence",family:"STATE_RAIL_CURSOR"},
 {genre:"identity-close",primitive:"conveyor-output-identity-lock",family:"IDENTITY_LOCK_SIGNAL"},
];
const actors=fixtures.map((item)=>assertSemanticMotionActor(compileSemanticMotionActor({motionPrimitive:item.primitive,semanticAction:item.genre})));
assert.deepEqual(actors.map((item)=>item.family),fixtures.map((item)=>item.family));assert.equal(new Set(actors.map((item)=>item.actorSha256)).size,fixtures.length);assert.ok(actors.every((item)=>!/<text\b/iu.test(item.svg)&&item.canvas.width===960&&item.canvas.height===540));
console.log(JSON.stringify({status:"PASS",contract:"A1SemanticMotionActorTest/v1",genres:fixtures.map((item)=>item.genre),families:actors.map((item)=>item.family),distinctActors:true,readableTextForbidden:true},null,2));
