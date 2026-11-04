import assert from 'node:assert/strict';
import { geometryTrack } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const old = globalThis.window;
try {
  globalThis.window = { __measure:()=>{}, __morphText:()=>[], __morphCamera:t=>({flat:{s:t>=14?1:1.22}}) };
  const track = await geometryTrack({evaluate:(fn,args)=>fn(args)}, 15);
  assert.equal(track.find(x=>x.t===14).camera.flat.s,1,'14-second sample must execute at 14, not 13.9999999999');
  assert.equal(track.find(x=>x.t===13.8).camera.flat.s,1.22);
  console.log('geometry sampling uses the same exact timestamp it records at a beat boundary');
} finally { globalThis.window = old; }
