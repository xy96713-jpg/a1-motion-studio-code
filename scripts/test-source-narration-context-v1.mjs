import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {prepareSourceNarrationContextV1,readSourceNarrationContextV1} from '../apps/studio-next/src/lib/a1-source-narration-context-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {adoptSourcedFrameInputsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {productionFrameSequenceContextV1,productionFramePlannerPromptV1,runProductionFramePlannerV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'narration-context-'))),fixtures=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');return {path:path.relative(root,file),sha256:hash(fs.readFileSync(file))};};
try {
  for(const [genre,spoken] of [['evidence-explainer','Evidence is limited to this sample'],['product-tutorial','Restore the saved version before continuing'],['editorial-comparison','A stronger team still needs transport']]) {
    const taskId='narration-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
    const source={kind:'REFERENCE_LOCAL_ASR_TRANSCRIPT',status:'ASR_DRAFT_READY_FOR_TEXT_REVIEW',sourceSha256:'a'.repeat(64),sourceDurationSeconds:4,
      boundary:{textNeedsHumanReview:true,productionAdmission:false},segments:[{startMs:0,endMs:1000,text:'Previous thought'},
        {startMs:1000,endMs:1500,text:spoken},{startMs:1500,endMs:2500,text:'A sentence crossing the visual cut'},
        {startMs:2500,endMs:3000,text:'The next thought'}]};
    const transcript=save(path.join(dir,'transcript.json'),source);
    const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:source.sourceSha256,fps:10},
      visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
      shots:[{id:'scene',sourceText:'A paper reveals',visualJob:'Read a relationship',sourceInterval:{startFrame:10,endFrameExclusive:20},exactCopy:['Visible label'],tasks:[{module:'media-files',dependencies:[],parameters:{files:[]},blocker:'FIXTURE_ONLY'}]},
        {id:'next',sourceText:'A document appears',visualJob:'Read evidence',sourceInterval:{startFrame:20,endFrameExclusive:40},exactCopy:['Document'],tasks:[{module:'media-files',dependencies:[],parameters:{files:[]},blocker:'FIXTURE_ONLY'}]}]};
    const shot=plan.shots[0],prepare=()=>prepareSourceNarrationContextV1({repoRoot:root,plan,shot,transcript});
    const draft=prepare();assert.equal(draft.cues.length,2);assert.equal(draft.cues[0].text,spoken);
    assert.equal(draft.cues[1].text,'A sentence crossing the visual cut');assert.equal(draft.cues[1].textExtent,'FULL_CUE_PARTIAL_INTERVAL');
    assert.deepEqual(draft.cues[1].intersection,{startMs:1500,endMs:2000});assert.equal(draft.factualVerification,false);
    const bad=structuredClone(source);bad.sourceSha256='b'.repeat(64);const wrong=save(path.join(dir,'wrong-source.json'),bad);
    assert.throws(()=>prepareSourceNarrationContextV1({repoRoot:root,plan,shot,transcript:wrong}),/INPUT_BINDING/);
    bad.sourceSha256=source.sourceSha256;bad.boundary.textNeedsHumanReview=false;
    assert.throws(()=>prepareSourceNarrationContextV1({repoRoot:root,plan,shot,transcript:save(path.join(dir,'fake-reviewed.json'),bad)}),/INPUT_BINDING/);
    const noCue=prepareSourceNarrationContextV1({repoRoot:root,plan,shot:{...shot,sourceInterval:{startFrame:35,endFrameExclusive:40}},transcript});
    assert.equal(noCue.status,'NO_OVERLAPPING_CUES');
    const units=plan.shots.map(s=>({shotId:s.id,copyMode:'SOURCE_NARRATION_CONTEXT',review:save(path.join(dir,s.id+'-context.json'),prepareSourceNarrationContextV1({repoRoot:root,plan,shot:s,transcript}))}));
    save(path.join(dir,'shot-task-plan-v1.json'),plan);syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
    const phaseId='adopt-narration-'+genre,unitFile=save(path.join(dir,'units.json'),{units});
    activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Isolated narration context fixture',shotIds:plan.shots.map(s=>s.id),metadata:{units:unitFile}});
    await adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId});const runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});assert.equal(runtime.pending,false);
    const narrationByShot=Object.fromEntries(runtime.plan.shots.map(s=>[s.id,readSourceNarrationContextV1({repoRoot:root,plan:runtime.plan,shot:s})]));
    const context=productionFrameSequenceContextV1(runtime.plan,['scene:HOLD'],{narrationByShot});
    assert.equal(context[0].content,shot.sourceText);assert.equal(context[0].narrationStatus,'SOURCE_TIMED_ASR_DRAFT');
    assert.ok(context[0].suppliedNarration.includes(spoken));assert.equal(context[1].narrationContext.cues[0].textExtent,'FULL_CUE_PARTIAL_INTERVAL');
    const prompt=productionFramePlannerPromptV1({sequenceContext:context});assert.ok(prompt.includes(spoken));assert.ok(prompt.includes('ASR draft is unreviewed'));
    const ref=path.join(dir,'reference.png');fs.writeFileSync(ref,'Mocked reference; this test is not visual proof');
    const evidence=save(path.join(dir,'coverage','evidence.json'),{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:plan.source.videoSha256},
      stateFrames:Object.fromEntries(plan.shots.map(s=>[s.id,[{state:'HOLD',sourceFrame:s.sourceInterval.startFrame+1,artifactPath:'reference.png',artifactSha256:hash(fs.readFileSync(ref))}]]))});
    const plannerPhase='planner-narration-'+genre;
    activateProductionPhaseV1({repoRoot:root,taskId,phaseId:plannerPhase,purpose:'STATIC_FRAME_PLANNING',ownerThreadId:'fixture',approvalEvidence:'Pure mocked planner test',shotIds:plan.shots.map(s=>s.id),reservedSlots:1,
      metadata:{targets:plan.shots.map(s=>s.id+':HOLD'),referenceEvidence:evidence,maximumModelPasses:1}});
    let calls=0;
    const proposal=await runProductionFramePlannerV1({repoRoot:root,taskId,phaseId:plannerPhase,executable:'/usr/bin/true',runVisualPass:async options=>{
      calls++;assert.ok(options.context.sequenceContext[0].suppliedNarration.includes(spoken));
      assert.equal(options.context.targets[0].narrationContext.cues[0].text,spoken);
      assert.equal(options.context.targets[0].sourceText,shot.sourceText);assert.ok(options.prompt.includes('ASR draft is unreviewed'));
      const output={materialIds:[],reason:'No extra material in this fixture',recipes:plan.shots.map(s=>({targetKey:s.id+':HOLD',route:'GENERATE',reason:'Fixture only',viewerIntent:s.visualJob,brief:'Show '+s.exactCopy[0],transparentBackground:false,
        productionDecision:{method:'GENERATE_COMPLETE_FRAME',whySelected:'No complete fixture frame',alternatives:[{method:'REUSE_COMPLETE_FRAME',reason:'No receipt'}],sequenceRole:'Advance',handoff:'Next'},nativeMaterialId:'',
        contentPlan:{referenceKind:'TYPOGRAPHY_EVENT',subject:s.exactCopy[0],action:'Reveal relationship',viewerTakeaway:s.exactCopy[0],sourceAnchor:s.exactCopy[0],requiredVisibleAnchors:s.exactCopy,treatment:'REBUILD_EDITORIAL'},
        copyIndices:[0],appearance:{composition:'One focus',palette:'Neutral',surface:'Paper'},materialSelections:[],protectedCores:[],continuityGroup:s.id,masterTargetKey:''}))};
      fs.mkdirSync(options.outputDirectory,{recursive:true});const b=Buffer.from(JSON.stringify(output));fs.writeFileSync(path.join(options.outputDirectory,'answer.json'),b);
      return {output,trace:{pass:options.pass,outputHash:hash(b)}};
    }});
    assert.equal(calls,1);assert.equal(proposal.units.length,2);
    for(const [i,after] of runtime.plan.shots.entries())for(const k of ['sourceText','exactCopy','tasks','sourceInterval'])assert.deepEqual(after[k],plan.shots[i][k]);
    const fake=structuredClone(draft);fake.factualVerification=true;const fakeFile=save(path.join(dir,'fake-context.json'),fake);
    assert.throws(()=>readSourceNarrationContextV1({repoRoot:root,plan,shot:{...shot,sourceNarration:{review:fakeFile,contextSha256:nodeInputHash(fake)}}}),/CONTEXT_CHANGED/);
    const changedShot={...runtime.plan.shots[0],sourceInterval:{startFrame:11,endFrameExclusive:20}};
    assert.throws(()=>readSourceNarrationContextV1({repoRoot:root,plan:runtime.plan,shot:changedShot}),/CONTEXT_CHANGED/);
    fs.appendFileSync(path.join(dir,'transcript.json'),' ');assert.throws(()=>readShotTaskRuntimeV1({repoRoot:root,taskId}),/BYTES_CHANGED/);
    fixtures.push({id:genre,genre,status:'PASS',normalAdoption:true,fullPlannerMockedCallReceivesNarration:true,spokenMeaningInPlannerPrompt:true,oldCopyAndVisualObservationPreserved:true,ASRRemainsUnreviewed:true});
  }
  const result={status:'PASS',fixtures,verificationScope:'SOURCE_CONTEXT_BINDING_NOT_NARRATIVE_QUALITY_OR_WORD_TIMING_PROOF',productionAdmission:false};console.log(JSON.stringify(result));
  if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
} finally {fs.rmSync(root,{recursive:true,force:true});}
