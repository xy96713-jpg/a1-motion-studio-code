import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {readSystemLineResearchTaskManifestV1} from '../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs';
import {registeredSourceResolverV1,preflightRegisteredResearchSourcesV1,sourceIntakePreflightRequestV1} from '../apps/studio-next/src/lib/a1-registered-source-intake-preflight-v1.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-source-preflight-integration-'))),taskId='registered-source-fixture',taskRoot=path.join(dir,'work',taskId);fs.mkdirSync(taskRoot,{recursive:true});
const sourcePath=path.join(taskRoot,'source.txt'),sourceBytes=Buffer.from('A verified local receipt test. No real person claim.');fs.writeFileSync(sourcePath,sourceBytes);
const evidencePath=path.join(taskRoot,'receipt.json'),sourceURL='https://example.org/research.txt',receipt={asset:{sha256:sha(sourceBytes),url:sourceURL},copy:'fixture exact quote'};fs.writeFileSync(evidencePath,JSON.stringify(receipt));
const artifact=(id,p)=>({id,label:id,path:path.relative(dir,p),sha256:sha(fs.readFileSync(p)),bytes:fs.statSync(p).size});
const body={contract:'A1SystemLineResearchTaskManifest/v1',taskId,title:'Preflight fixture',status:'RESEARCH_ONLY',scope:'RESEARCH_ONLY',productionAdmission:false,
 input:{planPath:path.relative(dir,sourcePath),planSha256:sha(sourceBytes),sourceLockPath:path.relative(dir,sourcePath),sourceLockSha256:sha(sourceBytes),sourceVideoSha256:'a'.repeat(64),sourceDurationSeconds:1,fps:30},
 summary:{sequenceCount:1,cueCount:0,asrDraftCount:0,registeredRenderCount:0,candidateCoverageCount:0,visuallyAcceptedCount:0},blockers:['NOT_PRODUCTION'],nodes:[],
 sequences:[{sequenceId:'S01',order:1,sourceFrames:[0,30],sourceTimeSeconds:[0,1],cueIds:[],spokenCopyStatus:'FIXTURE',designedCopyStatus:'FIXTURE',renderStatus:'NOT_RUN',visualReviewStatus:'NOT_RUN',blockers:[]}],candidates:[],artifacts:[artifact('source',sourcePath),artifact('receipt',evidencePath)],nodeRuns:[]};
