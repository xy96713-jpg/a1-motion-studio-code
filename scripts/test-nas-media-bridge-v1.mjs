#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertArticleNasMediaRequests, assertNasMediaBridgePlan, assertNasMediaClipReceipt, compileArticleNasMediaRequests, compileNasMediaBridgePlan, compileNasMediaClipReceipt} from "../apps/studio-next/src/lib/a1-nas-media-bridge-v1.mjs";
import {compileArticleExternalMediaProgram} from "../apps/studio-next/src/lib/a1-article-external-media-program-v1.mjs";
import {compileFilmReferenceBrief, filmReferenceCatalogFromLocalSegmentIndex, rankFilmReferenceCandidates} from "../apps/studio-next/src/lib/a1-film-reference-matcher-v1.mjs";
import {compileLocalVideoSegmentIndex} from "../apps/studio-next/src/lib/a1-local-video-segment-index-v1.mjs";

const sha = (letter) => letter.repeat(64);
const mount = {requestedRoot: "/mnt/nas", resolvedRoot: "/mnt/nas", libraryRoot: "/mnt/nas/A1-media", online: true, writable: true, freeBytes: 2_000_000_000};
const plan = compileNasMediaBridgePlan({
  mount,
  requests: [
    {id: "open", kind: "LICENSED_DOWNLOAD", title: "Open interview", sourceUrl: "https://example.test/interview.webm", rightsStatus: "OPEN_LICENSE_VERIFIED", license: {name: "CC BY 4.0", reviewStatus: "PASS"}},
    {id: "local-edit", kind: "LOCAL_FILM_REFERENCE", title: "Owned film", localPath: "/mnt/nas/films/owned.mkv", localPathResolved: "/mnt/nas/films/owned.mkv", rightsStatus: "USER_OWNED_AUTHORIZED", requestedRange: {inMs: 1000, outMs: 5000}},
    {id: "local-reference", kind: "LOCAL_FILM_REFERENCE", title: "Unknown rights", localPath: "/mnt/nas/films/reference.mkv", localPathResolved: "/mnt/nas/films/reference.mkv", rightsStatus: "UNKNOWN"},
    {id: "capture", kind: "AUTHORIZED_STREAM", title: "Authorized stream", rightsStatus: "USER_LICENSED_FOR_EDIT", drmStatus: "NONE", requestedRange: {inMs: 12000, outMs: 18000}},
    {id: "protected", kind: "AUTHORIZED_STREAM", title: "Protected commercial stream", rightsStatus: "COMMERCIAL_REFERENCE_ONLY", drmStatus: "PROTECTED"},
  ],
});
assertNasMediaBridgePlan(plan);
assert.deepEqual(plan.decisions.map((item) => item.action), ["CACHE_LICENSED_SOURCE_TO_NAS", "DIRECT_CLIP_FROM_NAS", "INDEX_LOCAL_MEDIA_REFERENCE_ONLY", "USER_PLAYBACK_CAPTURE_FALLBACK", "REFERENCE_ONLY_FIND_ALTERNATIVE"]);
assert.equal(plan.boundaries.storyboardMutation, false);
assert.equal(plan.boundaries.productionAdmission, false);

const outside = compileNasMediaBridgePlan({mount, requests: [{id: "outside", kind: "LOCAL_FILM_REFERENCE", localPath: "/tmp/reference.mp4", localPathResolved: "/tmp/reference.mp4", rightsStatus: "UNKNOWN"}]});
assertNasMediaBridgePlan(outside);
assert.equal(outside.decisions[0].action, "INGEST_LOCAL_MEDIA_REFERENCE_ONLY");

const offline = compileNasMediaBridgePlan({mount: {...mount, online: false, writable: false}, requests: [{id: "wait", kind: "LOCAL_FILM_REFERENCE", localPath: "/mnt/nas/a.mp4"}]});
assertNasMediaBridgePlan(offline);
assert.equal(offline.decisions[0].action, "WAIT_FOR_NAS");

const receipt = compileNasMediaClipReceipt({source: {path: "/mnt/nas/source.webm", sha256: sha("a")}, output: {path: "/mnt/nas/A1-media/clips/clip.mp4", sha256: sha("b"), bytes: 1000, durationMs: 4000, fullDecode: true}, range: {inMs: 1000, outMs: 5000}, rights: {status: "OPEN_LICENSE_VERIFIED", licenseName: "CC BY 4.0", attribution: "Example author"}, transform: {mode: "TRANSCODE", videoCodec: "h264", audioCodec: "aac"}});
assertNasMediaClipReceipt(receipt);
assert.equal(receipt.transform.speed, 1);

