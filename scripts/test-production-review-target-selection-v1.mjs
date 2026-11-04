import assert from 'node:assert/strict';
import {selectProductionBatchReviewTargetsV1,selectBatchOutputReviewsV1,mergeProductionBatchReviewPartsV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
const states=['ENTRY','HOLD','HANDOFF'],inputSha256='a'.repeat(64);
const samples=states.map((state,i)=>({state,sourceFrame:i,referenceSha256:String(i+1).repeat(64),artifacts:[{kind:'IMAGE',role:'preview-'+state,sha256:String(i+4).repeat(64)}]}));
const node={id:'shot:layer-compositor',shotId:'shot',inputSha256,result:{staticStates:{samples}},acceptance:{artifacts:samples.flatMap(s=>s.artifacts)}},workflow={nodes:[node]},result={outputs:[{nodeId:node.id,shotId:'shot',inputSha256}]};
const all=selectProductionBatchReviewTargetsV1({result,workflow,phase:{shotIds:['shot']}});assert.equal(all.targetKeys.length,3);assert.equal(all.partial,false);
const reviews=[];
for(const state of states){
 const selection=selectProductionBatchReviewTargetsV1({result,workflow,phase:{shotIds:['shot'],reviewTargetKeys:['shot:'+state]}});
 assert.deepEqual(selection.targetKeys,['shot:'+state]);assert.equal(selection.partial,true);assert.equal(selection.selected[0].samples.length,1);
 // One state uses two comparison images plus two preference images, safely
 // below the existing six-image cap. No hidden truncation is needed.
 assert.equal(selection.selected[0].samples.length*2+2,4);
 const s=selection.selected[0].samples[0];reviews.push({nodeId:node.id,inputSha256,state:s.state,sourceFrame:s.sourceFrame,referenceSha256:s.referenceSha256,imageSha256:s.artifacts[0].sha256,artifactRole:s.artifacts[0].role,status:'PASS'});
 if(reviews.length<3)assert.throws(()=>selectBatchOutputReviewsV1(node,reviews),/ALL_STATE_REVIEWS_REQUIRED/);
}
assert.equal(selectBatchOutputReviewsV1(node,reviews).length,3,'earlier state passes combine only after every actual state has its own bound review');
const parts=reviews.map(item=>({reviewTargetKeys:['shot:'+item.state],items:[item]}));
assert.equal(mergeProductionBatchReviewPartsV1({parts:parts.slice(0,2),result,workflow}).complete,false);
const combined=mergeProductionBatchReviewPartsV1({parts,result,workflow});assert.equal(combined.complete,true);assert.deepEqual(combined.items,reviews);
assert.throws(()=>mergeProductionBatchReviewPartsV1({parts:[...parts,{reviewTargetKeys:['shot:ENTRY'],items:[{...reviews[0],status:'VISUAL_FAIL'}]}],result,workflow}),/PARTIAL_REVIEW_CONFLICT/);
assert.throws(()=>mergeProductionBatchReviewPartsV1({parts:[{reviewTargetKeys:['shot:HOLD'],items:[reviews[0]]}],result,workflow}),/PARTIAL_REVIEW_TARGET_UNBOUND/);
for(const phase of [{reviewTargetKeys:[]},{reviewTargetKeys:['shot:ENTRY','shot:ENTRY']},{reviewTargetKeys:['shot:MISSING']},{reviewTargetKeys:['unknown:ENTRY']},{shotIds:['other'],reviewTargetKeys:['shot:ENTRY']},{reviewShotIds:['other'],reviewTargetKeys:['shot:ENTRY']},{reviewShotIds:[],reviewTargetKeys:['shot:ENTRY']}])assert.throws(()=>selectProductionBatchReviewTargetsV1({result,workflow,phase}),/BATCH_VISUAL_REVIEW/);
console.log('PASS explicit per-state review selection from produced samples, bounded attachment count, rejected invalid/foreign/duplicate targets, and no whole-output PASS until prior and current state reviews are complete.');
