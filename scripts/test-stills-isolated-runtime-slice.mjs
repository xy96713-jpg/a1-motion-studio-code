import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeCheck } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';

test('isolated runtime rejects invalid or mismatched tags before touching project', async () => {
  const cfg = { dataDir: '/does-not-exist', repoRoot: '/does-not-exist' };
  for (const tag of ['../escape', 'B03', '']) {
    await assert.rejects(runtimeCheck(cfg, 'fixture', { id: 'STILLS-B02', shots: [{shotId:'B02'}] }, '', {}, { taskMode:'stills', isolatedTarget: tag }), /isolated target/i);
  }
});
