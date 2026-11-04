#!/usr/bin/env node

import assert from "node:assert/strict";
import {allocateSequenceMedia, assertSequenceMediaAllocation, assertStoryboardMediaNeedPlan, assertStoryboardMediaRetrieval, compileStoryboardMediaNeedPlan, retrieveStoryboardMediaCandidates} from "../apps/studio-next/src/lib/a1-storyboard-media-retrieval-orchestrator-v1.mjs";
import {assertFreshExternalSearchCandidate, assertStoryboardLiveMediaSearchPlan, compileStoryboardLiveMediaSearchPlan} from "../apps/studio-next/src/lib/a1-storyboard-live-media-search-v1.mjs";

const sha = (letter) => letter.repeat(64);
const plan = compileStoryboardMediaNeedPlan({storyboardId: "blind", storyboardSha256: sha("a"), title: "Blind storyboard", shots: [
  {id: "evidence", order: 1, sourceText: "官方报告记录了事故发生时间", viewerTask: "看见真实报告和时间", claimType: "EVIDENCE_CLAIM", networkDecision: "REQUIRED", evidenceRoute: "DOCUMENT", entities: ["Agency"], event: {name: "incident", date: "2026"}, targetDurationMs: 5000},
  {id: "identity", order: 2, sourceText: "创始人在采访中解释决定", viewerTask: "看见正确人物面对镜头表达", claimType: "INTERVIEW_QUOTE", sourceIntent: "INTERVIEW", entities: ["Founder"], actions: ["speaking"], targetDurationMs: 5000},
  {id: "process", order: 3, sourceText: "系统重复执行三个步骤", viewerTask: "看见步骤发生而不是静态物件", shotFunction: "ACTION", actions: ["workflow"], targetDurationMs: 6000},
  {id: "atmosphere", order: 4, sourceText: "空房间留下等待后的沉默", viewerTask: "看见安静空间作为情绪转场", shotFunction: "TRANSITION", tone: "REFLECTIVE", targetDurationMs: 6000},
]});
assertStoryboardMediaNeedPlan(plan);
assert.equal(plan.needs[0].evidenceDuty, "VERIFIED_EVIDENCE");
assert.equal(plan.needs[1].evidenceDuty, "VERIFIED_IDENTITY");
const liveSearchPlan = compileStoryboardLiveMediaSearchPlan(plan);
assertStoryboardLiveMediaSearchPlan(liveSearchPlan);
assert.equal(liveSearchPlan.items[0].mediaClass, "EVIDENCE_SOURCE");
assert.equal(liveSearchPlan.items[1].mediaClass, "EXACT_INTERVIEW_VIDEO");
assert.equal(liveSearchPlan.items[2].mediaClass, "LICENSED_BROLL");
assert.ok(liveSearchPlan.items.every((item) => item.acceptance.localOrNasPoolCannotSatisfySearch));

const searchStartedAt = "2026-09-18T00:00:00.000Z";
const freshCandidate = {
  provider: "WIKIMEDIA_COMMONS",
  sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Example.webm",
  sourcePath: "work/live/source.webm",
  clipPath: "work/live/selected.mp4",
  keyframePath: "work/live/key.png",
  sourceSha256: sha("c"),
  clipSha256: sha("d"),
  searchReceipt: {searchedAt: "2026-09-18T00:00:01.000Z", liveRequestCount: 1, cacheOnly: false, localPoolUsed: false},
};
assert.doesNotThrow(() => assertFreshExternalSearchCandidate(freshCandidate, searchStartedAt));
assert.throws(() => assertFreshExternalSearchCandidate({...freshCandidate, provider: "LOCAL_NAS"}, searchStartedAt), /provider-invalid/u);
assert.throws(() => assertFreshExternalSearchCandidate({...freshCandidate, searchReceipt: {...freshCandidate.searchReceipt, localPoolUsed: true}}, searchStartedAt), /local-pool-forbidden/u);

