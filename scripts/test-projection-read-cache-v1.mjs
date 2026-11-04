import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {withProjectionReadCacheV1 as scope, reuseProjectionFileV1 as reuse} from '../apps/studio-next/src/lib/a1-projection-read-cache-v1.mjs';
import {prepareSourceNarrationContextV1} from '../apps/studio-next/src/lib/a1-source-narration-context-v1.mjs';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'projection-read-cache-')));
const file = path.join(root, 'evidence.json');
const good = '{"value":"safe"}', changed = '{"value":"evil"}';
const hash = value => createHash('sha256').update(value).digest('hex');
let loads = 0, checks = 0;
const reset = () => { fs.rmSync(file, {force: true}); fs.writeFileSync(file, good); loads = 0; };
const read = (sha = hash(good), bytes = false) => reuse(file, `${bytes ? 'buffer' : 'json'}:${sha}`, () => {
  loads++;
  const value = fs.readFileSync(file);
  assert.equal(hash(value), sha, 'original SHA validation must still run');
  return bytes ? value : JSON.parse(value);
});
try {
  reset(); read(); read(); assert.equal(loads, 2); checks++;
  reset(); scope(() => { const first = read(); assert.equal(read(), first); assert.equal(loads, 1);
    assert.throws(() => { first.value = 'changed'; }, TypeError); }); checks++;
  scope(() => read()); assert.equal(loads, 2, 'each request revalidates fresh bytes'); checks++;
  reset(); scope(() => { read(undefined, true).fill(0); assert.equal(read(undefined, true).toString(), good); }); checks++;
  reset(); scope(() => { read(); assert.throws(() => read('f'.repeat(64)), /SHA validation/); }); checks++;
  reset(); scope(() => { read(); scope(() => read()); }); assert.equal(loads, 1); checks++;
  reset(); await Promise.all([1, 2].map(() => scope(async () => { read(); await setImmediate(); read(); })));
  assert.equal(loads, 2, 'concurrent scopes cannot share cached results'); checks++;
  reset(); assert.throws(() => scope(() => { read(); fs.writeFileSync(file, changed); read(); }), /PROJECTION_INPUT_CHANGED/); checks++;
  reset(); assert.throws(() => scope(() => { read(); const stat = fs.statSync(file); fs.writeFileSync(file, changed);
    fs.utimesSync(file, stat.atime, stat.mtime); read(); }), /PROJECTION_INPUT_CHANGED/); checks++;
  reset(); assert.throws(() => scope(() => { read(); const replacement = path.join(root, 'replacement');
    fs.writeFileSync(replacement, good); fs.renameSync(replacement, file); read(); }), /PROJECTION_INPUT_CHANGED/); checks++;
  reset(); assert.throws(() => scope(() => { read(); fs.unlinkSync(file); read(); })); checks++;
  reset(); const target = path.join(root, 'target.json'); fs.writeFileSync(target, good);
  assert.throws(() => scope(() => { read(); fs.unlinkSync(file); fs.symlinkSync(target, file); read(); }), /PROJECTION_INPUT_CHANGED/); checks++;
  reset(); assert.throws(() => scope(() => { read(); fs.chmodSync(file, 0o400); read(); }), /PROJECTION_INPUT_CHANGED/);
  fs.chmodSync(file, 0o600); checks++;
  reset(); assert.throws(() => scope(() => { read(); fs.writeFileSync(file, changed); }), /PROJECTION_INPUT_CHANGED/);
  assert.throws(() => scope(() => read()), /SHA validation/); checks++;
  reset(); await assert.rejects(scope(async () => { read(); await setImmediate(); fs.writeFileSync(file, changed); }), /PROJECTION_INPUT_CHANGED/); checks++;
  reset(); let tries = 0; scope(() => {
    const load = () => { if (++tries === 1) throw Error('transient'); return {value: 'safe'}; };
    assert.throws(() => reuse(file, 'error', load), /transient/); assert.equal(reuse(file, 'error', load).value, 'safe');
  }); assert.equal(tries, 2, 'failures are not cached'); checks++;
  reset(); const large = path.join(root, 'large'); fs.writeFileSync(large, Buffer.alloc(8 * 1024 * 1024 + 1));
  let largeLoads = 0; scope(() => { for (let i = 0; i < 2; i++) reuse(large, 'size', () => { largeLoads++; return 1; }); });
  assert.equal(largeLoads, 2, 'oversize inputs retain uncached checks'); checks++;
  const task = path.join(root, 'work', 'fixture'); fs.mkdirSync(task, {recursive: true});
  const transcriptPath = path.join(task, 'transcript.json');
  const transcript = {kind: 'REFERENCE_LOCAL_ASR_TRANSCRIPT', status: 'ASR_DRAFT_READY_FOR_TEXT_REVIEW',
    sourceSha256: 'a'.repeat(64), sourceDurationSeconds: 2,
    segments: [{startMs: 0, endMs: 2000, text: 'source cue'}],
    boundary: {textNeedsHumanReview: true, productionAdmission: false}};
  fs.writeFileSync(transcriptPath, JSON.stringify(transcript));
  const plan = {source: {videoSha256: transcript.sourceSha256, fps: 30}};
  const args = {repoRoot: root, plan, shot: {id: 'S', sourceInterval: {startFrame: 0, endFrameExclusive: 60}},
    transcript: {path: 'work/fixture/transcript.json', sha256: hash(fs.readFileSync(transcriptPath))}};
  scope(() => {
    assert.deepEqual(prepareSourceNarrationContextV1(args), prepareSourceNarrationContextV1(args));
    plan.source.videoSha256 = 'b'.repeat(64);
    assert.throws(() => prepareSourceNarrationContextV1(args), /SOURCE_NARRATION_INPUT_BINDING/,
      'cached JSON never skips current source identity validation');
    plan.source.videoSha256 = transcript.sourceSha256;
  }); checks++;
  assert.throws(() => scope(() => {
    prepareSourceNarrationContextV1(args);
    transcript.segments[0].text = 123;
    fs.writeFileSync(transcriptPath, JSON.stringify(transcript));
    prepareSourceNarrationContextV1(args);
  }), /PROJECTION_INPUT_CHANGED/); checks++;
  assert.throws(() => scope(() => prepareSourceNarrationContextV1(args)), /SOURCE_NARRATION_BYTES_CHANGED/);
  args.transcript.sha256 = hash(fs.readFileSync(transcriptPath));
  assert.throws(() => scope(() => prepareSourceNarrationContextV1(args)), /SOURCE_NARRATION_SEGMENT_INVALID/);
  checks++;
  let overflowLoads = 0; scope(() => { for (let i = 0; i < 258; i++) {
    const item = path.join(root, 'item-' + i); fs.writeFileSync(item, 'x');
    for (let j = 0; j < 2; j++) reuse(item, 'budget', () => { overflowLoads++; return 'x'; });
  } }); assert.equal(overflowLoads, 260, 'entry budget falls back to verification, never a cached pass'); checks++;
  console.log(JSON.stringify({status: 'PASS', checks, requestIsolation: true, shaPolicyPreserved: true,
    changedDeletedReplacedSymlinkAndRestoredMtimeRejected: true, productionWrites: 0}));
} finally { fs.rmSync(root, {recursive: true, force: true}); }
