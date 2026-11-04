import fs from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {assertReviewPlaybackSelection,motionReviewSource} from '../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
const w=JSON.parse(fs.readFileSync('work/morning-cap-recovery/closeout/workspace.before.json'));
for(const shotId of ['ED-21','ED-24']) {
 const shot=w.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId===shotId),c=shot.motionReviewPlan.viewerReview.repairCandidate;
 const r={contract:'A1ReviewPlaybackSelection/v1',shotId,source:motionReviewSource(shot),oldVideoSha256:shot.motionReviewReceipt.video.sha256,newVideoSha256:c.video.sha256,scope:'REVIEW_OUTPUT_ONLY',productionAdmission:false,userVisualApproval:'NOT_APPROVED',route:shot.route,executionRoute:shot.motionDesignContract.executionRoute,upstreamSha256:c.capExport.sha256,reason:'用户认可早晨成熟修复；旧审看片未回填。ED24保持10:32原声完整操作版本，不指定tight为唯一winner。',changedLayer:shotId==='ED-21'?'清晰单次编辑与结果保留':'可读理由与风格库结果',preservedBehavior:'原声、完整真实操作、结果语义；不改正式镜槽或审批',userDirective:{quote:'对这些成熟多了 怎么不回填呢',scope:'REVIEW_SELECTION_ONLY'}};
 assert.equal(assertReviewPlaybackSelection(shot,r),c);
 for(const change of [{oldVideoSha256:'0'.repeat(64)},{newVideoSha256:'0'.repeat(64)},{source:{...r.source,versionId:'stale'}},{route:'LOCAL'},{upstreamSha256:'0'.repeat(64)},{userDirective:null},{productionAdmission:true},{reason:''}])assert.throws(()=>assertReviewPlaybackSelection(shot,{...r,...change}));
 const bad=structuredClone(shot);bad.motionReviewPlan.viewerReview.repairCandidate.validation.purity.pure=false;assert.throws(()=>assertReviewPlaybackSelection(bad,r));
 fs.writeFileSync(`work/morning-cap-recovery/closeout/${shotId}-selection.json`,JSON.stringify(r,null,2));
}
const require=createRequire(new URL('../apps/studio-next/package.json',import.meta.url)),ts=require('typescript'),module={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('apps/studio-next/src/app/system-line-visual-workbench/ShotMotionReview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(require,module,module.exports);
const resolve=module.exports.resolveShotPreview;
const fixture=structuredClone(w.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==='ED-24'));
const input=JSON.parse(fs.readFileSync('work/morning-cap-recovery/closeout/ED-24-selection.json'));
assert.equal(resolve(fixture).playbackSha256,fixture.motionReviewReceipt.video.sha256);
fixture.reviewPlaybackSelection={...input,video:structuredClone(fixture.motionReviewPlan.viewerReview.repairCandidate.video)};
assert.equal(resolve(fixture).playbackSha256,input.newVideoSha256);
fixture.motionReviewPlan.viewerReview.candidateVideoSha256='a'.repeat(64);
assert.equal(resolve(fixture).playbackSha256,input.newVideoSha256,'pending registration cannot steal selection');
fixture.reviewPlaybackSelection.source={...input.source,versionId:'stale'};
assert.equal(resolve(fixture).playbackSha256,fixture.motionReviewReceipt.video.sha256);
console.log('PASS: positive selection; stale/source/route/upstream/scope/purity negatives; explicit resolver and pending non-preemption');
