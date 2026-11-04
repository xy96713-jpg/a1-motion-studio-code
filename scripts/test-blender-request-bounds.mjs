import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareAssets} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
process.env.BLENDER='/usr/bin/false';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rigid-bounds-'));
try {
 const cfg={repoRoot:root,sourceRoot:process.cwd(),dataDir:path.join(root,'data')};
 const project=path.join(cfg.dataDir,'projects/proof');fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'project.json'),'{}');
 const g={id:'B01',shots:[{shotId:'B01',at:0,dur:1}],total:1};
 const good={contract:'A1RigidBakeRequest/v1',fps:12,duration:1,bodies:[{name:'box',pos:[0,1,0],size:[1,1,1]}]};
 for(const [label,change] of Object.entries({substeps:{substeps:1000000},iterations:{iterations:1000000},fields:{fields:Array(1000).fill({type:'FORCE',keys:[[0,1]]})},mass:{bodies:[{...good.bodies[0],mass:-1}]},keys:{fields:[{type:'FORCE',keys:Array(1000).fill([0,1])}]},bytes:{comment:'a'.repeat(300000)}})) {
  const r=await prepareAssets(cfg,'proof',g,{code:'',bakes:[{key:'drop',kind:'rigid',request:JSON.stringify({...good,...change})}]},{log:()=>{}});
  assert.match(r.errors.join(' '),/bake bounds|invalid rigid request/i,label);
 }
 console.log('rigid request bounds rejected before Blender PASS');
} finally {fs.rmSync(root,{recursive:true,force:true});}
