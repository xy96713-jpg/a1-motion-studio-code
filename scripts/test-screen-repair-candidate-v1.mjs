import assert from 'node:assert/strict';
import * as review from '../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
assert.equal(typeof review.assertScreenRepairCandidate, 'function', 'explicit review-only repair candidate validator required');
const shot={shotId:'ED-21',route:'SCREEN_EVIDENCE',versionId:'v1',artifactSha256:'a'.repeat(64),revisionSha256:'b'.repeat(64),timeRange:{durationMs:8540},motionDesignContract:{motionDesignSha256:'c'.repeat(64)},sourceText:'text',actionContract:{hold:'edit'}};
const record={contract:'A1ScreenRepairReviewCandidate/v1',shotId:shot.shotId,source:review.motionReviewSource(shot),productionAdmission:false,userVisualApproval:'NOT_APPROVED',usageMode:'INTERNAL_REVIEW_CANARY_ONLY',video:{sha256:'d'.repeat(64)},productionBaselineSha256:'e'.repeat(64)};
const report={sourceStoryboardVersionId:'v1',sourceStoryboardRevisionSha256:shot.revisionSha256,cameraRecipe:{shotId:'ED-21',actionContract:shot.actionContract},narrationBinding:{sourceText:'text'}};
assert.doesNotThrow(()=>review.assertScreenRepairCandidate(shot,record,report));
for(const mutate of [r=>r.productionAdmission=true,r=>r.userVisualApproval='APPROVED',r=>r.source.versionId='stale',r=>r.video.sha256='bad',r=>r.source.semanticSha256='stale']) {const bad=structuredClone(record);mutate(bad);assert.throws(()=>review.assertScreenRepairCandidate(shot,bad,report));}
assert.throws(()=>review.assertScreenRepairCandidate(shot,record,{...report,sourceStoryboardVersionId:'old'}));
assert.throws(()=>review.assertScreenRepairCandidate(shot,record,{...report,cameraRecipe:{...report.cameraRecipe,actionContract:{hold:'other'}}}));
const fs=await import('node:fs');
assert.match(fs.readFileSync(new URL('./integrate-current-screen-production-v1.mjs',import.meta.url),'utf8'),/mode === "candidate"/,'unified entry must expose candidate transition');
console.log('PASS screen repair candidate binding and approval rejection');
