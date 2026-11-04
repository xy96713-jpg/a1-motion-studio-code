import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {projectProductionWorkScopeV1,assertProductionWorkScopeV1,isRetiredGenerationTaskV1,workScopeSourceIdentityV1,adoptProductionWorkScopeV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {projectShotTaskExecutionReadinessV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {assessDirectorExecutionPlanV1} from '../apps/studio-next/src/lib/a1-director-production-plan-v1.mjs';
import {readShotTaskRuntimeV1,syncShotTaskRuntimeV1,runShotTaskActionV1,claimShotImagegenToolV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {productionInputIdentityV1,runProductionBatchV1} from '../apps/studio-next/src/lib/a1-production-batch-runner-v1.mjs';
const shot=id=>({id,sourceText:'Fixture '+id,visualJob:'Fixture',exactCopy:[],tasks:[{module:'media-files',dependencies:[],parameters:{},blocker:'SOURCE_MISSING'}]});
const plan={contract:'A1ShotTaskPlan/v1',projectId:'scope-fixture',scope:'RESEARCH_ONLY',productionAdmission:false,
 executionPolicy:{contract:'A1ShotTaskExecutionPolicy/v1',requireReferenceDesignForImagegen:false},shots:[shot('target'),shot('unrelated')],
 assetTasks:[{...shot('shared'),resourceOnly:true,consumerShotIds:['target','unrelated']},{...shot('other-asset'),resourceOnly:true,consumerShotIds:['unrelated']}]};
const focused=structuredClone(plan);focused.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:['target'],objective:'Complete one representative frame',sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false};focused.executionPolicy.requireActiveWorkScope=true;
assert.deepEqual(projectProductionWorkScopeV1(focused).allowedShotIds,['target','shared']);
assert.throws(()=>assertProductionWorkScopeV1(focused,['unrelated']),/OUTSIDE_ACTIVE_WORK_SCOPE/);
assert.throws(()=>projectProductionWorkScopeV1({...focused,activeWorkScope:null}),/REQUIRED/);
assert.throws(()=>projectProductionWorkScopeV1({...focused,source:{changed:true}}),/SOURCE_CHANGED/);
assert.throws(()=>projectProductionWorkScopeV1({...focused,activeWorkScope:{...focused.activeWorkScope,shotIds:[]}}),/INVALID/);
assert.equal(productionInputIdentityV1(focused),productionInputIdentityV1(plan));
const nodes=[{id:'target:media-files',shotId:'target',module:'media-files',state:'blocked',dependencies:[]},
 {id:'unrelated:media-files',shotId:'unrelated',module:'media-files',state:'queued',dependencies:[]}];
const readiness=projectShotTaskExecutionReadinessV1(focused,{nodes,modules:{'media-files':{available:true}}});
assert.equal(readiness.nextAction.shotId,'target');assert.ok(readiness.deferredActions.some(a=>a.shotId==='unrelated'));assert.equal(readiness.summary.runNow,0);
const retired={module:'image-generation',blocker:'LEGACY_GENERATION_RETIRED',parameters:{generationRequest:{prompt:'Old'},existingWorkDisposition:{contract:'A1ExistingGenerationDisposition/v1',newProviderCallAllowed:false,visualApproval:false,productionAdmission:false,disposition:'REJECTED_DO_NOT_REPEAT',reason:'Wrong source',evidence:[{path:'fixture'}],baseRequestSha256:nodeInputHash({prompt:'Old'})}}};
assert.ok(isRetiredGenerationTaskV1(retired));assert.ok(!isRetiredGenerationTaskV1({...retired,parameters:{}}));
const designPlan={shots:[{...shot('target'),tasks:[retired],packagingDecision:{layers:[{id:'base'}]},referenceProductionDesign:{references:[{}],layers:[{id:'base'}]}}]};
const coverage=assessDirectorExecutionPlanV1(designPlan,{globalDesign:{shots:[{shotId:'target',disposition:'DESIGN_REQUIRED'}]},capabilities:{capabilities:[]}});
assert.deepEqual(coverage.shots[0].blockers,[]);
designPlan.shots[0].tasks.push({module:'media-files',parameters:{}});
assert.ok(assessDirectorExecutionPlanV1(designPlan,{globalDesign:{shots:[{shotId:'target'}]},capabilities:{capabilities:[]}}).shots[0].blockers.includes('MODULE_INPUT_UNBOUND:media-files'));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'production-work-scope-'))),taskId=plan.projectId,dir=path.join(root,'work',taskId),args={repoRoot:root,taskId};fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(plan));
try {
 const before=syncShotTaskRuntimeV1({...args,expectedPlanSha256:nodeInputHash(plan)});
 await adoptProductionWorkScopeV1({...args,phaseId:'focus',referencePackagingOnly:true,shotIds:['target'],objective:'Complete one representative frame',expectedPlanSha256:before.inputPlanSha256});
 const current=readShotTaskRuntimeV1(args);
 assert.equal(current.plan.activeWorkScope.referencePackagingOnly,true);
 assert.equal(productionInputIdentityV1(current.plan),productionInputIdentityV1(plan));
 await assert.rejects(adoptProductionWorkScopeV1({...args,phaseId:'invalid-scope',referencePackagingOnly:'true'}),/WORK_SCOPE_PACKAGING_ONLY_INVALID/);
 assert.deepEqual(current.workflow.nodes.map(n=>[n.id,n.inputSha256,n.attempt,n.state]),before.workflow.nodes.map(n=>[n.id,n.inputSha256,n.attempt,n.state]));
 const planBytes=fs.readFileSync(current.planPath);
 for(const action of ['tick','retry','resume']){
  await assert.rejects(runShotTaskActionV1({...args,action,nodeId:'unrelated:media-files'}),/OUTSIDE_ACTIVE_WORK_SCOPE/);
  await assert.rejects(runShotTaskActionV1({...args,action,nodeId:'target:media-files'}),/ACTIVE_WORK_REQUIRES_PRODUCTION_BATCH/);
 }
 await assert.rejects(runShotTaskActionV1({...args,action:'tick',allowedNodeIds:['target:media-files']}),/ACTIVE_WORK_REQUIRES_PRODUCTION_BATCH/);
 await assert.rejects(runShotTaskActionV1({...args,action:'tick'}),/ACTIVE_WORK_REQUIRES_PRODUCTION_BATCH/);
 await assert.rejects(runShotTaskActionV1({...args,action:'tick',allowedNodeIds:['unrelated:media-files']}),/OUTSIDE_ACTIVE_WORK_SCOPE/);
 assert.throws(()=>claimShotImagegenToolV1({...args,nodeId:'unrelated:media-files',workerId:'fixture'}),/OUTSIDE_ACTIVE_WORK_SCOPE/);
 const phases=path.join(root,'work/module-development-launch-v1/resource-reservations');fs.mkdirSync(phases,{recursive:true});
 const phaseId='outside',phaseFile=path.join(phases,'phase-activation-'+phaseId+'.json');
 fs.writeFileSync(phaseFile,JSON.stringify({taskId,purpose:'STATIC_PRODUCTION_BATCH',status:'ACTIVE',shotIds:['unrelated'],inputIdentity:productionInputIdentityV1(current.plan)}));
 const phaseBytes=fs.readFileSync(phaseFile);
 await assert.rejects(runProductionBatchV1({...args,phaseId}),/OUTSIDE_ACTIVE_WORK_SCOPE/);
 assert.ok(fs.readFileSync(phaseFile).equals(phaseBytes));assert.ok(fs.readFileSync(current.planPath).equals(planBytes));
 assert.equal(fs.existsSync(path.join(dir,'production-batches',phaseId)),false);
 // Old completed batches remain readable, even after focus changes, without dispatch.
 const saved='saved';fs.writeFileSync(path.join(phases,'phase-activation-'+saved+'.json'),JSON.stringify({taskId,purpose:'STATIC_PRODUCTION_BATCH',status:'COMPLETED_CLOSED_RELEASED',shotIds:['unrelated'],inputIdentity:productionInputIdentityV1(plan)}));
 const out=path.join(dir,'production-batches',saved);fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'PARTIAL_WITH_BLOCKED_INPUTS',inputIdentity:productionInputIdentityV1(plan),executionPlanSha256:nodeInputHash(plan),outputs:[],claims:0}));
 const replay=await runProductionBatchV1({...args,phaseId:saved});assert.equal(replay.newClaims,0);assert.equal(replay.reusedCompletedRun,true);
 // Positive path: the real batch runner can still import a local fixture within scope.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
 const image=path.join(root,'asset.png');fs.writeFileSync(image,png);
 const {createHash}=await import('node:crypto');
 const executable=JSON.parse(fs.readFileSync(current.planPath));
 executable.shots[0].tasks=[{module:'media-files',dependencies:[],parameters:{files:[{path:image,sha256:createHash('sha256').update(png).digest('hex'),role:'original-image',kind:'IMAGE',referenceOnly:false}]}}];
 fs.writeFileSync(current.planPath,JSON.stringify(executable));syncShotTaskRuntimeV1({...args,expectedPlanSha256:nodeInputHash(executable)});
 const runPhase='scoped-import',active={taskId,purpose:'STATIC_PRODUCTION_BATCH',status:'ACTIVE',shotIds:['target'],inputIdentity:productionInputIdentityV1(executable),executionAuthorized:true,globalCap:2,reservedSlots:1,maximumClaims:1,maximumExecutionMs:10000,reservationStartUTC:new Date(Date.now()-1000).toISOString(),reservationEndUTC:new Date(Date.now()+10000).toISOString(),ownerThreadId:'fixture'};
 fs.writeFileSync(path.join(phases,'phase-activation-'+runPhase+'.json'),JSON.stringify(active));
 await assert.rejects(adoptProductionWorkScopeV1({...args,phaseId:'during-batch',shotIds:['unrelated'],objective:'Must not move an active batch',expectedPlanSha256:nodeInputHash(executable)}),/WORK_SCOPE_ACTIVE_EXECUTION/);
 const executed=await runProductionBatchV1({...args,phaseId:runPhase});assert.equal(executed.claims,1);
 assert.equal(readShotTaskRuntimeV1(args).workflow.nodes.find(n=>n.id==='unrelated:media-files').attempt,0);
 assert.equal(JSON.parse(fs.readFileSync(path.join(phases,'phase-activation-'+runPhase+'.json'))).status,'COMPLETED_CLOSED_RELEASED');
 await assert.rejects(adoptProductionWorkScopeV1({...args,phaseId:'stale',shotIds:['unrelated'],objective:'Wrong stale mutation',expectedPlanSha256:before.inputPlanSha256}),/PLAN_CHANGED/);
 console.log('PASS scoped recommendation, shared assets, no fallback to unrelated work, source drift, retired task exclusion, unchanged node identities, direct tick/retry/resume/tool-claim and batch rejection before writes, cached legacy readback, stale scope rejection. Zero providers or renders.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
