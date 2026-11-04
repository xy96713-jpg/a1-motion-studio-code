// Exercise the actual GET handler against a disposable repo root, never production assets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(new URL('../apps/studio-next/package.json', import.meta.url));
const ts = require('typescript');
const root = await fs.mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(), 'historical-route-'));
const base = 'work/banana-full-stills-production-20261030';
const receipt = `${base}/final-round8-20261031/final-acceptance.json`;
const plan = 'work/recipe-board-v1/projects/banana-design/plan.json';
const image = beat => `${base}/map-locator-design-20261031/after-frames/${beat}.png`;
const bytes = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
const sha = createHash('sha256').update(bytes).digest('hex');
const put = async (name, content) => {const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,content)};
const source = await fs.readFile(new URL('../apps/studio-next/src/app/api/recipe-board/historical-stills/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace('import {boardConfig} from "@/lib/recipe-board/store.mjs";', `const boardConfig = () => ({repoRoot: ${JSON.stringify(root)}});`), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
await put('route.mjs',compiled);
assert.ok(source.includes('import {boardConfig} from "@/lib/recipe-board/store.mjs";'), 'fixture root substitution must match');
const route = await import(pathToFileURL(path.join(root,'route.mjs')));
const {GET} = route;
const get = q => GET(new Request(`http://fixture/api/recipe-board/historical-stills?project=banana-design${q || ''}`));
const beats = Array.from({length:20},(_,i)=>`B${String(i+1).padStart(2,'0')}`);
await put(plan,JSON.stringify({beats:beats.map(id=>({id,text:'fixture'}))}));
const manifest = JSON.stringify({schema:'NightFinalAcceptance/v1',shots:beats.map(beat=>({beat,selected:image(beat),sha256:sha,versionStatus:'unknown'}))});
for (const beat of beats) await put(image(beat),bytes);
test('missing manifest is refused, not reported as reviewed',async()=>{assert.equal((await get()).status,404)});
test('fixture manifest and all pinned images work; invalid scope and pins fail',async()=>{
  await put(receipt,manifest);
  const data=await (await get()).json();
  assert.equal(data.rows.length,20); assert.equal(new Set(data.rows.map(r=>r.beat)).size,20);
  for (const row of data.rows) { assert.equal(row.matches,true); assert.equal((await get(`&beat=${row.beat}&sha256=${row.sha256}`)).status,200); }
  for (const query of ['project=other','project=banana-design&beat=B99&sha256=x','project=banana-design&beat=..%2F..%2Fetc%2Fpasswd&sha256=x',`project=banana-design&beat=B01&sha256=${'0'.repeat(64)}`]) assert.equal((await GET(new Request(`http://fixture/?${query}`))).status,404);
  assert.equal(route.POST,undefined, 'Next route has no POST handler');
});
test('changed, missing and symlinked image bytes are rejected',async()=>{
  const pinned=`&beat=B01&sha256=${sha}`;
  assert.equal((await get(pinned)).status,200);
  for (const mutation of [async()=>put(image('B01'),Buffer.from('replacement')),async()=>fs.rm(path.join(root,image('B01'))),async()=>{await fs.rm(path.join(root,image('B01')),{force:true});await fs.symlink(path.join(root,image('B02')),path.join(root,image('B01')))}]) {
    await mutation();
    const response=await get(); assert.equal(response.status,200); const row=(await response.json()).rows.find(r=>r.beat==='B01'); assert.equal(row.matches,false); assert.equal((await get(pinned)).status,404);
  }
});
test('symlinked manifest is refused',async()=>{await fs.rename(path.join(root,receipt),path.join(root,receipt)+'.real');await fs.symlink(path.join(root,receipt)+'.real',path.join(root,receipt));assert.equal((await get()).status,404)});
process.on('exit',()=>require('node:fs').rmSync(root,{recursive:true,force:true}));
