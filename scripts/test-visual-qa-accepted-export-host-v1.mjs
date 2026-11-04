import fs from 'node:fs';
import assert from 'node:assert/strict';
import {assertVisualQaNormalExportSourceV1} from '../apps/studio-next/src/lib/a1-visual-qa-accepted-export-host-v1.mjs';
const preparation=JSON.parse(fs.readFileSync('work/module-development-launch-v1/environments/typography/work/visual-qa-consumer-binding-v2/qa-binding.json'));
const binding=preparation.preparedBinding;
const request=JSON.parse(fs.readFileSync(preparation.sourceMetadata.normalCompleteRequest.path));
const output={...request.export.output,kind:'VIDEO'};
const before=JSON.stringify({binding,request,output});let checks=0;
function test(fn){fn();checks++;}
test(()=>assert.equal(assertVisualQaNormalExportSourceV1(binding,request,output),true));
test(()=>assert.equal(JSON.stringify({binding,request,output}),before));
for(const mutate of [r=>r.stage='FAILED',r=>r.status='WAITING_REVIEW',r=>r.result=null,r=>r.requestSha256='f'.repeat(64),r=>r.taskId='wrong-task',r=>r.result.inputSha256='f'.repeat(64),r=>r.result.manifestSha256='f'.repeat(64),r=>r.export.source.acceptedNodeId='wrong-node',r=>r.export.output.sha256='f'.repeat(64),r=>r.result.output.sha256='f'.repeat(64),r=>r.export.expected.frameCount=191,r=>r.export.expected.fpsNumerator=60,r=>r.sampleFrames=[0,1]])test(()=>{const r=structuredClone(request);mutate(r);assert.throws(()=>assertVisualQaNormalExportSourceV1(binding,r,output));});
for(const mutate of [o=>o.sha256='f'.repeat(64),o=>o.path+='.other',o=>o.bytes++])test(()=>{const o=structuredClone(output);mutate(o);assert.throws(()=>assertVisualQaNormalExportSourceV1(binding,request,o),/CANONICAL_OUTPUT_REQUIRED/u);});
console.log(JSON.stringify({status:'PASS',checks,proofScope:'PURE_GUARD_ON_SAVED_METADATA_NOT_ACTUAL_REVALIDATION_OR_PIXELS',actualAcceptedRevalidation:false,pixelMeasurementsPerformed:false,claims:0}));
