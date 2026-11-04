import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {assertPersonContentEnvelopeV1,personContentRequestIdentityV1,assertPersonContentRequestReuseV1,assertPersonContentReviewV1,personContentNodeDispositionV1,personContentPhaseBudgetV1,personContentNodeDeadlineV1,assertPersonContentPreclaimRecoveryV1,assertPersonContentExecutionCompatibilityV1,assertPersonContentNativeClosureV1,assertPersonContentPlanIntentV1,runPersonContentRequestV1} from '../apps/studio-next/src/lib/a1-person-content-request-v1.mjs';
const taskId='person-card-content-layout-static-two-input-v1';
const source=JSON.parse(fs.readFileSync('work/person-card-content-layout-static-two-input-v1/authority/pan-content-preparation-v2.json')).sourceInput;
const content={...structuredClone(source),id:'unseen-control-fixture'},motion={id:content.id,personId:'pan',fps:25,frameCount:200,startFrame:11,endFrameExclusive:167,entrance:{kind:'wipe',frames:23,direction:'right',easing:'ease-in-out'}};
let checks=0;const rejected=(fn,regex)=>{assert.throws(fn,regex);checks++;};
assert.equal(assertPersonContentEnvelopeV1(taskId,content,motion).motion.backgroundColor,'#f5f4ef');checks++;
rejected(()=>assertPersonContentEnvelopeV1('registered-but-unmapped',content,motion),/UNSUPPORTED_TASK/);
for(const mutate of [x=>x.canvas.width=961,x=>x.canvas.width=2162,x=>x.canvas.height=642,x=>x.canvas.width=638]){
 const c=structuredClone(content);mutate(c);if(c.canvas.width/c.canvas.height>=.5&&c.canvas.width/c.canvas.height<=2&&c.canvas.width%2===0&&c.canvas.width>=640&&c.canvas.width<=2160)continue;
 rejected(()=>assertPersonContentEnvelopeV1(taskId,c,motion),/CANVAS/);
}
for(const mutate of [m=>m.frameCount=3601,m=>m.fps=0,m=>m.id='wrong',m=>m.endFrameExclusive=201,m=>m.entrance.frames=156,m=>m.entrance.direction='diagonal',m=>m.entrance.easing='custom',m=>m.backgroundColor='#000000',m=>m.stopAt='COMPLETE']){const m=structuredClone(motion);mutate(m);rejected(()=>assertPersonContentEnvelopeV1(taskId,content,m),/CONTENT_/);}
const profile={approved:'fixture-only'},impl={implementation:'fixture-only'},a={taskId,...personContentRequestIdentityV1(taskId,content,motion,profile,impl)};
assertPersonContentRequestReuseV1(a,{...a});checks++;
for(const change of [c=>c.fields.at(-1).text+=' ',c=>c.photo.sha256='0'.repeat(64)]){const c=structuredClone(content);change(c);const b={taskId,...personContentRequestIdentityV1(taskId,c,motion,profile,impl)};rejected(()=>assertPersonContentRequestReuseV1(a,b),/CONFLICT/);}
rejected(()=>assertPersonContentRequestReuseV1(a,{taskId,...personContentRequestIdentityV1(taskId,content,motion,profile,{newImplementation:true})}),/CONFLICT/);
assert.equal(personContentNodeDispositionV1({module:'hypit-render',state:'queued',attempt:0}), 'EXECUTE');checks++;
for(const [node,intent] of [[{state:'running'},null],[{module:'hypit-render',state:'failed',attempt:1},null],[{module:'hypit-render',state:'failed',progress:{provider:'hypit-local',status:'SUBMISSION_UNKNOWN'}},null],[{module:'hypit-render',state:'queued',attempt:0},{kind:'attempted-submit'}],[{module:'hypit-render',state:'blocked',progress:{provider:'hypit-local',status:'SUBMITTED'}},null]]){assert.equal(personContentNodeDispositionV1(node,intent),'UNKNOWN');checks++;}
assert.equal(personContentNodeDispositionV1({state:'succeeded'}),'REVALIDATE');checks++;
const expected={requestSha256:a.requestSha256,stage:'EXPORT_VERIFIED',nodeId:'native',inputSha256:'a'.repeat(64),manifestSha256:'b'.repeat(64),exportBindingSha256:'c'.repeat(64),exportReceiptSha256:'d'.repeat(64),executedBy:'worker',artifacts:[{path:'/fixture/video.mp4',sha256:'e'.repeat(64)},{path:'/fixture/frame.png',sha256:'f'.repeat(64)}]};
const review={requestSha256:a.requestSha256,reviewStage:'EXPORT_VERIFIED',reviewBindingSha256:nodeInputHash(expected),reviewerId:'independent',status:'PASS',findings:[],reviewedArtifactSha256:expected.artifacts.map(a=>a.sha256)};
assertPersonContentReviewV1(expected,review,'worker');checks++;
for(const mutate of [r=>r.requestSha256='0'.repeat(64),r=>r.reviewStage='STATIC_ACCEPTED',r=>r.reviewBindingSha256='0'.repeat(64),r=>r.reviewedArtifactSha256.pop(),r=>r.reviewedArtifactSha256[0]='0'.repeat(64),r=>r.reviewerId='worker',r=>r.status='FAIL']){const r=structuredClone(review);mutate(r);rejected(()=>assertPersonContentReviewV1(expected,r,'worker'),/CONTENT_/);}
const closedNode={id:'native',inputSha256:'1'.repeat(64)},closure={nodeId:'native',inputSha256:closedNode.inputSha256,ownedProcessesClosed:true,runtimeDownExitCode:0,alpha:{browserClosed:true,studioClosed:true,encoderClosed:true},observedOwnedPids:[]};
assertPersonContentNativeClosureV1(closedNode,closure);checks++;
for(const mutate of [c=>c.inputSha256='0'.repeat(64),c=>c.ownedProcessesClosed=false,c=>c.runtimeDownExitCode=1,c=>c.alpha.browserClosed=false,c=>delete c.alpha,c=>delete c.observedOwnedPids]){const c=structuredClone(closure);mutate(c);rejected(()=>assertPersonContentNativeClosureV1(closedNode,c),/CLOSURE/);}
const pendingPlan={projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,shots:[]},planIntentRequest={taskId,planIntent:{planSha256:nodeInputHash(pendingPlan),workspaceSha256:'1'.repeat(64)}};
assertPersonContentPlanIntentV1(planIntentRequest,pendingPlan,'1'.repeat(64));checks++;
for(const [r,p,w] of [[{taskId},pendingPlan,'1'.repeat(64)],[planIntentRequest,{...pendingPlan,shots:[{}]},'1'.repeat(64)],[planIntentRequest,pendingPlan,'0'.repeat(64)],[{...planIntentRequest,taskId:'other'},pendingPlan,'1'.repeat(64)]])rejected(()=>assertPersonContentPlanIntentV1(r,p,w),/PENDING_PLAN/);
const badPhoto=structuredClone(content);badPhoto.photo.path='/not-approved/no-read';badPhoto.photo.sha256='0'.repeat(64);
const {readShotTaskRuntimeV1}=await import('../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs');
const current=readShotTaskRuntimeV1({repoRoot:process.cwd(),taskId});
await assert.rejects(()=>runPersonContentRequestV1({repoRoot:process.cwd(),taskId,expectedPlanSha256:current.inputPlanSha256,content:badPhoto,motion}),/PHOTO_BINDING|Unknown photo|INVALID_INPUT/);checks++;
assert.equal(fs.existsSync('work/'+taskId+'/content-packaging-requests-v1/'+a.requestSha256),false);
console.log(JSON.stringify({status:'PASS_PURE_REQUEST_IDENTITY_ADMISSION_UNKNOWN_REVIEW',checks,fixtureNativeAcceptance:'SKELETON_ONLY_NOT_ACTUAL',runtimeClaims:0,newBuilds:0,newEncodes:0,requestWrites:0}));

