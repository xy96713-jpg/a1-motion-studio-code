// Backstage integration proof only. No approvals, film acceptance, audio or video.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { prepareAssets, runtimeCheck, chapterInput } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { availableGb, diskFreeGb } from '../apps/studio-next/src/lib/recipe-board/pool.mjs';
import { writeTask, readAnswer } from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';
import crypto from 'node:crypto';
import { openPage } from '../work/recipe-board-v1/style-lab/engine/shoot.mjs';
import { rigidRequest } from '../work/recipe-board-v1/style-lab/engine/templates/monolith.bake.mjs';
const root=path.resolve('work/blender-production-proof-20261031');
const cfg={repoRoot:process.cwd(),sourceRoot:process.cwd(),dataDir:root};
const project=path.join(root,'projects/proof');
const put=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');};
const resources={availableGb:availableGb(),diskFreeGb:diskFreeGb()};
assert.ok(resources.availableGb>=3&&resources.diskFreeGb>=5); put(path.join(root,'resources.json'),resources);
put(path.join(project,'project.json'),{id:'proof',name:'BACKSTAGE Blender integration proof',agents:{default:'manual'},lettering:'eva'});
const g={id:'B01',shots:[{shotId:'B01',at:0,dur:1,text:'',headline:'',keywords:[]}],total:1};
const original=rigidRequest();
const bodies=original.bodies.filter(b=>b.kind!=='passive').slice(0,3).map((b,i)=>({...b,pos:[(i-1)*1.1,2+i*.3,0],release:.1}));
const request={...original,fps:12,duration:1,substeps:4,iterations:8,fields:[],bodies};
const code=`export const DUR=1;
export const beats=[{at:0,cam:{x:960,y:540,s:1},move:0}];
let bake, meshes=[];
export async function stage3({THREE,st,data,kit}){
 bake=await kit.engine.baked.rigid(data.drop);
 if(bake.blender!=='5.2.2 LTS') throw new Error('unexpected bake provenance '+bake.blender);
 st.sc.background=new THREE.Color('#202938');
 st.cam.position.set(5,4,7);st.cam.lookAt(0,1,0);
 const bodies=${JSON.stringify(bodies)};
 for(const b of bodies){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...b.size),new THREE.MeshStandardMaterial({color:'#efba45',roughness:.65}));st.sc.add(mesh);meshes.push(mesh);}
 st.sc.add(new THREE.HemisphereLight(0xffffff,0x303040,3));
 window.__blenderProof={version:bake.blender,hash:bake.inputHash,bodies:bake.bodies.map(b=>b.name)};
}
export function place3({st,t}){st.cam.position.set(5,4,7);st.cam.lookAt(0,1,0);meshes.forEach((m,i)=>bake.sample(i,t,m.position,m.quaternion));window.__blenderProof.positions=meshes.map(m=>m.position.toArray());}
export function items(){return [];} export function fg(){}
`;
const input=chapterInput(cfg,'proof',g);
const inputHash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
writeTask(cfg,'proof','morph-B01',{rules:'work/recipe-board-v1/prompts/morph.md',schema:'work/recipe-board-v1/routing/morph.schema.json',inputHash,input:{...input,sourceTaskInputHash:inputHash},scope:'backstage still integration; no submission or acceptance'});
const answer={sourceTaskInputHash:inputHash,motionImplementation:null,code,patches:[],maps:[],art:[],glyphs:[],pages:[],bakes:[{key:'drop',kind:'rigid',request:JSON.stringify(request)}]};
put(path.join(project,'tasks/morph-B01.answer.json'),answer);
const prepared=await prepareAssets(cfg,'proof',g,readAnswer(cfg,'proof','morph-B01'));put(path.join(root,'prepare.json'),prepared);assert.deepEqual(prepared.errors,[]);
const bake=JSON.parse(fs.readFileSync(prepared.assets.drop));assert.equal(bake.blender,'5.2.2 LTS');assert.equal(bake.frames,12);assert.equal(bake.bodies.length,3);assert.ok(bake.data.every(row=>row[1]!==row.at(-6)),'real bodies must move');
const result=await runtimeCheck(cfg,'proof',g,code,prepared.assets,{taskMode:'stills'});put(path.join(root,'runtime.json'),result);
assert.ok(result.keyframes.length>0,'formal chapter must produce a frame');
assert.ok(!result.errors.some(e=>/does not load|did not load|module fails/.test(e)),JSON.stringify(result.errors));
assert.deepEqual(result.errors,[]);
const url=f=>'/'+path.relative(process.cwd(),f).split(path.sep).join('/');
const session=await openPage({pageDir:path.resolve('work/recipe-board-v1/style-lab/engine/director'),page:'shot.html',query:`shot=${encodeURIComponent(url(path.join(project,'out/chapters/B01/check-shot.json')))}&fps=30&draft=1`,variant:'clean'});
try {
 const consumption=await session.page.evaluate(async ({bakeUrl})=>{
  const {loadRigidBake}=await import('/work/recipe-board-v1/style-lab/engine/three/baked.js');
  const historical=await loadRigidBake(bakeUrl);
  const frames=[0,.5,.9,0].map(t=>{window.__content(t);return {t,...JSON.parse(JSON.stringify(window.__blenderProof))};});
  return {loaded:window.__morphAssets(),urlApiHash:historical.inputHash,frames};
 },{bakeUrl:url(prepared.assets.drop)});
 assert.equal(consumption.urlApiHash,bake.inputHash);
 assert.deepEqual(consumption.frames[0].positions,consumption.frames[3].positions);
 assert.notDeepEqual(consumption.frames[0].positions,consumption.frames[1].positions);
 assert.ok(consumption.loaded.data.includes('drop'));
 put(path.join(root,'consumption.json'),consumption);
} finally {await session.close();}
console.log(JSON.stringify({root,prepared,keyframes:result.keyframes,errors:result.errors,warnings:result.warnings},null,2));
