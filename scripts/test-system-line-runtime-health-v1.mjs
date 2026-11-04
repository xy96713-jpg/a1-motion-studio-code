#!/usr/bin/env node
import assert from "node:assert/strict";import {classifySystemLineRuntimeHealth} from "../apps/studio-next/src/lib/a1-system-line-runtime-health-v1.mjs";
const expectedCwd="/project/apps/studio-next";
const fixtures=[
 {id:"health-healthy-a",input:{listenerCount:1,pid:1,expectedCwd,actualCwd:expectedCwd,ageSeconds:20,cpuPercent:3,http:[{ok:true},{ok:true}]},expected:"HEALTHY",safe:false},
 {id:"health-stuck-b",input:{listenerCount:1,pid:2,expectedCwd,actualCwd:expectedCwd,ageSeconds:259200,cpuPercent:128,http:[{ok:false,timeout:true},{ok:false,timeout:true}]},expected:"STALE_UNRESPONSIVE",safe:true},
 {id:"health-wrong-c",input:{listenerCount:1,pid:3,expectedCwd,actualCwd:"/other",ageSeconds:99999,cpuPercent:150,http:[{ok:false}]},expected:"WRONG_WORKSPACE_RUNTIME",safe:false},
];
const results=fixtures.map(f=>{const r=classifySystemLineRuntimeHealth(f.input);assert.equal(r.status,f.expected);assert.equal(r.safeToTerminate,f.safe);return{id:f.id,status:"PASS",classification:r.status,safeToTerminate:r.safeToTerminate};});console.log(JSON.stringify({contract:"A1SystemLineRuntimeHealthTest/v1",status:"PASS",results},null,2));