fs.writeFileSync(path.join(taskRoot,'research-task-manifest-v1.json'),JSON.stringify({...body,sha256:nodeInputHash(body)}));
const candidate={id:'fixture',path:sourcePath,sha256:sha(sourceBytes),metadata:{kind:'text'},source:{originalURL:sourceURL,acquiredAt:'2026-09-30',evidence:{path:evidencePath,sha256:sha(fs.readFileSync(evidencePath)),pointer:'/asset',originalURLPointer:'/asset/url'}},license:{status:'unknown',note:'No authority grant'},assertion:{kind:'exact_copy',text:'fixture exact quote',pointer:'/copy'}};
const manifest={contract:'A1LocalSourceCandidateManifest/v1',candidates:[candidate]},args={repoRoot:dir,taskId,artifactIds:['source','receipt'],manifest};let checks=0;
const ready=await preflightRegisteredResearchSourcesV1(args);assert.equal(ready.status,'READY_FOR_REVIEW');assert.equal(ready.importPerformed,false);assert.equal(ready.missingMaterials.length,0);assert.deepEqual(ready.authority,{sourceAuthority:false,visualApproval:false,licenseApproval:false,productionAdmission:false});assert.ok(ready.unmeasured.includes('LICENSE_CLEARANCE'));checks++;
for(const mutate of [a=>a.manifest.candidates[0].path='/not-approved/no-read',a=>a.manifest.candidates[0].source.evidence.path='/not-approved/no-read',a=>a.manifest.candidates[0].sha256='0'.repeat(64),a=>a.manifest.candidates[0].source.evidence.sha256='0'.repeat(64),a=>a.manifest.candidates[0].source.originalURL='https://other.example/changed',a=>a.manifest.candidates[0].source.acquiredAt='2026-02-30',a=>a.manifest.candidates[0].authority={sourceAuthority:true},a=>a.artifactIds=['receipt'],a=>a.manifest.candidates[0].license={status:'documented',note:'Claimed but unproven'}]){
 const a=structuredClone(args);mutate(a);const report=await preflightRegisteredResearchSourcesV1(a);assert.equal(report.status,'MISSING_INPUTS');assert.ok(report.missingMaterials.length);assert.equal(report.importPerformed,false);assert.equal(report.authority.productionAdmission,false);checks++;
}
for(const mutate of [a=>a.taskId='../outside',a=>a.artifactIds=[],a=>a.artifactIds=['source','source'],a=>a.artifactIds=Array.from({length:17},(_,i)=>String(i)),a=>a.artifactIds=['missing'],a=>a.manifest.approvedRoots=['/'],a=>a.manifest.trustedResolver='read-all',a=>a.manifest.candidates=Array.from({length:9},()=>candidate)]){
 const a=structuredClone(args);mutate(a);await assert.rejects(()=>preflightRegisteredResearchSourcesV1(a),/SOURCE_PREFLIGHT_|research-task-artifact-not-found/);checks++;
}
const verified=await readSystemLineResearchTaskManifestV1({repoRoot:dir,taskId,verifyArtifactIds:args.artifactIds});const resolver=registeredSourceResolverV1(dir,verified.artifacts,args.artifactIds);assert.ok(resolver(sourcePath,33554432).equals(sourceBytes));checks++;
assert.throws(()=>resolver('/no-read/.env',33554432),/FILE_NOT_REGISTERED/);checks++;
assert.throws(()=>resolver(sourcePath,1),/FILE_TOO_LARGE/);checks++;
for(const mutate of [x=>x.status='STALE_INPUT_SHA',x=>x.status='SHA_DEFERRED_METADATA_MATCH',x=>x.sha256VerifiedNow=false,x=>delete x.verifiedFileIdentity,x=>x.bytes=33554433]){
 const x=structuredClone(verified.artifacts);mutate(x[0]);assert.throws(()=>registeredSourceResolverV1(dir,x,args.artifactIds),/SOURCE_PREFLIGHT_ARTIFACT_/);checks++;
}
fs.writeFileSync(sourcePath,Buffer.from('changed while authority was already verified'));assert.throws(()=>resolver(sourcePath,33554432),/ARTIFACT_CHANGED/);checks++;fs.writeFileSync(sourcePath,sourceBytes);
// A registered-looking path with an intermediate symlink cannot authorize a read.
const alias=path.join(taskRoot,'alias');fs.symlinkSync(taskRoot,alias);const aliased=path.join(alias,'source.txt'),st=fs.statSync(aliased),fake={...verified.artifacts[0],path:path.relative(dir,aliased),verifiedFileIdentity:{device:st.dev,inode:st.ino,bytes:st.size,mtimeMs:st.mtimeMs,ctimeMs:st.ctimeMs}};
const symlinkResolver=registeredSourceResolverV1(dir,[fake],['source']);assert.throws(()=>symlinkResolver(aliased,33554432),/SYMLINK_FORBIDDEN/);checks++;
const requestBody={action:'preflight-source-intake',taskId,artifactIds:args.artifactIds,manifest};
const req=(b=requestBody,host='127.0.0.1:4311',origin=`http://${host}`)=>new Request('http://127.0.0.1:4311/api/system-line/editorial-asset-workbench/import-source',{method:'POST',headers:{host,origin,'content-type':'application/json'},body:JSON.stringify(b)});
assert.equal((await sourceIntakePreflightRequestV1(req(),dir)).status,'READY_FOR_REVIEW');checks++;
for(const [h,o] of [['external.example','http://external.example'],['127.0.0.1:4311','http://external.example'],['127.0.0.1:4311','null']]){await assert.rejects(()=>sourceIntakePreflightRequestV1(req(requestBody,h,o),dir),/SAME_ORIGIN_REQUIRED/);checks++;}
for(const mutate of [b=>b.approvedRoots=['/'],b=>b.execution={authorized:true},b=>b.action='import-source',b=>b.path='/private-path']){const b=structuredClone(requestBody);mutate(b);await assert.rejects(()=>sourceIntakePreflightRequestV1(req(b),dir),/REQUEST_INVALID/);checks++;}
await assert.rejects(()=>sourceIntakePreflightRequestV1(req({...requestBody,padding:'x'.repeat(2*1024*1024)}),dir),/BODY_TOO_LARGE/);checks++;
// Exact route added branch returns before production/formData path; original
// multipart import bytes are unchanged after removing only this branch/import.
const route=fs.readFileSync('apps/studio-next/src/app/api/system-line/editorial-asset-workbench/import-source/route.ts','utf8');const before=fs.readFileSync('work/module-development-launch-v1/integration/source-intake-preflight-v1/import-source-route.ts.before','utf8');
const strip=route.replace('import {sourceIntakePreflightRequestV1} from "@/lib/a1-registered-source-intake-preflight-v1.mjs";\n','').replace(/    if \(request.headers.get\("content-type"\)[\s\S]*?\n    \}\n(?=    assertProjectWrite)/u,'');assert.equal(strip,before);checks++;
console.log(JSON.stringify({status:'PASS_REGISTERED_SOURCE_PREFLIGHT_INTEGRATION',checks,proof:'Real existing manifest verifier + reviewed resolver + Request body, temporary text/JSON fixtures only; no actual HTTP or source import',httpCalls:0,downloads:0,productionWrites:0,newClaims:0,Builds:0,browsers:0,sourceTruthOrLicenseApproval:false}));
