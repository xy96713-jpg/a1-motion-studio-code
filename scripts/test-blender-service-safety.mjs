import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {runService} from '../work/recipe-board-v1/style-lab/engine/blender/run.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bake-service-'));
try {
 const req={contract:'A1RigidBakeRequest/v1',fps:2,duration:1,bodies:[{name:'x',size:[1,1,1],pos:[0,0,0]}]};
 const request=path.join(root,'request.json'),out=path.join(root,'bake.json'),fake=path.join(root,'fake');
 fs.writeFileSync(request,JSON.stringify(req));
 fs.writeFileSync(fake,`#!${process.execPath}\nconst fs=require('fs');const a=process.argv; const i=a.indexOf('--');const r=JSON.parse(fs.readFileSync(a[i+1]));fs.writeFileSync(a[i+2],JSON.stringify({contract:'A1RigidBake/v1',fps:r.fps,frames:2,inputHash:r.inputHash,bodies:[{name:'x',release:null}],data:[[0,0,0,0,0,0,1,0,0,0,0,0,0,1]]}));`); fs.chmodSync(fake,0o755);
 process.env.BLENDER=fake;
 assert.equal(runService('bake',request,out,undefined,{root}).cached,false);
 assert.equal(runService('bake',request,out,undefined,{root}).cached,true);
 const obj=JSON.parse(fs.readFileSync(out));obj.data[0][0]=123;fs.writeFileSync(out,JSON.stringify(obj));
 assert.equal(runService('bake',request,out,undefined,{root}).cached,false);
 fs.writeFileSync(fake,`#!${process.execPath}\nsetInterval(()=>{},1000);`);fs.chmodSync(fake,0o755);process.env.FORCE='1';
 const independent=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 try {
  const start=Date.now();assert.throws(()=>runService('bake',request,out,undefined,{root,timeoutMs:150}),/failed/); assert.ok(Date.now()-start<3000);
  process.kill(independent.pid,0);
 } finally {independent.kill('SIGKILL');}
 delete process.env.FORCE;
 fs.rmSync(path.join(root,'bake.work'),{recursive:true,force:true});const outside=path.join(root,'other');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(root,'bake.work'));
 assert.throws(()=>runService('bake',request,out,undefined,{root}),/symlink/);
 console.log('fake Blender cache digest timeout symlink PASS');
} finally {delete process.env.FORCE; delete process.env.BLENDER; fs.rmSync(root,{recursive:true,force:true});}
