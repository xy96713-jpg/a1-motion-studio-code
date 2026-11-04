import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {classifyHypitRetryProgressV1,retryNodeTask,claimNodeTasks,checkpointNodeTask} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {verifyHypitFailedBuildRetryClosureV1} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {createHypitCheckpointReporterV1,hypitRenderNodeAdapterV1,runHypitBuildLifecycleV1} from '../apps/studio-next/src/lib/a1-node-hypit-render-adapter-v1.mjs';
const sha='a'.repeat(64),now=Date.now();
const failed={id:'case:hypit-render',module:'hypit-render',state:'blocked',reason:'HYPIT_BUILD_FAILED',
  inputSha256:sha,input:{need:true},dependencies:[],attempt:1,maxAttempts:2,lease:null,
  progress:{contract:'A1NodeExecutionProgress/v1',provider:'hypit-local',inputSha256:sha,jobId:'bld_old',
    status:'FAILED',buildOutcome:'failed',buildClosed:true,productionAdmission:false},
  result:{state:'blocked',reason:'HYPIT_BUILD_FAILED',executionFailure:{message:'EPERM',cliFailure:{stdoutSha256:'b'.repeat(64)}}}};
const successful={id:'case:media',module:'media-files',state:'succeeded',inputSha256:'c'.repeat(64),input:{need:true},attempt:1};
const workflow={scope:'REVIEW_ONLY',productionAdmission:false,retiredClaims:[],nodes:[successful,failed],
  modules:{'hypit-render':{available:true},'media-files':{available:true}}};
const original=structuredClone(workflow);
const task=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-local-retry-'))),artifactRoot=path.join(task,'node-artifacts-v1');fs.mkdirSync(artifactRoot);
const project=path.join(artifactRoot,'hypit-render',sha,'project');
const pin=(name,body)=>{const p=path.join(task,name);fs.writeFileSync(p,JSON.stringify(body));return {path:p,sha256:createHash('sha256').update(fs.readFileSync(p)).digest('hex')};};
const executionBody={actualNativeNodeInputSHA:sha,actualOwnedNativeProjectPath:project,nativeBuildCloseConfirmed:true,runtimeDownExitCode:0,submittedBuildIds:['bld_old']};
const executionReceipt=pin('execution.json',executionBody);
const closureBody={executionReceiptPath:executionReceipt.path,executionReceiptSHA:executionReceipt.sha256,actualOwnedProjectPath:project,
  ownedProcessesClosed:true,psExitCode:0,nativeBuildCloseConfirmed:true,runtimeDownExitCode:0,remainingOwnedProcesses:[]};
const closureReceipt=pin('closure.json',closureBody),evidence={executionReceipt,closureReceipt};
const retryClosure=verifyHypitFailedBuildRetryClosureV1(failed,evidence,artifactRoot);
const queued=retryNodeTask(workflow,failed.id,{retryReason:'EXECUTION_PERMISSION_CORRECTED',retryClosure});
assert.deepEqual(workflow,original,'retry reducer leaves the previous persisted evidence untouched');
assert.deepEqual(queued.nodes[0],successful,'successful prerequisites are reused');
const target=queued.nodes[1];assert.equal(target.state,'queued');assert.equal(target.attempt,1);assert.equal(target.progress,undefined);
assert.deepEqual(target.retryHistory[0],{attempt:1,inputSha256:sha,state:failed.state,reason:failed.reason,
  progress:failed.progress,result:failed.result,retryReason:'EXECUTION_PERMISSION_CORRECTED',retryClosure});
const claimed=claimNodeTasks(queued,{workerId:'test',now,maxClaims:1});
assert.equal(claimed.claims.length,1);assert.equal(claimed.claims[0].attempt,2);
let saved=claimed.workflow;
const report=createHypitCheckpointReporterV1(claimed.claims[0],async p=>{saved=checkpointNodeTask(saved,claimed.claims[0],p,now+1);});
await report({stage:'BUILD_SUBMITTED',buildId:'bld_new'});
assert.equal(saved.nodes[1].progress.jobId,'bld_new');assert.equal(saved.nodes[1].retryHistory[0].progress.jobId,'bld_old');
assert.deepEqual(saved.nodes[1].retryHistory[0].result,failed.result);
for(const delta of [
  {status:'SUBMITTED'}, {status:'SUBMISSION_UNKNOWN'}, {status:'SUBMITTING',jobId:undefined},
  {status:'PENDING',buildOutcome:undefined}, {status:'FAILED',buildClosed:false},
  {status:'FAILED',buildClosed:undefined}, {status:'FAILED',buildOutcome:undefined},
  {status:'FAILED',buildOutcome:'unknown'}, {inputSha256:'d'.repeat(64)}, {productionAdmission:true},
]){
  const w=structuredClone(workflow);Object.assign(w.nodes[1].progress,delta);
  assert.equal(classifyHypitRetryProgressV1(w.nodes[1]),'UNKNOWN');
  assert.throws(()=>retryNodeTask(w,failed.id),/local-build-reconciliation-required/);
}
for(const delta of [{status:'COMPLETED'},{status:'PENDING',buildOutcome:'complete'}]){
  const w=structuredClone(workflow);Object.assign(w.nodes[1].progress,delta);
  assert.throws(()=>retryNodeTask(w,failed.id),/completed-build-reuse-required/);
}
let submittedCalls=0;const unknownEvents=[];
await assert.rejects(runHypitBuildLifecycleV1({runSource:'fixture.svrun',runtimeProfile:'local.json',
  invoke:async()=>{submittedCalls++;return {stdout:JSON.stringify({response:'missing parsed Build ID'})};},
  onLifecycle:event=>unknownEvents.push(event)}),/HYPIT_BUILD_ID/);
