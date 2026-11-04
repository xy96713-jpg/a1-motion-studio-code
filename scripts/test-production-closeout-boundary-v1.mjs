import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1,runShotTaskActionV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {registerProductionBatchV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
import {productionBatchCloseoutCurrentV1} from '../apps/studio-next/src/lib/a1-production-batch-closeout-v1.mjs';
import {activateProductionPhaseV1,closeProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {requestProductionMaintenanceV1,inspectProductionMaintenanceV1,holdProductionMaintenanceV1,releaseProductionMaintenanceV1} from '../apps/studio-next/src/lib/a1-production-maintenance-boundary-v1.mjs';
import {continueProductionV1} from '../apps/studio-next/src/lib/a1-production-continuation-v1.mjs';
import {projectDirs} from '../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs';
const sharp=createRequire(new URL('../apps/studio-next/package.json',import.meta.url))('sharp');
const fixtureRoots=[],fixtures=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
try {
for(const genre of (process.env.A1_BASELINE_ROOT?['open-revision']:['open-revision','after-registry','after-projection'])){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'closeout-boundary-')));fixtureRoots.push(root);
 const taskId='new-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
 const output=path.join(dir,'source.png'),reference=path.join(dir,'reference.png');
 fs.writeFileSync(output,await sharp({create:{width:16,height:9,channels:4,background:'#112233'}}).png().toBuffer());
 fs.writeFileSync(reference,await sharp({create:{width:16,height:9,channels:4,background:'#334455'}}).png().toBuffer());
 const imageSha=hash(fs.readFileSync(output)),refSha=hash(fs.readFileSync(reference)),sourceSha='a'.repeat(64);
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:sourceSha,fps:25},
   shots:[{id:'scene',sourceText:'Source fixture '+genre,visualJob:'Import existing research image',exactCopy:[],sourceInterval:{startFrame:0,endFrameExclusive:10},
     referenceProductionDesign:{contract:'A1ReferenceProductionDesign/v1',shotId:'scene',sourceVideoSha256:sourceSha,viewerIntent:'Fixture source shape',
       appearance:{composition:'One focal field',palette:'Neutral',surface:'Flat'},references:[{state:'HOLD',sourceFrame:1,path:reference,sha256:refSha}],
       layers:[{id:'frame',role:'SUBJECT',sourceMode:'EXISTING',assetIds:['fixture-image'],copyIndices:[],treatment:'NONE',purpose:'Fixture source shape'}],
       states:[{state:'HOLD',viewerNotice:'One focal field',visibleLayerIds:['frame'],visibleCopyIndices:[]}],acceptance:[],uncertainties:[]},
     tasks:[{module:'media-files',dependencies:[],parameters:{files:[{assetId:'fixture-image',path:output,sha256:imageSha,kind:'IMAGE',role:'original-image',slot:'preview',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET'}]}}]}]};
 if(genre==='open-revision')plan.shots[0].productionRevisionRequest={requestId:'p23-shaped-revision',status:'OPEN',text:'Bind the replacement design before closing this state'};
 save(path.join(dir,'shot-task-plan-v1.json'),plan);syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
 await runShotTaskActionV1({repoRoot:root,taskId,action:'tick',expectedPlanSha256:nodeInputHash(plan),workerId:'fixture-worker',maxClaims:1});
 await runShotTaskActionV1({repoRoot:root,taskId,action:'verify',nodeId:'scene:media-files',expectedPlanSha256:nodeInputHash(plan),reviewerId:'fixture-byte-reviewer'});
 const runtime=readShotTaskRuntimeV1({repoRoot:root,taskId}),node=runtime.workflow.nodes.find(n=>n.id==='scene:media-files');
 assert.equal(node.state,'succeeded',node.reason||node.state);assert.ok(node.acceptance);
 const seedBody={contract:'A1SystemLineResearchTaskManifest/v1',taskId,scope:'RESEARCH_ONLY',productionAdmission:false,status:'RESEARCH_ONLY',input:{sourceVideoSha256:sourceSha,fps:25},
   sequences:[{sequenceId:'scene'}],artifacts:[],candidates:[],nodeRuns:[],summary:{sequenceCount:1,candidateCoverageCount:0,registeredRenderCount:0,visuallyAcceptedCount:0},authority:{formalProductionAdmission:false}};
 save(path.join(dir,'research-task-manifest-v1.json'),{...seedBody,sha256:nodeInputHash(seedBody)});
 save(path.join(dir,'candidate-registry-v1.json'),{contract:'A1ReferenceCandidateRegistry/v1',scope:'RESEARCH_ONLY',productionAdmission:false,entries:[]});
 const phaseId='fixture-registration',batch=path.join(dir,'production-batches',phaseId);
 save(path.join(batch,'result.json'),{taskId,phaseId,executionPlanSha256:nodeInputHash(plan),outputs:[{shotId:'scene',nodeId:node.id,inputSha256:node.inputSha256,acceptance:node.acceptance}]});
 save(path.join(batch,'visual-review.json'),{contract:'A1ProductionBatchVisualReview/v1',executionPlanSha256:nodeInputHash(plan),reviewerId:'fixture-only',productionAdmission:false,
   items:[{nodeId:node.id,inputSha256:node.inputSha256,imageSha256:imageSha,referenceSha256:refSha,sourceFrame:1,status:genre==='after-projection'?'PASS':'TECHNICAL_PASS_ONLY',label:'Fixture technical check, no visual admission',findings:[]}]});
 const args={repoRoot:root,taskId,phaseId};
 if(genre==='open-revision'){
   const target=process.env.A1_BASELINE_ROOT?(await import(pathToFileURL(path.join(process.env.A1_BASELINE_ROOT,'apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs')))).registerProductionBatchV1:registerProductionBatchV1;
   await assert.rejects(target(args),/BATCH_CLOSEOUT_REVISION_UNSETTLED/);
   assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'candidate-registry-v1.json'))).entries.length,0);
   assert.equal(readShotTaskRuntimeV1({repoRoot:root,taskId}).plan.shots[0].productionRevisionRequest.status,'OPEN');
   assert.equal(fs.existsSync(path.join(batch,'registration.json')),false);
   fixtures.push({id:genre,status:'PASS',meaning:'P23-shaped open design revision cannot be hidden by registration'});continue;
 }
 // This is the real central phase API against a disposable fixture runtime.
 activateProductionPhaseV1({...args,phaseId:'parent-pipeline',purpose:'STATIC_FRAME_PIPELINE',ownerThreadId:'fixture-worker',approvalEvidence:'Fixture only',shotIds:['scene']});
 activateProductionPhaseV1({...args,purpose:'STATIC_PRODUCTION_BATCH',ownerThreadId:'fixture-worker',approvalEvidence:'Fixture only',shotIds:['scene'],reservedSlots:1,metadata:{parentPhaseId:'parent-pipeline'}});
 const requested=requestProductionMaintenanceV1({repoRoot:root,requestId:taskId,ownerId:'integrator',reason:'Verified isolated fix waiting for batch boundary'});
 assert.equal(inspectProductionMaintenanceV1({repoRoot:root}).status,'MAINTENANCE_DRAINING');
 assert.throws(()=>holdProductionMaintenanceV1({repoRoot:root,ownerId:'integrator',expectedRequestSha256:requested.sha256}),/NOT_QUIESCENT/);
 assert.throws(()=>activateProductionPhaseV1({...args,phaseId:'next-root',purpose:'STATIC_PRODUCTION_BATCH',ownerThreadId:'fixture-worker',approvalEvidence:'Fixture only',shotIds:['scene']}),/MAINTENANCE_NEW_WORK_BLOCKED/);
 activateProductionPhaseV1({...args,phaseId:'finish-review',purpose:'STATIC_BATCH_VISUAL_REVIEW',ownerThreadId:'fixture-worker',approvalEvidence:'Finish existing only',shotIds:['scene'],reservedSlots:1,metadata:{batchId:phaseId}});
 closeProductionPhaseV1({repoRoot:root,phaseId:'finish-review',outcome:'FIXTURE_REVIEW_COMPLETE'});
 closeProductionPhaseV1({repoRoot:root,phaseId,outcome:'FIXTURE_EXECUTION_COMPLETE'});
 assert.ok(inspectProductionMaintenanceV1({repoRoot:root}).blockers.some(b=>b.code==='REGISTRATION_CLOSEOUT_PENDING'));
 const stage=genre==='after-registry'?'CANDIDATES_REGISTERED':'PROJECTION_PUBLISHED';
 const moduleURL=new URL('../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs',import.meta.url).href;
 const child=spawnSync(process.execPath,['--input-type=module','-e',
   `const {registerProductionBatchV1}=await import(${JSON.stringify(moduleURL)});await registerProductionBatchV1({...${JSON.stringify(args)},checkpoint:({stage})=>{if(stage===${JSON.stringify(stage)})process.kill(process.pid,'SIGKILL');}});`],{encoding:'utf8',timeout:20000});
 assert.equal(child.signal,'SIGKILL',child.stderr);
 assert.equal(JSON.parse(fs.readFileSync(path.join(batch,'closeout.json'))).stage,stage);
 assert.equal(productionBatchCloseoutCurrentV1(batch),false);
 assert.notEqual(inspectProductionMaintenanceV1({repoRoot:root}).status,'MAINTENANCE_DISPATCH_QUIESCENT');
 const beforeNodes=readShotTaskRuntimeV1({repoRoot:root,taskId}).workflow.nodes.map(n=>[n.id,n.inputSha256,n.attempt]);
 const result=await registerProductionBatchV1(args);
 assert.equal(result.closeout.status,'COMPLETE');assert.equal(result.registered[0].reused,true);
 assert.equal(productionBatchCloseoutCurrentV1(batch),true);
 if(genre==='after-projection')assert.equal(readShotTaskRuntimeV1({repoRoot:root,taskId}).workflow.nodes.find(n=>n.id===node.id).visualReview.status,'PASS');
 assert.deepEqual(readShotTaskRuntimeV1({repoRoot:root,taskId}).workflow.nodes.map(n=>[n.id,n.inputSha256,n.attempt]),beforeNodes);
 const registry=JSON.parse(fs.readFileSync(path.join(dir,'candidate-registry-v1.json')));
 const manifestFile=path.join(dir,'research-task-manifest-v1.json'),manifestBytes=fs.readFileSync(manifestFile);
 assert.equal(registry.entries.length,1);assert.equal(JSON.parse(manifestBytes).candidates.length,1);
 assert.equal(JSON.parse(manifestBytes).candidates[0].wholeShotPASS,false);
 const repeated=await registerProductionBatchV1(args);assert.equal(repeated.registered[0].reused,true);
 assert.deepEqual(fs.readFileSync(manifestFile),manifestBytes);
 const reviewFile=path.join(batch,'visual-review.json'),reviewBytes=fs.readFileSync(reviewFile);
 const invalidReview=JSON.parse(reviewBytes);invalidReview.executionPlanSha256='0'.repeat(64);fs.writeFileSync(reviewFile,JSON.stringify(invalidReview));
 assert.equal(productionBatchCloseoutCurrentV1(batch),false);
 await assert.rejects(registerProductionBatchV1(args),/BATCH_REVIEW_BINDING_REQUIRED/);fs.writeFileSync(reviewFile,reviewBytes);
 // An existing supported review replacement starts a fresh journal, not stale COMPLETE.
 const originalIdentity=result.closeout.identitySha256,replacement=JSON.parse(reviewBytes);replacement.items[0].label='Fixture updated review label';
 fs.writeFileSync(reviewFile,JSON.stringify(replacement));const updated=await registerProductionBatchV1(args);
 assert.notEqual(updated.closeout.identitySha256,originalIdentity);assert.equal(productionBatchCloseoutCurrentV1(batch),true);
 assert.ok(fs.existsSync(path.join(batch,'closeout-history',originalIdentity+'.json')));
 assert.ok(inspectProductionMaintenanceV1({repoRoot:root}).blockers.some(b=>b.code==='PIPELINE_CLOSEOUT_PENDING'));
 closeProductionPhaseV1({repoRoot:root,phaseId:'parent-pipeline',outcome:'Fixture registration and pipeline closure complete'});
 // Unknown submissions are caught even after all reservation slots are released.
 const wfFile=path.join(projectDirs(runtime.appRoot).artifactDir,'node-workflow-v1/current.json'),wfBytes=fs.readFileSync(wfFile),wf=JSON.parse(wfBytes);
 const mirrorFile=path.join(projectDirs(runtime.appRoot).publicDir,'node-workflow-v1/current.json'),mirrorBytes=fs.readFileSync(mirrorFile);
 wf.nodes[0].progress={status:'SUBMISSION_UNKNOWN'};fs.writeFileSync(wfFile,JSON.stringify(wf));
 assert.ok(inspectProductionMaintenanceV1({repoRoot:root}).blockers.some(b=>b.code==='RUNTIME_INSPECTION_REQUIRED'));
 fs.writeFileSync(mirrorFile,JSON.stringify(wf));
 assert.ok(inspectProductionMaintenanceV1({repoRoot:root}).blockers.some(b=>b.code==='NODE_EXECUTION_UNRECONCILED'));
 fs.writeFileSync(wfFile,wfBytes);fs.writeFileSync(mirrorFile,mirrorBytes);
 assert.equal(inspectProductionMaintenanceV1({repoRoot:root}).status,'MAINTENANCE_DISPATCH_QUIESCENT');
 assert.throws(()=>holdProductionMaintenanceV1({repoRoot:root,ownerId:'other',expectedRequestSha256:requested.sha256}),/OWNER_OR_REQUEST_CHANGED/);
 const held=holdProductionMaintenanceV1({repoRoot:root,ownerId:'integrator',expectedRequestSha256:requested.sha256});
 const continuation=await continueProductionV1({repoRoot:root,taskId,expectedPlanSha256:readShotTaskRuntimeV1({repoRoot:root,taskId}).inputPlanSha256});
 assert.equal(continuation.status,'MAINTENANCE_HELD');assert.equal(continuation.newClaims,0);
 await assert.rejects(runShotTaskActionV1({repoRoot:root,taskId,action:'tick',expectedPlanSha256:nodeInputHash(plan),workerId:'fixture-worker',maxClaims:1}),/MAINTENANCE_UNSCOPED_WORK_BLOCKED/);
 const phaseModule=new URL('../apps/studio-next/src/lib/a1-production-phase-v1.mjs',import.meta.url).href;
 const competing=spawnSync(process.execPath,['--input-type=module','-e',`const {activateProductionPhaseV1}=await import(${JSON.stringify(phaseModule)});activateProductionPhaseV1(${JSON.stringify({...args,phaseId:'competing-root',purpose:'STATIC_PRODUCTION_BATCH',ownerThreadId:'fixture-worker',approvalEvidence:'Fixture only',shotIds:['scene']})});`],{encoding:'utf8',timeout:20000});
 assert.notEqual(competing.status,0);assert.match(competing.stderr,/MAINTENANCE_NEW_WORK_BLOCKED/);
 releaseProductionMaintenanceV1({repoRoot:root,ownerId:'integrator',expectedRequestSha256:held.sha256,outcome:'Fixture validation complete; no code was applied'});
 assert.equal(inspectProductionMaintenanceV1({repoRoot:root}).status,'NO_MAINTENANCE_REQUEST');
 activateProductionPhaseV1({...args,phaseId:'released-next',purpose:'STATIC_PRODUCTION_BATCH',ownerThreadId:'fixture-worker',approvalEvidence:'Fixture only',shotIds:['scene']});
 closeProductionPhaseV1({repoRoot:root,phaseId:'released-next',outcome:'FIXTURE_ONLY'});
 fixtures.push({id:genre,status:'PASS',processKilledAfter:stage,duplicateCandidates:0,additionalNodeAttempts:0,
   inFlightWorkPreserved:true,unregisteredBatchBlocksMaintenance:true,heldBlocksNewProcess:true,unknownSubmissionBlocksMaintenance:true});

}
const result={status:'PASS',fixtures,verificationScope:'REAL_REGISTRATION_AND_DISPATCH_APIS_WITH_DISPOSABLE_FIXTURES_NO_RENDERING',productionAdmission:false,visualQualityVerified:false};console.log(JSON.stringify(result));
if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
}finally{for(const root of fixtureRoots)fs.rmSync(root,{recursive:true,force:true});}
