import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('work/recipe-board-v1/style-lab/engine/three/baked.js', 'utf8').replace("import * as THREE from 'three';", 'const THREE={Quaternion:class {}};');
const {loadRigidBake} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const bake={contract:'A1RigidBake/v1',fps:1,frames:1,bodies:[],data:[]};
const original=globalThis.fetch; const calls=[];
globalThis.fetch=async value=>{calls.push(value);return {json:async()=>bake};};
try {
 assert.equal((await loadRigidBake(bake)).fps,1); assert.equal(calls.length,0);
 const url=new URL('https://example.invalid/bake.json'); await loadRigidBake(url); assert.equal(calls.pop(),url);
 const request=new Request(url); await loadRigidBake(request); assert.equal(calls.pop(),request);
 await loadRigidBake('bake.json'); assert.equal(calls.pop(),'bake.json');
 console.log('rigid bake object, URL, Request and string compatibility PASS');
} finally {globalThis.fetch=original;}
