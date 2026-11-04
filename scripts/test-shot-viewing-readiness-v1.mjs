import assert from 'node:assert/strict';
import {auditShotViewingReadiness,mergeMotionReviewPlan} from '../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
const req={scope:'ENTRY_PREVIEW',plannedMinimumMs:1800,durationMs:1987,minimumSettledHoldMs:1000,requireStableLayout:true,narrationAligned:true};
const good={demonstrationScope:'ENTRY_PREVIEW',settledHoldMs:1100,layoutStable:true};
assert.equal(auditShotViewingReadiness(req,good).status,'PASS');
for(const change of [{demonstrationScope:'FULL_FLOW'},{settledHoldMs:500},{layoutStable:false}])assert.equal(auditShotViewingReadiness(req,{...good,...change}).status,'BLOCKED');
assert.equal(auditShotViewingReadiness({...req,plannedMinimumMs:3000},good).status,'BLOCKED');
const reviewed={...good,videoSha256:'a'.repeat(64),normalSpeedPlayback:true,withNarration:true,attentionTarget:'改写入口',observableChange:'划选后出现入口',readingConclusion:'入口名称清晰，未要求读候选正文'};
reviewed.sequenceReview={videoSha256:'c'.repeat(64),includedShotVideoSha256s:['a'.repeat(64)],normalSpeedPlayback:true,withNarration:true,status:'PASS',continuityObservation:'fixture',pacingObservation:'fixture',readabilityObservation:'fixture',unresolvedIssues:[]};
const options={phase:'record',videoSha256:'a'.repeat(64)};
assert.equal(auditShotViewingReadiness(req,good,options).status,'BLOCKED');
assert.equal(auditShotViewingReadiness(req,reviewed,options).status,'PASS');
assert.equal(auditShotViewingReadiness(req,{...reviewed,videoSha256:'b'.repeat(64)},options).status,'BLOCKED');
assert.equal(auditShotViewingReadiness({...req,narrationAligned:false},reviewed,options).status,'BLOCKED');
assert.equal(auditShotViewingReadiness({...req,narrationAligned:false},{...reviewed,narrationAlignmentResolved:true},options).status,'BLOCKED');
console.log('PASS: overload, short holds, unstable layout, unreviewed clips, stale output and unresolved narration are blocked');

assert.equal(auditShotViewingReadiness({...req,minimumTargetTextPx:18},{...reviewed,targetTextPx:12},options).status,'BLOCKED');
assert.equal(auditShotViewingReadiness({...req,minimumTargetTextPx:18},{...reviewed,targetTextPx:20},options).status,'PASS');

const prior={source:{versionId:'v1'},viewerRequirements:req,viewerReview:{status:'PASS'}};
assert.deepEqual(mergeMotionReviewPlan(prior,{source:{versionId:'v1'},action:'BUILD_SCREEN_CANARY'}).viewerRequirements,req);
const changed=mergeMotionReviewPlan(prior,{source:{versionId:'v2'},action:'BUILD_SCREEN_CANARY'});
assert.equal(changed.viewerRequirements.bindingStale,true);
assert.equal(auditShotViewingReadiness(changed.viewerRequirements,good).status,'BLOCKED');

assert.equal(auditShotViewingReadiness(req,{...reviewed,sequenceReview:null},options).status,'BLOCKED');
assert.equal(auditShotViewingReadiness(req,{...reviewed,sequenceReview:{...reviewed.sequenceReview,unresolvedIssues:['snap return']}},options).status,'BLOCKED');
