import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {filmDesignTask, acceptedFilmDesign} from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import {greyboxInput, greyboxReviewPassed, eventReviewEvidence} from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
import {sessionBrief} from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';
import {chapterGroups} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';

const repo = path.resolve(import.meta.dirname, '..'), data = path.join(repo, 'work/recipe-board-v1');
const scratch = path.join(os.homedir(), '.hermes/cache/scratch');
const intent = {
  route: 'custom', question: '觀眾辨認什麼字', start: '完整字組在畫面', change: '保持字組供閱讀',
  end: '完整字組在畫面', handoff: '停穩明確硬切下一拍', reason: '技術測試字形測量',
  layers: {evidence: 'none', art: 'none', type: 'code'},
  assets: [{id: 'type', use: 'type', source: 'code', file: 'scene.mjs', operation: 'hold', operability: 'code'}],
  eventTimes: {start: 0.1, key: 5.8, end: 7.7},
};
function fixture(t) {
  fs.mkdirSync(scratch, {recursive: true});
  const root = fs.mkdtempSync(path.join(scratch, 'director-scope-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const dataDir = path.join(root, 'work/recipe-board-v1'), id = 'scope-timing-fixture';
  const dest = path.join(dataDir, 'projects', id), tasks = path.join(dest, 'tasks');
  fs.mkdirSync(tasks, {recursive: true});
  // Same normative-library copy pattern as test-recipe-board.mjs sandbox().
  // No production project, mutable task, output or symlink enters this fixture.
  for (const dir of ['recipes', 'themes', 'prompts', 'routing', 'worlds'])
    fs.cpSync(path.join(data, dir), path.join(dataDir, dir), {recursive: true});
  for (const file of ['HOUSE.md', 'TYPE.md', 'entities.json', 'CAMERA.md'])
    fs.copyFileSync(path.join(data, file), path.join(dataDir, file));
  for (const file of ['AGENTS.md', 'SOP.md', '.codex/skills/recipe-board-director/SKILL.md']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.copyFileSync(path.join(repo, file), path.join(root, file));
  }
  const put = (file, value) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, JSON.stringify(value));
  };
  const write = (file, value) => put(path.join(tasks, file), value);
  const read = file => JSON.parse(fs.readFileSync(path.join(tasks, file)));
  // Synthetic design approval only in this fixture; no user gate is changed.
  put(path.join(dest, 'project.json'), {id, testOnly: true, gateSet: 'design', process: 'six-stage',
    agents: {default: 'manual'}, design: {approved: true, greybox: 'fixture-only'}});
  put(path.join(dest, 'plan.json'), {beats: [{id: 'B11', text: '完整字組供閱讀'}]});
  put(path.join(dest, 'shots/B11.json'), {shotId: 'B11', recipe: 'morph-chapter', motion: {duration: 8}});
  put(path.join(dest, 'storyboard.json'), {shots: [{beat: 'B11', card: 'morph-chapter', reads: [], evidence: []}]});
  const beat = {beat: 'B11', at: 0, dur: 8, medium: 'type', screen: 'clean', palette: 'noir'};
  write('filmdesign.task.json', {input: {beats: [beat], requireMotionDesign: false}});
  const accept = answer => {
    write('filmdesign.answer.json', answer);
    write('filmdesign.check.json', {ok: true, answerHash: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(tasks, 'filmdesign.answer.json'))).digest('hex').slice(0, 16)});
  };
  accept({beats: [beat]}); // Deliberately no intent, regardless of any live film's state.
  write('greybox.answer.json', {beats: [{...beat, blocks: [], type: []}]});
  write('greybox.check.json', {ok: true, answerHash: 'fixture-only'});
  write('greybox-review.gate.json', {passedAt: '2020-01-01T00:00:00.000Z'});
  return {root, cfg: {repoRoot: root, sourceRoot: root, dataDir}, id, tasks, read, write, accept};
}

