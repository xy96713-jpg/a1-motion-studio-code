import {test} from 'node:test';
import assert from 'node:assert/strict';
import {figureScale,typeBlock} from '../work/recipe-board-v1/style-lab/engine/templates/kit2.js';
// Deterministic native-metric contract; real House ink is additionally checked on B11.
function context(){return {font:'400 48px "House Kaiso"',globalAlpha:1,textAlign:'left',save(){},restore(){},measureText(t){return {width:100,actualBoundingBoxLeft:0,actualBoundingBoxRight:100,actualBoundingBoxAscent:t==='國'?44:34,actualBoundingBoxDescent:0};},fillText(){}};}
test('caption digits keep their alphabetic height, display figures retain CJK matching',()=>{
 globalThis.window={__bible:true};
 try{const g=context();g.__typeRole='caption';assert.equal(figureScale(g,'2005'),1,'caption year must not be enlarged against 國');g.__typeRole='figure';assert.ok(figureScale(g,'400')>1);delete g.__typeRole;assert.ok(figureScale(g,'367')>1);assert.equal(figureScale(g,'APS'),1);}finally{delete globalThis.window;}
});
test('typeBlock carries each line role through measurement and drawing and restores it',()=>{
 globalThis.window={__bible:true};
 try{const g=context(),seen=[];g.__typeRole='title';g.fillText=function(text){seen.push([text,this.__typeRole,figureScale(this,text)]);};typeBlock(g,{x:120,y:100,lines:[{text:'2005',size:48,role:'caption'},{text:'400',size:200,role:'figure'}]});assert.deepEqual(seen.map(x=>x.slice(0,2)),[['2005','caption'],['400','figure']]);assert.equal(seen[0][2],1);assert.ok(seen[1][2]>1);assert.equal(g.__typeRole,'title');g.fillText=()=>{throw Error('paint failure');};assert.throws(()=>typeBlock(g,{x:120,y:100,lines:[{text:'2005',size:48,role:'caption'}]}),/paint failure/);assert.equal(g.__typeRole,'title');}finally{delete globalThis.window;}
});
