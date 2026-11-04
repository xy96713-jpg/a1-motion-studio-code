import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filmDesignTask } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import { chapterTechniques } from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';
import { stepFilmLook } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
const repo=path.resolve(import.meta.dirname,'..'), data=path.join(repo,'work/recipe-board-v1');
test('real isolated task retrieves semantically relevant available method references before film design', async t=>{
 const root=fs.mkdtempSync(path.join(os.homedir(),'.hermes/cache/scratch/real-semantic-ref-'));t.after(()=>{if(process.env.RB_KEEP_SEMANTIC_TASK==='1') console.log(`isolated task: ${root}/work/recipe-board-v1/projects/banana-design/tasks/filmdesign.task.json`); else fs.rmSync(root,{recursive:true,force:true});});
 const dest=path.join(root,'work/recipe-board-v1');fs.mkdirSync(path.join(dest,'projects'),{recursive:true});fs.cpSync(path.join(data,'routing'),path.join(dest,'routing'),{recursive:true});
 const project=path.join(dest,'projects/banana-design');fs.mkdirSync(project);
 for(const n of ['project.json','plan.json','brief.json','storyboard.json','style.json','shots','materials']) {const p=path.join(data,'projects/banana-design',n);if(fs.existsSync(p))fs.cpSync(p,path.join(project,n),{recursive:true,verbatimSymlinks:true});}
 for(const n of fs.readdirSync(path.join(data,'projects'))) if(n!=='banana-design'&&fs.statSync(path.join(data,'projects',n)).isDirectory()) fs.symlinkSync(path.join(data,'projects',n),path.join(dest,'projects',n));
 const cfg={repoRoot:root,sourceRoot:repo,dataDir:dest,nasOutputRoot:null};
 assert.equal((await stepFilmLook(cfg,'banana-design',{log(){}})).state,'waiting');
 const g=JSON.parse(fs.readFileSync(path.join(project,'tasks/filmdesign.task.json'))).input.referenceGuidance;
 assert.ok(g.beats.find(x=>x.beat==='B11').nearest.some(r=>r.key==='paperclip-138-full/B10/B12'), 'B11 must retain the inspected label-region analogy, not displace it with background maps');
 const b14=g.beats.find(x=>x.beat==='B14');
 assert.ok(!b14.nearest.some(r=>r.devices.includes('quadrant-compare')), 'ordinary side-by-side vulnerability is not a two-axis comparison');
 // Its storyboard also explicitly places the subjects on a map: any surviving
 // candidate is for that geographic support only, not the shared vulnerability.
 assert.ok(b14.nearest.every(r=>r.devices.includes('map-pin-count')));
 for(const [id,device] of [['B11','label-swap'],['B15','map-pin-count']]) {
  const row=g.beats.find(x=>x.beat===id);assert.ok(row?.nearest.some(r=>r.devices?.includes(device)&&r.frame&&r.source),`${id} missing ${device}: ${JSON.stringify(row?.nearest)}`);
  assert.ok(row.context);for(const r of row.nearest){assert.equal(r.acceptance.currentApproval,false);assert.equal(r.rightsStatus,'unknown');}
 }
 assert.ok(!JSON.stringify(g).includes('L100-profile-gawx:'));
});

