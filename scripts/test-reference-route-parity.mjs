import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { stepStills } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import { sessionBrief } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';
import * as C from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import * as DR from '../apps/studio-next/src/lib/recipe-board/directorroutes.mjs';
import { acceptedFilmDesign } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
const repo=path.resolve(import.meta.dirname,'..'), data=path.join(repo,'work/recipe-board-v1');
const scratch=path.join(os.homedir(),'.hermes/cache/scratch'); fs.mkdirSync(scratch,{recursive:true});
const sandbox=fs.mkdtempSync(path.join(scratch,'route-parity-')), targetData=path.join(sandbox,'work/recipe-board-v1'), target=path.join(targetData,'projects/banana-design'), source=path.join(data,'projects/banana-design');
fs.mkdirSync(path.join(target,'tasks'),{recursive:true});
for(const name of ['routing','prompts','cards','themes','style-lab']) fs.symlinkSync(path.join(data,name),path.join(targetData,name));
for(const name of ['shots','plan.json','storyboard.json','brief.json','style.json','project.json']) fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true});
for(const name of ['filmdesign.answer.json','filmdesign.check.json','greybox.answer.json']) fs.copyFileSync(path.join(source,'tasks',name),path.join(target,'tasks',name));
for(const name of fs.readdirSync(path.join(data,'projects'))) if(name!=='banana-design') fs.symlinkSync(path.join(data,'projects',name),path.join(targetData,'projects',name));
const cfg={repoRoot:sandbox,sourceRoot:repo,dataDir:targetData};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v));
test('accepted design kind is handed to real still and chapter tasks with accessible gold',async()=>{
 const planPath=path.join(target,'plan.json'), plan=read(planPath); plan.beats.find(b=>b.id==='B03').text='事情发生了。'; write(planPath,plan);
 const ap=path.join(target,'tasks/filmdesign.answer.json'), answer=read(ap), row=answer.beats.find(b=>b.beat==='B03'); Object.assign(row,{kind:'map',act:'build',hero:true,medium:'diagram'}); delete row.directorIntent; write(ap,answer);
 const cp=path.join(target,'tasks/filmdesign.check.json'), check=read(cp); check.ok=true; check.answerHash=crypto.createHash('sha256').update(fs.readFileSync(ap)).digest('hex').slice(0,16); write(cp,check);
 assert.equal(acceptedFilmDesign(cfg,'banana-design').beats.find(b=>b.beat==='B03').kind,'map');
 const p=read(path.join(target,'project.json')); delete p.nasOutput; p.testOnly=true; p.design={...p.design,approved:true,greybox:'fixture-only'}; write(path.join(target,'project.json'),p);
 write(path.join(target,'tasks/greybox.check.json'),{ok:true,answerHash:'fixture-only'});
 assert.equal((await stepStills(cfg,'banana-design',{log:()=>{}})).state,'waiting');
 const still=read(path.join(target,'tasks/stills.task.json')), query=still.input.referenceQueries.find(q=>q.beat==='B03'); assert.equal(query.kind,'map'); assert.ok(query.gold.length);
 const g=C.chapterGroups(cfg,'banana-design').find(g=>g.shots.some(s=>s.shotId==='B03'));
 for(const ref of C.chapterInput(cfg,'banana-design',g).inheritance.productionFiles||[]){const relative=path.relative(sandbox,ref.file); assert.ok(!relative.startsWith('..')); fs.mkdirSync(path.dirname(ref.file),{recursive:true}); fs.copyFileSync(path.join(repo,relative),ref.file);}
 const output=await sessionBrief(cfg,'banana-design',g.id), text=fs.readFileSync(output,'utf8');
 const section=text.split('### B03（')[1].split('\n### ')[0];
 assert.match(section,/导演路由默认：kind=map/); for(const gold of query.gold) { assert.ok(section.includes(gold)); assert.ok(fs.existsSync(path.resolve(repo,gold))); }
 const refs=[...section.matchAll(/图像参考 ([^：]+)：([^；]+)；源代码 ([^；]+)/g)]; assert.ok(refs.some(m=>fs.existsSync(path.resolve(repo,m[2]))&&fs.existsSync(path.resolve(repo,m[3]))));
 const task=read(path.join(target,'tasks',`morph-${g.id}.task.json`)); assert.ok(task.input.handoffGuides.some(f=>f.path.endsWith(path.basename(output))));
});
test('route priorities and unmatched legacy inputs remain intact',()=>{
 const table=DR.loadDirectorRoutes(cfg), pick=b=>DR.pickDirectorDefaults(b,{table});
 assert.equal(pick({text:'事情发生了。'}).kind,null);
 assert.equal(pick({medium:'evidence',text:'事情发生了。'}).kind,'evidence');
 assert.equal(pick({act:'open',kind:'map',directorIntent:{route:'evidence'}}).kind,'opening');
 assert.equal(pick({act:'build',kind:'map',directorIntent:{route:'evidence'}}).kind,'evidence');
 assert.equal(pick({act:'build',kind:'map',directorIntent:{route:'custom'}}).kind,null);
});
