import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as S from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import {buildStillReviewPack,verifyStillReviewPack} from '../apps/studio-next/src/lib/recipe-board/still-review-pack.mjs';

test('chapterHouse writes OCR output under its project, never beside shared fonts',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rb-legibility-writer-')),dataDir=path.join(root,'work/recipe-board-v1');
 try {
  fs.mkdirSync(path.join(dataDir,'routing'),{recursive:true});
  fs.mkdirSync(path.join(dataDir,'fonts/house'),{recursive:true});
  // Invalid synthetic font deliberately exercises the report writer without claiming OCR accuracy.
  fs.writeFileSync(path.join(dataDir,'fonts/house/test.otf'),'synthetic');
  fs.writeFileSync(path.join(dataDir,'routing/house-rules.json'),JSON.stringify({fonts:{dir:'work/recipe-board-v1/fonts/house',allowed:[{family:'Test',file:'test.otf'}],alias:{}}}));
  for(const id of ['b10','other']) {fs.mkdirSync(path.join(dataDir,'projects',id),{recursive:true});fs.writeFileSync(path.join(dataDir,'projects',id,'project.json'),'{}');}
  const module=new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs',import.meta.url).href;
  const r=spawnSync(process.execPath,['--input-type=module','-e',`import {chapterHouse} from ${JSON.stringify(module)}; const cfg=${JSON.stringify({repoRoot:root,sourceRoot:root,dataDir})}; await chapterHouse(cfg, 'const label="AB"', 'b10'); await chapterHouse(cfg, 'const label="CD"', 'other');`],{encoding:'utf8',env:{...process.env,RB_LETTERING:''}});
  assert.equal(r.status,0,r.stderr);
  assert.equal(fs.existsSync(path.join(dataDir,'fonts/house/legibility.json')),false,'shared font directory must stay read-only');
  for(const id of ['b10','other']) assert.ok(fs.readdirSync(path.join(dataDir,'projects',id,'out/font-legibility'),{recursive:true}).some(f=>f.endsWith('.json')));
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('stills bind font/spec inputs, not shared OCR run output; project reports remain isolated',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rb-legibility-isolation-')),cfg={dataDir:root};
 try {
  const put=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
  const font=path.join(root,'fonts/house/font.otf'), rules=path.join(root,'routing/house-rules.json'), legacy=path.join(root,'fonts/house/legibility.json');
  put(font,'synthetic-font-bytes');put(rules,'{"rule":1}');put(legacy,'{"Other|word":1}');
  for(const id of ['b10','other']) put(path.join(root,'projects',id,'project.json'),JSON.stringify({id}));
  assert.equal(typeof S.renderInputs,'function');
  const local=path.join(root,'projects/b10/out/font-legibility/report.json');put(local,'{"B10|word":1}');
  const before=S.renderInputs(cfg,'b10',{});
  const pack=await buildStillReviewPack({root,outDir:path.join(root,'projects/b10/out/review'),expectedBeats:[],inputFiles:before.map(x=>x.path)});
  put(legacy,'{"Other|word":0}');
  put(path.join(root,'projects/other/out/font-legibility/report.json'),'{"Other|new":1}');
  assert.deepEqual(S.renderInputs(cfg,'b10',{}),before,'another run must not invalidate B10');
  assert.equal(verifyStillReviewPack(pack).ok,true);
  put(local,'{"B10|word":0}');assert.equal(verifyStillReviewPack(pack).ok,false,'consumed local OCR decisions must remain bound');put(local,'{"B10|word":1}');
  put(font,'changed-font');assert.equal(verifyStillReviewPack(pack).ok,false,'real font bytes must invalidate');
  put(font,'synthetic-font-bytes');put(rules,'{"rule":2}');assert.equal(verifyStillReviewPack(pack).ok,false,'real rules must invalidate');
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
