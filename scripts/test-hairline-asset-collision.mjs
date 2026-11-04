import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import * as chapter from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const { prepareAssets } = chapter;

test('shared collision validator includes derived map asset keys', () => {
  assert.equal(typeof chapter.hairlineAssetKeyErrors, 'function');
  for (const suffix of ['Relief', 'Sea', 'Height']) {
    const errors = chapter.hairlineAssetKeyErrors({hairline:{key:`hairline_map${suffix}`},maps:[{key:'hairline_map'}]});
    assert.match(errors.join('\n'), /collision/i);
  }
});

test('Hairline asset key collisions fail before preparing any assets', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hairline-collision-'));
  try {
    const base = boardConfig(), cfg = { ...base, repoRoot: tmp, dataDir: path.join(tmp, 'work/recipe-board-v1') };
    const root = path.join(cfg.dataDir, 'projects/proof'); fs.mkdirSync(root, {recursive:true}); fs.writeFileSync(path.join(root,'project.json'), '{}');
    const original = Buffer.from('user material must survive'); fs.writeFileSync(path.join(root,'user.png'), original);
    for (const field of ['art','pages','maps','glyphs','bakes']) {
      const answer = { code:'', hairline:{key:'hairline_same',figure:'exploded',phaseMs:-1,intensity:0.8}, [field]:[{key:'hairline_same',file:'user.png'}] };
      const result = await prepareAssets(cfg,'proof',{id:'STILLS',shots:[],total:1},answer,{taskMode:'stills',log(){}});
      assert.match(result.errors.join('\n'), /hairline.*(?:collision|duplicate)/i, field);
      assert.deepEqual(fs.readFileSync(path.join(root,'user.png')), original);
    }
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
