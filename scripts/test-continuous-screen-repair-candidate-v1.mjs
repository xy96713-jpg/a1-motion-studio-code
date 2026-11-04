import assert from 'node:assert/strict';
import {assertScreenRepairCandidate,motionReviewSource} from '../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
import {unifiedSelectionHash} from '../apps/studio-next/src/lib/a1-unified-screen-production-v1.mjs';
const h=c=>c.repeat(64),shot={shotId:'ED-03',route:'SCREEN_EVIDENCE',versionId:'v',artifactSha256:h('a'),revisionSha256:h('b'),timeRange:{durationMs:5840},sourceText:'text',actionContract:{hold:'real'},motionReviewPlan:{capturedSource:{path:'work/source.mp4',sha256:h('c')}}};
const report={sourceStoryboardVersionId:'v',sourceStoryboardRevisionSha256:h('b'),cameraRecipe:{shotId:'ED-03',actionContract:shot.actionContract},narrationBinding:{sourceText:'text'}};
const record={contract:'A1ScreenRepairReviewCandidate/v1',kind:'CONTINUOUS_VERIFIED_SOURCE_REPAIR',shotId:'ED-03',source:motionReviewSource(shot),productionAdmission:false,userVisualApproval:'NOT_APPROVED',usageMode:'INTERNAL_REVIEW_CANARY_ONLY',video:{sha256:h('d')},productionBaselineSha256:h('e')};
assert.throws(()=>assertScreenRepairCandidate(shot,record,report),/continuous-repair-scope-required/);
console.log('PASS missing bound continuous repair scope rejected');
const scope={kind:record.kind,sourceSha256:h('c'),previousVideo:{path:'work/old.mp4',sha256:h('f')},narrationSource:{path:'work/narrated.mp4',sha256:h('a')},startFrame:200,settleFrame:236,holdFrames:114,fps:60,actionPlaybackRate:1,generationAllowed:false,recaptureAllowed:false,productionAdmission:false};
shot.motionReviewPlan.productionBaseline={mode:'REPAIR_ON_VERIFIED_SOURCE',repairScope:scope,verifiedSource:shot.motionReviewPlan.capturedSource};
Object.assign(record,{productionBaselineSha256:unifiedSelectionHash(shot.motionReviewPlan.productionBaseline),narrationSource:scope.narrationSource,renderedVideo:{path:'work/render.mp4',sha256:h('d')},renderManifest:{path:'work/manifest.json',sha256:h('e')}});report.sourceVideo=shot.motionReviewPlan.capturedSource;
assert.doesNotThrow(()=>assertScreenRepairCandidate(shot,record,report));
for(const mutate of [s=>s.motionReviewPlan.productionBaseline.mode='KEEP_VERIFIED_SEQUENCE',s=>s.motionReviewPlan.productionBaseline.repairScope.actionPlaybackRate=2,s=>s.motionReviewPlan.productionBaseline.repairScope.holdFrames=90]){const bad=structuredClone(shot);mutate(bad);assert.throws(()=>assertScreenRepairCandidate(bad,record,report),/continuous-repair/);}
for(const mutate of [r=>r.kind='FAKE',r=>r.capExport=r.renderedVideo,r=>r.narrationSource={...r.narrationSource,sha256:h('f')},r=>r.renderManifest=null]){const bad=structuredClone(record);mutate(bad);assert.throws(()=>assertScreenRepairCandidate(shot,bad,report));}
assert.throws(()=>assertScreenRepairCandidate(shot,record,{...report,sourceVideo:{...report.sourceVideo,sha256:h('f')}}),/continuous-repair/);
console.log('PASS continuous repair positive binding, source/audio/hold/mode/provenance negative cases');
