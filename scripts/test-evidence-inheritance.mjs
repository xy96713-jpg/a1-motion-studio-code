import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { chapterGuidance } from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';
import { stepStills } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import { chapterGroups, chapterInput } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const repo=path.resolve(import.meta.dirname,'..');
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-inherit-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dataDir=path.join(root,'work/recipe-board-v1'), p=path.join(dataDir,'projects/fixture');
 fs.mkdirSync(p,{recursive:true});
 fs.cpSync(path.join(repo,'work/recipe-board-v1/routing'),path.join(dataDir,'routing'),{recursive:true});
 const write=(f,v)=>{const q=path.join(root,f);fs.mkdirSync(path.dirname(q),{recursive:true});fs.writeFileSync(q,typeof v==='string'?v:JSON.stringify(v));};
 const base='work/recipe-board-v1/';
 const entries=['alpha','beta'].map((id,i)=>({id:`${id}/sample`,project:id,kinds:i?['evidence','map']:['evidence'],mechanism:`synthetic method ${i}`,frame:`${base}projects/${id}/frame.png`,source:`${base}projects/${id}/source.mjs`,scope:'Synthetic historical reference, not approved'}));
 write(`${base}routing/exemplars.json`,{contract:'A1RecipeBoardExemplars/v1',chapterReferences:entries,cards:{}});
 for(const e of entries){write(e.frame,'synthetic frame');write(e.source,'// synthetic reference');}
 write(`${base}projects/fixture/project.json`,{id:'fixture',testOnly:true,agents:{default:'manual'}});
 write(`${base}projects/fixture/plan.json`,{beats:[{id:'B01',text:'证据地图'}]});
 write(`${base}projects/fixture/shots/B01.json`,{shotId:'B01',recipe:'morph-chapter',motion:{duration:5}});
 const design=JSON.stringify({arc:'synthetic',beats:[{beat:'B01',hero:false,activeRevision:true,kind:'evidence',composition:'evidence-card'}]});
 write(`${base}projects/fixture/tasks/filmdesign.answer.json`,design);
 write(`${base}projects/fixture/tasks/filmdesign.check.json`,{ok:true,answerHash:crypto.createHash('sha256').update(design).digest('hex').slice(0,16)});
 return {cfg:{repoRoot:root,sourceRoot:root,dataDir},root,p,entries,write};
}
const exemplars=g=>g.beats.flatMap(x=>x.nearest).filter(x=>x.adapter==='historical-exemplar');
test('semantic boundaries and explicit routes avoid unrelated exemplars',t=>{
 const {cfg}=fixture(t);
 for(const text of ['roadmap','evidence-free','证据不足','不能引用','evidence is lacking']) assert.equal(exemplars(chapterGuidance(cfg,'fixture',[{beat:'B01',text}])).length,0,text);
 for(const b of [{kind:'opening',text:'地图证据'},{composition:'hero-object',text:'地图证据'}]) assert.equal(exemplars(chapterGuidance(cfg,'fixture',[{beat:'B01',...b}])).length,0);
 for(const b of [{kind:'evidence'},{kind:'map'},{composition:'evidence-card'},{text:'map evidence'}]) assert.ok(exemplars(chapterGuidance(cfg,'fixture',[{beat:'B01',...b}])).length,JSON.stringify(b));
});
test('references retain honest historical scope, missing files and self exclusion',t=>{
 const {cfg,root,entries}=fixture(t), query=[{beat:'B01',kind:'evidence'}];
 let refs=exemplars(chapterGuidance(cfg,'fixture',query)); assert.equal(refs.length,2);
 assert.ok(refs.every(x=>x.acceptance.currentApproval===false && x.acceptance.hashBinding==='unknown' && x.frame && x.source));
 assert.ok(!exemplars(chapterGuidance(cfg,'alpha',query)).some(x=>x.key===entries[0].id));
 fs.rmSync(path.join(root,entries[0].frame)); fs.rmSync(path.join(root,entries[0].source));
 refs=exemplars(chapterGuidance(cfg,'fixture',query)); const missing=refs.find(x=>x.key===entries[0].id);
 assert.equal(missing.frame,null);assert.equal(missing.frameStatus,'unknown');assert.equal(missing.sourceStatus,'unknown');
});
test('explicit restrictions do not pass as usable, absent fields stay unknown',t=>{
 const {cfg,entries,write}=fixture(t); entries.push({...entries[0],id:'limited',project:'limited',rights:{status:'RESTRICTED'}},{...entries[1],id:'language-mismatch',project:'foreign',language:'incompatible'});
 write('work/recipe-board-v1/routing/exemplars.json',{contract:'A1RecipeBoardExemplars/v1',chapterReferences:entries});
 const refs=exemplars(chapterGuidance(cfg,'fixture',[{beat:'B01',kind:'evidence'}]));
 assert.deepEqual(refs.map(x=>x.key),entries.slice(0,2).map(x=>x.id));
 assert.ok(refs.every(x=>x.rightsStatus==='unknown' && x.languageStatus==='unknown'));
});
test('same beat and source collapse, different beat sharing source survives and k=1 stays bounded',t=>{
 const {cfg,entries,write}=fixture(t);
 entries[0].beat='B01';
 entries.push({...entries[0],id:'duplicate/alias',project:'duplicate',beat:'B01'});
 entries.push({...entries[0],id:'duplicate/other',project:'duplicate',beat:'B02'});
 entries.push({...entries[1],id:'alpha/second-source',project:'alpha',beat:'B01'});
 write('work/recipe-board-v1/routing/exemplars.json',{contract:'A1RecipeBoardExemplars/v1',chapterReferences:entries});
 const query=[{beat:'B01',kind:'evidence'}];
 const all=exemplars(chapterGuidance(cfg,'fixture',query,{k:10}));
 assert.equal(all.length,4);
 assert.ok(all.some(x=>x.key==='alpha/second-source'));
 assert.ok(all.some(x=>x.key==='duplicate/other')); assert.equal(all.filter(x=>x.source===entries[0].source && x.beat==='B01').length,1);
 assert.equal(exemplars(chapterGuidance(cfg,'fixture',query,{k:1})).length,1);
});
test('hero evidence in a real still task routes to opening',async t=>{
 const {cfg,p,write}=fixture(t);
 const design=JSON.stringify({arc:'synthetic',beats:[{beat:'B01',hero:true,kind:'evidence',composition:'evidence-card'}]});
 write('work/recipe-board-v1/projects/fixture/tasks/filmdesign.answer.json',design);
 write('work/recipe-board-v1/projects/fixture/tasks/filmdesign.check.json',{ok:true,answerHash:crypto.createHash('sha256').update(design).digest('hex').slice(0,16)});
 await stepStills(cfg,'fixture',{log:()=>{}});
 const task=JSON.parse(fs.readFileSync(path.join(p,'tasks/stills.task.json')));
 assert.equal(task.input.referenceQueries[0].kind,'opening');
 assert.equal(exemplars(task.input.guidance).length,0);
});
test('actual task routes negative evidence with map, custom, and explicit override',async t=>{
 for (const [text,row,want] of [
  ['证据不足但有地图',{},'map'], ['证据',{directorIntent:{route:'custom'}},null],
  ['证据',{kind:'evidence',directorIntent:{route:'map'}},'map']]) {
  const {cfg,p,write}=fixture(t);
  const design=JSON.stringify({arc:'synthetic',beats:[{beat:'B01',hero:false,activeRevision:true,...row}]});
  write('work/recipe-board-v1/projects/fixture/plan.json',{beats:[{id:'B01',text}]});
  write('work/recipe-board-v1/projects/fixture/tasks/filmdesign.answer.json',design);
  write('work/recipe-board-v1/projects/fixture/tasks/filmdesign.check.json',{ok:true,answerHash:crypto.createHash('sha256').update(design).digest('hex').slice(0,16)});
  await stepStills(cfg,'fixture',{log:()=>{}});
  const task=JSON.parse(fs.readFileSync(path.join(p,'tasks/stills.task.json')));
  assert.equal(task.input.referenceQueries[0].kind,want,text);
  const chapter=chapterInput(cfg,'fixture',chapterGroups(cfg,'fixture')[0]);
  const refs=exemplars(chapter.guidance);
  assert.equal(refs.length,want==='map'?1:0,text);
 }
});
test('real still task and chapter input consume sandbox references',async t=>{
 const {cfg,p}=fixture(t); const result=await stepStills(cfg,'fixture',{log:()=>{}}); assert.equal(result.state,'waiting');
 const task=JSON.parse(fs.readFileSync(path.join(p,'tasks/stills.task.json'))); const refs=exemplars(task.input.guidance);
 assert.equal(refs.length,2);assert.ok(refs.every(x=>x.frame && x.source && x.acceptance.currentApproval===false));
 const group=chapterGroups(cfg,'fixture')[0];assert.ok(group); const fromChapter=exemplars(chapterInput(cfg,'fixture',group).guidance);
 assert.equal(fromChapter.length,2);assert.ok(fromChapter.every(x=>x.frame && x.source && x.acceptance.currentApproval===false));
});
