import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {requestProductionMaintenanceV1,inspectProductionMaintenanceV1,holdProductionMaintenanceV1,releaseProductionMaintenanceV1} from '../apps/studio-next/src/lib/a1-production-maintenance-boundary-v1.mjs';
const targetRoot=process.env.A1_BASELINE_ROOT||process.cwd();
const {activateProductionPhaseV1}=await import(pathToFileURL(path.join(targetRoot,'apps/studio-next/src/lib/a1-production-phase-v1.mjs')));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'maintenance-admission-')));
try{
 const taskId='maintenance-fixture',dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,
  shots:[{id:'current',sourceText:'Fixture',visualJob:'Fixture',exactCopy:[],tasks:[{module:'media-files',parameters:{},dependencies:[],blocker:'FIXTURE_MISSING_SOURCE'}]}]};
 fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(plan));
 syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
 const phaseDir=path.join(root,'work/module-development-launch-v1/resource-reservations');fs.mkdirSync(phaseDir,{recursive:true});
 const stale=path.join(phaseDir,'phase-activation-old-plan.json');
 const saved=JSON.stringify({phaseId:'old-plan',taskId,purpose:'STATIC_FRAME_PIPELINE',status:'ACTIVE',reservedSlots:0,ownerThreadId:'old-owner',reservationEndUTC:'2020-01-01T00:00:00Z'});
 fs.writeFileSync(stale,saved);
 const request=requestProductionMaintenanceV1({repoRoot:root,requestId:'maintenance-1',ownerId:'integrator',reason:'Test safe maintenance boundary'});
 assert.equal(request.drainPhaseIds.length,0,'expired zero-slot plan is frozen, not restarted');
 assert.equal(fs.readFileSync(stale,'utf8'),saved,'never silently close old plans');
 assert.equal(inspectProductionMaintenanceV1({repoRoot:root}).status,'MAINTENANCE_DISPATCH_QUIESCENT');
 fs.writeFileSync(stale,JSON.stringify({...JSON.parse(saved),reservedSlots:1}));
 assert.equal(inspectProductionMaintenanceV1({repoRoot:root}).status,'MAINTENANCE_DRAINING');
 assert.throws(()=>holdProductionMaintenanceV1({repoRoot:root,ownerId:'integrator',expectedRequestSha256:request.sha256}),/NOT_QUIESCENT/);
 fs.writeFileSync(stale,saved);
 const held=holdProductionMaintenanceV1({repoRoot:root,ownerId:'integrator',expectedRequestSha256:request.sha256});
 assert.throws(()=>activateProductionPhaseV1({repoRoot:root,taskId,phaseId:'new-work',purpose:'STATIC_PRODUCTION_BATCH',ownerThreadId:'worker',approvalEvidence:'Fixture only',shotIds:['current']}),/PRODUCTION_MAINTENANCE_NEW_WORK_BLOCKED/);
 assert.equal(fs.existsSync(path.join(phaseDir,'phase-activation-new-work.json')),false);
 assert.throws(()=>releaseProductionMaintenanceV1({repoRoot:root,ownerId:'intruder',expectedRequestSha256:held.sha256,outcome:'not authorized'}),/OWNER_OR_REQUEST_CHANGED/);
 releaseProductionMaintenanceV1({repoRoot:root,ownerId:'integrator',expectedRequestSha256:held.sha256,outcome:'No changes; explicit cancellation'});
 assert.equal(inspectProductionMaintenanceV1({repoRoot:root}).status,'NO_MAINTENANCE_REQUEST');
 console.log(JSON.stringify({status:'PASS',scenarios:['held-blocks-real-activation','stale-zero-slot-preserved','wrong-owner-rejected','explicit-release'],providers:0,renders:0}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
