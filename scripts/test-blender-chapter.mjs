import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { dispatchCapability } from '../apps/studio-next/src/lib/recipe-board/p1hard.mjs';
import { prepareAssets } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const doc = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/engine-capabilities.json'));
assert.equal(dispatchCapability(doc, 'blender-bakes').chapterCallable, true, 'registered Blender chapter capability must dispatch');
assert.equal(dispatchCapability(doc, 'blender-bakes').codeSymbol, 'kit.engine.baked.rigid');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-chapter-'));
try {
 const cfg = {repoRoot:root, sourceRoot:process.cwd(), dataDir:path.join(root,'data')};
 const project = path.join(cfg.dataDir,'projects/proof'); fs.mkdirSync(project,{recursive:true}); fs.writeFileSync(path.join(project,'project.json'),'{}');
 const g = {id:'B01',shots:[{shotId:'B01',at:0,dur:1}],total:1};
 const bad = await prepareAssets(cfg,'proof',g,{code:'',bakes:[{key:'drop',kind:'rigid',request:'{}'}]});
 assert.match(bad.errors.join(), /bake drop:.*contract/,'invalid bake requests must fail before Blender');
 const traversal = await prepareAssets(cfg,'proof',g,{code:'',bakes:[{key:'../escape',kind:'rigid',request:'{}'}]});
 assert.match(traversal.errors.join(), /bake.*key/);
 const schema = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/morph.schema.json'));
 assert.ok(schema.properties.bakes,'real task schema admits bakes');
 const { engineCodeHash } = await import('../apps/studio-next/src/lib/recipe-board/chapter.mjs');
 const bakedSource = path.join(root,'work/recipe-board-v1/style-lab/engine/three/baked.js'); fs.mkdirSync(path.dirname(bakedSource),{recursive:true});
 fs.writeFileSync(bakedSource,'export const version=1;'); const before=engineCodeHash({repoRoot:root});
 fs.writeFileSync(bakedSource,'export const version=2;'); assert.notEqual(engineCodeHash({repoRoot:root}),before,'bake player changes must invalidate chapter cache');
 assert.match(fs.readFileSync('apps/studio-next/src/lib/recipe-board/stills.mjs','utf8'), /JSON\.stringify\(answer\.bakes \|\| \[\]\)/, 'bake requests must be included in stills cache identity');
 console.log('Blender chapter dispatch, schema and fail-closed preparation PASS');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
