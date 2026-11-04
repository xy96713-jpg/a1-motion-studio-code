import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1,closeProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {bindFullFrameBatchV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';

/** Recover executable bindings from current accepted requests, never historical
 * layout snapshots. This does not generate pixels or promote any visual review. */
export function planFrameBindingRecoveryV1(runtime) {
  const {plan,workflow}=runtime, recoveries=[], deferred=[];
  for(const shot of plan.shots) {
    const excluded=new Set(shot.fullFrameStateFocus?.excludedStates||[]);
    const requests=(shot.fullFrameRequests||[]).filter(request=>!excluded.has(request.state)
      && request.goalInputSha256===productionFrameGoalShaV1(plan,shot,request.state));
    const missing=requests.filter(request=>!shot.productionLayout?.states?.some(state=>state.state===request.state));
    if(!missing.length)continue;
    const unaccepted=requests.filter(request=>{
      const node=workflow.nodes.find(item=>item.id===request.nodeId);
      return node?.state!=='succeeded'||node.acceptance?.inputSha256!==node.inputSha256
        ||node.acceptance?.sourceResultSha256!==nodeInputHash(node.result);
    });
    if(unaccepted.length){deferred.push({shotId:shot.id,reason:'CURRENT_REQUEST_NOT_ACCEPTED',states:unaccepted.map(r=>r.state)});continue;}
    recoveries.push({shotId:shot.id,missingStates:missing.map(r=>r.state),targets:requests.map(r=>shot.id+':'+r.state)});
  }
  return {planSha256:runtime.inputPlanSha256,recoveries,deferred,productionAdmission:false};
}

export async function reconcileCurrentFrameBindingsV1({repoRoot,taskId,apply=false,expectedPlanSha256,ownerThreadId,approvalEvidence}) {
  const root=fs.realpathSync(repoRoot),runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});
  if(runtime.pending)throw Error('FRAME_BINDING_RUNTIME_PENDING');
  const recovery=planFrameBindingRecoveryV1(runtime);
  if(!apply||!recovery.recoveries.length)return {...recovery,applied:false,newClaims:0};
  if(expectedPlanSha256!==runtime.inputPlanSha256)throw Error('FRAME_BINDING_PLAN_CHANGED');
  const targets=recovery.recoveries.flatMap(r=>r.targets),shotIds=recovery.recoveries.map(r=>r.shotId);
  const phaseId='recover-frame-bindings-'+nodeInputHash({plan:runtime.inputPlanSha256,targets}).slice(0,32);
  const beforeMedia=runtime.plan.shots.map(s=>({id:s.id,requests:s.fullFrameRequests||[]}));
  activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'FULL_FRAME_BINDING',ownerThreadId,approvalEvidence,
    shotIds,reservedSlots:0,maximumClaims:0,maximumExecutionMs:120000,metadata:{targets}});
  try {
    const result=await bindFullFrameBatchV1({repoRoot:root,taskId,phaseId});
    const after=readShotTaskRuntimeV1({repoRoot:root,taskId});
    if(nodeInputHash(beforeMedia)!==nodeInputHash(after.plan.shots.map(s=>({id:s.id,requests:s.fullFrameRequests||[]}))))throw Error('FRAME_BINDING_REQUEST_MUTATED');
    for(const target of targets){const [id,state]=target.split(':');if(!after.plan.shots.find(s=>s.id===id)?.productionLayout?.states?.some(s=>s.state===state))throw Error('FRAME_BINDING_RECOVERY_INCOMPLETE');}
    const receipt={...recovery,applied:true,phaseId,result,afterPlanSha256:after.inputPlanSha256,newClaims:0,
      requestsPreserved:true,visualApproval:false,productionAdmission:false};
    fs.writeFileSync(path.join(runtime.taskRoot,'production-batches',phaseId,'recovery-readback.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    return receipt;
  } finally {closeProductionPhaseV1({repoRoot:root,phaseId,outcome:'FRAME_BINDING_RECOVERY_CLOSED',actualClaimCount:0});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
  const result=await reconcileCurrentFrameBindingsV1({repoRoot:process.cwd(),taskId:value('--task'),apply:args.includes('--apply'),
    expectedPlanSha256:args.includes('--expected-plan-sha')?value('--expected-plan-sha'):undefined,
    ownerThreadId:process.env.CODEX_THREAD_ID,approvalEvidence:args.includes('--approval-evidence')?value('--approval-evidence'):undefined});
  console.log(JSON.stringify(result,null,2));
}
