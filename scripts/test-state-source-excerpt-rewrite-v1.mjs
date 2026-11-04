import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {prepareStateSourceExcerptRewriteV1,verifyStateExcerptCopyBindingV1} from '../apps/studio-next/src/lib/a1-production-state-excerpt-rewrite-v1.mjs';
import {compileFullFrameRequestsV1,adoptSourcedFrameInputsV1,verifyReferenceStateCopyBindingV1,prepareSourceExcerptRewriteV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {productionFrameGoalShaV1,productionFrameBaseCopyV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1,verifyResearchCopyAuthoritiesV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {compileProductionStateLayoutsV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {recordProductionRevisionV1} from '../apps/studio-next/src/lib/a1-production-continuation-v1.mjs';
import {projectReviewedFrameCopyV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
import {verifyReferenceStateIntentsV1,readReferenceStateIntentsV1,referenceStateIntentDigestsV1} from '../apps/studio-next/src/lib/a1-reference-state-intent-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'state-excerpt-'))),taskRoot=path.join(root,'work','unseen-state-sources');fs.mkdirSync(path.join(taskRoot,'evidence'),{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),source='a'.repeat(64),states=['ENTRY','HOLD','HANDOFF'];
const frames=states.map((state,i)=>{const file=state+'.jpg',bytes=Buffer.from('reference '+state);fs.writeFileSync(path.join(taskRoot,file),bytes);return {state,sourceFrame:i*30,artifactPath:file,artifactSha256:hash(bytes)};});
const evidence={contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:source},stateFrames:{people:frames}},eb=Buffer.from(JSON.stringify(evidence)),ep=path.join(taskRoot,'evidence','frames.json');fs.writeFileSync(ep,eb);
let plan={contract:'A1ShotTaskPlan/v1',projectId:'unseen-state-sources',scope:'RESEARCH_ONLY',productionAdmission:false,visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},source:{videoSha256:source},shots:[{id:'people',sourceText:'Introduce researchers',visualJob:'Source-bound names',sourceInterval:{startFrame:0,endFrameExclusive:100},exactCopy:['Retained global caption'],sourcePresentation:{sourceUrl:'https://legacy.example.test/',copyBindings:[]},tasks:[{module:'media-files',dependencies:[],parameters:{files:[]}}]}]};
plan.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:['people'],objective:'State scoped people',sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false};
const units=frames.map((f,i)=>{const url='https://person-'+i+'.example.test/profile',body=url+'\nPerson '+i+' is a researcher.\n2026-10-13\n',file=path.join(taskRoot,'person-'+i+'.txt');fs.writeFileSync(file,body);return {shotId:'people',state:f.state,copyMode:'SOURCE_BOUND_STATE_EXCERPT_REWRITE',copy:['Person '+i,'Researcher'],sourceUrl:url,excerpt:{path:path.relative(root,file),sha256:hash(body)},supportQuotes:['Person '+i+' is a researcher.'],reviewedAt:'2026-10-13',reviewedBy:'fixture',visualIntake:{contract:'A1WholeFrameVisualIntake/v1',reviewerRole:'AGENT',reviewerId:'fixture',sourceCorePolicy:'ORIGINAL_ILLUSTRATION_NO_NATIVE_EVIDENCE',referenceEvidence:{path:path.relative(root,ep),sha256:hash(eb)},reference:{state:f.state,sourceFrame:f.sourceFrame,path:path.join(taskRoot,f.artifactPath),sha256:f.artifactSha256},visibleCopyIndices:[0,1],viewerIntent:'Read this researcher',appearance:{composition:'Name beside photo',palette:'Neutral',surface:'Paper'}}};});
try{
 const initial=structuredClone(plan);let firstBinding,firstGoal;
 const observed=structuredClone(initial),intentReview={contract:'A1ReferenceStateIntentReview/v1',shotId:'people',sourceVideoSha256:source,reviewedBy:'fixture',exactCopy:[...initial.shots[0].exactCopy],referenceEvidence:{path:path.relative(root,ep),sha256:hash(eb)},
  states:frames.map(f=>({state:f.state,reference:{state:f.state,sourceFrame:f.sourceFrame,path:path.join(taskRoot,f.artifactPath),sha256:f.artifactSha256},viewerNotice:'Original observed source',viewerChange:'Observe its original caption',sequenceRole:'Introduce',handoff:'Continue',visibleCopyIndices:f.state==='ENTRY'?[]:[0],copyObservation:f.state==='ENTRY'?'NO_DESIGNED_COPY':'LOCKED_VISIBLE',baseMediaStatus:'SEPARATE_SOURCE_INTEGRATION_REQUIRED',geometryStatus:'UNMEASURED',motionStatus:'UNMEASURED'})),productionAdmission:false,visualApproval:false,motionApproved:false};
 const intentBytes=Buffer.from(JSON.stringify(intentReview)),intentFile=path.join(taskRoot,'original-intent.json');fs.writeFileSync(intentFile,intentBytes);
 const checked=verifyReferenceStateIntentsV1({repoRoot:root,plan:observed,shot:observed.shots[0],review:intentReview});
 observed.shots[0].referenceStateIntents={review:{path:path.relative(root,intentFile),sha256:hash(intentBytes)},intentSha256:nodeInputHash(checked),stateIntentSha256ByState:referenceStateIntentDigestsV1(checked)};
 const extended=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:observed,unit:units[0]});
 const retained=readReferenceStateIntentsV1({repoRoot:root,plan:extended.plan,shot:extended.plan.shots[0]});
 assert.deepEqual(retained.states,checked.states,'authored copy does not rewrite source-frame observations');
 assert.deepEqual(referenceStateIntentDigestsV1(retained),referenceStateIntentDigestsV1(checked),'all old state intent identities remain stable');
 assert.deepEqual(retained.exactCopy,extended.plan.shots[0].exactCopy);
 assert.deepEqual(fs.readFileSync(intentFile),intentBytes,'old source review is immutable');
 assert.equal(extended.plan.shots[0].referenceStateIntentHistory.length,1);
 for(const [i,unit] of units.entries()){
  const old=structuredClone(plan),oldShot=old.shots[0],others=states.filter(s=>s!==unit.state),oldGoals=others.map(s=>productionFrameGoalShaV1(plan,oldShot,s));
  const result=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit});plan=result.plan;const shot=plan.shots[0];
  assert.deepEqual(old.shots[0],oldShot);assert.deepEqual(shot.sourcePresentation,initial.shots[0].sourcePresentation,'no global source relabelling');
  assert.deepEqual(others.map(s=>productionFrameGoalShaV1(plan,shot,s)),oldGoals,'other state goals unchanged');
  assert.deepEqual(shot.fullFrameRequests,oldShot.fullFrameRequests);assert.deepEqual(shot.productionLayout,oldShot.productionLayout);assert.deepEqual(shot.tasks,oldShot.tasks);
  const binding=verifyReferenceStateCopyBindingV1({repoRoot:root,plan,shot,state:unit.state});assert.equal(binding.sourcePresentation.sourceUrl,unit.sourceUrl);
  const facts=verifyResearchCopyAuthoritiesV1({taskRoot,plan});assert.equal(projectReviewedFrameCopyV1(shot,facts,unit.state).status,'REVIEWED_RESEARCH_COPY_BYTES_BOUND');
  if(i===0){firstBinding=structuredClone(binding);firstGoal=productionFrameGoalShaV1(plan,shot,'ENTRY');shot.fullFrameRequests=[{state:'ENTRY',requestSha256:'b'.repeat(64),goalInputSha256:firstGoal}];shot.productionLayout={contract:'RetainedFixtureLayout',states:[{state:'ENTRY',copyIndices:binding.copyIndices}]};}
  else{assert.deepEqual(shot.stateCopyBindings.ENTRY,firstBinding);assert.equal(productionFrameGoalShaV1(plan,shot,'ENTRY'),firstGoal);}
 }
 const shot=plan.shots[0],shared=shot.exactCopy.indexOf('Researcher');
 for(const [i,state] of states.entries()){const b=shot.stateCopyBindings[state];assert.equal(b.copyIndices[1],shared);assert.equal(b.copyBindings[1].sourceUri,units[i].sourceUrl);}
 const entryOnly=structuredClone(shot);entryOnly.tasks=[];entryOnly.sourceVersionSha256=source;
 const rawPath=path.join(taskRoot,'raw.png'),rawBytes=Buffer.from('accepted raw fixture');fs.writeFileSync(rawPath,rawBytes);
 const rawAsset={assetId:'accepted-raw',path:rawPath,sha256:hash(rawBytes),kind:'IMAGE',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET',role:'generated-image'};
 const entryRef=entryOnly.referenceProductionDesign.references.find(r=>r.state==='ENTRY'),entryState=entryOnly.referenceProductionDesign.states.find(s=>s.state==='ENTRY');
 entryOnly.fullFrameComposition={contract:'A1FullFrameComposition/v1',requestNodeIds:['accepted-entry']};
 entryOnly.fullFrameInputHistory=[{packagingDecision:{copyBindings:[{copyIndex:0,text:entryOnly.exactCopy[0],status:'LOCKED',sourceKind:'SOURCE_FRAME_EXACT',sourceVideoSha256:source,frameNumber:0}]}}];
 entryOnly.productionLayout={contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:960,height:540},states:[{state:'ENTRY',referencePath:entryRef.path,copyIndices:entryState.visibleCopyIndices,layers:[{id:'entry-render',designLayerId:entryState.visibleLayerIds[0],kind:'ASSET',assetId:'accepted-raw',role:'BACKGROUND',fit:'fill',box:{x:0,y:0,width:1,height:1},z:0}]}]};
 const compilePartial=s=>compileProductionStateLayoutsV1({shot:s,resources:{assets:[rawAsset],fonts:[]},stateImplementations:{'layer-compositor':'d'.repeat(64)}});
 const partial=compilePartial(entryOnly);assert.equal(partial.compiled,true,JSON.stringify(partial.blockers));
 assert.deepEqual(partial.shot.productionStateBindings.map(s=>s.state),['ENTRY'],'only produced ENTRY has an execution binding');
 assert.deepEqual(partial.shot.tasks.find(t=>t.module==='layer-compositor').parameters.staticStatePlan.states.map(s=>s.state),['ENTRY']);
 for(const index of shot.stateCopyBindings.HOLD.copyIndices.filter(i=>!shot.stateCopyBindings.ENTRY.copyIndices.includes(i))){
  const retained=partial.shot.packagingDecision.copyBindings[index];assert.equal(retained.activeStateVisibility,'NOT_DISPLAYED_IN_ACTIVE_STATES');assert.equal(retained.sourceUri,units[1].sourceUrl);
 }
 const legacyPartial=structuredClone(entryOnly);delete legacyPartial.stateCopyBindings;delete legacyPartial.sourcePresentationByState;
 assert.ok(compilePartial(legacyPartial).blockers.some(b=>b.startsWith('STATE_LAYOUT_COPY_NOT_ASSIGNED')),'legacy whole-copy coverage stays strict');
 const invalidFuture=structuredClone(entryOnly);invalidFuture.stateCopyBindings.HOLD.copyBindings[0].sourceUri='https://forged.example.test/';
 assert.ok(compilePartial(invalidFuture).blockers.some(b=>b.startsWith('STATE_LAYOUT_STATE_COPY_BINDING_INVALID')));
 const invalidActive=structuredClone(entryOnly);invalidActive.stateCopyBindings.ENTRY.copyIndices=[3];
 assert.ok(compilePartial(invalidActive).blockers.some(b=>b.startsWith('STATE_LAYOUT_STATE_COPY_BINDING_INVALID')));
 const repeated=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:units[1]});assert.equal(repeated.assignment.reused,true);assert.deepEqual(repeated.plan,plan);
 const legacyVersion=structuredClone(plan);delete legacyVersion.shots[0].sourceVersionSha256;
 const versionRecovery=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:legacyVersion,unit:units[1]});
 assert.equal(versionRecovery.assignment.reused,true);assert.deepEqual(versionRecovery.plan,plan,'validated existing state source receipts restore only the missing source-version field');
 legacyVersion.shots[0].sourceVersionSha256='f'.repeat(64);
 await assert.rejects(prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:legacyVersion,unit:units[1]}),/SOURCE_VERSION_CHANGED/);
 await assert.rejects(prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan,unit:{...units[1],sourceUrl:'https://wrong.example.test/'}}),/REPLACEMENT_REQUIRES_REVIEW/);
 const tampered=structuredClone(plan);tampered.shots[0].stateCopyBindings.HOLD.copyBindings[0].sourceUri='https://wrong.example.test/';assert.throws(()=>verifyStateExcerptCopyBindingV1({repoRoot:root,plan:tampered,shot:tampered.shots[0],state:'HOLD'}),/BINDING_CHANGED/);
 const replacePlan=structuredClone(plan),beforeReplace=replacePlan.shots[0];
 beforeReplace.fullFrameRequests.push({state:'HOLD',requestSha256:'c'.repeat(64),goalInputSha256:productionFrameGoalShaV1(replacePlan,beforeReplace,'HOLD')});
 beforeReplace.productionLayout.states.push({state:'HOLD',copyIndices:beforeReplace.stateCopyBindings.HOLD.copyIndices,layers:[{id:'old-hold-pixels',assetId:'old-image'}]});
 beforeReplace.productionResources.assets.push({assetId:'old-image',sha256:'d'.repeat(64),path:'preserve-old-image.png'});
 beforeReplace.tasks=[{module:'layer-compositor',parameters:{staticStatePlan:{states:[{state:'ENTRY',parameters:{copy:'entry'}},{state:'HOLD',parameters:{copy:'old hold'}}]}}}];
 beforeReplace.tasks[0].parameters.staticStatePlan.states[1].parameters.copyOccurrences={sourceCopy:['old hold']};
 Object.assign(beforeReplace.tasks[0].parameters,{copy:'old hold',copyOccurrences:{sourceCopy:['old hold']},sharedPolicy:'preserve'});
 beforeReplace.productionRevisionRequest={requestId:'f'.repeat(64),status:'OPEN',basePlanSha256:nodeInputHash(plan),requestedAt:'2026-10-13T00:00:00Z',productionAdmission:false,text:'Replace HOLD primary source',states:['HOLD']};
 assert.equal(productionFrameGoalShaV1(replacePlan,beforeReplace,'ENTRY'),productionFrameGoalShaV1(plan,shot,'ENTRY'),'HOLD-only revision preserves ENTRY goal');
 const legacyRevision=structuredClone(replacePlan);delete legacyRevision.shots[0].productionRevisionRequest.states;assert.notEqual(productionFrameGoalShaV1(legacyRevision,legacyRevision.shots[0],'ENTRY'),productionFrameGoalShaV1(plan,shot,'ENTRY'),'legacy revision remains whole-shot');
 const revisedBody='https://revised.example.test/\nPerson 1 has a revised title.\n',revisedFile=path.join(taskRoot,'revised.txt');fs.writeFileSync(revisedFile,revisedBody);
 const revised={...structuredClone(units[1]),copy:['Revised identity','Revised title'],sourceUrl:'https://revised.example.test/',excerpt:{path:path.relative(root,revisedFile),sha256:hash(revisedBody)},supportQuotes:['Person 1 has a revised title.'],replaceSourceInput:{revisionId:beforeReplace.productionRevisionRequest.requestId,previousCopySha256:nodeInputHash(beforeReplace.exactCopy),requests:[{state:'HOLD',requestSha256:'c'.repeat(64)}]}};
 for(const bad of [undefined,{...revised.replaceSourceInput,revisionId:'wrong'},{...revised.replaceSourceInput,previousCopySha256:'0'.repeat(64)},{...revised.replaceSourceInput,requests:[{state:'ENTRY',requestSha256:'b'.repeat(64)}]}])await assert.rejects(prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:replacePlan,unit:{...revised,replaceSourceInput:bad}}),/REPLACEMENT_REQUIRES_REVIEW|REVISION_BINDING_REQUIRED/);
 const legacyRequestPlan=structuredClone(replacePlan);delete legacyRequestPlan.shots[0].stateCopyBindings.HOLD;delete legacyRequestPlan.shots[0].sourcePresentationByState.HOLD;await assert.rejects(prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:legacyRequestPlan,unit:{...revised,replaceSourceInput:undefined}}),/TARGET_REQUEST_EXISTS/);
 const closed=structuredClone(replacePlan);closed.shots[0].productionRevisionRequest.status='DESIGN_BOUND';await assert.rejects(prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:closed,unit:revised}),/REVISION_BINDING_REQUIRED/);
 const replacement=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:replacePlan,unit:revised}),afterReplace=replacement.plan.shots[0];
 const replacementReplay=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:replacement.plan,unit:revised});assert.equal(replacementReplay.assignment.reused,true);assert.deepEqual(replacementReplay.plan,replacement.plan);
 const orphanPlan=structuredClone(replacePlan),orphanShot=orphanPlan.shots[0];
 const orphan=structuredClone(afterReplace.referenceProductionDesign.layers.find(l=>l.id.startsWith('state-excerpt-hold-')));
 for(const layer of orphanShot.referenceProductionDesign.layers)if(layer.id===orphan.id)layer.id='native-converted-hold';
 const orphanState=orphanShot.referenceProductionDesign.states.find(s=>s.state==='HOLD');
 orphanState.visibleLayerIds=orphanState.visibleLayerIds.map(id=>id===orphan.id?'native-converted-hold':id);
 orphanShot.referenceProductionDesign.layers.push(orphan);
 const orphanResult=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:orphanPlan,unit:revised});
 const orphanDesign=orphanResult.plan.shots[0].referenceProductionDesign;
 assert.deepEqual(orphanDesign.layers.find(l=>l.id===orphan.id),orphan,'old unselected source evidence survives replacement');
 assert.equal(orphanDesign.states.find(s=>s.state==='HOLD').visibleLayerIds.includes(orphan.id),false,'replacement gets independent layer identity');
 assert.equal(new Set(orphanDesign.layers.map(l=>l.id)).size,orphanDesign.layers.length);
 assert.deepEqual(afterReplace.fullFrameRequests,beforeReplace.fullFrameRequests.filter(r=>r.state==='ENTRY'));
 assert.deepEqual(afterReplace.productionLayout.states,beforeReplace.productionLayout.states.filter(r=>r.state==='ENTRY'));
 assert.deepEqual(afterReplace.stateCopyBindings.ENTRY,beforeReplace.stateCopyBindings.ENTRY);
 assert.deepEqual(afterReplace.sourcePresentationByState.ENTRY,beforeReplace.sourcePresentationByState.ENTRY);
 assert.equal(productionFrameGoalShaV1(replacement.plan,afterReplace,'ENTRY'),productionFrameGoalShaV1(replacePlan,beforeReplace,'ENTRY'));
 assert.deepEqual(afterReplace.tasks[0].parameters.staticStatePlan.states,[beforeReplace.tasks[0].parameters.staticStatePlan.states[0]]);
 assert.equal(afterReplace.tasks[0].parameters.copyOccurrences,undefined,'retired-only default parameters cannot leak into the surviving state');
 assert.equal(afterReplace.tasks[0].parameters.copy,'entry');
 assert.equal(afterReplace.tasks[0].parameters.sharedPolicy,'preserve','unscoped task policy remains intact');
 assert.deepEqual(afterReplace.productionResources,beforeReplace.productionResources,'old generated image resources remain untouched');
 assert.deepEqual(afterReplace.exactCopy.slice(0,beforeReplace.exactCopy.length),beforeReplace.exactCopy,'old words are not replaced');
 assert.equal(afterReplace.stateSourceInputHistory.find(h=>h.retired).previousFields.fullFrameRequests[1].state,'HOLD');
 assert.equal(afterReplace.fullFrameRequestHistory.at(-1).requestSha256,'c'.repeat(64));
 assert.equal(afterReplace.stateCopyBindings.HOLD.copyBindings[0].sourceUri,revised.sourceUrl);
 verifyStateExcerptCopyBindingV1({repoRoot:root,plan:replacement.plan,shot:afterReplace,state:'HOLD'});
 assert.deepEqual(productionFrameBaseCopyV1(afterReplace),productionFrameBaseCopyV1(beforeReplace),'retired appended words do not enter base vocabulary');
 const forgedRetirement=structuredClone(afterReplace);forgedRetirement.stateSourceInputHistory.find(h=>h.retired).previousCopyBinding.copyBindings[0].sourceUri='forged';assert.throws(()=>productionFrameBaseCopyV1(forgedRetirement),/RETIRED_STATE_COPY_CHANGED/);
 const oldTargetWord=beforeReplace.exactCopy.indexOf('Person 1'),retainedOnly=structuredClone(afterReplace);
 retainedOnly.fullFrameComposition={contract:'A1FullFrameComposition/v1'};retainedOnly.fullFrameInputHistory=structuredClone(entryOnly.fullFrameInputHistory);retainedOnly.productionLayout=structuredClone(entryOnly.productionLayout);retainedOnly.productionResources.assets=[rawAsset];retainedOnly.sourceVersionSha256=source;retainedOnly.tasks=[];
 const retiredCompile=compilePartial(retainedOnly);assert.equal(retiredCompile.compiled,true,JSON.stringify(retiredCompile.blockers));
 const retiredLock=retiredCompile.shot.packagingDecision.copyBindings[oldTargetWord];assert.equal(retiredLock.status,'LOCKED');assert.equal(retiredLock.activeStateVisibility,'NOT_DISPLAYED_IN_ACTIVE_STATES');assert.equal(retiredLock.sourceUri,units[1].sourceUrl);
 // A native-only source revision has no ImageGen request to pin. Its actual
 // current state layout and source-copy envelope must both be CAS-bound.
 const nativePlan=structuredClone(replacePlan),nativeBefore=nativePlan.shots[0];
 nativeBefore.fullFrameRequests=[];
 nativeBefore.productionLayout.states=nativeBefore.productionLayout.states.filter(s=>s.state==='HOLD');
 nativeBefore.productionStateBindings=[{state:'HOLD',fixture:'retired execution binding'}];
 const nativeParameters={exactCopy:'Person 1Researcher',staticStatePlan:{states:[{state:'HOLD',parameters:{exactCopy:'Person 1Researcher'}}]}};
 nativeBefore.tasks=[structuredClone(initial.shots[0].tasks[0]),{module:'editable-typography',parameters:structuredClone(nativeParameters)},{module:'layer-compositor',parameters:structuredClone(nativeParameters)}];
 nativeBefore.sourceNativeLayoutBinding={contract:'A1SourceBoundNativeLayoutBinding/v1',nativeStates:['HOLD'],stateBindings:{HOLD:{fixture:'current native state'}},stateVisibility:[{state:'HOLD',fixture:'current visibility'}],acceptedCoreStates:[],glyphCoverage:{states:[{state:'HOLD',fixture:'prior glyph coverage'}]}};
 nativeBefore.sourceNativeLayoutBinding.glyphCoverage.sha256=nodeInputHash(nativeBefore.sourceNativeLayoutBinding.glyphCoverage.states);
 nativeBefore.editableTypographyPlan={fixture:'old HOLD typography'};nativeBefore.editableTypographyPlanAsset={fixture:'old HOLD artifact binding'};
 const nativePins={...revised.replaceSourceInput,requests:[],nativeStateLayoutSha256:nodeInputHash(nativeBefore.productionLayout.states[0]),previousStateCopyBindingSha256:nodeInputHash(nativeBefore.stateCopyBindings.HOLD)};
 const nativeUnit={...structuredClone(revised),replaceSourceInput:nativePins};
 const prepareNative=(p=nativePlan,u=nativeUnit)=>prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:p,unit:u});
 for(const key of ['nativeStateLayoutSha256','previousStateCopyBindingSha256']){
  for(const value of [undefined,'0'.repeat(64),'not-a-sha']){
   const bad=structuredClone(nativeUnit);if(value===undefined)delete bad.replaceSourceInput[key];else bad.replaceSourceInput[key]=value;
   await assert.rejects(prepareNative(nativePlan,bad),/STATE_EXCERPT_REVISION_BINDING_REQUIRED/);
  }
 }
 for(const change of [s=>delete s.sourceNativeLayoutBinding,s=>s.sourceNativeLayoutBinding.contract='ForgedNativeBinding',s=>s.sourceNativeLayoutBinding.nativeStates=['ENTRY'],s=>s.productionLayout.states[0].layers[0].assetId='changed-native-source']){
  const bad=structuredClone(nativePlan);change(bad.shots[0]);await assert.rejects(prepareNative(bad),/STATE_EXCERPT_REVISION_BINDING_REQUIRED/);
 }
 // The zero-request branch cannot override an extant ordinary full-frame request.
 const requestWithNative=structuredClone(nativePlan);requestWithNative.shots[0].fullFrameRequests=structuredClone(beforeReplace.fullFrameRequests.filter(r=>r.state==='HOLD'));
 await assert.rejects(prepareNative(requestWithNative),/STATE_EXCERPT_REVISION_BINDING_REQUIRED/);
 const nativeSnapshot=structuredClone(nativePlan),nativeReplacement=await prepareNative(),nativeAfter=nativeReplacement.plan.shots[0];
 assert.deepEqual(nativePlan,nativeSnapshot,'native preparation never mutates its input');
 assert.equal(nativeAfter.productionLayout,undefined,'sole retired native state leaves no empty executable layout');
 assert.deepEqual(nativeAfter.tasks,[nativeBefore.tasks[0]],'empty TYPE and compositor tasks are archived, not left executing old copy');
 for(const key of ['editableTypographyPlan','editableTypographyPlanAsset','productionStateBindings'])assert.equal(nativeAfter[key],undefined,key);
 assert.deepEqual(nativeAfter.sourceNativeLayoutBinding.nativeStates,[]);
 assert.equal(nativeAfter.sourceNativeLayoutBinding.stateBindings.HOLD,undefined);
 assert.deepEqual(nativeAfter.sourceNativeLayoutBinding.stateVisibility,[]);
 assert.deepEqual(nativeAfter.sourceNativeLayoutBinding.glyphCoverage.states,[]);
 const nativeHistory=nativeAfter.stateSourceInputHistory.find(h=>h.retired&&h.revisionId===nativePins.revisionId);
 assert.deepEqual(nativeHistory.previousFields.productionLayout,nativeBefore.productionLayout);
 assert.deepEqual(nativeHistory.previousFields.tasks,nativeBefore.tasks);
 assert.deepEqual(nativeHistory.previousFields.sourceNativeLayoutBinding,nativeBefore.sourceNativeLayoutBinding);
 assert.deepEqual(nativeHistory.previousCopyBinding,nativeBefore.stateCopyBindings.HOLD);
 const {retirementSha256,...nativeRetirement}=nativeHistory;assert.equal(retirementSha256,nodeInputHash(nativeRetirement));
 assert.deepEqual(nativeAfter.productionResources,nativeBefore.productionResources,'native source/font resources retained');
 assert.deepEqual(nativeAfter.stateCopyBindings.ENTRY,nativeBefore.stateCopyBindings.ENTRY,'unrelated source lock retained');
 verifyStateExcerptCopyBindingV1({repoRoot:root,plan:nativeReplacement.plan,shot:nativeAfter,state:'HOLD'});
 const nativeReplay=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:nativeReplacement.plan,unit:nativeUnit});
 assert.equal(nativeReplay.assignment.reused,true);assert.deepEqual(nativeReplay.plan,nativeReplacement.plan);

 // Real source excerpt bytes and normal fact-authority preparation: many unique
 // labels share a single quoted source line, with no hand-authored receipt.
 const capacityCopy=Array.from({length:65},(_,i)=>'Source label '+String(i).padStart(2,'0'));
 const capacityUrl='https://capacity.example.test/source',capacityQuote=capacityCopy.join(' | '),capacityBody=capacityUrl+'\n'+capacityQuote+'\n2026-10-13\n';
 const capacityFile=path.join(taskRoot,'capacity-source.txt');fs.writeFileSync(capacityFile,capacityBody);
 const capacityUnit=count=>({...structuredClone(units[0]),copy:capacityCopy.slice(0,count),sourceUrl:capacityUrl,excerpt:{path:path.relative(root,capacityFile),sha256:hash(capacityBody)},supportQuotes:[capacityQuote],visualIntake:{...structuredClone(units[0].visualIntake),visibleCopyIndices:Array.from({length:count},(_,i)=>i)}});
 const capacity=await prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:initial,unit:capacityUnit(39)});
 const capacityBinding=verifyStateExcerptCopyBindingV1({repoRoot:root,plan:capacity.plan,shot:capacity.plan.shots[0],state:'ENTRY'});
 assert.equal(capacityBinding.copyIndices.length,39);assert.equal(new Set(capacityBinding.copyIndices).size,39);
 assert.deepEqual(capacityBinding.copyIndices.map(i=>capacity.plan.shots[0].exactCopy[i]),capacityCopy.slice(0,39));
 assert.equal(capacityBinding.copyBindings.every(b=>b.sourceUri===capacityUrl&&b.status==='LOCKED'),true);
 assert.equal(verifyResearchCopyAuthoritiesV1({taskRoot,plan:capacity.plan}).length,39);
 await assert.rejects(prepareStateSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:initial,unit:capacityUnit(65)}),/SOURCE_EXCERPT_REWRITE_INPUT/);
 const ordinary=count=>({...capacityUnit(count),copyMode:'SOURCE_BOUND_EXCERPT_REWRITE'});
 assert.equal(prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:initial,unit:ordinary(16)}).assignment.copyCount,16);
 assert.throws(()=>prepareSourceExcerptRewriteV1({repoRoot:root,taskRoot,plan:initial,unit:ordinary(17)}),/SOURCE_EXCERPT_REWRITE_INPUT/);
 const generated=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{shotId:'people',state:'HOLD',brief:'Show Person 1 as Researcher',contentPlan:{referenceKind:'TYPOGRAPHY_EVENT',subject:'Person 1',action:'Present the name',viewerTakeaway:'Read this name',sourceAnchor:'Person 1',requiredVisibleAnchors:['Person 1'],treatment:'REBUILD_EDITORIAL'},assetIds:[],transparentBackground:true,copyIndices:shot.stateCopyBindings.HOLD.copyIndices}]});
 const generation=generated.plan.assetTasks.at(-1).tasks.find(t=>t.module==='image-generation').parameters.generationRequest;
 assert.deepEqual(generation.exactCopy,['Person 1','Researcher'],'generator receives only this state copy, not names from other sources');
 const planPath=path.join(taskRoot,'shot-task-plan-v1.json');fs.writeFileSync(planPath,JSON.stringify(initial));syncShotTaskRuntimeV1({repoRoot:root,taskId:plan.projectId,expectedPlanSha256:nodeInputHash(initial)});
 const inputPath=path.join(taskRoot,'units.json'),inputBytes=Buffer.from(JSON.stringify({units}));fs.writeFileSync(inputPath,inputBytes);
 const phaseRoot=path.join(root,'work/module-development-launch-v1/resource-reservations');fs.mkdirSync(phaseRoot,{recursive:true});
 fs.writeFileSync(path.join(phaseRoot,'phase-activation-state-copy-fixture.json'),JSON.stringify({status:'ACTIVE',purpose:'FULL_FRAME_SOURCE_INPUTS',taskId:plan.projectId,executionAuthorized:true,reservedSlots:0,shotIds:['people'],planSha256:nodeInputHash(initial),units:{path:path.relative(root,inputPath),sha256:hash(inputBytes)}}));
 const adopted=await adoptSourcedFrameInputsV1({repoRoot:root,taskId:plan.projectId,phaseId:'state-copy-fixture'});assert.equal(adopted.assignments.length,3);
 const normal=readShotTaskRuntimeV1({repoRoot:root,taskId:plan.projectId});assert.equal(normal.pending,false);assert.equal(Object.keys(normal.plan.shots[0].sourcePresentationByState).length,3);
 const priorRuntime=readShotTaskRuntimeV1({repoRoot:root,taskId:plan.projectId}),priorEntryGoal=productionFrameGoalShaV1(priorRuntime.plan,priorRuntime.plan.shots[0],'ENTRY');
 await assert.rejects(recordProductionRevisionV1({repoRoot:root,taskId:plan.projectId,shotId:'people',text:'Change HOLD',expectedPlanSha256:nodeInputHash(priorRuntime.plan),states:['HOLD','HOLD']}),/revision-states-invalid/);
 fs.unlinkSync(path.join(phaseRoot,'phase-activation-state-copy-fixture.json'));
 await recordProductionRevisionV1({repoRoot:root,taskId:plan.projectId,shotId:'people',text:'Change HOLD',expectedPlanSha256:nodeInputHash(priorRuntime.plan),states:['HOLD']});
 const revisedRuntime=readShotTaskRuntimeV1({repoRoot:root,taskId:plan.projectId});assert.deepEqual(revisedRuntime.plan.shots[0].productionRevisionRequest.states,['HOLD']);assert.equal(productionFrameGoalShaV1(revisedRuntime.plan,revisedRuntime.plan.shots[0],'ENTRY'),priorEntryGoal);
 fs.writeFileSync(path.join(taskRoot,'HOLD.jpg'),'drift');assert.throws(()=>verifyReferenceStateCopyBindingV1({repoRoot:root,plan,shot,state:'HOLD'}),/AUTHORITY_CHANGED/);
 console.log('PASS native-only source revision CAS rejects missing/forged/layout-drift pins; sole native layout and empty TYPE/compositor tasks retire into SHA-bound history; 39 unique single-line sourced locks verified, state 65 rejected and ordinary 16/17 boundary unchanged.');
 console.log('PASS scoped revision replacement pins, target retirement, preserved other goals/requests/producer parameters, old source locks/history, and three independent state sources, duplicate text with independent URI locks, unchanged other goal/request/layout/task/global-source identities, idempotency, source remapping refusal and actual reference byte verification. No providers or production writes.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
