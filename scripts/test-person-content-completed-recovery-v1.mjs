import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';import {createHash} from 'node:crypto';
import {assertPersonContentCompletedRecoveryV1,personContentNativeLifecycleStateV1,readPersonContentCompletedRecoveryProofV1,verifyPersonContentCompletedRecoveryV1} from '../apps/studio-next/src/lib/a1-person-content-completed-recovery-v1.mjs';
import {resumeNodeProviderJob,retryNodeTask,claimNodeTasks,nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {personContentNodeDispositionV1,personContentNodeDeadlineV1,assertPersonContentNativeClosureV1,assertPersonContentExecutionCompatibilityV1,personContentRequestIdentityV1} from '../apps/studio-next/src/lib/a1-person-content-request-v1.mjs';
const root=process.cwd(),dir=path.join(root,'work/module-development-launch-v1/person-card-content-layout-v1/resumable-content-request-contract-v1/completed-build-recovery-delta-v1');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),fact=p=>({path:p,sha256:hash(p),bytes:fs.statSync(p).size}),read=p=>JSON.parse(fs.readFileSync(p));
const evidence=fact(path.join(dir,'NATIVE-COMPLETED-RECOVERY-EVIDENCE-v1.json')),actual=readPersonContentCompletedRecoveryProofV1(evidence);
let predicates=0;const fresh=()=>({saved:structuredClone(actual.request),node:structuredClone(actual.node),data:{failure:structuredClone(actual.values.failureReceipt),closed:structuredClone(actual.values.closedSupplement),lifecycle:structuredClone(actual.values.lifecycle),runtimeStatus:structuredClone(actual.values.runtimeStatus),priorPhase:structuredClone(actual.values.releasedPhase),priorRequest:structuredClone(actual.request),priorWorkflow:structuredClone(actual.values.workflowSnapshot)}});
const validate=f=>assertPersonContentCompletedRecoveryV1(f.saved,f.node,f.data);
assert.equal(validate(fresh()).jobId,actual.verified.jobId);predicates++;
for(const mutate of [
 f=>f.saved.status='READY',f=>f.saved.stage='STATIC_PLAN',f=>delete f.saved.intent,f=>f.saved.content.fields[0].text+=' ',
 f=>f.node.state='running',f=>f.node.attempt=2,f=>f.node.acceptance={manifestSha256:'a'.repeat(64)},f=>f.node.lease={workerId:'other'},
 f=>delete f.node.progress,f=>delete f.node.progress.jobId,f=>f.node.progress.status='SUBMISSION_UNKNOWN',f=>f.node.progress.jobId='bld_other',f=>f.node.progress.buildClosed=false,
 f=>f.node.progress.inputSha256='0'.repeat(64),f=>f.node.progress.provider='unknown',f=>f.node.progress.productionAdmission=true,
 f=>f.data.failure.killed=true,f=>f.data.failure.processes[0].exitCode=0,f=>f.data.failure.processes[0].processGroup=5,f=>f.data.failure.remainingOwnedProcesses=[{pid:1}],
 f=>f.data.priorPhase.status='ACTIVE',f=>f.data.priorPhase.executionAuthorized=true,f=>f.data.priorPhase.actualExecutionReceiptSHA='0'.repeat(64),f=>f.data.priorPhase.ownedProcessesClosed=false,
 f=>f.data.closed.phaseSha256='0'.repeat(64),f=>f.data.closed.buildId='bld_other',f=>f.data.closed.alphaCreated=true,f=>f.data.closed.getCalled=true,
 f=>f.data.closed.runtimeWorkerRecordPresent=true,f=>f.data.closed.supplementalFormalPs.psExitCode=1,f=>f.data.closed.supplementalFormalPs.ownerPidAndGroupAbsent=false,
 f=>f.data.closed.supplementalFormalPs.workerLogPidsAbsent=false,f=>f.data.closed.supplementalFormalPs.matchingRows=[{pid:1}],
 f=>f.data.runtimeStatus.exitCode=1,f=>f.data.runtimeStatus.body.worker.state='running',f=>f.data.runtimeStatus.body.capacity.active=1,f=>f.data.runtimeStatus.body.builds.savingResult=1,
 f=>f.data.lifecycle.events.push({stage:'ALPHA_STUDIO_CREATED'}),f=>f.data.lifecycle.events.push({stage:'PREVIEW_READY'}),
 f=>f.data.lifecycle.events.push({stage:'CLI_STARTED',commandStage:'get bld_other'}),f=>f.data.lifecycle.events.push({stage:'BUILD_SUBMITTED',buildId:actual.verified.jobId}),
 f=>f.data.lifecycle.events.find(e=>e.stage==='BUILD_CANCEL_CLOSE').status.build.work.outcome='failed',
 f=>f.data.lifecycle.events.find(e=>e.stage==='BUILD_CANCEL_CLOSE').status.build.result.state='cancelled',
 f=>f.data.priorWorkflow.nodes.find(n=>n.module==='media-files'&&n.shotId===f.saved.content.id).state='blocked',f=>f.saved.reviews.STATIC_ACCEPTED.status='FAIL'
]){const f=fresh();mutate(f);assert.throws(()=>validate(f),/CONTENT_COMPLETED/);predicates++;}
assert.equal(personContentNativeLifecycleStateV1([]),'NEVER_STARTED');
assert.equal(personContentNativeLifecycleStateV1([{stage:'ALPHA_BROWSER_CREATED'}]),'UNPROVED');
assert.equal(personContentNativeLifecycleStateV1([{stage:'ALPHA_BROWSER_CREATED'},{stage:'ALPHA_CLOSED',browserClosed:true,studioClosed:true,encoderClosed:true}]),'CLOSED');
assert.throws(()=>assertPersonContentNativeClosureV1(actual.node,{nodeId:actual.node.id,inputSha256:actual.node.inputSha256,alpha:null,ownedProcessesClosed:true,runtimeDownExitCode:0,observedOwnedPids:[]}),/CONTENT_NATIVE_CLOSURE/);predicates+=4;
assert.throws(()=>readPersonContentCompletedRecoveryProofV1({...evidence,sha256:'0'.repeat(64)}),/FACT_CHANGED/);predicates++;
// No independent PASS is fabricated for the production proof.
assert.throws(()=>verifyPersonContentCompletedRecoveryV1({runtime:{},saved:actual.request,evidenceFact:evidence,reviewFact:null,implementations:{}}),/REVIEW_PATH/);predicates++;

