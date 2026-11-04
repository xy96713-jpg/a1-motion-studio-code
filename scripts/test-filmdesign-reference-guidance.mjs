import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stepFilmDesign } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import { chapterTechniques } from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';

test('isolated real film design task delivers per-beat candidate references without approval transfer', async t => {
 const root=fs.mkdtempSync(path.join(os.homedir(),'.hermes/cache/scratch/film-ref-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dataDir=path.join(root,'work/recipe-board-v1');
 const put=(p,v)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v));};
 const base='work/recipe-board-v1';
 put(`${base}/projects/new/project.json`,{id:'new',gateSet:'design'});
 const refs=[['evidence','old-evidence','B01'],['map','old-map','B02'],['evidence','new','B03'],['map','missing','B04']].map(([kind,project,beat])=>({id:`${project}/${beat}`,project,beat,kinds:[kind],frame:`assets/${project}.png`,source:`assets/${project}.mjs`,mechanism:kind,scope:'historical only'}));
 put(`${base}/routing/exemplars.json`,{chapterReferences:refs});
 put(`${base}/routing/palettes.json`,{palettes:[]});
 for(const p of ['old-evidence','old-map','new']) {const f=path.join(root,`assets/${p}.png`);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xsAAAAASUVORK5CYII=','base64'));put(`assets/${p}.mjs`,'export const reference = true;');}
 let builds=0; const cfg={sourceRoot:root,repoRoot:root,dataDir,referenceLibraryBuilder:c=>{ builds++; return chapterTechniques(c); }};
 const beats=[{beat:'B01',text:'报道证据',dur:1},{beat:'B02',text:'地图',dur:1},{beat:'B03',text:'一段无关内容',dur:1}];
 assert.equal((await stepFilmDesign(cfg,'new',beats,{log:()=>{}})).state,'waiting');
 const g=JSON.parse(fs.readFileSync(path.join(dataDir,'projects/new/tasks/filmdesign.task.json'))).input.referenceGuidance;
 assert.equal(builds,1); assert.ok(g); const rows=Object.fromEntries(g.beats.map(x=>[x.beat,x]));
 const ev=rows.B01.nearest.find(x=>x.project==='old-evidence'), map=rows.B02.nearest.find(x=>x.project==='old-map');
 for(const r of [ev,map]) {assert.ok(r.frame && fs.existsSync(path.resolve(root,r.frame)));assert.ok(r.module && fs.existsSync(path.resolve(root,r.module)));assert.equal(r.acceptance.currentApproval,false);assert.equal(r.pathBase,'repo-root');}
 assert.ok(!rows.B01.nearest.some(x=>x.project==='new'||x.project==='old-map'));
 assert.ok(!rows.B02.nearest.some(x=>x.project==='old-evidence'));
 assert.ok(!rows.B02.nearest.some(x=>x.project==='missing'));
 assert.deepEqual(rows.B03.nearest,[]);assert.equal(rows.B03.status,'unknown');
});
