#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  assertExternalMaterialRequest,
  assertExternalMediaMetadataDiscovery,
  assertExternalMediaSegmentCandidate,
  compileExternalMaterialRequest,
  compileExternalMediaSegmentCandidate,
  discoverExternalMediaMetadata,
  rankExternalMediaSegmentCandidates,
} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";

const sha = (letter) => letter.repeat(64);

const historyRequest = compileExternalMaterialRequest({
  id: "history-request",
  viewerTask: "Recognize one person across an archival transition",
  shotFunction: "TRANSITION",
  narrativeRole: "HISTORICAL_CONTEXT",
  entities: ["Example founder"],
  aliases: ["Founder alias"],
  actions: ["interview"],
  event: {name: "company interview", date: "2001"},
  preferredMedia: ["VIDEO", "IMAGE"],
  duration: {minimumMs: 3000, maximumMs: 10000},
});
assertExternalMaterialRequest(historyRequest);
assert.ok(historyRequest.search.providers.some((provider) => provider.id === "WIKIMEDIA_COMMONS"));
assert.ok(historyRequest.search.providers.some((provider) => provider.id === "INTERNET_ARCHIVE"));
assert.ok(!historyRequest.search.providers.some((provider) => provider.id === "PEXELS"));
assert.deepEqual(historyRequest.authority.requiredGrades, ["A", "B"]);

const verifiedArchive = compileExternalMediaSegmentCandidate(historyRequest, {
  id: "verified-archive",
  source: {provider: "ARCHIVE", sourceId: "archive-1", pageUrl: "https://source.test/archive-1", assetUrl: "https://source.test/archive-1.mp4", publisher: "Archive publisher", publishedAt: "2001", grade: "B", gradeReviewed: true, referenceOnly: false, bytesCached: true, sha256: sha("a"), license: {name: "CC-BY", url: "https://license.test/by", reviewStatus: "PASS"}},
  media: {kind: "VIDEO", durationMs: 30000, fps: 25, width: 1280, height: 720, hasAudio: true},
  segment: {inMs: 5000, outMs: 11000, sha256: sha("b"), transcriptExcerpt: "Interview excerpt"},
  semantics: {subjectIds: ["founder"], actionIds: ["interview"], identityVerified: true, eventVerified: true, timeVerified: true, placeVerified: true},
  match: {entity: true, action: true, event: true, temporal: true, visualScore: .82, transcriptScore: .9},
  transforms: {speed: 1, reversed: false, reordered: false, cropDeclared: true},
});
assert.equal(verifiedArchive.status, "READY_FOR_PACKAGE_REVIEW");
assertExternalMediaSegmentCandidate(verifiedArchive);

const evidenceRequest = compileExternalMaterialRequest({
  id: "evidence-request",
  viewerTask: "See the verified event rather than a similar-looking scene",
  shotFunction: "RESULT_HOLD",
  narrativeRole: "EVIDENCE",
  exactClaim: "The named event occurred at the stated time",
  entities: ["Example mission"],
  actions: ["launch"],
  event: {name: "mission launch", date: "1969"},
  preferredMedia: ["VIDEO", "IMAGE"],
  domains: ["SPACE"],
});
assertExternalMaterialRequest(evidenceRequest);
assert.ok(!evidenceRequest.search.providers.some((provider) => provider.id === "PEXELS"));
assert.ok(evidenceRequest.search.providers.some((provider) => provider.id === "NASA_IMAGES"));