let reducers=0;const workflow=structuredClone(actual.values.workflowSnapshot),id=actual.node.id;
assert.throws(()=>resumeNodeProviderJob(workflow,id),/resume-not-allowed/);reducers++;
assert.throws(()=>retryNodeTask(workflow,id),/local-build-reconciliation-required/);reducers++;
const descriptor={contract:'A1VerifiedCompletedHypitResume/v1',nodeId:id,inputSha256:actual.node.inputSha256,jobId:actual.verified.jobId,previewSha256:'a'.repeat(64),lifecycleSha256:'b'.repeat(64),closureSha256:'c'.repeat(64),completed:true,ownedClosed:true};
const resumed=resumeNodeProviderJob(workflow,id,{completedResume:descriptor});assert.equal(resumed.nodes.find(n=>n.id===id).attempt,1);assert.deepEqual(resumed.nodes.find(n=>n.id===id).progress,actual.node.progress);reducers++;
const claimed=claimNodeTasks(resumed,{workerId:'SYNTHETIC_NO_EXECUTION',allowedNodeIds:[id],maxClaims:1});assert.equal(claimed.claims.length,1);assert.equal(claimed.claims[0].attempt,1);assert.equal(claimed.claims[0].progress.jobId,actual.verified.jobId);reducers++;
for(const mutate of [d=>d.jobId='bld_other',d=>d.inputSha256='0'.repeat(64),d=>d.nodeId='other',d=>d.completed=false,d=>d.ownedClosed=false,d=>delete d.closureSha256,d=>d.previewSha256='bad']){const d=structuredClone(descriptor);mutate(d);assert.throws(()=>resumeNodeProviderJob(workflow,id,{completedResume:d}),/resume-not-allowed/);reducers++;}

