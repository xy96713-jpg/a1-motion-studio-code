import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {presentPersonContentRequestReasonV1} from '../apps/studio-next/src/lib/a1-person-content-request-presentation-v1.mjs';

const reason = 'CONTENT_OWNED_NATIVE_CLOSURE_UNPROVED';
const complete = {stage: 'COMPLETE', status: 'COMPLETE', reason,
  result: {candidateId: 'person-content-actual', playableUrl: '/api/system-line/research-task-media?actual'}};
let groups = 0;
function check(input, kind) {
  const original = JSON.stringify(input), view = presentPersonContentRequestReasonV1(input);
  assert.equal(view?.kind ?? null, kind);
  if (view) assert.equal(view.reason, input.reason);
  assert.equal(JSON.stringify(input), original, 'presentation must not mutate evidence');
  groups++;
}
check(complete, 'HISTORY');
for (const status of ['FAILED', 'WAITING_RESOURCE', 'WAITING_REVIEW', 'READY', 'RUNNING', 'UNKNOWN'])
  check({...complete, status}, 'CURRENT');
for (const stage of ['NATIVE_PLAN', 'NATIVE_ACCEPTED', 'EXPORT_VERIFIED', 'CANDIDATE_REGISTERED', 'UNKNOWN'])
  check({...complete, stage}, 'CURRENT');
for (const result of [null, {}, {candidateId: 'id'}, {playableUrl: '/url'},
  {candidateId: '', playableUrl: '/url'}, {candidateId: 'id', playableUrl: ' '}])
  check({...complete, result}, 'CURRENT');
for (const absent of [undefined, null, '', '   ']) check({...complete, reason: absent}, null);
assert.equal(presentPersonContentRequestReasonV1(null), null); groups++;
const file = 'work/person-card-content-layout-static-two-input-v1/content-packaging-requests-v1/ca853ef7e3e31d7639929eaf6a68efcd3c8c2b98dfac8485bc00245e6caf01f0/current.json';
const bytes = fs.readFileSync(file), hash = b => createHash('sha256').update(b).digest('hex');
check(JSON.parse(bytes), 'HISTORY');
assert.equal(hash(fs.readFileSync(file)), hash(bytes)); groups++;
console.log(JSON.stringify({status: 'PASS', groups, browsers: 0, httpRequests: 0,
  Build: 0, encodes: 0, requestWrites: 0}));
