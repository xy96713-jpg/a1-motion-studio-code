import assert from 'node:assert/strict';
import {compileResearchProductionWorkOrderV1, packagingStaticCoverageV1} from '../apps/studio-next/src/lib/a1-research-production-work-order-v1.mjs';
const sha = 'a'.repeat(64);
const packagingScope = {activeWorkScope: {referencePackagingOnly: true, shotIds: ['pack', 'clean', 'failed']}};
const coverageShots = [
  {shotId: 'pack', anchors: [{state: 'ENTRY', status: 'CORE_ONLY', imageArtifactId: 'core', candidateId: 'current'}, {state: 'HOLD', status: 'PASS', imageArtifactId: 'frame', candidateId: 'current'}, {state: 'HANDOFF', status: 'NO_PACKAGE'}]},
  {shotId: 'clean', anchors: ['ENTRY', 'HOLD', 'HANDOFF'].map(state => ({state, status: 'NO_PACKAGE'}))},
  {shotId: 'failed', anchors: [{state: 'ENTRY', status: 'VISUAL_FAIL', imageArtifactId: 'failed', candidateId: 'failed'}, {state: 'HOLD', status: 'CORE_ONLY', imageArtifactId: null, candidateId: 'lost'}]},
  {shotId: 'outside', anchors: ['ENTRY', 'HOLD', 'HANDOFF'].map(state => ({state, status: 'PASS', imageArtifactId: 'old', candidateId: 'old'}))},
];
assert.deepEqual(packagingStaticCoverageV1(packagingScope, coverageShots), {scope: 'REFERENCE_PACKAGING_ONLY', shotCount: 3, requiredStates: 5, reviewedStates: 2, missingStates: 3, excludedStates: 4, coveredShots: 2, wholeBoardApproved: false, sameRecipeContinuityVerified: false, productionAdmission: false});
assert.equal(packagingStaticCoverageV1({}, coverageShots), null, 'ordinary full-frame work cannot use core-only coverage');
const duplicateCoverage = structuredClone(coverageShots);
duplicateCoverage[0].anchors.push({...duplicateCoverage[0].anchors[0]});
assert.equal(packagingStaticCoverageV1(packagingScope, duplicateCoverage).reviewedStates, 1, 'ambiguous state cannot inflate packaging progress');
const plan = {contract: 'A1ShotTaskPlan/v1', projectId: 'unseen-film', scope: 'RESEARCH_ONLY', productionAdmission: false,
  source: {videoSha256: sha}, shots: ['X1', 'X2', 'X3'].map(id => ({id, sourceText: '内容', tasks: [{module: 'media-files', parameters: {files: [{sha256: sha, assetId: 'shared', referenceOnly: false}]} }]}))};
const projection = {contract: 'A1SystemLineResearchTaskProjection/v1', taskId: 'unseen-film', productionAdmission: false,
  input: {sourceVideoSha256: sha}, manifestSha256: sha, sha256: sha, summary: {visuallyAcceptedCount: 0},
  sequences: plan.shots.map((shot, order) => ({sequenceId: shot.id, order, sourceTimeSeconds: [order, order + 1], blockers: [], referenceAnchors:
    [{state: 'ENTRY', sourceFrame: 0}, {state: 'HOLD', sourceFrame: 30}, {state: 'HANDOFF', sourceFrame: 60}]})),
  artifacts: ['image', 'reference'].map(id => ({id, path: `${id}.png`, status: 'VERIFIED', sha256VerifiedNow: true})),
  candidates: [{id: 'current', status: 'PARTIAL_PASS', currentLocalCandidate: true, sequenceIds: ['X1'], mediaClass: 'STATIC_FRAME_SET', localReview: {status: 'PASS'},
    staticSamples: [0, 30].map(sourceFrame => ({sourceFrame, imageArtifactId: 'image', referenceArtifactId: 'reference'}))}]};
