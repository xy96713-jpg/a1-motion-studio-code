import fs from 'node:fs';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {resolveInstalledRecordingContextV1, recordingDeadlineSignalV1, createInstalledScreenRecordingAdapterV1} from '../apps/studio-next/src/lib/a1-node-screen-recording-installed-context-v1.mjs';
import {screenRecordingNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-screen-recording-adapter-v1.mjs';
import {prepareNormalCaptureV1} from '../work/module-development-launch-v1/integration/system-consumer-batch-20261002-v1/prepare-normal-capture-v1.mjs';
const source = JSON.parse(fs.readFileSync('work/module-development-launch-v1/environments/capture/work/second-article-webkit-v1/response-dependency-candidates-v5/network-preflight-next-attempt-v1/attempt-1/input.json'));
const node = structuredClone(source);
node.input.parameters.purpose = 'REAL_SOFTWARE_OPERATION';
node.input.parameters.publicCaptureProfileId = 'webkit-approved-readonly-v1';
let checks = 0, calls = 0;
const test = async fn => { await fn(); checks++; };
await test(() => { const c = resolveInstalledRecordingContextV1(node); assert.equal(c.profileSha256, '5ad56ad748635746f800b6b8b857d1d564335c2fdcf2ead4021fd5c28d3ac8d4'); assert.notEqual(c.coverageEvidenceSha256, '0'.repeat(64)); });
await test(() => assert(resolveInstalledRecordingContextV1(prepareNormalCaptureV1(source).compiledRecordingNode)));
for (const change of [n => n.module = 'typography', n => n.input.need = false,
  n => n.input.parameters.publicCaptureProfileId = '__proto__', n => n.input.parameters.publicCaptureProfileId = '../fake',
  n => n.input.parameters.source.url = 'https://example.com/', n => n.input.parameters.beats[0].action.quoteExact += 'changed',
  n => n.input.parameters.policy.allowedMethods.push('POST'), n => n.input.parameters.policy.blockMutations = false,
  n => n.input.parameters.publicResourceLoading = {}, n => n.input.parameters.approvedRoots = ['/'],
  n => n.input.parameters.purpose = 'PRODUCTION', n => n.input.parameters.referenceOnlySha256 = ['0'.repeat(64)],
  n => n.input.parameters.referenceOnlySha256 = {}]) await test(() => { const n = structuredClone(node); change(n); assert.throws(() => resolveInstalledRecordingContextV1(n)); });
for (const deadline of [undefined, null, NaN, Infinity, '123', Date.now() - 1]) await test(() => assert.throws(() => recordingDeadlineSignalV1(deadline, true)));
await test(async () => { const c = recordingDeadlineSignalV1(Date.now() + 20, true); await delay(35); assert.equal(c.signal.aborted, true); c.close(); });
await test(async () => { const c = recordingDeadlineSignalV1(Date.now() + 20, true); c.close(); await delay(35); assert.equal(c.signal.aborted, false); });
const mock = {...screenRecordingNodeAdapterV1, async execute(n, context) { calls++; assert(context.signal instanceof AbortSignal); assert(context.publicResourceLoading.runtimeCoverage); return {state: 'needs-review', productionAdmission: false}; }};
const adapter = createInstalledScreenRecordingAdapterV1(mock);
await test(async () => assert.equal((await adapter.execute(node)).state, 'blocked'));
await test(async () => { assert.notEqual(adapter.implementationSha256, screenRecordingNodeAdapterV1.implementationSha256); assert.equal((await adapter.execute(node, {executionDeadlineMs: Date.now() + 1000, publicResourceLoading: {caller: true}})).state, 'needs-review'); assert.equal(calls, 1); });
await test(async () => { const n = structuredClone(node); n.input.parameters.source.url = 'https://example.com/'; assert.equal((await adapter.execute(n, {executionDeadlineMs: Date.now() + 1000})).state, 'blocked'); assert.equal(calls, 1); });
await test(async () => { let ended = false; const timed = createInstalledScreenRecordingAdapterV1({...mock, async execute(n, c) { await new Promise(resolve => c.signal.addEventListener('abort', resolve, {once: true})); ended = true; return {state: 'blocked', reason: 'SCREEN_RECORDING_ABORTED', productionAdmission: false}; }}); assert.equal((await timed.execute(node, {executionDeadlineMs: Date.now() + 25})).reason, 'SCREEN_RECORDING_ABORTED'); assert(ended); });
for (const installed of [false, true]) await test(async () => {
  const n = structuredClone(node); if (!installed) delete n.input.parameters.publicCaptureProfileId;
  const upstream = new AbortController(); upstream.abort();
  const cancelled = createInstalledScreenRecordingAdapterV1({...mock, async execute(n, c) { assert(c.signal.aborted); return {state: 'blocked', reason: 'UPSTREAM_ABORTED', productionAdmission: false}; }});
  assert.equal((await cancelled.execute(n, {signal: upstream.signal, ...(installed ? {executionDeadlineMs: Date.now() + 1000} : {})})).reason, 'UPSTREAM_ABORTED');
});
await test(async () => { const upstream = new AbortController(); const cancel = createInstalledScreenRecordingAdapterV1({...mock, async execute(n, c) { setTimeout(() => upstream.abort(), 5); await new Promise(resolve => c.signal.addEventListener('abort', resolve, {once: true})); return {state: 'blocked', reason: 'UPSTREAM_ABORTED', productionAdmission: false}; }}); assert.equal((await cancel.execute(node, {signal: upstream.signal, executionDeadlineMs: Date.now() + 1000})).reason, 'UPSTREAM_ABORTED'); });
console.log(JSON.stringify({status: 'PASS', checks, claims: 0, browserCalls: 0, encodes: 0, mockExecutions: calls}));