// Exercise the exact private driver/reconciliation code with external effects
// stubbed. These byte fixtures are not native artifacts or decoded PNG proof.
const implementation=fs.readFileSync('apps/studio-next/src/lib/a1-person-content-request-v1.mjs','utf8');
const previous=fs.readFileSync('work/module-development-launch-v1/person-card-content-layout-v1/resumable-content-request-contract-v1/crash-window-delta-v2/a1-person-content-request-v1.mjs.before','utf8');
const fixtureRoot=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-request-crash-fixture-')));
const section=(source,start,end)=>{const first=source.indexOf(start),last=source.indexOf(end,first);assert.ok(first>=0&&last>first);return source.slice(first,last);};
const digest=filename=>createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const native={id:'fixture-native:hypit-render',module:'hypit-render',state:'succeeded',inputSha256:'1'.repeat(64),acceptance:{manifestSha256:'2'.repeat(64)},input:{parameters:{request:{personCardScene:{config:{qa:{sampleFrames:[0,4,9]}}}}}}};
let crashChecks=0;
function context(dir,node,request){
 const effects={claims:0,ticks:0,verifies:0,revalidations:0,saves:0,encodes:0,decodes:0};
 const runtime={taskRoot:dir,workflow:{nodes:[node]},inputPlanSha256:'3'.repeat(64)},r={dir,s:request};
 const ctx={fs,path,process:{pid:99999999},root:dir,nodeInputHash,hashFile:digest,jsonBytes:o=>Buffer.from(JSON.stringify(o,null,2)+'\n'),read:f=>JSON.parse(fs.readFileSync(f,'utf8')),
  must:(v,m)=>{if(!v)throw Error(m);},assertPersonContentNativeClosureV1,personContentNodeDispositionV1,personContentNodeDeadlineV1,
  sharp:()=>({metadata:async()=>({format:'png',width:720,height:960})}),compileHypitPersonCardSceneV1:config=>config,
  save:(_runtime,current,patch)=>{effects.saves++;Object.assign(current.s,patch);},
  claimPhase:()=>{effects.claims++;return true;},execute:async()=>{effects.decodes++;throw Error('FIXTURE_EXTERNAL_EXEC_FORBIDDEN');},
  revalidateNodeArtifacts:async n=>{effects.revalidations++;assert.equal(n.state,'succeeded');assert.equal(n.acceptance.manifestSha256,'2'.repeat(64),'FIXTURE_MANIFEST_REVALIDATION_FAILED');},
  api:async()=>({readShotTaskRuntimeV1:()=>runtime,runShotTaskActionV1:async action=>{if(action.action==='tick')effects.ticks++;else effects.verifies++;throw Error('FIXTURE_NODE_ACTION_FORBIDDEN');}})};
 vm.createContext(ctx);
 vm.runInContext(section(implementation,'function checkedPath(','/** Pure public admission.'),ctx);
 return {ctx,effects,r,runtime};
}
function nativeFixture(){
 const dir=fs.mkdtempSync(path.join(fixtureRoot,'native-'));
 const filename=path.join(dir,'closure.json');fs.writeFileSync(filename,JSON.stringify({...closure,nodeId:native.id,inputSha256:native.inputSha256}));
 return context(dir,structuredClone(native),{taskId:'fixture',stage:'NATIVE_PLAN',status:'UNKNOWN',intent:{nodeId:native.id,inputSha256:native.inputSha256,pid:99999999},nativeClosure:{path:filename,bytes:fs.statSync(filename).size,sha256:digest(filename)}});
}
async function drive(f,source=implementation){vm.runInContext(section(source,'async function driveNodes(','function stageReviewPassed('),f.ctx);return f.ctx.driveNodes(f.runtime,f.r,[native.id],null,{});}
const oldNative=nativeFixture();assert.equal(await drive(oldNative,previous),true);assert.ok(oldNative.r.s.intent);assert.equal(oldNative.effects.saves,0);crashChecks++;
const resumedNative=nativeFixture();assert.equal(await drive(resumedNative),true);assert.equal(resumedNative.r.s.intent,null);assert.equal(resumedNative.r.s.status,'READY');assert.equal(resumedNative.effects.saves,1);crashChecks++;
const noIntent=nativeFixture();noIntent.r.s.intent=null;assert.equal(await drive(noIntent),true);assert.equal(noIntent.effects.saves,0);crashChecks++;
for(const mutate of [
 f=>f.r.s.intent.nodeId='different-node',f=>f.r.s.intent.inputSha256='0'.repeat(64),f=>f.r.s.intent={kind:'EXPORT'},
 f=>delete f.r.s.nativeClosure,f=>f.r.s.nativeClosure.sha256='0'.repeat(64),f=>f.runtime.workflow.nodes[0].acceptance.manifestSha256='0'.repeat(64),
 ...[c=>c.nodeId='other',c=>c.inputSha256='0'.repeat(64),c=>c.ownedProcessesClosed=false,c=>c.alpha.studioClosed=false,c=>c.alpha.encoderClosed=false,c=>c.runtimeDownExitCode=1].map(mutateClosure=>f=>{const filename=f.r.s.nativeClosure.path,c=JSON.parse(fs.readFileSync(filename));mutateClosure(c);fs.writeFileSync(filename,JSON.stringify(c));Object.assign(f.r.s.nativeClosure,{bytes:fs.statSync(filename).size,sha256:digest(filename)});})
]){const f=nativeFixture();mutate(f);await assert.rejects(()=>drive(f),/CONTENT_|REVALIDATION/);assert.ok(f.r.s.intent);assert.equal(f.effects.saves,0);assert.equal(f.effects.claims,0);assert.equal(f.effects.ticks,0);crashChecks++;}
for(const mutate of [n=>n.state='running',n=>{n.state='failed';n.attempt=1;delete n.progress;},n=>{n.state='failed';n.progress={status:'SUBMISSION_UNKNOWN'};}]){const f=nativeFixture();mutate(f.runtime.workflow.nodes[0]);assert.equal(await drive(f),false);assert.equal(f.r.s.status,'UNKNOWN');assert.ok(f.r.s.intent);assert.equal(f.effects.claims,0);assert.equal(f.effects.ticks,0);crashChecks++;}
function qaFixture(){
 const dir=fs.mkdtempSync(path.join(fixtureRoot,'qa-'));fs.mkdirSync(path.join(dir,'qa'));
 const s={taskId:'fixture',requestSha256:'4'.repeat(64),content:{canvas:{width:720,height:960}},sampleFrames:[0,4,9],export:{output:{sha256:'5'.repeat(64)}}};
 const artifacts=s.sampleFrames.map(frame=>{const filename=path.join(dir,'qa','frame-'+frame+'.png');fs.writeFileSync(filename,'synthetic bytes only frame '+frame);return {path:filename,sha256:digest(filename),bytes:fs.statSync(filename).size,frame,width:720,height:960};});
 const qa={requestSha256:s.requestSha256,outputSha256:s.export.output.sha256,sampleFrames:s.sampleFrames,artifacts,actualPixelsApproval:false};
 fs.writeFileSync(path.join(dir,'qa.json'),JSON.stringify(qa));const f=context(dir,structuredClone(native),s);f.qa=qa;return f;
}
async function recoverQa(f,source=implementation){
 const start=source===previous?'async function qaFrames(':'async function revalidateRequestQa(';
 vm.runInContext(section(source,start,'/** Same ordinary action.'),f.ctx);
 return f.ctx.qaFrames(f.runtime,f.r,f.runtime.workflow.nodes[0],{tools:{ffmpegPath:'FORBIDDEN'}},{deadlineMs:0});
}
const oldQa=qaFixture();await assert.rejects(()=>recoverQa(oldQa,previous),/PARTIAL_QA/);assert.equal(oldQa.effects.decodes,0);crashChecks++;
const recoveredQa=qaFixture(),qaFact=await recoverQa(recoveredQa);assert.equal(qaFact.sha256,digest(path.join(recoveredQa.r.dir,'qa.json')));assert.equal(recoveredQa.r.s.qa,undefined);assert.equal(recoveredQa.effects.claims,0);assert.equal(recoveredQa.effects.decodes,0);crashChecks++;
recoveredQa.r.s.qa=qaFact;assert.equal((await recoverQa(recoveredQa)).sha256,qaFact.sha256);crashChecks++;
const checkpointQa=qaFixture();await recoverQa(checkpointQa);Object.assign(checkpointQa.ctx,{runtime:checkpointQa.runtime,r:checkpointQa.r,node:checkpointQa.runtime.workflow.nodes[0],p:{},permit:null});
const checkpoint=section(implementation,'const qa=await qaFrames(runtime,r,node,p,permit);',"\n  }\n  if(['EXPORT_VERIFIED'");
await vm.runInContext('(async()=>{'+checkpoint+'})()',checkpointQa.ctx);
assert.equal(checkpointQa.r.s.stage,'EXPORT_VERIFIED');assert.equal(checkpointQa.r.s.status,'WAITING_REVIEW');assert.equal(checkpointQa.r.s.qa.sha256,digest(path.join(checkpointQa.r.dir,'qa.json')));assert.equal(checkpointQa.effects.saves,1);assert.equal(checkpointQa.effects.claims,0);assert.equal(checkpointQa.effects.decodes,0);crashChecks++;
for(const mutate of [q=>q.requestSha256='0'.repeat(64),q=>q.outputSha256='0'.repeat(64),q=>q.sampleFrames=[0,4],q=>q.artifacts.pop(),q=>q.artifacts[1]=q.artifacts[0],q=>q.artifacts[0].sha256='0'.repeat(64),q=>q.artifacts[0].bytes++,q=>q.artifacts[0].path='/unbound/frame.png',q=>q.artifacts[0].width=960]){const f=qaFixture();mutate(f.qa);fs.writeFileSync(path.join(f.r.dir,'qa.json'),JSON.stringify(f.qa));await assert.rejects(()=>recoverQa(f),/CONTENT_/);assert.equal(f.effects.claims,0);assert.equal(f.effects.decodes,0);crashChecks++;}
for(const mutate of [
 f=>fs.writeFileSync(path.join(f.r.dir,'qa.json'),'{'),
 f=>fs.writeFileSync(path.join(f.r.dir,'qa','frame-4.png'),'tampered'),
 f=>fs.unlinkSync(path.join(f.r.dir,'qa','frame-4.png')),
 f=>f.r.s.sampleFrames=[0,4],
 f=>f.runtime.workflow.nodes[0].input.parameters.request.personCardScene.config.qa.sampleFrames=[0,9],
 f=>f.r.s.content.canvas.width=960,
 f=>{f.r.s.qa={path:path.join(f.r.dir,'qa.json'),bytes:fs.statSync(path.join(f.r.dir,'qa.json')).size,sha256:'0'.repeat(64)};},
 f=>fs.unlinkSync(path.join(f.r.dir,'qa.json'))
]){const f=qaFixture();mutate(f);await assert.rejects(()=>recoverQa(f));assert.equal(f.effects.claims,0);assert.equal(f.effects.decodes,0);crashChecks++;}
for(const f of [resumedNative,noIntent,recoveredQa]){assert.equal(f.effects.claims,0);assert.equal(f.effects.ticks,0);assert.equal(f.effects.encodes,0);assert.equal(f.effects.decodes,0);}
console.log(JSON.stringify({status:'PASS_EXACT_DRIVER_CRASH_WINDOWS',checks:crashChecks,originalNativeStaleIntentReproduced:true,originalCompleteQaOrphanReproduced:true,fixtureEvidence:'EXTERNAL_ACCEPTANCE_CLOSURE_AND_IMAGE_METADATA_STUBBED_NOT_ACTUAL_NATIVE_OR_PIXELS',newBuilds:0,newEncodes:0,newDecodes:0,newBrowsers:0,productionRequestWrites:0}));

