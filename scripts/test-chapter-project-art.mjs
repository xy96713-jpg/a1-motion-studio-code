import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectArtFile } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';

test('project art reuse accepts local images and rejects escapes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chapter-art-'));
  try {
    const root = path.join(dir, 'project'); fs.mkdirSync(root);
    const local = path.join(root, 'art.png'); fs.writeFileSync(local, 'image');
    const outside = path.join(dir, 'outside.png'); fs.writeFileSync(outside, 'image');
    fs.symlinkSync(outside, path.join(root, 'escape.png'));
    assert.equal(projectArtFile(root, 'art.png'), fs.realpathSync(local));
    assert.throws(() => projectArtFile(root, '../outside.png'));
    assert.throws(() => projectArtFile(root, 'escape.png'));
    assert.throws(() => projectArtFile(root, outside));
    assert.throws(() => projectArtFile(root, 'missing.png'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
