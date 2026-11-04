import assert from 'node:assert/strict';
import {reconcileReviewedStaticFramesV1,verifyStaticReuseSelectionV1,hasCompleteRegisteredStaticReuseV1,researchStaticSampleIsCurrentV1} from '../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
const sha='a'.repeat(64),image='b'.repeat(64),reference='c'.repeat(64);
const plan={projectId:'unseen',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:sha},shots:[{id:'S1',tasks:[{module:'media-files',parameters:{}}]},{id:'S2',tasks:[{module:'media-files',parameters:{}}]}]};
const projection={taskId:'unseen',productionAdmission:false,input:{sourceVideoSha256:sha},sequences:[{sequenceId:'S1',referenceAnchors:[{state:'HOLD',sourceFrame:10}]}],artifacts:[{id:'image',sha256:image,status:'VERIFIED',sha256VerifiedNow:true},{id:'ref',sha256:reference,status:'VERIFIED',sha256VerifiedNow:true}],candidates:[{id:'old',sequenceIds:['S1'],mediaClass:'STATIC_FRAME_SET',currentLocalCandidate:true,status:'REVIEWED',localReview:{status:'PASS'},coverageScope:'RESEARCH_SUBFRAGMENT',staticSamples:[{sourceFrame:8,localFrame:4,imageArtifactId:'image',referenceArtifactId:'ref'}]}]};
const result=reconcileReviewedStaticFramesV1({plan,projection});assert.equal(result.changedShotIds.length,1);assert.deepEqual(result.plan.shots[0].tasks,plan.shots[0].tasks);assert.deepEqual(result.plan.shots[1],plan.shots[1]);
assert.deepEqual(reconcileReviewedStaticFramesV1({plan,projection,shotIds:['S2']}).changedShotIds,[],'a scoped reconciliation does not alter another shot');
assert.throws(()=>reconcileReviewedStaticFramesV1({plan,projection,shotIds:['missing']}),/TARGET_SCOPE/);
const selection=result.plan.shots[0].staticReuseSelection;assert.equal(selection.frames[0].state,'SUBSEGMENT');assert.equal(selection.frames[0].sourceFrame,8);assert.equal(selection.frames[0].localFrame,4);assert.equal(selection.wholeShotApproved,false);assert.ok(verifyStaticReuseSelectionV1({selection,shotId:'S1',projection}));
const drift=structuredClone(projection);drift.artifacts[0].sha256='d'.repeat(64);assert.equal(verifyStaticReuseSelectionV1({selection,shotId:'S1',projection:drift}),false);
for(const change of [p=>p.candidates[0].localReview.status='VISUAL_FAIL',p=>p.candidates[0].status='STALE',p=>p.artifacts[0].sha256VerifiedNow=false,p=>p.artifacts[1].sha256VerifiedNow=false]){const p=structuredClone(projection);change(p);assert.equal(reconcileReviewedStaticFramesV1({plan,projection:p}).changedShotIds.length,0);}
assert.throws(()=>reconcileReviewedStaticFramesV1({plan,projection:{...projection,input:{sourceVideoSha256:image}}}),/SCOPE/);
const newer=structuredClone(projection);newer.artifacts.push({id:'new',sha256:'e'.repeat(64),status:'VERIFIED',sha256VerifiedNow:true});newer.candidates.push({...structuredClone(newer.candidates[0]),id:'new',staticSamples:[{sourceFrame:8,localFrame:4,imageArtifactId:'new',referenceArtifactId:'ref'}]});
const selected=structuredClone(plan);selected.shots[0].staticOutputSelection={candidateId:'old'};
assert.equal(reconcileReviewedStaticFramesV1({plan:selected,projection:newer}).plan.shots[0].staticReuseSelection.frames[0].candidateId,'old');
assert.equal(reconcileReviewedStaticFramesV1({plan,projection:newer}).plan.shots[0].staticReuseSelection.frames[0].candidateId,'new');
const again=reconcileReviewedStaticFramesV1({plan:result.plan,projection});assert.deepEqual(again.changedShotIds,[]);
console.log('PASS bulk reuse: private source scope, subsegment preservation, explicit selection, drift rejection, unchanged inputs, idempotence');
const frozen=reconcileReviewedStaticFramesV1({plan:result.plan,projection:newer});
assert.equal(frozen.plan.shots[0].staticReuseSelection.frames[0].candidateId,'old','preserve a valid selected scope when a new alternative appears');
assert.deepEqual(frozen.changedShotIds,[]);
const replacement=structuredClone(result.plan);replacement.shots[0].staticOutputSelection={candidateId:'new'};
assert.equal(reconcileReviewedStaticFramesV1({plan:replacement,projection:newer}).plan.shots[0].staticReuseSelection.frames[0].candidateId,'new','an explicit selection may replace the retained choice');
console.log('PASS existing selected pixels remain frozen unless an explicit replacement is selected.');
const completeProjection=structuredClone(projection);
completeProjection.sequences[0].referenceAnchors=['ENTRY','HOLD','HANDOFF'].map((state,i)=>({state,sourceFrame:10+i}));
completeProjection.candidates[0].staticSamples=[10,11,12].map(sourceFrame=>({sourceFrame,imageArtifactId:'image',referenceArtifactId:'ref'}));
const complete=reconcileReviewedStaticFramesV1({plan,projection:completeProjection});
assert.equal(hasCompleteRegisteredStaticReuseV1(complete.plan,complete.plan.shots[0]),true);
const scopedRequired=structuredClone(complete.plan);
scopedRequired.shots[0].fullFrameStateFocus={activeStates:['HOLD'],excludedStates:[],requiredStates:[{state:'HANDOFF',sourceFrame:999}]};
assert.equal(hasCompleteRegisteredStaticReuseV1(scopedRequired,scopedRequired.shots[0]),false,'active HOLD cannot erase an unfulfilled required handoff');
assert.equal(hasCompleteRegisteredStaticReuseV1(result.plan,result.plan.shots[0]),false,'a subsegment does not complete a shot recipe');
for(const mutate of [s=>s.exactCopy=['changed copy'],s=>s.sourceText='changed source',s=>s.visualJob='changed intent',s=>s.productionRevisionRequest={status:'OPEN'}]){
  const changed=structuredClone(complete.plan);mutate(changed.shots[0]);assert.equal(hasCompleteRegisteredStaticReuseV1(changed,changed.shots[0]),false);
}
const missing=structuredClone(complete.plan);missing.shots[0].staticReuseSelection.frames.pop();
assert.equal(hasCompleteRegisteredStaticReuseV1(missing,missing.shots[0]),false);
const cleanProjection=structuredClone(completeProjection);cleanProjection.candidates[0].staticSamples.pop();
const cleanPlan=structuredClone(plan);cleanPlan.shots[0].statePackagingDecisions=[{state:'HANDOFF',sourceFrame:12,sourceVideoSha256:sha,referenceSha256:reference,referencePath:'/fixture/reference.png',packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false}];
const clean=reconcileReviewedStaticFramesV1({plan:cleanPlan,projection:cleanProjection});
assert.equal(hasCompleteRegisteredStaticReuseV1(clean.plan,clean.plan.shots[0]),true,'a source-bound clean handoff carries no package debt');
const notClean=structuredClone(clean.plan);notClean.shots[0].statePackagingDecisions[0].packagingElementsVisible=true;
assert.equal(hasCompleteRegisteredStaticReuseV1(notClean,notClean.shots[0]),false);
console.log('PASS complete static reuse requires all planned states and unchanged copy/source/intent; revisions and partial samples cannot advance.');
for(const genre of ['evidence','product','opinion']){
  const adapted=structuredClone(complete.plan);
  adapted.editorialBrief={contract:'A1ProductionEditorialBrief/v1',contentMode:'FACTUAL_ADAPTATION',presentationMode:'FACELESS',objective:'Adapt '+genre,
    authorizationEvidence:'Explicit fixture authorization',sourceIdentity:workScopeSourceIdentityV1(adapted),copyApproval:false,visualApproval:false,productionAdmission:false};
  const shot=adapted.shots[0],candidate=completeProjection.candidates[0],sample=candidate.staticSamples[1];
  assert.equal(hasCompleteRegisteredStaticReuseV1(adapted,shot),false,'old reuse identity does not include the new brief');
  assert.equal(researchStaticSampleIsCurrentV1({plan:adapted,shot,candidate,sample,imageSha256:image,referenceSha256:reference}),false,'legacy PASS is not new adaptation approval');
  const goal=productionFrameGoalShaV1(adapted,shot,'HOLD');
  const goalBound={...candidate,goalInputSha256:goal};
  assert.equal(researchStaticSampleIsCurrentV1({plan:adapted,shot,candidate:goalBound,sample:{...sample,state:'HOLD'},imageSha256:image,referenceSha256:reference}),true,'explicit state and current-goal review can qualify identical retained bytes');
  shot.fullFrameRequests=[{state:'HOLD',reference:{sourceFrame:11,sha256:reference},goalInputSha256:goal,expectedImageSha256:image}];
  assert.equal(researchStaticSampleIsCurrentV1({plan:adapted,shot,candidate,sample,imageSha256:image,referenceSha256:reference}),true,'normal current cached-frame request can requalify exact image/reference bytes');
  assert.equal(researchStaticSampleIsCurrentV1({plan:adapted,shot,candidate,sample,imageSha256:'d'.repeat(64),referenceSha256:reference}),false);
}
console.log('PASS three genre briefs reject legacy goal-free PASS; only current state/goal or exact normally rebound frame bytes qualify.');
