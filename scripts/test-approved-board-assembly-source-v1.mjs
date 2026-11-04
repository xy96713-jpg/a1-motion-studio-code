import fs from 'node:fs';
import assert from 'node:assert/strict';
import {currentApprovedMasterBinding} from '../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs';
const w=JSON.parse(fs.readFileSync('apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json'));
const plan=w.production.shotIntelligence.packageLookMasterPlans.find(p=>p.shotId==='ED-01');
const bind=x=>currentApprovedMasterBinding(x,'ED-01',plan,x.production.shotIntelligence.wholeFilmStaticBoard.sha256);
const b=bind(w),s=w.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==='ED-01');
assert.equal(b.artifactSha256,s.artifactSha256);assert.notEqual(b.artifactSha256,plan.provisionalWholeFilmBoardSelection.artifact.sha256);assert.equal(b.serverVisualAssessmentSha256,null);assert.match(b.localVisualReviewSha256,/^[a-f0-9]{64}$/);assert.equal(b.selectedBy,'user');
for(const mutate of [s=>s.designApproval.status='NOT_APPROVED',s=>s.motionReviewReceipt.source.versionId='stale',s=>s.motionReviewReceipt.validation.finalFrameMatchesSource=false]){const copy=structuredClone(w);mutate(copy.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==='ED-01'));assert.equal(bind(copy),null);}
console.log('PASS: approved actual master compiled; predecessor and invalid reviews rejected without fake server audit');
