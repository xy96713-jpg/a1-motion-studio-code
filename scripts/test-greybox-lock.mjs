import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stepGreybox } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-greybox-lock-'));
try {
  const dataDir = path.join(root, 'work/recipe-board-v1'), project = path.join(dataDir, 'projects/test-film');
  const out = path.join(project, 'out/greybox'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ id: 'test-film' }));
  const lock = path.join(out, '.render.lock'); fs.writeFileSync(lock, 'existing owner');
  const result = await stepGreybox({ repoRoot: root, sourceRoot: root, dataDir }, 'test-film');
  assert.equal(result.state, 'blocked');
  assert.equal(fs.readFileSync(lock, 'utf8'), 'existing owner', 'a competing run cannot remove the owner lock');
  console.log('greybox lock: a competing run stops before touching the existing owner');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
