import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildStillReviewPack} from '../apps/studio-next/src/lib/recipe-board/still-review-pack.mjs';
import sharp from '../apps/studio-next/node_modules/sharp/lib/index.js';
test('browser capture preserves unknown and errors without green fallback',async()=>{
 const {captureLayoutPreflight}=await import('../apps/studio-next/src/lib/recipe-board/layoutpreflight.mjs');
 const prior=globalThis.window;try {
  globalThis.window={};assert.equal(captureLayoutPreflight().result.status,'unknown');
  window.__layoutPreflight=()=>({result:{status:'pass',errors:[],unknown:[]}});
  assert.equal(captureLayoutPreflight().result.status,'pass');assert.equal(captureLayoutPreflight().finalOutput.status,'unknown');
  window.__layoutPreflight=()=>{throw Error('bad layout')};assert.equal(captureLayoutPreflight().result.status,'unknown');
 }finally{globalThis.window=prior;}
});
const H=x=>crypto.createHash('sha256').update(x).digest('hex');
test('layout preflight survives frame binding; undeclared and stale remain unknown',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'layout-consumer-'));
 try {
  const frame=path.join(root,'frame.png');await sharp({create:{width:64,height:64,channels:3,background:'#fff'}}).png().toFile(frame);
  const input=path.join(root,'input.mjs');fs.writeFileSync(input,'// input');
  const opts={root,outDir:path.join(root,'pack'),expectedBeats:['B10'],inputFiles:[input],shots:[{beat:'B10',frame}]};
  let p=await buildStillReviewPack(opts);
  assert.equal(p.shots[0].layoutPreflight?.status,'unknown');
  const frameHash=H(fs.readFileSync(frame));opts.shots[0].renderBinding={inputHash:p.inputHash,frameHash};
  opts.shots[0].layoutPreflight={frameHash,result:{status:'fail',errors:[{code:'axis'}],unknown:[]},coordinateSpace:'inner-content',finalOutput:{status:'unknown'}};
  p=await buildStillReviewPack(opts);assert.equal(p.shots[0].layoutPreflight.status,'fail');
  assert.equal(p.shots[0].layoutPreflight.finalOutput.status,'unknown');
  opts.shots[0].layoutPreflight.frameHash='old';p=await buildStillReviewPack(opts);assert.equal(p.shots[0].layoutPreflight.status,'unknown');
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('layout and display are engine cache inputs and main suite imports layout once',()=>{
 const c=fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs',import.meta.url),'utf8');
 const list=c.match(/const ENGINE_CODE = \[([^\]]+)\]/)[1];
 for(const name of ['templates/layout-contract.mjs','display.js']) assert.equal(list.split(`'${name}'`).length-1,1,name);
 const main=fs.readFileSync(new URL('./test-recipe-board.mjs',import.meta.url),'utf8');assert.equal(main.split("import('./test-layout-contract.mjs')").length-1,1);
 assert.match(c,/page.evaluate\(captureLayoutPreflight\)/);
});