// Exercise the actual task/retrieval path with the real reference library, across
// unrelated topics; these assertions test mapping, not the visual quality of files.
const library=chapterTechniques({repoRoot:repo,dataDir:data});
function query(t, {text='事情发生了。', why='', devices=[], form, design=null, declined=[]}={}) {
 const root=fs.mkdtempSync(path.join(os.homedir(),'.hermes/cache/scratch/semantic-branch-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dest=path.join(root,'work/recipe-board-v1'), project=path.join(dest,'projects/cross-topic');
 fs.mkdirSync(project,{recursive:true});fs.symlinkSync(path.join(data,'routing'),path.join(dest,'routing'));
 fs.writeFileSync(path.join(project,'project.json'),JSON.stringify({id:'cross-topic'}));
 fs.writeFileSync(path.join(project,'storyboard.json'),JSON.stringify({shots:[{beat:'B07',why,devices,diagram:{form},declined:declined.map(device=>({device}))}]}));
 const task=filmDesignTask({repoRoot:root,sourceRoot:repo,dataDir:dest,referenceLibrary:library},'cross-topic',[{beat:'B07',text,dur:3}],{design:design&&{beats:[{beat:'B07',...design}]}});
 return {...task.input.referenceGuidance.beats[0], routeDefault:task.input.routeDefaults.B07};
}
for(const why of ['禁止并排比较，保留单个主体','不要并列，只看单个主体','无需比較两者','不需要地图，只保留日期']) test(`semantic denial: ${why}`,t=>{
 const r=query(t,{text:why,why,devices:why.includes('地图')?['map-pin-count']:['symmetry'],form:why.includes('地图')?'map':undefined});
 assert.equal(r.status,'unknown');assert.deepEqual(r.nearest,[]);
});
test('symmetry and ordinary side-by-side do not imply two axes',t=>{
 for(const why of ['两台发动机并排展示共同故障','两个品种并列承受同一风险','左右对称']) assert.equal(query(t,{why,devices:['symmetry']}).status,'unknown');
});
test('mixed clauses preserve affirmative map or label relation across topics',t=>{
 for(const why of ['禁止并排比较；地图标注港口','不要并列，但是地图定位发电站','不需要地图；标签替换成新型号']) {
  const d=why.includes('标签')?'label-swap':'map-pin-count', r=query(t,{text:why,why});
  assert.ok(r.nearest.some(x=>x.devices.includes(d)),why);
  assert.ok(!r.nearest.some(x=>x.devices.includes('quadrant-compare')),why);
 }
});
test('explicit two-axis relation retrieves quadrant, unlike generic comparison',t=>{
 assert.ok(query(t,{why:'发动机效率与成本的两轴比较'}).nearest.some(x=>x.devices.includes('quadrant-compare')));
});
test('denied mechanisms and declined devices stay out of candidates',t=>{
 for(const why of ['禁止两轴比较','无需四象限','不要替换成新型号']) assert.equal(query(t,{why}).status,'unknown');
 assert.equal(query(t,{why:'地图标注港口',declined:['map-pin-count']}).status,'unknown');
 assert.ok(query(t,{text:'禁止并排比较',why:'地图标注港口'}).nearest.some(x=>x.devices.includes('map-pin-count')));
});
test('explicit route and custom override prior storyboard suggestions',t=>{
 for(const route of ['numbers','custom']) {
  const design={act:'build',directorIntent:{route}};
  assert.deepEqual(query(t,{text:'地图',why:'地图标注港口',devices:['map-pin-count'],design}).nearest.map(x=>x.key),query(t,{design}).nearest.map(x=>x.key));
 }
});
test('opening priority wins over explicit route/custom and prior map suggestion',t=>{
 const opening=query(t,{design:{act:'open'}}), expected=opening.nearest.map(x=>x.key);
 assert.equal(opening.routeDefault.kind,'opening');
 for(const route of ['map','custom']) {
  const row=query(t,{text:'地图',why:'地图标注港口',design:{act:'open',directorIntent:{route}}});
  assert.equal(row.routeDefault.kind,'opening');
  assert.deepEqual(row.nearest.map(x=>x.key),expected);
 }
});
test('candidate usage limits label analogy and geographic annotation',t=>{
 const label=query(t,{why:'标签替换成新型号'}).nearest.find(x=>x.key==='paperclip-138-full/B10/B12');
 const map=query(t,{why:'地图标注港口'}).nearest.find(x=>x.key==='paperclip-138-full/B18/B19');
 assert.match(label?.usage || '',/标签区域换词/);
 assert.match(label?.usage || '',/不.*农业/);
 assert.match(map?.usage || '',/地理标注/);
 assert.match(map?.usage || '',/不能.*传播路线/);
});

