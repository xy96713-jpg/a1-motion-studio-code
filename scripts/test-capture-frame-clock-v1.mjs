import assert from 'node:assert/strict';import {locateCaptureWindow} from './lib/capture-frame-clock-v1.mjs';
const timestamps=Array.from({length:20},(_,i)=>i/25),coverage=[1,1,1,...Array(12).fill(0),1,1,1,0,0];
const r=locateCaptureWindow({timestamps,coverage,wallDurationMs:480});assert.equal(r.startFrame,3);assert.equal(r.endFrameExclusive,15);assert.equal(r.startSeconds,.12);
assert.throws(()=>locateCaptureWindow({timestamps,coverage:coverage.map(()=>0),wallDurationMs:480}),/MARKER_PAIR/);
assert.throws(()=>locateCaptureWindow({timestamps,coverage,wallDurationMs:900}),/DURATION_MISMATCH/);
const contaminated=[...coverage];contaminated[8]=.5;assert.throws(()=>locateCaptureWindow({timestamps,coverage:contaminated,wallDurationMs:480}),/CLEAN_WINDOW/);
const bad=[...timestamps];bad[5]=0;assert.throws(()=>locateCaptureWindow({timestamps:bad,coverage,wallDurationMs:480}),/INPUT_INVALID/);
console.log('PASS: capture window excludes markers and rejects missing markers, contaminated frames, time reversal and duration drift');
