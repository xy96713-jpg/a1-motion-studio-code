import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
import {createMiniMaxVideoNodeAdapterV1, minimaxVideoNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-minimax-video-adapter-v1.mjs';
import {mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {verifyNodeArtifactManifest} from '../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs';

// All calls below use injected JS mocks and synthetic local files. No credentials, network, real provider, browser, or production state.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a1-minimax-fixture-')));
const evidence = path.resolve('work/minimax-video-adapter-v1'); fs.mkdirSync(evidence, {recursive: true});
const rows = [], hash = file => mediaSha256(fs.readFileSync(file)), clone = value => structuredClone(value);
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const check = async (name, fn) => { await fn(); rows.push({name, status: 'PASS'}); console.log('PASS ' + name); };
const blocked = (result, code) => { assert.equal(result.state, 'blocked'); assert.equal(result.reason, code); assert.equal(result.productionAdmission, false); };
const first = path.join(root, 'first.png'), last = path.join(root, 'last.png'), clip = path.join(root, 'fixture.mp4');
const budgetProof = path.join(root, 'mock-budget.json'), claimProof = path.join(root, 'mock-cap2.json');
let stamp = 100000, sequence = 0, successful;
try {
  const svg = x => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="256"><rect width="320" height="256" fill="#ccddee"/><rect x="30" y="95" width="260" height="20" fill="#333333"/><circle cx="${x}" cy="80" r="22" fill="#5533dd"/></svg>`);
  await sharp(svg(70)).png().toFile(first); await sharp(svg(250)).png().toFile(last);
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'color=c=blue:s=960x768:r=10:d=6',
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '1', '-filter_threads', '1', '-n', clip], {timeout: 30000});
  write(budgetProof, {fixture: true, notRealBalance: true}); write(claimProof, {fixture: true, notRealResourceReservation: true});
  const frame = (file, role) => ({path: file, sha256: hash(file), referenceOnly: false, materialClass: 'ORIGINAL_NONFACTUAL',
    frameRole: role, motherboardSha256: hash(first)});
  function nodeFor(mode = 'FIRST_LAST') {
    const design = {motherboard: {path: first, sha256: hash(first), referenceOnly: false, materialClass: 'ORIGINAL_NONFACTUAL'},
      designerId: 'fixture-designer', actorId: 'same-fixture-head', sceneId: 'synthetic-fixture-rail', camera: {mode: 'LOCKED', path: 'fixed camera, no zoom'},
      action: {initial: 'head at left', transition: 'one head moves along fixed rail', final: 'head at right, stopped', forbiddenOutcomes: ['duplication', 'new text']},
      textPolicy: 'NO_READABLE_TEXT', exactCopyPolicy: 'INDEPENDENT_EDITABLE_LAYER_AFTER_VIDEO'};
    const prompt = 'One fictional head moves along the same rail. Fixed camera, no readable text.';
    const frames = [frame(first, 'first'), ...(mode === 'FIRST_LAST' ? [frame(last, 'last')] : [])];
    for (const f of frames) f.review = {status: 'PASS', sha256: f.sha256, designSha256: nodeInputHash(design),
      promptSha256: mediaSha256(Buffer.from(prompt)), reviewerId: `fixture-independent-${f.frameRole}`, actualPixelsReviewed: true,
      readableTextFound: false, sameActorScene: true, cameraPathMatch: true};
    const parameters = {motion: true, submitAuthorized: true, shotVersionSha256: mediaSha256(Buffer.from('case-' + (++sequence))),
      startFrameSha256: hash(first), startFrameReview: {status: 'PASS', sha256: hash(first)},
      ...(mode === 'FIRST_LAST' ? {lastFrameSha256: hash(last)} : {}), frameDesign: design,
      request: {provider: 'MiniMax', model: 'MiniMax-H3', mode, prompt, duration: 6, resolution: '768P', ratio: 'adaptive', frames}};
    const input = {parameters}; return {id: 'fixture:ai-video', module: 'ai-video', input, inputSha256: nodeInputHash(input)};
  }
  const resign = n => { n.inputSha256 = nodeInputHash(n.input); return n; };
  function fixture({complete = true, createError, queryEdit, collectEdit, authorizationEdit, createHook, checkpointError, checkpointHook} = {}) {
    const calls = [], checkpoints = [], authorizationRequests = [], artifactRoot = path.join(root, `artifacts-${sequence}-${Math.random().toString(16).slice(2)}`);
    const authorize = async request => {
      authorizationRequests.push(clone(request));
      const value = {contract: 'A1ExistingCreditAuthorization/v1', provider: 'MiniMax', model: 'MiniMax-H3',
        requestSha256: request.requestSha256, nodeInputSha256: request.inputSha256, accountKind: 'MINIMAX_API',
        funding: 'EXISTING_CREDIT', balanceStatus: 'VERIFIED', automaticTopup: false, postpaid: false, maximumCalls: 1,
        availableCredit: 10, estimatedCost: 1, unit: 'FIXTURE_CREDIT_NOT_REAL', expiresAtMs: stamp + 100000,
        budgetEvidence: {path: budgetProof, sha256: hash(budgetProof)},
        reservation: {globalCap: 2, claimId: 'mock-only', owner: 'mock-controller', status: 'ACTIVE', expiresAtMs: stamp + 100000,
          evidence: {path: claimProof, sha256: hash(claimProof)}}};
      authorizationEdit?.(value, request); return value;
    };
    const client = {
      async create(payload) { calls.push({method: 'create', payload}); await createHook?.(); if (createError) throw Error(createError); return {task_id: '123456'}; },
      async query(id) { calls.push({method: 'query', id}); const task = {id, model: 'MiniMax-H3', status: complete ? 'succeeded' : 'running',
        duration: 6, resolution: '768P', usage: {input_image_count: calls.find(c => c.method === 'create')?.payload.content.length - 1 || 2, output_seconds: 6, total_seconds: 6, input_seconds: 0},
        content: {url: 'https://provider.example/signed?token=DO_NOT_SAVE_THIS'}}; queryEdit?.(task); return {task}; },
      async collect(task, context) { calls.push({method: 'collect', taskId: task.id}); const output = path.join(context.directory, 'output.mp4'); fs.copyFileSync(clip, output);
        const result = {path: output, sha256: hash(output)}; collectEdit?.(result); return result; },
    };
    const make = () => createMiniMaxVideoNodeAdapterV1({client, authorizeSubmission: authorize, now: () => stamp});
    const context = n => ({artifactRoot, checkpoint: async p => { checkpoints.push(clone(p)); await checkpointHook?.(p);
      if (checkpointError) throw Error('fixture checkpoint failure'); n.progress = clone(p); }});
    return {calls, checkpoints, authorizationRequests, artifactRoot, client, authorize, make, context};
  }
  await check('unconfigured trusted transport is blocked without touching a provider', async () => blocked(await minimaxVideoNodeAdapterV1.execute(nodeFor(), {}), 'MINIMAX_TRUSTED_CLIENT_REQUIRED'));
  await check('FIRST_LAST sends exact ordered endpoint bytes and collects genuine local fixture MP4', async () => {
    const n = nodeFor(), f = fixture(); const r = await f.make().execute(n, f.context(n)); assert.equal(r.state, 'needs-review', JSON.stringify(r));
    const payload = f.calls[0].payload; assert.equal(payload.model, 'MiniMax-H3'); assert.deepEqual(payload.content.map(c => c.role), [undefined, 'first_frame', 'last_frame']);
    assert.equal(mediaSha256(Buffer.from(payload.content[1].image_url.url.split(',')[1], 'base64')), hash(first));
    assert.equal(mediaSha256(Buffer.from(payload.content[2].image_url.url.split(',')[1], 'base64')), hash(last));
    const v = await verifyNodeArtifactManifest(r.artifactManifest, {artifactRoot: f.artifactRoot, node: n}); assert.equal(v.artifacts[0].metadata.height, 768);
    assert.equal(r.providerReceipt.outputSha256, hash(clip)); assert.equal(r.providerReceipt.lastFrameSha256, hash(last));
    assert.equal(r.providerReceipt.postCallBalance, 'NOT_QUERIED'); assert.equal(r.visualApproval, 'NOT_GRANTED');
    assert.deepEqual(f.authorizationRequests.map(x => x.phase), ['PREFLIGHT', 'CREATE_BOUNDARY']);
    assert.equal(f.authorizationRequests[1].reservation.claimId, 'mock-only');
    const persisted = JSON.stringify({r, checkpoints: f.checkpoints}); assert.ok(!persisted.includes('DO_NOT_SAVE_THIS')); assert.ok(!persisted.includes('data:image'));
    successful = {n, f, r}; write(path.join(evidence, 'fixture-success-receipt.json'), r.providerReceipt);
  });
  await check('same completed request rebuilt without in-memory progress performs zero additional external calls', async () => {
    const {n, f} = successful, fresh = clone(n); delete fresh.progress; const calls = f.calls.length;
    const r = await f.make().execute(fresh, f.context(fresh)); assert.equal(r.cacheReused, true); assert.equal(f.calls.length, calls);
  });
  await check('FIRST_ONLY emits one image, no last endpoint, and its own server image-count evidence', async () => {
    const n = nodeFor('FIRST_ONLY'), f = fixture(); const r = await f.make().execute(n, f.context(n)); assert.equal(r.state, 'needs-review', JSON.stringify(r));
    assert.equal(f.calls[0].payload.content.length, 2); assert.equal(r.providerReceipt.lastFrameSha256, null); assert.equal(r.providerReceipt.usage.input_image_count, 1);
  });
  await check('model/provider/multimodal extras/unsupported mode are rejected before authorization or calls', async () => {
    for (const edit of [r => r.provider = 'XYQ', r => delete r.model, r => r.model = 'MiniMax-H3-Max', r => r.mode = 'REFERENCE',
      r => r.resolution = '2K', r => r.duration = 15, r => r.reference_images = [first], r => r.endpoint = 'http://localhost']) {
      const n = nodeFor(), f = fixture(); edit(n.input.parameters.request); resign(n);
      assert.equal((await f.make().execute(n, f.context(n))).state, 'blocked'); assert.equal(f.calls.length, 0);
    }
  });
  await check('stale node input SHA cannot bind altered prompt', async () => {
    const n = nodeFor(), f = fixture(); n.input.parameters.request.prompt += 'changed'; blocked(await f.make().execute(n, f.context(n)), 'MINIMAX_NODE_INPUT_SHA_MISMATCH'); assert.equal(f.calls.length, 0);
  });
  await check('endpoint reviews independently bind asset, design, prompt, actual pixels, no text, identity and camera', async () => {
    for (const edit of [r => r.sha256 = 'a'.repeat(64), r => r.designSha256 = 'b'.repeat(64), r => r.promptSha256 = 'c'.repeat(64),
      r => r.status = 'PENDING', r => r.reviewerId = 'fixture-designer', r => r.actualPixelsReviewed = false,
      r => r.readableTextFound = true, r => r.sameActorScene = false, r => r.cameraPathMatch = false]) {
      const n = nodeFor(), f = fixture(); edit(n.input.parameters.request.frames[1].review); resign(n);
      blocked(await f.make().execute(n, f.context(n)), 'MINIMAX_ENDPOINT_INDEPENDENT_REVIEW_REQUIRED'); assert.equal(f.calls.length, 0);
    }
  });
  await check('role order, motherboard and explicit last SHA cannot drift', async () => {
    for (const edit of [p => p.request.frames.reverse(), p => p.request.frames[1].motherboardSha256 = 'c'.repeat(64), p => p.lastFrameSha256 = 'd'.repeat(64)]) {
      const n = nodeFor(), f = fixture(); edit(n.input.parameters); resign(n); assert.equal((await f.make().execute(n, f.context(n))).state, 'blocked'); assert.equal(f.calls.length, 0);
    }
  });
  await check('first-only cannot smuggle an extra last image', async () => {
    const n = nodeFor('FIRST_ONLY'), f = fixture(); n.input.parameters.request.frames.push(frame(last, 'last')); resign(n);
    blocked(await f.make().execute(n, f.context(n)), 'MINIMAX_ENDPOINT_COUNT_INVALID'); assert.equal(f.calls.length, 0);
  });
  await check('source-film/reference-only/factual/typed design input is blocked', async () => {
    for (const edit of [p => p.referenceOnlySha256 = [hash(last)], p => p.request.frames[1].referenceOnly = true,
      p => p.request.frames[1].materialClass = 'VERIFIED_PHOTO', p => p.frameDesign.textPolicy = 'LET_PROVIDER_RENDER_COPY']) {
      const n = nodeFor(), f = fixture(); edit(n.input.parameters); resign(n); assert.equal((await f.make().execute(n, f.context(n))).state, 'blocked'); assert.equal(f.calls.length, 0);
    }
  });
  await check('frame SHA tampering, direct and ancestor symlinks are rejected', async () => {
    const link = path.join(root, 'frame-link.png'); fs.symlinkSync(last, link);
    const directoryLink = path.join(root, 'directory-link'); fs.symlinkSync(root, directoryLink);
    for (const filename of [first, link, path.join(directoryLink, 'last.png')]) {
      const n = nodeFor(), f = fixture(); n.input.parameters.request.frames[1].path = filename; resign(n);
      assert.equal((await f.make().execute(n, f.context(n))).state, 'blocked'); assert.equal(f.calls.length, 0);
    }
  });
  await check('submit authorization, budget type, no auto-topup/postpaid, balance and cap2 are mandatory', async () => {
    for (const edit of [a => a.accountKind = 'HAILUO_MEMBER', a => a.balanceStatus = 'UNKNOWN', a => a.automaticTopup = true, a => a.postpaid = true,
      a => a.availableCredit = 0, a => a.estimatedCost = 0, a => a.maximumCalls = 2, a => a.requestSha256 = 'd'.repeat(64),
      a => a.expiresAtMs = stamp, a => a.reservation.globalCap = 3, a => a.reservation.status = 'RELEASED',
      a => a.reservation.expiresAtMs = stamp, a => a.budgetEvidence.sha256 = 'e'.repeat(64)]) {
      const n = nodeFor(), f = fixture({authorizationEdit: edit}); assert.equal((await f.make().execute(n, f.context(n))).state, 'blocked'); assert.equal(f.calls.length, 0); assert.equal(f.checkpoints.length, 0);
    }
    const n = nodeFor(), f = fixture(); n.input.parameters.submitAuthorized = false; resign(n);
    blocked(await f.make().execute(n, f.context(n)), 'REMOTE_SUBMIT_AUTHORIZATION_REQUIRED'); assert.equal(f.calls.length, 0);
  });
  await check('no injected authorization callback means no real submit', async () => {
    const n = nodeFor(), f = fixture(), a = createMiniMaxVideoNodeAdapterV1({client: f.client});
    blocked(await a.execute(n, f.context(n)), 'MINIMAX_EXISTING_CREDIT_AND_CAP2_PROOF_REQUIRED'); assert.equal(f.calls.length, 0);
  });
  await check('checkpoint delay past authorization or claim expiry makes zero creates and never blindly resubmits', async () => {
    for (const expiredField of ['authorization', 'claim']) {
      const startTime = stamp, expiry = startTime + 5, n = nodeFor();
      const f = fixture({authorizationEdit: (a, request) => {
        if (request.phase === 'PREFLIGHT') {
          if (expiredField === 'authorization') a.expiresAtMs = expiry;
          else a.reservation.expiresAtMs = expiry;
        }
        // Boundary callback can return a fresh-looking grant, but cannot silently renew the original expired permit.
      }, checkpointHook: async p => { if (p.status === 'SUBMITTING') stamp = expiry; }});
      blocked(await f.make().execute(n, f.context(n)), 'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED');
      assert.deepEqual(f.authorizationRequests.map(x => x.phase), ['PREFLIGHT', 'CREATE_BOUNDARY']);
      assert.equal(f.calls.length, 0);
      const fresh = clone(n); delete fresh.progress;
      blocked(await f.make().execute(fresh, f.context(fresh)), 'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED');
      assert.equal(f.calls.length, 0); assert.equal(f.authorizationRequests.length, 2);
    }
  });
  await check('create boundary rechecks current claim and credit after checkpoint, rejecting revoked or substituted proofs', async () => {
    for (const edit of [a => a.reservation.status = 'RELEASED', a => a.reservation.expiresAtMs = stamp,
      a => a.reservation.claimId = 'other-claim', a => a.reservation.owner = 'other-owner',
      a => a.expiresAtMs = stamp, a => a.availableCredit = 0]) {
      const n = nodeFor(), f = fixture({authorizationEdit: (a, request) => { if (request.phase === 'CREATE_BOUNDARY') edit(a); }});
      blocked(await f.make().execute(n, f.context(n)), 'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED');
      assert.equal(f.calls.length, 0); assert.equal(f.authorizationRequests.length, 2);
    }
  });
  await check('pending progress survives restart and throttles queries without resubmitting', async () => {
    const n = nodeFor(), f = fixture({complete: false}); blocked(await f.make().execute(n, f.context(n)), 'REMOTE_JOB_PENDING');
    const fresh = clone(n); delete fresh.progress; const calls = f.calls.length;
    blocked(await f.make().execute(fresh, f.context(fresh)), 'REMOTE_JOB_PENDING'); assert.equal(f.calls.length, calls);
    stamp += 10001; blocked(await f.make().execute(fresh, f.context(fresh)), 'REMOTE_JOB_PENDING');
    assert.equal(f.calls.filter(c => c.method === 'create').length, 1);
  });
  await check('ambiguous response never resubmits after restart and does not expose transport error secrets', async () => {
    const n = nodeFor(), f = fixture({createError: 'Bearer PRIVATE_KEY_THAT_MUST_NOT_BE_EXPOSED'});
    blocked(await f.make().execute(n, f.context(n)), 'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED');
    const fresh = clone(n); delete fresh.progress; const r = await f.make().execute(fresh, f.context(fresh));
    blocked(r, 'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED'); assert.equal(f.calls.length, 1); assert.ok(!JSON.stringify(r).includes('PRIVATE_KEY'));
  });
  await check('checkpoint failure before submit keeps a durable unresolved claim and zero creates', async () => {
    const n = nodeFor(), f = fixture({checkpointError: true}); assert.equal((await f.make().execute(n, f.context(n))).state, 'blocked'); assert.equal(f.calls.length, 0);
    const r = await f.make().execute(n, f.context(n)); blocked(r, 'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED'); assert.equal(f.calls.length, 0);
  });
  await check('concurrent duplicate fresh nodes cannot both submit', async () => {
    let release; const gate = new Promise(resolve => release = resolve); const n = nodeFor(), f = fixture({createHook: () => gate});
    const running = f.make().execute(n, f.context(n));
    while (!f.calls.length) await new Promise(resolve => setTimeout(resolve, 5));
    const fresh = clone(n); delete fresh.progress; blocked(await f.make().execute(fresh, f.context(fresh)), 'MINIMAX_JOB_BUSY_OR_RECOVERY_REQUIRED');
    release(); assert.equal((await running).state, 'needs-review'); assert.equal(f.calls.filter(c => c.method === 'create').length, 1);
  });
  await check('failed or cancelled job is retained and never automatically submitted or queried again', async () => {
    for (const status of ['failed', 'cancelled']) {
      const n = nodeFor(), f = fixture({queryEdit: t => t.status = status}); blocked(await f.make().execute(n, f.context(n)), 'REMOTE_JOB_FAILED_REVIEW_REQUIRED');
      const calls = f.calls.length, fresh = clone(n); delete fresh.progress; blocked(await f.make().execute(fresh, f.context(fresh)), 'REMOTE_JOB_FAILED_REVIEW_REQUIRED'); assert.equal(f.calls.length, calls);
    }
  });
  await check('mismatched provider task/model/image count/duration/resolution is never collected', async () => {
    for (const edit of [t => t.id = '999', t => t.model = 'MiniMax-Hailuo-02', t => t.usage.input_image_count = 1, t => t.duration = 10, t => t.resolution = '2K']) {
      const n = nodeFor(), f = fixture({queryEdit: edit}); assert.equal((await f.make().execute(n, f.context(n))).state, 'blocked'); assert.equal(f.calls.filter(c => c.method === 'collect').length, 0);
    }
  });
  await check('collection validates output directory and actual byte SHA', async () => {
    for (const edit of [o => o.path = clip, o => o.sha256 = 'e'.repeat(64)]) {
      const n = nodeFor(), f = fixture({collectEdit: edit}); assert.equal((await f.make().execute(n, f.context(n))).state, 'blocked'); assert.equal(f.calls.filter(c => c.method === 'create').length, 1);
    }
  });
  await check('wrong output geometry or duration is rejected without a second create', async () => {
    for (const geometry of [{size: '640x512', duration: '6'}, {size: '960x768', duration: '2'}]) {
      const wrongClip = path.join(root, `wrong-${geometry.size}-${geometry.duration}.mp4`);
      execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', `color=c=blue:s=${geometry.size}:r=10:d=${geometry.duration}`,
        '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '1', '-filter_threads', '1', '-n', wrongClip], {timeout: 30000});
      const n = nodeFor(), f = fixture({collectEdit: o => { fs.copyFileSync(wrongClip, o.path); o.sha256 = hash(o.path); }});
      blocked(await f.make().execute(n, f.context(n)), 'MINIMAX_OUTPUT_GEOMETRY_OR_DURATION_MISMATCH');
      const fresh = clone(n); delete fresh.progress; const calls = f.calls.length;
      blocked(await f.make().execute(fresh, f.context(fresh)), 'MINIMAX_COMPLETED_LOCAL_RECOVERY_REQUIRED');
      assert.equal(f.calls.length, calls); assert.equal(f.calls.filter(c => c.method === 'create').length, 1);
    }
  });
  await check('cached output tampering is rejected without any external recovery calls', async () => {
    const {n, f, r} = successful, file = path.join(f.artifactRoot, r.artifactManifest.artifacts[0].path), original = fs.readFileSync(file);
    fs.appendFileSync(file, 'tamper'); const calls = f.calls.length, fresh = clone(n); delete fresh.progress;
    assert.equal((await f.make().execute(fresh, f.context(fresh))).state, 'blocked'); assert.equal(f.calls.length, calls); fs.writeFileSync(file, original);
  });
  await check('cached receipt last-frame/request/output substitutions are rejected', async () => {
    const {n, f, r} = successful, file = path.join(f.artifactRoot, 'minimax-video-jobs', r.providerReceipt.requestSha256, 'result.json'), original = fs.readFileSync(file);
    for (const edit of [x => x.receipt.lastFrameSha256 = 'f'.repeat(64), x => x.receipt.outputSha256 = 'f'.repeat(64), x => x.receipt.promptSha256 = 'f'.repeat(64)]) {
      const saved = JSON.parse(original); edit(saved); write(file, saved); const calls = f.calls.length;
      blocked(await f.make().execute(n, f.context(n)), 'MINIMAX_CACHED_RESULT_BINDING_MISMATCH'); assert.equal(f.calls.length, calls);
    }
    fs.writeFileSync(file, original);
  });
  fs.copyFileSync(first, path.join(evidence, 'fixture-first.png')); fs.copyFileSync(last, path.join(evidence, 'fixture-last.png'));
  fs.copyFileSync(clip, path.join(evidence, 'fixture-output.mp4'));
  write(path.join(evidence, 'test-receipt.json'), {status: 'PASS_FIXTURES_ONLY', checks: rows, realProviderCalls: 0, realBalanceVerified: false,
    fixtureInputSha256: [hash(first), hash(last)], fixtureOutputSha256: hash(clip), browserCalls: 0, productionWrites: 0});
  console.log(`PASS ${rows.length} MiniMax fixture groups; real calls0, real balance NOT_VERIFIED, no registry/XYQ mutation`);
} catch (e) {
  write(path.join(evidence, 'test-receipt.json'), {status: 'FAIL', checks: rows, error: String(e), realProviderCalls: 0}); throw e;
} finally { fs.rmSync(root, {recursive: true, force: true}); }
