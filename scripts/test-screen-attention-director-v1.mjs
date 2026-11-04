#!/usr/bin/env node
import assert from "node:assert/strict";
import {directScreenAttention} from "../apps/studio-next/src/lib/a1-screen-attention-director-v1.mjs";
const hold=[{role:"RESULT_HOLD",durationMs:1200}],result={region:{x:.2,y:.2,width:.3,height:.2}},moves=[{role:"ACTION"},{role:"RESULT"}];
const selection=directScreenAttention({actionId:"causalRewrite",sourceNativeEmphasis:true,motionWindows:[{role:"ACTION"}],holdWindows:hold,resultEvidence:result});
const preference=directScreenAttention({actionId:"preference",motionWindows:moves,holdWindows:hold,resultEvidence:result});
const review=directScreenAttention({actionId:"review",motionWindows:moves,holdWindows:hold,resultEvidence:result});
const presentation=directScreenAttention({actionId:"presentation",motionWindows:[],holdWindows:hold,resultEvidence:null});
assert.equal(selection.mode,"SOURCE_NATIVE_HIGHLIGHT");assert.equal(preference.mode,"CAMERA_ACTION_RESULT_SEQUENCE");assert.equal(review.mode,"CAMERA_RESULT_HOLD");assert.equal(presentation.mode,"SOURCE_STATE_TRANSITION");assert.ok([selection,preference,review,presentation].every((item)=>item.layers.focusMask===false&&item.layers.annotation===false&&item.layers.syntheticCursor===false));
console.log(JSON.stringify({status:"PASS",contract:"A1ScreenAttentionDirectorTest/v1",modes:[selection,preference,review,presentation].map((item)=>({actionId:item.actionId,mode:item.mode,status:item.status}))},null,2));