const invalidReceipt = compileNasMediaClipReceipt({source: {sha256: sha("a")}, output: {sha256: sha("b"), fullDecode: true}, range: {inMs: 1000, outMs: 5000}, rights: {status: "COMMERCIAL_REFERENCE_ONLY"}});
assert.equal(invalidReceipt.status, "BLOCKED");
assert.ok(invalidReceipt.failures.includes("EDIT_RIGHTS_REQUIRED"));

const articleProgram = compileArticleExternalMediaProgram({articleId: "article", articleSha256: sha("c"), title: "Founder and factory", semanticBeats: [{beatId: "interview", sourceText: "The founder explained the factory change in an interview.", viewerTask: "See the founder speaking", claimType: "INTERVIEW_QUOTE", entities: ["Founder"], actions: ["interview"], sourceIntent: "INTERVIEW"}]});
const interviewLane = articleProgram.items[0].lanes.find((lane) => lane.type === "EXACT_INTERVIEW_VIDEO");
const filmBrief = compileFilmReferenceBrief({beatId: "factory", sourceText: "Automation removes repetitive human movement on a factory assembly line.", viewerTask: "看见流水线吞没人的节奏", actions: ["assembly line work", "repetitive movement"], environments: ["factory"], visualMotifs: ["repetition"]});
const localFilmIndex = compileLocalVideoSegmentIndex({id:"factory-local-index",source:{path:"/mnt/nas/films/factory.mkv",sha256:sha("d"),rights:"USER_PROVIDED_REFERENCE",referenceOnly:true},clip:{path:"/mnt/nas/A1-media/clips/factory-excerpt.mp4",sha256:sha("e"),sourceInMs:5000,sourceOutMs:15000},media:{durationMs:10000,fps:30,width:640,height:360,hasAudio:false},query:{text:"automation repetitive factory worker",narrativeRole:"PROCESS_OR_SYSTEM",minimumMs:3000,maximumMs:6000},analysis:{scenes:[{id:"line",startMs:1000,endMs:9000}],transcript:[{startMs:1000,endMs:8000,text:"A worker repeats movement along the factory line."}],keyframes:[{id:"line-a",sceneId:"line",atMs:1000,path:"a.jpg",sha256:sha("f"),visualScore:0.7},{id:"line-b",sceneId:"line",atMs:6000,path:"b.jpg",sha256:sha("a"),visualScore:0.8}]}});
const filmRanking = rankFilmReferenceCandidates(filmBrief, filmReferenceCatalogFromLocalSegmentIndex(localFilmIndex));
const requestSet = compileArticleNasMediaRequests({articleProgram, selections: [{laneId: interviewLane.id, candidate: {mediaType: "VIDEO", title: "Founder interview", sourceId: "interview-1", assetUrl: "https://example.test/interview.webm"}, licenseReview: {status: "PASS", licenseName: "CC BY 4.0", attribution: "Example"}}], filmRanking});
assertArticleNasMediaRequests(requestSet);
assert.equal(requestSet.counts.licensedDownloadCount, 1);
assert.equal(requestSet.counts.localFilmCount, 1);
assert.equal(requestSet.boundaries.filmProductionUseAllowed, false);
const filmRequest = requestSet.requests.find((request) => request.kind === "LOCAL_FILM_REFERENCE");
assert.deepEqual(filmRequest.requestedRange, {inMs: filmRanking.topCandidates[0].selectedRange.inMs, outMs: filmRanking.topCandidates[0].selectedRange.outMs});
assert.equal(filmRequest.filmBinding.sourceSha256, localFilmIndex.source.sha256);
assert.equal(filmRequest.filmBinding.clipSha256, localFilmIndex.clip.sha256);
assert.equal(filmRequest.filmBinding.exactRangeBound, true);
const filmBridgePlan = compileNasMediaBridgePlan({mount, requests: [filmRequest]});
assertNasMediaBridgePlan(filmBridgePlan);
assert.equal(filmBridgePlan.decisions[0].action, "INDEX_LOCAL_MEDIA_REFERENCE_ONLY");
assert.equal(filmBridgePlan.decisions[0].request.filmBinding.sourceSha256, localFilmIndex.source.sha256);

console.log(JSON.stringify({contract: "A1NasMediaBridgeTest/v1", status: "PASS", actions: plan.decisions.map((item) => item.action), articleRequests: requestSet.counts, filmIndexAction: filmBridgePlan.decisions[0].action, filmRange: filmRequest.requestedRange, filmSourceSha256: filmRequest.filmBinding.sourceSha256, receiptSha256: receipt.receiptSha256}, null, 2));
