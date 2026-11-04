import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { groundTintErrors } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';

// Exercise the actual no-argument consumer API without changing shared source files.
// Only static dependency locations move; checksHash and its ground.py stay together.
test('normal checksHash changes when ground.py bytes change, not just its function wrapper', async () => {
  const source = new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs', import.meta.url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ground-consumer-cache-'));
  try {
    const code = fs.readFileSync(source, 'utf8').replace(/from (['"])(\.[^'"]+)\1/g,
      (_, quote, specifier) => `from ${quote}${new URL(specifier, source).href}${quote}`);
    const chapter = path.join(tmp, 'chapter.mjs'), ground = path.join(tmp, 'ground.py');
    fs.writeFileSync(chapter, code);
    fs.copyFileSync(new URL('./ground.py', source), ground);
    fs.copyFileSync(new URL('./typebible.mjs', source), path.join(tmp, 'typebible.mjs'));
    const { checksHash } = await import(pathToFileURL(chapter).href);
    const original = fs.readFileSync(ground), before = checksHash();
    assert.equal(checksHash(), before, 'unchanged detector has a stable cache key');
    const changed = Buffer.from(original);
    changed[0] = changed[0] === 35 ? 32 : 35;
    fs.writeFileSync(ground, changed);
    assert.notEqual(checksHash(), before, 'same-size detector byte change must invalidate normal chapter/stills checks');
    fs.writeFileSync(ground, original);
    assert.equal(checksHash(), before, 'restoring detector bytes restores the normal checks key');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

const script = [{ beat: 'B03', ground: '#1c1c1c' }];
test('groundTintErrors rejects explicit unknown source detection instead of skipping it', () => {
  for (const row of [
    { rim: null, rimStatus: 'unknown' },
    { rim: '#1c1c1c', rimStatus: 'unknown' },
    { rim: null, rimEstimate: { status: 'unknown', reason: 'conflicting perimeter' } },
  ]) {
    const errors = groundTintErrors([row], script, ['B03']);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /B03:.*ground.*source detection.*unknown.*filmdesign/);
  }
});
test('groundTintErrors preserves legacy rows without status and the existing tint rejection', () => {
  assert.deepEqual(groundTintErrors([{ rim: null }], script, ['B03']), []);
  assert.deepEqual(groundTintErrors([{ rim: '#1c1c1c' }], script, ['B03']), []);
  assert.match(groundTintErrors([{ rim: '#2a1d1e' }], script, ['B03']).join(), /its ground renders/);
});
