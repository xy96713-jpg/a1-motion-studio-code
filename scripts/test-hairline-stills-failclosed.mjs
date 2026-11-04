// Exercise the actual stills entry on an isolated project; never alter a real project.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { stepStills } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
const cfg = boardConfig();
assert(cfg.repoRoot.startsWith('/Users/a1/.hermes/cache/scratch/'), 'isolated scratch root required');
const answerFile = path.join(cfg.dataDir, 'projects/banana-design/tasks/stills.answer.json');
const original = fs.readFileSync(answerFile);
try {
  const answer = JSON.parse(original);
  answer.hairline = { figure: 'exploded', phaseMs: 192, intensity: 0.8 };
  fs.writeFileSync(answerFile, JSON.stringify(answer));
  const result = await stepStills(cfg, 'banana-design', { log() {} });
  assert.equal(result.state, 'rejected', JSON.stringify(result));
  assert(result.errors.some(e => /Hairline.*invalid.*key/i.test(e)), JSON.stringify(result));
  answer.hairline = { key:'hairline_same', figure:'exploded', phaseMs:192, intensity:0.8 };
  answer.maps = [...(answer.maps || []), {key:'hairline_same'}];
  fs.writeFileSync(answerFile, JSON.stringify(answer));
  const out = path.join(cfg.dataDir, 'projects/banana-design/out/hairline-stills');
  const before = fs.existsSync(out) ? fs.readdirSync(out).sort() : null;
  const collision = await stepStills(cfg, 'banana-design', { log() {} });
  assert.equal(collision.state, 'rejected', JSON.stringify(collision));
  assert(collision.errors.some(e => /Hairline.*collision/i.test(e)), JSON.stringify(collision));
  assert.deepEqual(fs.existsSync(out) ? fs.readdirSync(out).sort() : null, before);
  console.log('stepStills rejects invalid selection and collision before Hairline generation');
} finally { fs.writeFileSync(answerFile, original); }
