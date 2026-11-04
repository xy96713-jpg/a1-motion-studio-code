import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'fetch-duplicate-'));
try {
  process.env.A1_MATERIAL_LIBRARY = path.join(root, 'library');
  fs.mkdirSync(process.env.A1_MATERIAL_LIBRARY);
  const M = await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  const cfg = { dataDir: path.join(root, 'data'), repoRoot: root, sourceRoot: root }, id = 'fixture';
  const dir = path.join(cfg.dataDir, 'projects', id, 'materials'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(cfg.dataDir, 'projects', id, 'project.json'), JSON.stringify({ id }));
  const need = { shotId: 'B02', kind: 'person', original: 'first' };
  const files = {
    'needs.json': { needs: [need, { ...need, original: 'different request' }] },
    'candidates.json': { shots: {} },
    'approvals.json': { batches: [{ id: 'legacy', items: [{ shotId: 'B02', status: 'approved', source: 'library', file: path.join(root, 'missing'), url: 'https://example.invalid/old', title: 'old', rights: 'unknown' }] }] },
    'bindings.json': { shots: {}, history: { retain: true } },
  };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  const before = Object.fromEntries(Object.keys(files).map(name => [name, fs.readFileSync(path.join(dir, name))]));
  await assert.rejects(M.fetchApproved(cfg, id), /duplicate need key: B02/);
  for (const [name, bytes] of Object.entries(before)) assert.deepEqual(fs.readFileSync(path.join(dir, name)), bytes, name);
  assert.deepEqual(fs.readdirSync(process.env.A1_MATERIAL_LIBRARY), []);
  console.log('PASS duplicate fetch need refused before writes; legacy ledger bytes preserved');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
