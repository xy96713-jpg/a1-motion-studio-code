import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { changedNeeds, needPrint, retireChangedNeeds, sameSubject } from '../apps/studio-next/src/lib/recipe-board/materials.mjs';
import { renderProject } from '../apps/studio-next/src/lib/recipe-board/render.mjs';
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'legacy-needs-'));
const cfg={dataDir:root,repoRoot:root,sourceRoot:root}, id='p', dir=path.join(root,'projects',id,'materials');
fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(root,'projects',id,'project.json'),JSON.stringify({id}));
const put=(f,v)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(v));
try {
 const n={shotId:'B01',kind:'news',original:'old'};
 put('needs.json',{needs:[]}); put('candidates.json',{shots:{B01:{candidates:[]},B02:{need:{...n,shotId:'B02'}}}}); put('bindings.json',{shots:{B03:{file:'legacy'},B02:{needPrint:needPrint({...n,shotId:'B02'})}}}); put('approvals.json',{batches:[]});
 assert.deepEqual(changedNeeds(cfg,id),['B02']);
 assert.throws(()=>retireChangedNeeds(cfg,id),/B02/);
 put('needs.json',{needs:[{...n,shotId:'B02',original:'new'}]});
 assert.deepEqual(changedNeeds(cfg,id),['B02']);
 put('candidates.json',{shots:{}}); put('bindings.json',{shots:{B02:{needPrint:needPrint({...n,shotId:'B02',original:'old'})}}});
 assert.deepEqual(changedNeeds(cfg,id),['B02']);
 const donor={shotId:'B10',kind:'news',form:'logo',entity:'x',original:'x'}, target={...donor,shotId:'B11'}, file=path.join(root,'donor'); fs.writeFileSync(file,'bytes');
 assert.equal(sameSubject(target,[donor,target],{B10:{file}}),null);
 assert.ok(sameSubject(target,[donor,target],{B10:{file,needPrint:needPrint(donor)}}));
 assert.equal(sameSubject(target,[donor,donor,target],{B10:{file,needPrint:needPrint(donor)}}),null);
 // Copy real ledgers only. A deliberately invalid shots directory stops the real render
 // immediately after its material gates, before Chromium or any rendering can start.
 const src=path.resolve('work/recipe-board-v1/projects/hupo-auto2'), dest=path.join(root,'projects','hupo-auto2');
 fs.mkdirSync(path.join(dest,'materials'),{recursive:true});
 for(const f of ['needs.json','candidates.json','bindings.json','approvals.json']) fs.copyFileSync(path.join(src,'materials',f),path.join(dest,'materials',f));
 for(const f of ['project.json','storyboard.json']) fs.copyFileSync(path.join(src,f),path.join(dest,f));
 fs.writeFileSync(path.join(dest,'shots'),'stop-before-render');
 const names=['needs.json','candidates.json','bindings.json','approvals.json'], before=names.map(f=>fs.readFileSync(path.join(dest,'materials',f)));
 await assert.rejects(renderProject(cfg,'hupo-auto2',{only:new Set(['B08'])}),e=>e.code==='ENOTDIR');
 assert.deepEqual(names.map(f=>fs.readFileSync(path.join(dest,'materials',f))),before);
 console.log('legacy unknown, evidenced removal/change, reuse, isolated real B08 render gates: passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}