// Preclaim repair uses the preserved real v26 snapshots as read-only predicate
// inputs. No journal, node, PNG, process or resource claim is created here.
const delta='work/module-development-launch-v1/person-card-content-layout-v1/resumable-content-request-contract-v1/preclaim-deadline-recovery-delta-v1';
const proof=JSON.parse(fs.readFileSync(delta+'/PRECLAIM-RECOVERY-EVIDENCE-v2.json'));
const actualSaved=JSON.parse(fs.readFileSync(proof.files.requestSnapshot.path));
const actualWorkflow=JSON.parse(fs.readFileSync(proof.files.workflowSnapshot.path));
const actualNode=actualWorkflow.nodes.find(n=>n.id===actualSaved.intent.nodeId);
const evidence=Object.fromEntries(Object.entries({failure:'failureReceipt',closed:'closedSupplement',priorPhase:'releasedPhase',priorRequest:'requestSnapshot',priorWorkflow:'workflowSnapshot'}).map(([k,v])=>[k,JSON.parse(fs.readFileSync(proof.files[v].path))]));
let deltaChecks=0;const bad=(fn,re=/CONTENT_/)=>{assert.throws(fn,re);deltaChecks++;};
assertPersonContentPreclaimRecoveryV1(actualSaved,actualNode,evidence);deltaChecks++;
for(const mutate of [x=>x.s.status='BLOCKED',x=>x.s.stage='NATIVE_PLAN',x=>x.s.reason='provider-unknown',x=>x.s.intent.inputSha256='0'.repeat(64),x=>x.n.attempt=1,x=>x.n.progress={jobId:'unknown'},x=>x.n.result={},x=>x.n.acceptance={},x=>x.n.lease={},x=>x.n.executedBy='owner',x=>x.n.state='running',x=>x.n.module='hypit-render',x=>x.e.failure.killed=true,x=>x.e.failure.processes[0].exitCode=0,x=>x.e.failure.processes[0].pid++,x=>x.e.closed.ownedStaticProcessesClosed=false,x=>x.e.closed.supplementalFormalPs.ownedPidAndGroupAbsent=false,x=>x.e.closed.supplementalFormalPs.ownedPidOrGroupRows=[{}],x=>x.e.closed.supplementalFormalPs.psExitCode=1,x=>x.e.priorPhase.status='ACTIVE',x=>x.e.priorPhase.newNodeAttemptsObserved=1,x=>x.e.priorPhase.newBuildsObserved=1,x=>x.e.priorPhase.ownerThreadId='other',x=>x.e.priorPhase.controllerThreadId='other',x=>x.e.priorPhase.actualRequestSha256='0'.repeat(64),x=>x.e.priorRequest.revision++,x=>x.e.priorWorkflow.nodes.find(n=>n.id===x.n.id).attempt=1]){
 const x={s:structuredClone(actualSaved),n:structuredClone(actualNode),e:structuredClone(evidence)};mutate(x);bad(()=>assertPersonContentPreclaimRecoveryV1(x.s,x.n,x.e));
}
const beforeDriver=proof.files.driverBefore.sha256,currentImpl={...actualSaved.implementationIdentity,'a1-person-content-request-v1.mjs':digest('apps/studio-next/src/lib/a1-person-content-request-v1.mjs'),'a1-hypit-frame-master-preview-v1.mjs':digest('apps/studio-next/src/lib/a1-hypit-frame-master-preview-v1.mjs')};
const sameInput={taskId:actualSaved.taskId,content:actualSaved.content,motion:actualSaved.motion};
assertPersonContentExecutionCompatibilityV1(actualSaved,sameInput,actualSaved.profileIdentity,currentImpl,beforeDriver,proof.files.exporterBefore.sha256);deltaChecks++;
for(const mutate of [x=>x.i.content.fields[0].text+=' ',x=>x.i.motion.entrance.direction='up',x=>x.p.deliveryBuilderSha256='0'.repeat(64),x=>x.impl['a1-person-card-content-layout-v1.mjs']='0'.repeat(64),x=>x.impl.unapproved='0'.repeat(64),x=>delete x.impl['a1-node-hypit-render-adapter-v1.mjs'],x=>x.before='0'.repeat(64),x=>x.i.taskId='hupo-69-shot-reconstruction-v1']){
 const x={i:structuredClone(sameInput),p:structuredClone(actualSaved.profileIdentity),impl:{...currentImpl},before:beforeDriver};mutate(x);bad(()=>assertPersonContentExecutionCompatibilityV1(actualSaved,x.i,x.p,x.impl,x.before,proof.files.exporterBefore.sha256));
}
for(const [total,nativeMs,module,expectedMs] of [[15000,0,'media-files',10000],[30000,0,'layer-compositor',25000],[95000,9000,'hypit-render',81000],[18000,0,'export',13000]]){
 const permit=personContentPhaseBudgetV1({closureReserveMs:5000,workMaximumMs:total-5000,phaseMaximumMs:total,nativeCloseReserveMs:nativeMs},total,nativeMs>0,100);
 assert.equal(personContentNodeDeadlineV1(permit,module,100),100+expectedMs);deltaChecks++;
}
const tooSmall=personContentPhaseBudgetV1({closureReserveMs:5000,workMaximumMs:10000,phaseMaximumMs:15000,nativeCloseReserveMs:9000},15000,true,100);
assert.equal(personContentNodeDeadlineV1(tooSmall,'hypit-render',100),null);deltaChecks++;
for(const [budget,remaining,native] of [[{closureReserveMs:4999,workMaximumMs:10001,phaseMaximumMs:15000},15000,false],[{closureReserveMs:5000,workMaximumMs:10001,phaseMaximumMs:15000},15000,false],[{closureReserveMs:5000,workMaximumMs:10000,phaseMaximumMs:15000,nativeCloseReserveMs:9000},15000,false],[{closureReserveMs:5000,workMaximumMs:10000,phaseMaximumMs:15000},15000,true],[{closureReserveMs:5000,workMaximumMs:10000,phaseMaximumMs:15000,nativeCloseReserveMs:10000},15000,true],[{closureReserveMs:5000,workMaximumMs:10000,phaseMaximumMs:15000},5000,false]])bad(()=>personContentPhaseBudgetV1(budget,remaining,native,100));
const clamped=personContentPhaseBudgetV1({closureReserveMs:5000,workMaximumMs:25000,phaseMaximumMs:30000},7000,false,100);
assert.equal(clamped.deadlineMs,2100);deltaChecks++;
for(const offset of [1000,500,0,-1]){
 const n={id:native.id,module:'media-files',state:'queued',attempt:0,inputSha256:'1'.repeat(64)},f=context(fs.mkdtempSync(path.join(fixtureRoot,'budget-')),n,{taskId:'fixture',stage:'STATIC_PLAN'});
 vm.runInContext(section(implementation,'async function driveNodes(','function stageReviewPassed('),f.ctx);
 assert.equal(await f.ctx.driveNodes(f.runtime,f.r,[n.id],{deadlineMs:Date.now()+offset,minimumWorkMs:1000,nativeCloseReserveMs:0},{}),false);
 assert.equal(f.r.s.status,'WAITING_RESOURCE');assert.equal(f.r.s.intent,undefined);assert.equal(f.effects.claims,0);assert.equal(f.effects.ticks,0);deltaChecks++;
}
// Exact driver reaches registered tick using the STATIC deadline without the
// old unconditional native9s deduction. Tick is stubbed and throws BEFORE any claim.
{
 const n={id:native.id,module:'media-files',state:'queued',attempt:0,inputSha256:'1'.repeat(64)},f=context(fs.mkdtempSync(path.join(fixtureRoot,'static-deadline-')),n,{taskId:'fixture',stage:'STATIC_PLAN'});
 let observedDeadline;f.ctx.api=async()=>({readShotTaskRuntimeV1:()=>f.runtime,runShotTaskActionV1:async options=>{observedDeadline=options.executionDeadlineMs;throw Error('PURE_PRECLAIM_STOP');}});
 vm.runInContext(section(implementation,'async function driveNodes(','function stageReviewPassed('),f.ctx);const deadline=Date.now()+10000;
 await assert.rejects(()=>f.ctx.driveNodes(f.runtime,f.r,[n.id],{deadlineMs:deadline,minimumWorkMs:1000,nativeCloseReserveMs:0,phaseSha256:'0'.repeat(64)},{}),/PURE_PRECLAIM_STOP/);assert.equal(observedDeadline,deadline);deltaChecks++;
}
console.log(JSON.stringify({status:'PASS_PRECLAIM_BUDGET_AND_REAL_QUEUED_SNAPSHOT_PREDICATES',checks:deltaChecks,actualSnapshotPredicate:'PASS_NOT_EXECUTED_RECOVERY',fixtureDriverTick:'STUBBED_NO_CLAIM',newBuilds:0,newEncodes:0,newBrowsers:0,productionRequestWrites:0}));

