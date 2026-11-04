import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {requestErrors, prepareAssets} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bake-batch-'));
try {
 const cfg={repoRoot:root,sourceRoot:process.cwd(),dataDir:path.join(root,'data')};
 fs.mkdirSync(path.join(cfg.dataDir,'projects/proof'),{recursive:true}); fs.writeFileSync(path.join(cfg.dataDir,'projects/proof/project.json'),'{}');
 const bakes=Array.from({length:5},(_,i)=>({key:`b${i}`,request:'{}'}));
 assert.match(requestErrors({bakes},{assets:[]}).join(' '),/at most 4/i);
 const r=await prepareAssets(cfg,'proof',{id:'B01',shots:[],total:1},{code:'',bakes},{log:()=>{}});
 assert.match(r.errors.join(' '),/at most 4/i);
 const large=Array(2).fill({request:'x'.repeat(140000)});
 assert.match(requestErrors({bakes:large},{assets:[]}).join(' '),/aggregate/);
 assert.match((await prepareAssets(cfg,'proof',{id:'B01',shots:[],total:1},{code:'',bakes:large},{log:()=>{}})).errors.join(' '),/aggregate/);
 console.log('bake batch count and aggregate bytes PASS');
} finally {fs.rmSync(root,{recursive:true,force:true});}