const result = compileResearchProductionWorkOrderV1({plan, projection});
assert.deepEqual(result.shots.map(shot => shot.shotId), ['X1', 'X2', 'X3']);
assert.equal(result.batches.length, 1); assert.equal(result.batches[0].jobs.length, 3);
assert.equal(result.summary.uniqueMaterials, 1); assert.equal(result.summary.reuseBindings, 2);
assert.deepEqual(result.priorityRepairs, [{shotId: 'X1', missingStates: ['HANDOFF']}]);
assert.ok(result.shots.every(shot => shot.wholeShotApproved === false));
assert.ok(result.batches.every(batch => batch.dispatchAuthorized === false));
assert.equal(result.shots[1].packagingDecision, 'UNDECIDED', 'missing decision is not automatically NO_PACKAGE');
const failedCore=structuredClone(projection);
failedCore.candidates[0].localReview.status='VISUAL_FAIL';
failedCore.candidates[0].blockers=['CORE_ONLY_WHOLE_ANCHOR_MISSING_SOURCE'];
for(const sample of failedCore.candidates[0].staticSamples)sample.coreOnlyReview={status:'VISUAL_FAIL',label:'Failed scoped core'};
const failedCoreOrder=compileResearchProductionWorkOrderV1({plan,projection:failedCore});
assert.equal(failedCoreOrder.shots[0].anchors[0].status,'VISUAL_FAIL','a scoped failure must not become CORE_ONLY pass credit');
assert.equal(failedCoreOrder.shots[0].hasLocalCorePass,false);
assert.equal(failedCoreOrder.shots[0].localPassAnchors,0);
const drift = structuredClone(projection); drift.candidates[0].status = 'STALE_INPUT_SHA_REVIEW_ONLY';
assert.equal(compileResearchProductionWorkOrderV1({plan, projection: drift}).shots[0].mainImageArtifactId, null);
const invalid = structuredClone(projection); invalid.artifacts[0].status = 'STATIC_DEPENDENCY_INVALID';
assert.equal(compileResearchProductionWorkOrderV1({plan, projection: invalid}).shots[0].mainImageArtifactId, null);
const segment = structuredClone(projection); segment.candidates[0].staticSamples[0].sourceFrame = 10; segment.candidates[0].staticSamples[1].sourceFrame = 20;
const partial = compileResearchProductionWorkOrderV1({plan, projection: segment});
assert.equal(partial.shots[0].mainImageRole, 'SUBSEGMENT_ONLY'); assert.equal(partial.shots[0].localPassAnchors, 0);
assert.equal(partial.shots[0].additionalSamples.length, 2);
assert.throws(() => compileResearchProductionWorkOrderV1({plan: {...plan, source: {videoSha256: 'b'.repeat(64)}}, projection}), /input-invalid/);
assert.throws(() => compileResearchProductionWorkOrderV1({plan: {...plan, shots: [...plan.shots, plan.shots[0]]}, projection}), /identity-invalid/);
assert.throws(() => compileResearchProductionWorkOrderV1({plan: {...plan, shots: plan.shots.slice(1)}, projection}), /incomplete-timeline/);
console.log(JSON.stringify({status: 'PASS', checks: ['ordered-timeline', 'compatible-module-batches', 'unique-source-reuse', 'repair-existing-first',
  'missing-decisions-explicit', 'no-three-state-approval', 'stale-and-invalid-pixels-excluded', 'subsegment-not-whole-anchor', 'source-identity', 'complete-shot-coverage']}));

