import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createAiVideoProviderRouterV1, createConfiguredMiniMaxVideoAdapterV1} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {runNodeWorkflowTick, acceptNodeWorkflowArtifacts, readCurrentNodeWorkflow} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {projectDirs} from '../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs';
import {NODE_ARTIFACT_MANIFEST_CONTRACT} from '../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {xyqVideoNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-xyq-video-adapter-v1.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(repo, 'work/module-development-launch-v1/integration/minimax-runtime-bridge-v1');
const assets = path.join(evidence, 'test-run/work/minimax-client-bridge-v1/test-run');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a1-minimax-real-dag-')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
const first = path.join(assets, 'fixture-first.png'), last = path.join(assets, 'fixture-last.png');
const video = path.join(assets, 'fixture-output.mp4');
const budget = path.join(root, 'fixture-budget.json'), claim = path.join(root, 'fixture-claim.json');
fs.writeFileSync(budget, '{"fixtureOnly":true}'); fs.writeFileSync(claim, '{"fixtureOnly":true}');
let xyqCalls = 0, fakeCredentialCalls = 0, consumed = 0;
const protocolEvents = [], rows = [], grants = new Map();
const clone = value => structuredClone(value);
const xyq = {...xyqVideoNodeAdapterV1, execute: async () => {
  xyqCalls++; return {state: 'blocked', reason: 'FIXTURE_XYQ_PATH', productionAdmission: false};
}};
function parameters() {
  const design = {motherboard: {path: first, sha256: fileHash(first), referenceOnly: false, materialClass: 'ORIGINAL_NONFACTUAL'},
    designerId: 'synthetic-designer', actorId: 'synthetic-dot', sceneId: 'synthetic-rail',
    camera: {mode: 'LOCKED', path: 'fixed'}, action: {initial: 'left', transition: 'move', final: 'right', forbiddenOutcomes: ['duplicate']},
    textPolicy: 'NO_READABLE_TEXT', exactCopyPolicy: 'INDEPENDENT_EDITABLE_LAYER_AFTER_VIDEO'};
  const prompt = 'One fictional dot moves along a fixed rail. No readable text.';
  const frames = [first, last].map((file, i) => ({path: file, sha256: fileHash(file), referenceOnly: false,
    materialClass: 'ORIGINAL_NONFACTUAL', frameRole: i ? 'last' : 'first', motherboardSha256: fileHash(first),
    review: {status: 'PASS', sha256: fileHash(file), designSha256: nodeInputHash(design), promptSha256: hash(Buffer.from(prompt)),
      reviewerId: 'synthetic-independent-reviewer', actualPixelsReviewed: true, readableTextFound: false, sameActorScene: true, cameraPathMatch: true}}));
  return {motion: true, submitAuthorized: true, shotVersionSha256: '9'.repeat(64), startFrameSha256: fileHash(first),
    lastFrameSha256: fileHash(last), startFrameReview: {status: 'PASS', sha256: fileHash(first)}, frameDesign: design,
    request: {provider: 'MiniMax', model: 'MiniMax-H3', mode: 'FIRST_LAST', prompt, duration: 4, resolution: '768P', ratio: 'adaptive', frames}};
}
const bridgeOptions = {
  pythonPath: '/Library/Developer/CommandLineTools/usr/bin/python3', clientPath: path.join(repo, 'work/minimax-h3-canary-v1/client.py'),
  getExistingCredential: async () => { fakeCredentialCalls++; return 'SYNTHETIC_CREDENTIAL_NOT_REAL'; },
  lookup: async () => [{address: '8.8.8.8', family: 4}],
  inspectSendAuthorization: async request => {
    const original = grants.get(request.requestSha256); assert.ok(original);
    return {original: clone(original), current: clone(original)};
  },
  fixtureTransport: async ({operation, taskId}) => ({response: operation === 'create' ? {task_id: '123456'} : {
    task: {id: taskId, model: 'MiniMax-H3', status: 'succeeded', duration: 4, resolution: '768P',
      usage: {input_image_count: 2, output_seconds: 4}, content: {url: 'https://cdn.hailuoai.com/synthetic.mp4?token=NOT_REAL_SIGNED_URL'}}}}),
  fixtureDownload: async () => ({body: fs.readFileSync(video), statusCode: 200, headers: {'content-encoding': 'identity'},
    peerAddress: '8.8.8.8', authorized: true}),
  onEvidence: event => protocolEvents.push(event), operationTimeoutMs: 10000,
};
const configured = createConfiguredMiniMaxVideoAdapterV1({bridgeOptions, authorizeSubmission: async request => {
  if (request.phase === 'PREFLIGHT') grants.set(request.requestSha256, {contract: 'A1ExistingCreditAuthorization/v1', provider: 'MiniMax', model: 'MiniMax-H3',
    requestSha256: request.requestSha256, nodeInputSha256: request.inputSha256, accountKind: 'MINIMAX_API', funding: 'EXISTING_CREDIT',
    balanceStatus: 'VERIFIED', automaticTopup: false, postpaid: false, maximumCalls: 1, availableCredit: 10, estimatedCost: 1,
    unit: 'SYNTHETIC_NOT_REAL_CREDIT', expiresAtMs: Date.now() + 20000, budgetEvidence: {path: budget, sha256: fileHash(budget)},
    reservation: {globalCap: 2, claimId: 'synthetic-original', owner: 'synthetic-controller', status: 'ACTIVE', expiresAtMs: Date.now() + 20000,
      evidence: {path: claim, sha256: fileHash(claim)}}});
  return clone(grants.get(request.requestSha256));
}});
const consumer = {label: 'Synthetic accepted-video consumer', optional: true, available: true, version: 1,
  implementationSha256: hash(Buffer.from('synthetic-video-consumer-v1')), dependencies: ['ai-video'],
  async execute(node, {dependencies, artifactRoot}) {
    const source = dependencies['P1:ai-video']; assert.equal(source.state, 'succeeded');
    const item = source.artifacts.find(a => a.kind === 'VIDEO'); assert.ok(item);
    assert.equal(fileHash(item.absolutePath), item.sha256); assert.equal(item.metadata.width, 960); assert.equal(item.metadata.height, 768);
    const content = {contract: 'A1SyntheticAcceptedVideoConsumption/v1', producerInputSha256: source.inputSha256,
      producerManifestSha256: source.manifestSha256, consumedVideoSha256: item.sha256, metadata: item.metadata, productionAdmission: false};
    fs.mkdirSync(path.join(artifactRoot, 'consumer'), {recursive: true});
    const output = path.join(artifactRoot, 'consumer/read.json'); fs.writeFileSync(output, JSON.stringify(content) + '\n'); consumed++;
    return {state: 'needs-review', productionAdmission: false, artifactManifest: {contract: NODE_ARTIFACT_MANIFEST_CONTRACT,
      nodeId: node.id, inputSha256: node.inputSha256, productionAdmission: false,
      artifacts: [{path: 'consumer/read.json', kind: 'JSON_PLAN', role: 'synthetic-consumption',
        jsonContract: content.contract, sha256: fileHash(output), bytes: fs.statSync(output).size}]}};
  }};
