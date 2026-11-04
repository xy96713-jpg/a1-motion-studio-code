// Exercise the actual Canvas boundary in a fresh realm; browser pixel proof is separate.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto, createHash} from 'node:crypto';
const source=fs.readFileSync('work/recipe-board-v1/style-lab/engine/templates/morph.js','utf8');
const body=source.slice(source.indexOf('async function houseCanvas'),source.indexOf('// ---- helpers for scenes'));
const shot=JSON.parse(fs.readFileSync('work/director-calibration-20261030/current-engine-v12-shot.json','utf8'));
const moduleBytes=fs.readFileSync('work/director-calibration-20261030/B26-v12-recovered.mjs');
const profile='paperclip-138-full/B26-v12/20261021';
async function mount(h, corrupt=false, failLoad=false){
 class Canvas {constructor(){this.font='400 22px "House Kikai"';this.calls=[];this.textAlign='left';}getTransform(){return {a:1,b:0};}measureText(t){this.calls.push(['measure',this.font,t]);return {width:t.length*(this.font.includes('Kikai')?13.5:6),actualBoundingBoxAscent:20,actualBoundingBoxDescent:3};}fillText(t){this.calls.push(['fill',this.font,t]);}strokeText(t){this.calls.push(['stroke',this.font,t]);}}
 const ctx=vm.createContext({console,URL,Set,Map,TextEncoder,crypto:webcrypto,DISPLAY_FACES:new Set(['House Sumikaku','House Kaiso']),DISPLAY_MIN:90,KINKAKU_ODD:new Set(),CanvasRenderingContext2D:Canvas,window:{},location:{href:'http://localhost/shot.html'},document:{fonts:{add(){}}},FontFace:class{constructor(f){this.family=f;}async load(){if(failLoad)throw Error('font decode failed');return this;}},fetch:async(url)=>{let bytes=String(url).endsWith('.mjs')?moduleBytes:fs.readFileSync(new URL(url).pathname.slice(1));if(corrupt===true||(corrupt==='font'&&!String(url).endsWith('.mjs')))bytes=Buffer.from('tampered');return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}});
 const binding=fs.readFileSync('work/recipe-board-v1/style-lab/engine/templates/historical-font-replay.js','utf8').replace('export async function','async function');
 vm.runInContext(binding+'\n'+body+';globalThis.mount=houseCanvas;',ctx);
 await ctx.mount(h,shot.params.module);return {g:new Canvas(),window:ctx.window};
}
const H=structuredClone(shot.params.house);
const baseline=await mount(H);baseline.g.measureText('DYS576');baseline.g.fillText('DYS576',0,0);
assert.equal(baseline.g.calls[0][1],baseline.g.calls[1][1],'current measurement and drawing already agree');
assert.match(baseline.g.calls[0][1],/House Kaiso/,'unversioned current roles must remain unchanged');
const legacy=await mount({...H,historicalReplay:profile});legacy.g.measureText('DYS576');legacy.g.fillText('DYS576',0,0);legacy.g.strokeText('DYS576',0,0);
assert.match(legacy.g.calls[0][1],/House Kikai/,'pinned historical Kikai request must not silently become Kaiso');
assert.ok(legacy.g.calls.every(c=>c[1]===legacy.g.calls[0][1]),'measure/fill/stroke resolve the same historical face');
assert.equal(legacy.g.font,'400 22px "House Kikai"','requested font restored');
legacy.g.measureText('兇');assert.match(legacy.g.calls.at(-1)[1],/House Kokka/,'missing historical Kikai glyph falls back to a house face');
legacy.g.font='22px "House Kikai"';legacy.g.measureText('凶!');assert.equal(legacy.window.__houseFace(legacy.g.font,'凶!',legacy.g),legacy.g.calls.at(-1)[1].match(/"([^"]+)"/)[1],'reported face uses the same historical conversion as measurement');
legacy.g.font='22px "Arbitrary Font"';legacy.g.measureText('abc');assert.match(legacy.g.calls.at(-1)[1],/House Kokka/,'historical replay does not allow arbitrary fonts');
const eva=await mount({...H,six:{display:'House Kokka',small:'House Kokka',latin:'House Kaiso',last:'House Gothic'}});eva.g.measureText('DYS576');assert.match(eva.g.calls.at(-1)[1],/House Kaiso/,'new EVA roles are not reverted');
await assert.rejects(()=>mount({...H,historicalReplay:'anything'}),/historical replay/);
await assert.rejects(()=>mount({...H,historicalReplay:profile},true),/historical replay/);
await assert.rejects(()=>mount({...H,historicalReplay:profile},'font'),/historical replay/);
await assert.rejects(()=>mount({...H,historicalReplay:profile,six:{display:'House Kokka'}}),/historical replay/);
await assert.rejects(()=>mount({...H,historicalReplay:profile,missing:{}}),/historical replay/);
await assert.rejects(()=>mount({...H,historicalReplay:profile},false,true),/historical replay/);
console.log('historical house font: default roles, pinned face, measure/draw parity, fail-closed bindings passed');
