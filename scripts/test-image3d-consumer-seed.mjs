// Synthetic review and executables: exercises the real runService without inference.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {ensureReviewTask,submitAssetReview,viewHashes} from '../work/recipe-board-v1/style-lab/engine/blender/asset_review.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'image3d-consumer-'));
try {
 const db=new DatabaseSync(path.join(dir,'state.db')); db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, parent_session_id TEXT, model_config TEXT, ended_at REAL, end_reason TEXT)');
 const ins=db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)'); ins.run('writer','local',null,'{}',null,null); ins.run('child','subagent','writer',JSON.stringify({_delegate_from:'writer'}),null,null); db.close();
 const home=path.join(dir,'hunyuan'); fs.mkdirSync(path.join(home,'.venv','bin'),{recursive:true});
 const py=path.join(home,'.venv','bin','python');
 fs.writeFileSync(py,`#!${process.execPath}\nconst fs=require('fs'),a=process.argv.slice(2); if(a[0]==='-I') fs.writeFileSync(a[3],'cut'); else {fs.appendFileSync(process.env.TRACE,JSON.stringify(a)+'\\n'); if(!process.env.NO_OUTPUT) fs.writeFileSync(a[2],'shape-'+a[5]);}`); fs.chmodSync(py,0o755);
 fs.writeFileSync(path.join(home,'shape.py'),'legacy');
 const blender=path.join(dir,'blender'); fs.writeFileSync(blender,`#!${process.execPath}\nconst fs=require('fs'),a=process.argv,i=a.indexOf('--'),r=JSON.parse(fs.readFileSync(a[i+1]));fs.writeFileSync(a[i+2],JSON.stringify({inputHash:r.inputHash}));fs.writeFileSync(a[i+2].replace(/\\.json$/,'.glb'),'mesh');`); fs.chmodSync(blender,0o755);
 const request=path.join(dir,'request.json'),out=path.join(dir,'out.json'),trace=path.join(dir,'trace'); fs.writeFileSync(path.join(dir,'view.png'),'pixels');
 const env={...process.env,HERMES_HOME:dir,HERMES_SESSION_ID:'writer',HUNYUAN3D:home,BLENDER:blender,TRACE:trace};
 function approve(seed) { const req={contract:'A1PartRequest/v1',name:'fixture',image:'view.png',shape:seed===undefined?{}:{seed}}; fs.writeFileSync(request,JSON.stringify(req)); const hashes=viewHashes(req,dir),task=path.join(dir,'fixture.ref-review.task.json'),answer=path.join(dir,'fixture.ref-review.answer.json'),candidate=path.join(dir,'candidate.json'); ensureReviewTask(task,{contract:'A1ReferenceReviewTask/v1',hashes,images:['view.png']},env); fs.writeFileSync(candidate,JSON.stringify({contract:'A1ReferenceReviewAnswer/v1',ok:true,reviewer:'fixture',reason:'synthetic',hashes})); submitAssetReview(task,answer,candidate,{...env,HERMES_SESSION_ID:'child'}); }
 function run(){return spawnSync(process.execPath,['work/recipe-board-v1/style-lab/engine/blender/run.mjs','part',request,out],{env,encoding:'utf8'});}
 approve(12345); let r=run(); assert.equal(r.status,0,r.stderr); let a=JSON.parse(fs.readFileSync(trace,'utf8').trim()); assert.match(a[0],/single-shape\.py$/); assert.equal(a[5],'12345');
 r=run(); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/part cached/); assert.equal(fs.readFileSync(trace,'utf8').trim().split('\n').length,1);
 fs.rmSync(out);fs.rmSync(out.replace('.json','.glb')); approve(7);r=run();assert.equal(r.status,0,r.stderr); const rows=fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows[1][5],'7');assert.notEqual(rows[0][2],rows[1][2]);
 fs.rmSync(out);fs.rmSync(out.replace('.json','.glb')); approve(undefined);r=run();assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(trace,'utf8').trim().split('\n').length,2,'default seed 7 shares shape cache');
 fs.appendFileSync(path.join(dir,'fixture.ref-review.answer.json'),' '); r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/independent reference review/);
 approve(88); env.NO_OUTPUT='1'; r=run(); assert.notEqual(r.status,0); assert.match(r.stderr,/shape.*output/i);
 console.log('real service seed adapter and review integration PASS');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
