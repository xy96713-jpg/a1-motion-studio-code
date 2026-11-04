import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {runShotTaskActionV1,claimShotImagegenToolV1,completeShotImagegenToolV1,readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {runProductionBatchV1,productionInputIdentityV1} from '../apps/studio-next/src/lib/a1-production-batch-runner-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {projectDirs} from '../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs';
const sharp=createRequire(new URL('../apps/studio-next/package.json',import.meta.url))('sharp');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'batch-cache-readback-'))),taskId='cache-fixture',phaseId='saved-batch',dir=path.join(root,'work',taskId);
fs.mkdirSync(dir,{recursive:true});
const makeAsset=id=>({id,resourceOnly:true,consumerShotIds:['film'],sourceText:'Isolated fixture',visualJob:'Test cache only',exactCopy:[],tasks:[{module:'image-generation',dependencies:[],parameters:{submitAuthorized:true,generationRequest:{prompt:'Isolated '+id+' fixture, no real provider',purpose:'packaging-component',transparentBackground:true}}}]});
const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,shots:[{id:'film',sourceText:'Fixture',visualJob:'Fixture',exactCopy:[],tasks:[{module:'media-files',dependencies:[],blocker:'SOURCE_MISSING',parameters:{}}]}],assetTasks:[makeAsset('asset'),makeAsset('other')]};
fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(plan));
const args={repoRoot:root,taskId},nodeId='asset:image-generation';
try{
 const pending=await runShotTaskActionV1({...args,action:'tick',nodeId,maxClaims:2});
 const phases=path.join(root,'work/module-development-launch-v1/resource-reservations');fs.mkdirSync(phases,{recursive:true});
 const phaseFile=path.join(phases,'phase-activation-'+phaseId+'.json');
 fs.writeFileSync(phaseFile,JSON.stringify({taskId,purpose:'STATIC_PRODUCTION_BATCH',status:'COMPLETED_CLOSED_RELEASED',reservedSlots:0,shotIds:['asset'],inputIdentity:productionInputIdentityV1(plan)}));
 const out=path.join(dir,'production-batches',phaseId);fs.mkdirSync(out,{recursive:true});
 const resultFile=path.join(out,'result.json');
 fs.writeFileSync(resultFile,JSON.stringify({contract:'A1StaticProductionBatchResult/v1',taskId,phaseId,status:'PARTIAL_WITH_BLOCKED_INPUTS',inputIdentity:productionInputIdentityV1(plan),executionPlanSha256:nodeInputHash(plan),claims:1,elapsedMs:10,outputs:[],blocked:[{id:nodeId,reason:'IMAGEGEN_TOOL_PENDING'}]}));
 const originalResult=fs.readFileSync(resultFile),originalPhase=fs.readFileSync(phaseFile);
 const initial=await runProductionBatchV1({...args,phaseId});assert.equal(initial.completion.technicallyComplete,0);assert.equal(initial.newClaims,0);
 const request=claimShotImagegenToolV1({...args,nodeId,workerId:'fixture-only'});
 const file=path.join(root,'fixture.png');await sharp({create:{width:2,height:2,channels:4,background:'#ff000080'}}).png().toFile(file);
 await completeShotImagegenToolV1({...args,nodeId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,workerId:'fixture-only',outputPath:file});
 await runShotTaskActionV1({...args,action:'resume',nodeId});await runShotTaskActionV1({...args,action:'verify',nodeId,reviewerId:'fixture-byte-check'});
 const current=readShotTaskRuntimeV1(args),workflowFile=path.join(projectDirs(current.appRoot).publicDir,'node-workflow-v1/current.json'),workflowBefore=fs.readFileSync(workflowFile);
 // An unrelated or stale review must not be applied to newly collected output.
 fs.writeFileSync(path.join(out,'visual-review.json'),JSON.stringify({intentionallyInvalidFixture:true}));
 const replay=await runProductionBatchV1({...args,phaseId});
 assert.equal(replay.status,'ASSETS_TECHNICALLY_COMPLETE_REVIEW_REQUIRED');assert.equal(replay.initialStatus,'PARTIAL_WITH_BLOCKED_INPUTS');assert.equal(replay.assetOutputs.length,1);assert.equal(replay.outputs.length,0);
 assert.equal(replay.newClaims,0);assert.equal(replay.claims,1);assert.deepEqual(replay.blocked,[]);
 assert.ok(fs.readFileSync(resultFile).equals(originalResult));assert.ok(fs.readFileSync(phaseFile).equals(originalPhase));assert.ok(fs.readFileSync(workflowFile).equals(workflowBefore));assert.equal(fs.existsSync(path.join(out,'registration.json')),false);
 assert.equal(current.workflow.nodes.find(n=>n.id==='other:image-generation').attempt,0);
 const delivered=replay.assetOutputs[0].acceptance;fs.appendFileSync(path.join(delivered.artifactRoot,delivered.artifacts.find(a=>a.kind==='IMAGE').path),'changed');
 const damaged=await runProductionBatchV1({...args,phaseId});assert.equal(damaged.completion.technicallyComplete,0);assert.equal(damaged.verificationErrors.length,1);assert.equal(damaged.newClaims,0);
 console.log('PASS live cached readback after tool recovery, asset completion, stale-review isolation, immutable original receipt, no redispatch or phase/resource changes, and corrupt output detection. Synthetic fixture only; zero real providers.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
