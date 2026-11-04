import assert from 'node:assert/strict';
import {runOwnedBatchCloseoutV1} from '../apps/studio-next/src/lib/a1-owned-batch-closeout-v1.mjs';
const identity = {attemptId: 'unseen-batch-1', ownerId: 'producer', coordinatorId: 'independent-bridge', inputSha256: 'a'.repeat(64), phaseSha256: 'b'.repeat(64)};
const log = [], journal = new Map(); let clock = 0, debits = 0;
const options = {identity, now: () => clock, execute: async () => {log.push('execute'); clock = 10; return {image: 'candidate'};},
  verifyClosure: async () => {log.push('verify'); return {status: 'CLOSED', verifierId: identity.coordinatorId, attemptId: identity.attemptId,
    inputSha256: identity.inputSha256, rootPID: 123, remainingPIDs: [], unknownPIDs: [], evidenceSha256: 'c'.repeat(64)};},
  settleOnce: async request => {log.push('settle-release'); if (journal.has(request.onceKey)) return {...journal.get(request.onceKey), status: 'ALREADY_SETTLED'};
    debits++; const receipt = {status: 'SETTLED', onceKey: request.onceKey, slotReleased: true, debitMs: request.debitMs}; journal.set(request.onceKey, receipt); return receipt;},
  publish: async () => {log.push('publish'); return {registered: true};}};
const result = await runOwnedBatchCloseoutV1(options);
assert.deepEqual(log, ['execute', 'verify', 'settle-release', 'publish']); assert.equal(result.closeoutElapsedMs, 0);
assert.equal(result.automaticRetry, false); assert.equal(debits, 1);
clock = 0;
const cached = await runOwnedBatchCloseoutV1({...options, readCompletedAttempt: async () => result,
  execute: async () => {throw Error('must not repeat execution');}});
assert.equal(cached.reusedCompletedAttempt, true); assert.equal(debits, 1, 'completed attempt reuses execution and resource debit');
let published = false;
await assert.rejects(runOwnedBatchCloseoutV1({...options, verifyClosure: async () => ({status: 'UNKNOWN'}), publish: async () => {published = true;}}), /closure-unproven/);
assert.equal(published, false);
await assert.rejects(runOwnedBatchCloseoutV1({...options, identity: {...identity, coordinatorId: identity.ownerId}}), /input-invalid/);
clock = 0;
const failed = await runOwnedBatchCloseoutV1({...options, identity: {...identity, attemptId: 'failed-batch'},
  execute: async () => {clock = 12; throw new Error('ORIGINAL_WORKER_FAILURE');},
  verifyClosure: async ({identity: i}) => ({status: 'CLOSED', verifierId: i.coordinatorId, attemptId: i.attemptId, inputSha256: i.inputSha256,
    rootPID: 123, remainingPIDs: [], unknownPIDs: [], evidenceSha256: 'c'.repeat(64)}), publish: async () => {throw Error('must not publish');}});
assert.equal(failed.status, 'FAILED_CLOSED_AND_SETTLED'); assert.equal(failed.error, 'ORIGINAL_WORKER_FAILURE');
console.log(JSON.stringify({status: 'PASS', checks: ['one-round-close-settle-release-publish', 'idempotent-debit', 'independent-closure-required',
  'unknown-processes-block-delivery', 'original-error-preserved', 'no-automatic-retry'], actualResourceWrites: 0}));
