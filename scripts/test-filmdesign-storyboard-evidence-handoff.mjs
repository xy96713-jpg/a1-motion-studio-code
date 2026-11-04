import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { filmDesignTask } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import { filmBeats } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { chapterTechniques } from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';
const repo=path.resolve(import.meta.dirname,'..'), data=path.join(repo,'work/recipe-board-v1'), id='paperclip-047-six';
const read=f=>JSON.parse(fs.readFileSync(f)), original=path.join(data,'projects',id);
const storyboard=read(path.join(original,'storyboard.json')), shot=storyboard.shots.find(s=>s.beat==='B18');
const library=chapterTechniques({repoRoot:repo,sourceRoot:repo,dataDir:data});
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function query(t, changes={}, design=null, text='事情发生了。') {
 const {project,cfg}=isolated(t);
 fs.writeFileSync(path.join(project,'storyboard.json'),JSON.stringify({shots:[{...shot,why:'原页定位到那一句',reads:[],...changes}]}));
 const task=filmDesignTask(cfg,id,[{beat:'B18',text,dur:8}],{design:design&&{beats:[{beat:'B18',...design}]}});
 return {row:task.input.referenceGuidance.beats[0],defaults:task.input.routeDefaults};
}
test('negative and declined evidence do not resurrect the prior intent',t=>{
 for(const changes of [
  {why:'不要使用证据，只保留文字'},
  {why:'无需报道，直接讲结论'},
  {why:'without evidence'},
  {why:'没有证据'},
  {why:'evidence is insufficient'},
  {declined:[{device:'evidence',why:'不用此方法'}]},
  {declined:[{device:'evidence-article',why:'不用此方法'}]},
  {noEvidence:'这一拍不展示原文'}
 ]) assert.equal(query(t,changes).row.status,'unknown',JSON.stringify(changes));
});
test('non-evidence and missing intent remain unknown despite asset lists',t=>{
 for(const intent of ['concept','data','person','quote','atmosphere',null]){
  const r=query(t,{intent,treatment:null});assert.equal(r.row.status,'unknown');
 }
 const r=query(t,{intent:null,treatment:null,evidence:null});
 assert.equal(r.row.context.intent,null);assert.equal(r.row.context.evidence,null);
});
test('explicit routes custom and opening retain priority without pinning prior intent',t=>{
 for(const design of [{directorIntent:{route:'custom'}},{directorIntent:{route:'numbers'}},{act:'open'},{act:'open',directorIntent:{route:'custom'}}]) {
  const a=query(t,{},design), b=query(t,{intent:'concept'},design);
  assert.deepEqual(a.row.nearest,b.row.nearest);assert.deepEqual(a.defaults,b.defaults);
 }
 assert.deepEqual(query(t).defaults,query(t,{intent:'concept'}).defaults);
});
function isolated(t) {
 const root=fs.mkdtempSync(path.join(os.homedir(),'.hermes/cache/scratch/evidence-handoff-'));
 t.after(()=>{if(process.env.RB_KEEP_EVIDENCE_TASK==='1')console.log(`artifact root: ${root}`);else fs.rmSync(root,{recursive:true,force:true});});
 const dest=path.join(root,'work/recipe-board-v1'), project=path.join(dest,'projects',id);
 fs.mkdirSync(project,{recursive:true});fs.symlinkSync(path.join(data,'routing'),path.join(dest,'routing'));
 for(const name of ['project.json','plan.json','storyboard.json'])fs.copyFileSync(path.join(original,name),path.join(project,name));
 fs.cpSync(path.join(original,'shots'),path.join(project,'shots'),{recursive:true});
 return {root,project,cfg:{repoRoot:root,sourceRoot:repo,dataDir:dest,referenceLibrary:library}};
}
test('real 29-beat blind paperclip B18 keeps explicit page intent and delivers research methods',t=>{
 const {root,project,cfg}=isolated(t);
 const files=['project.json','plan.json','storyboard.json',...fs.readdirSync(path.join(original,'tasks')).map(n=>'tasks/'+n)];
 const before=files.map(f=>hash(path.join(original,f)));
 const beats=filmBeats(cfg,id);assert.equal(beats.length,29);assert.equal(shot.intent,'evidence-article');
 const task=filmDesignTask(cfg,id,beats,{requireMotionDesign:false});
 fs.mkdirSync(path.join(project,'tasks'));fs.writeFileSync(path.join(project,'tasks/filmdesign.task.json'),JSON.stringify(task,null,2));
 const row=task.input.referenceGuidance.beats.find(b=>b.beat==='B18');
 assert.equal(row.context.intent,shot.intent,'storyboard evidence intent must survive task handoff');
 assert.equal(row.context.treatment,shot.treatment);assert.deepEqual(row.context.evidence,shot.evidence);
 assert.ok(row.nearest.length,'explicit page intent must retrieve available method candidates');
 for(const r of row.nearest){
  assert.ok(r.how,'candidate must explain its mechanism');
  for(const k of ['frame','source'])assert.ok(fs.statSync(path.resolve(repo,r[k])).isFile(),`${k} must open`);
  assert.equal(r.rightsStatus,'unknown');assert.equal(r.acceptance.currentApproval,false);
  assert.match(r.usage,/Research|research|Method/);assert.ok(!r.key.startsWith(id+'/'));
  assert.ok(!JSON.stringify(r).includes('paperclip-047/reference/'));
 }
 assert.equal(read(path.join(project,'project.json')).reference.blind,true);
 assert.deepEqual(files.map(f=>hash(path.join(original,f))),before,'production inputs/gates unchanged');
 fs.writeFileSync(path.join(root,'B18-research-candidates.json'),JSON.stringify({scope:'Research candidates only; relevance/visual suitability not independently accepted; rights and current approval unknown.',context:row.context,candidates:row.nearest,productionUnchanged:true,blind:true},null,2));
});
