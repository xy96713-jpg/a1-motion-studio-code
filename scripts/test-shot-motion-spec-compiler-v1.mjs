#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {compileShotMotionSpecSet,assertShotMotionSpecSet,auditRenderableAgainstShotMotionSpec} from "../apps/studio-next/src/lib/a1-shot-motion-spec-v1.mjs";

const sha=(token)=>crypto.createHash("sha256").update(token).digest("hex");
const asset=(id,kind="GENERATED_LAYER",extra={})=>({assetId:id,publicUrl:`/current/${id}.png`,sha256:sha(id),kind,current:true,authorityScope:"CURRENT",status:"READY",...extra});
const camera=(first,last)=>({contract:"A1CameraAnchorLock/v1",canvas:{width:960,height:540},sourceCrop:{x:0,y:0,width:1,height:1},primaryAnchor:{x:.5,y:.5},safeArea:{x:.04,y:.06,width:.92,height:.88},maximumAnchorDriftPx:6,firstFrameSha256:first,lastFrameSha256:last});
const entries=[
  {shotId:"N-01",order:1,packageDecision:"PACKAGE",selectedFrame:asset("n-final","APPROVED_STATIC")},
  {shotId:"T-01",order:2,packageDecision:"NO_PACKAGE",selectedFrame:asset("t-final","APPROVED_STATIC")},
  {shotId:"P-01",order:3,packageDecision:"PACKAGE",selectedFrame:asset("p-final","APPROVED_STATIC")},
  {shotId:"M-01",order:4,packageDecision:"PACKAGE",selectedFrame:asset("m-final","APPROVED_STATIC")},
];
const shot=(shotId,productionRoute,setupSha,resultSha)=>({shotId,productionRoute,actors:[`${shotId}-actor`],states:[{state:"SETUP",sha256:setupSha},{state:"ACTION",sha256:sha(`${shotId}-action`)},{state:"RESULT",sha256:resultSha}]});
const actionStoryboard={contract:"A1RepresentativeMotionActionStoryboard/v1",status:"APPROVED_FOR_FIVE_SHOT_RENDER",userVisualApproval:"APPROVED",shots:[
  shot("N-01","TRUE_GLYPH_LAYERS",sha("n-first"),sha("n-final")),
  shot("T-01","VERIFIED_SCREEN_SOURCE_PLAYBACK",sha("t-first"),sha("t-final")),
  shot("P-01","REAL_PRESENTER_MATTE_AND_WINDOW_LAYERS",sha("p-first"),sha("p-final")),
  shot("M-01","XYQ_MOTION_REFERENCE_LOCAL_REBUILD",sha("m-first"),sha("m-final")),
]};
const bindings={
  "N-01":{renderer:"REMOTION",renderSourceAssetId:"n-first",cameraLock:camera(sha("n-first"),sha("n-final")),assets:[asset("n-first","GLYPH_LAYER",{trueAlpha:true}),asset("n-final","APPROVED_STATIC")],actors:[{id:"N-01-actor",assetIds:["n-first"]}]},
  "T-01":{renderer:"SOURCE_PLAYBACK",renderSourceAssetId:"t-first",cameraLock:camera(sha("t-first"),sha("t-final")),assets:[asset("t-first","VERIFIED_SCREEN_SOURCE",{generated:false}),asset("t-final","APPROVED_STATIC")],actors:[{id:"T-01-actor",assetIds:["t-first"]}],screenActionGrammar:"SELECT_FOCUS"},
  "P-01":{renderer:"REMOTION",renderSourceAssetId:"p-first",cameraLock:camera(sha("p-first"),sha("p-final")),assets:[asset("p-first","VERIFIED_PRESENTER_VIDEO",{generated:false}),asset("p-overlay","CONTROL_WINDOW_LAYER",{trueAlpha:true}),asset("p-matte","PRESENTER_MATTE",{trueAlpha:true,workspaceReferenceProof:true}),asset("p-final","APPROVED_STATIC")],actors:[{id:"P-01-actor",assetIds:["p-overlay","p-matte"]}]},
  "M-01":{renderer:"REMOTION",renderSourceAssetId:"m-first",cameraLock:camera(sha("m-first"),sha("m-final")),assets:[asset("m-first","LOCAL_REBUILD_FRAME"),asset("m-final","APPROVED_STATIC")],actors:[{id:"M-01-actor",assetIds:["m-first"]}],externalGenerationReceipt:{contract:"A1ExternalGenerationReceipt/v1",provider:"XYQ",usageMode:"MOTION_REFERENCE_ONLY",outputSha256:sha("xyq-output"),credits:{before:892,after:872,consumed:20}},localRebuild:{status:"READY",sourceReferenceSha256:sha("xyq-output"),finalGeometryOwnedLocally:true}},
};
const visualLedger={contract:"A1CurrentVisualDecisionLedger/v1",current:true,userVisualApproval:"APPROVED",ledgerSha256:sha("ledger"),entries};
const set=compileShotMotionSpecSet({visualLedger,actionStoryboard,bindings,genres:{"N-01":"personal-narrative","T-01":"technical-tutorial","P-01":"presenter-opinion","M-01":"object-process"}});
assert.equal(assertShotMotionSpecSet(set).status,"READY");
assert.equal(set.specs.length,4);
assert.deepEqual(new Set(set.specs.map((item)=>item.genre)),new Set(["personal-narrative","technical-tutorial","presenter-opinion","object-process"]));
assert.equal(auditRenderableAgainstShotMotionSpec({shotId:"N-01",sourceAssetSha256:sha("n-first"),cameraLockSha256:set.specs[0].cameraLockSha256},set.specs[0]).status,"PASS");

const historical=structuredClone(bindings);historical["N-01"].assets[0].authorityScope="HISTORY_READ_ONLY";
assert.throws(()=>compileShotMotionSpecSet({visualLedger,actionStoryboard,bindings:historical}),/historical-asset-forbidden/);
const wrongFirst=structuredClone(bindings);wrongFirst["N-01"].cameraLock.firstFrameSha256=sha("wrong");
assert.throws(()=>compileShotMotionSpecSet({visualLedger,actionStoryboard,bindings:wrongFirst}),/first-frame-binding-mismatch/);
const directXyq=structuredClone(bindings);directXyq["M-01"].externalGenerationReceipt.usageMode="FINAL_GEOMETRY";
assert.throws(()=>compileShotMotionSpecSet({visualLedger,actionStoryboard,bindings:directXyq}),/external-generation-final-geometry-forbidden/);
const noMatte=structuredClone(bindings);noMatte["P-01"].assets=noMatte["P-01"].assets.filter((item)=>item.kind!=="PRESENTER_MATTE");
assert.throws(()=>compileShotMotionSpecSet({visualLedger,actionStoryboard,bindings:noMatte}),/presenter-matte-required/);
const wrongRenderable=auditRenderableAgainstShotMotionSpec({shotId:"N-01",sourceAssetSha256:sha("old-proof"),cameraLockSha256:set.specs[0].cameraLockSha256},set.specs[0]);
assert.equal(wrongRenderable.status,"FAIL");
assert.ok(wrongRenderable.failures.includes("render-source-not-bound-to-spec"));
console.log(JSON.stringify({status:"PASS",contract:"A1ShotMotionSpecCompilerTest/v1",genres:[...new Set(set.specs.map((item)=>item.genre))],historicalBlocked:true,wrongFirstFrameBlocked:true,directProviderGeometryBlocked:true,presenterWithoutMatteBlocked:true,renderInputBindingEnforced:true},null,2));
