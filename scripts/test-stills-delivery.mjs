import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import sharp from '../apps/studio-next/node_modules/sharp/lib/index.js';
import {writeTask,submitTaskAnswer} from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';
import {prepareStillReviewTasks,renderInputs} from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import {buildStillReviewPack} from '../apps/studio-next/src/lib/recipe-board/still-review-pack.mjs';
import {checksHash} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import {boardConfig} from '../apps/studio-next/src/lib/recipe-board/store.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const cli=path.resolve('scripts/recipe-board.mjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'stills-delivery-'));
const acceptance=path.resolve('work/banana-full-stills-production-20261030/final-round8-20261031/final-acceptance.json');
function run(args,env={}){return spawnSync(process.execPath,[cli,'export-stills',...args],{encoding:'utf8',env:{...process.env,...env}});}
async function fixture(layout=true){
 const repo=fs.mkdtempSync(path.join(root,'native-')),cfg=boardConfig({...process.env,RECIPE_BOARD_REPO_ROOT:repo}),id='fixture',p=path.join(cfg.dataDir,'projects',id);fs.mkdirSync(p,{recursive:true});
 const put=(f,v)=>fs.writeFileSync(path.join(p,f),JSON.stringify(v));
 put('project.json',{id});put('storyboard.json',{contract:'A1RecipeBoardStoryboard/v3',shots:[{beat:'B11'}]});
 writeTask(cfg,id,'stills',{inputHash:'fixture'});const candidate=path.join(repo,'candidate.json');fs.writeFileSync(candidate,JSON.stringify({sourceTaskInputHash:'fixture',code:'TEST DATA'}));submitTaskAnswer(cfg,id,'stills',candidate,{env:{CODEX_THREAD_ID:'TEST-writer'}});
 const frame=path.join(p,'B11.png');await sharp({create:{width:1920,height:1080,channels:3,background:'#445566'}}).png().toFile(frame);
 const inputs=renderInputs(cfg,id,{}),binding={inputHash:hash(JSON.stringify(inputs)),frameHash:hash(fs.readFileSync(frame))};
 const opts={root:p,outDir:path.join(repo,'pack'),expectedBeats:['B11'],inputFiles:inputs.map(x=>x.path),shots:[{beat:'B11',frame,renderBinding:binding,layoutPreflight:layout?{frameHash:binding.frameHash,result:{status:'pass'}}:null,geometry:{frameHash:binding.frameHash,method:'TEST',boxes:[{id:'title',x:10,y:10,w:100,h:30}]}}]};
 const pack=await buildStillReviewPack(opts);put('tasks/stills.check.json',{ok:true,checksHash:checksHash(),taskMode:'stills',answerHash:'fixture-check',renderInputs:inputs,renderBindings:[binding],keyframes:['B11.png'],assets:{}});
 await prepareStillReviewTasks(cfg,id,{task:{forAnswer:hash(fs.readFileSync(candidate)).slice(0,16),input:{}},pack,filmBeats:['B11'],forCheck:'fixture-check'});
 const review={overall:'TEST DATA',beats:[{beat:'B11',composition:4,figureGround:4,focus:4,ground:4,type:4,score:4,hard:[]}],maturity:{scope:'whole-film-stills',inspected:['original-size','downscaled','whole-board'],wholeFilmCoherence:4,observation:'TEST DATA not an actual visual inspection',beats:[{beat:'B11',clarity:4,compositionHierarchy:4,imageTextIntegration:4,materialSubjectCredibility:4,wholeFilmCoherence:4,observation:'TEST DATA'}]}};
 const submit=()=>{for(const step of ['stills-taste','stills-taste-2']){fs.writeFileSync(candidate,JSON.stringify(review));submitTaskAnswer(cfg,id,step,candidate,{env:{CODEX_THREAD_ID:`TEST-${step}`}});}};submit();
 return {repo,p,review,submit,put,invoke:(scope='mature')=>run(['--project',id,'--scope',scope,'--out',path.join(repo,`delivery-${crypto.randomUUID()}`)],{RECIPE_BOARD_REPO_ROOT:repo})};
}
test('native CLI exports receipt-bound strictly passing fixture, not user approval',async()=>{const f=await fixture();const r=f.invoke();assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).mature,true);});
test('native CLI rejects B11 technical pass / visual 3; design-review remains scoped',async()=>{const f=await fixture();f.review.maturity.beats[0].imageTextIntegration=3;f.submit();const r=f.invoke();assert.notEqual(r.status,0);assert.match(r.stderr,/B11.*imageTextIntegration/);const d=f.invoke('design-review');assert.equal(d.status,0,d.stderr);assert.equal(JSON.parse(d.stdout).mature,false);});
test('native CLI rejects stale inputs, missing whole record and changed review',async()=>{const f=await fixture();delete f.review.maturity;f.submit();assert.match(f.invoke().stderr,/whole-film/);f.put('storyboard.json',{shots:[{beat:'B11'},{beat:'B12'}]});assert.match(f.invoke().stderr,/stale|coverage/);});
test('native CLI rejects a changed checker identity even if all visual scores pass',async()=>{const f=await fixture();const c=JSON.parse(fs.readFileSync(path.join(f.p,'tasks/stills.check.json')));delete c.checksHash;f.put('tasks/stills.check.json',c);assert.match(f.invoke().stderr,/checker.*unknown/);});
test('strict CLI does not average 3 and 5 or trust a tampered review',async()=>{
 const f=await fixture();f.review.maturity.beats[0].clarity=3;f.submit();
 const candidate=path.join(f.repo,'second.json');f.review.maturity.beats[0].clarity=5;fs.writeFileSync(candidate,JSON.stringify(f.review));
 submitTaskAnswer(boardConfig({...process.env,RECIPE_BOARD_REPO_ROOT:f.repo}),'fixture','stills-taste-2',candidate,{env:{CODEX_THREAD_ID:'TEST-stills-taste-2'}});
 assert.match(f.invoke().stderr,/B11: clarity below 4/);
 fs.appendFileSync(path.join(f.p,'tasks/stills-taste-2.answer.json'),' ');assert.match(f.invoke().stderr,/submission.*stale/);
});
test('native CLI blocks unknown layout evidence',async()=>{const f=await fixture(false);assert.match(f.invoke().stderr,/layout.*unknown/);});
test('kept real B11 technical-pass snapshot is refused by the native CLI',()=>{
 const repo=path.resolve('work/banana-full-stills-production-20261030/G3/runtime');
 const check=JSON.parse(fs.readFileSync(path.join(repo,'work/recipe-board-v1/projects/banana-static-b11/tasks/stills.check.json')));assert.equal(check.ok,true);
 const out=path.join(root,'real-b11-blocked');const r=run(['--project','banana-static-b11','--scope','mature','--out',out],{RECIPE_BOARD_REPO_ROOT:repo});assert.notEqual(r.status,0);assert.match(r.stderr,/delivery blocked/);assert.equal(fs.existsSync(out),false);
});
test('actual CLI refuses round8 mature delivery: 14 stale, unknown and below threshold',()=>{
 const a=JSON.parse(fs.readFileSync(acceptance));assert.equal(a.shots.filter(s=>s.versionStatus==='stale').length,14);assert.equal(a.shots.find(s=>s.beat==='B11').reviews.some(r=>Object.values(r.scores).includes(3)),true);
 const out=path.join(root,'blocked');const r=run(['--acceptance-file',acceptance,'--scope','mature','--out',out]);
 assert.notEqual(r.status,0);assert.match(r.stderr,/delivery blocked/);assert.match(r.stderr,/B11/);assert.match(r.stderr,/stale/);assert.equal(fs.existsSync(out),false);
});
test('actual CLI diagnostic export retains failures without a final claim',()=>{
 const out=path.join(root,'diagnostic');const r=run(['--acceptance-file',acceptance,'--scope','diagnostic','--out',out]);
 assert.equal(r.status,0,r.stderr);const p=JSON.parse(fs.readFileSync(path.join(out,'delivery.json')));
 assert.equal(p.scope,'diagnostic');assert.equal(p.mature,false);assert.equal(p.shots.length,20);assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/DIAGNOSTIC/);
});
