import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { chapterGuidance } from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';
const repo=path.resolve(import.meta.dirname,'..');
const cfg={sourceRoot:repo,dataDir:path.join(repo,'work/recipe-board-v1')};
test('original index retrieves named examples without claiming image identity or approval',()=>{
 for (const [kind,text,id] of [['evidence','新闻证据高亮','P02'],['compare','原生与优化调度','P26'],['process','旧训练方法四节点','P32']]) {
  const rows=chapterGuidance(cfg,'new-film',[{beat:'X',kind,text,devices:[]}],{k:50}).beats[0].nearest;
  const x=rows.find(x=>x.key===`hupo-69/index/${id}`); assert.ok(x,id);
  assert.equal(x.shotId,id); assert.equal(x.frame,null); assert.equal(x.frameIdentity,'unknown');
  assert.equal(x.acceptance.currentApproval,false); assert.equal(x.pathBase,'repo-root');
 }
});
test('synthetic index preserves conflict and excludes self and unrelated routes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hupo-index-'));
 try {
  const c=path.join(root,'work/bv1a63d6ceba-packaging-study-20260923');
  const f=path.join(root,'work/hupo-69-shot-reconstruction-v1/source-reference-frames-v1');
  const data=path.join(root,'data'); fs.mkdirSync(c,{recursive:true}); fs.mkdirSync(f,{recursive:true}); fs.mkdirSync(data);
  fs.writeFileSync(path.join(c,'clip-index.csv'),'id,start,end,category,title,file,decode\nP32,00:01.000,00:02.000,证据,新闻证据高亮,clips/missing.mp4,PASS\n');
  fs.writeFileSync(path.join(f,'69-shot-hold-contact-v2.json'),JSON.stringify({frames:[{shotId:'P32',sourceFrame:900,sourceTimeSeconds:15}]}));
  const q={sourceRoot:root,dataDir:data}, beat={beat:'B01',kind:'evidence',text:'新闻证据高亮',devices:[]};
  const x=chapterGuidance(q,'other',[beat]).beats[0].nearest[0];
  assert.equal(x.timeStatus,'conflict'); assert.equal(x.clip.end,'00:02.000'); assert.equal(x.indexedFrame.sourceTimeSeconds,15);
  assert.equal(x.frameIdentity,'unknown'); assert.equal(x.frame,null); assert.equal(x.acceptance.currentApproval,false);
  assert.equal(chapterGuidance(q,'hupo-69',[beat]).beats.length,0);
  assert.equal(chapterGuidance(q,'other',[{...beat,kind:'map',routeResolved:true}]).beats.length,0);
  fs.rmSync(path.join(f,'69-shot-hold-contact-v2.json'));
  const missing=chapterGuidance(q,'other',[beat]).beats[0].nearest[0];
  assert.equal(missing.timeStatus,'unknown'); assert.equal(missing.frameIndexSource,null);
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
