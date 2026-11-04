import assert from 'node:assert/strict';
import {selectProductionBatchWorkV1,productionInputIdentityV1} from '../apps/studio-next/src/lib/a1-production-batch-runner-v1.mjs';
const nodes=[{id:'a:media-files',shotId:'a',module:'media-files',state:'queued',dependencies:[]},{id:'a:layer-compositor',shotId:'a',module:'layer-compositor',state:'queued',dependencies:['a:media-files']},{id:'b:media-files',shotId:'b',module:'media-files',state:'failed',dependencies:[]},{id:'b:layer-compositor',shotId:'b',module:'layer-compositor',state:'blocked',dependencies:['b:media-files']},{id:'c:remotion-render',shotId:'c',module:'remotion-render',state:'queued',dependencies:[]}];
const selected=selectProductionBatchWorkV1({nodes},['a','b','c']);assert.deepEqual(selected.ready.map(n=>n.id),['a:media-files']);assert.equal(selected.terminal.length,2);assert.ok(!selected.nodes.some(n=>n.module==='remotion-render'));
nodes[0].state='needs-review';assert.deepEqual(selectProductionBatchWorkV1({nodes},['a']).verify.map(n=>n.id),['a:media-files']);assert.equal(selectProductionBatchWorkV1({nodes},['a']).ready.length,0);
nodes[0].state='succeeded';assert.deepEqual(selectProductionBatchWorkV1({nodes},['a']).ready.map(n=>n.id),['a:layer-compositor']);
assert.notEqual(productionInputIdentityV1({shots:[{id:'a',exactCopy:['one'],tasks:[]}]}),productionInputIdentityV1({shots:[{id:'a',exactCopy:['two'],tasks:[]}]}));
console.log('PASS dependency scheduling, failed-job isolation, technical acceptance ordering and static-only dispatch');
