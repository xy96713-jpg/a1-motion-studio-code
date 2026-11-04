import assert from 'node:assert/strict';
import {assertMotionReviewReplacement} from '../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
const old='a'.repeat(64), next='b'.repeat(64), upstream='c'.repeat(64);
const shot={shotId:'ED-test',route:'SCREEN_EVIDENCE',motionDesignContract:{executionRoute:'SCREEN_CAPTURE'},motionReviewReceipt:{video:{sha256:old}},motionReviewPlan:{capturedSource:{sha256:upstream},productionBaseline:{packagingBaseline:{sha256:'d'.repeat(64)}}}};
const record={video:{sha256:next},replacement:{oldVideoSha256:old,newVideoSha256:next,reason:'repair adapter scale only',scope:'REVIEW_OUTPUT_ONLY',route:shot.route,executionRoute:'SCREEN_CAPTURE',upstreamSha256:upstream}};
assert.doesNotThrow(()=>assertMotionReviewReplacement(shot,record));
for(const change of [r=>delete r.replacement,r=>r.replacement.oldVideoSha256=upstream,r=>r.replacement.newVideoSha256=old,r=>r.replacement.reason='',r=>r.replacement.scope='REJECT_UPSTREAM_PACKAGE',r=>r.replacement.route='GENERATED',r=>r.replacement.executionRoute='LOCAL_DETERMINISTIC_MOTION',r=>r.replacement.upstreamSha256='e'.repeat(64)]){const bad=structuredClone(record);change(bad);assert.throws(()=>assertMotionReviewReplacement(shot,bad));}
assert.throws(()=>assertMotionReviewReplacement({...shot,motionReviewPlan:{}},record),/upstream/);
assert.doesNotThrow(()=>assertMotionReviewReplacement(shot,{video:{sha256:old}}),'same SHA is not replacement');
assert.doesNotThrow(()=>assertMotionReviewReplacement({...shot,motionReviewReceipt:null},{video:{sha256:next}}),'initial receipt uses existing admission checks');
console.log('PASS replacement old/new SHA, reason, review-only scope, route and resolved upstream; adapter rejection cannot broaden to package');
