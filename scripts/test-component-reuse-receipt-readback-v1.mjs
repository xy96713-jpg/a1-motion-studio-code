import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {readResearchExecutionReceiptStateV1,projectComponentReuseReceiptV1} from '../apps/studio-next/src/lib/a1-research-production-work-order-v1.mjs';
const plan={projectId:'unseen',scope:'RESEARCH_ONLY'},binding={samples:[{slot:'sample',imageSha256:'a'.repeat(64)}]};
const node={inputSha256:'b'.repeat(64),state:'succeeded',input:{parameters:{registeredComponentReuse:binding}},acceptance:{inputSha256:'b'.repeat(64),artifacts:[{role:'sample',sha256:'a'.repeat(64)}]}};
const workflow={projectId:'unseen',workspaceSha256:nodeInputHash(plan),planSha256:'compiled-graph-sha-is-different',nodes:[node]};
const args={plan,componentInput:binding,sourceComponent:{status:'VERIFIED_REGISTERED_COMPONENT'},componentNode:node,workflow,shotId:'X'};
assert.equal(projectComponentReuseReceiptV1(args).status,'ACCEPTED_ORIGINAL_NODE_REUSE');
assert.notEqual(projectComponentReuseReceiptV1({...args,runtimePending:true}).status,'ACCEPTED_ORIGINAL_NODE_REUSE');
assert.notEqual(projectComponentReuseReceiptV1({...args,workflow:{...workflow,workspaceSha256:'stale'}}).status,'ACCEPTED_ORIGINAL_NODE_REUSE');
assert.notEqual(projectComponentReuseReceiptV1({...args,componentNode:{...node,acceptance:{...node.acceptance,artifacts:[]}}}).status,'ACCEPTED_ORIGINAL_NODE_REUSE');
assert.notEqual(projectComponentReuseReceiptV1({...args,sourceComponent:{status:'BLOCKED_COMPONENT_BINDING'}}).status,'ACCEPTED_ORIGINAL_NODE_REUSE');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-reader-'));
try{assert.equal(readResearchExecutionReceiptStateV1(root,'unseen'),null);const file=path.join(root,'work/unseen/runtime/apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/node-workflow-v1/current.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({...workflow,contract:'A1NodeWorkflow/v1'}));assert.equal(readResearchExecutionReceiptStateV1(root,'unseen').workspaceSha256,workflow.workspaceSha256);fs.writeFileSync(file,JSON.stringify({...workflow,contract:'A1NodeWorkflow/v1',projectId:'wrong'}));assert.throws(()=>readResearchExecutionReceiptStateV1(root,'unseen'),/identity-invalid/);assert.throws(()=>readResearchExecutionReceiptStateV1(root,'../escape'),/task-invalid/);}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS original receipt readback, workspace-vs-graph identity, stale evidence and missing-artifact rejection');
