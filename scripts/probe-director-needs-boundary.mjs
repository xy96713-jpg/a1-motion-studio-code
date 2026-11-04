// Offline diagnostic of the existing needs/consumer boundary, not an implementation of director feedback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { toNeed } from '../apps/studio-next/src/lib/recipe-board/writer.mjs';
import { needKey, needPrint, changedNeeds, readMaterials } from '../apps/studio-next/src/lib/recipe-board/materials.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'director-needs-probe-'));
try {
  const cfg = { dataDir: root, repoRoot: root, sourceRoot: root }, id = 'probe';
  const project = path.join(root, 'projects', id), dir = path.join(project, 'materials');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ id }));
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  const beat = { text: 'fixture', onScreen: { keywords: [] } };
  const original = toNeed('B01', { kind: 'stock', form: 'photo', slot: 'background', original: 'fixture image', entity: 'subject', queryEn: 'first query' }, beat);
  const queryChanged = toNeed('B01', { kind: 'stock', form: 'photo', slot: 'background', original: 'fixture image', entity: 'subject', queryEn: 'different query' }, beat);
  assert.equal(needKey(original), 'B01');
  assert.deepEqual(original.youtube, []);
  assert.deepEqual(original.preferredMedia, ['IMAGE']);
  assert.notDeepEqual(original.archive.keywords, queryChanged.archive.keywords);
  write('needs.json', { contract: 'A1RecipeBoardMaterialNeeds/v1', needs: [queryChanged] });
  write('candidates.json', { shots: { B01: { need: original, candidates: [] } } });
  write('bindings.json', { shots: { B01: { file: 'historical-image', needPrint: needPrint(original) } } });
  assert.deepEqual(readMaterials(cfg, id).needs, [queryChanged]);
  assert.equal(needPrint(original), needPrint(queryChanged));
  assert.deepEqual(changedNeeds(cfg, id), []);
  write('needs.json', { contract: 'A1RecipeBoardMaterialNeeds/v1', needs: [] });
  assert.deepEqual(changedNeeds(cfg, id), []);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'bindings.json'))).shots.B01);
  console.log('Observed: photo request is IMAGE-only and consumed from needs.json; query-only changes and removed needs are not retired by changedNeeds. No media or network used.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
