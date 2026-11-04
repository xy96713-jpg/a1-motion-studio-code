import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Offline, disposable multiprocess acceptance: the controller never waits for a
// lock-owning child synchronously. Swift is only an OCR barrier, not a writer.
const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'run-reject-race-'));
const children = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, ms = 15000) {
  const end = Date.now() + ms;
  while (!predicate()) { if (Date.now() >= end) throw Error(`timeout: ${label}`); await pause(20); }
}
function child(code, env) {
  const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(p); let output = '';
  p.stdout.on('data', d => output += d); p.stderr.on('data', d => output += d);
  p.result = new Promise((resolve, reject) => { p.on('error', reject); p.on('close', (code, signal) => resolve({ code, signal, output })); });
  return p;
}
try {
  const dataDir = path.join(root, 'data'), library = path.join(root, 'library'), bin = path.join(root, 'bin');
  fs.mkdirSync(library); fs.mkdirSync(bin);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, A1_MATERIAL_LIBRARY: library };
  const cfg = { dataDir, repoRoot: root, sourceRoot: root }, id = 'fixture';
  const project = path.join(dataDir, 'projects', id), dir = path.join(project, 'materials'), shots = path.join(project, 'shots');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(shots);
  for (const name of ['recipes', 'routing', 'themes', 'worlds']) fs.cpSync(path.resolve('work/recipe-board-v1', name), path.join(dataDir, name), { recursive: true });
  const M = await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  const old = { shotId: 'B01', scene: 1, kind: 'person', form: 'photo', original: 'old', bind: 'picture' };
  const stale = { ...old, original: 'new' }, valid = { shotId: 'B02', kind: 'person', form: 'photo', original: 'current', bind: 'picture' };
  const image = path.join(root, 'image.png'), oldAsset = path.join(root, 'old.png');
  const gen = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=64x64', '-frames:v', '1', image], { encoding: 'utf8' });
  assert.equal(gen.status, 0, gen.stderr); fs.copyFileSync(image, oldAsset);
  const item = n => ({ shotId: M.needKey(n), status: 'approved', source: 'library', file: image, url: `https://example.invalid/${M.needKey(n)}`, title: M.needKey(n), publisher: 'fixture', rights: 'unknown', rightsLabel: 'unknown', needPrint: M.needPrint(n) });
  const oldItem = { ...item(old), history: { preserve: true } }, oldBinding = { file: oldAsset, kind: 'image', needPrint: M.needPrint(old), history: { preserve: true } };
  const put = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  const get = name => JSON.parse(fs.readFileSync(path.join(dir, name)));
  put('needs.json', { needs: [stale, valid] });
  put('candidates.json', { shots: { 'B01~1': { need: old, candidates: [] }, B02: { need: valid, candidates: [] } } });
  put('approvals.json', { batches: [{ id: 'batch', items: [oldItem, item(valid)] }] });
  put('bindings.json', { shots: { 'B01~1': oldBinding } });
  const projectFile = path.join(project, 'project.json'), planFile = path.join(project, 'plan.json'), shot1 = path.join(shots, 'B01.json'), shot2 = path.join(shots, 'B02.json');
  fs.writeFileSync(projectFile, JSON.stringify({ id, gates: { design: { approved: false }, final: { approved: false } } }));
  fs.writeFileSync(planFile, JSON.stringify({ beats: [] }));
  fs.writeFileSync(shot1, JSON.stringify({ recipe: 'fixture', scenes: [{ slots: { picture: { gen: 'zero' } } }, { slots: { picture: { gen: 'old' } } }] }));
  fs.writeFileSync(shot2, JSON.stringify({ recipe: 'fixture', slots: { picture: { gen: 'placeholder' } } }));
  const untouched = [projectFile, planFile, image, oldAsset, shot1, path.join(dir, 'needs.json'), path.join(dir, 'candidates.json')].map(f => [f, fs.readFileSync(f)]);
  const ready = path.join(root, 'ready'), go = path.join(root, 'go'), waiting = path.join(root, 'waiting'), bound = path.join(root, 'bound.json');
  fs.writeFileSync(path.join(bin, 'swift'), `#!/bin/sh\ntouch ${JSON.stringify(ready)}\nwhile [ ! -f ${JSON.stringify(go)} ]; do sleep 0.05; done\nprintf '[]'\n`, { mode: 0o755 });
  const runUrl = pathToFileURL(path.resolve('apps/studio-next/src/lib/recipe-board/run.mjs')).href;
  const materialsUrl = pathToFileURL(path.resolve('apps/studio-next/src/lib/recipe-board/materials.mjs')).href;
  const runCode = `import fs from 'node:fs'; import {runProject} from ${JSON.stringify(runUrl)};
    globalThis.fetch=async()=>{throw Error('network forbidden')};
    await runProject(${JSON.stringify(cfg)},${JSON.stringify(id)},{from:'fetch',to:'fetch',log:s=>{
      if(String(s).includes('B02 -> picture of')) fs.writeFileSync(${JSON.stringify(bound)},JSON.stringify({shot:JSON.parse(fs.readFileSync(${JSON.stringify(shot2)})), binding:JSON.parse(fs.readFileSync(${JSON.stringify(path.join(dir, 'bindings.json'))})).shots.B02, owner:JSON.parse(fs.readFileSync(${JSON.stringify(path.join(dir, '.lock'))},'utf8')).pid}));
    }});`;
  const rejectCode = `import fs from 'node:fs'; import {rejectPick} from ${JSON.stringify(materialsUrl)};
    globalThis.fetch=async()=>{throw Error('network forbidden')};
    await rejectPick(${JSON.stringify(cfg)},${JSON.stringify(id)},'B02',{why:'concurrent rejection',log:s=>{if(String(s).includes('waiting for another passage')) fs.writeFileSync(${JSON.stringify(waiting)},String(s));}});`;
  const runner = child(runCode, env); let rejecter;
  try {
    await until(() => fs.existsSync(ready) || runner.exitCode !== null, 'run reaches fetch OCR');
    if (!fs.existsSync(ready)) assert.fail(`run exited before fetch: ${JSON.stringify(await runner.result)}`);
    rejecter = child(rejectCode, env);
    await until(() => fs.existsSync(waiting) || rejecter.exitCode !== null, 'reject observes contention');
    assert.ok(fs.existsSync(waiting), 'reject did not report waiting on run');
    assert.match(fs.readFileSync(waiting, 'utf8'), new RegExp(`"pid":${runner.pid}`));
    await pause(250);
    assert.equal(rejecter.exitCode, null, 'reject must remain blocked during fetch');
    assert.equal(get('approvals.json').batches[0].items[1].status, 'approved');
    assert.equal(get('bindings.json').shots.B02, undefined);
  } finally { fs.writeFileSync(go, 'release'); }
  await until(() => runner.exitCode !== null && rejecter.exitCode !== null, 'both processes complete', 20000);
  const [runResult, rejectResult] = await Promise.all([runner.result, rejecter.result]);
  assert.equal(runResult.code, 0, JSON.stringify(runResult)); assert.equal(rejectResult.code, 0, JSON.stringify(rejectResult));
  assert.ok(fs.existsSync(bound), 'run did not bind B02');
  const atBind = JSON.parse(fs.readFileSync(bound));
  assert.equal(atBind.owner, runner.pid, 'run must own the lock during the actual B02 slot write');
  assert.equal(atBind.binding.needPrint, M.needPrint(valid));
  assert.equal(atBind.shot.slots.picture.asset, path.relative(cfg.sourceRoot, atBind.binding.file));
  assert.ok(fs.existsSync(atBind.binding.file));
  const approvals = get('approvals.json').batches[0].items, bindings = get('bindings.json');
  assert.deepEqual(approvals[0], oldItem); assert.equal(approvals[1].status, 'rejected');
  assert.equal(approvals[1].rejectedWhy, 'concurrent rejection');
  assert.deepEqual(bindings.shots['B01~1'], oldBinding); assert.equal(bindings.shots.B02, undefined);
  assert.ok(Object.values(bindings.superseded).some(b => b.file === atBind.binding.file && b.rejectedWhy === 'concurrent rejection'));
  assert.equal(get('review-picks.json').rejected.B02[0].why, 'concurrent rejection');
  assert.equal(JSON.parse(fs.readFileSync(shot2)).slots.picture.asset, undefined);
  for (const [file, before] of untouched) assert.deepEqual(fs.readFileSync(file), before, `${file} must not change`);
  console.log('run fetch→bind vs reject: real processes, contention, B02 bind then rejection, stale B01 and original files preserved');
} finally {
  for (const p of children) if (p.exitCode === null) p.kill('SIGKILL');
  await Promise.all(children.map(p => p.result.catch(() => {})));
  fs.rmSync(root, { recursive: true, force: true });
}
