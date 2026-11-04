import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {materialsLock} from '../apps/studio-next/src/lib/recipe-board/shotplan.mjs';

const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'material-cli-slice-'));
const cfg = {dataDir:path.join(root,'work/recipe-board-v1'),repoRoot:root,sourceRoot:root};
const id='fixture', dir=path.join(cfg.dataDir,'projects',id,'materials');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'../project.json'),JSON.stringify({id}));
const af=path.join(dir,'approvals.json');
fs.writeFileSync(af,JSON.stringify({batches:[{id:'b',items:[]}]}));
fs.writeFileSync(path.join(dir,'needs.json'),JSON.stringify({needs:[]}));
const before=fs.readFileSync(af);
let release, child;
try {
 release=await materialsLock(cfg,id);
 fs.mkdirSync(path.join(root,'library'));
 child=spawn(process.execPath,[path.resolve('scripts/recipe-board.mjs'),'fetch','--project',id],{env:{...process.env,A1_MATERIAL_LIBRARY:path.join(root,'library'),RECIPE_BOARD_REPO_ROOT:root,RECIPE_BOARD_SOURCE_ROOT:root,RECIPE_BOARD_NAS_OUTPUT_ROOT:''}});
 let out=''; child.stdout.on('data',x=>out+=x); child.stderr.on('data',x=>out+=x);
 const done=new Promise(resolve=>child.on('exit',(code,signal)=>resolve({code,signal})));
 await new Promise(r=>setTimeout(r,1200));
 assert.equal(child.exitCode,null,`CLI fetch did not wait for the lock: ${out}`);
 assert.deepEqual(fs.readFileSync(af),before,`CLI fetch wrote while lock held: ${out}`);
 release(); release=null;
 const result=await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('CLI did not resume after release')),7000))]);
 assert.equal(result.code,0,out);
 assert.deepEqual(fs.readFileSync(af),before);
 // A failed fetch must release its own lock; a later owner can acquire it.
 fs.writeFileSync(path.join(dir,'needs.json'),JSON.stringify({needs:[{shotId:'B01',kind:'person',original:'new'}]}));
 fs.writeFileSync(path.join(dir,'candidates.json'),JSON.stringify({shots:{B01:{need:{shotId:'B01',kind:'person',original:'old'}}}}));
 child=spawn(process.execPath,[path.resolve('scripts/recipe-board.mjs'),'fetch','--project',id],{env:{...process.env,A1_MATERIAL_LIBRARY:path.join(root,'library'),RECIPE_BOARD_REPO_ROOT:root,RECIPE_BOARD_SOURCE_ROOT:root,RECIPE_BOARD_NAS_OUTPUT_ROOT:''},stdio:'ignore'});
 const failed=await new Promise(resolve=>child.on('exit',code=>resolve(code)));
 assert.notEqual(failed,0);
 const afterFailure=await materialsLock(cfg,id,()=>{},{waitMs:10,maxWait:100}); afterFailure();
 console.log('CLI fetch waits, resumes, and releases on stale-guard error');
} finally { if(release) release(); if(child && child.exitCode===null) child.kill(); fs.rmSync(root,{recursive:true,force:true}); }
