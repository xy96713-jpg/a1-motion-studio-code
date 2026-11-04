import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {captureLayoutPreflight} from '../apps/studio-next/src/lib/recipe-board/layoutpreflight.mjs';
import {openPage} from '../work/recipe-board-v1/style-lab/engine/shoot.mjs';
const dir='work/banana-representative-stills-reference-20261030',out=dir+'/layout-proof';
for(const version of ['before','after']){
 const shot=JSON.parse(fs.readFileSync(dir+'/checks/check-shot.json'));
 shot.params.assets={plant:'/'+out+'/plant.png',losses:'/'+out+'/losses.png'};
 shot.params.module='/'+(version==='before'?out+'/before.mjs':dir+'/candidate.mjs');
 fs.writeFileSync(out+'/'+version+'-shot.json',JSON.stringify(shot,null,2));
 const inputFiles=[out+'/'+version+'-shot.json',shot.params.module.slice(1),out+'/losses.png',out+'/plant.png','work/recipe-board-v1/style-lab/engine/templates/layout-contract.mjs','work/recipe-board-v1/style-lab/engine/display.js','work/recipe-board-v1/style-lab/engine/templates/morph.js'];
 const inventory=()=>inputFiles.map(p=>{const b=fs.readFileSync(p);return {path:path.resolve(p),hash:createHash('sha256').update(b).digest('hex'),bytes:b.length,status:'available'};});
 const inputsBefore=inventory();
 const s=await openPage({pageDir:path.resolve('work/recipe-board-v1/style-lab/engine/director'),page:'shot.html',query:'shot=/'+out+'/'+version+'-shot.json&fps=30&draft=1',variant:'clean'});
 try{
  await s.page.evaluate(async()=>{if(window.__prep)await window.__prep(21.65);window.renderAt(21.65);});
  await s.page.locator('#out').screenshot({path:out+'/'+version+'.png'});
  const receipt=await s.page.evaluate(()=>window.__representativeConsumption());
  receipt.layoutPreflight=await s.page.evaluate(captureLayoutPreflight);
  assert.deepEqual(inventory(),inputsBefore,'render inputs changed during capture');
  receipt.renderInputs=inputsBefore;
  receipt.renderBinding={inputHash:createHash('sha256').update(JSON.stringify(inputsBefore)).digest('hex'),frameHash:createHash('sha256').update(fs.readFileSync(out+'/'+version+'.png')).digest('hex')};
  if(version==='after'){
   assert.equal(receipt.evidence.layout.result.status,'pass');
   assert.equal(receipt.evidence.layout.contract.nodes.length,3);
   assert.deepEqual(receipt.evidence.sourceRect,[0,339,710,98]);
   assert.ok(receipt.evidence.layout.contract.nodes.every(n=>Math.abs(n.ink[0]+n.ink[2]/2-960)<=6));
  }
  receipt.bindings=Object.fromEntries([out+'/'+version+'.png',out+'/'+version+'-shot.json',shot.params.module.slice(1),out+'/losses.png','work/recipe-board-v1/style-lab/engine/templates/layout-contract.mjs','work/recipe-board-v1/style-lab/engine/display.js','work/recipe-board-v1/style-lab/engine/templates/morph.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
  fs.writeFileSync(out+'/'+version+'-runtime.json',JSON.stringify(receipt,null,2));
  console.log(version,receipt.evidence);
 }finally{await s.close();}
}