let bindingChecks=0;
function recoveryFixture(){
 const dir=fs.mkdtempSync(path.join(fixtureRoot,'proof-')),here=path.join(dir,'apps/studio-next/src/lib');fs.mkdirSync(here,{recursive:true});
 const f={root:dir,here,proof:structuredClone(proof),saved:structuredClone(actualSaved),workflow:structuredClone(actualWorkflow)};
 const localFact=filename=>({path:filename,sha256:digest(filename),bytes:fs.statSync(filename).size});f.fact=localFact;
 for(const [name,fact] of Object.entries(f.proof.files)){const filename=path.join(dir,name+'.fixture');fs.copyFileSync(fact.path,filename);f.proof.files[name]=localFact(filename);}
 const guard=path.join(here,'a1-node-workflow-runtime-v1.mjs');fs.copyFileSync(proof.files.guardSource.path,guard);f.proof.files.guardSource=localFact(guard);
 const driver=path.join(here,'a1-person-content-request-v1.mjs');fs.writeFileSync(driver,implementation);fs.writeFileSync(path.join(here,'a1-hypit-frame-master-preview-v1.mjs'),fs.readFileSync('apps/studio-next/src/lib/a1-hypit-frame-master-preview-v1.mjs'));
 const prior=JSON.parse(fs.readFileSync(f.proof.files.releasedPhase.path));prior.frozenSourceAndArtifactHashes[guard]=digest(guard);prior.frozenSourceAndArtifactHashes[path.join(here,'a1-hypit-frame-master-preview-v1.mjs')]=proof.files.exporterBefore.sha256;fs.writeFileSync(f.proof.files.releasedPhase.path,JSON.stringify(prior));f.proof.files.releasedPhase=localFact(f.proof.files.releasedPhase.path);
 const proofPath=path.join(dir,'proof.json');fs.writeFileSync(proofPath,JSON.stringify(f.proof));f.evidenceFact=localFact(proofPath);
 const reviewDir=path.join(dir,'work/system-packaging-architecture-review-v1');fs.mkdirSync(reviewDir,{recursive:true});f.reviewPath=path.join(reviewDir,'synthetic-review.json');
 f.review={contract:'A1PersonContentPreclaimRecoveryReview/v1',status:'PASS',reviewerThreadId:'synthetic-independent-fixture',reviewedEvidenceSha256:f.evidenceFact.sha256,fromDriverSha256:beforeDriver,toDriverSha256:digest(driver),fromExporterSha256:proof.files.exporterBefore.sha256,toExporterSha256:digest(path.join(here,'a1-hypit-frame-master-preview-v1.mjs'))};
 fs.writeFileSync(f.reviewPath,JSON.stringify(f.review));f.reviewFact={...localFact(f.reviewPath),status:'PASS',reviewedEvidenceSha256:f.evidenceFact.sha256};
 f.runtime={taskRoot:dir,artifactRoot:path.join(dir,'artifacts'),workflow:f.workflow};f.r={s:f.saved,dir:path.join(dir,'content-packaging-requests-v1',f.saved.requestSha256)};
 f.permit={phaseSha256:'8'.repeat(64),ready:{preclaimRecoveryEvidence:f.evidenceFact,preclaimRecoveryReview:f.reviewFact}};
 f.ctx={fs,path,OWNER:'01a0f62b-b9b1-7576-a95f-804f688620a0',root:dir,here,process:{pid:99999999},nodeInputHash,assertPersonContentPreclaimRecoveryV1,assertPersonContentExecutionCompatibilityV1,
  hashFile:digest,jsonBytes:o=>Buffer.from(JSON.stringify(o,null,2)+'\n'),read:filename=>JSON.parse(fs.readFileSync(filename)),must:(v,m)=>{if(!v)throw Error(m);},closedPid:()=>true};vm.createContext(f.ctx);
 vm.runInContext(section(implementation,'function checkedPath(','/** Pure public admission.'),f.ctx);
 vm.runInContext(section(implementation,'function verifiedPreclaimReview(','/** All native recovery admission reads'),f.ctx);
 return f;
}
const bound=recoveryFixture();assert.equal(bound.ctx.preclaimRecoveryEvidence(bound.runtime,bound.r,bound.permit).fact.sha256,bound.evidenceFact.sha256);bindingChecks++;
for(const mutate of [f=>f.permit=null,f=>delete f.permit.ready.preclaimRecoveryReview,f=>f.permit.ready.preclaimRecoveryReview.status='FAIL',f=>f.permit.ready.preclaimRecoveryReview.reviewedEvidenceSha256='0'.repeat(64),f=>f.ctx.closedPid=()=>false,
 f=>{const n=f.workflow.nodes.find(n=>n.id===f.saved.intent.nodeId),d=path.join(f.runtime.artifactRoot,n.module,n.inputSha256);fs.mkdirSync(d,{recursive:true});},
 f=>{f.workflow.nodes.find(n=>n.id===f.saved.intent.nodeId).attempt=1;},
 f=>fs.writeFileSync(f.proof.files.workerStderr.path,'tampered'),
 ...[r=>r.status='FAIL',r=>r.reviewedEvidenceSha256='0'.repeat(64),r=>r.fromDriverSha256='0'.repeat(64),r=>r.toDriverSha256='0'.repeat(64),r=>r.fromExporterSha256='0'.repeat(64),r=>r.toExporterSha256='0'.repeat(64),r=>r.reviewerThreadId='01a0f62b-b9b1-7576-a95f-804f688620a0'].map(change=>f=>{change(f.review);fs.writeFileSync(f.reviewPath,JSON.stringify(f.review));Object.assign(f.reviewFact,f.fact(f.reviewPath));})
]){const f=recoveryFixture();mutate(f);bad(()=>f.ctx.preclaimRecoveryEvidence(f.runtime,f.r,f.permit));bindingChecks++;}

