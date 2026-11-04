import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeBakePath, validateRigidOutput, validateRigidRequest } from '../work/recipe-board-v1/style-lab/engine/blender/run.mjs';
import { mergeBakePatch } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bake-safety-'));
try {
 const safe=path.join(root,'project'); fs.mkdirSync(safe); const outside=path.join(root,'outside'); fs.mkdirSync(outside);
 fs.symlinkSync(outside,path.join(safe,'escape'));
 assert.throws(()=>safeBakePath(safe,path.join(safe,'escape','x')),/symlink/i);
 for(const leaf of ['bake.json','bake.json.sha256','bake.work','bake.work/blender.log','bake.work/request.hashed.json']) {
  const base=path.join(root,'cases',leaf.replaceAll('/','-'));fs.mkdirSync(base,{recursive:true});const target=path.join(base,leaf);fs.mkdirSync(path.dirname(target),{recursive:true});fs.symlinkSync(outside,target);
  assert.throws(()=>safeBakePath(base,target),/symlink/i,leaf);
 }
 assert.doesNotThrow(()=>safeBakePath(safe,path.join(safe,'normal','x')));
 const req={contract:'A1RigidBakeRequest/v1',fps:2,duration:1,bodies:[{name:'x',size:[1,1,1],pos:[0,0,0]}]};
 assert.doesNotThrow(()=>validateRigidRequest(req));
 assert.throws(()=>validateRigidRequest({...req,iterations:100000}));
 const out={contract:'A1RigidBake/v1',fps:2,frames:2,bodies:[{name:'x',release:null}],data:[[0,0,0,0,0,0,1,0,0,0,0,0,0,1]]};
 assert.doesNotThrow(()=>validateRigidOutput(out,req));
 for(const change of [{data:undefined},{data:[]},{frames:1},{fps:3},{bodies:[{name:'y'}]},{data:[[NaN]]}]) assert.throws(()=>validateRigidOutput({...out,...change},req));
 assert.deepEqual(mergeBakePatch({bakes:[1]},{}),[1]); assert.deepEqual(mergeBakePatch({bakes:[1]},{bakes:[]}),[]);
 console.log('bake safety PASS');
} finally {fs.rmSync(root,{recursive:true,force:true});}
