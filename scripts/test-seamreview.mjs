import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { seamReviewErrors, seamInput, SEAM_REVIEW_CONTRACT } from '../apps/studio-next/src/lib/recipe-board/seamreview.mjs';

const answer = (root, hash) => ({
  contract: SEAM_REVIEW_CONTRACT, sourceTaskInputHash: 'h', from: 'B04', to: 'B05',
  intent: { carry: ['同一串香蕉', '向右的运动', '亮底'], enter: '出帧最后停在一排香蕉和标题上', exit: '入帧第一刻仍是同一排香蕉，标题退去', cut: 'match', why: '同一主体带着同一个方向过去，观众不用重新找东西' },
  renders: [{ file: 'seam.mp4', hash, seconds: 4.5, fps: 30 }],
  verdict: { reviewer: 'fresh', scores: { continuity: 4, direction: 4, brightness: 4, reading: 4, natural: 4 }, passed: true },
  notes: '1× 播放里主体、方向和亮度都接得上，没有闪白',
});

test('a seam review needs a real joined render, a stated handover and five fresh scores', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seamreview-'));
  try {
    fs.writeFileSync(path.join(root, 'seam.mp4'), 'joined playback bytes');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'seam.mp4'))).digest('hex');
    const input = { from: 'B04', to: 'B05' };
    assert.deepEqual(seamReviewErrors(answer(root, hash), input, { root }), []);
    const wrong = answer(root, '0'.repeat(64));
    assert.ok(seamReviewErrors(wrong, input, { root }).some((e) => /hash/.test(e)));
    const short = answer(root, hash); short.renders[0].seconds = 2;
    assert.ok(seamReviewErrors(short, input, { root }).some((e) => /3\.5s/.test(e)));
    const score = answer(root, hash); score.verdict.scores.natural = 3;
    assert.ok(seamReviewErrors(score, input, { root }).some((e) => /natural/.test(e)));
    const carry = answer(root, hash); carry.intent.carry = [];
    assert.ok(seamReviewErrors(carry, input, { root }).some((e) => /carry/.test(e)));
    const cut = answer(root, hash); cut.intent.cut = 'fade';
    assert.ok(seamReviewErrors(cut, input, { root }).some((e) => /cut/.test(e)));
    const wrongPair = answer(root, hash); wrongPair.to = 'B06';
    assert.ok(seamReviewErrors(wrongPair, input, { root }).some((e) => /from\/to/.test(e)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the seam task is written even while the two chapters have no renders', () => {
  const cfg = { repoRoot: process.cwd(), dataDir: path.join(process.cwd(), 'work/recipe-board-v1') };
  const input = seamInput(cfg, 'banana-design', 'B04', 'B05');
  assert.equal(input.from, 'B04');
  assert.equal(input.to, 'B05');
  assert.equal(input.beats.length, 2);
  assert.equal(input.ready, false);
});
