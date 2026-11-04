import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const sharp = createRequire(new URL('../apps/studio-next/package.json', import.meta.url))('sharp');
import {runShotTaskActionV1, claimShotImagegenToolV1, completeShotImagegenToolV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {resolveProjectNodeDispatchV1} from '../apps/studio-next/src/lib/a1-project-node-dispatch-v1.mjs';
import {mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'a1-imgtool-')),taskId='new-article';const dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,shots:[{id:'illustration',sourceText:'An original editorial illustration',visualJob:'Metaphor',tasks:[{module:'image-generation',dependencies:[],parameters:{submitAuthorized:true,generationRequest:{prompt:'A paper object',purpose:'packaging-component',transparentBackground:true}}}]}]};
fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(plan));
const options={repoRoot:root,taskId};
assert.equal(resolveProjectNodeDispatchV1({repoRoot:root,projectId:taskId}).legacyDispatchAllowed,false);
const first=await runShotTaskActionV1({...options,action:'tick'});const nodeId='illustration:image-generation';
assert.equal(first.workflow.nodes.find(n=>n.id===nodeId).reason,'IMAGEGEN_TOOL_PENDING');
const request=claimShotImagegenToolV1({...options,nodeId,workerId:'test-tool'});
assert.throws(()=>claimShotImagegenToolV1({...options,nodeId,workerId:'duplicate'}),/already-claimed/);
await runShotTaskActionV1({...options,action:'tick'}); // Duplicate dispatch cannot claim another invocation.
assert.throws(()=>claimShotImagegenToolV1({...options,nodeId,workerId:'retry-after-interruption'}),/already-claimed/);
const output=path.join(root,'output.png');await sharp({create:{width:80,height:60,channels:4,background:'#cc000080'}}).png().toFile(output);
const invalid=path.join(root,'invalid.png');fs.writeFileSync(invalid,'not a PNG');
await assert.rejects(completeShotImagegenToolV1({...options,nodeId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,workerId:'test-tool',outputPath:invalid}));
assert.throws(()=>claimShotImagegenToolV1({...options,nodeId,workerId:'retry-after-failure'}),/already-claimed/);
await assert.rejects(completeShotImagegenToolV1({...options,nodeId,inputSha256:'0'.repeat(64),requestSha256:request.requestSha256,workerId:'test-tool',outputPath:output}),/stale/);
await assert.rejects(completeShotImagegenToolV1({...options,nodeId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,workerId:'another-worker',outputPath:output}),/stale/);
const completion=await completeShotImagegenToolV1({...options,nodeId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,workerId:'test-tool',outputPath:output});
const repeated=await completeShotImagegenToolV1({...options,nodeId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,workerId:'test-tool',outputPath:output});
assert.equal(repeated.outputSha256,completion.outputSha256);
assert.throws(()=>claimShotImagegenToolV1({...options,nodeId,workerId:'retry-after-saved-result'}),/already-claimed|already-saved/);
const conflicting=path.join(root,'conflicting.png');await sharp({create:{width:80,height:60,channels:4,background:'#0000ff80'}}).png().toFile(conflicting);
await assert.rejects(completeShotImagegenToolV1({...options,nodeId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,workerId:'test-tool',outputPath:conflicting}),/output-conflict/);
const result=await runShotTaskActionV1({...options,action:'resume',nodeId});assert.equal(result.workflow.nodes.find(n=>n.id===nodeId).state,'needs-review');
const checked=await runShotTaskActionV1({...options,action:'verify',nodeId,reviewerId:'test-bytes'});assert.equal(checked.workflow.nodes.find(n=>n.id===nodeId).acceptance.visualApproval,'NOT_GRANTED');
const accepted=checked.workflow.nodes.find(n=>n.id===nodeId),evidence=path.resolve('work/imagegen-review-v1');fs.mkdirSync(evidence,{recursive:true});
fs.writeFileSync(path.join(evidence,'tool-check-report.json'),JSON.stringify({command:'node scripts/test-node-imagegen-tool-v1.mjs',exitCode:0,
  inputSha256:request.inputSha256,requestSha256:request.requestSha256,promptSha256:mediaSha256(Buffer.from(request.prompt)),
  outputSha256:completion.outputSha256,manifestSha256:accepted.acceptance.manifestSha256,
  cases:['durable request','single claim','interrupted claim preserved','failed completion preserves claim','stale input and worker rejected','identical completion recovery','different output rejected','saved result resume','technical acceptance'],
  realGeneratorCalls:0,productionAdmission:false,visualApproval:'NOT_GRANTED'},null,2)+'\n');
console.log('PASS built-in tool job: durable request, single invocation through interruption/failure, stale completion rejection, identical result recovery, conflict rejection, PNG/alpha collection, existing scheduler acceptance, legacy entry ownership. Image pixels are a local fixture.');
fs.rmSync(root,{recursive:true,force:true});
