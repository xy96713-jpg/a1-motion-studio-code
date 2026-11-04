import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareAuthoredArticleNativeLayoutV1} from '../apps/studio-next/src/lib/a1-authored-article-native-layout-v1.mjs';
import {readShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {imagegenReconciledUninvokedV1} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {isRetiredGenerationTaskV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {assertFrameProductionDecisionV1} from '../apps/studio-next/src/lib/a1-production-frame-options-v1.mjs';
const root=fs.realpathSync('.'),taskId='new-article-file-handoff-20261015-v1',dir=path.join(root,'work',taskId,'static-completion-v1');
const before=JSON.parse(fs.readFileSync(path.join(dir,'plan-before-native.json'))),units=JSON.parse(fs.readFileSync(path.join(dir,'native-layout-units.json'))).units;
const runtime=readShotTaskRuntimeV1({repoRoot:root,taskId});
let plan=structuredClone(before);
for(const unit of units){plan=prepareAuthoredArticleNativeLayoutV1({repoRoot:root,taskRoot:runtime.taskRoot,plan,unit,workflow:runtime.workflow}).plan;}
assert.deepEqual(plan.shots[0],before.shots[0]);
assert.ok(plan.shots.slice(1).every(s=>s.tasks.some(t=>t.module==='editable-typography')&&s.tasks.some(t=>t.module==='layer-compositor')&&!s.fullFrameRequests));
assert.ok(plan.shots.slice(1).every(s=>s.productionLayout.states.every(r=>path.isAbsolute(r.referencePath))));
const retired=plan.assetTasks.find(a=>a.consumerShotIds?.includes('A3'))?.tasks.find(t=>t.module==='image-generation');
assert.equal(isRetiredGenerationTaskV1(retired),true);
const baseInput=JSON.parse(fs.readFileSync(path.resolve(root,units[0].authoringInput.path)));
const scratch=fs.mkdtempSync(path.join(runtime.taskRoot,'native-negative-'));
try{
  for(const mutate of [i=>i.exactCopy=['not in the source'],i=>i.visualApproval=true,i=>i.baseShotSha256='f'.repeat(64),
    i=>i.productionResources.assets[0].materialClass='VERIFIED_SOURCE_IMAGE',i=>i.referenceProductionDesign.sourceBinding.sha256='f'.repeat(64),
    i=>i.productionLayout.states[0].layers[1].copyIndex=999]){
    const input=structuredClone(baseInput);mutate(input);const file=path.join(scratch,'input.json'),bytes=Buffer.from(JSON.stringify(input));fs.writeFileSync(file,bytes);
    assert.throws(()=>prepareAuthoredArticleNativeLayoutV1({repoRoot:root,taskRoot:runtime.taskRoot,plan:before,
      unit:{...units[0],authoringInput:{path:file,sha256:createHash('sha256').update(bytes).digest('hex')}},workflow:runtime.workflow}),/ARTICLE_NATIVE_/);
  }
  const nodeId=before.shots.find(s=>s.id==='A3').fullFrameRequests[0].nodeId;
  const unresolved=structuredClone(runtime.workflow);unresolved.nodes.find(n=>n.id===nodeId).progress={toolInvocation:{workerId:'unresolved'}};
  assert.throws(()=>prepareAuthoredArticleNativeLayoutV1({repoRoot:root,taskRoot:runtime.taskRoot,plan:before,unit:units[1],workflow:unresolved}),/GENERATION_NOT_RECONCILED/);
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
const reconciled={module:'image-generation',progress:{provider:'codex-built-in-imagegen',status:'PENDING',toolInvocationHistory:[{outcome:'OWNER_ATTESTED_NO_PROVIDER_CALL_AFTER_BEGIN_MARKER',providerInvoked:false,reconciliationEvidence:{path:'work/receipt.json',sha256:'a'.repeat(64)}}]}};
assert.equal(imagegenReconciledUninvokedV1(reconciled),true);
for(const status of ['SUBMITTING','SUBMITTED','SUBMISSION_UNKNOWN'])assert.equal(imagegenReconciledUninvokedV1({...reconciled,progress:{...reconciled.progress,status}}),false);
assert.equal(imagegenReconciledUninvokedV1({...reconciled,progress:{...reconciled.progress,toolInvocation:{workerId:'active'}}}),false);
const decision={method:'NATIVE_LAYOUT',whySelected:'Exact source fields need editable text and deterministic geometry.',alternatives:[{method:'GENERATE_COMPLETE_FRAME',reason:'No new illustrative pixels are required.'}],sequenceRole:'Explain fields',handoff:'Then choose the confirmed file'};
assert.equal(assertFrameProductionDecisionV1({route:'NATIVE_LAYOUT',productionDecision:decision},{}).method,'NATIVE_LAYOUT');
assert.throws(()=>assertFrameProductionDecisionV1({route:'GENERATE',productionDecision:decision},{}),/METHOD_ROUTE_MISMATCH/);
assert.throws(()=>assertFrameProductionDecisionV1({route:'GENERATE',productionDecision:{...decision,method:'GENERATE_COMPLETE_FRAME',alternatives:[{method:'NATIVE_LAYOUT',reason:'native alternative'}]}},{nativeOnly:true}),/NATIVE_ONLY_TARGET_REQUIRES_NATIVE_LAYOUT/);
console.log('PASS source-bound native A2/A3, unchanged A1, retired generator, invalid inputs, unresolved/unknown dispatch protection and typed native routing. No providers.');
