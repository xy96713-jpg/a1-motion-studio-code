import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preparePersonCardContentLayoutV1, compilePersonCardContentShotV1, revalidatePersonCardContentProofV1, assertPersonCardNormalNodeBindingsV1} from '../apps/studio-next/src/lib/a1-person-card-content-preparation-v1.mjs';
import {verifyResearchCopyAuthoritiesV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {compileShotPackagingDecisionV1} from '../apps/studio-next/src/lib/a1-shot-packaging-decision-v1.mjs';
import {nodeInputHash, compileNodeWorkflow} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {nodeWorkflowInput} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
const input=JSON.parse(fs.readFileSync('work/module-development-launch-v1/person-card-content-layout-v1/static-validation-prepared-v1/pan-landscape-v1-input.json'));
const prepared=await preparePersonCardContentLayoutV1(input);assert.equal(prepared.status,'READY');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'a1-content-decision-pure-'));
const bytes=JSON.stringify(prepared,null,2)+'\n';const receiptSHA=createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(temp,'preparation.json'),bytes);
const shot=compilePersonCardContentShotV1(prepared,receiptSHA);
const plan={contract:'A1ShotTaskPlan/v1',scope:'RESEARCH_ONLY',productionAdmission:false,projectId:'content-decision-pure-test',researchCopyAuthorityReceipts:[{path:'preparation.json',sha256:receiptSHA}],shots:[shot]};
const facts=verifyResearchCopyAuthoritiesV1({taskRoot:temp,plan});
const workspace=compileShotTaskWorkspaceV1(plan,{verifiedSourceFacts:facts});
const definitions=createNodeAdapterRegistry().definitions;
let workflow=compileNodeWorkflow(nodeWorkflowInput(workspace),null,{moduleDefinitions:definitions});
const ordinary=workflow.nodes.filter(n=>n.input.need===true);assert.equal(ordinary.length,3,'Both producer modules and compositor dispatchable');
assert(ordinary.every(n=>n.input.need===true));
assert(ordinary.find(n=>n.module==='layer-compositor').input.shot.packagingDecision.copyBindings.every(b=>b.sourceVideoSha256==null&&b.frameNumber==null));
const stamp=n=>{n.state='succeeded';n.result={fixture:'Identity only; no actual artifacts'};n.acceptance={manifestSha256:'1'.repeat(64),sourceResultSha256:nodeInputHash(n.result),inputSha256:n.inputSha256};};
for(const n of workflow.nodes.filter(n=>['media-files','editable-typography'].includes(n.module)))stamp(n);
workflow=compileNodeWorkflow(nodeWorkflowInput(workspace),workflow,{moduleDefinitions:definitions});stamp(workflow.nodes.find(n=>n.module==='layer-compositor'));
assertPersonCardNormalNodeBindingsV1(prepared,{plan,workflow,pending:false,taskRoot:temp},input.id+':layer-compositor');
let negatives=0;
const reseal=p=>{const {preparationSha256,...body}=p;p.preparationSha256=nodeInputHash(body);return p;};
for(const [label,mutate] of [
 ['Wrong original source',p=>{p.sourceInput.photo.sha256='0'.repeat(64);}],
 ['Wrong locked text',p=>{p.sourceInput.fields[0].text='未授权姓名';}],
 ['Wrong measured layout',p=>{p.layout.runs[0].x+=10;}],
 ['Missing synthetic disclosure',p=>{p.sourceInput.fields.pop();p.sourceInput.copyLock.sha256=createHash('sha256').update(p.sourceInput.fields.map(f=>f.text).join('')).digest('hex');}],
 ['Old type parameters',p=>{p.parameters['editable-typography'].runs[0].text='旧文案';}],
]){let bad=structuredClone(prepared);mutate(bad);assert.throws(()=>revalidatePersonCardContentProofV1(reseal(bad)),undefined,label);negatives++;}
let wrong=structuredClone(plan);wrong.shots[0].packagingDecision.layers[0].geometry.x+=.01;
assert.throws(()=>verifyResearchCopyAuthoritiesV1({taskRoot:temp,plan:wrong}),/research-content-layout-shot-mismatch/);negatives++;
for(const mutate of [p=>{p.scope='PRODUCTION';},p=>{p.productionAdmission=true;}]){let bad=structuredClone(plan);mutate(bad);assert.throws(()=>verifyResearchCopyAuthoritiesV1({taskRoot:temp,plan:bad}),/research-copy-authority-scope-invalid/);negatives++;}
const decision=shot.packagingDecision,availableAssets=decision.sourceBindings.map(b=>({id:b.assetId,sha256:b.sha256,materialClass:b.materialClass}));
const args={decision,shotId:shot.id,shotVersionSha256:shot.sourceVersionSha256,exactCopy:shot.exactCopy,availableAssets,verifiedSourceFacts:facts};
assert(compileShotPackagingDecisionV1({...args,copyAuthorityScope:null}).blockers.includes('PACKAGING_CONTENT_LAYOUT_AUTHORITY_INVALID'));negatives++;
assert(compileShotPackagingDecisionV1({...args,copyAuthorityScope:'RESEARCH_ONLY',verifiedSourceFacts:[]}).blockers.includes('PACKAGING_CONTENT_LAYOUT_AUTHORITY_INVALID'));negatives++;
console.log(JSON.stringify({status:'PASS',negativeChecks:negatives,normalThreeNodeCompilation:true,realAcceptanceOrPNGPass:false,renderDecodeBrowserProvider:0}));
