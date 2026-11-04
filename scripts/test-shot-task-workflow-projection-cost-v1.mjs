import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/studio-next/package.json'));
const ts = require('typescript');
const source = fs.readFileSync(process.env.A1_ROUTE_TEST_SOURCE || path.join(root,
  'apps/studio-next/src/app/api/system-line/shot-task-workflow/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
}}).outputText;
const skipped = Array.from({length: 242}, (_, index) => ({id: `shot-${index}:recording`,
  module: 'recording', state: 'skipped', shotId: `shot-${index}`}));
const accepted = {id: 'accepted:recording', module: 'recording', state: 'succeeded',
  acceptedArtifactSha256: 'a'.repeat(64)};
const nodes = [...skipped, accepted,
  {...accepted, id: 'review:recording', state: 'needs-review'},
  {...accepted, id: 'running:recording', state: 'running'},
  {...accepted, id: 'unaccepted:recording', acceptedArtifactSha256: undefined}];
let reads = 0, pointerStatus = 'VERIFIED_ACCEPTED_CAPTURE_AND_EXPLICIT_FRAMES';
const pointerCalls = [], exportCalls = [];
const runtime = {plan: {projectId: 'fixture'}, pending: false, inputPlanSha256: 'b'.repeat(64),
  summary: {nodes}, generationPreflight: {}, decisions: [], directorPlans: []};
const mocks = {
  '@/lib/a1-projection-read-cache-v1.mjs': {withProjectionReadCacheV1: run => run()},
  'node:fs': {existsSync: () => true, readFileSync: () => JSON.stringify({taskId: 'fixture',
    scope: 'RESEARCH_ONLY', productionAdmission: false})},
  'next/server': {NextResponse: {json: (value, init) => Response.json(value, init)}},
  '@/lib/a1-shot-task-runtime-v1.mjs': {readShotTaskRuntimeV1: () => {reads++; return runtime;}},
  '@/lib/a1-shot-task-graph-v1.mjs': {projectShotTaskMaterialWorkOrderV1: () => ({})},
  '@/lib/a1-production-batch-runner-v1.mjs': {projectProductionBatchV1: () => ({readiness: {actions: []}})},
  '@/lib/a1-person-content-request-v1.mjs': {projectPersonContentRequestsV1: async () => []},
  '@/lib/a1-pointer-accepted-capture-host-v1.mjs': {readAcceptedPointerConsumerV1: ({nodeId}) => {
    pointerCalls.push(nodeId); return {status: pointerStatus, nodeId};
  }},
  '@/lib/a1-pointer-derived-export-v1.mjs': {readAcceptedPointerDerivedExportV1: ({host}) => {
    exportCalls.push(host.nodeId); return {status: 'FIXTURE_VERIFIED_EXPORT'};
  }},
};
const exports = {};
vm.runInNewContext(compiled, {exports, process: {cwd: () => path.join(root, 'apps/studio-next')},
  URL, Request, Response, Buffer, require: name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('node:')) return require(name);
    if (name.startsWith('@/lib/')) return {};
    throw Error('UNEXPECTED_ROUTE_DEPENDENCY:' + name);
  }}, {filename: 'actual-shot-task-route.cjs'});
const get = query => exports.GET(new Request('http://127.0.0.1:4311/api/system-line/shot-task-workflow?taskId=fixture' + query));
const response = await get(''), body = await response.json();
assert.equal(response.status, 200);
assert.equal(reads, 1);
assert.deepEqual(pointerCalls, [accepted.id], 'skipped/unaccepted recording placeholders must never enter the costly pointer verifier');
assert.deepEqual(exportCalls, [accepted.id]);
assert.equal(body.workflow.nodes.length, nodes.length, 'preserve all workflow nodes');
assert.ok(body.workflow.nodes.slice(0, 242).every(node => !node.derivedPointer));
assert.equal(body.workflow.nodes[242].derivedPointer.derivedExport.status, 'FIXTURE_VERIFIED_EXPORT');

pointerCalls.length = 0; exportCalls.length = 0; pointerStatus = 'UNKNOWN';
const rejected = await (await get('')).json();
assert.deepEqual(pointerCalls, [accepted.id]);
assert.equal(exportCalls.length, 0, 'failed ordinary verification never exposes a derived export');
assert.equal(rejected.workflow.nodes[242].derivedPointer.status, 'UNKNOWN');

pointerCalls.length = 0;
assert.equal((await get('&productionBatchOnly=1')).status, 200);
assert.equal(pointerCalls.length, 0);
assert.equal((await get('&derivedPointer=shot-0:recording')).status, 409);
assert.deepEqual(pointerCalls, ['shot-0:recording'], 'explicit pointer queries still use the real verification boundary');
console.log(JSON.stringify({status: 'PASS', skippedRecordings: 242, bulkPointerReads: 1,
  acceptedVerificationPreserved: true, unknownExportBlocked: true, explicitQueryPreserved: true,
  realProviderCalls: 0, productionWrites: 0}));
