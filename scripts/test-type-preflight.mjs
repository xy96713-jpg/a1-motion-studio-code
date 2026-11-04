import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url=new URL('../work/recipe-board-v1/style-lab/engine/templates/type-roles.mjs',import.meta.url);
const B=JSON.parse(fs.readFileSync(new URL('../work/recipe-board-v1/routing/type-bible.json',import.meta.url)));
test('role constructor takes sizes only from the authoritative bible',async()=>{
 assert.ok(fs.existsSync(url),'missing role-driven constructor');
 const {roleBlock}=await import(url);
 const b=roleBlock(B,{id:'title',x:120,y:100,lines:[{text:'原地換種',role:'title'}]});
 assert.equal(b.lines[0].size,B.scale.title);
 const changed=structuredClone(B);changed.scale.title=132;
 assert.equal(roleBlock(changed,{...b,lines:[{text:'原地換種',role:'title'}]}).lines[0].size,132);
});
test('actual font cmap rejects missing copy and binds the font bytes',async()=>{
 const mod=new URL('../apps/studio-next/src/lib/recipe-board/typepreflight.mjs',import.meta.url);
 assert.ok(fs.existsSync(mod),'missing actual-font preflight');
 const {fontEvidence}=await import(mod);
 const file=new URL('../work/recipe-board-v1/fonts/house/derived/kokka-mincho-tall-72.ttf',import.meta.url).pathname;
 assert.throws(()=>fontEvidence({file,family:'House Kokka',text:'发生过一次'}),/glyph/);
 const ok=fontEvidence({file,family:'House Kokka',text:'發生過一次'});
 assert.match(ok.sha256,/^[a-f0-9]{64}$/);assert.equal(ok.text,'發生過一次');
});
test('drawing refuses stretched contexts and out-of-bounds ink before painting',async()=>{
 const M=await import(url);assert.equal(typeof M.drawRoleBlock,'function');
 const g={getTransform:()=>({a:.72,b:0,c:0,d:1,e:0,f:0}),fillText(){throw Error('painted');}};
 assert.throws(()=>M.drawRoleBlock({},g,{},B),/transform/);
 const identity={a:1,b:0,c:0,d:1,e:0,f:0};let painted=0;
 const ctx={getTransform:()=>identity,fillText(){painted++},measureText:()=>({actualBoundingBoxLeft:0,actualBoundingBoxRight:2000,actualBoundingBoxAscent:40,actualBoundingBoxDescent:0})};
 const F={typeBlock(c){c.fillText('too wide',120,140)}};
 assert.throws(()=>M.drawRoleBlock(F,ctx,{id:'x'},B),/bounds/);assert.equal(painted,0);
});
test('missing and stale evidence cannot authorize publishing; unknown visual stays unknown',async()=>{
 const M=await import('../apps/studio-next/src/lib/recipe-board/typepreflight.mjs');
 assert.equal(typeof M.assertCurrent,'function');
 const files=[new URL('../work/recipe-board-v1/routing/type-bible.json',import.meta.url).pathname];
 assert.throws(()=>M.assertCurrent(null,files),/missing/);
 const bindings=Object.fromEntries(files.map(p=>[p,M.sha256(p)]));
 const r={status:'pass',bindings,visualInspection:'unknown'};
 assert.equal(M.assertCurrent(r,files),r);
 assert.throws(()=>M.assertCurrent({...r,bindings:{[files[0]]:'stale'}},files),/stale/);
 assert.throws(()=>M.assertCurrent({...r,bindings:{}},files),/stale/);
});
test('construction refuses missing or unknown glyph coverage instead of fallback',async()=>{
 const M=await import(url);assert.equal(typeof M.checkRoleGlyphs,'function');
 const blocks=[{lines:[{text:'发生',size:128}]}];
 assert.throws(()=>M.checkRoleGlyphs(blocks,()=> 'House Kokka Tall',{'House Kokka Tall':['发']}),/glyph/);
 assert.throws(()=>M.checkRoleGlyphs(blocks,()=> 'House Kokka Tall',{}),/unknown/);
});
test('font load failure cannot silently render with a system face',async()=>{
 const M=await import(url);
 assert.throws(()=>M.checkRoleGlyphs([{lines:[{text:'發生',size:128}]}],()=> 'House Kokka Tall',{'House Kokka Tall':[]},[]),/not loaded/);
});
test('declared evidence-label container rejects ink spilling outside before paint',async()=>{
 const {drawRoleBlock}=await import(url);let painted=0;
 const g={getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),fillText(){painted++},measureText:()=>({actualBoundingBoxLeft:0,actualBoundingBoxRight:100,actualBoundingBoxAscent:40,actualBoundingBoxDescent:0})};
 assert.throws(()=>drawRoleBlock({typeBlock(c){c.fillText('候選 C',1114,730)}},g,{within:[1150,670,1490,746]},B),/container/);assert.equal(painted,0);
});
test('construction rejects unknown roles, size overrides, off-grid origins and repeated stretching',async()=>{
 const {roleBlock}=await import(url);
 const good={id:'t',x:120,y:100,lines:[{text:'標題',role:'title'}]};
 for(const bad of [{...good,lines:[{text:'字',role:'banana'}]}, {...good,lines:[{text:'字',role:'title',size:200}]}, {...good,x:-1}, {...good,y:940}, {...good,scaleX:.72}, {...good,lines:[{text:'字',role:'sub'},{text:'字',role:'caption'}]}]) assert.throws(()=>roleBlock(B,bad));
});
