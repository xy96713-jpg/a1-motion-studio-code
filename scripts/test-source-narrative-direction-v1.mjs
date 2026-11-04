import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {prepareSourceNarrationContextV1} from '../apps/studio-next/src/lib/a1-source-narration-context-v1.mjs';
import {sourceNarrativeInputV1,sourceNarrativeDirectionSchemaV1,verifySourceNarrativeDirectionV1,readSourceNarrativeDirectionV1,reconcileSourceNarrativeDirectionV1} from '../apps/studio-next/src/lib/a1-source-narrative-direction-v1.mjs';
import {stateClaimTargetV1} from '../apps/studio-next/src/lib/a1-state-source-claim-v1.mjs';
import {runSourceNarrativeDirectorV1} from '../apps/studio-next/src/lib/a1-reference-visual-director-v2.mjs';
import {readShotTaskRuntimeV1,syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {adoptSourcedFrameInputsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {productionFrameSequenceContextV1,runProductionFramePlannerV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'source-direction-'))),fixtures=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const strictSchema=sourceNarrativeDirectionSchemaV1(['A','B'],[{shotId:'A',narration:{cues:[{index:1,text:'Exact source cue'}]}},{shotId:'B',narration:{cues:[{index:2,text:'Another exact cue'}]}}]);
const branches=strictSchema.properties.directions.items.anyOf;
assert.deepEqual(branches[0].properties.sourceCueAnchors.items.anyOf[0].properties.quote.enum,['Exact source cue'],'model quote choices are the frozen source text, without invented suffixes');
assert.deepEqual(branches[1].properties.sourceCueAnchors.items.anyOf[0].properties.index.enum,[2],'each shot can cite only its own cue indexes');
assert.throws(()=>sourceNarrativeDirectionSchemaV1(['A'],[{shotId:'B',narration:{cues:[]}}]),/SCHEMA_SOURCE_INPUTS/);
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});return {path:path.relative(root,file),sha256:hash(fs.readFileSync(file))};};
try {
 for(const [genre,text] of [['evidence-explainer','The document gives the measurement'],['product-tutorial','Restore the saved version'],['editorial-comparison','A strong team needs transport']]) {
  const taskId='direction-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
  const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'a'.repeat(64),fps:10},
   visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
   shots:[{id:'scene',sourceText:'A comparison appears',visualJob:'Understand relationship',sourceInterval:{startFrame:0,endFrameExclusive:20},exactCopy:['Label'],tasks:[{module:'media-files',parameters:{files:[]},dependencies:[],blocker:'FIXTURE_ONLY'}]},
    {id:'next',sourceText:'A result appears',visualJob:'Read consequence',sourceInterval:{startFrame:20,endFrameExclusive:40},exactCopy:['Result'],tasks:[{module:'media-files',parameters:{files:[]},dependencies:[],blocker:'FIXTURE_ONLY'}]}]};
  const transcript=save(path.join(dir,'transcript.json'),{kind:'REFERENCE_LOCAL_ASR_TRANSCRIPT',status:'ASR_DRAFT_READY_FOR_TEXT_REVIEW',sourceSha256:plan.source.videoSha256,sourceDurationSeconds:4,boundary:{textNeedsHumanReview:true,productionAdmission:false},segments:[{startMs:0,endMs:2000,text},{startMs:2000,endMs:4000,text:'Follow the next evidence'}]});
  const privateFile=path.join(dir,'private-reconstructed.png');fs.writeFileSync(privateFile,'Fixture packaging bytes, not image proof');
  plan.shots[0].referenceProductionDesign={contract:'A1ReferenceProductionDesign/v1',shotId:'scene',sourceVideoSha256:plan.source.videoSha256,viewerIntent:'Read label',appearance:{composition:'One label',palette:'Neutral',surface:'Flat'},references:[{state:'HOLD',sourceFrame:1,path:privateFile,sha256:hash(fs.readFileSync(privateFile))}],layers:[{id:'label',role:'TEXT',sourceMode:'AUTO',assetIds:[],copyIndices:[0],treatment:'NONE',purpose:'Read label'}],states:[{state:'HOLD',viewerNotice:'Read label',visibleLayerIds:['label'],visibleCopyIndices:[0]}],acceptance:[],uncertainties:[]};
  plan.shots[0].tasks[0].parameters.files=[{assetId:'private-layout',path:privateFile,sha256:hash(fs.readFileSync(privateFile)),kind:'IMAGE',role:'packaging-texture',materialClass:'CODE_NATIVE_ASSET',referenceOnly:false,
    provenance:{status:'VERIFIED',useClass:'PRIVATE_RECONSTRUCTED_STATIC',nativePageEvidence:false}}];
  for(const shot of plan.shots){const value=prepareSourceNarrationContextV1({repoRoot:root,plan,shot,transcript});shot.sourceNarration={review:save(path.join(dir,shot.id+'-narration.json'),value),contextSha256:nodeInputHash(value)};}
  const planFile=path.join(dir,'shot-task-plan-v1.json');save(planFile,plan);syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
  const propose=async(suffix)=>{
   const phaseId='direction-'+genre+'-'+suffix;
   activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'STATIC_FRAME_PLANNING',ownerThreadId:'fixture',approvalEvidence:'Pure isolated source direction fixture',shotIds:['scene','next'],reservedSlots:1,maximumClaims:1,
    metadata:{planningMode:'SOURCE_NARRATIVE_DIRECTION',maximumModelPasses:1}});
   let calls=0;const result=await runSourceNarrativeDirectorV1({repoRoot:root,taskId,phaseId,executable:'/usr/bin/true',runVisualPass:async options=>{
    calls++;assert.equal(options.images.length,0);assert.equal(options.context.inputs[0].narration.cues[0].text,text);
    assert.equal(options.context.inputs[0].existingMaterials[0].nativePageEvidence,false);assert.equal(options.context.inputs[0].existingMaterials[0].useClass,'PRIVATE_RECONSTRUCTED_STATIC');
    const output={directions:options.context.inputs.map(input=>({shotId:input.shotId,viewerQuestion:'What makes this relationship clear?',shotFunction:'EXPLAIN',semanticMode:'ANALOGY',actor:'Source-bound subject',action:'Reveal the relationship',viewerBefore:'Relationship unclear',viewerAfter:'Relationship readable',mediumChoice:'AUTHORED_COMPARISON',mediumReason:'Compare the named sides',retainedPackagingDecision:'Reuse existing packaging duty',handoffReason:'Move from comparison to its consequence',sourceCueAnchors:[{index:input.narration.cues[0].index,quote:input.narration.cues[0].text}],sourceUncertainties:['ASR remains unreviewed; no base media admitted']}))};
    fs.mkdirSync(options.outputDirectory,{recursive:true});const b=Buffer.from(JSON.stringify(output));fs.writeFileSync(path.join(options.outputDirectory,'answer.json'),b);return {output,trace:{pass:options.pass,outputHash:hash(b)}};
   }});assert.equal(calls,1);const phase=JSON.parse(fs.readFileSync(path.join(root,'work/module-development-launch-v1/resource-reservations','phase-activation-'+phaseId+'.json')));assert.equal(phase.reservedSlots,0);return result;
  };
  const proposal=await propose('initial'),review=proposal.reviews[0],shot=plan.shots[0];
  for(const [name,mutate] of [['invented-anchor',r=>r.direction.sourceCueAnchors[0].quote='Invented source'],['no-change',r=>r.direction.viewerAfter=r.direction.viewerBefore],['fake-admission',r=>r.executionDesignApproved=true]]){
   const bad=structuredClone(review);mutate(bad);assert.throws(()=>verifySourceNarrativeDirectionV1({repoRoot:root,plan,shot,review:bad}),/SOURCE_BINDING/,name);
  }
  const units=proposal.reviews.map(review=>({shotId:review.shotId,copyMode:'SOURCE_NARRATIVE_DIRECTION',review:save(path.join(dir,review.shotId+'-direction.json'),review)}));
  const adopt=async(suffix,units)=>{const phaseId='adopt-'+genre+'-'+suffix;activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Pure direction adoption',shotIds:['scene','next'],metadata:{units:save(path.join(dir,suffix+'-units.json'),{units})}});return adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId});};
  await adopt('initial',units);let runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});assert.equal(runtime.pending,false);
  for(const [i,s] of runtime.plan.shots.entries())for(const k of ['sourceText','tasks','exactCopy','sourceInterval'])assert.deepEqual(s[k],plan.shots[i][k]);
  const narrativeByShot=Object.fromEntries(runtime.plan.shots.map(s=>[s.id,readSourceNarrativeDirectionV1({repoRoot:root,plan:runtime.plan,shot:s})]));
  assert.equal(productionFrameSequenceContextV1(runtime.plan,['scene:HOLD'],{narrativeByShot})[0].narrativeDirection.actor,'Source-bound subject');
  const ref=path.join(dir,'reference.png');fs.writeFileSync(ref,'Mocked source pixels, not visual acceptance');
  const evidence=save(path.join(dir,'coverage','evidence.json'),{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:plan.source.videoSha256},
   stateFrames:Object.fromEntries(plan.shots.map(s=>[s.id,[{state:'HOLD',sourceFrame:s.sourceInterval.startFrame+1,artifactPath:'reference.png',artifactSha256:hash(fs.readFileSync(ref))}]]))});
  const framePhase='frame-direction-'+genre;activateProductionPhaseV1({repoRoot:root,taskId,phaseId:framePhase,purpose:'STATIC_FRAME_PLANNING',ownerThreadId:'fixture',approvalEvidence:'Pure mocked frame planner consumption',shotIds:['scene','next'],reservedSlots:1,
   metadata:{targets:['scene:HOLD','next:HOLD'],referenceEvidence:evidence,maximumModelPasses:1}});
  const frame=await runProductionFramePlannerV1({repoRoot:root,taskId,phaseId:framePhase,executable:'/usr/bin/true',runVisualPass:async options=>{
   assert.equal(options.context.targets[0].narrativeDirection.actor,'Source-bound subject');
   assert.equal(options.context.sequenceContext[0].narrativeDirectionStatus,'SOURCE_BOUND_PLANNING_CANDIDATE');
   const output={materialIds:[],reason:'No additional material required for this fixture',recipes:plan.shots.map(s=>({targetKey:s.id+':HOLD',route:'GENERATE',reason:'Fixture only',viewerIntent:s.visualJob,brief:'Show '+s.exactCopy[0],transparentBackground:false,
    productionDecision:{method:'GENERATE_COMPLETE_FRAME',whySelected:'No complete fixture frame',alternatives:[{method:'REUSE_COMPLETE_FRAME',reason:'No receipt'}],sequenceRole:'Advance',handoff:'Next'},nativeMaterialId:'',
    contentPlan:{referenceKind:'TYPOGRAPHY_EVENT',subject:s.exactCopy[0],action:'Reveal relationship',viewerTakeaway:s.exactCopy[0],sourceAnchor:s.exactCopy[0],requiredVisibleAnchors:s.exactCopy,treatment:'REBUILD_EDITORIAL'},
    copyIndices:[0],appearance:{composition:'One focus',palette:'Neutral',surface:'Paper'},materialSelections:[],protectedCores:[],continuityGroup:s.id,masterTargetKey:''}))};
   fs.mkdirSync(options.outputDirectory,{recursive:true});const b=Buffer.from(JSON.stringify(output));fs.writeFileSync(path.join(options.outputDirectory,'answer.json'),b);return {output,trace:{pass:options.pass,outputHash:hash(b)}};
  }});assert.equal(frame.units.length,2);
  const sourceReview={contract:'A1StateSourceClaimReview/v1',scope:'RESEARCH_ONLY',reviewerRole:'AGENT',reviewerId:'fixture',productionAdmission:false,visualApproval:false,mediaIdentityVerified:false,target:stateClaimTargetV1(runtime.plan,runtime.plan.shots[0],'HOLD'),evidence:[],claims:[{id:'source-basis',kind:'RESEARCH_CLAIM',text:'Label',anchor:{kind:'DESIGNED_COPY',copyIndex:0},verdict:'UNRESOLVED',reason:'Source qualification is still missing',evidenceIndices:[]}]};
  await adopt('source-gap',[{shotId:'scene',state:'HOLD',copyMode:'REFERENCE_STATE_CLAIM_REVIEW',review:save(path.join(dir,'source-gap.json'),sourceReview)}]);
  runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});const currentShot=runtime.plan.shots[0];
  const currentInput=sourceNarrativeInputV1({repoRoot:root,plan:runtime.plan,shot:currentShot});
  const acknowledgements=[{gapSha256:nodeInputHash(currentInput.sourceClaimGaps[0]),directionField:'sourceUncertainties',quote:'ASR remains unreviewed; no base media admitted',reason:'Reviewer retains the source uncertainty already expressed by this exact old direction; no fact is upgraded.'}];
  const reconciled=reconcileSourceNarrativeDirectionV1({repoRoot:root,plan:runtime.plan,shot:currentShot,reviewerId:'fixture-source-reviewer',acknowledgements});
  const guessed=structuredClone(reconciled);guessed.reconciliation.acknowledgements[0].quote='Unseen acknowledgement';assert.throws(()=>verifySourceNarrativeDirectionV1({repoRoot:root,plan:runtime.plan,shot:currentShot,review:guessed}),/ACK_REQUIRED/);
  const contradictory=structuredClone(reconciled);contradictory.input.sourceClaimGaps[0].verdict='CONTRADICTED';contradictory.inputSha256=nodeInputHash(contradictory.input);assert.throws(()=>verifySourceNarrativeDirectionV1({repoRoot:root,plan:runtime.plan,shot:currentShot,review:contradictory,currentInputRequired:false}),/REQUIRES_NEW_PLAN/);
  const rewritten=structuredClone(reconciled);rewritten.direction.viewerAfter='A different conclusion';assert.throws(()=>verifySourceNarrativeDirectionV1({repoRoot:root,plan:runtime.plan,shot:currentShot,review:rewritten}),/REQUIRES_NEW_PLAN/);
  const changedSource=structuredClone(runtime.plan);changedSource.shots[0].referenceContentObservation={description:'Changed source meaning'};assert.throws(()=>reconcileSourceNarrativeDirectionV1({repoRoot:root,plan:changedSource,shot:changedSource.shots[0],reviewerId:'fixture',acknowledgements}),/REQUIRES_NEW_PLAN/);
  await adopt('reconcile',[{shotId:'scene',copyMode:'SOURCE_NARRATIVE_DIRECTION',review:save(path.join(dir,'reconciled-direction.json'),reconciled),replaceDirectionReviewSha256:currentShot.sourceNarrativeDirection.review.sha256}]);
  runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});assert.deepEqual(readSourceNarrativeDirectionV1({repoRoot:root,plan:runtime.plan,shot:runtime.plan.shots[0]}).direction,review.direction);
  const changed=structuredClone(runtime.plan);changed.shots[0].referenceContentObservation={description:'A clearer comparison now appears'};
  assert.throws(()=>verifySourceNarrativeDirectionV1({repoRoot:root,plan:changed,shot:changed.shots[0],review}),/CURRENT_INPUT_CHANGED/);
  const stale=readSourceNarrativeDirectionV1({repoRoot:root,plan:changed,shot:changed.shots[0]});assert.equal(stale.directionStatus,'STALE_SOURCE_CONTEXT_REPLAN_REQUIRED');
  const staleContext=productionFrameSequenceContextV1(changed,['scene:HOLD'],{narrativeByShot:{scene:stale}})[0];assert.equal(staleContext.narrativeDirection,null);
  fs.writeFileSync(planFile,JSON.stringify(changed,null,2)+'\n');syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(changed)});
  const revised=await propose('revision');const revisedUnits=revised.reviews.map((review,i)=>({shotId:review.shotId,copyMode:'SOURCE_NARRATIVE_DIRECTION',review:save(path.join(dir,review.shotId+'-revised.json'),review),replaceDirectionReviewSha256:runtime.plan.shots[i].sourceNarrativeDirection.review.sha256}));
  await adopt('revision',revisedUnits);runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});assert.equal(runtime.plan.shots[0].sourceNarrativeDirectionHistory.length,2);
  assert.equal(readSourceNarrativeDirectionV1({repoRoot:root,plan:runtime.plan,shot:runtime.plan.shots[0]}).directionStatus,'SOURCE_BOUND_PLANNING_CANDIDATE');
  fs.appendFileSync(path.join(root,revisedUnits[0].review.path),' ');assert.throws(()=>readShotTaskRuntimeV1({repoRoot:root,taskId}),/BYTES_CHANGED/);
  fs.appendFileSync(privateFile,' changed');assert.throws(()=>sourceNarrativeInputV1({repoRoot:root,plan,shot}),/MATERIAL_BYTES_CHANGED/);
  fixtures.push({id:genre,genre,status:'PASS',normalDirectorMockedCall:true,normalSourceAdoption:true,fullFramePlannerConsumesDirection:true,sourceQuotesBound:true,oldVisualCopyPreserved:true,staleDirectionExcludedAndNormallyReplaced:true,reviewedQualificationOnlyReconciliation:true,reconciliationModelCalls:0});
 }
 const result={status:'PASS',fixtures,verificationScope:'SOURCE_DIRECTION_CONTRACT_AND_ROUTING_NOT_NARRATIVE_OR_PIXEL_ACCEPTANCE',productionAdmission:false};console.log(JSON.stringify(result));
 if(process.argv.includes('--output'))fs.writeFileSync(process.argv[process.argv.indexOf('--output')+1],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
}finally{fs.rmSync(root,{recursive:true,force:true});}
