import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { materialsLock } from '../apps/studio-next/src/lib/recipe-board/shotplan.mjs';
import { rejectPick } from '../apps/studio-next/src/lib/recipe-board/materials.mjs';

const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'material-lock-boundary-'));
try {
  const cfg = { dataDir: path.join(root, 'data'), repoRoot: root, sourceRoot: root };
  const id = 'fixture', dir = path.join(cfg.dataDir, 'projects', id, 'materials');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '..', 'project.json'), JSON.stringify({ id }));
  const af = path.join(dir, 'approvals.json'), bf = path.join(dir, 'bindings.json');
  const approvals = { batches: [{ id: 'b', items: [{ shotId: 'B02', status: 'approved' }, { shotId: 'OLD', status: 'rejected', rejectedWhy: 'history' }] }] };
  fs.writeFileSync(af, JSON.stringify(approvals));
  fs.writeFileSync(bf, JSON.stringify({ shots: { B02: { file: 'kept.png' } }, superseded: { historical: { file: 'old.png' } } }));
  const before = fs.readFileSync(af);
  const moduleUrl = pathToFileURL(path.resolve('apps/studio-next/src/lib/recipe-board/materials.mjs')).href;
  const child = `import {rejectPick} from ${JSON.stringify(moduleUrl)}; console.log('started'); await rejectPick(${JSON.stringify(cfg)},${JSON.stringify(id)},'B02'); console.log('finished');`;
  const release = await materialsLock(cfg, id);
  const proc = spawn(process.execPath, ['--input-type=module', '-e', child], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  proc.stdout.on('data', d => { stdout += d; }); proc.stderr.on('data', d => { stderr += d; });
  const exited = new Promise((resolve, reject) => { proc.on('error', reject); proc.on('close', code => resolve(code)); });
  try {
    for (let i = 0; i < 100 && !stdout.includes('started'); i++) await new Promise(r => setTimeout(r, 20));
    assert.match(stdout, /started/);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(proc.exitCode, null, `child exited early: ${stderr}`);
    assert.deepEqual(fs.readFileSync(af), before, 'reject wrote while another process held lock');
  } finally { release(); }
  assert.equal(await exited, 0, stderr);
  assert.match(stdout, /finished/);
  let a = JSON.parse(fs.readFileSync(af));
  assert.equal(a.batches[0].items[0].status, 'rejected');
  assert.deepEqual(a.batches[0].items[1], approvals.batches[0].items[1]);
  let b = JSON.parse(fs.readFileSync(bf));
  assert.deepEqual(b.superseded.historical, { file: 'old.png' });
  assert.ok(Object.values(b.superseded).some(x => x.file === 'kept.png'));
  a.batches[0].items.push({ shotId: 'B03', status: 'approved' });
  fs.writeFileSync(af, JSON.stringify(a));
  await rejectPick(cfg, id, 'B03', { why: 'uncontended' });
  assert.equal(JSON.parse(fs.readFileSync(af)).batches[0].items[2].status, 'rejected');
  await assert.rejects(rejectPick(cfg, id, 'B03', { log: () => { throw new Error('fixture failure'); } }), /fixture failure/);
  const afterError = await materialsLock(cfg, id, () => {}, { waitMs: 10, maxWait: 100 });
  afterError();
  console.log('reject lock: contention, resume, uncontended, history and exception release passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