const scoped = structuredClone(projection);
scoped.candidates[0].coverageScope = 'RESEARCH_SUBFRAGMENT';
scoped.candidates[0].localReview.label = 'Table subsegment only';
scoped.candidates[0].staticSamples = [0, 30, 60].map(sourceFrame => ({sourceFrame,imageArtifactId:'image',referenceArtifactId:'reference'}));
const covered = compileResearchProductionWorkOrderV1({plan, projection: scoped}).shots[0];
assert.equal(covered.localPassAnchors,3);
assert.equal(covered.mainImageRole,'SUBSEGMENT_ONLY','matching all time anchors does not grant complete image coverage');
assert.equal(covered.reviewLabel,'Table subsegment only');
assert.ok(covered.anchors.every(anchor => anchor.coverageScope === 'RESEARCH_SUBFRAGMENT'));
assert.equal(covered.wholeShotApproved,false);
scoped.candidates[0].staticSamples = [{sourceFrame:60,imageArtifactId:'image',referenceArtifactId:'reference'}];
scoped.candidates[0].localReview.status = 'IMPROVED';
const handoff = compileResearchProductionWorkOrderV1({plan,projection:scoped}).shots[0];
assert.equal(handoff.mainImageArtifactId,'image','a present HANDOFF is not an empty shot when HOLD is missing');
assert.equal(handoff.mainImageState,'HANDOFF');
assert.equal(handoff.localPassAnchors,0,'unreviewed image is visible but not passed');
assert.ok(result.batches[0].jobs.every(job=>job.missingInputs.includes('PACKAGING_DECISION_UNRECORDED')));
console.log('PASS scoped coverage, handoff preview and planning gaps');
const rejected=structuredClone(projection);
rejected.artifacts.push({id:'rejected-image',path:'rejected.png',status:'VERIFIED',sha256VerifiedNow:true});
rejected.candidates.push({...structuredClone(rejected.candidates[0]),id:'rejected',localReview:{status:'VISUAL_FAIL',label:'Wrong reference layout'},staticSamples:[{sourceFrame:30,imageArtifactId:'rejected-image',referenceArtifactId:'reference'}]});
const retained=compileResearchProductionWorkOrderV1({plan,projection:rejected}).shots[0];
assert.equal(retained.mainImageArtifactId,'image','failed latest attempt must not replace retained local PASS');
assert.equal(retained.latestReview.status,'VISUAL_FAIL','latest failure must remain visible even with retained PASS');
assert.ok(retained.additionalSamples.some(s=>s.imageArtifactId==='rejected-image'));
const {bindResearchStaticPackageV1}=await import('../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs');
const reusable=structuredClone(projection);
reusable.artifacts.forEach(a=>{a.path='work/'+a.path;a.sha256=(a.id==='image'?'a':'b').repeat(64);a.bytes=20;});
reusable.candidates[0].coverageScope='RESEARCH_SUBFRAGMENT';reusable.candidates[0].localReview.label='Three local frames';
reusable.candidates[0].staticSamples=[0,30,60].map(sourceFrame=>({sourceFrame,imageArtifactId:'image',referenceArtifactId:'reference'}));
const boundPlan=bindResearchStaticPackageV1({repoRoot:'/repo',plan,projection:reusable,shotId:'X1',candidateId:'current'}).plan;
assert.equal(compileResearchProductionWorkOrderV1({plan:boundPlan,projection:reusable}).shots[0].selectedPackage.status,'BOUND_VERIFIED_EXISTING_PIXELS');
const changedPixels=structuredClone(reusable);changedPixels.artifacts[0].sha256='c'.repeat(64);
assert.equal(compileResearchProductionWorkOrderV1({plan:boundPlan,projection:changedPixels}).shots[0].selectedPackage.status,'STALE_OR_INVALID');
console.log('PASS selected package readback and pixel-drift rejection');
const outputPlan=structuredClone(boundPlan);
outputPlan.shots[0].staticOutputSelection={candidateId:'current',sourceVideoSha256:sha,samples:[0,30,60].map((sourceFrame,i)=>({state:['ENTRY','HOLD','HANDOFF'][i],sourceFrame,imageSha256:'a'.repeat(64)}))};
assert.equal(compileResearchProductionWorkOrderV1({plan:outputPlan,projection:reusable}).shots[0].selectedOutput.status,'REVIEWED_LOCAL_STATIC');
outputPlan.shots[0].staticOutputSelection.samples[1].imageSha256='f'.repeat(64);
assert.equal(compileResearchProductionWorkOrderV1({plan:outputPlan,projection:reusable}).shots[0].selectedOutput.status,'STALE_OR_INVALID');
outputPlan.shots[0].staticOutputSelection.samples[1].imageSha256='a'.repeat(64);outputPlan.shots[0].staticOutputSelection.selectionMode='REUSE_EXISTING';
assert.equal(compileResearchProductionWorkOrderV1({plan:outputPlan,projection:reusable}).shots[0].selectedOutput.status,'REUSED_REVIEWED_LOCAL_STATIC');

