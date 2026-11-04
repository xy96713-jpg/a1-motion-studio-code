import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1,runShotTaskActionV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {runProductionBatchV1} from '../apps/studio-next/src/lib/a1-production-batch-runner-v1.mjs';
import {registerProductionBatchV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'local-rework-'))),taskId='local-rework',dir=path.join(root,'work',taskId);
fs.mkdirSync(dir,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');};
const sharp=createRequire(new URL('../apps/studio-next/package.json',import.meta.url))('sharp');
const png=await sharp({create:{width:4,height:4,channels:4,background:'#223344'}}).png().toBuffer();
const source=path.join(dir,'source.png');fs.writeFileSync(source,png);const imageSha=sha(png);
const decision=id=>({contract:'A1ShotPackagingDecision/v1',version:1,shotId:id,shotVersionSha256:'a'.repeat(64),narrativeRole:'COMPARISON',viewerTask:'Preserve fixture pixel',packagingForm:'TYPE_COMPOSITION',selectionReason:'Fixture only',rejectedAlternative:'New generation',copyStatus:'NO_DESIGNED_COPY',copyBindings:[],sourceBindings:[{assetId:'source',sha256:imageSha,materialClass:'ORIGINAL_GENERATED_ASSET',identityStatus:'VERIFIED',provenanceStatus:'VERIFIED',sourceUri:source,usage:'Fixture bytes'}],sourcePixelPolicy:'RECONSTRUCT',effectStack:['SOURCE_PRESERVE'],motionBeats:[],composition:{focalTarget:'Pixel',hierarchy:'One field',readingOrder:['base']},layers:[{id:'base',role:'SUBJECT',assetId:'source',assetSha256:imageSha,geometry:{x:0,y:0,width:1,height:1},fit:'fill',z:0,opacity:1,producer:{nodeId:id+':media-files',artifactRole:'original-image',artifactKind:'IMAGE',sourceAssetId:'source',sourceAssetSha256:imageSha}}],handoff:{exitCondition:'Static',nextShotRelation:'None'},layoutReview:'Fixture only',productionAdmission:false});
const shot=id=>({id,packagingDecision:decision(id),sourceText:'Fixture '+id,visualJob:'Preserve fixture pixel',exactCopy:[],sourceInterval:{startFrame:0,endFrameExclusive:10},
 referenceProductionDesign:{contract:'A1ReferenceProductionDesign/v1',shotId:id,sourceVideoSha256:'a'.repeat(64),viewerIntent:'Fixture only',appearance:{composition:'One field',palette:'Fixture',surface:'Flat'},references:[{state:'HOLD',sourceFrame:1,path:source,sha256:imageSha}],layers:[{id:'base',role:'SUBJECT',sourceMode:'EXISTING',assetIds:['source'],copyIndices:[],treatment:'NONE',purpose:'Fixture'}],states:[{state:'HOLD',viewerNotice:'Fixture',visibleLayerIds:['base'],visibleCopyIndices:[]}],acceptance:[],uncertainties:[]},
 tasks:[{module:'media-files',dependencies:[],parameters:{files:[{assetId:'source',path:source,sha256:imageSha,kind:'IMAGE',role:'original-image',slot:'original-image',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET'}]}},
 {module:'layer-compositor',dependencies:['media-files'],parameters:{compositionCanvas:{contract:'A1NodeCompositionCanvas/v1',width:4,height:4,sourceVideoSha256:'a'.repeat(64)},compositionIntent:{contract:'A1NodeLayerCompositionIntent/v1',width:4,height:4,layers:[{id:'base',dependencyNodeId:id+':media-files',artifactRole:'original-image',artifactKind:'IMAGE',geometry:{x:0,y:0,width:1,height:1},fit:'fill',z:0,opacity:1}]}}}]});
let plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'a'.repeat(64),fps:25},shots:[shot('A'),shot('B')]};
// This fixture tests technical delivery only, with no visual-approval claim.
for(const item of plan.shots)delete item.referenceProductionDesign;
if(process.env.A1_SHARED_FIXTURE==='1'){
 plan.assetTasks=[{id:'shared',resourceOnly:true,consumerShotIds:['A','B'],sourceText:'Shared fixture',visualJob:'Shared source',exactCopy:[],tasks:[structuredClone(plan.shots[0].tasks[0])]}];
 for(const item of plan.shots){
  item.tasks[1].crossShotDependencies=[{nodeId:'shared:media-files',artifactKinds:['IMAGE']}];
  item.packagingDecision.layers[0].producer.nodeId='shared:media-files';
  item.tasks[1].parameters.compositionIntent.layers[0].dependencyNodeId='shared:media-files';
 }
}
plan.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:['A','B'],objective:'Isolated existing pixels only',sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false};
const planFile=path.join(dir,'shot-task-plan-v1.json'),args={repoRoot:root,taskId};
const sync=()=>{save(planFile,plan);return syncShotTaskRuntimeV1({...args,expectedPlanSha256:nodeInputHash(plan)});};
const phase=(phaseId,shotIds=['A'])=>activateProductionPhaseV1({...args,phaseId,purpose:'STATIC_PRODUCTION_BATCH',ownerThreadId:'fixture-worker',approvalEvidence:'Fixture no providers',shotIds,reservedSlots:1,maximumClaims:4});
try{
 sync();if(plan.assetTasks){phase('shared-source',['shared']);await runProductionBatchV1({...args,phaseId:'shared-source'});}
 phase('make-a');const first=await runProductionBatchV1({...args,phaseId:'make-a'});
 let runtime=readShotTaskRuntimeV1(args),node=runtime.workflow.nodes.find(n=>n.id==='A:layer-compositor');
 assert.equal(node.state,'needs-review',JSON.stringify({state:node.state,reason:node.reason,first}));
 await runShotTaskActionV1({...args,action:'verify',nodeId:node.id,reviewerId:'fixture-byte-reviewer',expectedPlanSha256:runtime.inputPlanSha256});
 phase('complete-a');const complete=await runProductionBatchV1({...args,phaseId:'complete-a'});
 assert.equal(complete.completion.technicallyComplete,1,JSON.stringify(complete));
 assert.ok(complete.dependencyIdentity,complete.dependencyIdentityUnavailable);
 const batch=path.join(dir,'production-batches/complete-a');runtime=readShotTaskRuntimeV1(args);node=runtime.workflow.nodes.find(n=>n.id==='A:layer-compositor');
 const output=node.acceptance.artifacts.find(a=>a.kind==='IMAGE');
 const seed={contract:'A1SystemLineResearchTaskManifest/v1',taskId,scope:'RESEARCH_ONLY',productionAdmission:false,status:'RESEARCH_ONLY',input:{sourceVideoSha256:'a'.repeat(64),fps:25},sequences:[{sequenceId:'A'},{sequenceId:'B'}],artifacts:[],candidates:[],nodeRuns:[],summary:{sequenceCount:2,candidateCoverageCount:0,registeredRenderCount:0,visuallyAcceptedCount:0},authority:{formalProductionAdmission:false}};
 save(path.join(dir,'research-task-manifest-v1.json'),{...seed,sha256:nodeInputHash(seed)});
 save(path.join(dir,'candidate-registry-v1.json'),{contract:'A1ReferenceCandidateRegistry/v1',scope:'RESEARCH_ONLY',productionAdmission:false,entries:[]});
 save(path.join(batch,'visual-review.json'),{contract:'A1ProductionBatchVisualReview/v1',executionPlanSha256:complete.executionPlanSha256,reviewerId:'fixture-only',productionAdmission:false,items:[{nodeId:node.id,inputSha256:node.inputSha256,imageSha256:output.sha256,referenceSha256:imageSha,sourceFrame:1,status:'TECHNICAL_PASS_ONLY',label:'Fixture bookkeeping only',findings:[]}]});
 await registerProductionBatchV1({...args,phaseId:'complete-a'});
 const files=['result.json','visual-review.json'].map(f=>path.join(batch,f));
 const before=files.map(f=>sha(fs.readFileSync(f)));const artifactFile=path.join(node.acceptance.artifactRoot,output.path),artifactSha=sha(fs.readFileSync(artifactFile));
 const manifestBefore=fs.readFileSync(path.join(dir,'research-task-manifest-v1.json'));
 const attempts=()=>readShotTaskRuntimeV1(args).workflow.nodes.filter(n=>n.shotId==='A').map(n=>[n.id,n.attempt,n.inputSha256]);const originalAttempts=attempts();
 plan.shots[1].visualJob='Different B placement';plan.shots[1].packagingDecision.viewerTask='Different B placement';plan.shots[1].packagingDecision.layers[0].geometry.width=0.5;sync();
 const runner=process.env.A1_BASELINE_ROOT?(await import(pathToFileURL(path.join(process.env.A1_BASELINE_ROOT,'apps/studio-next/src/lib/a1-production-batch-runner-v1.mjs')))).runProductionBatchV1:runProductionBatchV1;
 const reused=await runner({...args,phaseId:'complete-a'});
 assert.equal(reused.newClaims,0);assert.equal(reused.reusedCompletedRun,true);assert.equal(reused.outputs.length,1);
 assert.deepEqual(attempts(),originalAttempts);assert.deepEqual(files.map(f=>sha(fs.readFileSync(f))),before);assert.equal(sha(fs.readFileSync(artifactFile)),artifactSha);
 assert.deepEqual(fs.readFileSync(path.join(dir,'research-task-manifest-v1.json')),manifestBefore);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'candidate-registry-v1.json'))).entries.length,1);
 // The same original review registers after an unrelated edit without copying it.
 const again=await registerProductionBatchV1({...args,phaseId:'complete-a'});assert.equal(again.registered[0].reused,true);
 const resultFile=path.join(batch,'result.json'),resultBytes=fs.readFileSync(resultFile),forged=JSON.parse(resultBytes);
 forged.dependencyIdentity.shotIds=['B'];fs.writeFileSync(resultFile,JSON.stringify(forged));
 await assert.rejects(runProductionBatchV1({...args,phaseId:'complete-a'}),/DEPENDENCY_PROOF_INVALID/);fs.writeFileSync(resultFile,resultBytes);
 const wrongBatch=JSON.parse(resultBytes);wrongBatch.phaseId='other-batch';wrongBatch.dependencyIdentity.phaseId='other-batch';
 const {sha256:oldSeal,...wrongBody}=wrongBatch.dependencyIdentity;wrongBatch.dependencyIdentity.sha256=nodeInputHash(wrongBody);
 fs.writeFileSync(resultFile,JSON.stringify(wrongBatch));await assert.rejects(runProductionBatchV1({...args,phaseId:'complete-a'}),/DEPENDENCY_RECEIPT_SCOPE/);fs.writeFileSync(resultFile,resultBytes);
 const oldStyle=JSON.parse(resultBytes);delete oldStyle.dependencyIdentity;fs.writeFileSync(resultFile,JSON.stringify(oldStyle));
 await assert.rejects(runProductionBatchV1({...args,phaseId:'complete-a'}),/INPUT_OR_PHASE_MISMATCH|RESULT_DRIFT|CACHE_INPUTS_CHANGED/);fs.writeFileSync(resultFile,resultBytes);
 const dependency=readShotTaskRuntimeV1(args).workflow.nodes.find(n=>n.id===(plan.assetTasks?'shared:media-files':'A:media-files'));
 const depFile=path.join(dependency.acceptance.artifactRoot,dependency.acceptance.artifacts.find(a=>a.kind==='IMAGE').path),depBytes=fs.readFileSync(depFile);
 fs.appendFileSync(depFile,'damaged');await assert.rejects(runProductionBatchV1({...args,phaseId:'complete-a'}),/node-artifact-(size|sha)-mismatch/);fs.writeFileSync(depFile,depBytes);
 const outputBytes=fs.readFileSync(artifactFile);fs.appendFileSync(artifactFile,'damaged');await assert.rejects(runProductionBatchV1({...args,phaseId:'complete-a'}),/node-artifact-(size|sha)-mismatch/);fs.writeFileSync(artifactFile,outputBytes);
 const changedB=structuredClone(plan);
 plan.shots[0].visualJob='Changed A';plan.shots[0].packagingDecision.viewerTask='Changed A';sync();await assert.rejects(runProductionBatchV1({...args,phaseId:'complete-a'}),/SCOPED_INPUTS_CHANGED/);
 plan=structuredClone(changedB);plan.style={palette:'changed'};sync();await assert.rejects(runProductionBatchV1({...args,phaseId:'complete-a'}),/SCOPED_INPUTS_CHANGED/);

 console.log(JSON.stringify({status:'PASS',unrelatedShotEdit:{preservedShot:'A',editedShot:'B',newClaims:0,changedAcceptedBytes:0,duplicateCandidates:0,originalReviewReused:true},relatedShotAndGlobalStyleBlocked:true,corruptArtifactBlocked:true,dependencyBytesChecked:true,sharedFixture:Boolean(plan.assetTasks),proofTamperRejected:true,legacyReceiptNotUpgraded:true,providers:0,videoRenders:0,fixtureCanvas:'4x4 technical test only'}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
