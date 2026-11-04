import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertPersonCardNormalNodeBindingsV1, createPersonCardSceneFromContentLayoutV1} from '../apps/studio-next/src/lib/a1-person-card-content-preparation-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {compileNodeWorkflow, nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {nodeWorkflowInput} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {layerCompositeNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-composite-adapter-v1.mjs';
import {revalidateNodeArtifacts} from '../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs';

const d = 'work/module-development-launch-v1/person-card-content-layout-v1/development-preparation-v1';
const prepared = JSON.parse(fs.readFileSync(d + '/preparation.json'));
const plan = JSON.parse(fs.readFileSync(d + '/shot-task-plan.json'));
const input = nodeWorkflowInput(compileShotTaskWorkspaceV1(plan));
const definitions = createNodeAdapterRegistry().definitions;
let workflow = compileNodeWorkflow(input, null, {moduleDefinitions: definitions});
const prefix = prepared.sourceInput.id, targetId = prefix + ':layer-compositor';
const stamp = n => {
  n.state = 'succeeded'; n.result = {productionAdmission: false, fixture: 'No artifacts; identity checks only'};
  n.acceptance = {manifestSha256: '1'.repeat(64), sourceResultSha256: nodeInputHash(n.result), inputSha256: n.inputSha256,
    contract: 'A1NodeArtifactAcceptance/v1'};
};
for (const n of workflow.nodes.filter(n => ['media-files', 'editable-typography'].includes(n.module))) stamp(n);
workflow = compileNodeWorkflow(input, workflow, {moduleDefinitions: definitions});
stamp(workflow.nodes.find(n => n.id === targetId));
const runtime = {pending: false, plan, workflow};
const correct = assertPersonCardNormalNodeBindingsV1(prepared, runtime, targetId);
assert.equal(correct.composite.input.implementationSha256, layerCompositeNodeAdapterV1.implementationSha256,
  'Use exported runtime/version-prefixed adapter SHA');
let negatives = 0;
for (const [label, mutate] of [
  ['Wrong compositor implementation', r => {r.workflow.nodes.find(n => n.id === targetId).input.implementationSha256 = '0'.repeat(64);}],
  ['Old type producer copy', r => {r.workflow.nodes.find(n => n.module === 'editable-typography').input.parameters.exactCopy = 'old';}],
  ['Changed accepted type manifest', r => {r.workflow.nodes.find(n => n.module === 'editable-typography').acceptance.manifestSha256 = '2'.repeat(64);}],
  ['Changed executor fingerprint', r => {r.workflow.nodes.find(n => n.id === targetId).inputSha256 = '3'.repeat(64);}],
  ['Unrelated media producer', r => {r.workflow.nodes.find(n => n.module === 'media-files').input.parameters.files[0].sha256 = '4'.repeat(64);}],
]) {
  const bad = structuredClone(runtime); mutate(bad);
  assert.throws(() => assertPersonCardNormalNodeBindingsV1(prepared, bad, targetId), e => e.reason === 'INVALID_INPUT', label); negatives++;
}
await assert.rejects(createPersonCardSceneFromContentLayoutV1(prepared, {nodeId: targetId, state: 'succeeded', artifacts: [],
  inputSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64)}, {id: prefix}), e => e.reason === 'INVALID_INPUT', 'Asserted JSON state cannot replace authoritative runtime'); negatives++;
const badReceipt = structuredClone(correct.type); badReceipt.acceptance.sourceResultSha256 = '0'.repeat(64);
await assert.rejects(revalidateNodeArtifacts(badReceipt), /node-artifact-acceptance-stale/u, 'Incumbent actual acceptance rejects wrong source-result identity before files'); negatives++;
console.log(JSON.stringify({status: 'PASS', negativeChecks: negatives, normalIdentityFingerprintSkeleton: true,
  realAcceptanceOrPNGPass: false, actualRenderDecodeProvider: 0}));
