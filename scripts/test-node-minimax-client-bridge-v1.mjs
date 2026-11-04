import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {createMiniMaxH3ClientBridgeV1, MINIMAX_H3_EXISTING_CLIENT_SHA256_V1} from '../apps/studio-next/src/lib/a1-node-minimax-client-bridge-v1.mjs';
import {createMiniMaxVideoNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-minimax-video-adapter-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';

// This harness invokes the actual locked incumbent Python methods. Child socket calls are denied
// BEFORE import/client construction; requests HTTP is replaced before the H3Client method runs.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a1-minimax-bridge-fixture-')));
const evidence = path.resolve(process.env.A1_MINIMAX_BRIDGE_EVIDENCE_DIR || 'work/minimax-client-bridge-v1/test-run');
fs.mkdirSync(evidence, {recursive: true});
const localClient = path.resolve('work/minimax-h3-canary-v1/client.py');
const clientPath = process.env.A1_MINIMAX_BRIDGE_CLIENT_PATH || (fs.existsSync(localClient) ? localClient : path.resolve('../../../../work/minimax-h3-canary-v1/client.py'));
const pythonPath = process.env.A1_MINIMAX_BRIDGE_PYTHON_PATH || '/Library/Developer/CommandLineTools/usr/bin/python3';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = p => hash(fs.readFileSync(p)), clone = value => structuredClone(value);
const requestSHA = 'a'.repeat(64), nodeSHA = 'b'.repeat(64), secret = 'FIXTURE_BEARER_DO_NOT_PERSIST', signed = 'SIGNED_URL_DO_NOT_PERSIST';
const rows = [], events = [], budget = path.join(root, 'fixture-budget.json'), claim = path.join(root, 'fixture-claim.json');
fs.writeFileSync(budget, JSON.stringify({fixtureOnly: true}));fs.writeFileSync(claim, JSON.stringify({fixtureOnly: true}));
const original = (sha = requestSHA) => ({contract: 'A1ExistingCreditAuthorization/v1', provider: 'MiniMax', model: 'MiniMax-H3',
  requestSha256: sha, nodeInputSha256: nodeSHA, accountKind: 'MINIMAX_API', funding: 'EXISTING_CREDIT', balanceStatus: 'VERIFIED',
  automaticTopup: false, postpaid: false, maximumCalls: 1, availableCredit: 10, estimatedCost: 1, unit: 'FIXTURE_NOT_REAL_BALANCE',
  expiresAtMs: Date.now() + 15000, budgetEvidence: {path: budget, sha256: fileHash(budget)},
  reservation: {globalCap: 2, claimId: 'fixture-original', owner: 'fixture-controller', status: 'ACTIVE', expiresAtMs: Date.now() + 15000,
    evidence: {path: claim, sha256: fileHash(claim)}}});
const lookup = async () => [{address: '8.8.8.8', family: 4}];
const check = async (name, fn) => { await fn(); rows.push({name, status: 'PASS'}); console.log('PASS ' + name); };
const throws = async (fn, code) => assert.rejects(fn, error => { assert.equal(error.message, code); return true; });
const first = path.join(root, 'first.png'), last = path.join(root, 'last.png'), video = path.join(root, 'fixture.mp4');
let videoBytes;
const downloadResponse = body => ({body, statusCode: 200, headers: {'content-encoding': 'identity'}, peerAddress: '8.8.8.8', authorized: true});
const payload = count => ({model: 'MiniMax-H3', content: [{type: 'text', text: 'One fictional dot moves along a fixed rail. No readable text.'},
  ...[first, last].slice(0, count).map((filename, i) => ({type: 'image_url', role: ['first_frame', 'last_frame'][i],
    image_url: {url: 'data:image/png;base64,' + fs.readFileSync(filename).toString('base64')}}))], duration: 4, resolution: '768P', ratio: 'adaptive'});
function make(options = {}) {
  const ownEvents = [], phases = [], authorizationRequests = [], grant = options.grant || original(), ownResponse = options.response;
  const authorization = async request => { phases.push(request.phase); authorizationRequests.push(clone(request));const value = {original: clone(grant), current: clone(grant)};
    options.authorizationEdit?.(value, request); if (options.authorizationDelayMs) await new Promise(r => setTimeout(r, options.authorizationDelayMs));
    return value; };
  const bridge = createMiniMaxH3ClientBridgeV1({pythonPath, clientPath, getExistingCredential: async () => secret,
    inspectSendAuthorization: authorization, lookup, operationTimeoutMs: 10000,
    onEvidence: event => { ownEvents.push(event); events.push(event); },
    fixtureTransport: async ({operation, taskId}) => ({...options.transport, response: ownResponse || (operation === 'create' ? {task_id: '123456', ignored: secret} :
      {task: {id: taskId, model: 'MiniMax-H3', status: 'succeeded', duration: 4, resolution: '768P',
        usage: {input_image_count: options.frameCount || 2, output_seconds: 4, total_seconds: 4},
        content: {url: 'https://cdn.hailuoai.com/mock.mp4?token=' + signed}, ignored: secret}})}),
    fixtureDownload: async () => downloadResponse(videoBytes), ...options.config});
  return {bridge, events: ownEvents, phases, authorizationRequests, grant};
}
try {
  assert.equal(fileHash(clientPath), MINIMAX_H3_EXISTING_CLIENT_SHA256_V1);
  const svg = x => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="256"><rect width="320" height="256" fill="#c8d8de"/><path d="M30 110H290" stroke="#334455" stroke-width="8"/><circle cx="${x}" cy="90" r="20" fill="#3a65aa"/></svg>`);
  await sharp(svg(65)).png().toFile(first); await sharp(svg(255)).png().toFile(last);
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'color=c=blue:s=960x768:r=10:d=4', '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '1', '-filter_threads', '1', '-n', video], {timeout: 30000});
  videoBytes = fs.readFileSync(video);
  await check('factory/import is inert and missing trusted configuration explains blocked', async () => {
    let calls = 0;
    const bridge = createMiniMaxH3ClientBridgeV1({getExistingCredential: () => { calls++; }, inspectSendAuthorization: () => { calls++; }});
    assert.equal(bridge.configured, false); assert.equal(calls, 0);
    await throws(() => bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_TRUSTED_CONFIG_REQUIRED'); assert.equal(calls, 0);
  });
  await check('actual H3Client create/query normalizes official v2 and safe local MP4 collection', async () => {
    const f = make(); const response = await f.bridge.create(payload(2), {requestSha256: requestSHA}); assert.deepEqual(response, {task_id: '123456'});
    assert.deepEqual(f.phases, ['BRIDGE_ENTRY', 'ACTUAL_SEND']);
    assert.ok(f.authorizationRequests.every(r => r.payloadSha256 === nodeInputHash(payload(2)) && r.requestSha256 === requestSHA));
    const e = f.events.find(e => e.event === 'FIXTURE_EVIDENCE');
    assert.deepEqual(e.roles, ['first_frame', 'last_frame']); assert.deepEqual(e.frameSHAs, [fileHash(first), fileHash(last)]);
    assert.equal(e.credentialHeaderMatched, true);assert.equal(e.proxiesDisabled, true);assert.equal(e.verifyTLS, true);
    const query = await f.bridge.query('123456'); assert.equal(query.task.status, 'succeeded'); assert.equal(query.task.ignored, undefined);
    const dir = fs.mkdtempSync(path.join(root, 'collect-')), output = await f.bridge.collect(query.task, {jobId: '123456', directory: dir, requestSha256: requestSHA});
    assert.equal(output.sha256, fileHash(video)); assert.equal(fileHash(output.path), fileHash(video));
    assert.ok(f.events.filter(e => e.event === 'RESULT').every(e => e.httpCalls === 1));
  });
  await check('actual first-only method sends one real fixture frame and zero last-frame bytes', async () => {
    const f = make({frameCount: 1}); await f.bridge.create(payload(1), {requestSha256: requestSHA});
    assert.deepEqual(f.events.find(e => e.event === 'FIXTURE_EVIDENCE').roles, ['first_frame']);
    assert.ok(f.authorizationRequests.every(r => r.payloadSha256 === nodeInputHash(payload(1))));
  });
  await check('API DNS validates all answers and fails mixed/private before key callback/process', async () => {
    for (const answers of [[{address: '127.0.0.1', family: 4}], [{address: '8.8.8.8', family: 4}, {address: '10.0.0.1', family: 4}]]) {
      let credentials = 0; const f = make({config: {lookup: async () => answers, getExistingCredential: () => {credentials++;return secret;}}});
      await assert.rejects(() => f.bridge.create(payload(2), {requestSha256: requestSHA})); assert.equal(credentials, 0); assert.equal(f.events.length, 0);
    }
  });
  await check('startup and TLS delays beyond original deadline send zero POST bytes', async () => {
    for (const phase of ['startupDelayMs', 'tlsDelayMs']) {
      const grant = original();grant.expiresAtMs = Date.now() + 600; const f = make({grant, transport: {[phase]: 800}});
      await assert.rejects(() => f.bridge.create(payload(2), {requestSha256: requestSHA}));
      assert.equal(f.events.filter(e => e.event === 'FIXTURE_EVIDENCE').length, 0);
      assert.equal(f.events.filter(e => e.event === 'RESULT').length, 0);
    }
  });
  await check('fresh actual-send revocation/claim change/credit loss/original expiry sends zero bytes', async () => {
    const edits = [v => v.current.reservation.status = 'RELEASED', v => v.current.reservation.claimId = 'another',
      v => v.current.reservation.owner = 'another', v => v.current.availableCredit = 0, v => v.current.automaticTopup = true,
      v => v.current.nodeInputSha256 = 'c'.repeat(64), v => v.original.expiresAtMs = Date.now() - 1,
      v => v.current.reservation.expiresAtMs = Date.now() - 1, v => v.original.expiresAtMs += 10000];
    for (const edit of edits) {
      const f = make({authorizationEdit: (value, request) => { if (request.phase === 'ACTUAL_SEND') edit(value); }});
      await assert.rejects(() => f.bridge.create(payload(2), {requestSha256: requestSHA}));
      assert.ok(f.events.some(e => e.event === 'SEND_READY' && e.wireBytes === 0));
      assert.equal(f.events.filter(e => e.event === 'FIXTURE_EVIDENCE').length, 0);
    }
  });
  await check('awaited send callback expiry cannot mint a later original permit', async () => {
    const grant = original(); grant.expiresAtMs = Date.now() + 900;
    const f = make({grant, authorizationEdit: (v, r) => {if(r.phase === 'ACTUAL_SEND') v.current.expiresAtMs += 100000;}, authorizationDelayMs: 500});
    await assert.rejects(() => f.bridge.create(payload(2), {requestSha256: requestSHA}));
    assert.equal(f.events.filter(e => e.event === 'FIXTURE_EVIDENCE').length, 0);
  });
  await check('locked client SHA / absent runtime / missing requests explain blocked without install', async () => {
    const wrong = path.join(root, 'wrong-client.py'); fs.writeFileSync(wrong, 'raise Exception("do not execute")');
    await throws(() => make({config: {clientPath: wrong}}).bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_CLIENT_SHA_MISMATCH');
    await throws(() => make({config: {pythonPath: '/nonexistent/python3'}}).bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_RUNTIME_DEPENDENCY_UNAVAILABLE');
    const bundled = '/Users/a1/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
    if (fs.existsSync(bundled)) await throws(() => make({config: {pythonPath: bundled}}).bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_RUNTIME_DEPENDENCY_UNAVAILABLE');
  });
  await check('credential/callback errors are redacted and no credential retrieval can overrun deadline', async () => {
    await throws(() => make({config: {getExistingCredential: async () => {throw Error(secret + signed);}}}).bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_TRANSPORT_AMBIGUOUS');
    await throws(() => make({config: {inspectSendAuthorization: async () => {throw Error('MINIMAX_BRIDGE_' + secret);}}}).bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_TRANSPORT_AMBIGUOUS');
    await throws(() => make({config: {getExistingCredential: async () => '',}}).bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_EXISTING_CREDENTIAL_REQUIRED');
    const f = make({config: {operationTimeoutMs: 150, getExistingCredential: () => new Promise(() => {})}});
    await throws(() => f.bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_SEND_EXPIRED');assert.equal(f.events.length, 0);
  });
  await check('payload endpoint/command/key/model/role cannot override fixed existing transport', async () => {
    for (const edit of [p => p.endpoint = 'https://evil.test', p => p.key = secret, p => p.command = 'echo', p => p.model = 'other',
      p => p.content[1].role = 'reference', p => p.content[1].image_url.url = 'https://evil.test/frame.png', p => p.content[1].image_url.endpoint = 'https://evil.test']) {
      const p = payload(2);edit(p); const f = make(); await throws(() => f.bridge.create(p, {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_PAYLOAD_INVALID');assert.equal(f.events.length, 0);
    }
  });
  await check('malformed create result and API redirect never retry', async () => {
    for (const option of [{response: {task_id: 123}}, {transport: {statusCode: 302}}, {response: null, transport: {responseLost: true}}]) {
      const f = make(option);await assert.rejects(() => f.bridge.create(payload(2), {requestSha256: requestSHA}));
      const last = f.events.findLast(e => e.event === 'ERROR');assert.equal(last.httpCalls, 1);assert.ok(last.wireBytes > 0);
    }
  });
  await check('query raw identity/status/usage unsupported shapes are rejected and cancelled preserved', async () => {
    for (const task of [{id: '999', model: 'MiniMax-H3', status: 'running'}, {id: '123456', model: 'other', status: 'running'},
      {id: '123456', model: 'MiniMax-H3', status: 'unknown'}, {id: '123456', model: 'MiniMax-H3', status: 'succeeded', duration: 4, resolution: '768P', usage: {}, content: {url: 'https://cdn.test/a.mp4'}}]) {
      await throws(() => make({response: {task}}).bridge.query('123456'), 'MINIMAX_BRIDGE_RESPONSE_INVALID');
    }
    const r = await make({response: {task: {id: '123456', model: 'MiniMax-H3', status: 'cancelled'}}}).bridge.query('123456');assert.equal(r.task.status, 'cancelled');
  });
  await check('forged/copied/modified success task cannot trigger collection', async () => {
    const f = make(), task = (await f.bridge.query('123456')).task;
    for (const value of [clone(task), {id: '123456'}]) await throws(() => f.bridge.collect(value, {jobId: '123456', directory: root, requestSha256: requestSHA}), 'MINIMAX_BRIDGE_UNOBSERVED_TASK');
    task.content.url = 'https://other.test/output';await throws(() => f.bridge.collect(task, {jobId: '123456', directory: root, requestSha256: requestSHA}), 'MINIMAX_BRIDGE_UNOBSERVED_TASK');
  });
  await check('CDN credential/private/mixed DNS and HTTP URL are blocked before bytes', async () => {
    for (const url of ['http://cdn.test/a.mp4', 'https://name:password@cdn.test/a.mp4', 'https://127.0.0.1/a.mp4', 'https://cdn.test:444/a.mp4']) {
      let downloads = 0; const f = make({response: {task: {id: '123456', model: 'MiniMax-H3', status: 'succeeded', duration: 4, resolution: '768P',
        usage: {input_image_count: 2}, content: {url}}}, config: {fixtureDownload: async () => {downloads++;return videoBytes;}}});
      const task = (await f.bridge.query('123456')).task;await assert.rejects(() => f.bridge.collect(task, {jobId: '123456', directory: root, requestSha256: requestSHA}));assert.equal(downloads, 0);
    }
    let downloads = 0;
    const f = make({config: {lookup: async host => host === 'api.minimax.cn' ? [{address: '8.8.8.8', family: 4}] :
      [{address: '8.8.8.8', family: 4}, {address: '10.0.0.1', family: 4}], fixtureDownload: async () => {downloads++;return videoBytes;}}});
    const observedTask = (await f.bridge.query('123456')).task;
    await throws(() => f.bridge.collect(observedTask, {jobId: '123456', directory: root, requestSha256: requestSHA}), 'MINIMAX_BRIDGE_PUBLIC_DNS_BLOCKED');assert.equal(downloads, 0);
  });
  await check('MP4 signature/size/path/symlink/output collision have byte-bound failures', async () => {
    const f = make({config: {fixtureDownload: async () => downloadResponse(Buffer.alloc(20))}}), task = (await f.bridge.query('123456')).task;
    await throws(() => f.bridge.collect(task, {jobId: '123456', directory: root, requestSha256: requestSHA}), 'MINIMAX_BRIDGE_COLLECTION_FORMAT_INVALID');
    const g = make(), t = (await g.bridge.query('123456')).task, link = path.join(root, 'dir-link');fs.symlinkSync(root, link);
    await throws(() => g.bridge.collect(t, {jobId: '123456', directory: link, requestSha256: requestSHA}), 'MINIMAX_BRIDGE_PATH_INVALID');
    const dir = fs.mkdtempSync(path.join(root, 'collision-'));fs.writeFileSync(path.join(dir, 'minimax-' + requestSHA + '.mp4'), 'wrong');
    await throws(() => g.bridge.collect(t, {jobId: '123456', directory: dir, requestSha256: requestSHA}), 'MINIMAX_BRIDGE_OUTPUT_COLLISION');
  });
  await check('CDN redirect/peer/certificate/encoding/oversize responses fail common collection boundary', async () => {
    for (const edit of [r => r.statusCode = 302, r => r.peerAddress = '127.0.0.1', r => r.authorized = false,
      r => r.headers['content-encoding'] = 'gzip', r => r.body = Buffer.alloc(64 * 1024 * 1024 + 1)]) {
      const f = make({config: {fixtureDownload: async () => {const r = downloadResponse(videoBytes);edit(r);return r;}}});
      const task = (await f.bridge.query('123456')).task;
      await assert.rejects(() => f.bridge.collect(task, {jobId: '123456', directory: root, requestSha256: requestSHA}));
    }
  });
  await check('existing adapter consumes actual Python bridge fixture with same-root durable cache reuse', async () => {
    const prompt = payload(2).content[0].text;
    const design = {motherboard: {path: first, sha256: fileHash(first), referenceOnly: false, materialClass: 'ORIGINAL_NONFACTUAL'},
      designerId: 'fixture-designer', actorId: 'dot', sceneId: 'rail', camera: {mode: 'LOCKED', path: 'fixed camera'},
      action: {initial: 'dot left', transition: 'dot moves right', final: 'dot stops right', forbiddenOutcomes: ['text', 'duplication']},
      textPolicy: 'NO_READABLE_TEXT', exactCopyPolicy: 'INDEPENDENT_EDITABLE_LAYER_AFTER_VIDEO'};
    const frames = [first, last].map((p, i) => ({path: p, sha256: fileHash(p), referenceOnly: false, materialClass: 'ORIGINAL_NONFACTUAL',
      frameRole: ['first', 'last'][i], motherboardSha256: fileHash(first), review: {status: 'PASS', sha256: fileHash(p), designSha256: nodeInputHash(design),
        promptSha256: hash(Buffer.from(prompt)), reviewerId: 'fixture-independent', actualPixelsReviewed: true, readableTextFound: false, sameActorScene: true, cameraPathMatch: true}}));
    const input = {parameters: {motion: true, submitAuthorized: true, shotVersionSha256: 'c'.repeat(64), startFrameSha256: fileHash(first),
      startFrameReview: {status: 'PASS', sha256: fileHash(first)}, lastFrameSha256: fileHash(last), frameDesign: design,
      request: {provider: 'MiniMax', model: 'MiniMax-H3', mode: 'FIRST_LAST', prompt, duration: 4, resolution: '768P', ratio: 'adaptive', frames}}};
    const node = {id: 'fixture:ai-video', module: 'ai-video', input, inputSha256: nodeInputHash(input)};
    let beforeCheckpoint, current; const authorizeSubmission = async r => {
      if (r.phase === 'PREFLIGHT') {beforeCheckpoint = original(r.requestSha256);beforeCheckpoint.nodeInputSha256 = node.inputSha256;}
      current = clone(beforeCheckpoint);return current;
    };
    const f = make({config: {inspectSendAuthorization: async () => ({original: clone(beforeCheckpoint), current: clone(current)})}});
    const adapter = createMiniMaxVideoNodeAdapterV1({client: f.bridge, authorizeSubmission});
    const artifactRoot = path.join(root, 'adapter-artifacts'), checkpoints = [];
    const context = {artifactRoot, checkpoint: async p => {checkpoints.push(clone(p));node.progress = clone(p);}};
    const result = await adapter.execute(node, context);assert.equal(result.state, 'needs-review', JSON.stringify(result));
    assert.equal(result.providerReceipt.outputSha256, fileHash(video));assert.equal(result.productionAdmission, false);assert.equal(result.visualApproval, 'NOT_GRANTED');
    assert.equal(result.providerReceipt.firstFrameSha256, fileHash(first));assert.equal(result.providerReceipt.lastFrameSha256, fileHash(last));
    const n = clone(node);delete n.progress; const count = f.events.length;
    assert.equal((await adapter.execute(n, {...context, checkpoint: async () => {}})).cacheReused, true);assert.equal(f.events.length, count);
    const serialized = JSON.stringify({result, checkpoints});assert.ok(!serialized.includes(secret));assert.ok(!serialized.includes(signed));assert.ok(!serialized.includes('data:image'));
    fs.writeFileSync(path.join(evidence, 'adapter-fixture-receipt.json'), JSON.stringify(result.providerReceipt, null, 2) + '\n');
    // New independently bound fixture case, same adapter durability, one lost-response create.
    const lostNode = clone(node);delete lostNode.progress;lostNode.input.parameters.shotVersionSha256 = 'd'.repeat(64);lostNode.inputSha256 = nodeInputHash(lostNode.input);
    const lost = make({transport: {responseLost: true}, config: {inspectSendAuthorization: async () => ({original: clone(beforeCheckpoint), current: clone(current)})}});
    const lostAuthorization = async r => {
      if(r.phase === 'PREFLIGHT') {beforeCheckpoint = original(r.requestSha256);beforeCheckpoint.nodeInputSha256 = lostNode.inputSha256;}
      current = clone(beforeCheckpoint);return current;
    };
    const lostAdapter = createMiniMaxVideoNodeAdapterV1({client: lost.bridge, authorizeSubmission: lostAuthorization});
    const lostContext = {artifactRoot, checkpoint: async p => {lostNode.progress = clone(p);}};
    const failed = await lostAdapter.execute(lostNode, lostContext);assert.equal(failed.state, 'blocked');assert.equal(failed.reason, 'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED');
    const replay = clone(lostNode);delete replay.progress;const lostCount = lost.events.length;
    assert.equal((await lostAdapter.execute(replay, lostContext)).reason, 'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED');assert.equal(lost.events.length, lostCount);
    assert.equal(lost.events.filter(e => e.event === 'FIXTURE_EVIDENCE').length, 1);
    assert.equal(lostNode.progress.status, 'SUBMISSION_UNKNOWN');
  });
  await check('bridge lost-response invocation makes one actual method call and never retries HTTP', async () => {
    const f = make({transport: {responseLost: true}});
    await throws(() => f.bridge.create(payload(2), {requestSha256: requestSHA}), 'MINIMAX_BRIDGE_TRANSPORT_AMBIGUOUS');
    assert.equal(f.events.filter(e => e.event === 'FIXTURE_EVIDENCE').length, 1);
    assert.equal(f.events.findLast(e => e.event === 'ERROR').httpCalls, 1);
  });
  await check('durable evidence never includes bearer/signed URL/data URI and source stays exact', async () => {
    const serialized = JSON.stringify({events, rows});assert.ok(!serialized.includes(secret));assert.ok(!serialized.includes(signed));assert.ok(!serialized.includes('data:image'));
    assert.equal(fileHash(clientPath), MINIMAX_H3_EXISTING_CLIENT_SHA256_V1);
  });
  fs.writeFileSync(path.join(evidence, 'fixture-results.json'), JSON.stringify({contract: 'A1MiniMaxClientBridgeFixtures/v1', rows,
    passed: rows.length, actualIncumbentClientSHA: fileHash(clientPath), transport: 'REAL_PYTHON_H3CLIENT_HTTP_MOCK_BEFORE_CALL_SOCKET_DENIED',
    realProviderCalls: 0, realNetworkCalls: 0, realCredentialReads: 0, browserCalls: 0, productionWrites: 0,
    liveTLS: 'NOT_VERIFIED_EXISTING_CLT_LIBRESSL_WARNING', B3RegistryDAG: 'INTEGRATOR_OWNED_NOT_TESTED_BY_THIS_HELPER'}, null, 2) + '\n');
  fs.writeFileSync(path.join(evidence, 'redacted-protocol-events.json'), JSON.stringify(events, null, 2) + '\n');
  fs.copyFileSync(first, path.join(evidence, 'fixture-first.png'));fs.copyFileSync(last, path.join(evidence, 'fixture-last.png'));
  fs.copyFileSync(video, path.join(evidence, 'fixture-output.mp4'));
  console.log(JSON.stringify({passed: rows.length, realProviderCalls: 0, realNetworkCalls: 0}));
} finally {fs.rmSync(root, {recursive: true, force: true});}