function fixture(name, p, miniMaxAdapter, downstream = false) {
  const appRoot = path.join(root, name, 'apps/studio-next'), dirs = projectDirs(appRoot);
  fs.mkdirSync(dirs.publicDir, {recursive: true});
  const workspace = {contract: 'A1EditorialAssetWorkbench/v2', workspaceSha256: hash(Buffer.from(name)),
    directorInput: {projectId: name}, article: {title: 'Synthetic fixture', sourceTextSha256: 'a'.repeat(64)}, visualBible: {},
    production: {generation: {workerStatus: 'frozen', automaticDispatchAllowed: false, jobs: []}, shotIntelligence: {
      currentStoryboardAuthority: {contract: 'A1CurrentStoryboardAuthority/v1', current: true, shots: [{shotId: 'P1', sourceText: 'Synthetic input',
        semanticJob: 'Synthetic pipeline only', exactCopy: [], versionId: 'fixture-v1', route: 'PACKAGE', nodeWorkflow: {
          modules: {material: false, recording: false, typography: false, 'ai-video': true, ...(downstream ? {'fixture-consumer': true} : {})},
          moduleDependencies: {'ai-video': [], ...(downstream ? {'fixture-consumer': ['ai-video']} : {})},
          moduleArtifactKinds: downstream ? {'fixture-consumer': {'ai-video': ['VIDEO']}} : {}, moduleInputs: {'ai-video': p}}}]}}}};
  fs.writeFileSync(path.join(dirs.publicDir, 'workspace.json'), JSON.stringify(workspace));
  const router = createAiVideoProviderRouterV1({xyqAdapter: xyq, ...(miniMaxAdapter ? {miniMaxAdapter} : {})});
  const adapters = {'ai-video': router, ...(downstream ? {'fixture-consumer': consumer} : {})};
  return {appRoot, adapters, artifactRoot: path.join(root, name, 'artifacts'), workerId: 'synthetic-controller', origin: 'http://127.0.0.1:4311'};
}
const run = f => runNodeWorkflowTick(f.appRoot, f);
const check = async (name, fn) => { await fn(); rows.push({name, status: 'PASS'}); console.log('PASS ' + name); };
try {
  await check('real default tick selects explicit MiniMax and blocks unconfigured client without XYQ fallback', async () => {
    const f = fixture('missing-client', parameters()); const before = xyqCalls, r = await run(f);
    assert.equal(r.outcomes[0].reason, 'MINIMAX_TRUSTED_CLIENT_REQUIRED'); assert.equal(xyqCalls, before);
  });
  await check('real tick blocks missing credit before transport or credential callback', async () => {
    const f = fixture('missing-credit', parameters(), createConfiguredMiniMaxVideoAdapterV1({bridgeOptions}));
    const before = fakeCredentialCalls, r = await run(f);
    assert.equal(r.outcomes[0].reason, 'MINIMAX_EXISTING_CREDIT_AND_CAP2_PROOF_REQUIRED'); assert.equal(fakeCredentialCalls, before);
  });
  await check('providerless XYQ compatibility and unknown/missing MiniMax provider routing use real tick', async () => {
    for (const [name, request, reason] of [['legacy-xyq', {generateType: 0}, 'FIXTURE_XYQ_PATH'],
      ['unknown-provider', {provider: 'unknown'}, 'AI_VIDEO_PROVIDER_UNSUPPORTED'],
      ['missing-provider', {model: 'MiniMax-H3'}, 'AI_VIDEO_MINIMAX_PROVIDER_REQUIRED']]) {
      const r = await run(fixture(name, {request})); assert.equal(r.outcomes[0].reason, reason);
    }
    assert.equal(xyqCalls, 1);
  });
  await check('actual Python client fixture passes real tick then technical acceptance and same-DAG verified consumption', async () => {
    const f = fixture('positive', parameters(), configured, true), firstTick = await run(f);
    assert.equal(firstTick.outcomes.find(x => x.id === 'P1:ai-video')?.state, 'needs-review', JSON.stringify(firstTick.outcomes));
    assert.equal(consumed, 0);
    await acceptNodeWorkflowArtifacts(f.appRoot, 'P1:ai-video', {...f, reviewerId: 'synthetic-technical-reviewer'});
    const next = await run(f); assert.equal(next.outcomes.find(x => x.id === 'P1:fixture-consumer')?.state, 'needs-review');
    await acceptNodeWorkflowArtifacts(f.appRoot, 'P1:fixture-consumer', {...f, reviewerId: 'synthetic-consumer-reviewer'});
    const current = readCurrentNodeWorkflow(f.appRoot, f);
    assert.equal(current.nodes.find(x => x.id === 'P1:ai-video').state, 'succeeded');
    assert.equal(current.nodes.find(x => x.id === 'P1:fixture-consumer').state, 'succeeded');
    assert.equal(consumed, 1); assert.equal(xyqCalls, 1);
    fs.writeFileSync(path.join(evidence, 'same-dag-fixture.json'), JSON.stringify(current, null, 2) + '\n');
  });
  await check('real DAG input mutation and unsupported dependency hash fail before new provider submission', async () => {
    const f = fixture('hash-negative', parameters(), configured), node = readCurrentNodeWorkflow(f.appRoot, f).nodes.find(n => n.module === 'ai-video');
    const before = protocolEvents.length;
    node.input.parameters.request.prompt += ' changed';
    assert.equal((await configured.execute(node, {artifactRoot: f.artifactRoot, checkpoint: async () => {}})).reason, 'MINIMAX_NODE_INPUT_SHA_MISMATCH');
    node.input.parameters.request.prompt = parameters().request.prompt;
    node.dependencies = ['unverified-external-node'];
    assert.equal((await configured.execute(node, {artifactRoot: f.artifactRoot, checkpoint: async () => {}})).reason, 'MINIMAX_NODE_INPUT_SHA_MISMATCH');
    assert.equal(protocolEvents.length, before);
  });
  const text = JSON.stringify({rows, protocolEvents}); assert.ok(!text.includes('SYNTHETIC_CREDENTIAL_NOT_REAL'));
  assert.ok(!text.includes('NOT_REAL_SIGNED_URL')); assert.ok(!text.includes('data:image'));
  fs.writeFileSync(path.join(evidence, 'runtime-routing-fixture-receipt.json'), JSON.stringify({contract: 'A1MiniMaxRealTickRoutingFixtures/v1', rows,
    passed: rows.length, sameDagVideoConsumed: consumed, xyqFixtureCalls: xyqCalls, fixtureTransport: 'REAL_LOCKED_PYTHON_CLIENT_HTTP_MOCKED',
    protocolEvents, realProviderCalls: 0, realNetworkCalls: 0, realCredentialReads: 0, productionAdmission: false}, null, 2) + '\n');
} finally { fs.rmSync(root, {recursive: true, force: true}); }