const discoveredEvidence = compileExternalMediaSegmentCandidate(evidenceRequest, {
  id: "official-discovered",
  source: {provider: "OFFICIAL_LIBRARY", sourceId: "official-1", pageUrl: "https://official.test/1", publisher: "Official publisher", publishedAt: "1969", grade: "A", gradeReviewed: true, referenceOnly: false, bytesCached: false, sha256: "", license: {name: "official media policy", url: "https://official.test/policy", reviewStatus: "PENDING"}},
  media: {kind: "VIDEO", durationMs: 24000, fps: 24, width: 1920, height: 1080, hasAudio: true},
  segment: {inMs: 4000, outMs: 10000, transcriptExcerpt: "Mission launch", sha256: ""},
  semantics: {subjectIds: ["mission"], actionIds: ["launch"], identityVerified: true, eventVerified: true, timeVerified: true, placeVerified: true},
  match: {entity: true, action: true, event: true, temporal: true, visualScore: .95, transcriptScore: .8},
  transforms: {speed: 1, reversed: false, reordered: false},
});
assert.equal(discoveredEvidence.status, "DISCOVERED_REVIEW_REQUIRED");
assert.ok(discoveredEvidence.reviewFlags.includes("SOURCE_BYTES_NOT_HASH_BOUND"));
assertExternalMediaSegmentCandidate(discoveredEvidence);

const stockAsEvidence = compileExternalMediaSegmentCandidate(evidenceRequest, {
  id: "stock-as-evidence",
  source: {provider: "STOCK", sourceId: "stock-1", pageUrl: "https://stock.test/1", publisher: "Stock publisher", grade: "C", gradeReviewed: true, referenceOnly: false, bytesCached: true, sha256: sha("c"), license: {name: "stock license", reviewStatus: "PASS"}},
  media: {kind: "VIDEO", durationMs: 12000, fps: 30, width: 1920, height: 1080, hasAudio: false},
  segment: {inMs: 1000, outMs: 6000, sha256: sha("d")},
  semantics: {identityVerified: false, eventVerified: false, timeVerified: false, disclosure: "RELATED_BROLL"},
  match: {entity: false, action: true, event: false, temporal: false, visualScore: .9},
  transforms: {speed: 1, reversed: false, reordered: false},
});
assert.equal(stockAsEvidence.status, "BLOCKED");
assert.ok(stockAsEvidence.failures.includes("EVIDENCE_AUTHORITY_INSUFFICIENT"));

const invalidRange = compileExternalMediaSegmentCandidate(historyRequest, {
  id: "range-invalid",
  source: {provider: "ARCHIVE", sourceId: "archive-2", pageUrl: "https://source.test/2", publisher: "Archive", grade: "B", bytesCached: true, sha256: sha("e"), license: {name: "CC-BY", reviewStatus: "PASS"}},
  media: {kind: "VIDEO", durationMs: 5000, fps: 25, width: 640, height: 360},
  segment: {inMs: 4000, outMs: 7000, sha256: sha("f")},
  semantics: {identityVerified: true, eventVerified: true, timeVerified: true},
  match: {entity: true, action: true, event: true, temporal: true},
  transforms: {speed: 1, reversed: false, reordered: false},
});
assert.equal(invalidRange.status, "BLOCKED");
assert.ok(invalidRange.failures.includes("VIDEO_SEGMENT_RANGE_INVALID"));

const brollRequest = compileExternalMaterialRequest({
  id: "broll-request",
  viewerTask: "Show a visible logistics action without claiming it is the named event",
  shotFunction: "ACTION",
  narrativeRole: "B_ROLL",
  actions: ["loading cargo"],
  locations: ["airport"],
  preferredMedia: ["VIDEO"],
});
assertExternalMaterialRequest(brollRequest);
const disclosedBroll = compileExternalMediaSegmentCandidate(brollRequest, {
  id: "disclosed-broll",
  source: {provider: "STOCK", sourceId: "stock-2", pageUrl: "https://stock.test/2", publisher: "Stock publisher", grade: "C", gradeReviewed: true, referenceOnly: false, bytesCached: true, sha256: sha("1"), license: {name: "stock license", reviewStatus: "PASS"}},
  media: {kind: "VIDEO", durationMs: 18000, fps: 30, width: 1920, height: 1080, hasAudio: false},
  segment: {inMs: 2000, outMs: 8000, sha256: sha("2")},
  semantics: {actionIds: ["loading"], disclosure: "RELATED_BROLL"},
  match: {entity: false, action: true, event: false, temporal: false, visualScore: .94},
  transforms: {speed: 1, reversed: false, reordered: false},
});
assert.equal(disclosedBroll.status, "READY_FOR_PACKAGE_REVIEW");
assertExternalMediaSegmentCandidate(disclosedBroll);

