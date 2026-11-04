import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { referencePaths, stepBreakdown } from '../apps/studio-next/src/lib/recipe-board/refbreakdown.mjs';

const scratch = path.join(os.homedir(), '.hermes/cache/scratch');
fs.mkdirSync(scratch, { recursive: true });
const root = fs.mkdtempSync(path.join(scratch, 'reference-paths-'));
const cfg = { repoRoot: root, dataDir: path.join(root, 'work/recipe-board-v1') };
const ref = 'work/recipe-board-v1/projects/paperclip-138/reference';
const dir = path.join(root, ref), projectDir = path.join(cfg.dataDir, 'projects/test-film');
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(path.join(dir, '../breakdowns'), { recursive: true });
fs.writeFileSync(path.join(dir, '../breakdowns/0-1.json'), '{}');
fs.writeFileSync(path.join(dir, 'vol138.mp4'), 'fixture video');
const project = (reference) => fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify({ reference }));
const beats = `${ref}/beats`;
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
test('repository-relative paperclip video resolves and actual breakdown reads existing reference', async () => {
  project({ beats, video: `${ref}/vol138.mp4` });
  assert.equal(referencePaths(cfg, 'test-film').video, path.join(dir, 'vol138.mp4'));
  assert.equal((await stepBreakdown(cfg, 'test-film', { from: 0, to: 1 })).state, 'accepted');
});
test('reference directory filename, absolute video, and default single video', async () => {
  for (const video of ['vol138.mp4', path.join(dir, 'vol138.mp4'), undefined]) {
    project({ beats, video });
    assert.equal(referencePaths(cfg, 'test-film').video, path.join(dir, 'vol138.mp4'));
    assert.equal((await stepBreakdown(cfg, 'test-film', { from: 0, to: 1 })).state, 'accepted');
  }
});
test('no beats and missing paths do not become valid references', async () => {
  project({ video: `${ref}/vol138.mp4` });
  assert.equal(referencePaths(cfg, 'test-film'), null);
  await assert.rejects(stepBreakdown(cfg, 'test-film', { from: 0, to: 1 }), /no reference video/);
  project({ beats, video: `${ref}/missing.mp4` });
  assert.equal(referencePaths(cfg, 'test-film').video, path.join(root, ref, 'missing.mp4'));
  await assert.rejects(stepBreakdown(cfg, 'test-film', { from: 0, to: 1 }), /no reference video/);
});
test('relative traversal is rejected', () => {
  project({ beats, video: '../secret.mp4' });
  assert.throws(() => referencePaths(cfg, 'test-film'), /invalid reference video/);
  project({ beats, video: 'work/../../secret.mp4' });
  assert.throws(() => referencePaths(cfg, 'test-film'), /invalid reference video/);
});