assert.equal(submittedCalls,1);assert(!unknownEvents.some(e=>e.stage==='BUILD_SUBMITTED'));
for(const progress of [undefined,{provider:'unrecognized-local-provider'}]){
  const w=structuredClone(workflow);w.nodes[1].progress=progress;w.nodes[1].reason='HYPIT_BUILD_ID_MISSING';
  assert.equal(classifyHypitRetryProgressV1(w.nodes[1]),'UNKNOWN');
  assert.throws(()=>retryNodeTask(w,failed.id),/local-build-reconciliation-required/);
}
assert.equal(submittedCalls,1,'missing submission progress must never authorize a second Build');
const cancelled=structuredClone(workflow);cancelled.nodes[1].progress.buildOutcome='cancelled';
assert.equal(retryNodeTask(cancelled,failed.id,{retryClosure}).nodes[1].state,'queued');
const exhausted=structuredClone(workflow);exhausted.nodes[1].attempt=2;
assert.throws(()=>retryNodeTask(exhausted,failed.id),/retry-not-allowed/);
assert.throws(()=>retryNodeTask(workflow,failed.id,{retryReason:''}),/retry-reason-required/);
assert.throws(()=>retryNodeTask(workflow,failed.id),/retry-closure-required/);
assert.throws(()=>retryNodeTask(workflow,failed.id,{retryClosure:{...retryClosure,jobId:'bld_other'}}),/retry-closure-required/);
for(const delta of [{remainingOwnedProcesses:[{pid:123}]},{ownedProcessesClosed:false},{psExitCode:1},
  {executionReceiptSHA:'d'.repeat(64)},{actualOwnedProjectPath:task}]){
  assert.throws(()=>verifyHypitFailedBuildRetryClosureV1(failed,{executionReceipt,closureReceipt:pin('bad-closure.json',{...closureBody,...delta})},artifactRoot),/close-not-confirmed/);
}
for(const delta of [{submittedBuildIds:['bld_other']},{actualNativeNodeInputSHA:'d'.repeat(64)},{runtimeDownExitCode:1}]){
  const badExecution=pin('bad-execution.json',{...executionBody,...delta});
  assert.throws(()=>verifyHypitFailedBuildRetryClosureV1(failed,{executionReceipt:badExecution,closureReceipt:pin('matched-bad-closure.json',
    {...closureBody,executionReceiptPath:badExecution.path,executionReceiptSHA:badExecution.sha256})},artifactRoot),/close-not-confirmed/);
}
assert.throws(()=>verifyHypitFailedBuildRetryClosureV1(failed,{...evidence,executionReceipt:{...executionReceipt,sha256:'d'.repeat(64)}},artifactRoot),/sha-mismatch/);
const linked=path.join(task,'linked-execution.json');fs.symlinkSync(executionReceipt.path,linked);
assert.throws(()=>verifyHypitFailedBuildRetryClosureV1(failed,{...evidence,executionReceipt:{...executionReceipt,path:linked}},artifactRoot),/path-invalid/);
assert.throws(()=>verifyHypitFailedBuildRetryClosureV1(failed,{...evidence,executionReceipt:{...executionReceipt,path:path.join(task,'..','outside.json')}},artifactRoot),/path-invalid/);
fs.rmSync(task,{recursive:true,force:true});
assert.equal((await hypitRenderNodeAdapterV1.execute(failed,{artifactRoot:'/tmp/not-created'})).reason,'HYPIT_SAVED_BUILD_RECONCILIATION_REQUIRED');
console.log(JSON.stringify({status:'PASS',checks:['closed-failed-explicit-retry-archives-old-job-and-error','attempt2-new-id-with-prerequisites-unchanged',
  'unknown-and-unclosed-never-resubmit','completed-never-rebuild','attempt-limit-and-old-adapter-guard-preserved'],realBuilds:0,browsers:0}));
