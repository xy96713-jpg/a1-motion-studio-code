import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1,closeProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {requestProductionMaintenanceV1,inspectProductionMaintenanceV1,holdProductionMaintenanceV1,releaseProductionMaintenanceV1} from '../apps/studio-next/src/lib/a1-production-maintenance-boundary-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'maintenance-race-')));
const child=code=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 const timeout=setTimeout(()=>{p.kill('SIGKILL');reject(Error('FIXTURE_CHILD_TIMEOUT'));},20000);
 p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);
 p.on('close',code=>{clearTimeout(timeout);resolve({code,stdout,stderr});});
});
try{
 const taskId='race-fixture',dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,
  shots:[{id:'current',sourceText:'Fixture',visualJob:'Fixture',exactCopy:[],tasks:[{module:'media-files',parameters:{},dependencies:[],blocker:'FIXTURE_MISSING_SOURCE'}]}]};
 fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(plan));syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
 activateProductionPhaseV1({repoRoot:root,taskId,phaseId:'draining-parent',purpose:'STATIC_FRAME_PIPELINE',ownerThreadId:'worker',approvalEvidence:'Fixture',shotIds:['current']});
 const request=requestProductionMaintenanceV1({repoRoot:root,requestId:'race-request',ownerId:'integrator',reason:'Race at batch boundary'});
 closeProductionPhaseV1({repoRoot:root,phaseId:'draining-parent',outcome:'Fixture batch complete'});
 const module=new URL('../apps/studio-next/src/lib/a1-production-maintenance-boundary-v1.mjs',import.meta.url).href;
 const phaseModule=new URL('../apps/studio-next/src/lib/a1-production-phase-v1.mjs',import.meta.url).href;
 const hold={repoRoot:root,ownerId:'integrator',expectedRequestSha256:request.sha256};
 const activation={repoRoot:root,taskId,phaseId:'late-drain-review',purpose:'STATIC_BATCH_VISUAL_REVIEW',ownerThreadId:'worker',approvalEvidence:'Finish admitted batch',shotIds:['current'],reservedSlots:1,metadata:{parentPhaseId:'draining-parent'}};
 const results=await Promise.all([
  child(`const {holdProductionMaintenanceV1}=await import(${JSON.stringify(module)});console.log(JSON.stringify(holdProductionMaintenanceV1(${JSON.stringify(hold)})));`),
  child(`const {activateProductionPhaseV1}=await import(${JSON.stringify(phaseModule)});console.log(JSON.stringify(activateProductionPhaseV1(${JSON.stringify(activation)})));`)
 ]);
 assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
 const refused=results.find(r=>r.code!==0);assert.match(refused.stderr,/MAINTENANCE_NEW_WORK_BLOCKED|MAINTENANCE_NOT_QUIESCENT|shot-dispatch-busy/);
 if(results[1].code===0){
  assert.equal(inspectProductionMaintenanceV1({repoRoot:root}).status,'MAINTENANCE_DRAINING');
  closeProductionPhaseV1({repoRoot:root,phaseId:'late-drain-review',outcome:'Fixture only'});
  holdProductionMaintenanceV1(hold);
 }
 const status=inspectProductionMaintenanceV1({repoRoot:root});assert.equal(status.status,'MAINTENANCE_HELD');
 releaseProductionMaintenanceV1({repoRoot:root,ownerId:'integrator',expectedRequestSha256:status.request.sha256,outcome:'Race verification complete'});
 console.log(JSON.stringify({status:'PASS',simultaneousChildProcesses:2,winner:results[0].code===0?'maintenance-hold':'existing-batch-review',bothGranted:false,providers:0,renders:0}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
