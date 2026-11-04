import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from '../apps/studio-next/node_modules/sharp/lib/index.js';
import { oneShotDecision, ONESHOT_CONTRACT } from '../apps/studio-next/src/lib/recipe-board/oneshot.mjs';

const scores = (n) => ({ composition: n, subject: n, material: n, type: n, light: n, grounding: n });

test('a proof must win blind and clear every dimension, or the target stays', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oneshot-'));
  try {
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#222222' } }).png().toFile(path.join(root, 'target.png'));
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888888' } }).png().toFile(path.join(root, 'proof.png'));
    const target = { file: path.join(root, 'target.png') }, proof = { file: path.join(root, 'proof.png') };
    const keep = oneShotDecision({ target, proof, blind: { target: { scores: scores(4) }, proof: { scores: scores(2) }, better: 'target' } });
    assert.equal(keep.contract, ONESHOT_CONTRACT);
    assert.equal(keep.decision, 'keep-target');
    assert.match(keep.why, /target stays/);
    const use = oneShotDecision({ target, proof, blind: { target: { scores: scores(3) }, proof: { scores: scores(4) }, better: 'proof' } });
    assert.equal(use.decision, 'use-proof');
    const oneLow = oneShotDecision({ target, proof, blind: { target: { scores: scores(3) }, proof: { scores: { ...scores(4), grounding: 3 } }, better: 'proof' } });
    assert.equal(oneLow.decision, 'keep-target', 'one dimension under the bar is enough to keep the target');
    const missing = oneShotDecision({ target: { file: path.join(root, 'nope.png') }, proof, blind: { target: { scores: scores(4) }, proof: { scores: scores(4) }, better: 'proof' } });
    assert.equal(missing.decision, 'rejected');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
