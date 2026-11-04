import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { rejectPick, proposeBatch } from '../apps/studio-next/src/lib/recipe-board/materials.mjs';

const root = fs.mkdtempSync(path.join(os.homedir(), '.hermes/cache/scratch/reject-isolation-'));
const dataDir = path.join(root, 'work/recipe-board-v1');
const project = path.join(dataDir, 'projects/fixture');
const cfg = { repoRoot: root, sourceRoot: root, dataDir, nasOutputRoot: null };
const put = (rel, value) => { const f = path.join(project, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof value === 'string' ? value : JSON.stringify(value)); };
const get = rel => JSON.parse(fs.readFileSync(path.join(project, rel), 'utf8'));
try {
  put('project.json', { id: 'fixture' });
  put('shots/A.json', { slots: { photo: { asset: 'shared-image', credit: 'credit', extra: 1 } } });
  put('shots/B.json', '{"untouched":true}\n');
  put('materials/needs.json', { needs: [{ shotId: 'A', bind: 'photo' }, { shotId: 'B' }] });
  put('materials/candidates.json', { shots: {} });
  put('materials/approvals.json', { batches: [{ items: [
    { shotId: 'A', candidateId: 'one', status: 'approved' },
    { shotId: 'A', candidateId: 'two', status: 'fetched' },
    { shotId: 'B', candidateId: 'other', status: 'approved' },
  ] }] });
  put('materials/bindings.json', { shots: { A: { file: 'shared-image' }, B: { file: 'shared-image' } } });
  put('materials/shared-image', 'asset bytes');
  put('gates.json', 'approval bytes\n');
  const other = fs.readFileSync(path.join(project, 'shots/B.json'));
  const gate = fs.readFileSync(path.join(project, 'gates.json'));
  const asset = fs.readFileSync(path.join(project, 'materials/shared-image'));
  const snapshot = dir => Object.fromEntries(fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? Object.entries(snapshot(p)).map(([k, v]) => [path.join(e.name, k), v]) : [[e.name, fs.readFileSync(p).toString('base64')]];
  }));
  const beforeCli = snapshot(project);
  const cli = spawnSync(process.execPath, [path.resolve('scripts/recipe-board.mjs'), 'reject', '--project', 'fixture', '--only', 'A'], { env: { ...process.env, RECIPE_BOARD_REPO_ROOT: root, RECIPE_BOARD_SOURCE_ROOT: root, RECIPE_BOARD_NAS_OUTPUT_ROOT: '' }, encoding: 'utf8', timeout: 30000 });
  assert.notEqual(cli.status, 0); assert.match(cli.stderr, /MATERIALS_ONLY_SCOPE_UNSUPPORTED/);
  assert.deepEqual(snapshot(project), beforeCli, 'failed CLI must not change any project history');
  // Exercise exactly the two operations the blocked CLI would call, without modifying the CLI.
  await rejectPick(cfg, 'fixture', 'A', { why: 'fixture' });
  const items = get('materials/approvals.json').batches[0].items;
  assert.deepEqual(items.map(i => i.status), ['rejected', 'rejected', 'approved']);
  assert.equal(get('materials/bindings.json').shots.B.file, 'shared-image');
  assert.deepEqual(fs.readFileSync(path.join(project, 'shots/B.json')), other);
  assert.deepEqual(fs.readFileSync(path.join(project, 'gates.json')), gate);
  assert.deepEqual(fs.readFileSync(path.join(project, 'materials/shared-image')), asset);
  assert.equal(fs.existsSync(path.join(project, 'materials/proposed-batch.json')), false);
  const result = proposeBatch(cfg, 'fixture', { only: ['A'] });
  assert.deepEqual(result.skipped, ['A'], 'without a previous batch only the selected need is processed');
  assert.equal(get('materials/rounds.json').needs.B, undefined, 'unrelated search state must not change');
  put('materials/proposed-batch.json', { status: 'PROPOSED_NOT_APPROVED', marker: 'history', picks: [{ shotId: 'B', candidateId: 'other' }], skipped: [], weakPicks: [] });
  put('materials/rounds.json', { needs: { B: { round: 2, missed: true, gaveUp: true, at: 'historic' } } });
  const roundsBefore = get('materials/rounds.json').needs.B;
  proposeBatch(cfg, 'fixture', { only: ['A'] });
  assert.deepEqual(get('materials/rounds.json').needs.B, roundsBefore, 'previous unrelated picks do not alter rounds');
  assert.equal(get('materials/proposed-batch.json').marker, 'history');
  assert.deepEqual(get('materials/proposed-batch.json').picks, [{ shotId: 'B', candidateId: 'other' }]);
  console.log('PASS: CLI remains guarded; scoped proposal and shot-wide rejection are isolated.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
