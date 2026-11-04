import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {runProductionFramePlannerV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'reference-observation-'))),taskId='unseen-fixture',dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
  const frame=path.join(dir,'frame.png');fs.writeFileSync(frame,'isolated source bytes');
  const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'a'.repeat(64)},shots:[{id:'unseen',sourceText:'Unseen source',visualJob:'Read source',exactCopy:[],sourceInterval:{startFrame:0,endFrameExclusive:100},tasks:[{module:'media-files',dependencies:[],parameters:{},blocker:'SOURCE_MISSING'}]}]};
  const planFile=path.join(dir,'shot-task-plan-v1.json');fs.writeFileSync(planFile,JSON.stringify(plan));syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
  const evidence=path.join(dir,'evidence.json');fs.writeFileSync(evidence,JSON.stringify({contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:plan.source.videoSha256},stateFrames:{unseen:[{state:'HOLD',sourceFrame:50,artifactPath:taskId+'/frame.png',artifactSha256:hash(fs.readFileSync(frame))}]}}));
  const before=fs.readFileSync(planFile);let calls=0;
  const reserve=(phaseId,targets)=>activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'STATIC_FRAME_PLANNING',ownerThreadId:'fixture',approvalEvidence:'Pure isolated fixture only',shotIds:['unseen'],reservedSlots:1,maximumClaims:0,maximumExecutionMs:5000,metadata:{planningMode:'REFERENCE_ROLE_OBSERVATION_ONLY',targets,maximumModelPasses:1,referenceEvidence:{path:evidence,sha256:hash(fs.readFileSync(evidence))}}});
  reserve('valid',['unseen:HOLD']);
  const r=await runProductionFramePlannerV1({repoRoot:root,taskId,phaseId:'valid',executable:'fixture-only',runVisualPass:async options=>{calls++;assert.equal(options.images.length,1);return {output:{observations:[{shotId:'unseen',referenceKind:'TYPOGRAPHY_EVENT',actorAction:'Read a label',readingHierarchy:'Main label',visibleDesignedCopy:[],copyUncertainties:['UNREADABLE'],sourceNeeds:[],primitive:'Type'}]},trace:{imageShas:options.images.map(i=>i.sha256)}};}});
  assert.equal(calls,1);assert.equal(r.productionAdmission,false);assert.equal(r.sourceIdentityVerified,false);assert.ok(fs.readFileSync(planFile).equals(before));
  const phaseDir=path.join(root,'work/module-development-launch-v1/resource-reservations');const saved=JSON.parse(fs.readFileSync(path.join(phaseDir,'phase-activation-valid.json')));
  assert.equal(saved.status,'COMPLETED_CLOSED_RELEASED');assert.equal(saved.reservedSlots,0);assert.equal(saved.actualModelPassCount,1);
  reserve('drift',['unseen:HOLD']);fs.appendFileSync(frame,'changed');
  await assert.rejects(runProductionFramePlannerV1({repoRoot:root,taskId,phaseId:'drift',executable:'fixture-only',runVisualPass:async()=>{throw Error('must not run');}}),/BYTES_CHANGED/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(phaseDir,'phase-activation-drift.json'))).reservedSlots,0);
  assert.equal(calls,1);
  await assert.rejects(runProductionFramePlannerV1({repoRoot:root,taskId,phaseId:'../../elsewhere',executable:'fixture-only'}),/SELECTOR/);
  console.log('PASS normal planner lane observes actual bound references once, preserves source plan, releases resources, rejects byte drift before model work; no providers.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
