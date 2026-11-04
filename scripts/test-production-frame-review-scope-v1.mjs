import assert from 'node:assert/strict';
import {partitionProductionFrameReviewV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';

// The real failure pattern: repairing HOLD accidentally dispatched the native
// HANDOFF failure to a generated-frame repairer with no matching request.
const items=[
  {shotId:'product',state:'HANDOFF',status:'VISUAL_FAIL'},
  {shotId:'product',state:'ENTRY',status:'PASS'},
  {shotId:'product',state:'HOLD',status:'PASS'},
];
const result=partitionProductionFrameReviewV1(items,['product:HOLD']);
assert.deepEqual(result.failed,[]);
assert.deepEqual(result.adjacentFindings,[items[0]]);
assert.deepEqual(result.reviewedTargets,['product:HOLD']);
const changed=items.map(i=>i.state==='HOLD'?{...i,status:'VISUAL_FAIL'}:i);
assert.deepEqual(partitionProductionFrameReviewV1(changed,['product:HOLD']).failed,[changed[2]]);
assert.throws(()=>partitionProductionFrameReviewV1(items,['missing:HOLD']),/TARGET_NOT_REVIEWED/);
assert.throws(()=>partitionProductionFrameReviewV1(items,['product:HOLD','product:HOLD']),/TARGETS_INVALID/);
assert.throws(()=>partitionProductionFrameReviewV1([...items,items[2]],['product:HOLD']),/DUPLICATE_REVIEW/);
console.log('PASS scoped failures drive repair; adjacent failures stay visible and cannot hijack dispatch.');
