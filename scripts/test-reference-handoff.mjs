import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stepStills } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import { chapterTechniques, chapterGuidanceOf, planBeatsOf } from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';
import { briefText, sessionBrief } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';
import * as C from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const repo = path.resolve(import.meta.dirname, '..'), data = path.join(repo, 'work/recipe-board-v1');
const scratch = path.join(os.homedir(), '.hermes/cache/scratch'); fs.mkdirSync(scratch,{recursive:true});
export const sandbox = fs.mkdtempSync(path.join(scratch, 'reference-handoff-'));
const targetData = path.join(sandbox, 'work/recipe-board-v1'), target = path.join(targetData, 'projects/banana-design');
fs.mkdirSync(path.join(target, 'tasks'), {recursive:true});
for (const name of ['routing','prompts','cards','themes','style-lab']) if(fs.existsSync(path.join(data,name))) fs.symlinkSync(path.join(data,name),path.join(targetData,name));
const source = path.join(data,'projects/banana-design');
for(const name of ['shots','plan.json','storyboard.json','brief.json','style.json','project.json']) fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true});
for(const name of ['filmdesign.answer.json','filmdesign.check.json','greybox.answer.json']) fs.copyFileSync(path.join(source,'tasks',name),path.join(target,'tasks',name));
for(const name of fs.readdirSync(path.join(data,'projects'))) if(name!=='banana-design') fs.symlinkSync(path.join(data,'projects',name),path.join(targetData,'projects',name));
const cfg = {repoRoot:sandbox,sourceRoot:repo,dataDir:targetData};
test('real isolated still task recalls actual accepted design / route references', async()=>{
 const result=await stepStills(cfg,'banana-design',{log:()=>{}});
 assert.equal(result.state,'waiting');
 const task=JSON.parse(fs.readFileSync(path.join(target,'tasks/stills.task.json')));
 assert.ok(task.input.guidance.beats.some(b=>b.nearest.length),'stills guidance must not be empty due to devices:[]');
 assert.ok(task.input.referenceQueries.some(b=>b.devices.length),'actual design/ready route devices supplied');
 const opening=task.input.guidance.beats.find(b=>b.beat==='B01').nearest;
 assert.ok(opening.some(r=>r.module==='work/recipe-board-v1/projects/paperclip-138-full/chapters/B01.mjs' && r.frame && fs.existsSync(path.resolve(repo,r.frame))), 'k=3 still task retains readable routed gold');
 console.log('ISOLATED_STILLS',path.join(target,'tasks/stills.task.json'));
});
test('multiline plan2 retains real devices and no next-beat leakage',()=>{
 const p=planBeatsOf(`export const plan2={beats:{B01:{\n devices:['table-grows'],\n form:'evidence-card', follows:[{how:'nested { brace }'}]\n}, B02:{\n devices:['lineup-row']\n}}};`);
 assert.deepEqual(p.B01.devices,['table-grows']); assert.deepEqual(p.B02.devices,['lineup-row']);
 assert.deepEqual(planBeatsOf(`export const plan2={B02:{devices:[],declined:[{device:'real-prices',why:'not a price chart'}]}}`).B02.declined,[{device:'real-prices',why:'not a price chart'}]);
});
test('actual isolated session-brief dispatch includes gold images and acceptance',async()=>{
 // Only the sandbox has a synthetic gate, to exercise handoff, never a production approval.
 const p=JSON.parse(fs.readFileSync(path.join(target,'project.json'))); delete p.nasOutput;
 p.testOnly=true; p.design={...p.design,approved:true,greybox:'fixture-only'};
 fs.writeFileSync(path.join(target,'project.json'),JSON.stringify(p));
 fs.writeFileSync(path.join(target,'tasks/greybox.check.json'),JSON.stringify({ok:true,answerHash:'fixture-only'}));
 const g=C.chapterGroups(cfg,'banana-design').find(g=>g.shots.some(s=>s.shotId==='B03')); assert.ok(g);
 for(const ref of C.chapterInput(cfg,'banana-design',g).inheritance.productionFiles || []) {
  const relative=path.relative(sandbox,ref.file); assert.ok(!relative.startsWith('..'));
  fs.mkdirSync(path.dirname(ref.file),{recursive:true}); fs.copyFileSync(path.join(repo,relative),ref.file);
 }
 let builds=0; const measured={...cfg,referenceLibraryBuilder:c=>{builds++;return chapterTechniques(c)}};
 const output=await sessionBrief(measured,'banana-design',g.id), text=fs.readFileSync(output,'utf8');
 assert.equal(builds,1,'multi-beat dispatch builds library once');
 await sessionBrief(measured,'banana-design',g.id); assert.equal(builds,2,'each dispatch rebuilds; no global cache');
 assert.match(text,/本拍路由金样/); assert.match(text,/key-\d+-B\d+.png/);
 assert.match(text,/historical-pass/); assert.match(text,/适用上下文/);
 const task=JSON.parse(fs.readFileSync(path.join(target,'tasks',`morph-${g.id}.task.json`)));
 assert.ok(task.input.handoffGuides.some(f=>f.path.endsWith(path.basename(output))));
 assert.ok(task.input.guidance.beats.flatMap(b=>b.nearest).some(r=>r.module==='work/recipe-board-v1/projects/paperclip-138-full/chapters/B18.mjs' && r.frame && fs.existsSync(path.resolve(repo,r.frame))), 'k=3 chapter task retains readable gold');
 console.log('ISOLATED_BRIEF',output);
});
test('brief preserves per-beat gold paths and usable frame context',()=>{
 const gold='work/recipe-board-v1/projects/paperclip-138-full/chapters/B18.mjs';
 const text=briefText({id:'banana-design',chapter:'B08',beats:[{beat:'B08',at:0,dur:5,text:'证据'}],routes:{B08:{kind:'evidence',gold:[gold],references:[{key:'paperclip-138-full/B18/B19',module:gold,source:gold,frame:'key-2-B19.png',how:'证据图文分层',acceptance:{check:'historical-pass',review:'recorded'}}]}}});
 assert.ok(text.includes(gold),'rd.gold lost in brief'); assert.match(text,/key-2-B19.png/); assert.match(text,/historical-pass/); assert.match(text,/证据图文分层/);
});
test('context/gold retrieval preserves provenance, excludes self and leaves unmatched empty',()=>{
 const lib=chapterTechniques({sourceRoot:repo,dataDir:data});
 const q={beat:'B99',devices:[],kind:'numbers',gold:['work/recipe-board-v1/projects/paperclip-138-full/chapters/B18.mjs']};
 const result=chapterGuidanceOf(lib,[],[q],{project:'banana-design',k:100});
 const near=result.beats[0]?.nearest || [];
 assert.ok(near.some(t=>t.key==='hupo-69/shot/P04-layered' && t.acceptance.review==='unreviewed'));
 assert.ok(near.some(t=>t.key==='paperclip-138-full/B18/B19' && t.source && t.frame));
 assert.deepEqual(chapterGuidanceOf(lib,[],[{beat:'X',devices:[]}]).beats,[]);
 assert.ok(!chapterGuidanceOf(lib,[],[q],{project:'hupo-69',k:100}).beats.flatMap(b=>b.nearest).some(t=>t.key.startsWith('hupo-69/')));
});
test('adapters expose real module and layered shot sources without promoting research to approved',()=>{
 const lib=chapterTechniques({sourceRoot:repo,dataDir:data});
 const h=lib.find(t=>t.project==='hupo-69' && t.beat==='P04-layered');
 assert.ok(h,'layered shot adapter missing');
 assert.equal(h.acceptance.check,'unreviewed'); assert.equal(h.acceptance.review,'unreviewed');
 assert.ok(h.frame && fs.existsSync(path.resolve(repo,h.frame))); assert.match(h.source,/index.html$/);
 const b=lib.find(t=>t.key==='paperclip-138-full/B18/B19');
 assert.match(b.frame,/key-2-B19.png$/); assert.equal(b.acceptance.check,'historical-pass');
 assert.ok(b.source && fs.existsSync(path.resolve(repo,b.source)));
 const open=lib.filter(t=>t.project==='paperclip-138-open'); assert.ok(open.length);
 assert.ok(open.every(t=>t.acceptance.check!=='historical-pass'));
 for(const ch of ['B02','B12']) assert.ok(lib.some(t=>t.project==='suez-evergiven-blind' && t.chapter===ch && t.frame));
});
