import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {materialsLock} from '../apps/studio-next/src/lib/recipe-board/shotplan.mjs';

const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'approval-route-'));
const app = path.resolve('apps/studio-next/src');
const hooks = registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(pathToFileURL(path.join(app, specifier.slice(2))).href, context);
  if (specifier === 'next/server') return nextResolve(pathToFileURL(path.resolve('apps/studio-next/node_modules/next/server.js')).href, context);
  return nextResolve(specifier, context);
}});
try {
  process.env.RECIPE_BOARD_REPO_ROOT = root;
  process.env.RECIPE_BOARD_SOURCE_ROOT = root;
  process.env.RECIPE_BOARD_NAS_OUTPUT_ROOT = '';
  globalThis.fetch = async () => { throw new Error('network forbidden'); };
  const dir = path.join(root, 'work/recipe-board-v1/projects/fixture');
  fs.mkdirSync(path.join(dir, 'materials'), {recursive:true});
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({id:'fixture'}));
  fs.writeFileSync(path.join(dir, 'materials/candidates.json'), JSON.stringify({shots:{B01:{candidates:[{id:'c1',source:'library',title:'fixture'}]}}}));
  const cfg = {repoRoot:root,sourceRoot:root,dataDir:path.join(root,'work/recipe-board-v1')};
  const {POST} = await import('../apps/studio-next/src/app/api/recipe-board/materials/route.ts');
  const request = candidateId => new Request('http://local.test/api/recipe-board/materials', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project:'fixture',picks:[{shotId:'B01',candidateId}]})});
  const release = await materialsLock(cfg,'fixture');
  let settled = false;
  const pending = POST(request('c1')).then(response => {settled=true; return response;});
  try {
    await new Promise(r => setTimeout(r, 150));
    assert.equal(settled, false, 'route must await the held approval lock');
    assert.equal(fs.existsSync(path.join(dir,'materials/approvals.json')), false);
  } finally { release(); }
  const response = await pending;
  assert.equal(response.status, 200);
  const {batch} = await response.json();
  assert.equal(batch.items[0].candidateId, 'c1');
  const saved = JSON.parse(fs.readFileSync(path.join(dir,'materials/approvals.json'),'utf8'));
  assert.equal(saved.batches[0].id, batch.id);
  const bad = await POST(request('missing'));
  assert.equal(bad.status,400);
  assert.match((await bad.json()).error,/unknown candidate missing/);
  const unlock = await materialsLock(cfg,'fixture',()=>{},{waitMs:10,maxWait:100}); unlock();
  console.log('approval route: awaited lock, persisted success, caught rejection and released lock');
} finally { hooks.deregister(); fs.rmSync(root,{recursive:true,force:true}); }
