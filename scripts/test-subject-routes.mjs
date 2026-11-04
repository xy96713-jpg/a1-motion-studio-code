import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; const root=process.cwd();
test('subject-demo local assets exist (drill/HDD/H100/B04/banana)',()=>{
 const routes=JSON.parse(fs.readFileSync(path.join(root,'work/recipe-board-v1/routing/project-routes.json'),'utf8'));
 const r=routes.routes.find(x=>x.id==='subject-demo'); assert.ok(r);
 const files={drill:'drill.glb',hdd:'hdd.glb',h100:'h100.glb',b04:'b04.glb',banana:'parts/banana.glb'};
 for(const id of r.subjectIds){assert.ok(fs.existsSync(path.join(root,'work/recipe-board-v1/style-lab/engine/subjects',files[id]||id+'.glb')),id+' GLB missing');}
});
