import assert from 'node:assert/strict';
import {createHypitCheckpointReporterV1,runHypitBuildLifecycleV1,hypitRenderNodeAdapterV1,verifyHypitCompletedBuildRecoveryV1} from '../apps/studio-next/src/lib/a1-node-hypit-render-adapter-v1.mjs';
import {executeRegisteredNode} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {claimNodeTasks} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {runNodeWorkflowTick} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
const sha='a'.repeat(64),id='bld_fixture_001',saved=[];
const report=createHypitCheckpointReporterV1({inputSha256:sha},async progress=>{
  await Promise.resolve();saved.push(structuredClone(progress));
});
await runHypitBuildLifecycleV1({runSource:'fixture.svrun',runtimeProfile:'local.json',onLifecycle:report,
  invoke:async args=>{
    if(args[0]==='status')assert.equal(saved[0].jobId,id,'Build ID persists before the first status call');
    return {stdout:JSON.stringify({build:{id,work:{outcome:'complete'}}})};
  }});
assert.equal(saved.at(-1).buildOutcome,'complete');assert.equal(saved.at(-1).status,'PENDING');
await report({stage:'PREVIEW_READY',buildId:id,previewPath:'/tmp/test-existing-preview.mp4',previewSha256:sha});
assert.equal(saved.at(-1).previewSha256,sha);
const beforeMismatch=saved.length;
await assert.rejects(report({stage:'PREVIEW_READY',buildId:'bld_other',previewPath:'/tmp/other',previewSha256:sha}),/CHECKPOINT_BUILD_ID_MISMATCH/);
assert.equal(saved.length,beforeMismatch);
assert.throws(()=>verifyHypitCompletedBuildRecoveryV1({buildId:'bld_other'},{inputSha256:sha,progress:saved.at(-1)},'/tmp/no-read'),/RECOVERY_JOB_ID_MISMATCH/);
await report({stage:'OUTPUT_READY',buildId:id,receiptPath:'/tmp/test-receipt.json',receiptSha256:sha});
assert.equal(saved.at(-1).status,'COMPLETED','finished local output must release the scheduler pending-job capacity');
const blocked=await hypitRenderNodeAdapterV1.execute({progress:saved.at(-1)},{artifactRoot:'/tmp/not-created'});
assert.equal(blocked.reason,'HYPIT_SAVED_BUILD_RECONCILIATION_REQUIRED');
const now=Date.now(),claim={id:'fixture:context',module:'fixture',inputSha256:sha,
  input:{moduleVersion:1,implementationSha256:sha,need:true},dependencies:[],state:'running',
  lease:{workerId:'test',token:'context-token',expiresAt:now+10_000}};
const workflow={scope:'REVIEW_ONLY',productionAdmission:false,nodes:[claim],modules:{fixture:{available:true}}};
const recovery={contract:'fixture-test-does-not-authorize-execution'},deadline=now+5000,onLifecycle=()=>{};
let observed;
await executeRegisteredNode(workflow,claim,{now,artifactRoot:'/tmp/not-created',executionDeadlineMs:deadline,
  completedBuildRecovery:recovery,onLifecycle,registry:{fixture:{available:true,version:1,implementationSha256:sha,
    execute:async(node,context)=>{observed=context;return {state:'blocked',productionAdmission:false};}}}});
assert.equal(observed.executionDeadlineMs,deadline);assert.equal(observed.completedBuildRecovery,recovery);assert.equal(observed.onLifecycle,onLifecycle);
await assert.rejects(runNodeWorkflowTick('/tmp/not-read',{executionDeadlineMs:Date.now()-1}),/deadline-expired/);
const queued={...claim,state:'queued',lease:null,attempt:0,maxAttempts:2};
const two={...workflow,nodes:[queued,{...queued,id:'fixture:second'}]};
assert.equal(claimNodeTasks(two,{workerId:'test',now,maxClaims:1}).claims.length,1);
assert.equal(claimNodeTasks(two,{workerId:'test',now}).claims.length,2);
assert.throws(()=>claimNodeTasks(two,{workerId:'test',now,maxClaims:3}),/invalid-dispatch-claim-limit/);
console.log(JSON.stringify({status:'PASS',checks:['incumbent-context-forwards-deadline-lifecycle-recovery',
  'durable-build-id-before-poll','complete-build-and-preview-checkpoint','saved-build-blocks-blind-resubmission'],
  realBuilds:0,browsers:0,automaticRecoveryProved:false}));
