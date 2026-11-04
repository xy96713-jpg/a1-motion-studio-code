import assert from 'node:assert/strict';import {assertContinuousLayoutPolicy} from '../apps/studio-next/src/lib/a1-continuous-screen-source-mapping-v1.mjs';
const shot={motionReviewPlan:{viewerRequirements:{requireStableLayout:false}}},report={output:{sha256:'a'.repeat(64)},events:[{name:'state',outputTimeMs:100}],layoutStability:{status:'DECLARED_NATIVE_STATE_CHANGES',sourceSha256:'a'.repeat(64),events:['state']}};
assert.doesNotThrow(()=>assertContinuousLayoutPolicy([shot],report));
assert.throws(()=>assertContinuousLayoutPolicy([{motionReviewPlan:{viewerRequirements:{requireStableLayout:true}}}],report));
assert.throws(()=>assertContinuousLayoutPolicy([{}],report));
assert.throws(()=>assertContinuousLayoutPolicy([shot],{...report,events:[]}));
assert.throws(()=>assertContinuousLayoutPolicy([shot],{...report,output:{sha256:'b'.repeat(64)}}));
assert.doesNotThrow(()=>assertContinuousLayoutPolicy([{}],{layoutStability:{status:'PASS'}}));
console.log('PASS: declared native transitions require explicit viewing policy, matching source and observed events; stable-layout gates retained');
