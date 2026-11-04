import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {projectProductionMaterialPoolV1} from '../apps/studio-next/src/lib/a1-production-material-pool-v1.mjs';
import {runProductionFramePlannerV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
import {directorSourceIdentityV1} from '../apps/studio-next/src/lib/a1-director-production-plan-v1.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'first-pass-planner-'))),taskId='unseen-planning-fixture',dir=path.join(root,'work',taskId);
fs.mkdirSync(dir,{recursive:true});
const fixtures=[['typography','TYPOGRAPHY_EVENT','输入发生变化'],['editorial-comparison','EDITORIAL_INFOGRAPHIC','开放与关闭'],['source-explainer','CONCEPT_SCENE','能量逐级传递']];
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});return {path:path.relative(root,file),sha256:hash(fs.readFileSync(file))};};
try {
  const reference=path.join(dir,'reference.png');fs.writeFileSync(reference,'mocked reference bytes; not visual proof');
  const assets=Array.from({length:30},(_,i)=>{const file=path.join(dir,'material-'+i+'.png');fs.writeFileSync(file,'mocked material '+i);return {assetId:'material-'+i,path:file,sha256:hash(fs.readFileSync(file)),kind:'IMAGE',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET'};});
  const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{kind:'VIDEO',videoSha256:'a'.repeat(64)},
    visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
    shots:fixtures.map(([id,,copy],i)=>({id:'S'+i,sourceText:copy,visualJob:'Explain '+copy,exactCopy:[copy],tasks:[{module:'media-files',parameters:{},dependencies:[],blocker:'FIXTURE_ONLY'}],productionResources:{assets:i?[]:assets}}))};
  const global={contract:'A1GlobalReferenceProductionPlan/v1',sourceIdentity:directorSourceIdentityV1(plan),productionAdmission:false,visualApproval:false,
    shots:plan.shots.map(s=>({shotId:s.id,viewerTask:s.visualJob,groupViewerTask:'Read cause then contrast then consequence',visualFamily:'Keep source relationships clear',sourceNeeds:['Unverified external source remains required'],typographyDuty:'Do not guess unclear source copy',handoff:'Move to the next source-bound question'}))};
  plan.globalDesign=save(path.join(dir,'global-design.json'),global);
  save(path.join(dir,'shot-task-plan-v1.json'),plan);syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
  const evidence=save(path.join(dir,'coverage','evidence.json'),{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:plan.source.videoSha256},
    stateFrames:Object.fromEntries(plan.shots.map(s=>[s.id,[{state:'HOLD',sourceFrame:1,artifactPath:'reference.png',artifactSha256:hash(fs.readFileSync(reference))}]]))});
  const pool=projectProductionMaterialPoolV1({plan}),chosen=pool.materials[0].id,targets=plan.shots.map(s=>s.id+':HOLD');
  const recipes=plan.shots.map((s,i)=>({targetKey:targets[i],route:'GENERATE',reason:'Content can be drawn from locked meaning',viewerIntent:s.visualJob,brief:'完整呈现'+s.exactCopy[0],transparentBackground:false,
    productionDecision:{method:'GENERATE_COMPLETE_FRAME',whySelected:'No accepted complete frame',alternatives:[{method:'REUSE_COMPLETE_FRAME',reason:'No receipt'}],sequenceRole:'Advance this source',handoff:'Continue to adjacent source'},nativeMaterialId:'',
    contentPlan:{referenceKind:fixtures[i][1],subject:s.exactCopy[0],action:'Show this relationship',viewerTakeaway:s.exactCopy[0],sourceAnchor:s.exactCopy[0],requiredVisibleAnchors:s.exactCopy,treatment:'REBUILD_EDITORIAL'},
    copyIndices:[0],appearance:{composition:'One source-bound focus',palette:'Neutral',surface:'Editorial'},materialSelections:[],protectedCores:[],continuityGroup:s.id,masterTargetKey:''}));
  const events=[];
  const execute=async(id,{selected=false,reuse=null,mutate=null,unexpectedSelection=false,mixed=false}={})=>{
    let calls=0;const phaseId='fixture-'+id;
    activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'STATIC_FRAME_PLANNING',ownerThreadId:'fixture',approvalEvidence:'Pure mocked fixtures only',shotIds:plan.shots.map(s=>s.id),reservedSlots:reuse?0:1,maximumExecutionMs:60000,
      metadata:{targets,referenceEvidence:evidence,materialImageBudget:4,maximumModelPasses:4,...(reuse?{reuseProposalFrom:reuse}:{})}});
    const result=await runProductionFramePlannerV1({repoRoot:root,taskId,phaseId,executable:'/usr/bin/true',runVisualPass:async options=>{
      calls++;events.push({phaseId,pass:options.pass,images:options.images.length});
      if(options.pass==='production-frame-recipes'){
        assert.equal(options.context.directorContextStatus,'CURRENT_SOURCE_AND_BYTES_BOUND');
        assert.ok(options.context.sequenceContext.every(s=>s.directorContext.typographyDuty==='Do not guess unclear source copy'));
        assert.ok(options.context.sequenceContext.every(s=>s.narrationStatus==='NOT_BOUND'));
        assert.equal(options.context.productionCapabilities.find(c=>c.id==='hyperframes-render').callable,false);
      }
      let output;
      if(options.pass==='production-material-catalogue')output={materials:options.context.materials.map(m=>({...m,visualDescription:'Mocked inspection',subjects:[],objects:[],palette:[],composition:'Mocked source focus',usableAs:['SUBJECT']}))};
      else if(selected&&calls===1)output={materialIds:[chosen],reason:'A specific subject image is needed',recipes:mixed?structuredClone(recipes):[]};
      else {const copy=structuredClone(recipes);if(selected||unexpectedSelection)copy[0].materialSelections=[{materialId:unexpectedSelection?pool.materials[1].id:chosen,use:'SUBJECT',reason:'Subject pixels inspected',preserveNative:false}];
        if(mutate)mutate(copy);output=options.schema.properties.materialIds?{materialIds:[],reason:'No auxiliary material needed',recipes:copy}:{recipes:copy};}
      fs.mkdirSync(options.outputDirectory,{recursive:true});const bytes=Buffer.from(JSON.stringify(output));
      fs.writeFileSync(path.join(options.outputDirectory,'answer.json'),bytes,{flag:'wx'});
      const trace={pass:options.pass,outputHash:hash(bytes)};
      save(path.join(options.outputDirectory,'trace.json'),trace);
      save(path.join(options.outputDirectory,'request.json'),{imageBindings:options.images.map(image=>({sha256:image.sha256,snapshot:image.path}))});
      return {output,trace};
    }});
    const closed=JSON.parse(fs.readFileSync(path.join(root,'work/module-development-launch-v1/resource-reservations','phase-activation-'+phaseId+'.json')));
    assert.equal(closed.reservedSlots,0);assert.equal(closed.actualModelPassCount,calls);return {...result,calls};
  };
  const direct=await execute('direct');assert.equal(direct.calls,1);assert.equal(direct.units.length,3);assert.equal(direct.inspectedMaterialCount,0);
  const directReuse=await execute('direct-reuse',{reuse:'fixture-direct'});assert.equal(directReuse.calls,0);
  const inspected=await execute('selected',{selected:true});assert.equal(inspected.calls,3);assert.equal(inspected.inspectedMaterialCount,1);assert.equal(inspected.units[0].materialSelections[0].materialId,chosen);
  const cached=await execute('cached',{selected:true});assert.equal(cached.calls,2,'one selected cached image needs no repeated inspection');
  const inspectedReuse=await execute('selected-reuse',{reuse:'fixture-selected'});assert.equal(inspectedReuse.calls,0,'reuse the final inspected recipe receipt, not the preliminary decision');
  await assert.rejects(execute('blind-material',{unexpectedSelection:true}),/DIRECT_RECIPE_INVALID/);
  await assert.rejects(execute('mixed-before-inspection',{selected:true,mixed:true}),/UNINSPECTED_MATERIAL_RECIPE/);
  await assert.rejects(execute('unselected-after-inspection',{selected:true,unexpectedSelection:true}),/UNINSPECTED_MATERIAL_RECIPE/);
  await assert.rejects(execute('bad-copy',{mutate:r=>{r[0].copyIndices=[99];}}),/RECIPE_INVALID/);
  await assert.rejects(execute('native-without-core',{mutate:r=>{r[0].contentPlan.referenceKind='NATIVE_DOCUMENT';r[0].contentPlan.treatment='PRESERVE_NATIVE';}}),/NATIVE_PIXELS_REQUIRED/);
  await assert.rejects(execute('fake-source',{mutate:r=>{r[0].contentPlan.sourceAnchor='Invented fact';}}),/ANCHOR_UNBOUND/);
  await assert.rejects(execute('lost-content',{mutate:r=>{r[0].brief='Generic background';}}),/BRIEF_DROPPED_SOURCE/);
  const gap=await execute('source-gap',{mutate:r=>{r[2].route='SOURCE_REQUIRED';r[2].productionDecision.method='SOURCE_REQUIRED';}});assert.equal(gap.waiting.length,1);assert.equal(gap.units.length,2);
  fs.appendFileSync(path.join(dir,'global-design.json'),' ');
  const beforeDrift=events.length;
  await assert.rejects(execute('global-drift'),/GLOBAL_DIRECTOR_SHA_MISMATCH/);
  assert.equal(events.length,beforeDrift,'changed global director bytes must block before any model pass');
  const report={status:'PASS',verificationScope:'MOCKED_FULL_PLANNER_RUNTIME_NO_VISUAL_QUALITY_CLAIM',fixtures:fixtures.map(([id])=>({id,genre:id,status:'PASS'})),
    modelCalls:{direct:direct.calls,selectedUncached:inspected.calls,selectedCached:cached.calls,directRepeat:directReuse.calls,selectedRepeat:inspectedReuse.calls},
    checks:['30-material-pool-no-unneeded-inspection','selected-pixels-before-recipes','cache-reuse','final-receipt-reuse','locked-copy','native-core','source-anchor','content-retention','source-gap','global-director-context','missing-narration-not-guessed','actual-module-availability','global-byte-drift-zero-model'],events,productionAdmission:false};
  console.log(JSON.stringify(report));
  if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
} finally {fs.rmSync(root,{recursive:true,force:true});}
