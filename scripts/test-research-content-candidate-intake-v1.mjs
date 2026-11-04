import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {resolvePersonContentDeliveryV1,admitPersonContentCandidateV1} from '../apps/studio-next/src/lib/a1-research-content-candidate-intake-v1.mjs';
const target='hupo-69-shot-reconstruction-v1';let checks=0;
for(const task of [target,'person-card-content-layout-static-two-input-v1']){assert.equal(resolvePersonContentDeliveryV1(task).targetTaskId,target);checks++;}
assert.throws(()=>resolvePersonContentDeliveryV1('other-registered'),/UNSUPPORTED_TASK/);checks++;
const old={id:'preserved'},registry={contract:'A1ReferenceCandidateRegistry/v1',scope:'RESEARCH_ONLY',productionAdmission:false,entries:[old],supportingArtifacts:[{path:'preserved'}]},entry={id:'person-content-'+'a'.repeat(64),coverageScope:'RESEARCH_SUBFRAGMENT',visualApproval:false,video:{sha256:'b'.repeat(64)},review:{sha256:'c'.repeat(64)},inputs:[{name:'fixture-only'}]};
const first=admitPersonContentCandidateV1(registry,entry);assert.equal(first.reused,false);assert.deepEqual(first.registry.entries[0],old);assert.deepEqual(first.registry.supportingArtifacts,registry.supportingArtifacts);checks++;
const repeat=admitPersonContentCandidateV1(first.registry,entry);assert.equal(repeat.reused,true);assert.equal(repeat.registry,first.registry);checks++;
assert.throws(()=>admitPersonContentCandidateV1(first.registry,{...entry,video:{sha256:'d'.repeat(64)}}),/ID_CONFLICT/);checks++;
for(const mutate of [r=>r.productionAdmission=true,r=>r.scope='PRODUCTION',r=>r.contract='other']){const r=structuredClone(registry);mutate(r);assert.throws(()=>admitPersonContentCandidateV1(r,entry),/REGISTRY_INVALID/);checks++;}
assert.equal(admitPersonContentCandidateV1(first.registry,entry).registry.entries.length,2);checks++;
console.log(JSON.stringify({status:'PASS_PURE_DELIVERY_REGISTRY_IDEMPOTENCE_CONFLICT',checks,proofScope:'skeleton registry only; actual intake/native/pixels NOT_RUN',runtimeClaims:0,registryWrites:0}));

const projection='work/hupo-69-shot-reconstruction-v1/research-task-manifest-v1.json',before=fs.readFileSync(projection);
const module=await import('../work/hupo-69-shot-reconstruction-v1/build-research-task-manifest-v1.mjs');assert.equal(typeof module.buildHuBoResearchTaskManifestV1,'function');assert.equal(createHash('sha256').update(fs.readFileSync(projection)).digest('hex'),createHash('sha256').update(before).digest('hex'));
console.log(JSON.stringify({status:'PASS_IMPORT_SAFE_EXISTING_BUILDER',projectionWrites:0}));
