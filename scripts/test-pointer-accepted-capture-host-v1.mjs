import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {assertPointerOrdinaryAcceptanceV1,assertPointerRuntimeUnchangedV1,readAcceptedPointerConsumerV1} from '../apps/studio-next/src/lib/a1-pointer-accepted-capture-host-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
const runtime=readShotTaskRuntimeV1({repoRoot:process.cwd(),taskId:'webkit-screen-recording-normal-entry-v1'});
const node=runtime.workflow.nodes.find(n=>n.id==='WebKit-second-article:recording');
const before=JSON.stringify(node);let checks=0;const test=fn=>{fn();checks++;};
test(()=>assert.equal(assertPointerOrdinaryAcceptanceV1(node,runtime.artifactRoot),true));
for(const mutate of [
 n=>n.state='needs-review',n=>n.module='remotion-render',n=>n.acceptance=null,n=>n.acceptance.contract='A1PointerConsumerPreparationPacket/v2',
 n=>n.acceptance.inputSha256='f'.repeat(64),n=>n.acceptance.nodeId='old-node',n=>n.acceptance.artifactRoot+='/other',
 n=>n.acceptance.sourceResultSha256='f'.repeat(64),n=>n.acceptance.manifestSha256='f'.repeat(64),
 n=>n.acceptance.productionAdmission=true,n=>n.acceptance.visualApproval='PASS',n=>n.acceptance.verificationScope='CALLER_SHA_ONLY',
 n=>n.result.artifactManifest.artifacts[0].sha256='f'.repeat(64),n=>n.acceptance.artifacts[0].sha256='f'.repeat(64),
 n=>n.acceptance.artifacts[0].metadata.jsonContract='wrong',n=>n.acceptance.artifacts.at(-1).metadata.fps=60,
 n=>n.result.artifactManifest.artifacts.push(n.result.artifactManifest.artifacts[0]),
])test(()=>{const changed=structuredClone(node);mutate(changed);assert.throws(()=>assertPointerOrdinaryAcceptanceV1(changed,runtime.artifactRoot));});
test(()=>{const changed=structuredClone(node);changed.result.artifactManifest.inputSha256='f'.repeat(64);changed.acceptance.sourceResultSha256=nodeInputHash(changed.result);assert.throws(()=>assertPointerOrdinaryAcceptanceV1(changed,runtime.artifactRoot));});
test(()=>assert.equal(JSON.stringify(node),before));
test(()=>assert.equal(assertPointerRuntimeUnchangedV1(runtime,runtime,node.id),true));
test(()=>assert.throws(()=>assertPointerRuntimeUnchangedV1(runtime,{...runtime,inputPlanSha256:'f'.repeat(64)},node.id),/CURRENT_NODE_OR_PLAN_CHANGED/u));
test(()=>assert.throws(()=>assertPointerRuntimeUnchangedV1(runtime,{...runtime,pending:true},node.id),/CURRENT_NODE_OR_PLAN_CHANGED/u));
const start=performance.now();const host=readAcceptedPointerConsumerV1({repoRoot:process.cwd(),taskId:runtime.plan.projectId,nodeId:node.id});
test(()=>assert.equal(host.status,'VERIFIED_ACCEPTED_CAPTURE_AND_EXPLICIT_FRAMES',host.reasons?.join(',')));
test(()=>assert.equal(host.ordinaryManifestSha256,node.acceptance.manifestSha256));
test(()=>assert.equal(host.framePlan.frameCount,node.result.capture.frameCount));
test(()=>assert.equal(host.framePlan.frameCount,194));
test(()=>assert.equal(host.visibleFrames+host.hiddenFrames,host.framePlan.frameCount));
test(()=>assert.equal(host.frameSvgs.length,host.framePlan.frameCount));
const digest=b=>createHash('sha256').update(b).digest('hex');
test(()=>assert(host.frameSvgs.every((svg,i)=>digest(svg)===host.frameSvgSha256[i])));
test(()=>assert(host.framePlan.frames.every((frame,i)=>frame.frameIndex===i&&frame.visible===host.frameSvgs[i].includes('<path d='))));
test(()=>assert(host.framePlan.frames.filter(f=>!f.visible).every(f=>f.position===null&&f.supportEventIndex===null)));
test(()=>assert(host.framePlan.frames.filter(f=>f.visible).every(f=>f.observedAtMs<=f.timeMs)));
test(()=>assert.equal(readAcceptedPointerConsumerV1({repoRoot:process.cwd(),taskId:runtime.plan.projectId,nodeId:'old-node'}).status,'UNKNOWN'));
test(()=>assert.equal(readAcceptedPointerConsumerV1({repoRoot:process.cwd(),taskId:'../../etc',nodeId:node.id}).status,'UNKNOWN'));
console.log(JSON.stringify({status:'PASS',checks,hostReadMs:Math.round(performance.now()-start),frameCount:host.framePlan.frameCount,visible:host.visibleFrames,hidden:host.hiddenFrames,
 framePlanSha256:host.framePlan.sha256,scope:'Current ordinary acceptance + freshly read bytes + regenerated frame plan; no new browser/decode/encode/pixels',actualPixelReview:'NOT_PERFORMED',newClaims:0}));
