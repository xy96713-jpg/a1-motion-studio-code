import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const repo=process.cwd();
const lib=repo+'/apps/studio-next/src/lib/recipe-board/';
const {runProject,projectState}=await import(lib+'run.mjs');
const {chapterGroups,stepChapters,finalPreflight,renderFinal,screensOf}=await import(lib+'chapter.mjs');
const {loadShots}=await import(lib+'store.mjs');
const {finishOf}=await import(lib+'finish.mjs');
const {finalKey,finalPlan}=await import(lib+'animatic.mjs');
const {approvedGreybox}=await import(lib+'greybox.mjs');
const {applyStoryboard}=await import(lib+'storyboard.mjs');
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('network forbidden')};
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'redesign-safety-'));
const cfg={dataDir:path.join(root,'data'),repoRoot:root,sourceRoot:repo}, id='fixture', p=path.join(cfg.dataDir,'projects',id);
const put=(f,x)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n')};
try {
 for(const n of ['recipes','routing','themes','worlds']) fs.cpSync(path.join(repo,'work/recipe-board-v1',n),path.join(cfg.dataDir,n),{recursive:true});
 const project={id,process:'six-stage',gateSet:'design',design:{approved:true,by:'user',greybox:'g'}};
 put(p+'/project.json',project); put(p+'/tasks/greybox.check.json',{ok:true,answerHash:'g'}); put(p+'/tasks/greybox.answer.json',{beats:[]});
 const beat=id=>({id,text:id,onScreen:{headline:id,keywords:[]},route:{recipe:'morph-chapter'}});
 put(p+'/plan.json',{beats:[beat('B01'),beat('B02')]});
 for(const b of ['B01','B02']) put(p+'/shots/'+b+'.json',{shotId:b,recipe:'morph-chapter',motion:{duration:4},design:{evidence:[]}});
 put(p+'/chapters/B02.json',{shots:['B02']});
 put(p+'/storyboard.json',{shots:[{beat:'B01',card:'footage-plate',seconds:4,hero:{action:'hold',at:0},camera:{move:'locked',amount:0},evidence:[]},{beat:'B02',card:'morph-chapter',seconds:4,hero:{action:'hold',at:0},camera:{move:'locked',amount:0},evidence:[]}]});
 assert.equal(approvedGreybox(cfg,id).state,'approved');
 assert.deepEqual(projectState(cfg,id).redesign,['B01']);
 assert.deepEqual(chapterGroups(cfg,id).map(g=>g.id),['B01','B02']);
 const snapshot=fs.readFileSync(p+'/shots/B01.json','utf8'), approval=fs.readFileSync(p+'/project.json','utf8');
 assert.deepEqual(applyStoryboard(cfg,id).redesign,['B01']);
 const log=[];
 const {sessionBrief}=await import(lib+'sessionbrief.mjs');
 const {refreshChapterTask}=await import(lib+'chapter.mjs');
 const taskBytes=()=>Object.fromEntries(fs.readdirSync(p+'/tasks').sort().map(f=>[f,fs.readFileSync(p+'/tasks/'+f,'utf8')]));
 const beforeTasks=taskBytes();
 await assert.rejects(sessionBrief(cfg,id,'B01'),/unapplied storyboard rewrite.*B01/);
 assert.throws(()=>refreshChapterTask(cfg,id,'B01'),/unapplied storyboard rewrite.*B01/);
 assert.deepEqual(taskBytes(),beforeTasks,'blocked direct entry must not write');
 // A blocked rewrite propagates to its caller; do not let the promise outlive this fixture.
 await assert.rejects(runProject(cfg,id,{from:'write',to:'chapter',skip:['facts','screen','materials','fetch','passages','concept','art','stage'],log:x=>log.push(x)}), /shot rewrite blocked/);
 assert.equal(fs.readFileSync(p+'/shots/B01.json','utf8'),snapshot);
 // Exercise independent chapter dispatch without bypassing or retrying the blocked rewrite.
 await runProject(cfg,id,{from:'chapter',to:'chapter',log:x=>log.push(x)});
 assert.ok(fs.existsSync(p+'/tasks/morph-B02.task.json') || fs.existsSync(p+'/tasks/design-B02.task.json') || fs.existsSync(p+'/tasks/session-B02.md'), 'B02 must receive a real chapter task');
 assert.equal(fs.readFileSync(p+'/shots/B01.json','utf8'),snapshot); assert.equal(fs.readFileSync(p+'/project.json','utf8'),approval);
 assert.ok(fs.existsSync(p+'/tasks/morph-B02.task.json')); assert.ok(!fs.existsSync(p+'/tasks/morph-B01.task.json')); const b1=chapterGroups(cfg,id)[0]; assert.match((await finalPreflight(cfg,id,b1)).error,/unapplied/); await assert.rejects(renderFinal(cfg,id,b1),/unapplied/); const direct=await stepChapters(cfg,id,{only:new Set(['B01']),review:false,renderDrafts:false,log:()=>{}}); assert.ok(direct.waiting.includes('B01')); assert.deepEqual(direct.accepted,[]); const {buildFinal}=await import(lib+'animatic.mjs'); await assert.rejects(buildFinal(cfg,id),/unapplied/);
 // An exact pre-existing final assembly can be returned without any new render or assembly.
 const groups=chapterGroups(cfg,id), inChapter={}, films={};
 for(const g of groups){ for(const s of g.shots) inChapter[s.shotId]={g,s}; const f=`${p}/out/chapters/${g.id}/out/render/${g.id}-clean.mp4`; fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,'existing'); films[g.id]={clean:f}; }
 const shots=loadShots(cfg,id).sort((a,b)=>a.shotId.localeCompare(b.shotId,'en',{numeric:true}));
 const plan=finalPlan(shots,inChapter,films,Object.assign({},...groups.map(g=>screensOf(cfg,id,g).byBeat)));
 const beats=Object.fromEntries(JSON.parse(fs.readFileSync(p+'/storyboard.json')).shots.map(b=>[b.beat,b]));
 const key=finalKey(plan,beats,finishOf(cfg,id),f=>{const s=fs.statSync(f);return `${s.size}:${Math.round(s.mtimeMs)}`});
 fs.mkdirSync(p+'/out/final',{recursive:true}); fs.writeFileSync(p+'/out/final.mp4','existing-final'); fs.writeFileSync(p+'/out/final/final.key',key);
 const cached=await buildFinal(cfg,id,{log:()=>{}}); assert.equal(cached.kept,true); assert.equal(fs.readFileSync(p+'/out/final.mp4','utf8'),'existing-final');
 fs.writeFileSync(p+'/out/final/final.key','not-current'); await assert.rejects(buildFinal(cfg,id,{log:()=>{}}),/unapplied/);
 // A scope selecting the second beat still selects the complete chapter, including both pending rewrites.
 fs.rmSync(p+'/chapters/B02.json');
 const sb=JSON.parse(fs.readFileSync(p+'/storyboard.json')); sb.shots[1].card='footage-plate'; put(p+'/storyboard.json',sb);
 const grouped=await stepChapters(cfg,id,{only:new Set(['B02']),review:false,renderDrafts:false,log:()=>{}});
 assert.deepEqual(grouped.redesignBlocked.map(x=>[x.chapter,x.shots]),[['B01',['B01','B02']]]);
 assert.deepEqual(grouped.accepted,[]);
 // Existing design gate still blocks an unapproved project, without dispatching a task.
 put(p+'/project.json',{...project,design:{approved:false}});
 const unapproved=await stepChapters(cfg,id,{only:new Set(['B01']),review:false,renderDrafts:false,log:()=>{}});
 assert.ok(unapproved.blocked?.length); assert.deepEqual(unapproved.accepted,[]);
 assert.ok(!fs.existsSync(p+'/tasks/morph-B01.task.json'));
 console.log('redesign isolation regression passed');
 console.log(log.join('\n'));
} finally {globalThis.fetch=originalFetch;fs.rmSync(root,{recursive:true,force:true})}