// The exact ordinary request function is exercised in a temporary task. All
// producer/preparation/API/resource operations are stubbed; no actual admission
// or signed phase is fabricated. It must checkpoint the old request identity and
// the new reviewed execution chain atomically, and reject unreviewed drift.
async function ordinaryFixture(mutate=()=>{}){
 const f=recoveryFixture(),dir=f.root;
 const reqDir=f.r.dir;fs.mkdirSync(reqDir,{recursive:true});f.r.filename=path.join(reqDir,'current.json');
 const preparationPath=path.join(reqDir,'preparation.json');fs.writeFileSync(preparationPath,'synthetic-preparation');f.saved.preparation=f.fact(preparationPath);
 // Proof loading is tested above with actual before-state bytes. Caller below
 // stubs that effect to isolate adoption ordering and identity behavior.
 fs.writeFileSync(f.r.filename,JSON.stringify(f.saved));
 const registryPath=path.join(dir,'registry.json');fs.writeFileSync(registryPath,JSON.stringify({contract:'A1ReferenceCandidateRegistry/v1',scope:'RESEARCH_ONLY',productionAdmission:false}));
 Object.assign(f.runtime,{appRoot:dir,plan:{projectId:actualSaved.taskId,scope:'RESEARCH_ONLY',productionAdmission:false},inputPlanSha256:'9'.repeat(64),pending:false});
 const incoming={taskId:actualSaved.taskId,...personContentRequestIdentityV1(actualSaved.taskId,actualSaved.content,actualSaved.motion,actualSaved.profileIdentity,currentImpl)};
 let owners=[],claims=0;const target={plan:{projectId:'hupo-69-shot-reconstruction-v1',scope:'RESEARCH_ONLY',productionAdmission:false}};
 Object.assign(f.ctx,{SHA:/^[a-f0-9]{64}$/,structuredClone,assertPersonContentEnvelopeV1,personContentRequestIdentityV1,assertPersonContentRequestReuseV1,
  resolvePersonContentDeliveryV1:()=>({registryRelative:'registry.json',targetTaskId:target.plan.projectId}),
  preparePersonCardContentLayoutV1:async()=>({status:'READY',preparationSha256:actualSaved.preparationSha256}),
  profile:()=>({identity:actualSaved.profileIdentity,implementations:currentImpl}),
  readRequest:()=>f.r,withProjectLock:(_dir,fn)=>fn(),
  api:async()=>({readShotTaskRuntimeV1:({taskId})=>taskId===actualSaved.taskId?f.runtime:target}),
  verifyPhase:(_rt,_r,execution)=>{if(!execution)return null;return f.permit;},
  preclaimRecoveryEvidence:()=>({proof:f.proof,fact:f.evidenceFact,review:f.reviewFact}),
  driveNodes:async()=>{owners.push(JSON.parse(fs.readFileSync(f.r.filename)));return false;}
 });
 // Avoid unrelated dynamic graph import; caller path itself is otherwise exact.
 const caller=implementation.slice(implementation.indexOf('export async function runPersonContentRequestV1(')).replace('export async','async').replace("runtime.contentCompiler={...(await import('./a1-shot-task-graph-v1.mjs')),verifyResearchCopyAuthoritiesV1:a.verifyResearchCopyAuthoritiesV1,verifyResearchDirectorEvidenceV1:a.verifyResearchDirectorEvidenceV1};","runtime.contentCompiler={};");
 vm.runInContext(section(implementation,'function save(','async function api('),f.ctx);vm.runInContext(caller,f.ctx);
 const args={repoRoot:dir,taskId:actualSaved.taskId,expectedPlanSha256:f.runtime.inputPlanSha256,content:actualSaved.content,motion:actualSaved.motion,execution:{synthetic:true}};mutate(f,args);
 const before=fs.readFileSync(f.r.filename);f.run=()=>f.ctx.runPersonContentRequestV1(args);f.owners=owners;f.before=before;return f;
}
const ordinary=await ordinaryFixture();await ordinary.run();assert.equal(ordinary.owners.length,1);
const checkpointed=ordinary.owners[0];assert.equal(checkpointed.requestSha256,actualSaved.requestSha256);assert.equal(checkpointed.intent,null);assert.equal(checkpointed.reason,null);assert.ok(checkpointed.actionOwner);
assert.deepEqual(checkpointed.implementationIdentity,actualSaved.implementationIdentity);assert.deepEqual(checkpointed.executionImplementationIdentity,currentImpl);assert.ok(checkpointed.implementationRecovery);assert.equal(checkpointed.revision,actualSaved.revision+1);bindingChecks++;
// Next ordinary call revalidates the immutable execution chain, without adopting
// a second recovery history or changing canonical request/candidate identity.
const history=checkpointed.implementationRecovery,historyBytes=fs.readFileSync(history.path);await ordinary.run();assert.equal(fs.readFileSync(history.path).equals(historyBytes),true);assert.equal(ordinary.owners[1].requestSha256,actualSaved.requestSha256);bindingChecks++;
for(const mutate of [(_f,args)=>delete args.execution,(_f,args)=>{args.content=structuredClone(args.content);args.content.fields[0].text+=' ';},f=>f.ctx.profile=()=>({identity:{...actualSaved.profileIdentity,deliveryBuilderSha256:'0'.repeat(64)},implementations:currentImpl}),f=>f.ctx.preclaimRecoveryEvidence=()=>{throw Error('CONTENT_PRECLAIM_REVIEW_REQUIRED');}]){
 const f=await ordinaryFixture(mutate);await assert.rejects(f.run,/CONTENT_|CONFLICT/);assert.ok(fs.readFileSync(f.r.filename).equals(f.before));assert.equal(fs.existsSync(path.join(f.r.dir,'execution-recovery')),false);bindingChecks++;
}
console.log(JSON.stringify({status:'PASS_EXACT_PROOF_LOADING_AND_ORDINARY_CALLER_CHECKPOINT',checks:bindingChecks,ordinaryEffectEvidence:'TEMP_TASK_WITH_PREPARATION_PHASE_AND_PRODUCER_STUBS_NOT_ACTUAL_RECOVERY',realRequestWrites:0,newClaims:0,newBuilds:0,newEncodes:0,newBrowsers:0}));

