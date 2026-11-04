import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep actual checker bytes local while imports resolve to the real dependency tree.
test('normal chapter/stills checksHash invalidates on same-size typebible checker mutation', async () => {
  const source = new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs', import.meta.url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typebible-consumer-cache-'));
  try {
    const code = fs.readFileSync(source, 'utf8').replace(/from (['"])(\.[^'"]+)\1/g,
      (_, quote, specifier) => `from ${quote}${new URL(specifier, source).href}${quote}`);
    const chapter = path.join(tmp, 'chapter.mjs'), bible = path.join(tmp, 'typebible.mjs');
    fs.writeFileSync(chapter, code);
    for (const name of ['ground.py', 'typebible.mjs']) fs.copyFileSync(new URL(`./${name}`, source), path.join(tmp, name));
    const { checksHash } = await import(pathToFileURL(chapter).href);
    const original = fs.readFileSync(bible, 'utf8'), before = checksHash();
    assert.equal(checksHash(), before, 'unchanged checker has a stable cache key');
    // Change real pair-edge check behavior, not a wrapper or a supplied hash.
    const changed = original.replace('const pt = B.pair.edgeTol;', 'const pt=1+B.pair.edgeTol;');
    assert.notEqual(changed, original, 'mutation must hit the actual typebible edge checker');
    assert.equal(Buffer.byteLength(changed), Buffer.byteLength(original));
    fs.writeFileSync(bible, changed);
    assert.notEqual(checksHash(), before, 'actual typebible checker byte change must invalidate normal chapter/stills checks');
    fs.writeFileSync(bible, original);
    assert.equal(checksHash(), before, 'restoring checker bytes restores the normal checks key');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