// A clean-presenter state is a scoped packaging decision, never a third PASS.
const cleanPlan=structuredClone(plan), cleanProjection=structuredClone(projection);
cleanProjection.artifacts.push({id:'clean-ref',path:'work/frame-00060.jpg',sha256:'c'.repeat(64),status:'VERIFIED',sha256VerifiedNow:true});
cleanPlan.shots[0].statePackagingDecisions=[{state:'HANDOFF',sourceFrame:60,sourceVideoSha256:sha,referenceSha256:'c'.repeat(64),packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false,reason:'Presenter only; subtitle belongs to base video.'}];
const clean=compileResearchProductionWorkOrderV1({plan:cleanPlan,projection:cleanProjection});
assert.equal(clean.shots[0].anchors[2].status,'NO_PACKAGE');
assert.equal(clean.shots[0].localPassAnchors,2);
assert.deepEqual(clean.shots[0].missingStates,[]);
assert.deepEqual(clean.priorityRepairs,[]);
assert.equal(clean.shots[0].wholeShotApproved,false);
for(const [key,value] of [['referenceSha256','d'.repeat(64)],['sourceFrame',61],['sourceVideoSha256','e'.repeat(64)],['packagingElementsVisible',true],['reason','']]){
 const invalidDecision=structuredClone(cleanPlan);invalidDecision.shots[0].statePackagingDecisions[0][key]=value;
 assert.equal(compileResearchProductionWorkOrderV1({plan:invalidDecision,projection:cleanProjection}).shots[0].anchors[2].status,'MISSING',key);
}
const unverifiedClean=structuredClone(cleanProjection);unverifiedClean.artifacts.at(-1).sha256VerifiedNow=false;
assert.equal(compileResearchProductionWorkOrderV1({plan:cleanPlan,projection:unverifiedClean}).shots[0].anchors[2].status,'MISSING');
console.log('PASS source-bound no-package state without fake visual credit');
const registeredClean=structuredClone(cleanProjection);
registeredClean.artifacts.forEach(a=>{a.status='REGISTERED_NOT_VERIFIED';a.sha256VerifiedNow=false;});
assert.equal(compileResearchProductionWorkOrderV1({plan:cleanPlan,projection:registeredClean,registeredOnly:true}).shots[0].anchors[2].status,'NO_PACKAGE');
assert.equal(compileResearchProductionWorkOrderV1({plan:cleanPlan,projection:registeredClean}).shots[0].anchors[2].status,'MISSING','review requires fresh reference verification');
const {researchStateReferenceBindingsV1}=await import('../work/hupo-69-shot-reconstruction-v1/build-research-task-manifest-v1.mjs');
const bindingShot={id:'unseen',sourceInterval:{startFrame:0,endFrameExclusive:100},statePackagingDecisions:[{...cleanPlan.shots[0].statePackagingDecisions[0],referencePath:'/repo/work/unseen-source/coverage/frame.jpg',reviewedBy:'fixture-reviewer'}]};
const bindingEvidence={source:{sha256:sha},stateFrames:{unseen:[{state:'HANDOFF',sourceFrame:60,artifactSha256:'c'.repeat(64),artifactPath:'coverage/frame.jpg'}]}};
const stateBindings=s=>researchStateReferenceBindingsV1({repoRoot:'/repo',studyRoot:'work/unseen-source',plan:cleanPlan,evidence:bindingEvidence,shot:s});
assert.deepEqual(stateBindings(bindingShot),[{path:'work/unseen-source/coverage/frame.jpg',sha256:'c'.repeat(64)}]);
for(const [key,value] of [['referencePath','/repo/work/other/frame.jpg'],['sourceVideoSha256','d'.repeat(64)],['sourceFrame',101]]){
 const bad=structuredClone(bindingShot);bad.statePackagingDecisions[0][key]=value;assert.throws(()=>stateBindings(bad),/research-state-reference/);
}
console.log('PASS clean-state references enter the existing verified manifest; registered overview stays distinct from fresh byte review');
const internalEnglish=structuredClone(plan);
internalEnglish.shots[0].referenceProductionDesign={viewerIntent:'Read the amount “约四千” as an explicitly adapted reference summary.'};
assert.equal(compileResearchProductionWorkOrderV1({plan:internalEnglish,projection,registeredOnly:true}).shots[0].displayTask,'内容','a Chinese quote inside an internal English instruction is not a Chinese user summary');
const {productionShotStageV1,productionShotNextActionV1}=await import('../apps/studio-next/src/lib/a1-research-production-presentation-v1.mjs');
assert.equal(productionShotStageV1(clean.shots[0]),'PACKAGE_STATES');
assert.match(productionShotNextActionV1(clean.shots[0]),/干净口播不补图/);
assert.notEqual(productionShotStageV1(clean.shots[0]),'CONTINUITY','two PASS and an exemption are not three PASS');
const {reconcileReviewedStaticFramesV1}=await import('../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs');
const bulkBound=reconcileReviewedStaticFramesV1({plan,projection:reusable}).plan;
const bulkView=compileResearchProductionWorkOrderV1({plan:bulkBound,projection:reusable});
assert.equal(bulkView.summary.boundReuseShots,1);
assert.equal(bulkView.shots[0].staticReuse.frameCount,3);
assert.equal(compileResearchProductionWorkOrderV1({plan:bulkBound,projection:changedPixels}).shots[0].staticReuse.status,'STALE_OR_INVALID');
console.log('PASS bulk reuse displayed from current verified evidence, not metadata alone');
// A reviewed repair must replace a retained pre-revision frame. Existing bytes
// and a historical PASS do not establish fitness for the revised goal.
const revisedPlan=structuredClone(bulkBound),revisedProjection=structuredClone(reusable);
const revisedShot=revisedPlan.shots[0];
revisedShot.productionRevisionRequest={requestId:'revision-1',text:'Remove narration subtitle',status:'DESIGN_BOUND'};
revisedShot.exactCopy=['Current title'];
const {productionFrameGoalShaV1}=await import('../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs');
revisedShot.fullFrameRequests=[{state:'HOLD',reference:{sourceFrame:30,sha256:'b'.repeat(64)},goalInputSha256:productionFrameGoalShaV1(revisedPlan,revisedShot),expectedImageSha256:'c'.repeat(64)}];
revisedShot.fullFrameStateFocus={activeStates:['HOLD'],excludedStates:['ENTRY','HANDOFF']};
revisedProjection.artifacts.push({id:'repair-image',path:'work/repair.png',sha256:'c'.repeat(64),bytes:20,status:'VERIFIED',sha256VerifiedNow:true});
revisedProjection.candidates.push({...structuredClone(revisedProjection.candidates[0]),id:'repair',staticSamples:[{sourceFrame:30,imageArtifactId:'repair-image',referenceArtifactId:'reference'}]});
const repairedView=compileResearchProductionWorkOrderV1({plan:revisedPlan,projection:revisedProjection}).shots[0];
assert.equal(repairedView.mainImageArtifactId,'repair-image','old retained PASS cannot hide a reviewed current repair');
assert.equal(repairedView.staticReuse.status,'STALE_OR_INVALID');
assert.equal(repairedView.localPassAnchors,1,'excluded historical states cannot fill current coverage');
assert.ok(repairedView.additionalSamples.some(s=>s.candidateId==='current'&&s.reviewStatus==='HISTORY_ONLY'),'original review evidence remains visible as history');
const noRepair=structuredClone(revisedProjection);noRepair.candidates.at(-1).localReview.status='VISUAL_FAIL';
assert.equal(compileResearchProductionWorkOrderV1({plan:revisedPlan,projection:noRepair}).shots[0].localPassAnchors,0,'a failed replacement never restores a stale PASS');
assert.notEqual(compileResearchProductionWorkOrderV1({plan:revisedPlan,projection:noRepair}).shots[0].mainImageArtifactId,'image','historical bytes cannot become the current fallback preview');
const wrongGoal=structuredClone(revisedProjection);wrongGoal.candidates.at(-1).goalInputSha256='d'.repeat(64);
assert.equal(compileResearchProductionWorkOrderV1({plan:revisedPlan,projection:wrongGoal}).shots[0].localPassAnchors,0,'matching pixels cannot override a mismatched explicit goal');
console.log('PASS revised goal invalidates retained history and limits current coverage to the reviewed state');
const queuedDesign=structuredClone(bulkBound);queuedDesign.shots[0].referenceIntakeScope={batchId:'unseen-family-batch'};
const preparation=compileResearchProductionWorkOrderV1({plan:queuedDesign,projection:reusable}).designBatches[0];
assert.equal(preparation.proposalCount,0,'batch membership does not claim a completed AI design');assert.equal(preparation.inputGapCount,1);assert.equal(preparation.reuseShotCount,1);assert.equal(preparation.dispatchAuthorized,false);

