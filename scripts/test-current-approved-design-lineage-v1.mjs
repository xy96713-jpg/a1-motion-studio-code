import fs from 'node:fs';
import assert from 'node:assert/strict';
import {auditWholeFilmStaticBoardCandidateAuthorities as audit} from '../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs';
const workspace=JSON.parse(fs.readFileSync('apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json'));
assert.equal(audit(workspace).status,'PASS');
for(const mutate of [s=>{s.designApproval.status='NOT_APPROVED'},s=>{s.approvedDesignCandidate.sha256='0'.repeat(64)},s=>{s.motionReviewReceipt.source.versionId='stale'},s=>{s.motionReviewReceipt.validation.finalFrameMatchesSource=false}]){
 const changed=structuredClone(workspace);mutate(changed.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==='ED-01'));
 assert.ok(audit(changed).blockedShotIds.includes('ED-01'));
}
console.log('PASS: current approved design resolves legacy lineage; revoked/stale/unverified bindings block');
