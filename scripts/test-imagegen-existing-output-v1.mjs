import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {imagegenProductionIdentityV1,readImagegenPriorIndexV1,findPriorImagegenOutputsV1} from '../apps/studio-next/src/lib/a1-imagegen-existing-output-v1.mjs';
import {projectShotTaskExecutionReadinessV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'existing-imagegen-'))),old='a'.repeat(64),now='b'.repeat(64),sha=b=>createHash('sha256').update(b).digest('hex');
const request={contract:'A1ImagegenToolRequest/v1',nodeId:'old:image-generation',inputSha256:old,jobId:'imagegen-'+old,provider:'codex-built-in-imagegen',purpose:'packaging-component',prompt:'Source-bound card',transparentBackground:true,exactCopy:[],references:[],outputRole:'card',productionAdmission:false};request.requestSha256=nodeInputHash(request);
const dir=path.join(root,'imagegen-tool-jobs',old);fs.mkdirSync(dir,{recursive:true});const output=Buffer.from('fixture bytes only');
try{
 fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify(request));fs.writeFileSync(path.join(dir,'output.png'),output);
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({contract:'A1ImagegenToolResult/v1',inputSha256:old,requestSha256:request.requestSha256,jobId:request.jobId,outputSha256:sha(output),productionAdmission:false}));
 const find=(r=request,input=now)=>findPriorImagegenOutputsV1({artifactRoot:root,request:r,inputSha256:input});
 const results=find();assert.equal(results.length,1);assert.equal(results[0].status,'EXISTING_BYTES_REQUIRE_REUSE_OR_REJECTION');assert.equal(results[0].visualApproval,false);
 assert.equal(imagegenProductionIdentityV1(request),imagegenProductionIdentityV1({...request,nodeId:'new',inputSha256:now,jobId:'new'}));
 assert.deepEqual(find({...request,prompt:'Changed repair instructions'}),[]);assert.deepEqual(find(request,old),[],'current job uses normal result recovery');
 const plan={contract:'A1ShotTaskPlan/v1',shots:[{id:'S',packagingDecision:{},tasks:[{module:'image-generation',parameters:{generationRequest:request}}]}]};
 const workflow={nodes:[{id:'S:image-generation',shotId:'S',module:'image-generation',state:'queued',inputSha256:now,dependencies:[]}],modules:{'image-generation':{available:true}}};
 const ready=projectShotTaskExecutionReadinessV1(plan,workflow,{generationPreflight:{'S:image-generation':{required:false,missing:[],priorResults:results}}});
 const retired=structuredClone(plan);retired.shots[0].tasks[0].blocker='LEGACY_GENERATION_RETIRED';
 retired.shots[0].tasks[0].parameters.existingWorkDisposition={contract:'A1ExistingGenerationDisposition/v1',newProviderCallAllowed:false,visualApproval:false,productionAdmission:false,disposition:'REJECTED_DO_NOT_REPEAT',reason:'Fixture: retain the explicitly retired work',evidence:[{path:path.join(dir,'request.json'),sha256:sha(fs.readFileSync(path.join(dir,'request.json')))}],baseRequestSha256:nodeInputHash(retired.shots[0].tasks[0].parameters.generationRequest)};
 const closed=projectShotTaskExecutionReadinessV1(retired,workflow,{generationPreflight:{'S:image-generation':{required:false,missing:[],priorResults:results}}});
 assert.equal(closed.actions[0].action,'preserve-existing');assert.equal(closed.nextAction,null);assert.equal(closed.summary.runNow,0);
 assert.equal(ready.actions[0].action,'reconcile-existing');assert.equal(ready.summary.imagegenReady,0);assert.equal(ready.summary.runNow,0);
 fs.mkdirSync(path.join(root,'media'));fs.writeFileSync(path.join(root,'media',sha(output)+'.png'),output);fs.writeFileSync(path.join(dir,'output.png'),'corrupt');
 assert.ok(find()[0].outputPath.includes('/media/'),'find the existing admitted byte-identical file');
 fs.rmSync(path.join(root,'media',sha(output)+'.png'));assert.equal(find()[0].status,'PRIOR_OUTPUT_BYTES_UNAVAILABLE');
 fs.rmSync(path.join(dir,'result.json'));assert.equal(find()[0].status,'PRIOR_REQUEST_NEEDS_RECONCILIATION');
 fs.writeFileSync(path.join(dir,'request.json'),'broken');assert.equal(readImagegenPriorIndexV1(root)[0].invalid,true);assert.throws(()=>find(),/PRIOR_INDEX_INCOMPLETE/);
 console.log('PASS scheduler-version-independent prior work lookup, changed-prompt distinction, admitted-byte recovery, unresolved/rejected-not-approved boundary, and no duplicate dispatch action.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