const retiredPlan=structuredClone(plan);
retiredPlan.shots[0].tasks.push({module:'image-generation',dependencies:[],blocker:'LEGACY_GENERATION_RETIRED',parameters:{generationRequest:{prompt:'old'}}});
const retiredOrder=compileResearchProductionWorkOrderV1({plan:retiredPlan,projection});
assert.ok(!retiredOrder.batches.flatMap(b=>b.jobs).some(j=>j.nodeId==='X1:image-generation'),'retired generation does not remain in the preparation queue');
const oldResult=structuredClone(plan);oldResult.shots[0].tasks.push({module:'image-generation',dependencies:[],parameters:{generatedResults:[{file:{sha256:'c'.repeat(64),slot:'existing-generated-layer',referenceOnly:false}}]}});
assert.ok(compileResearchProductionWorkOrderV1({plan:oldResult,projection}).reusableMaterials.some(m=>m.sha256==='c'.repeat(64)),'existing generated result bindings must appear in the shared material view');

// A packaging-only scope can defer three reviewed clean anchors without changing adaptation content.
const {workScopeSourceIdentityV1}=await import('../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs');
const packagingPlan=structuredClone(plan),packagingProjection=structuredClone(projection);
packagingProjection.candidates=[];packagingProjection.artifacts=[];
packagingPlan.shots[0].sourceInterval={startFrame:0,endFrameExclusive:61};
packagingPlan.shots[0].exactCopy=['Historical adaptation title'];
packagingPlan.shots[0].productionRevisionRequest={status:'OPEN',requestId:'later-adaptation',text:'Author a new card later'};
packagingPlan.editorialBrief={contract:'A1ProductionEditorialBrief/v1',contentMode:'FACTUAL_ADAPTATION',presentationMode:'FACELESS',objective:'Later adaptation',authorizationEvidence:'User fixture',sourceIdentity:workScopeSourceIdentityV1(packagingPlan),productionAdmission:false,copyApproval:false,visualApproval:false};
packagingPlan.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:['X1'],objective:'Reference packaging first',referencePackagingOnly:true,sourceIdentity:workScopeSourceIdentityV1(packagingPlan),productionAdmission:false};
packagingPlan.shots[0].statePackagingDecisions=['ENTRY','HOLD','HANDOFF'].map((state,i)=>{
 const sourceFrame=[0,30,60][i],filename=`work/frame-${String(sourceFrame).padStart(5,'0')}.jpg`,referenceSha256=String(i+1).repeat(64);
 packagingProjection.artifacts.push({id:state,path:filename,sha256:referenceSha256,status:'VERIFIED',sha256VerifiedNow:true});
 return {state,sourceFrame,sourceVideoSha256:sha,referenceSha256,referencePath:'/repo/'+filename,reviewedBy:'fixture',packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false,reason:'Source has no packaging'};
});
const packagingOrder=compileResearchProductionWorkOrderV1({repoRoot:'/repo',plan:packagingPlan,projection:packagingProjection});
assert.deepEqual(packagingOrder.shots[0].anchors.map(a=>a.status),['NO_PACKAGE','NO_PACKAGE','NO_PACKAGE']);
assert.equal(packagingOrder.shots[0].status,'CLEAN_PRESENTER_STATIC_EXCLUDED_THIS_PHASE');
assert.equal(packagingOrder.shots[0].baseMediaDelivered,false);assert.equal(packagingOrder.shots[0].newImageApproved,false);
assert.equal(packagingOrder.shots[0].localPassAnchors,0);assert.equal(packagingOrder.shots[0].wholeShotApproved,false);
assert.deepEqual(packagingOrder.shots[0].copy,['Historical adaptation title']);assert.deepEqual(packagingOrder.shots[0].modules,[]);
for(const artifact of packagingProjection.artifacts){
 const drift=structuredClone(packagingProjection);drift.artifacts.find(a=>a.id===artifact.id).sha256='f'.repeat(64);
 const staleOrder=compileResearchProductionWorkOrderV1({repoRoot:'/repo',plan:packagingPlan,projection:drift}).shots[0];
 assert.equal(staleOrder.anchors.filter(a=>a.status==='MISSING').length,1);
 assert.notEqual(staleOrder.status,'CLEAN_PRESENTER_STATIC_EXCLUDED_THIS_PHASE');
 assert.ok(staleOrder.modules.length>0,'partial clean states never retire the full shot work');
}
console.log('PASS packaging-only clean presenter exclusion requires all three current references; no new-image, source-media or whole-shot approval.');

