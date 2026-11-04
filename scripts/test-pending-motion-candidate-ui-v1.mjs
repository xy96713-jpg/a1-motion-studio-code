import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../apps/studio-next/package.json', import.meta.url));
const ts = require('typescript'), React = require('react'), {renderToStaticMarkup} = require('react-dom/server');
const source = fs.readFileSync(new URL('../apps/studio-next/src/app/system-line-visual-workbench/ShotMotionReview.tsx', import.meta.url), 'utf8');
const module = {exports:{}};
new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(require,module,module.exports);
const resolve = module.exports.resolveShotPreview;
const binding = {versionId:'v',artifactSha256:'static',motionDesignSha256:'motion',durationMs:5000};
const shot = {shotId:'TEST',...binding,timeRange:{durationMs:5000},motionDesignContract:{motionDesignSha256:'motion'},motionReviewPlan:{source:binding,action:'BUILD_LOCAL_CANARY',reason:'Current candidate',viewerRequirements:{viewerTask:'Read',minimumSettledHoldMs:2000},viewerReview:{status:'PENDING_INTERNAL_SEQUENCE_REVIEW',candidateVideoSha256:'new'}},motionReviewReceipt:{source:binding,status:'READY_FOR_USER_REVIEW',video:{publicUrl:'/old.mp4',sha256:'old'}}};
const render = (s=shot) => renderToStaticMarkup(React.createElement(module.exports.ShotMotionReview,{shot:s}));
// /old.mp4 is a valid selected receipt: READY status and all four bindings match.
// A differing pending candidate SHA alone is NOT evidence of stale selection.
assert.match(render(), /src="\/old.mp4"/);
assert.equal(resolve(shot).motionUrl,'/old.mp4');
assert.match(render(), /有效选定样片不被替换/);
for (const mismatch of [{versionId:'stale'},{artifactSha256:'stale'},{motionDesignSha256:'stale'},{durationMs:4000}]) {
  const invalid = structuredClone(shot);
  invalid.motionReviewReceipt.source = {...binding,...mismatch};
  invalid.screenStoryboard = {video:{publicUrl:'/historical.mp4'}};
  assert.equal(resolve(invalid).motionUrl,null);
  assert.doesNotMatch(render(invalid), /<video/);
}
for (const status of ['STALE_REVIEW_REQUIRED','REJECTED','MISSING']) {
  const invalid = structuredClone(shot);
  invalid.motionReviewReceipt.status = status;
  assert.equal(resolve(invalid).motionUrl,null);
  assert.doesNotMatch(render(invalid), /<video/);
}
shot.motionReviewPlan.viewerReview = {status:'PENDING_ADAPTED_PACKAGE_REVIEW',candidateVideoSha256:'adapted',candidateVideoPublicUrl:'/adapted.mp4',narratedPreviewUrl:'/narrated.mp4'};
assert.equal(resolve(shot).motionUrl,'/old.mp4');
assert.equal(resolve(shot,'adapted').motionUrl,'/adapted.mp4');
assert.equal(resolve(shot,'previous-candidate').motionUrl,null);
// Detail cards expose separately labelled, non-autoplay previews, not the default main frame.
assert.match(render(), /src="\/old.mp4"/);
assert.match(render(), /src="\/adapted.mp4"/);
assert.doesNotMatch(render(), /autoplay/i);
assert.match(render(), /内部观看检查待完成/);
shot.motionReviewPlan.viewerReview = {status:'PENDING_REPAIRED_SCREEN_REVIEW',candidateVideoSha256:'repair',candidateVideoPublicUrl:'/repair.mp4',repairCandidate:{source:binding,video:{sha256:'repair'},productionAdmission:false,userVisualApproval:'NOT_APPROVED'}};
assert.equal(resolve(shot).motionUrl,'/old.mp4');
assert.equal(resolve(shot,'repair').motionUrl,'/repair.mp4');
assert.match(render(), /修复候选/);
shot.motionReviewPlan.viewerReview.repairCandidate.source = {...binding,versionId:'stale'};
assert.equal(resolve(shot).motionUrl,'/old.mp4','bad candidate cannot invalidate good selection');
assert.equal(resolve(shot,'repair').motionUrl,null);
assert.doesNotMatch(render(), /src="\/repair.mp4"/);
shot.motionReviewReceipt.source = {...binding,versionId:'stale'};
assert.equal(resolve(shot).motionUrl,null);
assert.doesNotMatch(render(), /<video/);
shot.motionReviewReceipt.source = binding;
shot.motionReviewPlan.viewerReview.repairCandidate.source = binding;
for (const gate of ['superseded','redesign','stale-plan','missing-candidate-sha']) {
  const invalid = structuredClone(shot);
  if (gate === 'superseded') invalid.motionReviewPlan.viewerReview.supersededByUnifiedPlan = true;
  if (gate === 'redesign') invalid.motionReviewPlan.action = 'REDESIGN_REQUIRED';
  if (gate === 'stale-plan') invalid.motionReviewPlan.source = {...binding,versionId:'stale'};
  if (gate === 'missing-candidate-sha') invalid.motionReviewPlan.viewerReview = {status:'PENDING_ADAPTED_PACKAGE_REVIEW',candidateVideoPublicUrl:'/unbound.mp4'};
  assert.equal(resolve(invalid,'repair').motionUrl,null,gate);
  assert.equal(resolve(invalid).candidateUrl,null,gate);
  assert.doesNotMatch(render(invalid), /src="\/(repair|unbound).mp4"/,gate);
  if (gate !== 'missing-candidate-sha') assert.doesNotMatch(render(invalid), /<video/,gate);
}
console.log('PASS pending UI: valid selected retained; invalid old output closed; explicit SHA-bound audition; superseded/redesign gates shared');
