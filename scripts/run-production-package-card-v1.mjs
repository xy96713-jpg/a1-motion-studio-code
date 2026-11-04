#!/usr/bin/env node
/** Thin recipe operator for the existing source transition, queue and frame
 * pipeline. Shot-specific copy and references live in the input, never here. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {recordProductionRevisionV1} from '../apps/studio-next/src/lib/a1-production-continuation-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {adoptSourcedFrameInputsV1,compileFullFrameRequestsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {runProductionFramePipelineV1,productionFrameGoalInputsV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';
import {projectProductionMaterialPoolV1} from '../apps/studio-next/src/lib/a1-production-material-pool-v1.mjs';

const root=fs.realpathSync(process.cwd()),args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--file')throw Error('Usage: run-production-package-card-v1.mjs --file <task-local recipe.json>');
const file=fs.realpathSync(path.resolve(args[1])),spec=JSON.parse(fs.readFileSync(file));
const {taskId,phaseId,shotId}=spec,frames=spec.frames||[spec];
if(![taskId,phaseId].every(v=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,75}$/.test(v))
  ||!file.startsWith(path.join(root,'work',taskId)+path.sep)||!spec.approvalEvidence
  ||!Array.isArray(frames)||!frames.length||frames.length>3||new Set(frames.map(f=>f.state)).size!==frames.length
  ||frames.some(f=>!['ENTRY','HOLD','HANDOFF'].includes(f.state)||!f.revisionText||f.unit?.shotId!==shotId||f.unit?.state!==f.state
    ||f.sourceInput?.shotId!==shotId||f.sourceInput.state!==f.state||f.sourceInput.copyMode!=='SOURCE_BOUND_STATE_EXCERPT_REWRITE'))throw Error('PACKAGE_RECIPE_SCOPE');
const targets=frames.map(f=>shotId+':'+f.state);
const dir=path.join(path.dirname(file),phaseId),phaseRoot=path.join(root,'work/module-development-launch-v1/resource-reservations');
fs.mkdirSync(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const exists=id=>fs.existsSync(path.join(phaseRoot,`phase-activation-${id}.json`));
const save=(name,v)=>{const p=path.join(dir,name),b=Buffer.from(JSON.stringify(v,null,2)+'\n');if(fs.existsSync(p)&&!fs.readFileSync(p).equals(b))throw Error('PACKAGE_RECIPE_IMMUTABLE:'+name);if(!fs.existsSync(p))fs.writeFileSync(p,b,{flag:'wx'});return{path:path.relative(root,p),sha256:hash(b)};};
save('input.json',spec);
const runtime=()=>readShotTaskRuntimeV1({repoRoot:root,taskId});
if(!exists(phaseId)){
  for(const frame of frames){
  const {state}=frame,sourcePhase=phaseId+'-source'+(spec.frames?'-'+state.toLowerCase():'');
  if(exists(sourcePhase)&&!fs.existsSync(path.join(root,'work',taskId,'production-batches',sourcePhase,'full-frame-result.json')))throw Error('PACKAGE_RECIPE_SOURCE_PHASE_INCOMPLETE_USE_NEW_VERSION');
  if(!exists(sourcePhase)){
    let rt=runtime();
    const previous=rt.plan.shots.find(s=>s.id===shotId);
    const replacesState=previous?.referenceProductionDesign?.references?.some(r=>r.state===state);
    if(!replacesState&&(previous?.stateCopyBindings?.[state]||previous?.fullFrameRequests?.some(r=>r.state===state)))throw Error('PACKAGE_RECIPE_EXISTING_STATE_REFERENCE_REQUIRED');
    if(replacesState)await recordProductionRevisionV1({repoRoot:root,taskId,shotId,states:[state],text:frame.revisionText,expectedPlanSha256:rt.inputPlanSha256});
    rt=runtime();const shot=rt.plan.shots.find(s=>s.id===shotId);
    const source=structuredClone(frame.sourceInput);
    if(source?.shotId!==shotId||source.state!==state||source.copyMode!=='SOURCE_BOUND_STATE_EXCERPT_REWRITE')throw Error('PACKAGE_RECIPE_SOURCE_INPUT');
    const requests=(shot.fullFrameRequests||[]).filter(r=>r.state===state).map(r=>({state:r.state,requestSha256:r.requestSha256}));
    if(replacesState)source.replaceSourceInput={revisionId:shot.productionRevisionRequest.requestId,previousCopySha256:nodeInputHash(shot.exactCopy),requests,
      ...(!requests.length?{nativeStateLayoutSha256:nodeInputHash(shot.productionLayout.states.find(s=>s.state===state)),previousStateCopyBindingSha256:nodeInputHash(shot.stateCopyBindings[state])}:{})};
    const units=save('source-inputs'+(spec.frames?'-'+state.toLowerCase():'')+'.json',{units:[source]});
    activateProductionPhaseV1({repoRoot:root,taskId,phaseId:sourcePhase,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:process.env.CODEX_THREAD_ID,approvalEvidence:spec.approvalEvidence,shotIds:[shotId],metadata:{units}});
    await adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId:sourcePhase});
  }
  }
  const rt=runtime(),shot=rt.plan.shots.find(s=>s.id===shotId),units=frames.map(frame=>{
  const {state}=frame,unit=structuredClone(frame.unit);
  unit.visualIntake.visibleCopyIndices=shot.referenceProductionDesign.states.find(s=>s.state===state).visibleCopyIndices;
  unit.brief+='\nExact visible copy: '+unit.visualIntake.visibleCopyIndices.map(i=>shot.exactCopy[i]).join(' / ');
  if(frame.materialReferences?.length){
    const pool=projectProductionMaterialPoolV1({plan:rt.plan,workflow:rt.workflow});
    unit.materialSelections=frame.materialReferences.map(ref=>{const material=pool.materials.find(m=>m.sha256===ref.sha256);if(!material)throw Error('PACKAGE_RECIPE_MATERIAL_MISSING');return{materialId:material.id,sha256:ref.sha256,use:ref.use,reason:ref.reason};});
  }
  return unit;});
  compileFullFrameRequestsV1({repoRoot:root,taskRoot:rt.taskRoot,plan:rt.plan,units,workflow:rt.workflow});
  const proposal=save('proposal.json',{contract:'A1ProductionFrameRecipeProposal/v1',taskId,units,waiting:[],recipes:[],visualApproval:false,productionAdmission:false});
  activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'STATIC_FRAME_PIPELINE',ownerThreadId:process.env.CODEX_THREAD_ID,approvalEvidence:spec.approvalEvidence,shotIds:[shotId],maximumExecutionMs:900000,
    metadata:{targets,imageBudget:units.filter(u=>!u.existingFrame).length,modelBudget:6,reviewFrameBudget:2,referenceEvidence:units[0].visualIntake.referenceEvidence,aestheticReferences:units[0].aestheticReferences,goalInputs:productionFrameGoalInputsV1(rt.plan,[shotId]),proposal}});
}
const startedAt=new Date().toISOString();
try{
  const result=await runProductionFramePipelineV1({repoRoot:root,taskId,phaseId,expectedTargets:targets,executable:'/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'});
  const record={startedAt,finishedAt:new Date().toISOString(),result};const saved=save('result-'+hash(JSON.stringify(result)).slice(0,16)+'.json',record);
  console.log(JSON.stringify({saved,status:result.status,outbox:result.outbox,registration:result.registration,adjacentFindings:result.adjacentFindings,findings:result.findings}));
}catch(error){save('failure-'+Date.now()+'.json',{startedAt,failedAt:new Date().toISOString(),error:error.message});throw error;}
