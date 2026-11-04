import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateBundleSmokePhaseV1, smokeOwnedClosureV1, validateSmokeWorkerCompletionV1, readSmokeWorkerResultV1} from './run-owned-remotion-bundle-smoke-once-v1.mjs';

const now = 1000;
const r = {actualOwnerThreadId: 'writer', coordinatorThreadId: 'bridge', parentDispatchThreadId: 'parent', wrapperPath: '/fixed/wrapper.mjs', wrapperSHA: 'sha', outputRoot: '/fixed/new-output'};
const packet = {resourceExecutionBinding: r};
const phase = {status: 'ACTIVE', executionAuthorized: true, ownerThreadId: 'writer', controllerThreadId: 'bridge', uniqueActualDispatchThreadId: 'parent',
  globalCap: 2, reservedSlots: 1, wrapperPath: r.wrapperPath, wrapperSHA: r.wrapperSHA, outputRoot: r.outputRoot,
  maximumExecutionMs: 60000, budget: {phaseMaximumMs: 60000, workMaximumMs: 50000, closureReserveMs: 10000, remainingBeforePhaseMs: 60000},
  maximumStaticBundles: 2, maximumOutputBytes: 20 * 1024 ** 2, maximumBrowserLaunches: 0, maximumStillFrames: 0, newEncodes: 0, sourceVideoDecode: 0, maximumConditionalClaimCount: 1,
  providers: false, externalNetwork: false, newCapture: false, newSourceFetch: false, audioOperations: false, automaticRetry: false, productionAdmission: false,
  reservationStartUTC: new Date(0).toISOString(), reservationEndUTC: new Date(100000).toISOString()};
test('fixed signed identity/cap/resource/window accepted without a process launch', () => assert.equal(validateBundleSmokePhaseV1(phase, packet, now), true));
test('released phase, different owner/wrapper/output, browser and retry reject', () => {
  for (const delta of [{status: 'RELEASED'}, {ownerThreadId: 'other'}, {wrapperSHA: 'other'}, {outputRoot: '/other'}, {maximumBrowserLaunches: 1}, {automaticRetry: true}, {maximumOutputBytes: 21 * 1024 ** 2}]) assert.throws(() => validateBundleSmokePhaseV1({...phase, ...delta}, packet, now));
});
test('closure reserve cannot be borrowed; insufficient original ledger/window rejects', () => {
  for (const budget of [{...phase.budget, closureReserveMs: 0}, {...phase.budget, remainingBeforePhaseMs: 59999}, {...phase.budget, workMaximumMs: 60000}]) assert.throws(() => validateBundleSmokePhaseV1({...phase, budget}, packet, now));
  assert.equal(validateBundleSmokePhaseV1({...phase, reservationEndUTC: new Date(60000).toISOString()}, packet, 1000), true);
  assert.throws(() => validateBundleSmokePhaseV1(phase, packet, 87000), /SIGNED_WINDOW/u);
});
const complete = {status: 'PASS_REAL_BUNDLE_PUBLIC_BYTES_ONLY', realBundles: 2, realBrowser: 0, realEncoder: 0, renderFrames: 0, largeMediaCopy: 0,
  automaticRetry: false, productionAdmission: false, maximumOutputBytes: 20 * 1024 ** 2, totalNewBytes: 2100,
  cases: ['empty-public', 'exact-tiny-public'].map((id, i) => ({id, measured: {bytes: 1000, files: [{name: 'bundle.js'}]}, totalNewBytes: 1000,
    compact: true, sourceMaps: false, productionAdmission: false, publicFiles: i ? ['tiny.png'] : [], publicBytes: i ? 68 : 0}))};
test('completion requires two measured cases within total cap and zero browser/encoder', () => {
  assert.equal(validateSmokeWorkerCompletionV1(complete), true);
  for (const delta of [{realBundles: 1}, {cases: complete.cases.slice(0, 1)}, {cases: [...complete.cases].reverse()}, {realBrowser: 1}, {realEncoder: 1},
    {totalNewBytes: 20 * 1024 ** 2 + 1}, {totalNewBytes: 1999}, {cases: [complete.cases[0], {...complete.cases[1], measured: null}]}]) assert.throws(() => validateSmokeWorkerCompletionV1({...complete, ...delta}));
});
test('partial or absent worker JSON returns failure so closure receipt can still be written', () => {
  assert.equal(readSmokeWorkerResultV1(() => JSON.stringify(complete)).worker.realBundles, 2);
  for (const readBytes of [() => '{"status":', () => { throw new Error('ENOENT'); }]) {
    const result = readSmokeWorkerResultV1(readBytes); assert.equal(result.worker, null); assert.equal(result.failure.stage, 'WORKER_RESULT');
  }
});
const root = {pid: 100, parentPid: 50, pgid: 100, startIdentity: 'fixed-start', command: 'node'};
const unrelated = {pid: 500, parentPid: 1, pgid: 500, startIdentity: 'other-start', command: 'ps'};
test('closed observed group PASS, surviving known/unknown member and empty snapshot refuse closure', () => {
  const base = {rootPid: 100, known: [root], snapshots: 1, ownershipError: null};
  assert.equal(smokeOwnedClosureV1({...base, rows: [unrelated]}).ownedProcessesClosed, true);
  assert.equal(smokeOwnedClosureV1({...base, rows: [root, unrelated]}).ownedProcessesClosed, false);
  assert.equal(smokeOwnedClosureV1({...base, rows: [{...root, pid: 101}, unrelated]}).ownedProcessesClosed, false);
  assert.equal(smokeOwnedClosureV1({...base, rows: []}).ownedProcessesClosed, false);
  assert.equal(smokeOwnedClosureV1({...base, ownershipError: 'unobserved', rows: [unrelated]}).ownedProcessesClosed, false);
});
