#!/usr/bin/env node
// Exercises task regeneration against an isolated copy; never changes the source project or its approvals.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import * as GB from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
import * as SM from '../apps/studio-next/src/lib/recipe-board/shotmotion.mjs';
import { sessionBrief } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(repo, 'work/recipe-board-v1'), source = path.join(data, 'projects/banana-design');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-handoff-sandbox-')), targetData = path.join(tmp, 'work/recipe-board-v1');
const target = path.join(targetData, 'projects/banana-design'), taskDir = path.join(target, 'tasks');
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
try {
  fs.mkdirSync(taskDir, { recursive: true });
  fs.cpSync(path.join(data, 'routing'), path.join(targetData, 'routing'), { recursive: true });
  fs.cpSync(path.join(data, 'prompts'), path.join(targetData, 'prompts'), { recursive: true });
  fs.cpSync(path.join(source, 'shots'), path.join(target, 'shots'), { recursive: true });
  for (const name of ['plan.json', 'storyboard.json', 'brief.json', 'style.json']) if (fs.existsSync(path.join(source, name))) copy(path.join(source, name), path.join(target, name));
  for (const name of ['greybox.answer.json', 'filmdesign.answer.json', 'filmdesign.check.json']) if (fs.existsSync(path.join(source, 'tasks', name))) copy(path.join(source, 'tasks', name), path.join(taskDir, name));
  const project = JSON.parse(fs.readFileSync(path.join(source, 'project.json'), 'utf8')); delete project.nasOutput;
  project.testOnly = true; project.design = { ...(project.design || {}), approved: true, greybox: 'fixture-only' };
  fs.writeFileSync(path.join(target, 'project.json'), JSON.stringify(project));
  // Deliberately synthetic check only inside the test directory; this is not a project approval.
  fs.writeFileSync(path.join(taskDir, 'greybox.check.json'), JSON.stringify({ ok: true, answerHash: 'fixture-only' }));
  const cfg = { repoRoot: tmp, sourceRoot: repo, dataDir: targetData }, group = C.chapterGroups(cfg, 'banana-design').find((x) => x.id === 'B02');
  assert.ok(group, 'fixture chapter exists');
  const all = C.filmBeats(cfg, 'banana-design'), chapterBeats = all.filter((b) => group.shots.some((s) => s.shotId === b.beat));
  const rows = GB.greyboxFor(cfg, 'banana-design', chapterBeats.map((b) => b.beat));
  const i = all.findIndex((b) => b.beat === chapterBeats[0].beat), previous = i > 0 ? GB.greyboxFor(cfg, 'banana-design', [all[i - 1].beat])?.[0] : null;
  const md = '# Preserved director notes\n\nDo not replace this hand-edited guide.\n';
  fs.writeFileSync(path.join(taskDir, 'session-B02.md'), md);
  const prior = SM.buildChapterMotionContract({ project: 'banana-design', chapter: 'B02', greyboxRows: rows, prevOut: previous?.out || null, sessionMd: md });
  prior.motif = { id: 'retained-director-motif', layers: [] }; prior.delivery = { previewMp4: true };
  const priorModel = prior.shots[0]?.subject?.model || 'retained-model';
  if (prior.shots[0]) prior.shots[0].subject = { ...prior.shots[0].subject, model: priorModel };
  SM.writeChapterMotionContract(cfg, 'banana-design', 'B02', prior);
  const answerPath = path.join(taskDir, 'morph-B02.answer.json'); fs.writeFileSync(answerPath, '{"code":"retained answer"}\n');
  // The JSON fixture now binds referenced media bytes too; copy only this chapter's references.
  const refs = C.chapterInput(cfg, 'banana-design', group).inheritance.productionFiles;
  for (const ref of refs) {
    const relative = path.relative(tmp, ref.file);
    assert.ok(!relative.startsWith('..'), 'fixture references remain inside sandbox');
    copy(path.join(repo, relative), ref.file);
  }
  const guide = await sessionBrief(cfg, 'banana-design', 'B02');
  assert.equal(fs.readFileSync(path.join(taskDir, 'session-B02.md'), 'utf8'), md, 'existing hand-edited guide was not overwritten');
  assert.equal(fs.readFileSync(answerPath, 'utf8'), '{"code":"retained answer"}\n', 'existing answer was not overwritten');
  assert.match(path.basename(guide), /^session-B02\.generated-[a-f0-9]+\.md$/);
  const motion = SM.loadChapterMotionContract(cfg, 'banana-design', 'B02');
  assert.equal(motion.motif.id, 'retained-director-motif'); assert.equal(motion.delivery.previewMp4, true);
  if (motion.shots[0]) assert.equal(motion.shots[0].subject.model, priorModel);
  const task = JSON.parse(fs.readFileSync(path.join(taskDir, 'morph-B02.task.json'))), state = C.chapterState(cfg, 'banana-design').find((x) => x.g.id === 'B02');
  assert.equal(task.inputHash, state.hash, JSON.stringify(Object.keys(state.input).filter((k) => JSON.stringify(state.input[k]) !== JSON.stringify(task.input[k])).map((k) => [k, state.input[k], task.input[k]]))); assert.equal(task.input.sourceTaskInputHash, state.hash);
  assert.equal(task.input.motionContract.shots.length, motion.shots.length); assert.equal(task.input.handoffGuides.length, 2);
  assert.equal(state.taskFresh, true, 'the dispatched handoff is bound to current guide content');
  assert.deepEqual(C.chapterAdmissionErrors(cfg, 'banana-design', { input: state.input, task, answer: { sourceTaskInputHash: state.hash }, answerHash: 'candidate', requireHandoff: true, expectedHash: state.hash }), [], 'real dispatched task clears production input admission');
  const frameBytes = fs.readFileSync(refs[0].file);
  fs.appendFileSync(refs[0].file, 'changed');
  assert.notEqual(C.chapterState(cfg, 'banana-design').find((x) => x.g.id === 'B02').hash, state.hash);
  assert.match(C.chapterAdmissionErrors(cfg, 'banana-design', { input: state.input, task, answer: { sourceTaskInputHash: state.hash }, requireHandoff: true, expectedHash: state.hash }).join(), /production/);
  fs.writeFileSync(refs[0].file, frameBytes);
  const beforeGuideHash = state.hash;
  const guideBytes = fs.readFileSync(guide); fs.appendFileSync(guide, '\nchanged after dispatch\n');
  assert.notEqual(C.chapterState(cfg, 'banana-design').find((x) => x.g.id === 'B02').hash, beforeGuideHash, 'generated guide bytes must change the answer task identity');
  assert.equal(C.chapterState(cfg, 'banana-design').find((x) => x.g.id === 'B02').taskFresh, false, 'a modified guide makes the task stale');
  fs.writeFileSync(guide, guideBytes);
  if (motion.shots[0]) {
    motion.shots[0].camera.move = motion.shots[0].camera.move === 'pull' ? 'push' : 'pull';
    SM.writeChapterMotionContract(cfg, 'banana-design', 'B02', motion);
    const before = fs.readFileSync(SM.motionContractPath(cfg, 'banana-design', 'B02'));
    const taskBefore = fs.readFileSync(path.join(taskDir, 'morph-B02.task.json'));
    await assert.rejects(sessionBrief(cfg, 'banana-design', 'B02'), /conflicts with the current greybox/);
    assert.ok(fs.readFileSync(SM.motionContractPath(cfg, 'banana-design', 'B02')).equals(before), 'conflicting director work remains intact');
    assert.ok(fs.readFileSync(path.join(taskDir, 'morph-B02.task.json')).equals(taskBefore), 'a conflicting task is not dispatched');
  }
  console.log('isolated handoff: current task and motion contract bound; previous guide and answer preserved');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
