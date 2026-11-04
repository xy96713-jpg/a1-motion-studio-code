import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { singleShapePlan } from '../work/recipe-board-v1/style-lab/engine/image3d/single-shape.mjs';

test('single-image seed reaches pipeline and separates cache identities', async () => {
 const root=mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'image3d-seed-'));
 try {
  const mod=path.join(root,'mods'); mkdirSync(path.join(mod,'PIL'),{recursive:true}); mkdirSync(path.join(mod,'hy3dgen'),{recursive:true});
  writeFileSync(path.join(mod,'torch.py'), "float16='float16'\ndef manual_seed(s): return ('generator',s)\n");
  writeFileSync(path.join(mod,'PIL','__init__.py'), "class Img:\n mode='RGBA'\n def save(self,p): pass\nclass Image:\n @staticmethod\n def open(p): return Img()\n");
  writeFileSync(path.join(mod,'hy3dgen','__init__.py'), '');
  writeFileSync(path.join(mod,'hy3dgen','rembg.py'), 'class BackgroundRemover: pass\n');
  writeFileSync(path.join(mod,'hy3dgen','shapegen.py'), "import json,os\nclass Mesh:\n faces=[1]\n def export(self,p): open(p,'w').write('stub')\nclass Hunyuan3DDiTFlowMatchingPipeline:\n @classmethod\n def from_pretrained(cls,*a,**k): return cls()\n def __call__(self,**k):\n  json.dump(k['generator'][1],open(os.environ['TRACE'],'w'))\n  return [Mesh()]\nclass FloaterRemover:\n def __call__(self,m): return m\nclass DegenerateFaceRemover(FloaterRemover): pass\n");
  let keys=[];
  for (const seed of [0,7,12345,4294967295]) {
   const p=singleShapePlan({seed,steps:30,octree:256},Buffer.from('image'),Buffer.from('cut script'));
   keys.push(p.key);
   const trace=path.join(root,'trace');
   const run=spawnSync('python3',[p.script,'in.png',path.join(root,'out.glb'),...p.args],{env:{...process.env,PYTHONPATH:mod,TRACE:trace},encoding:'utf8'});
   assert.equal(run.status,0,run.stderr); assert.equal(JSON.parse(readFileSync(trace)),seed);
  }
  assert.equal(new Set(keys).size,keys.length);
  const def = singleShapePlan({},Buffer.from('image'),Buffer.from('cut script'));
  const isolated=path.join(root,'adapter'); mkdirSync(isolated);
  const original=path.dirname(fileURLToPath(new URL('../work/recipe-board-v1/style-lab/engine/image3d/single-shape.mjs',import.meta.url)));
  for(const f of ['single-shape.mjs','single-shape.py']) copyFileSync(path.join(original,f),path.join(isolated,f));
  const copied=await import(pathToFileURL(path.join(isolated,'single-shape.mjs')).href);
  const before=copied.singleShapePlan({},Buffer.from('image'),Buffer.from('cut script')).key;
  writeFileSync(path.join(isolated,'single-shape.py'),readFileSync(path.join(isolated,'single-shape.py'))+'\n# changed\n');
  assert.notEqual(copied.singleShapePlan({},Buffer.from('image'),Buffer.from('cut script')).key,before);
  assert.equal(def.seed,7);
  const trace=path.join(root,'default-trace');
  const defaultRun=spawnSync('python3',[def.script,'in.png',path.join(root,'out.glb')],{env:{...process.env,PYTHONPATH:mod,TRACE:trace},encoding:'utf8'});
  assert.equal(defaultRun.status,0,defaultRun.stderr); assert.equal(JSON.parse(readFileSync(trace)),7);
  for(const seed of [-1,4294967296,1.5,'7',null]) assert.throws(()=>singleShapePlan({seed},Buffer.from('x'),Buffer.from('x')));
  for(const seed of ['-1','4294967296','1.5']) {
   const bad=spawnSync('python3',[def.script,'in','out','30','256',seed],{env:{...process.env,PYTHONPATH:mod},encoding:'utf8'});
   assert.notEqual(bad.status,0); assert.match(bad.stderr,/seed must be an integer/);
  }
 } finally { rmSync(root,{recursive:true,force:true}); }
});