const common = {width: 1280, height: 720, inMs: 0, outMs: 5000, keyframePath: "work/key.png", sourceGrade: "B", licenseReviewStatus: "PASS", visualScore: .7, textScore: .7};
const candidates = {
  "*": [
    {...common, id: "film-fake-evidence", sourceId: "film", sourceGroup: "film", mediaClass: "FILM_REFERENCE", rightsStatus: "REFERENCE_ONLY", referenceOnly: true, evidenceCapable: false, identityVerified: false, eventVerified: false, directActionVerified: true, description: "a dramatic report reenactment"},
    {...common, id: "verified-document", sourceId: "document", sourceGroup: "archive", mediaClass: "EVIDENCE_SOURCE", rightsStatus: "OPEN_LICENSE_VERIFIED", evidenceCapable: true, eventVerified: true, directActionVerified: true, entities: ["Agency"], description: "official incident report 2026"},
    {...common, id: "founder-interview", sourceId: "interview", sourceGroup: "interview", mediaClass: "EXACT_INTERVIEW_VIDEO", rightsStatus: "OPEN_LICENSE_VERIFIED", identityVerified: true, directActionVerified: true, entities: ["Founder"], actions: ["speaking"], transcript: "founder explains the decision"},
    {...common, id: "process-one", sourceId: "process", sourceGroup: "local-process", mediaClass: "LOCAL_NAS_SCENE", rightsStatus: "REFERENCE_ONLY", referenceOnly: true, directActionVerified: true, actions: ["workflow"], description: "step by step workflow"},
    {...common, id: "atmosphere-one", sourceId: "room-1", sourceGroup: "hotel", mediaClass: "LOCAL_NAS_SCENE", rightsStatus: "REFERENCE_ONLY", referenceOnly: true, directActionVerified: false, description: "quiet empty room"},
    {...common, id: "atmosphere-two", sourceId: "room-2", sourceGroup: "hotel", mediaClass: "LOCAL_NAS_SCENE", rightsStatus: "REFERENCE_ONLY", referenceOnly: true, directActionVerified: false, description: "dark empty room"},
  ],
};
const retrieval = retrieveStoryboardMediaCandidates(plan, candidates, {limit: 4});
assertStoryboardMediaRetrieval(retrieval);
assert.equal(retrieval.shots.find((shot) => shot.shotId === "evidence").topCandidates[0].id, "verified-document");
assert.ok(retrieval.shots.find((shot) => shot.shotId === "evidence").candidates.find((candidate) => candidate.id === "film-fake-evidence").hardGate.failures.includes("ILLUSTRATION_CANNOT_REPLACE_EVIDENCE"));
assert.equal(retrieval.shots.find((shot) => shot.shotId === "identity").topCandidates[0].id, "founder-interview");
assert.equal(retrieval.shots.find((shot) => shot.shotId === "process").topCandidates[0].id, "process-one");

const allocation = allocateSequenceMedia(retrieval, {maxPerSourceGroup: 1});
assertSequenceMediaAllocation(allocation);
assert.equal(allocation.counts.uniqueCandidateCount, allocation.counts.selectedCount);
assert.equal(allocation.assignments.find((assignment) => assignment.shotId === "evidence").selected.id, "verified-document");

const missingPlan = compileStoryboardMediaNeedPlan({storyboardId: "missing", storyboardSha256: sha("b"), title: "Missing", shots: [{id: "only", sourceText: "人物接受采访", viewerTask: "看见人物讲话", claimType: "INTERVIEW_QUOTE", entities: ["Missing Person"]}]});
const missing = retrieveStoryboardMediaCandidates(missingPlan, {"*": [{...common, id: "wrong-person", sourceId: "wrong", sourceGroup: "wrong", mediaClass: "EXACT_INTERVIEW_VIDEO", rightsStatus: "OPEN_LICENSE_VERIFIED", identityVerified: false, directActionVerified: false, entities: ["Other Person"]}]});
assert.equal(missing.shots[0].status, "NO_MATCH");

console.log(JSON.stringify({contract: "A1StoryboardMediaRetrievalOrchestratorTest/v2", status: "PASS", liveSearchItems: liveSearchPlan.items.length, counts: retrieval.counts, allocation: allocation.counts, noMatch: missing.shots[0].status}, null, 2));
