import assert from 'node:assert/strict';
import {bindResearchStaticPackageV1,researchStaticSampleIsCurrentV1} from '../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs';
const sha='a'.repeat(64), ref='b'.repeat(64), states=['ENTRY','HOLD','HANDOFF'];
const plan={scope:'RESEARCH_ONLY',productionAdmission:false,projectId:'unseen',source:{videoSha256:sha},shots:[{id:'S1',tasks:[{module:'media-files',parameters:{files:[]}},{module:'remotion-render',parameters:{output:'video'}}]},{id:'S2',tasks:[]}]};
const projection={taskId:'unseen',productionAdmission:false,input:{sourceVideoSha256:sha},sequences:[{sequenceId:'S1',referenceAnchors:states.map((state,i)=>({state,sourceFrame:i+1}))}],
 artifacts:states.flatMap((state,i)=>[{id:state,path:`work/${state}.png`,sha256:sha,bytes:10,status:'VERIFIED',sha256VerifiedNow:true},{id:'r'+state,path:`work/r${state}.jpg`,sha256:ref,bytes:12,status:'VERIFIED',sha256VerifiedNow:true}]),
 candidates:[{id:'local',mediaClass:'STATIC_FRAME_SET',currentLocalCandidate:true,status:'REVIEWED',sequenceIds:['S1'],localReview:{status:'PASS',label:'local only'},coverageScope:'RESEARCH_SUBFRAGMENT',staticSamples:states.map((state,i)=>({sourceFrame:i+1,imageArtifactId:state,referenceArtifactId:'r'+state}))}]};
const run=p=>bindResearchStaticPackageV1({repoRoot:'/repo',plan,projection:p,shotId:'S1',candidateId:'local'});
assert.equal(researchStaticSampleIsCurrentV1({plan,shot:{...plan.shots[0],fullFrameRebindRequired:true},candidate:projection.candidates[0],sample:projection.candidates[0].staticSamples[0],imageSha256:sha,referenceSha256:ref}),false,'pending compositor repair invalidates static reuse');
const result=run(projection);assert.deepEqual(result.plan.shots[1],plan.shots[1]);assert.equal(plan.shots[0].tasks[0].parameters.files.length,0);
assert.equal(result.plan.shots[0].tasks[0].parameters.files.length,3);assert.equal(result.plan.shots[0].tasks[1].blocker,'REFERENCE_PACKAGE_SCENE_REBIND_REQUIRED');
assert.equal(result.binding.wholeShotApproved,false);assert.ok(result.binding.states.every(s=>s.actualPTS===null));
for(const mutate of [p=>p.candidates[0].localReview.status='VISUAL_FAIL',p=>p.candidates[0].staticSamples.pop(),p=>p.artifacts[0].sha256VerifiedNow=false,p=>p.artifacts[0].sha256=ref,p=>p.input.sourceVideoSha256=ref]){const p=structuredClone(projection);mutate(p);assert.throws(()=>run(p));}
console.log('PASS static reuse binding: exact reference/source/version; missing, failed, unverified and reference pixels rejected; stale downstream blocked');
const privatePage=structuredClone(projection);privatePage.candidates[0].blockers=['PRIVATE_DERIVED_PAGE_NOT_NATIVE_RECORDING'];
const privateBinding=run(privatePage);assert.equal(privateBinding.binding.sourceUse.class,'PRIVATE_DERIVED_RECONSTRUCTION');assert.ok(privateBinding.plan.shots[0].tasks[0].parameters.files.every(f=>f.provenance.nativePageEvidence===false));