test('director scope survives answer removal and refresh; real sessionBrief rejects missing intent', async t => {
  const {cfg, id, tasks, read, write} = fixture(t);
  assert.equal(greyboxReviewPassed(cfg, id), true, 'unrelated historical approval starts passed');
  const original = fs.readFileSync(path.join(tasks, 'filmdesign.answer.json'));
  const a = read('filmdesign.answer.json'); a.beats[0].activeRevision = true;
  write('filmdesign.answer.json', a);
  assert.equal(greyboxReviewPassed(cfg, id), false);
  const task = read('filmdesign.task.json'); task.input.beats[0].activeRevision = true;
  write('filmdesign.task.json', task);
  fs.writeFileSync(path.join(tasks, 'filmdesign.answer.json'), original);
  assert.equal(greyboxReviewPassed(cfg, id), false, 'deleting answer flag must not restore historical passedAt');
  assert.equal(acceptedFilmDesign(cfg, id).beats[0].activeRevision, true, 'accepted design carries task scope to sessionBrief consumers');
  assert.equal((await greyboxInput(cfg, id))[0].activeRevision, true, 'greybox input inherits task scope');
  const group = chapterGroups(cfg, id).find(g => g.shots.some(s => s.shotId === 'B11'));
  assert(group, 'real B11 chapter exists');
  await assert.rejects(() => sessionBrief(cfg, id, group.id), /B11.*directorIntent.*required/, 'sessionBrief must reject missing scoped intent');
  const regenerated = filmDesignTask(cfg, id, task.input.beats.map(({activeRevision, ...b}) => b),
    {design: read('filmdesign.answer.json'), requireMotionDesign: false});
  assert.equal(regenerated.input.beats[0].activeRevision, true, 'task refresh must preserve pinned scope');
  delete task.input.beats[0].activeRevision; write('filmdesign.task.json', task);
  assert.equal(greyboxReviewPassed(cfg, id), true, 'unrelated historical approval preserved');
});

test('normal scoped intent reaches real sessionBrief and is inherited by its dispatched motion task', async t => {
  const {cfg, id, tasks, read, write, accept} = fixture(t);
  const task = read('filmdesign.task.json'); task.input.beats[0].activeRevision = true;
  write('filmdesign.task.json', task);
  const answer = read('filmdesign.answer.json'); answer.beats[0].directorIntent = structuredClone(intent);
  accept(answer);
  const guide = await sessionBrief(cfg, id, 'B11');
  assert.ok(fs.existsSync(guide), 'valid scoped intent reaches actual handoff, not an unrelated missing-source error');
  const dispatched = read('morph-B11.task.json');
  assert.deepEqual(dispatched.input.motionContract.shots[0].directorIntent, intent);
  assert.equal(greyboxReviewPassed(cfg, id), false, 'valid intent alone cannot restore an unbound historical review');
  delete answer.beats[0].directorIntent; accept(answer);
  const priorTask = fs.readFileSync(path.join(tasks, 'morph-B11.task.json'));
  await assert.rejects(() => sessionBrief(cfg, id, 'B11'), /B11.*directorIntent.*required/);
  assert.ok(fs.readFileSync(path.join(tasks, 'morph-B11.task.json')).equals(priorTask), 'rejected intent removal must not dispatch a new task');
});

test('event evidence uses explicit local times, invalidates stale frames and refuses invented samples', t => {
  fs.mkdirSync(scratch, {recursive: true});
  const root = fs.mkdtempSync(path.join(scratch, 'director-timing-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const b = {beat: 'B11', at: 10, dur: 8, activeRevision: true, directorIntent: {eventTimes: {start: 0.1, key: 5.8, end: 7.7}}};
  let ev = eventReviewEvidence(root, [b], 'version', {extract: false})[0];
  assert.deepEqual(ev.frames.map(f => f.time), [10.1, 15.8, 17.7], 'director local seconds, not fixed percent samples');
  const binding = ev.binding, oldKeyFile = ev.frames[1].file;
  fs.writeFileSync(oldKeyFile, 'stale frame fixture');
  b.directorIntent.eventTimes.key = 6;
  const moved = eventReviewEvidence(root, [b], 'version', {extract: false})[0];
  assert.notEqual(moved.frames[1].file, oldKeyFile, 'changed semantic time cannot relabel cached frame');
  assert.equal(moved.frames[1].hash, null);
  assert.notEqual(moved.binding, binding, 'timing changes invalidate binding');
  b.directorIntent.eventTimes = {start: 2, key: 2, end: 2};
  assert.deepEqual(eventReviewEvidence(root, [b], 'version', {extract: false})[0].frames.map(f => f.time), [12, 12, 12], 'legitimate hold timestamps allowed');
  for (const times of [undefined, {start: 0, key: 9, end: 7}, {start: 0, key: 7, end: 6}, {start: -1, key: 2, end: 7}, {start: 0, key: '2', end: 7}, {start: 0, key: 2, end: 8}]) {
    b.directorIntent.eventTimes = times;
    ev = eventReviewEvidence(root, [b], 'version', {extract: false})[0];
    assert.equal(ev.status, 'unknown'); assert.equal(ev.frames.length, 0, 'no invented semantic key without valid times');
  }
});