// Exact driver code; external commands and node actions are stubs, in /tmp only.
const source=fs.readFileSync('apps/studio-next/src/lib/a1-person-content-request-v1.mjs','utf8');
const section=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);};
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-completed-recovery-'))),must=(v,m)=>{if(!v)throw Error(m);};
function getFixture(change=()=>{}){
 const base=fs.mkdtempSync(path.join(temp,'get-')),out=path.join(base,'hypit-render',actual.node.inputSha256),project=path.join(out,'project');fs.mkdirSync(project,{recursive:true});
 const r={dir:base,s:{requestSha256:actual.request.requestSha256}},runtime={artifactRoot:base,taskRoot:base},calls=[],events=[];
 const permit={phaseSha256:'d'.repeat(64),deadlineMs:Date.now()+50000,nativeCloseReserveMs:10000,minimumWorkMs:1000,nativeCompletedRecovery:{...actual,evidenceFact:evidence,reviewFact:{path:'SYNTHETIC_REVIEW_NOT_PRODUCTION',sha256:'a'.repeat(64)}}};
 const status={build:{id:actual.verified.jobId,work:{state:'done',outcome:'complete'},result:{state:'complete'}}};
 const ctx={fs,path,process:{execPath:'FIXTURE_NODE',pid:1},must,hashFile:hash,jsonBytes:o=>JSON.stringify(o),personContentNodeDeadlineV1,
  writeExact:(_root,p,b)=>{fs.writeFileSync(p,b,{flag:'wx'});return fact(p);},
  execute:async(file,args)=>{calls.push({file,args});if(args[1]==='status')return {stdout:JSON.stringify(status)};if(args[1]==='get'){fs.writeFileSync(args.at(-1),'synthetic preview bytes only');return {};}
   assert.equal(file,'FIXTURE_FFMPEG');assert.ok(args.includes('copy')&&args.includes('-an')&&args.includes('-n'));fs.copyFileSync(args[args.indexOf('-i')+1],args.at(-1));return {};}};
 const fixture={base,out,project,r,runtime,calls,events,permit,status,ctx};change(fixture);vm.createContext(ctx);vm.runInContext(section('async function getCompletedBuildRecovery(','async function driveNodes('),ctx);
 fixture.run=()=>ctx.getCompletedBuildRecovery(runtime,r,actual.node,{cli:'FIXTURE_CLI',base:{runtimeProfileRelative:'workers1.json'},tools:{ffmpegPath:'FIXTURE_FFMPEG'}},permit,events);return fixture;
}
let getChecks=0;const get=getFixture(),recovery=await get.run();assert.equal(recovery.buildId,actual.verified.jobId);assert.equal(get.calls.length,3);assert.equal(get.calls.filter(c=>c.args.includes('build')).length,0);assert.equal(get.events[0].status.build.id,actual.verified.jobId);getChecks++;
await assert.rejects(()=>get.run(),/GET_ALREADY_ATTEMPTED/);assert.equal(get.calls.length,3);getChecks++;
for(const change of [f=>f.status.build.id='bld_other',f=>f.status.build.work.outcome='failed',f=>f.status.build.result.state='incomplete',f=>f.status.build.work.state='working']){const f=getFixture(change);await assert.rejects(f.run,/SAVED_JOB_NOT_COMPLETE_NOW/);assert.equal(f.calls.length,1);getChecks++;}
const partial=getFixture(f=>fs.writeFileSync(path.join(f.out,'hypit-preview-'+actual.verified.jobId+'.mp4'),'partial unknown'));await assert.rejects(partial.run,/PARTIAL_OR_ALREADY_PRESENT/);assert.equal(partial.calls.length,1);getChecks++;
const failGet=getFixture(f=>{const prior=f.ctx.execute;f.ctx.execute=async(file,args)=>{if(args[1]==='get'){f.calls.push({file,args});throw Error('SYNTHETIC_GET_UNKNOWN');}return prior(file,args);};});await assert.rejects(failGet.run,/GET_UNKNOWN/);await assert.rejects(failGet.run,/GET_ALREADY_ATTEMPTED/);assert.equal(failGet.calls.length,2);getChecks++;

function closeFixture(events,body){
 const base=fs.mkdtempSync(path.join(temp,'close-')),project=path.join(base,'hypit-render',actual.node.inputSha256,'project');fs.mkdirSync(project,{recursive:true});const calls=[];
 const ctx={fs,path,process:{execPath:'FIXTURE_NODE'},must,personContentNativeLifecycleStateV1,read,checkedPath:(_r,p)=>p,closedPid:()=>true,
  execute:async(_file,args)=>{calls.push(args);return {stdout:args[2]==='status'?JSON.stringify(body):''};}};
 vm.createContext(ctx);vm.runInContext(section('async function closeNative(','async function getCompletedBuildRecovery('),ctx);
 return {calls,run:()=>ctx.closeNative({taskRoot:base,artifactRoot:base},actual.node,{cli:'FIXTURE_CLI',base:{runtimeProfileRelative:'workers1.json'}},events,Date.now()+50000)};
}
let closeChecks=0;const stopped={worker:{state:'stopped'},capacity:{active:0},builds:{submitting:0,working:0,savingResult:0}};
const c=await closeFixture([],stopped).run();assert.equal(c.alphaLifecycleState,'NEVER_STARTED');assert.equal(c.alpha,null);assert.equal(c.nativeArtifactsAccepted,false);assert.equal(c.ownedProcessesClosed,true);closeChecks++;
for(const change of [b=>b.worker.state='running',b=>b.capacity.active=1,b=>b.builds.working=1]){const b=structuredClone(stopped);change(b);await assert.rejects(closeFixture([],b).run,/CLOSE_UNPROVED/);closeChecks++;}
await assert.rejects(closeFixture([{stage:'ALPHA_STUDIO_CREATED'}],stopped).run,/CLOSURE_UNPROVED/);closeChecks++;

