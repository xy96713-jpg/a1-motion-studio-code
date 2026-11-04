import assert from 'node:assert/strict';
import {buildFfmpegFrameSelectFilterV1} from '../apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs';
assert.equal(buildFfmpegFrameSelectFilterV1([0,161,376]),"select='eq(n,0)+eq(n,161)+eq(n,376)'");
for(const invalid of [[],[1,1],[-1],[.5],[NaN],[Infinity],['0),scale=1:1'],Array.from({length:61},(_,i)=>i),[Number.MAX_SAFE_INTEGER+1]])assert.throws(()=>buildFfmpegFrameSelectFilterV1(invalid),/SELECTION_INVALID/);
const frames=[24,0,160];buildFfmpegFrameSelectFilterV1(frames);assert.deepEqual(frames,[24,0,160]);
console.log(JSON.stringify({status:'PASS',checks:['quoted-filter-commas','bounded-unique-safe-integer-frames','reject-filter-injection','preserve-declared-input-order-without-mutation']}));