const ranking = rankExternalMediaSegmentCandidates(historyRequest, [
  {...verifiedArchive, contract: undefined},
]);
assert.equal(ranking.status, "READY_FOR_REVIEW");
assert.equal(ranking.boundaries.automaticSelection, false);

const mockFetch = async (url) => {
  const href = String(url);
  if (href.includes("commons.wikimedia.org")) return {ok: true, json: async () => ({query: {pages: {1: {title: "File:Mission.jpg", imageinfo: [{url: "https://upload.test/mission.jpg", thumburl: "https://upload.test/mission-thumb.jpg", mime: "image/jpeg", extmetadata: {LicenseShortName: {value: "CC BY-SA"}, LicenseUrl: {value: "https://license.test/cc"}, Artist: {value: "Official archive"}}}]}}}})};
  if (href.includes("archive.org")) return {ok: true, json: async () => ({response: {docs: [{identifier: "mission-film", title: "Mission Film", creator: "Public archive", date: "1969", licenseurl: "https://license.test/public"}]}})};
  if (href.includes("images-api.nasa.gov")) return {ok: true, json: async () => ({collection: {items: [{data: [{nasa_id: "mission-video", title: "Mission Video", media_type: "video", center: "NASA", date_created: "1969-01-01"}], href: "https://images-api.test/asset", links: [{rel: "preview", href: "https://images-api.test/preview.jpg"}]}]}})};
  if (href.includes("api.pexels.com/v1/videos")) return {ok: true, json: async () => ({videos: [{id: 10, width: 1920, height: 1080, url: "https://pexels.test/video", image: "https://pexels.test/poster.jpg", user: {name: "Pexels author"}, video_files: [{width: 1920, height: 1080, link: "https://pexels.test/video.mp4"}]}]})};
  if (href.includes("pixabay.com/api/videos")) return {ok: true, json: async () => ({hits: [{id: 11, tags: "cargo loading", pageURL: "https://pixabay.test/video", user: "Pixabay author", videos: {medium: {width: 1920, height: 1080, size: 1000, url: "https://pixabay.test/video.mp4", thumbnail: "https://pixabay.test/poster.jpg"}}}]})};
  return {ok: false, status: 404, json: async () => ({})};
};
const mockedDiscovery = await discoverExternalMediaMetadata(evidenceRequest, {fetchImpl: mockFetch, limit: 3});
assert.equal(mockedDiscovery.status, "PASS");
assert.equal(mockedDiscovery.counts.providerCount, 3);
assert.equal(mockedDiscovery.counts.candidateCount, 3);
assert.equal(mockedDiscovery.boundary.mediaDownloaded, false);
assert.ok(mockedDiscovery.providers.every((provider) => provider.candidates.every((candidate) => Number.isFinite(candidate.relevance.score))));
assertExternalMediaMetadataDiscovery(mockedDiscovery, evidenceRequest);
const resign = (value) => {
  const {discoverySha256, ...body} = value;
  return {...body, discoverySha256:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
};
const corrupted = structuredClone(mockedDiscovery);
corrupted.providers[0].candidates[0].title = 'Changed source title';
assert.throws(() => assertExternalMediaMetadataDiscovery(corrupted, evidenceRequest), /result-sha-invalid/u);
for (const mutate of [
  result => { result.boundary.evidenceAdmission = true; },
  result => { result.providers[0].candidates[0].license.reviewStatus = 'PASS'; },
  result => { result.providers[0].candidates[0].discoveryOnly = false; },
  result => { result.providers[0].candidates[0].sourcePageUrl = 'http://127.0.0.1/source'; },
  result => { result.counts.candidateCount += 1; },
  result => { result.status = 'NO_RESULTS'; },
]) {
  const promoted = structuredClone(mockedDiscovery); mutate(promoted);
  assert.throws(() => assertExternalMediaMetadataDiscovery(resign(promoted), evidenceRequest));
}
const emptyMetadata = await discoverExternalMediaMetadata(evidenceRequest, {providers:['NASA_IMAGES'], maxQueryVariants:1,
  fetchImpl:async()=>({ok:true,json:async()=>({collection:{items:[]}})})});
assert.equal(emptyMetadata.status, 'NO_RESULTS'); assert.equal(emptyMetadata.counts.failureCount, 0);
const forbiddenMetadata = await discoverExternalMediaMetadata(evidenceRequest, {providers:['NASA_IMAGES'], maxQueryVariants:1,
  fetchImpl:async()=>({ok:false,status:403})});
assert.equal(forbiddenMetadata.status, 'NO_RESULTS');
assert.deepEqual(forbiddenMetadata.failures, ['NASA_IMAGES:METADATA_ACCESS_DENIED']);
const badMetadata = await discoverExternalMediaMetadata(evidenceRequest, {providers:['NASA_IMAGES'], maxQueryVariants:1,
  fetchImpl:async()=>({ok:true,json:async()=>({})})});
assert.deepEqual(badMetadata.failures, ['NASA_IMAGES:METADATA_RESPONSE_INVALID']);
const unsafeMetadata = await discoverExternalMediaMetadata(evidenceRequest, {providers:['NASA_IMAGES'], maxQueryVariants:1,
  fetchImpl:async()=>({ok:true,json:async()=>({collection:{items:[{data:[{nasa_id:'unsafe',title:'Unsafe metadata',media_type:'image'}],href:'http://169.254.169.254/latest/meta-data/'}]}})})});
assert.deepEqual(unsafeMetadata.failures, ['NASA_IMAGES:METADATA_RESPONSE_INVALID']);
const privateError = await discoverExternalMediaMetadata(evidenceRequest, {providers:['NASA_IMAGES'], maxQueryVariants:1,
  fetchImpl:async()=>{throw new Error('sensitive-provider-response-must-not-appear');}});
assert.deepEqual(privateError.failures, ['NASA_IMAGES:METADATA_NETWORK_UNAVAILABLE']);
const partialMetadata = await discoverExternalMediaMetadata(evidenceRequest, {maxQueryVariants:1, fetchImpl:async(url, options)=>{
  assert.equal(options.redirect, 'error');
  if(String(url).includes('images-api.nasa.gov'))throw Object.assign(new Error('timeout'), {name:'TimeoutError'});
  return mockFetch(url);
}});
assert.equal(partialMetadata.status, 'PARTIAL');
assert.equal(partialMetadata.counts.candidateCount, 2);
assert.deepEqual(partialMetadata.failures, ['NASA_IMAGES:METADATA_TIMEOUT']);
const mockedStockDiscovery = await discoverExternalMediaMetadata(brollRequest, {fetchImpl: mockFetch, providers: ["PEXELS", "PIXABAY"], credentials: {pexelsApiKey: "pexels-test", pixabayApiKey: "pixabay-test"}, limit: 3, maxQueryVariants: 1});
assert.equal(mockedStockDiscovery.status, "PASS");
assert.equal(mockedStockDiscovery.counts.candidateCount, 2);
assert.deepEqual(mockedStockDiscovery.providers.map((provider) => provider.provider).sort(), ["PEXELS", "PIXABAY"]);

console.log(JSON.stringify({
  contract: "A1ExternalMediaDiscoveryTest/v1",
  status: "PASS",
  requests: [historyRequest.id, evidenceRequest.id, brollRequest.id],
  readyCandidate: verifiedArchive.id,
  reviewRequiredCandidate: discoveredEvidence.id,
  blockedChecks: [stockAsEvidence.failures, invalidRange.failures],
  mockedProviderCount: mockedDiscovery.counts.providerCount + mockedStockDiscovery.counts.providerCount,
  metadataChecks: {receiptShaAndRequestBound:true,claimAndRightsNotPromoted:true,emptyDistinctFromFailure:true,partialCandidatesRetained:true,privateMetadataRejected:true,errorsClassifiedWithoutRawResponse:true},
}, null, 2));