function driverFixture(permit){
 const base=fs.mkdtempSync(path.join(temp,'driver-')),node=structuredClone(actual.node),runtime={taskRoot:base,workflow:{nodes:[node]},inputPlanSha256:'1'.repeat(64)},r={dir:base,s:structuredClone(actual.request)},calls=[];
 const ctx={fs,path,process:{pid:2},root:base,must,personContentNodeDispositionV1,personContentNodeDeadlineV1,
  save:(_rt,r,patch)=>Object.assign(r.s,patch),claimPhase:()=>{calls.push('claim');return true;},jsonBytes:JSON.stringify,
  writeExact:(_root,p,b)=>{fs.writeFileSync(p,b,{flag:'wx'});return fact(p);},
  getCompletedBuildRecovery:async()=>{calls.push('get-existing');return {buildId:actual.verified.jobId};},
  closeNative:async()=>({alpha:{browserClosed:true,studioClosed:true,encoderClosed:true},ownedProcessesClosed:true}),assertPersonContentNativeClosureV1:()=>{},
  recheckFact:()=>{},revalidateNodeArtifacts:async()=>{calls.push('revalidate');},
  api:async()=>({readShotTaskRuntimeV1:()=>runtime,runShotTaskActionV1:async action=>{calls.push(action.action);assert.equal(action.action,'resume');assert.equal(action.completedBuildRecovery.buildId,actual.verified.jobId);node.state='succeeded';node.acceptance={manifestSha256:'2'.repeat(64)};return runtime;}})};
 vm.createContext(ctx);vm.runInContext(section('async function driveNodes(','function stageReviewPassed('),ctx);return {calls,r,run:()=>ctx.driveNodes(runtime,r,[node.id],permit,{})};
}
let driverChecks=0;const without=driverFixture(null);assert.equal(await without.run(),false);assert.deepEqual(without.calls,[]);assert.ok(without.r.s.intent);driverChecks++;
const withProof=driverFixture({phaseSha256:'d'.repeat(64),deadlineMs:Date.now()+50000,nativeCloseReserveMs:10000,minimumWorkMs:1000,nativeCompletedRecovery:{verified:actual.verified}});assert.equal(await withProof.run(),true);assert.deepEqual(withProof.calls,['claim','get-existing','resume','revalidate']);assert.equal(withProof.r.s.intent,null);driverChecks++;
// Read the real older reviewed history with the exact new compatibility code.
// This does not grant the still-pending independent review of the new delta.
const here=path.join(root,'apps/studio-next/src/lib'),implementations=Object.fromEntries(Object.keys(actual.request.executionImplementationIdentity).map(n=>[n,hash(path.join(here,n))])),identity=personContentRequestIdentityV1(actual.request.taskId,actual.request.content,actual.request.motion,actual.request.profileIdentity,implementations);
const compatibilityContext={fs,path,root,here,OWNER:'01a0f62b-b9b1-7576-a95f-804f688620a0',must,nodeInputHash,assertPersonContentExecutionCompatibilityV1,hashFile:hash,read};vm.createContext(compatibilityContext);
vm.runInContext(section('function checkedPath(','/** Pure public admission.'),compatibilityContext);
vm.runInContext(section('function verifiedPreclaimReview(','/** All native recovery admission reads'),compatibilityContext);
compatibilityContext.revalidateExecutionCompatibility({taskRoot:path.join(root,'work/person-card-content-layout-static-two-input-v1')},{s:actual.request},identity,{identity:actual.request.profileIdentity,implementations},actual);
let compatibilityChecks=1;const badArchive=structuredClone(actual);badArchive.proof.files.runtimeBefore.sha256='0'.repeat(64);
assert.throws(()=>compatibilityContext.revalidateExecutionCompatibility({taskRoot:path.join(root,'work/person-card-content-layout-static-two-input-v1')},{s:actual.request},identity,{identity:actual.request.profileIdentity,implementations},badArchive),/PRIOR_GUARD_CHANGED/);compatibilityChecks++;
console.log(JSON.stringify({status:'PASS_COMPLETED_BUILD_RECOVERY_PURE',predicates,reducers,getChecks,closeChecks,driverChecks,compatibilityChecks,total:predicates+reducers+getChecks+closeChecks+driverChecks+compatibilityChecks,actualProof:'READ_ONLY_V30_COMPLETED_AND_CLOSED',externalCommands:'STUBBED_IN_TEMP_ONLY',realClaims:0,newBuilds:0,newEncodes:0,newDecodes:0,newBrowsers:0,productionRequestWrites:0}));
