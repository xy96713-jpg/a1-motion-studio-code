import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import * as review from '../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
const root=process.cwd();
const w=JSON.parse(fs.readFileSync('apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json'));
const shot=w.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==='ED-14');
const receipt={contract:'A1ReviewOnlyMotionTiming/v1',shotId:'ED-14',source:review.motionReviewSource(shot),usageMode:'INTERNAL_REVIEW_CANARY_ONLY',productionAdmission:false,userVisualApproval:'NOT_APPROVED',audio:{path:'work/ed14-approved-conversational-v3/ED-14-v3-take1.wav',sha256:'52afe66c7b1c9492d4145a5cad5205364a3489df9174c29f3d44538b946bbe13'},durationMs:11280,fps:50,outputDirectory:'work/review-only-motion/ED-14/approved-v3',beats:[{id:'syntax',startMs:5800,durationMs:600},{id:'lexicon',startMs:7100,durationMs:500},{id:'bounded-conclusion',startMs:7760,durationMs:500}]};
assert.equal(typeof review.assertReviewOnlyMotionTiming,'function','missing scoped timing validator');
assert.doesNotThrow(()=>review.assertReviewOnlyMotionTiming(shot,receipt,{root,regionIds:['syntax','lexicon','bounded-conclusion']}));
console.log('PASS legal source/audio-bound timing; original source duration retained');
const validate=r=>review.assertReviewOnlyMotionTiming(shot,r,{root,regionIds:['syntax','lexicon','bounded-conclusion']});
for(const [name,edit] of [
 ['source-sha',r=>r.source.artifactSha256='0'.repeat(64)],
 ['audio-sha',r=>r.audio.sha256='0'.repeat(64)],
 ['scope',r=>r.shotId='ED-20'],['approval',r=>r.productionAdmission=true],
 ['public-path',r=>r.outputDirectory='apps/studio-next/public/generated/escape'],
 ['traversal',r=>r.outputDirectory='work/review-only-motion/ED-14/../../escape'],
 ['wrong-shot-path',r=>r.outputDirectory='work/review-only-motion/ED-20/escape'],
 ['fractional-frames',r=>r.durationMs=11281],['duration',r=>r.durationMs=0],
 ['missing-beat',r=>r.beats.pop()],['unknown-beat',r=>r.beats[0].id='invented'],
 ['late-beat',r=>r.beats[2].startMs=11200],['missing-auth',r=>r.source.durationMs=11280]
]){const bad=structuredClone(receipt);edit(bad);assert.throws(()=>validate(bad),undefined,name);}
assert.throws(()=>review.assertMotionReviewBinding(shot,{source:{...receipt.source,durationMs:11280}}),/durationMs/);
assert.throws(()=>review.assertMotionReviewReceipt(shot,receipt),/receipt-invalid/);
fs.mkdirSync('work/review-only-motion/ED-14',{recursive:true});
const link='work/review-only-motion/ED-14/test-escape';
try {fs.symlinkSync('/tmp',link);assert.throws(()=>validate({...receipt,outputDirectory:link}),/path/);} finally {fs.unlinkSync(link);}
console.log('PASS negative scope/SHA/path/beat/timing cases; production rejects timing receipt');
assert.match(fs.readFileSync('scripts/render-current-shot-local-motion-review-v1.mjs','utf8'),/--review-timing/,'CLI has no timing entry');
const tmp='work/review-only-motion/ED-14/test-timing.json';fs.writeFileSync(tmp,JSON.stringify(receipt));
try {
 const run=spawnSync(process.execPath,['scripts/render-current-shot-local-motion-review-v1.mjs','ED-14','--review-timing',tmp,'--validate-only'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).status,'REVIEW_ONLY_TIMING_VALID');
 for(const edit of [r=>r.audio.sha256='0'.repeat(64),r=>r.outputDirectory='apps/studio-next/public/escape',r=>r.beats[2].startMs=9600]) {const bad=structuredClone(receipt);edit(bad);fs.writeFileSync(tmp,JSON.stringify(bad));const fail=spawnSync(process.execPath,['scripts/render-current-shot-local-motion-review-v1.mjs','ED-14','--review-timing',tmp,'--validate-only'],{encoding:'utf8'});assert.notEqual(fail.status,0);}
} finally {fs.unlinkSync(tmp);}
console.log('PASS CLI legal and fail-closed SHA/path preflight');
export {shot,receipt};
