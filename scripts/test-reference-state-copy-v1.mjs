import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {prepareReferenceStateCopyV1,verifyReferenceStateCopyBindingV1,compileFullFrameRequestsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {prepareStateReferenceCopyReplacementV1} from '../apps/studio-next/src/lib/a1-production-state-excerpt-rewrite-v1.mjs';
import {productionFrameGoalShaV1,productionFrameRequestIsCurrentV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {researchStaticSampleIsCurrentV1} from '../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {syncShotTaskRuntimeV1,preflightShotTaskPlanV1,readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {adoptSourcedFrameInputsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {verifyReferenceStateIntentsV1,referenceStateIntentDigestsV1,readReferenceStateIntentsV1} from '../apps/studio-next/src/lib/a1-reference-state-intent-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'state-copy-'))),fixtures=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
for(const [genre,oldCopy,newCopy] of [['typography','旧章节','新章节'],['editorial-comparison','关闭','开放'],['source-explainer','输入','输出']]){
 const taskId='fixture-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(path.join(dir,'coverage'),{recursive:true});
 const image=path.join(dir,'reference.png');fs.writeFileSync(image,'mock source '+genre);const imageBytes=fs.readFileSync(image),sha256=hash(imageBytes);
 const refs=['ENTRY','HOLD','HANDOFF'].map((state,i)=>({state,sourceFrame:i+1,path:image,sha256}));
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,source:{videoSha256:'a'.repeat(64)},
   visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
   shots:[{id:'scene',sourceText:'章节的状态改变',visualJob:'保留旧状态并绑定新状态',sourceInterval:{startFrame:0,endFrameExclusive:4},exactCopy:[oldCopy],tasks:[],
     typographyDirections:[{id:'unchanged-old-type'}],productionResources:{assets:[],fonts:[]},
     referenceProductionDesign:{contract:'A1ReferenceProductionDesign/v1',shotId:'scene',sourceVideoSha256:'a'.repeat(64),references:refs,
       viewerIntent:'分辨状态',appearance:{composition:'标题居中',palette:'双色',surface:'平面'},
       layers:[{id:'old-text',role:'TEXT',copyIndices:[0],identity:null},{id:'new-text',role:'TEXT',copyIndices:[],identity:null}],
       states:[{state:'ENTRY',visibleLayerIds:['old-text'],visibleCopyIndices:[0]},{state:'HOLD',visibleLayerIds:['new-text'],visibleCopyIndices:[]},{state:'HANDOFF',visibleLayerIds:['old-text'],visibleCopyIndices:[0]}],
       uncertainties:[{scope:'source',detail:'Unknown old statement remains unresolved'}]}}]};
 plan.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:['scene'],objective:'Bind one source state only',sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false};
 const evidence={contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:plan.source.videoSha256},stateFrames:{scene:refs.map(r=>({state:r.state,sourceFrame:r.sourceFrame,artifactPath:'reference.png',artifactSha256:r.sha256}))}};
 const evidenceFile=path.join(dir,'coverage','evidence.json');fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
 const unit={shotId:'scene',state:'HOLD',copyMode:'REFERENCE_STATE_COPY',reviewedBy:'fixture-agent',copy:[newCopy],sourceTranscription:newCopy,layerCopyBindings:[{layerId:'new-text',copyIndex:0}],
   visualIntake:{contract:'A1WholeFrameVisualIntake/v1',reviewerRole:'AGENT',reviewerId:'fixture-agent',sourceCorePolicy:'ORIGINAL_ILLUSTRATION_NO_NATIVE_EVIDENCE',
     referenceEvidence:{path:evidenceFile,sha256:hash(fs.readFileSync(evidenceFile))},reference:refs[1],viewerIntent:'辨认新状态',appearance:{composition:'标题居中',palette:'双色',surface:'平面'}}};
 const before=structuredClone(plan),oldGoal=productionFrameGoalShaV1(plan,plan.shots[0],'ENTRY');
 const framePlan=structuredClone(plan),frameShot=framePlan.shots[0];
 frameShot.referenceProductionDesign.states=frameShot.referenceProductionDesign.states.filter(s=>s.state!=='HOLD');
 frameShot.referenceProductionDesign.references=frameShot.referenceProductionDesign.references.filter(s=>s.state!=='HOLD');
 const intentReview={contract:'A1ReferenceStateIntentReview/v1',shotId:'scene',sourceVideoSha256:plan.source.videoSha256,reviewedBy:'fixture',exactCopy:[oldCopy],referenceEvidence:unit.visualIntake.referenceEvidence,
   states:[{state:'HOLD',reference:refs[1],viewerNotice:'source expansion',viewerChange:'new words',sequenceRole:'explain',handoff:'continue',visibleCopyIndices:[],copyObservation:'PARTIAL_NOT_READABLE',baseMediaStatus:'SEPARATE_SOURCE_INTEGRATION_REQUIRED',geometryStatus:'UNMEASURED',motionStatus:'UNMEASURED'}],productionAdmission:false,visualApproval:false,motionApproved:false};
 const intentPath=path.join(dir,'intent.json');fs.writeFileSync(intentPath,JSON.stringify(intentReview));
 const checkedIntent=verifyReferenceStateIntentsV1({repoRoot:root,plan:framePlan,shot:frameShot,review:intentReview});
 frameShot.referenceStateIntents={review:{path:intentPath,sha256:hash(fs.readFileSync(intentPath))},intentSha256:nodeInputHash(checkedIntent),stateIntentSha256ByState:referenceStateIntentDigestsV1(checkedIntent)};
 const frameCopy=Array.from({length:19},(_,i)=>newCopy+i),frameUnit={...unit,wholeFrameCopy:true,layerCopyBindings:undefined,copy:frameCopy,sourceTranscription:frameCopy.join('\n')};
 const frameBefore=productionFrameGoalShaV1(framePlan,frameShot,'ENTRY');
 const whole=prepareReferenceStateCopyV1({repoRoot:root,taskRoot:dir,plan:framePlan,unit:frameUnit});
 assert.equal(productionFrameGoalShaV1(whole.plan,whole.plan.shots[0],'ENTRY'),frameBefore);
 assert.equal(whole.plan.shots[0].stateCopyBindings.HOLD.copyIndices.length,19);
 assert.equal(readReferenceStateIntentsV1({repoRoot:root,plan:whole.plan,shot:whole.plan.shots[0]}).states[0].copyObservation,'LOCKED_VISIBLE');
 assert.equal(prepareReferenceStateCopyV1({repoRoot:root,taskRoot:dir,plan:whole.plan,unit:frameUnit}).assignment.reused,true);
 const result=prepareReferenceStateCopyV1({repoRoot:root,taskRoot:dir,plan,unit}),shot=result.plan.shots[0];
 assert.deepEqual(plan,before,'caller plan unchanged');assert.deepEqual(shot.exactCopy,[oldCopy,newCopy]);
 assert.deepEqual(shot.referenceProductionDesign.states.filter(s=>s.state!=='HOLD'),before.shots[0].referenceProductionDesign.states.filter(s=>s.state!=='HOLD'));
 assert.deepEqual(shot.referenceProductionDesign.layers,before.shots[0].referenceProductionDesign.layers);assert.deepEqual(shot.typographyDirections,before.shots[0].typographyDirections);
 assert.deepEqual(shot.referenceProductionDesign.uncertainties,before.shots[0].referenceProductionDesign.uncertainties);
 assert.equal(productionFrameGoalShaV1(result.plan,shot,'ENTRY'),oldGoal);assert.equal(productionFrameGoalShaV1(result.plan,shot,'HANDOFF'),oldGoal);
 assert.notEqual(productionFrameGoalShaV1(result.plan,shot,'HOLD'),oldGoal);assert.notEqual(productionFrameGoalShaV1(result.plan,shot),productionFrameGoalShaV1(plan,plan.shots[0]));
 const request={state:'ENTRY',goalInputSha256:oldGoal,reference:{sha256}};
 assert.equal(productionFrameRequestIsCurrentV1({plan:result.plan,shot,request,unit:{visualIntake:{reference:{sha256}}}}),true);
 assert.equal(researchStaticSampleIsCurrentV1({plan:result.plan,shot,candidate:{goalInputSha256:oldGoal},sample:{sourceFrame:1},referenceSha256:sha256}),true);
 assert.equal(researchStaticSampleIsCurrentV1({plan:result.plan,shot,candidate:{goalInputSha256:oldGoal},sample:{sourceFrame:2},referenceSha256:sha256}),false);
 assert.equal(researchStaticSampleIsCurrentV1({plan:result.plan,shot,candidate:{},sample:{sourceFrame:2},referenceSha256:sha256}),false,'legacy receipts cannot silently qualify newly bound state text');
 const forged=structuredClone(shot);forged.stateCopyBindings.HOLD.copyBindings[0].externalFactVerification=true;
 assert.throws(()=>verifyReferenceStateCopyBindingV1({repoRoot:root,plan:result.plan,shot:forged,state:'HOLD'}),/AUTHORITY_CHANGED/);
 const repeated=prepareReferenceStateCopyV1({repoRoot:root,taskRoot:dir,plan:result.plan,unit});assert.equal(repeated.assignment.reused,true);assert.deepEqual(repeated.plan,result.plan);
 verifyReferenceStateCopyBindingV1({repoRoot:root,plan:result.plan,shot,state:'HOLD'});
 assert.throws(()=>prepareReferenceStateCopyV1({repoRoot:root,taskRoot:dir,plan:result.plan,unit:{...unit,copy:['不同的新字'],sourceTranscription:'不同的新字'}}),/CHANGED_REVIEW_REQUIRED/);
 assert.throws(()=>prepareReferenceStateCopyV1({repoRoot:root,taskRoot:dir,plan,unit:{...unit,layerCopyBindings:[{layerId:'old-text',copyIndex:0}]}}),/LAYER_MAPPING/);
 assert.throws(()=>prepareReferenceStateCopyV1({repoRoot:root,taskRoot:dir,plan,unit:{...unit,sourceTranscription:'Unrelated'}}),/COPY_INPUT/);
 assert.throws(()=>prepareReferenceStateCopyV1({repoRoot:root,taskRoot:dir,plan,unit:{...unit,state:'ENTRY',visualIntake:{...unit.visualIntake,reference:refs[0]},layerCopyBindings:[{layerId:'old-text',copyIndex:0}]}}),/ALREADY_BOUND/);
 const generated=compileFullFrameRequestsV1({repoRoot:root,taskRoot:dir,plan:result.plan,units:[{shotId:'scene',state:'HOLD',brief:'新状态展示'+newCopy,transparentBackground:false,assetIds:[],protectedCores:[],
   contentPlan:{referenceKind:'TYPOGRAPHY_EVENT',subject:newCopy,action:'读出当前状态',viewerTakeaway:newCopy,sourceAnchor:newCopy,requiredVisibleAnchors:[newCopy],treatment:'REBUILD_EDITORIAL'}}]});
 assert.deepEqual(generated.plan.assetTasks[0].tasks[0].parameters.generationRequest.exactCopy,[newCopy]);
 assert.equal(generated.assignments[0].goalInputSha256,productionFrameGoalShaV1(result.plan,shot,'HOLD'));
 const replacing=structuredClone(generated.plan),replacingShot=replacing.shots[0];
 replacingShot.productionRevisionRequest={requestId:'d'.repeat(64),status:'OPEN',states:['HOLD'],text:'Use only the visibly complete prefix',basePlanSha256:nodeInputHash(replacing),requestedAt:'2026-10-13T00:00:00Z',productionAdmission:false};
 const replacementUnit={...unit,wholeFrameCopy:true,copy:[newCopy.slice(0,1)],sourceTranscription:newCopy.slice(0,1),replaceSourceInput:{revisionId:replacingShot.productionRevisionRequest.requestId,previousCopySha256:nodeInputHash(replacingShot.exactCopy),requests:replacingShot.fullFrameRequests.filter(r=>r.state==='HOLD').map(r=>({state:r.state,requestSha256:r.requestSha256}))}};
 const replaced=await prepareStateReferenceCopyReplacementV1({repoRoot:root,taskRoot:dir,plan:replacing,unit:replacementUnit});
 verifyReferenceStateCopyBindingV1({repoRoot:root,plan:replaced.plan,shot:replaced.plan.shots[0],state:'HOLD'});
 assert.equal(productionFrameGoalShaV1(replaced.plan,replaced.plan.shots[0],'ENTRY'),productionFrameGoalShaV1(replacing,replacingShot,'ENTRY'));
 assert.equal(replaced.plan.shots[0].fullFrameRequests.some(r=>r.state==='HOLD'),false,'old producer is retained only in history after literal replacement');
 assert.ok(replaced.plan.shots[0].stateSourceInputHistory.some(h=>h.retired&&h.state==='HOLD'));
 await assert.rejects(prepareStateReferenceCopyReplacementV1({repoRoot:root,taskRoot:dir,plan:replacing,unit:{...replacementUnit,replaceSourceInput:{...replacementUnit.replaceSourceInput,revisionId:'e'.repeat(64)}}}),/REVISION_BINDING_REQUIRED/);
 const typed=structuredClone(result.plan);typed.scope='RESEARCH_ONLY';typed.productionAdmission=false;
 typed.shots[0].tasks=[{module:'editable-typography',dependencies:[],parameters:{exactCopy:oldCopy}}];
 compileShotTaskWorkspaceV1(typed);
 const badType=structuredClone(typed);badType.shots[0].tasks[0].parameters.exactCopy='unbound copy';
 assert.throws(()=>compileShotTaskWorkspaceV1(badType),/exact-copy-mismatch/);
 // Real source transition fixtures include the old font task, which the first live integration exposed.
 const initial=structuredClone(before);initial.scope='RESEARCH_ONLY';initial.productionAdmission=false;
 initial.shots[0].tasks=typed.shots[0].tasks;
 fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(initial));
 syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(initial)});
 const sourceUnits=path.join(dir,'units.json');fs.writeFileSync(sourceUnits,JSON.stringify({units:[unit]}));
 activateProductionPhaseV1({repoRoot:root,taskId,phaseId:'own-copy-'+genre,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Pure source transition fixture, no provider',shotIds:['scene'],metadata:{units:{path:sourceUnits,sha256:hash(fs.readFileSync(sourceUnits))}}});
 await adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId:'own-copy-'+genre});
 assert.equal(readShotTaskRuntimeV1({repoRoot:root,taskId}).pending,false);
 const planBytes=fs.readFileSync(path.join(dir,'shot-task-plan-v1.json'));
 assert.throws(()=>preflightShotTaskPlanV1({repoRoot:root,taskId,plan:badType}),/exact-copy-mismatch/);
 assert.deepEqual(fs.readFileSync(path.join(dir,'shot-task-plan-v1.json')),planBytes,'failed preflight must not modify authoritative plan');
 fs.appendFileSync(image,'changed');assert.throws(()=>verifyReferenceStateCopyBindingV1({repoRoot:root,plan:result.plan,shot,state:'HOLD'}),/BYTES_CHANGED/);fs.writeFileSync(image,imageBytes);
 const authority=path.resolve(root,shot.stateCopyBindings.HOLD.authority.path);fs.appendFileSync(authority,'changed');assert.throws(()=>verifyReferenceStateCopyBindingV1({repoRoot:root,plan:result.plan,shot,state:'HOLD'}),/BYTES_CHANGED/);
 fixtures.push({id:genre,genre,status:'PASS',unaffectedStatesPreserved:true,stateGoalIsolation:true,generatorReceivesOnlyStateCopy:true,normalTransitionRuntimeSynced:true});
}
const report={status:'PASS',fixtures,verificationScope:'SOURCE_BINDING_AND_REQUEST_COMPILATION_FIXTURES_NOT_VISUAL_APPROVAL',checks:['source-frame-SHA','own-state-layer-mapping','old-copy-and-state-preservation','state-goal-isolation','idempotent-binding','bound-copy-replacement-denied','missing-transcription-denied','source-and-authority-byte-drift','only-own-state-copy-in-generator-request'],newProviderCalls:0,productionAdmission:false};
console.log(JSON.stringify(report));
if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
} finally {fs.rmSync(root,{recursive:true,force:true});}
