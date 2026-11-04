import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChapterMotionContract, motionContractUneatenErrors } from '../apps/studio-next/src/lib/recipe-board/shotmotion.mjs';
import { reconcileMotionContract } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stepFilmDesign, filmDesignErrors } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';

const intent = { route: 'custom', question: 'Which quantity differs?', start: 'Two equal columns stand apart', change: 'The right column loses one unit', end: 'The unequal columns hold for reading', handoff: 'Cut to a new question; no spatial carry', reason: 'Subtraction explains the difference', layers: { evidence: 'none', art: 'none', type: 'column labels' } };
const motionRules = { timing: 'Action settles before the comparison label', continuity: 'Keep unit size across comparisons; cuts may reset space' };
const filmDesign = { motionRules, beats: [{ beat: 'B01', directorIntent: intent }] };
const greyboxRows = [{ beat: 'B01', camera: { move: 'static' }, blocks: [], type: [], out: 'cut' }];
const build = () => buildChapterMotionContract({ chapter: 'B01', greyboxRows, filmDesign });

test('new task opts in persistently while an existing legacy task is not upgraded', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-design-'));
  const cfg = { repoRoot: root, dataDir: path.join(root, 'work/recipe-board-v1') };
  const tasks = path.join(cfg.dataDir, 'projects/demo/tasks');
  fs.mkdirSync(tasks, { recursive: true });
  fs.cpSync(new URL('../work/recipe-board-v1/routing/', import.meta.url), path.join(cfg.dataDir, 'routing'), { recursive: true });
  fs.writeFileSync(path.join(tasks, '../project.json'), JSON.stringify({ id: 'demo', agents: { default: 'manual' } }));
  try {
    await stepFilmDesign(cfg, 'demo', [{ beat: 'B01', text: 'a comparison', dur: 5 }], { log: () => {} });
    const file = path.join(tasks, 'filmdesign.task.json');
    assert.equal(JSON.parse(fs.readFileSync(file)).input.requireMotionDesign, true);
    await stepFilmDesign(cfg, 'demo', [{ beat: 'B01', dur: 5 }], { log: () => {} });
    assert.equal(JSON.parse(fs.readFileSync(file)).input.requireMotionDesign, true);
    fs.writeFileSync(file, JSON.stringify({ input: {} }));
    await stepFilmDesign(cfg, 'demo', [{ beat: 'B01', dur: 5 }], { log: () => {} });
    assert.equal(JSON.parse(fs.readFileSync(file)).input.requireMotionDesign, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('production chapter consumer checks the inherited design and implementation without rendering', async () => {
  const C = await import('../apps/studio-next/src/lib/recipe-board/chapter.mjs');
  const A = await import('../apps/studio-next/src/lib/recipe-board/agenttask.mjs');
  const { createHash } = await import('node:crypto');
  const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-consumer-'));
  const cfg = { repoRoot: tmp, sourceRoot: path.resolve(import.meta.dirname, '..'), dataDir: path.join(tmp, 'work/recipe-board-v1') };
  const root = path.join(cfg.dataDir, 'projects/test');
  const put = (f, v) => { const file = path.join(root, f); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof v === 'string' ? v : JSON.stringify(v)); };
  try {
    put('project.json', { id: 'test', gateSet: 'design', process: 'six-stage', design: { approved: true, greybox: 'fixture' }, profile: 'paperclip', agents: { default: 'manual' } });
    put('shots/B01.json', { shotId: 'B01', recipe: 'morph-chapter', motion: { duration: 5 } });
    put('plan.json', { beats: [{ id: 'B01', text: 'compare units' }] });
    put('tasks/greybox.check.json', { ok: true, answerHash: 'fixture' });
    put('tasks/greybox.answer.json', { beats: greyboxRows });
    put('tasks/filmdesign.answer.json', filmDesign);
    put('tasks/filmdesign.check.json', { ok: true, answerHash: hash(JSON.stringify(filmDesign)) });
    put('tasks/session-B01.motion.json', { ...build(), project: 'test' });
    fs.writeFileSync(path.join(tmp, 'guide.md'), 'Sandbox chapter handoff');
    C.refreshChapterTask(cfg, 'test', 'B01', { handoffGuides: ['guide.md'] });
    const task = JSON.parse(fs.readFileSync(path.join(root, 'tasks/morph-B01.task.json')));
    assert.deepEqual(task.input.motionContract.motionRules, motionRules);
    assert.deepEqual(task.input.motionContract.shots[0].directorIntent, intent);
    const code = 'const labelDelay=3; const start=0; const change=1; const end=2; const handoff="cut"; const settle=0.7;';
    const candidate = path.join(root, 'candidate.json');
    const run = async (motionImplementation) => {
      put('candidate.json', { sourceTaskInputHash: task.inputHash, code, motionImplementation });
      A.submitTaskAnswer(cfg, 'test', 'morph-B01', candidate, { env: { CODEX_THREAD_ID: 'motion-consumer-test' } });
      await C.stepChapters(cfg, 'test', { review: false, renderDrafts: false, rounds: 1, log: () => {} });
      return JSON.parse(fs.readFileSync(path.join(root, 'tasks/morph-B01.check.json')));
    };
    const bad = await run(null);
    assert.ok(bad.errors.some((e) => /implementation.start/.test(e)));
    const good = await run([{ shotId: 'B01', start: 'const start=0;', change: 'const change=1;', end: 'const end=2;', handoff: 'const handoff="cut";', motionRules: 'const settle=0.7;' }]);
    assert.ok(good.errors.length, 'deliberately incomplete module must not render or be accepted');
    assert.ok(!good.errors.some((e) => /implementation|directorIntent.inheritance|motionRules.inheritance/.test(e)));
    assert.equal(fs.existsSync(path.join(root, 'chapters/B01.mjs')), false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('consumer rejects stale or stripped inherited rules against the accepted design', () => {
  const contract = build(); contract.motionRules.timing = 'Different chapter rule';
  assert.ok(motionContractUneatenErrors('const labelDelay=3;', contract, { filmDesign }).some((e) => /motionRules.*inheritance/.test(e)));
  delete contract.motionRules;
  assert.ok(motionContractUneatenErrors('const labelDelay=3;', contract, { filmDesign }).some((e) => /motionRules.*inheritance/.test(e)));
});

test('new design requires complete state/action/handoff and shared rules; legacy remains optional', () => {
  const errors = (answer, required = false) => filmDesignErrors(answer, ['B01'], null, null, null, { requireMotionDesign: required }).filter((e) => /directorIntent|motionRules/.test(e));
  assert.deepEqual(errors(filmDesign, true), []);
  assert.ok(errors({ beats: [{ beat: 'B01' }] }, true).some((e) => /motionRules/.test(e)));
  for (const field of ['start', 'change', 'end', 'handoff']) {
    const bad = structuredClone(filmDesign); delete bad.beats[0].directorIntent[field];
    assert.ok(errors(bad).some((e) => e.includes(field)), field);
  }
  assert.deepEqual(errors({ beats: [{ beat: 'B01' }] }), []);
  assert.deepEqual(errors({ motionRules: null, beats: [{ beat: 'B01', directorIntent: { ...intent, start: null, end: null, handoff: null } }] }), []);
  assert.doesNotThrow(() => errors({ beats: [{ beat: 'B01', directorIntent: 'invalid' }] }));
});

test('chapter consumer requires shot-keyed implementation anchors, not a comment or a different shot receipt', () => {
  const contract = build();
  const code = 'const labelDelay=3; const start=0; const change=1; const end=2; const handoff="cut"; const settle=0.7;';
  const motionImplementation = { B01: { start: 'const start=0;', change: 'const change=1;', end: 'const end=2;', handoff: 'const handoff="cut";', motionRules: 'const settle=0.7;' } };
  const check = (source, receipts) => motionContractUneatenErrors(source, contract, { motionImplementation: receipts ? Object.entries(receipts).map(([shotId, fields]) => ({ shotId, ...fields })) : null }).filter((e) => /implementation/.test(e));
  assert.ok(check(code).length);
  assert.deepEqual(check(code, motionImplementation), []);
  assert.ok(check(code, { B02: motionImplementation.B01 }).length);
  const bad = structuredClone(motionImplementation); bad.B01.end = 'const nonexistent=9;';
  assert.ok(check(code + '\n// const nonexistent=9;', bad).some((e) => /end/.test(e)));
  assert.ok(check(code, { B01: {} }).length);
  assert.deepEqual(motionContractUneatenErrors(code, buildChapterMotionContract({ chapter: 'B01', greyboxRows })), []);
});

test('handoff refuses conflicting shared rules or states instead of silently overwriting director work', () => {
  const old = build(), fresh = build();
  assert.deepEqual(reconcileMotionContract(old, fresh).errors, []);
  fresh.motionRules.timing = 'A different timing rule';
  assert.ok(reconcileMotionContract(old, fresh).errors.some((e) => /motionRules/.test(e)));
  fresh.shots[0].directorIntent.end = 'A conflicting end composition';
  assert.ok(reconcileMotionContract(old, fresh).errors.some((e) => /directorIntent/.test(e)));
});

test('accepted film intent and common rules reach the existing motion contract without inferred semantics', () => {
  const contract = build();
  assert.deepEqual(contract.motionRules, motionRules);
  assert.deepEqual(contract.shots[0].directorIntent, intent);
  const legacy = buildChapterMotionContract({ chapter: 'B01', greyboxRows });
  assert.equal(legacy.motionRules, undefined);
  assert.equal(legacy.shots[0].directorIntent, undefined);
});
