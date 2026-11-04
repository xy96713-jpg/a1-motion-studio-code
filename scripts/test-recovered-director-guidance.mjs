import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stepStills } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import { sessionBrief } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';
import * as C from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { chapterGuidance, recoveredDirectorGuidance } from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';
const repo=path.resolve(import.meta.dirname,'..');
const cfg={sourceRoot:repo,dataDir:path.join(repo,'work/recipe-board-v1')};
test('recovered guidance brings scoped human decisions and concrete artwork/code into the real consumer',()=>{
 const g=chapterGuidance(cfg,'new-film',[{beat:'X',text:'染色体 DNA 地图 报道',kind:'evidence',devices:[]}]);
 assert.ok(g.recovered,'recovered decisions absent from chapter guidance');
 assert.equal(g.recovered.authority.design,'user');
 assert.equal(g.recovered.authority.final,'user');
 assert.equal(g.recovered.authority.historicalApprovalTransfers,false);
 const refs=g.recovered.beats[0].references;
 for(const id of ['B26-v12','type-v1-BC','chromosome-B','P21-one-page']) assert.ok(refs.some(x=>x.id===id),id);
 const c=refs.find(x=>x.id==='chromosome-B');
 assert.equal(c.acceptance.scope,'design-direction-only');
 assert.equal(c.acceptance.currentApproval,false);
 assert.equal(c.frameStatus,'available'); assert.match(c.frame,/chromosome-B.png$/);
 assert.match(c.source,/chromosome.py$/);
 assert.equal(refs.find(x=>x.id==='B26-v12').acceptance.scope,'chapter-version-only');
 assert.equal(refs.find(x=>x.id==='P21-one-page').frameStatus,'unknown');
 assert.ok(g.recovered.classification.superseded.length);
});
test('non-human and superseded examples never become user acceptance; missing files remain unknown',()=>{
 const root=fs.mkdtempSync(path.join(os.homedir(),'.hermes/cache/scratch/recovered-negative-'));
 fs.mkdirSync(path.join(root,'routing'));
 const inventory=JSON.parse(fs.readFileSync(path.join(cfg.dataDir,'routing/taste-inventory.json')));
 const sample=inventory.recoveredDirectorGuidance.examples.find(x=>x.id==='chromosome-B');
 inventory.recoveredDirectorGuidance.examples.push({...sample,id:'assistant-self-rating',decision:{...sample.decision,role:'assistant'}}, {...sample,id:'superseded',classification:'superseded'});
 sample.frame='missing-reference.png';
 fs.writeFileSync(path.join(root,'routing/taste-inventory.json'),JSON.stringify(inventory));
 const g=recoveredDirectorGuidance({...cfg,dataDir:root},[{beat:'X',text:'DNA'}]);
 const refs=g.beats[0].references;
 assert.ok(!refs.some(x=>['assistant-self-rating','superseded'].includes(x.id)));
 assert.equal(refs.find(x=>x.id==='chromosome-B').frame,null);
 assert.equal(refs.find(x=>x.id==='chromosome-B').frameStatus,'unknown');
 assert.deepEqual(recoveredDirectorGuidance({...cfg,dataDir:root},[{beat:'X',text:'无关天气'}]).beats[0].references,[]);
});
function isolated() {
 const scratch=path.join(os.homedir(),'.hermes/cache/scratch'); fs.mkdirSync(scratch,{recursive:true});
 const sandbox=fs.mkdtempSync(path.join(scratch,'recovered-director-'));
 const dataDir=path.join(sandbox,'work/recipe-board-v1'), target=path.join(dataDir,'projects/banana-design'), source=path.join(cfg.dataDir,'projects/banana-design');
 fs.mkdirSync(path.join(target,'tasks'),{recursive:true});
 for(const n of ['routing','prompts','cards','themes','style-lab']) fs.symlinkSync(path.join(cfg.dataDir,n),path.join(dataDir,n));
 for(const n of ['shots','plan.json','storyboard.json','brief.json','style.json','project.json']) fs.cpSync(path.join(source,n),path.join(target,n),{recursive:true});
 for(const n of ['filmdesign.answer.json','filmdesign.check.json','greybox.answer.json']) fs.copyFileSync(path.join(source,'tasks',n),path.join(target,'tasks',n));
 for(const n of fs.readdirSync(path.join(cfg.dataDir,'projects'))) if(n!=='banana-design') fs.symlinkSync(path.join(cfg.dataDir,'projects',n),path.join(dataDir,'projects',n));
 return {local:{repoRoot:sandbox,sourceRoot:repo,dataDir},target,sandbox};
}
test('actual isolated still task consumes recovered method without requesting motion or narration',async()=>{
 const {local,target}=isolated();
 // Isolated semantic fixture, so every recovered example is exercised in an actual task writer.
 const planFile=path.join(target,'plan.json'), plan=JSON.parse(fs.readFileSync(planFile));
 plan.beats.find(b=>b.id==='B01').text='染色体 DNA 地图 报道'; fs.writeFileSync(planFile,JSON.stringify(plan));
 const result=await stepStills(local,'banana-design',{log:()=>{}}); assert.equal(result.state,'waiting');
 const file=path.join(target,'tasks/stills.task.json'), task=JSON.parse(fs.readFileSync(file));
 assert.equal(task.input.taskMode,'stills');
 assert.match(task.input.acceptanceScope,/Motion\/event\/narration timing is deferred/);
 assert.ok(task.input.guidance.recovered.workflow.some(x=>x.includes('已有工程')));
 const refs=task.input.guidance.recovered.beats.flatMap(x=>x.references);
 for(const id of ['B26-v12','type-v1-BC','chromosome-B','P21-one-page']) assert.ok(refs.some(x=>x.id===id),`task omitted ${id}`);
 assert.ok(refs.some(x=>x.id==='chromosome-B' && x.frame && x.source));
 assert.ok(refs.every(x=>x.acceptance.currentApproval===false));
 assert.doesNotMatch(task.input.guidance.recovered.workflow.join(' '),/必须.*动画|先.*配音|每镜必须.*3D/);
 console.log('RECOVERED_STILL_TASK',file);
});
test('actual isolated session brief includes recovered evidence, scope and workflow',async()=>{
 const {local,target,sandbox}=isolated();
 // Exercise only the sandbox handoff, never approve production.
 const p=JSON.parse(fs.readFileSync(path.join(target,'project.json'))); delete p.nasOutput;
 p.testOnly=true;p.design={...p.design,approved:true,greybox:'fixture-only'};
 fs.writeFileSync(path.join(target,'project.json'),JSON.stringify(p));
 fs.writeFileSync(path.join(target,'tasks/greybox.check.json'),JSON.stringify({ok:true,answerHash:'fixture-only'}));
 const group=C.chapterGroups(local,'banana-design').find(g=>g.shots.some(s=>s.shotId==='B03')); assert.ok(group);
 for(const ref of C.chapterInput(local,'banana-design',group).inheritance.productionFiles || []) {
  const relative=path.relative(sandbox,ref.file);assert.ok(!relative.startsWith('..'));
  fs.mkdirSync(path.dirname(ref.file),{recursive:true});fs.copyFileSync(path.join(repo,relative),ref.file);
 }
 const file=await sessionBrief(local,'banana-design',group.id), text=fs.readFileSync(file,'utf8');
 assert.match(text,/历史方法与决策作用域/);
 assert.match(text,/chapter-version-only|design-direction-only|handmade-direction-sample-only|single-shot-structure-correction/);
 assert.match(text,/\.jsonl:L/);
 const task=JSON.parse(fs.readFileSync(path.join(target,'tasks',`morph-${group.id}.task.json`)));
 assert.ok(task.input.handoffGuides.some(f=>f.path.endsWith(path.basename(file))));
 assert.ok(task.input.guidance.recovered.beats.some(b=>b.references.some(r=>r.id==='chromosome-B' && r.acceptance.scope==='design-direction-only')));
 console.log('RECOVERED_SESSION_BRIEF',file);
});
