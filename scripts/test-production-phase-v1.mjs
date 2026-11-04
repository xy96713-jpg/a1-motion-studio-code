import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1,closeProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'production-phase-'))),taskId='phase-fixture',dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
try {
  const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,
    shots:[{id:'A',sourceText:'An isolated phase fixture',visualJob:'No remote execution',exactCopy:[],tasks:[{module:'media-files',dependencies:[],parameters:{},blocker:'FIXTURE_INPUT_REQUIRED'}]}]};
  fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(plan));syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
  const options={repoRoot:root,taskId,purpose:'STATIC_FRAME_PLANNING',ownerThreadId:'fixture',approvalEvidence:'Fixture-only authorization, no provider call',shotIds:['A'],maximumExecutionMs:1000};
  const prepared=activateProductionPhaseV1({...options,phaseId:'prepared',reservedSlots:0});assert.equal(prepared.reservedSlots,0);
  activateProductionPhaseV1({...options,phaseId:'first',reservedSlots:1});activateProductionPhaseV1({...options,phaseId:'second',reservedSlots:1});
  assert.throws(()=>activateProductionPhaseV1({...options,phaseId:'over-cap',reservedSlots:1}),/GLOBAL_CAPACITY/);
  assert.throws(()=>activateProductionPhaseV1({...options,phaseId:'metadata-override',metadata:{executionAuthorized:false}}),/METADATA_INVALID/);
  assert.throws(()=>activateProductionPhaseV1({...options,phaseId:'first'}),/ALREADY_EXISTS/);
  const closed=closeProductionPhaseV1({repoRoot:root,phaseId:'first',outcome:'FIXTURE_COMPLETED'});assert.equal(closed.reservedSlots,0);
  activateProductionPhaseV1({...options,phaseId:'third',reservedSlots:1});
  assert.equal(fs.existsSync(path.join(root,'work/.shot-task-dispatch.lock')),false,'dispatch lock closes after each metadata activation');
  console.log('PASS centrally locked phase activation, prepared work uses no slots, global cap two, immutable phase IDs, protected budget fields and release. No providers.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
