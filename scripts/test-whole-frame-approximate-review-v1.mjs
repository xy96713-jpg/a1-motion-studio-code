import assert from 'node:assert/strict';
import {bindApproximateFrameReviewV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';

const binding={state:'HOLD',imageSha256:'a'.repeat(64),referenceSha256:'b'.repeat(64),sourceFrame:50,artifactRole:'preview'};
const node={id:'unseen:layer-compositor',inputSha256:'c'.repeat(64)};
const good={state:'HOLD',copyCorrect:true,actorAndDataCorrect:true,readable:true,compositionAcceptable:true,
  findings:[],styleNotes:['Different font and shadow; slightly shifted illustration.']};
const result=bindApproximateFrameReviewV1(binding,good,node);
assert.equal(result.status,'PASS');assert.ok(result.label);assert.deepEqual(result.styleNotes,good.styleNotes);
assert.equal(result.imageSha256,binding.imageSha256);
for(const key of ['copyCorrect','actorAndDataCorrect','readable','compositionAcceptable']){
  assert.equal(bindApproximateFrameReviewV1(binding,{...good,[key]:false,findings:['Material defect']},node).status,'VISUAL_FAIL');
  assert.throws(()=>bindApproximateFrameReviewV1(binding,{...good,[key]:undefined},node),/BATCH_FRAME_REVIEW_INVALID/);
}
assert.throws(()=>bindApproximateFrameReviewV1(binding,{...good,state:'HANDOFF'},node),/BATCH_FRAME_REVIEW_INVALID/);
assert.throws(()=>bindApproximateFrameReviewV1(binding,{...good,styleNotes:null},node),/BATCH_FRAME_REVIEW_INVALID/);
assert.equal('visualApproval' in result,false);
const first=bindApproximateFrameReviewV1({...binding,reviewKey:'first:HOLD'},good,{id:'first',inputSha256:'d'.repeat(64)});
const second=bindApproximateFrameReviewV1({...binding,reviewKey:'second:HOLD',imageSha256:'e'.repeat(64)},good,{id:'second',inputSha256:'f'.repeat(64)});
assert.notEqual(first.reviewKey,second.reviewKey);assert.notEqual(first.nodeId,second.nodeId);assert.notEqual(first.imageSha256,second.imageSha256);
assert.equal(first.state,second.state,'same state names are distinguished by shot/node identity');
console.log('PASS advisory styling cannot fail an approximate frame; wrong copy, actor/data, unreadability and wrong composition still fail; state/SHA binding retained.');
