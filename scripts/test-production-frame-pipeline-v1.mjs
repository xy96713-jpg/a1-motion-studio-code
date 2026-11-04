import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {continueProductionV1} from '../apps/studio-next/src/lib/a1-production-continuation-v1.mjs';
import {productionFrameMasterIsReadyV1,currentProductionFrameRequestsV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {productionFrameToolArgumentsV1,productionFrameGoalInputsV1,mergeProductionFrameRecipeUpdateV1,verifiedNoPackageTargetsV1,productionFrameOutputIsBoundV1,groupProductionFrameReviewsV1,groupProductionFrameStateReviewsV1,runProductionFramePipelineV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';

const fallbackShas=['a'.repeat(64),'b'.repeat(64)];
const masterPlan={source:{videoSha256:fallbackShas[0]}},masterShot={id:'master',exactCopy:['Current title'],visualJob:'Read title'},masterUnit={state:'HOLD'};
const masterRequest={state:'HOLD',goalInputSha256:productionFrameGoalShaV1(masterPlan,masterShot,'HOLD')};
const masterNode={state:'succeeded',inputSha256:fallbackShas[0],acceptance:{inputSha256:fallbackShas[0]}};
assert.equal(productionFrameMasterIsReadyV1({plan:masterPlan,shot:masterShot,request:masterRequest,node:masterNode,unit:masterUnit}),true);
assert.equal(productionFrameMasterIsReadyV1({plan:masterPlan,shot:masterShot,request:masterRequest,node:masterNode}),true,'a current retained master outside the batch remains reusable');
assert.equal(productionFrameMasterIsReadyV1({plan:masterPlan,shot:{...masterShot,exactCopy:['Revised title']},request:masterRequest,node:masterNode,unit:masterUnit}),false,'an old successful master cannot seed a revised family');
assert.equal(productionFrameMasterIsReadyV1({plan:masterPlan,shot:masterShot,request:masterRequest,node:{...masterNode,state:'blocked'},unit:masterUnit}),false,'followers wait until the new master actually finishes');
const requestPlan={...masterPlan,shots:[{...masterShot,fullFrameRequests:[{...masterRequest,shotId:'master'},{state:'HANDOFF',shotId:'master',goalInputSha256:'f'.repeat(64)}]}]};
assert.deepEqual(currentProductionFrameRequestsV1(requestPlan,[{shotId:'master',state:'HOLD'},{shotId:'master',state:'HANDOFF'}]).map(r=>r.state),['HOLD'],'a deferred follower must not dispatch its stale pre-existing producer');
const sameShotStates=['ENTRY','HOLD','HANDOFF'].map(state=>({targetKey:'person:'+state,auxiliaryImageShas:fallbackShas}));
assert.deepEqual(groupProductionFrameStateReviewsV1(sameShotStates,1),[['person:ENTRY'],['person:HOLD'],['person:HANDOFF']]);
assert.deepEqual(groupProductionFrameStateReviewsV1(sameShotStates,3),[['person:ENTRY','person:HOLD'],['person:HANDOFF']]);
assert.throws(()=>groupProductionFrameStateReviewsV1([...sameShotStates,sameShotStates[0]]),/REVIEW_BUDGET/);
assert.throws(()=>groupProductionFrameStateReviewsV1([{targetKey:'person:UNKNOWN'}]),/REVIEW_TARGET/);
assert.deepEqual(groupProductionFrameReviewsV1(['A','B','C'].map(shotId=>({shotId,frameCount:1,auxiliaryImageShas:fallbackShas}))),[['A','B'],['C']],'fallback reference pixels occupy the same six-image reviewer budget');
assert.deepEqual(groupProductionFrameReviewsV1([{shotId:'A',frameCount:1,auxiliaryImageShas:fallbackShas},{shotId:'B',frameCount:1,auxiliaryImageShas:['c'.repeat(64),'d'.repeat(64)]}]),[['A'],['B']],'different reference packs cannot overflow one pass');
assert.throws(()=>groupProductionFrameReviewsV1([{shotId:'A',frameCount:3,auxiliaryImageShas:fallbackShas}]),/REVIEW_SPLIT_REQUIRED/);

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'frame-pipeline-'))),taskId='pipeline-fixture',dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
try {
  const reviewItems=Array.from({length:5},(_,i)=>({shotId:'unseen-'+i,frameCount:1}));
  assert.deepEqual(groupProductionFrameReviewsV1(reviewItems,2),[['unseen-0','unseen-1'],['unseen-2','unseen-3'],['unseen-4']]);
  assert.deepEqual(groupProductionFrameReviewsV1(reviewItems),[['unseen-0','unseen-1','unseen-2'],['unseen-3','unseen-4']]);
  assert.throws(()=>groupProductionFrameReviewsV1([{shotId:'multi-state',frameCount:3}],2),/SPLIT_REQUIRED/);
  assert.throws(()=>groupProductionFrameReviewsV1([{shotId:'unknown',frameCount:0}],2),/SPLIT_REQUIRED/);
  assert.throws(()=>groupProductionFrameReviewsV1(reviewItems,4),/REVIEW_BUDGET/);
  const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,
    shots:[{id:'A',sourceText:'Source unresolved fixture',visualJob:'Verified identity before production',exactCopy:[],tasks:[{module:'media-files',parameters:{},dependencies:[],blocker:'SOURCE_MISSING'}]}]};
  plan.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:['A'],objective:'Complete this scoped target',sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false};
  fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(plan));syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
  const proposalFile=path.join(dir,'proposal.json');fs.writeFileSync(proposalFile,JSON.stringify({units:[],waiting:[{targetKey:'A:HOLD',shotId:'A',state:'HOLD',route:'SOURCE_REQUIRED',reason:'Identity and copy not verified'}]}));
  const phase=activateProductionPhaseV1({repoRoot:root,taskId,phaseId:'pipeline',purpose:'STATIC_FRAME_PIPELINE',ownerThreadId:'fixture',
    approvalEvidence:'Fixture only, no providers',shotIds:['A'],maximumExecutionMs:60000,metadata:{targets:['A:HOLD'],imageBudget:2,modelBudget:4,codexExecutable:'/usr/bin/true',
      proposal:{path:path.relative(root,proposalFile),sha256:createHash('sha256').update(fs.readFileSync(proposalFile)).digest('hex')}}});
  const args={repoRoot:root,taskId,expectedPlanSha256:readShotTaskRuntimeV1({repoRoot:root,taskId}).inputPlanSha256};
  await assert.rejects(runProductionFramePipelineV1({repoRoot:root,taskId,phaseId:'pipeline',executable:'/usr/bin/true',expectedTargets:['different:HOLD']}),/EXPECTED_TARGETS_MISMATCH/);
  const first=await continueProductionV1(args),second=await continueProductionV1(args);
  assert.equal(first.status,'FRAME_INPUTS_REQUIRED');assert.equal(first.newImageClaims,0);assert.equal(second.newImageClaims,0);
  assert.deepEqual(first.blockers,second.blockers);assert.equal(phase.reservedSlots,0);
  const cleanRef=path.join(dir,'clean-reference.png');fs.writeFileSync(cleanRef,'reviewed clean reference fixture');
  const cleanPlan=structuredClone(plan);cleanPlan.source={videoSha256:'a'.repeat(64)};cleanPlan.shots[0].sourceInterval={startFrame:0,endFrameExclusive:10};
  cleanPlan.shots[0].statePackagingDecisions=[{state:'HOLD',sourceFrame:5,sourceVideoSha256:'a'.repeat(64),referencePath:cleanRef,referenceSha256:createHash('sha256').update(fs.readFileSync(cleanRef)).digest('hex'),packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false,reason:'Actual reference inspection',reviewedBy:'fixture-reviewer'}];
  assert.equal(verifiedNoPackageTargetsV1({repoRoot:root,plan:cleanPlan,targetKeys:['A:HOLD']}).length,1,'a verified clean state can bypass a stale generic packaging description');
  const faceless=structuredClone(cleanPlan);faceless.editorialBrief={contract:'A1ProductionEditorialBrief/v1',contentMode:'FACTUAL_ADAPTATION',presentationMode:'FACELESS',objective:'Complete faceless composition',authorizationEvidence:'Explicit fixture choice',sourceIdentity:workScopeSourceIdentityV1(faceless),copyApproval:false,visualApproval:false,productionAdmission:false};
  assert.equal(verifiedNoPackageTargetsV1({repoRoot:root,plan:faceless,targetKeys:['A:HOLD']}).length,0,'original presenter absence does not waive adapted visual duty');
  const oldBound={fullFrameComposition:{contract:'A1FullFrameComposition/v1',requestNodeIds:['old-producer']}};
  assert.equal(productionFrameOutputIsBoundV1(oldBound,{nodeId:'new-producer'}),false,'old succeeded compositor is not new-request output');
  assert.equal(productionFrameOutputIsBoundV1(oldBound,{nodeId:'old-producer'}),true);
  assert.equal(productionFrameOutputIsBoundV1({...oldBound,fullFrameRebindRequired:true},{nodeId:'old-producer'}),false,'a native geometry repair must bypass completed-output reuse even when the producer image did not change');
  const newTitle=structuredClone(cleanPlan);newTitle.shots[0].exactCopy=['New title'];
  assert.equal(verifiedNoPackageTargetsV1({repoRoot:root,plan:newTitle,targetKeys:['A:HOLD']}).length,0,'a clean presenter decision cannot cancel newly designed copy');
  fs.appendFileSync(cleanRef,'changed');assert.throws(()=>verifiedNoPackageTargetsV1({repoRoot:root,plan:cleanPlan,targetKeys:['A:HOLD']}),/CLEAN_REFERENCE_CHANGED/);
  const phases=fs.readdirSync(path.join(root,'work/module-development-launch-v1/resource-reservations'));assert.equal(phases.length,1,'source gap must not create model, compositor or image phases');
  const action=productionFrameToolArgumentsV1({prompt:'Bound complete frame',transparentBackground:true,references:[{path:'/tmp/fixture-reference.png'}]});
  assert.deepEqual(action,{prompt:'Bound complete frame',transparent_background:true,referenced_image_paths:['/tmp/fixture-reference.png']});
  assert.equal(Object.hasOwn(productionFrameToolArgumentsV1({prompt:'New illustration',transparentBackground:false,references:[]}),'referenced_image_paths'),false);
  const before=productionFrameGoalInputsV1(plan,['A']),metadataOnly=structuredClone(plan);metadataOnly.shots[0].fullFrameRequests=[{state:'HOLD'}];
  assert.deepEqual(productionFrameGoalInputsV1(metadataOnly,['A']),before,'execution progress does not request a new plan');
  const directed=structuredClone(plan);directed.shots[0].sourceNarrativeDirection={review:{path:'source-direction.json',sha256:'a'.repeat(64)},directionSha256:'b'.repeat(64)};
  assert.notDeepEqual(productionFrameGoalInputsV1(directed,['A']),before,'a newly bound source direction invalidates a saved SOURCE_REQUIRED recipe and requests planning');
  metadataOnly.shots[0].exactCopy=['New reviewed copy'];assert.notDeepEqual(productionFrameGoalInputsV1(metadataOnly,['A']),before,'copy change requests a new plan');
  const observed=structuredClone(plan);observed.shots[0].referenceContentObservation={description:'Actual reference content'};
  const annotated=productionFrameGoalInputsV1(observed,['A']);observed.shots[0].sourceText='Restored original source document';
  assert.deepEqual(productionFrameGoalInputsV1(observed,['A']),annotated,'reference annotation goal stays stable when the untouched author source field is restored');
  observed.shots[0].referenceContentObservation.description='Different reference content';
  assert.notDeepEqual(productionFrameGoalInputsV1(observed,['A']),annotated,'new observed content invalidates the goal');
  const retained={shotId:'B',state:'HOLD',brief:'Keep the existing accepted target'};
  const merged=mergeProductionFrameRecipeUpdateV1({units:[retained],waiting:[{shotId:'A',targetKey:'A:HOLD',route:'SOURCE_REQUIRED'}],recipes:[]},
    {units:[{shotId:'A',state:'HOLD',brief:'New reviewed source'}],waiting:[],recipes:[]},['A']);
  assert.equal(merged.units[0],retained);assert.equal(merged.waiting.length,0);assert.deepEqual(merged.retainedTargetKeys,['B:HOLD']);
  fs.appendFileSync(proposalFile,' ');await assert.rejects(continueProductionV1(args),/PROPOSAL_CHANGED/);
  console.log('PASS normal continuation consumes the authorized pipeline, source gaps produce zero model/image/compositor claims on repeat, proposal byte drift fails, and built-in tool arguments preserve reference/alpha intent. No providers.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
