#!/usr/bin/env node
// Isolated production consumers; fixture check receipts are setup, NOT user approval or blind review.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import * as C from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import {stepStills} from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
const source=path.resolve(import.meta.dirname,'..');
const root=process.env.DIRECTOR_PROBE_ROOT||fs.mkdtempSync(path.join(os.tmpdir(),'director-consumers-'));
const dataDir=path.join(root,'work/recipe-board-v1'),id='consumer-fixture',project=path.join(dataDir,'projects',id);
const put=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');};
function mirror(rel,except){const dst=path.join(root,rel);fs.mkdirSync(dst,{recursive:true});for(const ent of fs.readdirSync(path.join(source,rel))){if(except.includes(ent)||fs.existsSync(path.join(dst,ent)))continue;fs.symlinkSync(path.join(source,rel,ent),path.join(dst,ent));}}
mirror('',['work']);mirror('work',['recipe-board-v1']);mirror('work/recipe-board-v1',['projects','fonts','routing','style-lab']);
fs.cpSync(path.join(source,'work/recipe-board-v1/routing'),path.join(dataDir,'routing'),{recursive:true});
fs.cpSync(path.join(source,'work/recipe-board-v1/fonts'),path.join(dataDir,'fonts'),{recursive:true});
mirror('work/recipe-board-v1/style-lab',['engine']);mirror('work/recipe-board-v1/style-lab/engine',['shoot.mjs']);
fs.copyFileSync(path.join(source,'work/recipe-board-v1/style-lab/engine/shoot.mjs'),path.join(dataDir,'style-lab/engine/shoot.mjs'));
const cfg={repoRoot:root,sourceRoot:root,dataDir};
put(path.join(project,'project.json'),{id,testOnly:true,lettering:'eva',typeBible:true,agents:{default:'manual'}});
const shot={shotId:'B01',beat:'B01',at:0,dur:2,text:'辨認',card:'morph-chapter'};
put(path.join(project,'storyboard.json'),{shots:[{...shot,reads:[]}]});put(path.join(project,'plan.json'),{beats:[{...shot,id:'B01'}]});
put(path.join(project,'shots/B01.json'),{shotId:'B01',recipe:'morph-chapter',motion:{duration:2}});
const intent={route:'custom',question:'觀眾如何辨認字形',start:'完整字組已在畫面',change:'保持字組供觀眾閱讀',end:'讀清字組維持原位',handoff:'停穩後明確硬切',reason:'測量真實字形而非外觀聲明',layers:{evidence:'none',art:'code illustrative dither field, not factual imagery',type:'code'},assets:[{id:'field',use:'art',source:'code',file:'work/recipe-board-v1/style-lab/engine/templates/visual-language.js',operation:'hold',operability:'code'},{id:'title',use:'type',source:'code',file:'tasks/stills.answer.json',operation:'hold',operability:'code'}]};
// Keep a pinned PNG positive alongside the restored static code/type consumers.
const {createRequire}=await import('node:module');
const sharp=createRequire(new URL('../apps/studio-next/package.json',import.meta.url))('sharp');
const raster=path.join(project,'fixture-ground.png');
await sharp({create:{width:16,height:16,channels:3,background:'#282343'}}).png().toFile(raster);
const codeOnlyIntent=structuredClone(intent);
intent.assets=[{id:'pinned-ground',use:'art',source:'generated',file:'fixture-ground.png',sha256:crypto.createHash('sha256').update(fs.readFileSync(raster)).digest('hex'),operation:'hold',operability:'whole-image',provenance:null}];
const art=[{key:'fixture_ground',file:'fixture-ground.png',prompt:'Technical synthetic solid indigo ground, not factual imagery'}];
const row={beat:'B01',value:'mid',palette:'indigo-night',productionRisk:'high',directorIntent:intent};
const design={arc:'isolated technical font and contract test',beats:[row]};
function setDesign(d){const f=path.join(project,'tasks/filmdesign.answer.json');put(f,d);put(path.join(project,'tasks/filmdesign.check.json'),{ok:true,fixture:true,answerHash:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0,16)});}
const code=`export const DUR=2, look2=false, drift=false;
export const beats=[{at:0,cam:{x:960,y:540,s:1},move:0}];
export const items=()=>[{id:'fixture-ground',kind:'draw'}];
export const pose=()=>({alpha:1,x:960,y:540,screen:true});
export function draw(g,item,p,t,x,y,sc,images){g.drawImage(images.fixture_ground,0,0,1920,1080);}
export const plan2={carrier:'字形閱讀',beats:{B01:{form:'flat',formFor:'read',carryOver:'字組維持原位',devices:['dither-relief']}}};
export function fg(g,t,cam,moves,where,type){
 const lateType=0; g.fillStyle='#282343';
 type.dev.visualLanguage(g,{id:'dither-relief',purpose:'signal',box:[760,0,1160,1080],density:.95,progress:1,geometry:{center:[.45,.48],radius:.48,aspect:.64,warp:1,phase:.3,slant:.38}});
 type.flat.typeBlock(g,{x:120,y:270,lines:[{text:'辨認',size:300,color:'#ffdaac'}]});
}`;
intent.assets.push(...codeOnlyIntent.assets.map(a=>({...a,file:'module:fg',sha256:crypto.createHash('sha256').update(code).digest('hex'),targets:[a.use==='type'?'type.flat.typeBlock':'type.dev.visualLanguage'],provenance:null})));
const motionImplementation=[{shotId:'B01',start:"g.fillStyle='#282343'",change:"g.fillStyle='#282343'",end:"g.fillStyle='#282343'",handoff:'export const DUR=2',motionRules:'export const DUR=2'}];
put(path.join(project,'tasks/stills.answer.json'),{code,art,motionImplementation});
const results={root,project,note:'Technical isolated fixture only; no review or user gate approval.'};
try{
 setDesign({...design,beats:[{...row,directorIntent:undefined}]});
 results.missing=await stepStills(cfg,id,{log:console.log});put(path.join(root,'missing-contract.json'),results.missing);
 assert.equal(results.missing.state,'rejected');assert.match(results.missing.errors.join(),/directorIntent.*required/);
 setDesign({...design,beats:[{...row,directorIntent:{...codeOnlyIntent,assets:[{id:'unsupported-code',use:'art',source:'code',file:path.join(source,'work/recipe-board-v1/style-lab/engine/templates/visual-language.js'),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'work/recipe-board-v1/style-lab/engine/templates/visual-language.js'))).digest('hex'),operation:'hold',operability:'code'}]}}]});
 results.codeOnly=await stepStills(cfg,id,{log:console.log});
 assert.equal(results.codeOnly.state,'rejected');assert.match(results.codeOnly.errors.join(),/unknown asset capability/);
 setDesign(design);
 results.prepared=await C.prepareAssets(cfg,id,{id:'B01',shots:[shot]},{code,art},{log:console.log});
 assert.deepEqual(results.prepared.errors,[]);assert.equal(results.prepared.operationEvidence.length,3);
 results.valid=await stepStills(cfg,id,{log:console.log});put(path.join(root,'valid-stills.json'),results.valid);
 assert.equal(results.valid.state,'review',JSON.stringify(results.valid));
 const g={id:'B01',shots:[shot],total:2};
 results.chapterMissing=await C.runtimeCheck(cfg,id,g,code);
 assert.match(results.chapterMissing.errors.join(),/missing.*contract|contract.*missing/);
 const contract={contract:'A1ShotMotionContract/v1',chapter:'B01',shots:[{shotId:'B01',directorIntent:intent}]};
 results.chapter=await C.runtimeCheck(cfg,id,g,code,results.prepared.assets, {motionContract:contract,motionImplementation});
 results.chapter.errors.push(...await C.bibleKeyErrors(cfg,id,g,results.chapter.keyframes));
 put(path.join(root,'chapter-check.json'),results.chapter);assert.deepEqual(results.chapter.errors,[]);
 setDesign({...design,beats:[row,{...row,beat:'B02'}]});
 results.partialContract=await C.runtimeCheck(cfg,id,{...g,id:'PARTIAL-CONTRACT',shots:[shot,{...shot,shotId:'B02',at:2}],total:4},code,results.prepared.assets, {motionContract:contract,motionImplementation});
 assert.match(results.partialContract.errors.join(),/B02.*missing/);assert.deepEqual(results.partialContract.keyframes,[]);
 put(path.join(root,'partial-contract-check.json'),results.partialContract);setDesign(design);
 results.partial=await C.runtimeCheck(cfg,id,{...g,id:'PARTIAL',shots:[shot,{...shot,shotId:'B02',at:2}],total:4},code,results.prepared.assets, {motionContract:contract,motionImplementation});
 // A chapter cannot return success after rendering only one of its required beats.
 assert.ok(results.partial.errors.length);put(path.join(root,'partial-chapter-check.json'),results.partial);
 await stepStills(cfg,id,{log:console.log}); // stabilize the cache after lazy derived-font creation
 put(path.join(project,'tasks/stills.answer.json'),{code,art});
 results.missingImplementation=await stepStills(cfg,id,{log:console.log});
 assert.equal(results.missingImplementation.state,'rejected','cached success must not hide removed implementation anchors');
 const derived=path.join(dataDir,'fonts/house/derived/kokka-mincho-tall-72.ttf'), fontBytes=fs.readFileSync(derived);
 fs.unlinkSync(derived);
 try {results.missingDrawnFont=await C.bibleKeyErrors(cfg,id,g,results.chapter.keyframes);assert.ok(results.missingDrawnFont.length,'actual drawn Tall font missing must fail, not silently check base font');}
 finally{fs.writeFileSync(derived,fontBytes);}
 fs.appendFileSync(derived,Buffer.from([0]));
 try {results.changedDrawnFont=await C.bibleKeyErrors(cfg,id,g,results.chapter.keyframes);assert.match(results.changedDrawnFont.join(),/stale.*font|font.*stale/);}
 finally{fs.writeFileSync(derived,fontBytes);}
 put(path.join(project,'tasks/stills.answer.json'),{code,art,motionImplementation});
 fs.appendFileSync(derived,Buffer.from([0]));
 await stepStills(cfg,id,{log:console.log});await stepStills(cfg,id,{log:console.log});
 const read=f=>JSON.parse(fs.readFileSync(f));
 const before=read(path.join(project,'tasks/stills.check.json')), frame=path.join(project,before.keyframes[0]);
 const beforeTime=fs.statSync(frame).mtimeMs, beforePixel=crypto.createHash('sha256').update(fs.readFileSync(frame)).digest('hex');
 const mutated=fs.readFileSync(derived);mutated[mutated.length-1]=1;fs.writeFileSync(derived,mutated);
 results.changedFontRender=await stepStills(cfg,id,{log:console.log});
 const after=read(path.join(project,'tasks/stills.check.json'));
 results.cache={before:before.answerHash,after:after.answerHash,renderedAgain:fs.statSync(frame).mtimeMs>beforeTime,pixelIdentical:crypto.createHash('sha256').update(fs.readFileSync(frame)).digest('hex')===beforePixel,sameSizeBytes:true};
 assert.notEqual(after.answerHash,before.answerHash);assert.ok(results.cache.renderedAgain);assert.ok(results.cache.pixelIdentical);assert.equal(after.ok,true);
 put(path.join(root,'font-cache-check.json'),results.cache);
 put(path.join(project,'tasks/session-B01.motion.json'),contract);
 C.refreshChapterTask(cfg,id,'B01');
 const task=read(path.join(project,'tasks/morph-B01.task.json'));
 put(path.join(project,'tasks/morph-B01.answer.json'),{code,art,motionImplementation,sourceTaskInputHash:task.inputHash});
 results.chapterEntry=await C.stepChapters(cfg,id,{review:true,renderDrafts:false,rounds:1,log:console.log});
 results.chapterEntryCheck=read(path.join(project,'tasks/morph-B01.check.json'));
 put(path.join(root,'chapter-entry-check.json'),results.chapterEntryCheck);
 assert.deepEqual(results.chapterEntryCheck.errors,[]);assert.equal(results.chapterEntryCheck.keyframes.length,1);
 console.log(JSON.stringify({root,results},null,2));
}finally{put(path.join(root,'integration-result.json'),results);}
