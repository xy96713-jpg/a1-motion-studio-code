import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runService} from '../work/recipe-board-v1/style-lab/engine/blender/run.mjs';
import {requestErrors, prepareAssets} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bake-isolation-'));
try {
 const root=path.join(temp,'project'); fs.mkdirSync(root);
 const sentinel=path.join(temp,'sentinel'); fs.writeFileSync(sentinel,'sentinel');
 const request=path.join(root,'request.json'),out=path.join(root,'bake.json'), work=path.join(root,'bake.work'); fs.mkdirSync(work);
 const req={contract:'A1RigidBakeRequest/v1',fps:2,duration:1,bodies:[{name:'x',size:[1,1,1],pos:[0,0,0]}]};
 fs.writeFileSync(request,JSON.stringify(req)); fs.linkSync(sentinel,path.join(work,'request.hashed.json'));
 const fake=path.join(temp,'fake'); fs.writeFileSync(fake,`#!${process.execPath}\nconst fs=require('fs'),a=process.argv,i=a.indexOf('--'),r=JSON.parse(fs.readFileSync(a[i+1])); fs.writeFileSync(a[i+2],JSON.stringify({contract:'A1RigidBake/v1',fps:2,frames:2,inputHash:r.inputHash,bodies:[{name:'x',release:null}],data:[[0,0,0,0,0,0,1,0,0,0,0,0,0,1]]}));`); fs.chmodSync(fake,0o755); process.env.BLENDER=fake;
 runService('bake',request,out,undefined,{root}); assert.equal(fs.readFileSync(sentinel,'utf8'),'sentinel');
 // A forced rebuild must replace the directory entry, never truncate the linked inode.
 fs.unlinkSync(out); fs.linkSync(sentinel,out); fs.unlinkSync(`${out}.sha256`); fs.linkSync(sentinel,`${out}.sha256`);
 process.env.FORCE='1'; runService('bake',request,out,undefined,{root}); delete process.env.FORCE;
 assert.equal(fs.readFileSync(sentinel,'utf8'),'sentinel'); assert.equal(JSON.parse(fs.readFileSync(out)).contract,'A1RigidBake/v1');
 const outside=path.join(temp,'outside'); fs.writeFileSync(outside,'outside sentinel'); fs.unlinkSync(out); fs.symlinkSync(outside,out);
 assert.throws(()=>runService('bake',request,out,undefined,{root}),/symlink/); assert.equal(fs.readFileSync(outside,'utf8'),'outside sentinel');
 fs.unlinkSync(out); fs.writeFileSync(request,'x'.repeat(262145));
 assert.throws(()=>runService('bake',request,out,undefined,{root}),/bounds/); assert.equal(fs.readFileSync(sentinel,'utf8'),'sentinel');
 const bakes=Array.from({length:5},(_,i)=>({key:`b${i}`,kind:'rigid',request:JSON.stringify(req)}));
 assert.match(requestErrors({bakes},{assets:[]}).join(' '),/at most 4/i);
 const cfg={repoRoot:temp,sourceRoot:process.cwd(),dataDir:path.join(temp,'data')};fs.mkdirSync(path.join(cfg.dataDir,'projects/proof'),{recursive:true});fs.writeFileSync(path.join(cfg.dataDir,'projects/proof/project.json'),'{}');
 const result=await prepareAssets(cfg,'proof',{id:'B01',shots:[],total:1},{code:'',bakes},{log:()=>{}});assert.match(result.errors.join(' '),/at most 4/i);
 console.log('isolated hardlink and runtime bake count PASS');
} finally { delete process.env.BLENDER; fs.rmSync(temp,{recursive:true,force:true}); }
