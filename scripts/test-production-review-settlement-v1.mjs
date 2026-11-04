import assert from 'node:assert/strict';
import {productionRevisionSettlementOnlyV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
const before={scope:'RESEARCH_ONLY',productionAdmission:false,source:{sha256:'a'.repeat(64)},shots:[{id:'unseen',exactCopy:['约2.1%'],productionRevisionRequest:{requestId:'revision',text:'Use verified closing value',status:'OPEN'},productionResources:{assets:[{sha256:'b'.repeat(64)}]}}]};
const after=structuredClone(before);after.shots[0].productionRevisionRequest.status='DESIGN_BOUND';
assert.equal(productionRevisionSettlementOnlyV1(before,after),true);
assert.equal(before.shots[0].productionRevisionRequest.status,'OPEN');
assert.equal(productionRevisionSettlementOnlyV1(before,before),false);
for(const mutate of [p=>p.shots[0].exactCopy[0]='约4.2%',p=>p.source.sha256='c'.repeat(64),p=>p.shots[0].productionResources.assets[0].sha256='c'.repeat(64),p=>p.shots[0].productionRevisionRequest.text='Different purpose',p=>p.shots[0].productionRevisionRequest.status='APPROVED',p=>p.productionAdmission=true,p=>p.shots.push({id:'additional'})]){
  const changed=structuredClone(after);mutate(changed);assert.equal(productionRevisionSettlementOnlyV1(before,changed),false);
}
console.log('PASS only OPEN to DESIGN_BOUND settlement can reuse unchanged evidence; copy, source, asset, intent, scope and approval changes require new review. No providers.');