const mixedPackagingPlan=structuredClone(packagingPlan);mixedPackagingPlan.shots[0].statePackagingDecisions.shift();
const mixedPackagingOrder=compileResearchProductionWorkOrderV1({repoRoot:'/repo',plan:mixedPackagingPlan,projection:packagingProjection}).shots[0];
assert.deepEqual(mixedPackagingOrder.anchors.map(a=>a.status),['MISSING','NO_PACKAGE','NO_PACKAGE']);
assert.deepEqual(mixedPackagingOrder.missingStates,['ENTRY']);assert.ok(mixedPackagingOrder.modules.length>0);
assert.equal(mixedPackagingOrder.localPassAnchors,0);assert.equal(mixedPackagingOrder.wholeShotApproved,false);
console.log('PASS mixed source shots show reviewed clean states while packaged states remain pending and full-shot work stays active.');

assert.equal(packagingPlan.shots[0].productionRevisionRequest.status,'OPEN');
assert.equal(mixedPackagingPlan.shots[0].productionRevisionRequest.status,'OPEN');

assert.equal(productionShotStageV1(packagingOrder.shots[0]), 'PACKAGE_STATES');
assert.match(productionShotNextActionV1(packagingOrder.shots[0]), /无需新增包装/);
assert.notEqual(productionShotStageV1(mixedPackagingOrder), 'PACKAGE_STATES');
const reviewedPackaging = {...mixedPackagingOrder, packagingStaticCoverage: {
  ...mixedPackagingOrder.packagingStaticCoverage, reviewedStates: 1, missingStates: 0,
}};
assert.equal(productionShotStageV1(reviewedPackaging), 'PACKAGE_STATES');
assert.match(productionShotNextActionV1(reviewedPackaging), /整板与连续效果仍待审看/);
assert.equal(reviewedPackaging.wholeShotApproved, false);
