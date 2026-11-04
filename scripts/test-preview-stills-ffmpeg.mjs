import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensurePreviewStillsFromMp4 } from '../apps/studio-next/src/lib/recipe-board/shotmotion.mjs';

test('preview extraction samples real timestamps and refreshes after preview replacement', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-preview-stills-'));
  const video = path.join(dir, 'preview.mp4');
  const make = (color) => {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90:r=10:d=2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    make('red');
    const first = ensurePreviewStillsFromMp4(dir, video);
    assert.equal(first.length, 3, 'extract start, middle and late frames');
    const firstBytes = fs.readFileSync(first[1]);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'preview.stills.json'), 'utf8'));
    assert.deepEqual(manifest.times.map((t) => +t.toFixed(1)), [0, 1, 1.8]);
    make('blue');
    const second = ensurePreviewStillsFromMp4(dir, video);
    assert.equal(second.length, 3);
    assert.notDeepEqual(fs.readFileSync(second[1]), firstBytes, 'a changed preview must not reuse old frames');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
