// Offline checks for the automatic-subject wiring in prepareAssets (T02 P1): a chapter that names a subject the
// library does not have must declare what it is, the line writes the parts-plan task and pauses, and a rejected plan
// comes back with its reasons. The image-to-3D build itself is not run here (it generates pictures and Hunyuan shapes);
// it is exercised by the partset/model tests and documented as not run in this test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareAssets } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';

const schema = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/morph.schema.json', 'utf8'));
assert.ok(schema.properties.subjects, 'morph schema documents answer.subjects');
assert.ok([schema.properties.subjects.type].flat().includes('array'), 'subjects is a strict structured-output array');
assert.deepEqual(schema.properties.subjects.items.required, ['id', 'what'], 'each subject carries id + what');
assert.equal(schema.properties.subjects.items.properties.what.minLength, 8, 'what has a minimum length');
assert.ok(schema.required.includes('subjects'), 'subjects is in the required list (strict structured output)');
const prompt = fs.readFileSync('work/recipe-board-v1/prompts/morph.md', 'utf8');
assert.match(prompt, /subjects:\s*\[\s*\{\s*"id"/, 'the morph rules tell the agent to declare answer.subjects (array form)');
assert.match(prompt, /subject-<id>\.task\.json/, 'the rules name the parts-plan task');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-subject-'));
try {
  const cfg = { repoRoot: tmp, sourceRoot: process.cwd(), dataDir: path.join(tmp, 'data') };
  const project = path.join(cfg.dataDir, 'projects', 'proof');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'project.json'), '{}');
  const g = { id: 'B01', shots: [{ shotId: 'B01', at: 0, dur: 1 }], total: 1 };
  const code = "const sub = await kit.engine.subject(THREE, st, 'widget', { size: 2 });";
  const run = (answer) => prepareAssets(cfg, 'proof', g, { code, ...answer }, { log: () => {} });

  // 1. a new automatic subject with no description is refused with the exact field to add
  const missing = await run({});
  assert.match(missing.errors.join('\n'), /subject widget: not built yet and the chapter does not say what it is[\s\S]*"subjects"/, missing.errors.join(' | '));
  assert.equal(fs.existsSync(path.join(project, 'tasks', 'subject-widget.task.json')), false, 'no task is written before the description exists');

  // 2. a short description is the same refusal (the description must say what the object is)
  const short = await run({ subjects: [{ id: 'widget', what: 'short' }] });
  assert.match(short.errors.join('\n'), /subject widget: not built yet and the chapter does not say what it is/);

  // 3. with a description the line writes the parts-plan task and pauses the chapter
  const what = 'a small blue widget with a handle and two round buttons on its face';
  const waiting = await run({ subjects: [{ id: 'widget', what }] });
  assert.match(waiting.errors.join('\n'), /subject widget: waits for its parts plan: tasks\/subject-widget\.task\.json/, waiting.errors.join(' | '));
  const taskFile = path.join(project, 'tasks', 'subject-widget.task.json');
  assert.ok(fs.existsSync(taskFile), 'the parts-plan task is written');
  const task = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  assert.ok(task.rules && /prompts\/subject\.md/.test(task.rules), 'the task points at the subject rules');
  assert.equal(task.input.what, what, 'the task carries the description');
  assert.ok(task.schema && task.schema.properties && task.schema.properties.parts, 'the plan schema is the parts plan');

  // 4. an answered but invalid plan comes back with its reasons, not a silent build
  fs.writeFileSync(path.join(project, 'tasks', 'subject-widget.answer.json'), JSON.stringify({ label: 'widget', aliases: ['小蓝'], parts: [] }));
  const rejected = await run({ subjects: [{ id: 'widget', what }] });
  assert.match(rejected.errors.join('\n'), /subject widget: its parts plan was rejected:.*0 parts; 2 to 5/, rejected.errors.join(' | '));
  const check = JSON.parse(fs.readFileSync(path.join(project, 'tasks', 'subject-widget.check.json'), 'utf8'));
  assert.equal(check.ok, false, 'the rejected plan is recorded in the check file');
  assert.equal(fs.existsSync(path.join(project, 'tasks', 'subject-widget.answer.json')), true, 'the answer is kept for the next round');

  // 5. the built-in subjects (drill/H100/HDD) never enter this loop
  const builtin = await prepareAssets(cfg, 'proof', g, { code: "await kit.engine.subject(THREE, st, 'drill');" }, { log: () => {} });
  assert.doesNotMatch(builtin.errors.join('\n'), /subject drill:/);
  console.log('auto subject wiring: description required, parts-plan task written and waited, rejected plan reported, built-ins skipped');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
