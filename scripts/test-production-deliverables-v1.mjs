import assert from 'node:assert/strict';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {projectProductionDeliverablesV1} from '../apps/studio-next/src/lib/a1-production-deliverables-v1.mjs';
const node=(shotId,module,kinds)=>{
 const n={id:shotId+':'+module,shotId,module,state:'succeeded',inputSha256:nodeInputHash({shotId,module}),result:{productionAdmission:false}};
 const artifacts=kinds.map((kind,i)=>({kind,path:i+'.dat',role:String(i),sha256:'a'.repeat(64),bytes:1}));
 n.acceptance={contract:'A1NodeArtifactAcceptance/v1',nodeId:n.id,inputSha256:n.inputSha256,sourceResultSha256:nodeInputHash(n.result),visualApproval:'NOT_GRANTED',productionAdmission:false,artifacts,manifestSha256:nodeInputHash(artifacts)};return n;
};
const film={id:'film',tasks:[{module:'layer-compositor'}]},asset={id:'asset',resourceOnly:true,tasks:[{module:'image-generation'}],consumerShotIds:['film']};
const a=node('asset','image-generation',['IMAGE']),f=node('film','layer-compositor',['IMAGE','JSON_PLAN']);
const run=(plan,nodes,ids,blocked=[])=>projectProductionDeliverablesV1({plan,workflow:{nodes},shotIds:ids,compileBlocked:blocked,verifiedNodes:new Map(nodes.map(n=>[n.id,{inputSha256:n.inputSha256,manifestSha256:n.acceptance?.manifestSha256}]))});
const plan={shots:[film],assetTasks:[asset]};
const only=run(plan,[a],['asset']);assert.equal(only.status,'ASSETS_TECHNICALLY_COMPLETE_REVIEW_REQUIRED');assert.equal(only.outputs.length,0);assert.equal(only.assetOutputs.length,1);assert.equal(only.visualApproval,false);
const mixed=run(plan,[a,f],['film','asset']);assert.equal(mixed.completion.technicallyComplete,2);assert.equal(mixed.outputs.length,1);assert.equal(mixed.assetOutputs.length,1);
for(const change of [n=>n.state='skipped',n=>n.state='failed',n=>n.state='needs-review',n=>n.acceptance=null,n=>n.result=undefined,n=>n.acceptance.inputSha256='stale',n=>n.acceptance.sourceResultSha256='stale',n=>n.acceptance.artifacts=[{kind:'JSON_PLAN'}]]){
 const bad=structuredClone(a);change(bad);assert.equal(run(plan,[bad],['asset']).completion.technicallyComplete,0);
}
const multiple=structuredClone(plan);multiple.assetTasks[0].tasks.push({module:'diagram'});assert.equal(run(multiple,[a],['asset']).completion.technicallyComplete,0);
assert.equal(run(plan,[a,{id:'default:material',state:'skipped'}],['asset']).completion.technicallyComplete,1);
const blocked=run(plan,[f],['film'],['film']);assert.equal(blocked.outputs.length,0);assert.equal(blocked.retainedOutputs.length,1);
assert.equal(run(plan,[],['film']).completion.technicallyComplete,0);
console.log('PASS typed asset/shot/mixed completion, required task coverage, stale receipts, missing/incorrect outputs and retained old frames.');
