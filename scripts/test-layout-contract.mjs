import assert from 'node:assert/strict';
import {test} from 'node:test';
const base=()=>({frame:{w:1920,h:1080},safe:[120,96,1800,935],groups:[{id:'main',axis:960}],nodes:[{id:'title',group:'main',box:[560,96,800,200],ink:[560,96,800,200]}]});
const M=await import('../work/recipe-board-v1/style-lab/engine/templates/layout-contract.mjs').catch(e=>e.code==='ERR_MODULE_NOT_FOUND'?{}:Promise.reject(e));
test('contain preserves complete loss quote; cover crop and stretch are rejected',()=>{
 assert.equal(typeof M.fitRect,'function');
 const c=base();const source=[0,339,710,98],target=[200,400,1400,200];
 const fit=M.fitRect(source,target,'contain');
 c.nodes.push({id:'proof',box:target,ink:fit.dest,image:{source,crop:source,dest:fit.dest,key:source,fit:'contain'}});
 assert.equal(M.checkLayout(c).status,'pass');
 c.nodes[1].image.crop=[0,339,600,98];assert.ok(M.checkLayout(c).errors.some(e=>e.code==='key-crop'));
 c.nodes[1].image.crop=source;c.nodes[1].image.dest=[200,400,1400,100];assert.ok(M.checkLayout(c).errors.some(e=>e.code==='stretch'));
});
test('perspective projection derives visible contour and stack positions; unsupported lenses unknown',()=>{
 assert.equal(typeof M.projectFilmedRect,'function');
 const p=M.projectFilmedRect({source:[1100,380],rect:[0,0,1100,380],CW:1100,CH:380,W:1390,H:480,zoom:.67,focus:[550,190],tilt:.035,pitch:-.015,roll:-.012,drift:0},[200,380,1390,480]);
 assert.equal(p.polygon.length,4);assert.ok(p.polygon[0][1]!==p.polygon[1][1]);
 const c=base();c.nodes.push({id:'proof',box:[200,380,1390,480],ink:p.bounds,polygon:p.polygon,projected:true});assert.equal(M.checkLayout(c).status,'pass');
 assert.equal(M.projectFilmedRect({medium:'crt'},[0,0,10,10]).status,'unknown');
 const s=M.stackLayout({axis:960,top:96,gap:40,items:[{id:'title',width:800,height:260},{id:'proof',width:1400,height:480}]});
 assert.deepEqual(s.proof,[260,396,1400,480]);
});
test('container and visible ink safety are distinct policies',()=>{
 const c=base();c.nodes[0].box=[0,0,1920,1080];c.nodes[0].containerSafe=true;
 assert.ok(M.checkLayout(c).errors.some(e=>e.code==='container-safe-region'));
 delete c.nodes[0].containerSafe;assert.equal(M.checkLayout(c).status,'pass');
});
test('unknown numeric data never passes; raster-stage stretch and projected quote crop fail',()=>{
 const c=base();c.nodes[0].ink[0]=NaN;assert.notEqual(M.checkLayout(c).status,'pass');
 const bad=base();bad.nodes[0].image={source:[0,0,NaN,10],crop:[0,0,10,10],dest:[0,0,10,10],key:[0,0,10,10],fit:'contain'};assert.equal(M.checkLayout(bad).status,'unknown');
 const d=base();d.nodes[0].rasterStages=[{source:[1100,380],target:[1530,480]}];assert.ok(M.checkLayout(d).errors.some(e=>e.code==='raster-stretch'));
 delete d.nodes[0].rasterStages;d.nodes[0].keyPolygon=[[0,0],[10,0],[10,10],[0,10]];assert.ok(M.checkLayout(d).errors.some(e=>e.code==='key-projection-crop'));
});
test('malformed safety, offset, raster and key polygons remain unknown',()=>{
 for(const mutate of [c=>c.safe=[],c=>c.nodes[0].offset={x:NaN,reason:'intentional'},c=>c.nodes[0].rasterStages=[{source:[],target:[]}],c=>c.nodes[0].keyPolygon=[[NaN,0],[1,0],[1,1],[0,1]],c=>c.nodes[0].keyPolygon=[]]){
  const c=base();mutate(c);assert.equal(M.checkLayout(c).status,'unknown');
 }
});
test('type measurement does not paint, preserves context method, records real bounds',()=>{
 assert.equal(typeof M.measureTypeBlock,'function');
 let paints=0;const g={fillText(){paints++},measureText(){return {actualBoundingBoxLeft:2,actualBoundingBoxRight:30,actualBoundingBoxAscent:20,actualBoundingBoxDescent:3}}};
 const original=g.fillText, F={typeBlock(g){g.fillText('A',100,100)}};
 assert.deepEqual(M.measureTypeBlock(F,g,{}),[98,80,32,23]);assert.equal(paints,0);assert.equal(g.fillText,original);
});
test('B10 current hand coordinates fail shared axis and safe margin',()=>{
 assert.equal(typeof M.checkLayout,'function','layout contract is missing');
 const r=M.checkLayout({frame:{w:1920,h:1080},safe:[120,96,1800,935],groups:[{id:'main',axis:960}],nodes:[{id:'title',group:'main',box:[560,96,800,260],ink:[560,96,800,260]},{id:'evidence',group:'main',box:[390,380,1530,480],ink:[390,380,1530,480]}]});
 assert.ok(r.errors.some(e=>e.code==='axis'));
 assert.ok(r.errors.some(e=>e.code==='safe-region'));
});
test('centered / explicit offset / background bleed, but no blanket exemptions',()=>{
 assert.equal(M.checkLayout(base()).status,'pass');
 const c=base();c.nodes[0].ink[0]+=100;c.nodes[0].offset={x:100,reason:'room for diagram at left'};
 assert.equal(M.checkLayout(c).status,'pass');
 c.nodes.push({id:'ground',role:'background',box:[-100,-100,2120,1280],ink:[-100,-100,2120,1280],bleed:{reason:'full field'}});
 assert.equal(M.checkLayout(c).status,'pass');
 c.nodes[0].ink[0]=1900;assert.equal(M.checkLayout(c).status,'fail');
});
test('unknown ink / unknown projection cannot pass; collision of known ink fails',()=>{
 const c=base();delete c.nodes[0].ink;assert.equal(M.checkLayout(c).status,'unknown');
 c.nodes[0].ink=c.nodes[0].box;c.nodes[0].projected=true;assert.equal(M.checkLayout(c).status,'unknown');
 delete c.nodes[0].projected;c.nodes.push({...c.nodes[0],id:'other'});assert.ok(M.checkLayout(c).errors.some(e=>e.code==='overlap'));
});
