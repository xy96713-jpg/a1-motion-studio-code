import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {adoptProductionWorkScopeV1,projectProductionEditorialBriefV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {readShotTaskRuntimeV1,syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {productionFrameGoalShaV1,productionFrameRequestIsCurrentV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {productionFrameSequenceContextV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
import {sourceNarrativeEditorialPolicyV1} from '../apps/studio-next/src/lib/a1-reference-visual-director-v2.mjs';
import {prepareSourceNarrationContextV1} from '../apps/studio-next/src/lib/a1-source-narration-context-v1.mjs';
import {sourceNarrativeInputV1,verifySourceNarrativeDirectionV1} from '../apps/studio-next/src/lib/a1-source-narrative-direction-v1.mjs';
import {createHash} from 'node:crypto';
import {compileEditorialSequenceDirectorV1,readGlobalDirectorContextV1} from '../apps/studio-next/src/lib/a1-director-production-plan-v1.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-editorial-brief-')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixtures=[['evidence','材料受热后膨胀。'],['product','选择文件后检查导出结果。'],['opinion','便宜的价格可能意味着另一种代价。']];
const results=[];
try {
  for(const [genre,text] of fixtures){
    const taskId='brief-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
    const save=(name,value)=>{const file=path.join(dir,name),bytes=Buffer.from(JSON.stringify(value));fs.writeFileSync(file,bytes);return {path:path.relative(root,file),sha256:hash(bytes)};};
    const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,
      source:{kind:'VIDEO',videoSha256:'a'.repeat(64),fps:30},
      shots:['opening','explanation','result'].map((id,i)=>({id,sourceText:text,visualJob:'Explain the source relationship',exactCopy:[text],
        sourceInterval:{startFrame:i*30,endFrameExclusive:(i+1)*30},tasks:[{module:'media-files',dependencies:[],parameters:{},blocker:'SOURCE_MISSING'}]}))};
    const transcript=save('transcript.json',{kind:'REFERENCE_LOCAL_ASR_TRANSCRIPT',status:'ASR_DRAFT_READY_FOR_TEXT_REVIEW',sourceSha256:plan.source.videoSha256,sourceDurationSeconds:3,
      boundary:{textNeedsHumanReview:true,productionAdmission:false},segments:plan.shots.map((s,i)=>({startMs:i*1000,endMs:(i+1)*1000,text}))});
    for(const shot of plan.shots){const context=prepareSourceNarrationContextV1({repoRoot:root,plan,shot,transcript});shot.sourceNarration={review:save(shot.id+'-narration.json',context),contextSha256:nodeInputHash(context)};}
    const oldInput=sourceNarrativeInputV1({repoRoot:root,plan,shot:plan.shots[0]});
    const file=path.join(dir,'shot-task-plan-v1.json');fs.writeFileSync(file,JSON.stringify(plan));
    syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
    const brief={contentMode:'FACTUAL_ADAPTATION',presentationMode:'FACELESS',objective:'Create a coherent source-led whole-film sample',authorizationEvidence:'Human explicitly chose factual adaptation and a faceless sample'};
    const adopt=()=>adoptProductionWorkScopeV1({repoRoot:root,taskId,phaseId:'bind-'+genre,shotIds:plan.shots.map(s=>s.id),objective:brief.objective,
      expectedPlanSha256:readShotTaskRuntimeV1({repoRoot:root,taskId}).inputPlanSha256,editorialBrief:brief});
    const adopted=await adopt();assert.equal(adopted.pending,false);assert.equal(adopted.newClaims,0);
    const current=readShotTaskRuntimeV1({repoRoot:root,taskId}).plan;
    assert.deepEqual(current.shots,plan.shots);assert.equal(projectProductionEditorialBriefV1(current).executionAuthorized,false);
    assert.equal(productionFrameSequenceContextV1(current,['explanation:HOLD']).length,3);
    assert.equal(productionFrameSequenceContextV1(current,['explanation:HOLD'])[0].editorialBrief.presentationMode,'FACELESS');
    assert.ok(sourceNarrativeEditorialPolicyV1(current).includes('用户已选择无人出镜'));
    assert.ok(sourceNarrativeEditorialPolicyV1(plan).includes('不得擅自转成无人出镜'));
    const oldGoal=productionFrameGoalShaV1(plan,plan.shots[0],'HOLD');
    assert.notEqual(productionFrameGoalShaV1(current,current.shots[0],'HOLD'),oldGoal);
    assert.equal(productionFrameRequestIsCurrentV1({plan:current,shot:current.shots[0],request:{state:'HOLD',goalInputSha256:oldGoal},unit:{}}),false);
    assert.equal(productionFrameRequestIsCurrentV1({plan:current,shot:current.shots[0],request:{state:'HOLD'},unit:{}}),false);
    const input=sourceNarrativeInputV1({repoRoot:root,plan:current,shot:current.shots[0]});assert.notEqual(nodeInputHash(input),nodeInputHash(oldInput));
    const narrationByShot=Object.fromEntries(current.shots.map(s=>[s.id,sourceNarrativeInputV1({repoRoot:root,plan:current,shot:s}).narration]));
    const group={shotIds:current.shots.map(s=>s.id),viewerTask:'说明内容关系并读出结果',visualFamily:'关系图接到结果证据',sourceNeeds:['实际结果或原生资料'],
      typographyDuty:'只显示已核文案',handoff:'解释接到结果',actor:'内容主体',action:'展开关系再显示结果',viewerBefore:'关系尚不清楚',viewerAfter:'理解关系及其边界',
      sourceUncertainties:['口播仍需核实'],sourceCueAnchors:[{shotId:'opening',index:0,quote:text}]};
    const sequenceInput={plan:current,groups:[group],narrationByShot,thesis:'先解释再核实结果',rhythm:'提问、解释、结果持有',visualRules:['避免每镜重复标题卡'],reviewerId:'fixture'};
    const sequence=compileEditorialSequenceDirectorV1(sequenceInput);assert.equal(sequence.shots.length,3);assert.equal(sequence.productionAdmission,false);
    const directed={...current,globalDesign:save('global-design.json',sequence)};
    assert.equal(readGlobalDirectorContextV1(root,directed).shots.length,3);
    const withNewPixels=structuredClone(directed);withNewPixels.shots[0].completedStaticExecutions={fixtureOnly:true};
    assert.equal(readGlobalDirectorContextV1(root,withNewPixels).shots.length,3);
    const badSequence=structuredClone(sequence);badSequence.groups[0].sourceCueAnchors[0].quote='invented';
    assert.throws(()=>readGlobalDirectorContextV1(root,{...current,globalDesign:save('bad-global-design.json',badSequence)}),/SPOKEN_ANCHOR/);
    assert.throws(()=>compileEditorialSequenceDirectorV1({...sequenceInput,groups:[{...group,shotIds:['opening','result']}]}),/FULL_SOURCE_COVERAGE/);
    assert.throws(()=>compileEditorialSequenceDirectorV1({...sequenceInput,groups:[{...group,shotIds:['result','explanation','opening']}]}),/FULL_SOURCE_COVERAGE/);
    assert.throws(()=>compileEditorialSequenceDirectorV1({...sequenceInput,groups:[{...group,sourceCueAnchors:[{shotId:'opening',index:0,quote:'invented'}]}]}),/SPOKEN_ANCHOR/);
    const direction={shotId:'opening',viewerQuestion:'观众需要理解什么关系？',shotFunction:'EXPLAIN',semanticMode:'PROCEDURE',actor:'内容主体',action:'显示解释关系',
      viewerBefore:'关系尚不清楚',viewerAfter:'关系能够读懂',mediumChoice:'AUTHORED_COMPARISON',mediumReason:'并列展示关系',retainedPackagingDecision:'复用相容素材',handoffReason:'解释接到结果',
      sourceCueAnchors:[{index:0,quote:text}],sourceUncertainties:['口播仍是待核ASR']};
    const review={contract:'A1SourceNarrativeDirection/v1',shotId:'opening',input,inputSha256:nodeInputHash(input),direction,
      executionDesignApproved:false,visualApproval:false,motionApproval:false,productionAdmission:false};
    verifySourceNarrativeDirectionV1({repoRoot:root,plan:current,shot:current.shots[0],review});
    assert.throws(()=>verifySourceNarrativeDirectionV1({repoRoot:root,plan:current,shot:current.shots[0],review:{...review,direction:{...direction,mediumChoice:'PRESENTER_OVERLAY'}}}),/FACELESS_PRESENTER_CONFLICT/);
    const bytes=fs.readFileSync(file);await adopt();assert.ok(fs.readFileSync(file).equals(bytes));
    await assert.rejects(adoptProductionWorkScopeV1({repoRoot:root,taskId,phaseId:'bad-'+genre,shotIds:['opening'],objective:'Invalid brief',expectedPlanSha256:nodeInputHash(current),editorialBrief:{...brief,productionAdmission:true}}),/INPUT_INVALID/);
    assert.ok(fs.readFileSync(file).equals(bytes));
    assert.throws(()=>projectProductionEditorialBriefV1({...current,source:{...current.source,fps:60}}),/SOURCE_CHANGED/);
    results.push({genre,status:'PASS'});
  }
  console.log(JSON.stringify({status:'PASS',fixtures:results,scope:'CONTRACT_AND_NORMAL_ADOPTION_NOT_BLIND_ARTICLE_OR_PIXEL_ACCEPTANCE',providerCalls:0}));
} finally {fs.rmSync(root,{recursive:true,force:true});}
