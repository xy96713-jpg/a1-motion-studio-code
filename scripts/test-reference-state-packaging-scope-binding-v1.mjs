import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {bindReviewedReferenceStatesV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {hasReviewedNoPackageStatesV1} from '../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs';
import {verifiedNoPackageTargetsV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'reference-scope-binding-'))),taskId='unseen-reference-scope';
const taskRoot=path.join(root,'work',taskId),phaseRoot=path.join(root,'work/module-development-launch-v1/resource-reservations');
fs.mkdirSync(path.join(taskRoot,'evidence'),{recursive:true});fs.mkdirSync(phaseRoot,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),source='a'.repeat(64);
const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:source},
 shots:[{id:'scene',sourceText:'Retained narration',visualJob:'Retained adaptation',exactCopy:['Historical adaptation title'],sourceInterval:{startFrame:0,endFrameExclusive:100},tasks:[{module:'media-files',parameters:{},dependencies:[],blocker:'SOURCE_MISSING'}]}]};
plan.editorialBrief={contract:'A1ProductionEditorialBrief/v1',contentMode:'FACTUAL_ADAPTATION',presentationMode:'FACELESS',objective:'Later adaptation',authorizationEvidence:'Fixture request',sourceIdentity:workScopeSourceIdentityV1(plan),copyApproval:false,visualApproval:false,productionAdmission:false};
plan.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:['scene'],objective:'Reference packaging first',referencePackagingOnly:true,sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false};
const frames=['ENTRY','HOLD','HANDOFF'].map((state,i)=>{const artifactPath=state+'.jpg',bytes=Buffer.from('synthetic-reference-'+state);fs.writeFileSync(path.join(taskRoot,artifactPath),bytes);return {state,sourceFrame:i*30,artifactPath,artifactSha256:hash(bytes)};});
const evidencePath=path.join(taskRoot,'evidence','frames.json'),evidenceBytes=Buffer.from(JSON.stringify({source:{sha256:source},stateFrames:{scene:frames}}));fs.writeFileSync(evidencePath,evidenceBytes);
const items=frames.map(f=>({shotId:'scene',state:f.state,sourceFrame:f.sourceFrame,referenceSha256:f.artifactSha256,reviewedBy:'fixture-reviewer',packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false,reason:'Synthetic source observation only',evidence:{path:path.relative(root,evidencePath),sha256:hash(evidenceBytes)}}));
let seq=0;
async function bind(current,selected){
 fs.writeFileSync(path.join(taskRoot,'shot-task-plan-v1.json'),JSON.stringify(current));syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(current)});
 const phaseId='review-'+(++seq),input=path.join(taskRoot,phaseId+'.json'),bytes=Buffer.from(JSON.stringify({items:selected}));fs.writeFileSync(input,bytes);
 fs.writeFileSync(path.join(phaseRoot,'phase-activation-'+phaseId+'.json'),JSON.stringify({status:'ACTIVE',purpose:'REFERENCE_STATE_REVIEW_BINDING',taskId,executionAuthorized:true,reservedSlots:0,shotIds:['scene'],planSha256:nodeInputHash(current),units:{path:path.relative(root,input),sha256:hash(bytes)}}));
 return bindReviewedReferenceStatesV1({repoRoot:root,taskId,phaseId});
}
try{
 const goal=productionFrameGoalShaV1(plan,plan.shots[0],'HOLD');
 const bound=await bind(plan,items.slice(1));assert.equal(bound.status,'REFERENCE_STATE_DECISIONS_BOUND');assert.equal(bound.newClaims,0);assert.equal(bound.visualApproval,false);
 const mixed=readShotTaskRuntimeV1({repoRoot:root,taskId}).plan;
 assert.deepEqual(mixed.shots[0].exactCopy,plan.shots[0].exactCopy);assert.deepEqual(mixed.editorialBrief,plan.editorialBrief);
 assert.equal(productionFrameGoalShaV1(mixed,mixed.shots[0],'HOLD'),goal);assert.equal(hasReviewedNoPackageStatesV1(mixed,mixed.shots[0]),false,'partial clean observations do not skip the shot');
 assert.ok(mixed.shots[0].statePackagingDecisions.every(d=>!d.baseMediaWork&&!d.visualApproval));
 await bind(mixed,[items[0]]);const complete=readShotTaskRuntimeV1({repoRoot:root,taskId}).plan;assert.equal(hasReviewedNoPackageStatesV1(complete,complete.shots[0]),true);
 const stock=items.map(i=>({...i,observation:'UNPACKAGED_SOURCE_CONTENT',baseMediaWork:'SEPARATE_SOURCE_INTEGRATION_REQUIRED'}));
 await bind(plan,stock);const stockPlan=readShotTaskRuntimeV1({repoRoot:root,taskId}).plan;
 assert.equal(hasReviewedNoPackageStatesV1(stockPlan,stockPlan.shots[0]),true);
 assert.deepEqual(stockPlan.shots[0].exactCopy,plan.shots[0].exactCopy);
 const exclusions=verifiedNoPackageTargetsV1({repoRoot:root,plan:stockPlan,targetKeys:['scene:ENTRY','scene:HOLD','scene:HANDOFF']});
 assert.equal(exclusions.length,3);assert.ok(exclusions.every(d=>d.baseMediaWork==='SEPARATE_SOURCE_INTEGRATION_REQUIRED'&&d.baseMediaDelivered===false&&d.newImageApproved===false));
 await assert.rejects(bind(plan,[{...stock[1],baseMediaWork:undefined}]),/REFERENCE_STATE_REVIEW_NOT_CLEAN/);
 const old=structuredClone(plan);delete old.activeWorkScope.referencePackagingOnly;
 await assert.rejects(bind(old,[items[1]]),/REFERENCE_STATE_REVIEW_NOT_CLEAN/);
 await assert.rejects(bind(plan,[{...items[1],referenceSha256:'f'.repeat(64)}]),/REFERENCE_STATE_REVIEW_BINDING/);
 await assert.rejects(bind(plan,[{...items[1],sourceFrame:100}]),/REFERENCE_STATE_REVIEW_BINDING/);
 await assert.rejects(bind(plan,[{...items[1],packagingElementsVisible:true}]),/REFERENCE_STATE_REVIEW_NOT_CLEAN/);
 fs.writeFileSync(path.join(taskRoot,'HOLD.jpg'),'changed');await assert.rejects(bind(plan,[items[1]]),/FULL_FRAME_INPUT_BYTES_CHANGED/);
 console.log('PASS normal reference review binding: packaging-only partial clean state retains authored copy and goal; three anchors required for exclusion; default/copy, source SHA, frame, visible packaging and byte drift guards retained. Zero providers.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
