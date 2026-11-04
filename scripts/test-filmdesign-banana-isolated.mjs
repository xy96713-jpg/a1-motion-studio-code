import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stepFilmLook } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const data = path.join(repo, 'work/recipe-board-v1');
test('real banana film look task respects HOUSE and does not invent references', async t => {
  const scratch = path.join(os.homedir(), '.hermes/cache/scratch');
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'banana-filmdesign-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dest = path.join(root, 'work/recipe-board-v1');
  fs.mkdirSync(path.join(dest, 'projects'), { recursive: true });
  fs.cpSync(path.join(data, 'routing'), path.join(dest, 'routing'), { recursive: true });
  const project = path.join(dest, 'projects/banana-design'); fs.mkdirSync(project);
  for (const name of ['project.json', 'plan.json', 'brief.json', 'storyboard.json', 'style.json', 'shots', 'materials']) {
    const src = path.join(data, 'projects/banana-design', name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(project, name), { recursive: true, verbatimSymlinks: true });
  }
  for (const name of fs.readdirSync(path.join(data, 'projects'))) {
    if (name !== 'banana-design' && fs.statSync(path.join(data, 'projects', name)).isDirectory())
      fs.symlinkSync(path.join(data, 'projects', name), path.join(dest, 'projects', name));
  }
  const cfg = { repoRoot: root, sourceRoot: repo, dataDir: dest, nasOutputRoot: null };
  const result = await stepFilmLook(cfg, 'banana-design', { log() {} });
  assert.equal(result.state, 'waiting');
  const task = JSON.parse(fs.readFileSync(path.join(project, 'tasks/filmdesign.task.json')));
  assert.equal(task.input.style, 'work/recipe-board-v1/HOUSE.md');
  assert.ok(!task.input.referenceGuidance.lessons.some(x => /三成以上的拍在屏上/.test(x)));
  for (const id of ['B11', 'B14', 'B15']) {
    assert.ok(task.input.beats.some(x => x.beat === id));
    const row = task.input.referenceGuidance.beats.find(x => x.beat === id);
    assert.ok(row);
    for (const ref of row.nearest) assert.equal(ref.acceptance.currentApproval, false);
    if (!row.nearest.length) assert.equal(row.status, 'unknown');
  }
  assert.ok(!fs.existsSync(path.join(project, 'tasks/filmdesign.answer.json')));
});
