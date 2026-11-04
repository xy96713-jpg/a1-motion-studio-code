import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {stepStills} from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import {sessionBrief} from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';
import {chapterGuidance} from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';
import {chapterGroups,chapterInput} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import {loadDirectorRoutes,matchRouteKind} from '../apps/studio-next/src/lib/recipe-board/directorroutes.mjs';
const repo=path.resolve(import.meta.dirname,'..'), source=path.join(repo,'work/recipe-board-v1');
const scratch=path.join(os.homedir(),'.hermes/cache/scratch'); fs.mkdirSync(scratch,{recursive:true});
function fixture(t,id,kind,text){
 const root=fs.mkdtempSync(path.join(scratch,'hupo-director-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dataDir=path.join(root,'work/recipe-board-v1'),p=path.join(dataDir,'projects',id);
 fs.cpSync(path.join(source,'routing'),path.join(dataDir,'routing'),{recursive:true});
 for(const rel of ['work/recipe-board-v1/HOUSE.md','work/recipe-board-v1/TYPE.md','work/recipe-board-v1/prompts/morph.md','AGENTS.md','SOP.md','.codex/skills/recipe-board-director/SKILL.md']) {const dest=path.join(root,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(repo,rel),dest);}
 const put=(file,value)=>{let f=path.join(root,file);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof value==='string'?value:JSON.stringify(value));};
 const base=`work/recipe-board-v1/projects/${id}/`;
 put(base+'project.json',{id,testOnly:true,agents:{default:'manual'}});
 put(base+'plan.json',{beats:[{id:'B01',text}]}); put(base+'shots/B01.json',{shotId:'B01',recipe:'morph-chapter',motion:{duration:5}});
 const answer=JSON.stringify({arc:'synthetic',beats:[{beat:'B01',hero:true,act:'build',kind}]});
 put(base+'tasks/filmdesign.answer.json',answer);put(base+'tasks/filmdesign.check.json',{ok:true,answerHash:crypto.createHash('sha256').update(answer).digest('hex').slice(0,16)});
 put('work/bv1a63d6ceba-packaging-study-20260923/clip-index.csv','id,start,end,category,title,file,decode\nP02,00:01.000,00:02.000,证据,新闻证据高亮,clips/missing.mp4,PASS\nP26,00:03.000,00:04.000,原理图,原生与优化调度,clips/missing.mp4,PASS\nP32,00:05.000,00:06.000,原理图,旧训练方法四节点,clips/missing.mp4,PASS\nP36,00:07.000,00:08.000,原理图,新训练方法五节点,clips/missing.mp4,PASS\n');
 put('work/hupo-69-shot-reconstruction-v1/source-reference-frames-v1/69-shot-hold-contact-v2.json',{frames:[{shotId:'P02',sourceFrame:900,sourceTimeSeconds:15},{shotId:'P26',sourceFrame:105,sourceTimeSeconds:3.5},{shotId:'P32',sourceFrame:165,sourceTimeSeconds:5.5},{shotId:'P36',sourceFrame:225,sourceTimeSeconds:7.5}]});
 return {root,dataDir,p,cfg:{repoRoot:root,sourceRoot:root,dataDir},put};
}
test('real still task and chapter guide inherit only their routed hupo index',async t=>{
 for(const [kind,text,want] of [['evidence','新闻证据高亮','P02'],['compare','原生与优化调度','P26'],['map','旧训练方法四节点',null],['process','旧训练方法四节点',null],['process','新训练方法五节点',null]]){
  const {cfg,p,root}=fixture(t,'fixture',kind,text);
  assert.equal((await stepStills(cfg,'fixture',{log(){}})).state,'waiting');
  const task=JSON.parse(fs.readFileSync(path.join(p,'tasks/stills.task.json'))), q=task.input.referenceQueries[0]; assert.equal(q.kind,kind==='process'?null:kind);
  const refs=task.input.guidance.beats.flatMap(b=>b.nearest).filter(x=>x.adapter==='hupo-original-index');
  if(want) assert.ok(refs.some(x=>x.shotId===want),JSON.stringify(refs)); else assert.equal(refs.length,0);
  const group=chapterGroups(cfg,'fixture')[0];
  for(const ref of chapterInput(cfg,'fixture',group).inheritance.productionFiles||[]){const relative=path.relative(root,ref.file);assert.ok(!relative.startsWith('..'));const src=path.join(repo,relative);if(fs.existsSync(src)){fs.mkdirSync(path.dirname(ref.file),{recursive:true});fs.copyFileSync(src,ref.file);}}
  const guide=fs.readFileSync(await sessionBrief(cfg,'fixture',group.id),'utf8');
  if(want) assert.match(guide,new RegExp(`历史索引 hupo-69/index/${want}`)); else assert.doesNotMatch(guide,/历史索引 hupo-69\/index\//);
  if(want==='P02'){assert.equal(refs[0].timeStatus,'conflict');assert.equal(refs[0].clip.end,'00:02.000');assert.equal(refs[0].indexedFrame.sourceTimeSeconds,15);assert.match(guide,/timeStatus=conflict/);assert.match(guide,/00:02\.000/);assert.match(guide,/sourceTimeSeconds\":15/);}
 }
});
test('cross-project switching excludes self and missing frame index remains unknown in both consumers',async t=>{
 const {cfg,p,root,dataDir}=fixture(t,'fixture','evidence','新闻证据高亮');
 fs.cpSync(p,path.join(dataDir,'projects/hupo-69'),{recursive:true});
 for(const [id,expected] of [['fixture',true],['hupo-69',false],['fixture',true]]){
  await stepStills(cfg,id,{log(){}});
  const dir=path.join(dataDir,'projects',id), task=JSON.parse(fs.readFileSync(path.join(dir,'tasks/stills.task.json')));
  const refs=task.input.guidance.beats.flatMap(b=>b.nearest).filter(x=>x.adapter==='hupo-original-index');
  assert.equal(refs.some(x=>x.shotId==='P02'),expected,id);
  const group=chapterGroups(cfg,id)[0];
  for(const ref of chapterInput(cfg,id,group).inheritance.productionFiles||[]){const rel=path.relative(root,ref.file);assert.ok(!rel.startsWith('..'));const src=path.join(repo,rel);if(fs.existsSync(src)){fs.mkdirSync(path.dirname(ref.file),{recursive:true});fs.copyFileSync(src,ref.file);}}
  const guide=fs.readFileSync(await sessionBrief(cfg,id,group.id),'utf8');
  assert.equal(guide.includes('历史索引 hupo-69/index/P02'),expected,id);
 }
 fs.rmSync(path.join(root,'work/hupo-69-shot-reconstruction-v1/source-reference-frames-v1/69-shot-hold-contact-v2.json'));
 await stepStills(cfg,'fixture',{log(){}});
 const task=JSON.parse(fs.readFileSync(path.join(p,'tasks/stills.task.json'))), ref=task.input.guidance.beats.flatMap(b=>b.nearest).find(x=>x.shotId==='P02');
 assert.equal(ref.frame,null);assert.equal(ref.frameIdentity,'unknown');assert.equal(ref.timeStatus,'unknown');assert.equal(ref.indexedFrame,null);
 const guide=fs.readFileSync(await sessionBrief(cfg,'fixture','B01'),'utf8');assert.match(guide,/indexedFrame=null，timeStatus=unknown/);
});
test('process index P32 and P36 preserve independent identities, without claiming director routing',t=>{
 const {cfg}=fixture(t,'fixture','process','旧训练方法四节点');
 for(const [text,id,time] of [['旧训练方法四节点','P32',5.5],['新训练方法五节点','P36',7.5]]) {
  const rows=chapterGuidance(cfg,'fixture',[{beat:'B01',kind:'process',text,devices:[]}],{k:1}).beats[0].nearest;
  assert.equal(rows[0].shotId,id);assert.equal(rows[0].indexedFrame.sourceTimeSeconds,time);
 }
});
test('the real route table does not express a process route',t=>{const {cfg}=fixture(t,'fixture','process','旧训练方法四节点');const table=loadDirectorRoutes(cfg);assert.ok(!table.routes.some(r=>r.kind==='process'));assert.equal(matchRouteKind({kind:'process',text:'旧训练方法四节点'},table),null);});
