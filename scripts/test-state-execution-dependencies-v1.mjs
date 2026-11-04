import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {prepareStateExecutionDependenciesV1,readStateExecutionDependenciesV1} from '../apps/studio-next/src/lib/a1-state-execution-dependencies-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {adoptSourcedFrameInputsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {verifyReferenceStateIntentsV1} from '../apps/studio-next/src/lib/a1-reference-state-intent-v1.mjs';
const sharp=createRequire(new URL('../apps/studio-next/package.json',import.meta.url))('sharp');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'execution-dependencies-'))),fixtures=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');return {path:path.relative(root,file),sha256:hash(fs.readFileSync(file))};};
const pin=file=>({path:path.relative(root,file),sha256:hash(fs.readFileSync(file)),bytes:fs.statSync(file).size});
try {
  for(const genre of ['typography','editorial-comparison','source-explainer']) {
    const taskId='dependency-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
    const ref=path.join(dir,'reference.png'),core=path.join(dir,'atlas.png');
    await sharp({create:{width:4,height:4,channels:4,background:'#334455'}}).png().toFile(ref);
    await sharp({create:{width:4,height:12,channels:4,background:'#112233'}}).png().toFile(core);
    const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'a'.repeat(64)},
      visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
      shots:[{id:'scene',sourceText:'A comparison',visualJob:'Read the relationship',sourceInterval:{startFrame:0,endFrameExclusive:4},exactCopy:['Left','Right'],tasks:[{module:'media-files',dependencies:[],parameters:{files:[]},blocker:'FIXTURE_ONLY'}]}]};
    const shot=plan.shots[0];
    const evidence=save(path.join(dir,'coverage','evidence.json'),{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:plan.source.videoSha256},stateFrames:{scene:['ENTRY','HOLD','HANDOFF'].map((state,i)=>({state,sourceFrame:i+1,artifactPath:'reference.png',artifactSha256:pin(ref).sha256}))}});
    const intent={contract:'A1ReferenceStateIntentReview/v1',shotId:shot.id,sourceVideoSha256:plan.source.videoSha256,reviewedBy:'fixture',exactCopy:shot.exactCopy,referenceEvidence:evidence,
      states:['ENTRY','HOLD','HANDOFF'].map((state,i)=>({state,reference:{...pin(ref),state,sourceFrame:i+1},viewerNotice:'Notice comparison',viewerChange:'Read comparison',sequenceRole:'Continue',handoff:'Next beat',visibleCopyIndices:i?[0,1]:[],copyObservation:i?'LOCKED_VISIBLE':'PARTIAL_NOT_READABLE',baseMediaStatus:'SEPARATE_SOURCE_INTEGRATION_REQUIRED',geometryStatus:'UNMEASURED',motionStatus:'UNMEASURED'})),productionAdmission:false,visualApproval:false,motionApproved:false};
    shot.referenceStateIntents={review:save(path.join(dir,'intent.json'),intent),intentSha256:nodeInputHash(verifyReferenceStateIntentsV1({repoRoot:root,plan,shot,review:intent}))};
    const review={contract:'A1IndependentActualStaticVisualReview/v1',reviewerThreadId:'fixture-reviewer',productionAdmission:false,
      sourceClockBinding:{sourceVideoSHA:plan.source.videoSha256,referenceFramesAreComparisonOnly:true},groups:[{shotId:shot.id,coreVisualPASS:true,anchors:intent.states.map((s,i)=>({shotId:shot.id,anchor:s.state,sourceFrame:s.reference.sourceFrame,reference:pin(ref),coreSupportPASS:true,wholeAnchorPASS:false,candidate:{...pin(core),selectionRect:{x:0,y:i*4,width:4,height:4}}}))}]};
    const reviewFile=save(path.join(dir,'core-review.json'),review),prepare=()=>prepareStateExecutionDependenciesV1({repoRoot:root,plan,shot,scopedCoreReview:reviewFile});
    const draft=prepare();assert.equal(draft.states.length,3);assert.equal(draft.states[2].layers[1].selectionRect.y,8);
    assert.equal(draft.states[0].layers[1].copyIndices.length,0);assert.ok(draft.states.every(s=>!s.execution.ready&&!s.execution.generationRequiredForExistingCore));
    for(const [name,mutate,pattern] of [
      ['wrong-frame',r=>r.groups[0].anchors[1].sourceFrame=3,/ANCHOR_BINDING/],
      ['whole-frame',r=>r.groups[0].anchors[0].wholeAnchorPASS=true,/ANCHOR_BINDING/],
      ['reference-as-output',r=>r.groups[0].anchors[0].candidate={...pin(ref),selectionRect:{x:0,y:0,width:4,height:4}},/REFERENCE_PIXELS_NOT_OUTPUT/],
      ['wrong-copy-source',r=>r.groups[0].anchors[0].reference.sha256='b'.repeat(64),/ANCHOR_BINDING/],
      ['out-of-container',r=>r.groups[0].anchors[2].candidate.selectionRect.y=12,/CONTAINER_REGION/]
    ]) {
      const changed=structuredClone(review);mutate(changed);const file=save(path.join(dir,name+'.json'),changed);
      assert.throws(()=>prepareStateExecutionDependenciesV1({repoRoot:root,plan,shot,scopedCoreReview:file}),pattern);
    }
    const draftFile=save(path.join(dir,'dependencies.json'),draft);
    shot.stateExecutionDependencies={review:draftFile,dependenciesSha256:nodeInputHash(draft)};
    assert.deepEqual(readStateExecutionDependenciesV1({repoRoot:root,plan,shot}),draft);
    const fake=structuredClone(draft);fake.actualSourceBaseAvailable=true;fake.states[0].layers[0].inputStatus='BOUND';
    const fakeFile=save(path.join(dir,'fake-base.json'),fake);
    assert.throws(()=>readStateExecutionDependenciesV1({repoRoot:root,plan,shot:{...shot,stateExecutionDependencies:{review:fakeFile,dependenciesSha256:nodeInputHash(fake)}}}),/DEPENDENCY_CHANGED/);
    delete shot.stateExecutionDependencies;save(path.join(dir,'shot-task-plan-v1.json'),plan);
    syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
    const units=save(path.join(dir,'units.json'),{units:[{shotId:shot.id,copyMode:'STATE_EXECUTION_DEPENDENCIES',review:draftFile}]});
    const phaseId='adopt-dependencies-'+genre;
    activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Pure isolated dependency fixture',shotIds:[shot.id],metadata:{units}});
    await adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId});const runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});
    assert.equal(runtime.pending,false);assert.deepEqual(runtime.plan.shots[0].tasks,shot.tasks);assert.deepEqual(runtime.plan.shots[0].exactCopy,shot.exactCopy);
    assert.equal(runtime.plan.shots[0].referenceProductionDesign,undefined);
    assert.deepEqual(readStateExecutionDependenciesV1({repoRoot:root,plan:runtime.plan,shot:runtime.plan.shots[0]}),draft);
    fs.appendFileSync(core,'changed');assert.throws(()=>readShotTaskRuntimeV1({repoRoot:root,taskId}),/SOURCE_CHANGED/);
    fixtures.push({id:genre,genre,status:'PASS',normalAdoption:true,coreReused:true,sceneReady:false,providerCalls:0});
  }
  const result={status:'PASS',fixtures,verificationScope:'SOURCE_DEPENDENCY_JOIN_NOT_PIXEL_OR_MOTION_ACCEPTANCE',productionAdmission:false};
  console.log(JSON.stringify(result));
  if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
} finally {fs.rmSync(root,{recursive:true,force:true});}
