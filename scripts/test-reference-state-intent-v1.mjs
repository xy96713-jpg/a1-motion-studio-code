import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {verifyReferenceStateIntentsV1,readReferenceStateIntentsV1} from '../apps/studio-next/src/lib/a1-reference-state-intent-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {adoptSourcedFrameInputsV1,compileFullFrameRequestsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {runProductionFramePlannerV1,productionFramePrerequisitesV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'state-intent-'))),fixtures=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');return {path:path.relative(root,file),sha256:hash(fs.readFileSync(file))};};
try{
for(const genre of ['typography','editorial-comparison','source-explainer']){
 const taskId='intent-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
 const ref=path.join(dir,'reference.png');fs.writeFileSync(ref,'source fixture bytes '+genre);const refSha=hash(fs.readFileSync(ref));
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'a'.repeat(64)},
 visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
 shots:[{id:'scene',sourceText:'A comparison builds in source',visualJob:'Read the relationship',sourceInterval:{startFrame:0,endFrameExclusive:4},exactCopy:['Left','Right'],tasks:[{module:'media-files',dependencies:[],parameters:{files:[]},blocker:'FIXTURE_ONLY'}]}]};
 const evidence=save(path.join(dir,'coverage','evidence.json'),{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:plan.source.videoSha256},stateFrames:{scene:['ENTRY','HOLD','HANDOFF'].map((state,i)=>({state,sourceFrame:i+1,artifactPath:'reference.png',artifactSha256:refSha}))}});
 const review={contract:'A1ReferenceStateIntentReview/v1',shotId:'scene',sourceVideoSha256:plan.source.videoSha256,reviewedBy:'fixture-source-reviewer',exactCopy:plan.shots[0].exactCopy,referenceEvidence:evidence,
 states:['ENTRY','HOLD','HANDOFF'].map((state,i)=>({state,reference:{state,sourceFrame:i+1,path:ref,sha256:refSha},viewerNotice:i?'Both labels remain':'Only a partial shape is visible',viewerChange:i?'Read and retain the comparison':'Notice the arriving fragment',sequenceRole:i?'Comparison hold':'Establish',handoff:'Continue to the next source-bound idea',visibleCopyIndices:i?[0,1]:[],copyObservation:i?'LOCKED_VISIBLE':'PARTIAL_NOT_READABLE',baseMediaStatus:'SEPARATE_SOURCE_INTEGRATION_REQUIRED',geometryStatus:'UNMEASURED',motionStatus:'UNMEASURED'})),productionAdmission:false,visualApproval:false,motionApproved:false};
 const checked=verifyReferenceStateIntentsV1({repoRoot:root,plan,shot:plan.shots[0],review});assert.equal(checked.states.length,3);assert.equal(checked.scope,'SOURCE_INTENT_ONLY_NOT_EXECUTION_DESIGN');
 const guessed=structuredClone(review);guessed.states[0].visibleCopyIndices=[0];assert.throws(()=>verifyReferenceStateIntentsV1({repoRoot:root,plan,shot:plan.shots[0],review:guessed}),/STATE_INVALID/);
 const timing=structuredClone(review);timing.states[1].motionStatus='APPROVED';assert.throws(()=>verifyReferenceStateIntentsV1({repoRoot:root,plan,shot:plan.shots[0],review:timing}),/STATE_INVALID/);
 const wrong=structuredClone(review);wrong.states[1].reference.sourceFrame=3;assert.throws(()=>verifyReferenceStateIntentsV1({repoRoot:root,plan,shot:plan.shots[0],review:wrong}),/STATE_INVALID/);
 const copy=structuredClone(review);copy.exactCopy=['different'];assert.throws(()=>verifyReferenceStateIntentsV1({repoRoot:root,plan,shot:plan.shots[0],review:copy}),/REVIEW_BINDING/);
 save(path.join(dir,'shot-task-plan-v1.json'),plan);syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
 const reviewFile=save(path.join(dir,'review.json'),review),units=save(path.join(dir,'units.json'),{units:[{shotId:'scene',copyMode:'REFERENCE_STATE_INTENTS',review:reviewFile}]});
 const phaseId='adopt-'+genre;activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Pure source-intent fixture',shotIds:['scene'],metadata:{units}});
 await adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId});const runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});assert.equal(runtime.pending,false);
 const after=runtime.plan.shots[0];assert.deepEqual(after.tasks,plan.shots[0].tasks);assert.deepEqual(after.exactCopy,plan.shots[0].exactCopy);assert.equal(after.referenceProductionDesign,undefined);
 assert.equal(readReferenceStateIntentsV1({repoRoot:root,plan:runtime.plan,shot:after}).states[0].visibleCopyIndices.length,0);
 assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot:dir,plan:runtime.plan,units:[{shotId:'scene',state:'HOLD'}]}),/NOT_EXECUTION_DESIGN/);
 const target={shotId:'scene',state:'HOLD',targetKey:'scene:HOLD',reference:review.states[1].reference,sourceIntent:review.states[1]};
 const gap=productionFramePrerequisitesV1({plan:runtime.plan,target});assert.equal(gap.gaps[0].kind,'EXECUTION_DESIGN');
 const resolved=structuredClone(runtime.plan);resolved.shots[0].referenceProductionDesign={references:[structuredClone(target.reference)],states:[{state:'HOLD',visibleCopyIndices:[0,1]}]};
 assert.equal(productionFramePrerequisitesV1({plan:resolved,target}).gaps.length,0,'a matching execution design removes this precise prerequisite; it does not prove media or motion');
 assert.notEqual(productionFramePrerequisitesV1({plan:resolved,target}).inputSha256,gap.inputSha256);
 resolved.shots[0].referenceProductionDesign.references[0].sha256='b'.repeat(64);
 assert.equal(productionFramePrerequisitesV1({plan:resolved,target}).gaps.length,1,'a mismatched source frame cannot remove the gap');
 const faceless=structuredClone(runtime.plan);
 faceless.editorialBrief={contract:'A1ProductionEditorialBrief/v1',contentMode:'FACTUAL_ADAPTATION',presentationMode:'FACELESS',objective:'Source-bound authored adaptation',authorizationEvidence:'User authorized fixture adaptation',sourceIdentity:workScopeSourceIdentityV1(faceless),productionAdmission:false,visualApproval:false,copyApproval:false};
 const authoredTarget={...target,exactCopy:faceless.shots[0].exactCopy,reviewedCopy:{status:'REVIEWED_RESEARCH_COPY_BYTES_BOUND'}};
 assert.equal(productionFramePrerequisitesV1({plan:faceless,target:authoredTarget}).gaps.length,0,'checked authored copy permits planning a fresh faceless state, without claiming an execution design already exists');
 assert.equal(productionFramePrerequisitesV1({plan:faceless,target:{...authoredTarget,reviewedCopy:{status:'NOT_BOUND'}}}).gaps.length,1,'unverified copy cannot remove the planning prerequisite');
 assert.equal(productionFramePrerequisitesV1({plan:faceless,target:{...authoredTarget,sourceClaimReview:{receipt:{sha256:'a'.repeat(64)},factualGaps:[{reason:'Unsupported claim'}]}}}).gaps[0].kind,'SOURCE_CLAIM','factual gaps remain hard');
 const authoredUnit={shotId:'scene',state:'HOLD',brief:'Preserve Left and Right in an authored comparison',contentPlan:{referenceKind:'EDITORIAL_INFOGRAPHIC',subject:'Left and Right',action:'Compare the source-bound labels',viewerTakeaway:'Read Left and Right',sourceAnchor:'Left',requiredVisibleAnchors:['Left','Right'],treatment:'REBUILD_EDITORIAL'},visualIntake:{contract:'A1WholeFrameVisualIntake/v1',reviewerRole:'AGENT',reviewerId:'fixture',sourceCorePolicy:'ORIGINAL_ILLUSTRATION_NO_NATIVE_EVIDENCE',referenceEvidence:evidence,reference:review.states[1].reference,visibleCopyIndices:[0,1],viewerIntent:'Read the authored comparison',appearance:{composition:'Two labels',palette:'Neutral',surface:'Flat'}}};
 const authored=compileFullFrameRequestsV1({repoRoot:root,taskRoot:dir,plan:faceless,units:[authoredUnit]});
 assert.equal(authored.assignments[0].state,'HOLD');
 assert.deepEqual(authored.plan.shots[0].referenceStateIntents,faceless.shots[0].referenceStateIntents,'authored execution intake preserves the source observation byte binding');
 assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot:dir,plan:faceless,units:[{...authoredUnit,visualIntake:{...authoredUnit.visualIntake,reference:{...authoredUnit.visualIntake.reference,sha256:'b'.repeat(64)}}}]}),/EVIDENCE_MISMATCH/);
 faceless.shots[0].referenceProductionDesign=resolved.shots[0].referenceProductionDesign;
 assert.equal(productionFramePrerequisitesV1({plan:faceless,target:authoredTarget}).gaps.length,1,'authored planning cannot forgive a mismatched reference');
 const preflight='preflight-'+genre;activateProductionPhaseV1({repoRoot:root,taskId,phaseId:preflight,purpose:'STATIC_FRAME_PLANNING',ownerThreadId:'fixture',approvalEvidence:'Pure source prerequisite fixture',shotIds:['scene'],metadata:{targets:['scene:ENTRY','scene:HOLD','scene:HANDOFF'],referenceEvidence:evidence,sourcePreflightOnly:true,maximumModelPasses:0}});
 let modelCalls=0;const proposal=await runProductionFramePlannerV1({repoRoot:root,taskId,phaseId:preflight,executable:'/usr/bin/true',runVisualPass:async()=>{modelCalls++;throw Error('unexpected model');}});
 assert.equal(modelCalls,0);assert.equal(proposal.waiting.length,3);assert.equal(proposal.newModelCalls,0);assert.ok(proposal.prerequisites.every(p=>p.gaps[0].kind==='EXECUTION_DESIGN'));
 fs.appendFileSync(ref,'changed');assert.throws(()=>readReferenceStateIntentsV1({repoRoot:root,plan:runtime.plan,shot:after}),/SOURCE_CHANGED/);
 fixtures.push({id:genre,genre,status:'PASS',normalSourceAdoption:true,sourceStatesBound:true,oldTasksAndCopyPreserved:true,notExecutionDesign:true,knownGapModelCalls:0});
}
const result={status:'PASS',fixtures,checks:['reference-and-own-state-source-binding','partial-copy-not-invented','no-motion-or-geometry-approval','normal-source-transition','old-tasks-and-copy-preserved','source-intent-not-execution-design','source-byte-drift'],verificationScope:'SOURCE_INTENT_CONTRACT_NOT_GENERATED_OR_RENDERED_VISUAL_PROOF',productionAdmission:false};console.log(JSON.stringify(result));
if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
}finally{fs.rmSync(root,{recursive:true,force:true});}
