import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { materialsLock } from '../apps/studio-next/src/lib/recipe-board/shotplan.mjs';
import { updateMaterialNeeds } from '../apps/studio-next/src/lib/recipe-board/writer.mjs';

const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'writer-needs-lock-'));
try {
  const cfg = {dataDir: root}, id = 'fixture';
  fs.mkdirSync(path.join(root, 'projects', id), {recursive:true});
  fs.writeFileSync(path.join(root, 'projects', id, 'project.json'), '{}');
  const release = await materialsLock(cfg, id);
  const file = path.join(root, 'projects', id, 'materials', 'needs.json');
  const pending = updateMaterialNeeds(cfg, id, [{shotId:'B01', kind:'person'}], new Set(['B01']));
  await new Promise(r => setTimeout(r, 100));
  assert.equal(fs.existsSync(file), false, 'writer waits for the project materials lock');
  release();
  await pending;
  assert.equal(JSON.parse(fs.readFileSync(file)).needs[0].shotId, 'B01');
  console.log('writer needs waits for project lock and persists after release');
} finally { fs.rmSync(root, {recursive:true, force:true}); }
