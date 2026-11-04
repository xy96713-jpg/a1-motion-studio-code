import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {chapterGuidance, chapterGuidanceOf, chapterTechniques} from '../apps/studio-next/src/lib/recipe-board/techniques.mjs';

test('default evidence shortlist retains both relevant historical sources', t => {
 const root=fs.mkdtempSync(path.join(os.homedir(),'.hermes/cache/scratch/ref-diversity-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dataDir=path.join(root,'work/recipe-board-v1');
 const put=(p,v)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v));};
 put('work/bv1a63d6ceba-packaging-study-20260923/clip-index.csv','id,start,end,category,title,file,decode\nP01,00:01,00:02,证据,新闻一,x,PASS\nP02,00:02,00:03,证据,新闻二,x,PASS\nP03,00:03,00:04,证据,新闻三,x,PASS\n');
 put('work/recipe-board-v1/routing/exemplars.json',{chapterReferences:[{id:'paperclip-138-full/B18',project:'paperclip-138-full',beat:'B18',kinds:['evidence'],source:'work/paper/B18.mjs',mechanism:'证据卡'}]});
 put('work/paper/B18.mjs','source');
 const cfg={sourceRoot:root,dataDir}; const query=[{beat:'B01',kind:'evidence',devices:[]}];
 const refs=chapterGuidance(cfg,'new',query).beats[0].nearest;
 assert.equal(refs.length,3);assert.ok(refs.some(x=>x.project==='paperclip-138-full'));assert.ok(refs.some(x=>x.project==='hupo-69'));
 assert.equal(chapterGuidance(cfg,'new',query,{k:1}).beats[0].nearest.length,1);
 for (const text of ['不是证据','不要使用证据','无需地图']) assert.equal(chapterGuidance(cfg,'new',[{beat:'B01',text}]).beats.length,0,text);
 put('work/recipe-board-v1/routing/exemplars.json',{chapterReferences:[{id:'map/B01',project:'map',beat:'B01',kinds:['map'],source:'work/paper/B18.mjs'}]});
 assert.equal(chapterGuidance(cfg,'new',[{beat:'B01',text:'不是证据但有地图'}]).beats[0].nearest[0].key,'map/B01');
 assert.equal(chapterGuidanceOf([{key:'other/B01',project:'other',devices:[],module:null}],[],[{beat:'B01',gold:[null]}]).beats.length,0);
 const outside=fs.mkdtempSync(path.join(os.homedir(),'.hermes/cache/scratch/ref-outside-')); t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 fs.writeFileSync(path.join(outside,'B01.mjs'),"export const plan2={B01:{devices:['escape']}}");
 fs.mkdirSync(path.join(dataDir,'projects/escape/chapters'),{recursive:true});fs.symlinkSync(path.join(outside,'B01.mjs'),path.join(dataDir,'projects/escape/chapters/B01.mjs'));
 assert.ok(!chapterTechniques(cfg).some(x=>x.project==='escape'));
});
