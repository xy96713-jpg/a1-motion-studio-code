// Offline synthetic project; real film-design and still consumers. No user gates.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import * as F from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import {writeTask,writeAnswer,readTask,submitTaskAnswer} from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';
import {stepStills} from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
const repo=path.resolve(import.meta.dirname,'..'), root=fs.mkdtempSync(path.join(os.tmpdir(),'stills-real-slice-'));
const dataDir=path.join(root,'work/recipe-board-v1'), p=path.join(dataDir,'projects/fixture');
const put=(f,v)=>{const dest=path.join(p,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,typeof v==='string'?v:JSON.stringify(v));};
const symlink=(src,dst)=>{fs.mkdirSync(path.dirname(dst),{recursive:true});fs.symlinkSync(src,dst,'dir');};
fs.cpSync(path.join(repo,'work/recipe-board-v1/routing'),path.join(dataDir,'routing'),{recursive:true});
fs.cpSync(path.join(repo,'work/recipe-board-v1/style-lab/engine'),path.join(dataDir,'style-lab/engine'),{recursive:true});
symlink(path.join(repo,'node_modules'),path.join(root,'node_modules'));
symlink(path.join(repo,'remotion-renderer/node_modules'),path.join(root,'remotion-renderer/node_modules'));
symlink(path.join(repo,'work/recipe-board-v1/fonts'),path.join(dataDir,'fonts'));
const cfg={repoRoot:root,sourceRoot:root,dataDir}, ids=Array.from({length:8},(_,i)=>`B0${i+1}`);
const rows=ids.map((beat,i)=>({beat,act:i===0?'open':i===7?'close':'build',scale:'object',value:'dark',medium:'diagram',red:0,hero:false,palette:'noir',screen:'clean',why:`Keep the same object visible as relationship ${i+1} is explained; no display is depicted.`}));
put('project.json',{id:'fixture',agents:{default:'manual'}}); put('plan.json',{beats:ids.map(id=>({id,text:'SIMPLE RELATION'}))});
for(const id of ids) put(`shots/${id}.json`,{shotId:id,recipe:'morph-chapter',motion:{duration:3}});
writeTask(cfg,'fixture','filmdesign',{input:{requireMotionDesign:false}}); writeAnswer(cfg,'fixture','filmdesign',{houseStyle:'forensic-dark',arc:'A restrained explanation accumulates relationships on one object, then resolves without a spectacle.',beats:rows});
const design=await F.stepFilmDesign(cfg,'fixture',ids.map(beat=>({beat,dur:3})),{log(){}}); console.log('design',JSON.stringify(design));
const run=()=>stepStills(cfg,'fixture',{targetBeat:'B02',log(){}}); console.log('task',JSON.stringify(await run()));
const task=readTask(cfg,'fixture','stills-B02');
const code='export const DUR=3; export const beats=[{at:0,move:0}]; export function items(){return [];} export function pose(){}';
const candidate=path.join(root,'candidate.json');fs.writeFileSync(candidate,JSON.stringify({sourceTaskInputHash:task.inputHash,code,art:[]}));
submitTaskAnswer(cfg,'fixture','stills-B02',candidate,{env:{CODEX_THREAD_ID:'synthetic-fixture'}});
const result=await run();console.log('runtime',JSON.stringify(result));
for(const f of result.keyframes||[]){ const b=fs.readFileSync(f);console.log('frame',f,'bytes',b.length,'size',b.readUInt32BE(16),b.readUInt32BE(20),'sha256',crypto.createHash('sha256').update(b).digest('hex')); }
console.log('scratch',root);
