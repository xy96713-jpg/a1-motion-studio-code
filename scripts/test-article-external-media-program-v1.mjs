#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertArticleExternalMediaProgram, compileArticleExternalMediaProgram} from "../apps/studio-next/src/lib/a1-article-external-media-program-v1.mjs";
import {compileExternalMaterialRequest, resolveWikimediaVideoDerivative} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";

const sha = (letter) => letter.repeat(64);

const business = compileArticleExternalMediaProgram({
  articleId: "business",
  articleSha256: sha("a"),
  title: "A founder profile",
  semanticBeats: [{beatId: "b1", order: 1, sourceText: "In 2007 the founder explained the product in an interview.", viewerTask: "See the named founder speaking in the period context", semanticRole: "PERSON_PROFILE", claimType: "INTERVIEW_QUOTE", entities: ["Example Founder"], actions: ["interview", "speaking"], event: {name: "product introduction", date: "2007"}, sourceIntent: "INTERVIEW", shotFunction: "REVEAL"}],
});
assertArticleExternalMediaProgram(business);
assert.equal(business.counts.interviewRequestCount, 1);
assert.equal(business.counts.archiveRequestCount, 1);
assert.equal(business.counts.brollRequestCount, 0);
assert.deepEqual(business.items[0].lanes.find((lane) => lane.type === "EXACT_INTERVIEW_VIDEO").request.authority.requiredGrades, ["A", "B"]);

const science = compileArticleExternalMediaProgram({
  articleId: "science",
  articleSha256: sha("b"),
  title: "A science evidence explainer",
  semanticBeats: [{beatId: "s1", sourceText: "The mission launched in 1969 according to the official archive.", viewerTask: "See the actual mission launch", claimType: "EVIDENCE_CLAIM", networkDecision: "REQUIRED", evidenceRoute: "OFFICIAL_VIDEO", entities: ["Example Mission"], actions: ["launch"], event: {name: "mission launch", date: "1969"}, domains: ["SPACE"], shotFunction: "RESULT_HOLD"}],
});
assertArticleExternalMediaProgram(science);
assert.equal(science.counts.evidenceRequestCount, 1);
assert.equal(science.items[0].lanes.length, 1);
assert.ok(!science.items[0].lanes[0].request.search.providers.some((provider) => provider.id === "PEXELS"));

const opinion = compileArticleExternalMediaProgram({
  articleId: "opinion",
  articleSha256: sha("c"),
  title: "A technology opinion",
  semanticBeats: [{beatId: "o1", sourceText: "Automation changes how people experience work.", viewerTask: "Feel the physical replacement of repetitive work", semanticRole: "SUPPORTING_EXPLANATION", tone: "REFLECTIVE", sourceIntent: "CINEMATIC_BROLL", actions: ["machines moving", "workers observing"], locations: ["factory"], visualContext: "industrial automation", shotFunction: "TRANSITION"}],
});
assertArticleExternalMediaProgram(opinion);
assert.equal(opinion.counts.brollRequestCount, 2);
assert.ok(opinion.items[0].lanes.some((lane) => lane.type === "CONTEXTUAL_BROLL" && lane.disclosure === "RELATED_BROLL"));
assert.ok(opinion.items[0].lanes.some((lane) => lane.type === "CINEMATIC_ILLUSTRATIVE_VIDEO" && lane.actualFilmOrTelevisionExcerptAutomaticUse === false));

const missingInterviewEntity = compileArticleExternalMediaProgram({
  articleId: "gap",
  articleSha256: sha("d"),
  title: "Missing entity",
  semanticBeats: [{beatId: "g1", sourceText: "In an interview, someone explained the change.", sourceIntent: "INTERVIEW", actions: ["interview"]}],
});
assertArticleExternalMediaProgram(missingInterviewEntity);
assert.equal(missingInterviewEntity.items[0].decision, "SKIP");
assert.ok(missingInterviewEntity.items[0].gaps.includes("INTERVIEW_ENTITY_REQUIRED"));

const request = compileExternalMaterialRequest({id: "video", viewerTask: "Find interview video", shotFunction: "REVEAL", narrativeRole: "IDENTITY", entities: ["Named person"], actions: ["interview"], preferredMedia: ["VIDEO"]});
const candidate = {provider: "WIKIMEDIA_COMMONS", mediaType: "VIDEO", sourceId: "File:Interview.webm", sourcePageUrl: "https://commons.test/File:Interview.webm", sizeBytes: 1000, publisher: "Author", license: {name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0", reviewStatus: "PENDING"}};
const mockFetch = async () => ({ok: true, json: async () => ({query: {pages: {1: {videoinfo: [{size: 1000, width: 1920, height: 1080, duration: 42, url: "https://upload.test/original.webm", mime: "video/webm", derivatives: [{src: "https://upload.test/240.webm", type: "video/webm; codecs=vp9", width: 426, height: 240, bandwidth: 180000, transcodekey: "240p.vp9.webm"}, {src: "https://upload.test/480.webm", type: "video/webm; codecs=vp9", width: 854, height: 480, bandwidth: 390000, transcodekey: "480p.vp9.webm"}]}]}}}})});
const derivative = await resolveWikimediaVideoDerivative(candidate, {fetchImpl: mockFetch, maximumWidth: 640});
assert.equal(derivative.derivative.width, 426);
assert.equal(derivative.source.durationMs, 42000);
assert.equal(derivative.boundaries.downloaded, false);
assert.equal(request.status, "READY_FOR_DISCOVERY");

console.log(JSON.stringify({contract: "A1ArticleExternalMediaProgramTest/v1", status: "PASS", programs: [{id: business.article.articleId, counts: business.counts}, {id: science.article.articleId, counts: science.counts}, {id: opinion.article.articleId, counts: opinion.counts}], gap: missingInterviewEntity.items[0].gaps, derivative: derivative.derivative}, null, 2));

