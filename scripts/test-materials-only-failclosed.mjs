import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runProject } from '../apps/studio-next/src/lib/recipe-board/run.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'materials-only-'));
const dataDir = path.join(root, 'work/recipe-board-v1');
const project = path.join(dataDir, 'projects/fixture');
const materials = path.join(project, 'materials');
const cli = path.resolve('scripts/recipe-board.mjs');
const cfg = { repoRoot: root, sourceRoot: root, dataDir };
const save = (file, data) => { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data)); };
const digest = dir => {
  const out = {};
  const walk = p => { for (const entry of fs.readdirSync(p, {withFileTypes:true})) { const f = path.join(p, entry.name); if (entry.isDirectory()) walk(f); else out[path.relative(dir,f)] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } };
  walk(dir); return out;
};
try {
  for (const name of ['recipes','routing','themes','worlds']) {
    const src = path.resolve('work/recipe-board-v1', name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dataDir,name), {recursive:true});
  }
  save(path.join(project,'project.json'), {id:'fixture'});
  for (const id of ['B01','B02']) save(path.join(project,`shots/${id}.json`), {shotId:id});
  save(path.join(materials,'needs.json'), {needs:[{shotId:'B01'},{shotId:'B02'}]});
  save(path.join(materials,'approvals.json'), {batches:[{id:'batch-1',items:[{shotId:'B01',status:'approved'},{shotId:'B02',status:'approved'}]}]});
  save(path.join(materials,'proposed-batch.json'), {picks:[{shotId:'B01'},{shotId:'B02'}]});
  save(path.join(materials,'bindings.json'), {shots:{B02:{file:'historical.png'}}});
  save(path.join(materials,'receipts/old.json'), 'historical receipt');
  save(path.join(materials,'historical.png'), 'historical material');
  save(path.join(project,'plan.json'), {beats:[{id:'B01',text:'one'},{id:'B02',text:'two'}]});
  const materialBefore = digest(materials);
  await runProject(cfg, 'fixture', {only:new Set(['B01']),from:'brief',to:'brief',log:()=>{}});
  assert.ok(fs.existsSync(path.join(project,'tasks/brief.task.json')), 'real brief task executed');
  assert.deepEqual(digest(materials), materialBefore);
  save(path.join(project,'shots/B01.json'), {shotId:'B01',recipe:'morph-chapter',motion:{duration:5}});
  const logs = [];
  await runProject(cfg, 'fixture', {only:new Set(['B01']),from:'chapter',to:'chapter',skip:['keyframes'],log:(s)=>logs.push(s)});
  assert.ok(logs.some(s => s.includes('B01(1 beats')), logs.join('\n'));
  assert.ok(fs.existsSync(path.join(project,'tasks/morph-B01.task.json')), logs.join('\n'));
  assert.deepEqual(digest(materials), materialBefore, 'chapter fixture preserves historical materials');
  // Both admission and execution honor materials suppressing fetch even when fetch is not in skip.
  await runProject(cfg, 'fixture', {only:new Set(['B01']),from:'brief',to:'fetch',skip:['storyboard','write','facts','screen','materials'],log:()=>{}});
  assert.deepEqual(digest(materials), materialBefore);
  const before = digest(root);
  for (const options of [
    {}, {from:'brief',to:'fetch',skip:['storyboard','write','facts','screen']},
    {from:'brief',to:'chapter',skip:['materials']}, {from:'chapter',to:'brief'},
    {from:'brief',to:'brief',skip:['brief']}, {from:'brief',to:'brief',article:'unused'},
  ]) {
    await assert.rejects(runProject(cfg, 'fixture', {only:new Set(['B01']),...options,log:()=>{}}), /MATERIALS_ONLY_SCOPE_UNSUPPORTED/);
    assert.deepEqual(digest(root),before, JSON.stringify(options));
  }
  for (const stage of ['materials','fetch','passages','write','render']) {
    await assert.rejects(runProject(cfg, 'fixture', {only:new Set(['B01']),from:stage,to:stage,log:()=>{}}), /MATERIALS_ONLY_SCOPE_UNSUPPORTED/);
    assert.deepEqual(digest(root),before, stage);
  }
  const env = {...process.env, RECIPE_BOARD_REPO_ROOT:root, RECIPE_BOARD_NAS_OUTPUT_ROOT:''};
  for (const cmd of ['run','fetch','materials','propose','reject']) {
    const args = [cli,cmd,'--project','fixture','--only','B01'];
    if (cmd === 'fetch') args.push('--batch','batch-1');
    const r = spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:30000});
    assert.notEqual(r.status,0,cmd); assert.match(r.stderr,/MATERIALS_ONLY_SCOPE_UNSUPPORTED/,cmd);
    assert.deepEqual(digest(root),before,cmd);
  }
  const dry = spawnSync(process.execPath,[cli,'run','--project','fixture','--only','B01','--dry'],{env,encoding:'utf8',timeout:30000});
  assert.equal(dry.status,0,dry.stderr); assert.match(dry.stdout,/left to do/);
  assert.deepEqual(digest(root),before,'dry must not write');
  // A default invocation must enter and complete the old plan path.
  const r = spawnSync(process.execPath,[cli,'run','--project','fixture','--from','plan','--to','plan'],{env,encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/left to do/);
  console.log('materials only fail-closed: OK');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