// Internal CLI context preserves the outer owned process's hard deadline after
// imports/preflight. It is not a public action field or a larger signed budget.
let clockChecks=0;
const cliSource=fs.readFileSync('scripts/run-shot-task-workflow-v1.mjs','utf8');
for(const clock of [undefined,'1234567890123','NaN']){
 let captured;const exitSignal=Error('PURE_CLI_EXIT');
 const ctx={fs:{readFileSync:()=>JSON.stringify({taskId,content,motion})},taskId,action:'package-person-content',nodeId:'/synthetic-payload',workerId:'/synthetic-phase',requestPath:'0'.repeat(64),outputPath:clock,options:{taskId},console:{log:()=>{}},process:{exit:()=>{throw exitSignal;}},readShotTaskRuntimeV1:()=>({inputPlanSha256:'1'.repeat(64)}),runShotTaskActionV1:async o=>{captured=o;return {inputPlanSha256:o.expectedPlanSha256,contentRequest:{}};}};
 vm.createContext(ctx);await assert.rejects(vm.runInContext('(async()=>{'+section(cliSource,"if(action==='package-person-content'){","if (action === 'imagegen-claim')")+'})()',ctx),e=>e===exitSignal);
 assert.equal(captured.execution.phasePath,'/synthetic-phase');assert.equal(captured.execution.phaseSha256,'0'.repeat(64));
 assert.ok(Number.isFinite(captured.execution.startedAtMs));assert.ok(Object.is(captured.execution.totalDeadlineMs,clock===undefined?undefined:Number(clock)));clockChecks++;
}
const wrapperSource=fs.readFileSync('work/module-development-launch-v1/person-card-content-layout-v1/resumable-content-request-contract-v1/actual-request-resume-prepared-v1/run-owned-request-once.mjs','utf8');
const argvContext={path,ui:false,root:'/temporary-owner-root',payload:{taskId},ready:{payloadPath:'/synthetic-payload'},phasePath:'/synthetic-phase',phaseSha:'0'.repeat(64),checked:p=>p,hard:1234567890123};vm.createContext(argvContext);
vm.runInContext(section(wrapperSource,'   const argv=','   const so=').replace('const argv=','globalThis.argv='),argvContext);assert.equal(argvContext.argv.at(-1),'1234567890123');clockChecks++;
console.log(JSON.stringify({status:'PASS_OUTER_DEADLINE_INTERNAL_CLI_PROPAGATION',checks:clockChecks,cliAndSpawn:'STUBBED_NOT_STARTED',httpRequests:0,newClaims:0}));
