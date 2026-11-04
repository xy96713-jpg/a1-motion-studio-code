import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {projectProductionContinuationV1} from '../apps/studio-next/src/lib/a1-production-continuation-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {runSourceNarrativeDirectorV1} from '../apps/studio-next/src/lib/a1-reference-visual-director-v2.mjs';
import {adoptSourcedFrameInputsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';

const args=process.argv.slice(2),get=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const taskId=get('--task'),runId=get('--run'),executable=get('--codex'),approvalEvidence=get('--approval-evidence');
if(![taskId,runId].every(v=>/^[a-z0-9][a-z0-9-]{0,65}$/.test(v||''))||!path.isAbsolute(executable||'')||!approvalEvidence)throw Error('SOURCE_WORK_ORDER_ARGUMENTS');
const repoRoot=fs.realpathSync(process.cwd()),ownerThreadId=process.env.CODEX_THREAD_ID;
const sha=b=>createHash('sha256').update(b).digest('hex');
let runtime=readShotTaskRuntimeV1({repoRoot,taskId});
const initial=projectProductionContinuationV1({repoRoot,plan:runtime.plan,workflow:runtime.workflow});
const shotIds=[...new Set(initial.blockers.filter(b=>b.code==='SHOT_SOURCE_COPY_AND_ROUTE_REVIEW_REQUIRED').map(b=>b.shotId))]
  .filter(id=>!runtime.plan.shots.find(s=>s.id===id).sourceNarrativeDirection);
const directory=path.join(runtime.taskRoot,'source-work-orders',runId);fs.mkdirSync(directory,{recursive:true});
const file=path.join(directory,'checkpoint.json');if(fs.existsSync(file))throw Error('SOURCE_WORK_ORDER_EXISTS_RECONCILE');
const checkpoint={taskId,runId,initialPlanSha256:runtime.inputPlanSha256,shotIds,completed:[],failed:[],productionAdmission:false};
const save=()=>{fs.writeFileSync(file,JSON.stringify(checkpoint,null,2)+'\n');};save();
for(let offset=0;offset<shotIds.length;offset+=12){
  const groups=[shotIds.slice(offset,offset+6),shotIds.slice(offset+6,offset+12)].filter(g=>g.length);
  // Read-only model calls share one stable input. Adopt only after both claims close.
  const phases=groups.map((ids,index)=>{
    const phaseId=runId+'-'+(offset+index*6);
    activateProductionPhaseV1({repoRoot,taskId,phaseId,purpose:'STATIC_FRAME_PLANNING',ownerThreadId,approvalEvidence,
      shotIds:ids,reservedSlots:1,maximumClaims:1,maximumExecutionMs:150000,
      metadata:{planningMode:'SOURCE_NARRATIVE_DIRECTION',maximumModelPasses:1}});
    return {phaseId,ids};
  });
  const results=await Promise.allSettled(phases.map(p=>runSourceNarrativeDirectorV1({repoRoot,taskId,phaseId:p.phaseId,executable})));
  for(const [index,result] of results.entries()){
    const {phaseId,ids}=phases[index];
    if(result.status==='rejected'){checkpoint.failed.push({phaseId,shotIds:ids,reason:result.reason.message});save();console.log(JSON.stringify({phaseId,status:'FAILED',reason:result.reason.message}));continue;}
    const proposal=result.value,units=proposal.reviews.map(review=>{
      const reviewFile=path.join(directory,review.shotId+'.json');fs.writeFileSync(reviewFile,JSON.stringify(review,null,2)+'\n',{flag:'wx'});
      return {shotId:review.shotId,copyMode:'SOURCE_NARRATIVE_DIRECTION',review:{path:path.relative(repoRoot,reviewFile),sha256:sha(fs.readFileSync(reviewFile))}};
    });
    const unitsFile=path.join(directory,phaseId+'-adoption.json');fs.writeFileSync(unitsFile,JSON.stringify({units},null,2)+'\n',{flag:'wx'});
    const adoption=phaseId+'-adopt';
    activateProductionPhaseV1({repoRoot,taskId,phaseId:adoption,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId,approvalEvidence,
      shotIds:ids,metadata:{units:{path:path.relative(repoRoot,unitsFile),sha256:sha(fs.readFileSync(unitsFile))}}});
    await adoptSourcedFrameInputsV1({repoRoot,taskId,phaseId:adoption});
    checkpoint.completed.push({phaseId,shotIds:ids,elapsedMs:proposal.elapsedMs});save();
    console.log(JSON.stringify({phaseId,status:'ADOPTED_SOURCE_DIRECTION_NOT_VISUAL_APPROVAL',shotIds:ids}));
  }
}
runtime=readShotTaskRuntimeV1({repoRoot,taskId});checkpoint.afterPlanSha256=runtime.inputPlanSha256;checkpoint.closed=true;save();
console.log(JSON.stringify({status:'SOURCE_WORK_ORDER_CLOSED',completedShots:checkpoint.completed.flatMap(b=>b.shotIds).length,failedShots:checkpoint.failed.flatMap(b=>b.shotIds).length,checkpoint:file}));
