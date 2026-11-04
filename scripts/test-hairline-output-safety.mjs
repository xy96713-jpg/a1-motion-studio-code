import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareFixedHairline } from '../apps/studio-next/src/lib/recipe-board/hairline-still.mjs';

test('Hairline rejects a symlinked project root', async () => {
  const base = await fs.mkdtemp(path.join(process.env.TMPDIR, 'hairline-root-'));
  try {
    const root = path.join(base, 'project'), alias = path.join(base, 'alias');
    await fs.mkdir(root); await fs.symlink(root, alias);
    await assert.rejects(prepareFixedHairline(alias, {key:'hairline_test',figure:'exploded',phaseMs:192,intensity:0.8}), /symlink/i);
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await fs.rm(base, {recursive:true,force:true}); }
});

test('Hairline rejects output directory symlinks before rendering', async () => {
  const base = await fs.mkdtemp(path.join(process.env.TMPDIR, 'hairline-safety-'));
  try {
    const root = path.join(base, 'project'), outside = path.join(base, 'outside');
    await fs.mkdir(root); await fs.mkdir(outside);
    await fs.symlink(outside, path.join(root, 'out'));
    await assert.rejects(prepareFixedHairline(root, {key:'hairline_test',figure:'exploded',phaseMs:192,intensity:0.8}), /symlink|symbolic|outside/i);
    assert.deepEqual(await fs.readdir(outside), []);
  } finally { await fs.rm(base, {recursive:true, force:true}); }
});
