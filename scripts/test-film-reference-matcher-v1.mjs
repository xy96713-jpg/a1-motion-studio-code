#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertFilmReferenceBrief, assertFilmReferenceRanking, compileFilmReferenceBrief, rankFilmReferenceCandidates} from "../apps/studio-next/src/lib/a1-film-reference-matcher-v1.mjs";
import {buildFilmReferenceDecision, validateFilmReferenceCandidate} from "../apps/studio-next/src/lib/a1-film-reference-planner.js";
import {filmReferenceCatalogFromLocalSegmentIndex} from "../apps/studio-next/src/lib/a1-film-reference-matcher-v1.mjs";
import {compileLocalVideoSegmentIndex} from "../apps/studio-next/src/lib/a1-local-video-segment-index-v1.mjs";

const brief = compileFilmReferenceBrief({beatId: "beat", sourceText: "Machines replace repetitive human movement on an assembly line.", viewerTask: "Feel mechanical repetition and worker alienation", semanticRole: "SUPPORTING_EXPLANATION", shotFunction: "TRANSITION", tone: "REFLECTIVE", actions: ["assembly line work", "machine replacement"], environments: ["factory"], visualMotifs: ["repetition"], cameraEnergy: "MEDIUM"});
assertFilmReferenceBrief(brief);
const catalog = [
  {id: "film-a", title: "Reference Film A", year: 2000, scenes: [{id: "factory", description: "A worker repeats one movement beside a machine.", narrativeFunctions: ["PROCESS_OR_SYSTEM"], actions: ["assembly line work", "machine replacement"], environments: ["factory"], tones: ["reflective"], visualMotifs: ["repetition"], cameraEnergy: "MEDIUM", dialogueDensity: "LOW", rightsStatus: "REFERENCE_ONLY"}]},
  {id: "film-b", title: "Reference Film B", year: 2001, scenes: [{id: "office", description: "People talk in an office.", narrativeFunctions: ["IDENTITY_OR_TESTIMONY"], actions: ["interview"], environments: ["office"], tones: ["neutral"], cameraEnergy: "LOCKED", dialogueDensity: "HIGH", rightsStatus: "REFERENCE_ONLY"}]},
];
const ranking = rankFilmReferenceCandidates(brief, catalog);
assertFilmReferenceRanking(ranking);
assert.equal(ranking.topCandidates[0].sceneId, "factory");
assert.equal(ranking.topCandidates[0].status, "USER_MEDIA_REQUIRED");
assert.equal(ranking.topCandidates[0].productionUseAllowed, false);
assert.equal(ranking.userMediaRequest.required, true);

const integratedFactoryDecision = buildFilmReferenceDecision({
  id: "automation-factory-brief",
  sourceText: "Automation removes repetitive human movement; a worker is replaced on a factory assembly line.",
  viewerTask: "Feel the alienation caused by mechanized repetition.",
}, {route: "atmosphere", filmReference: {allowed: true}});
assert.equal(integratedFactoryDecision.status, "matched");
assert.equal(integratedFactoryDecision.candidates[0].title, "Modern Times");
assert.equal(integratedFactoryDecision.candidates[0].approximateMoment, "factory assembly-line sequence");
assert.equal(integratedFactoryDecision.candidates[0].sourceMediaStatus, "USER_MEDIA_REQUIRED");
assert.equal(integratedFactoryDecision.candidates[0].renderAllowed, false);
assert.equal(integratedFactoryDecision.candidates[0].selectedRange, null,
  "film catalog scene cues never claim exact source timecodes");
assert.equal(integratedFactoryDecision.candidates[0].exactRangeBound, false);
assert.equal(validateFilmReferenceCandidate(integratedFactoryDecision.candidates[0]).ok, true);
const evidenceFilmDecision = buildFilmReferenceDecision({id: "factual-evidence", sourceText: "The report documents a specific event."}, {
  route: "evidence", filmReference: {allowed: false},
});
assert.equal(evidenceFilmDecision.status, "not-applicable");
assert.equal(evidenceFilmDecision.candidates.length, 0);

const localCatalog = [{id: "film-local", title: "Local Reference", scenes: [{id: "scene", description: "Factory repetition", narrativeFunctions: ["PROCESS_OR_SYSTEM"], actions: ["assembly line work"], environments: ["factory"], tones: ["reflective"], visualMotifs: ["repetition"], cameraEnergy: "MEDIUM", dialogueDensity: "LOW", rightsStatus: "USER_PROVIDED_REFERENCE", localMediaPath: "/local/reference.mov"}]}];
const localRanking = rankFilmReferenceCandidates(brief, localCatalog);
assert.equal(localRanking.topCandidates[0].status, "LOCAL_SOURCE_REQUIRES_INDEX");
assert.equal(localRanking.topCandidates[0].productionRightsEligible, false);
assert.equal(localRanking.topCandidates[0].productionUseAllowed, false);

const localSegmentIndex = compileLocalVideoSegmentIndex({
  id: "provided-factory-reference",
  source: {path: "film-library/worker-factory.mp4", sha256: "d".repeat(64), rights: "USER_PROVIDED_REFERENCE", referenceOnly: true},
  clip: {path: "clips/factory-excerpt.mp4", sha256: "e".repeat(64), sourceInMs: 10_000, sourceOutMs: 20_000},
  media: {durationMs: 10_000, fps: 30, width: 640, height: 360, hasAudio: false},
  query: {text: "automation factory repetitive worker movement", narrativeRole: "PROCESS_OR_SYSTEM", minimumMs: 3000, maximumMs: 6000},
  analysis: {
    scenes: [{id: "factory-line", startMs: 0, endMs: 10_000}],
    transcript: [{startMs: 1000, endMs: 7000, text: "A worker repeats the movement along the factory assembly line."}],
    keyframes: [
      {id: "factory-kf-a", sceneId: "factory-line", atMs: 1000, path: "keyframes/a.jpg", sha256: "f".repeat(64), visualScore: 0.72},
      {id: "factory-kf-b", sceneId: "factory-line", atMs: 6000, path: "keyframes/b.jpg", sha256: "a".repeat(64), visualScore: 0.81},
    ],
  },
});
const localFilmCatalog = filmReferenceCatalogFromLocalSegmentIndex(localSegmentIndex);
const indexedDecision = buildFilmReferenceDecision({
  id: "automation-factory-local-index",
  sourceText: "Automation removes repetitive human movement; a worker is replaced on a factory assembly line.",
  viewerTask: "Feel the alienation caused by mechanized repetition.",
}, {route: "atmosphere", filmReference: {allowed: true}}, {catalog: localFilmCatalog});
assert.equal(indexedDecision.candidates[0].sourceMediaStatus, "READY_FOR_REFERENCE_INDEX");
assert.equal(indexedDecision.candidates[0].selectedRange.inMs, localSegmentIndex.selected.selectedRange.absoluteSourceInMs);
assert.equal(indexedDecision.candidates[0].sourceSha256, "d".repeat(64));
assert.equal(indexedDecision.candidates[0].clipSha256, "e".repeat(64));
assert.equal(indexedDecision.candidates[0].productionUseAllowed, false);

const evidenceBrief = compileFilmReferenceBrief({beatId: "evidence", sourceText: "The report proves the launch date.", viewerTask: "Understand the pressure around the event without replacing the evidence", claimType: "EVIDENCE_CLAIM", actions: ["monitoring mission"], environments: ["mission control"], tone: "TENSE"});
assertFilmReferenceBrief(evidenceBrief);
assert.equal(evidenceBrief.usage.mode, "REENACTMENT_REFERENCE_ONLY");
assert.equal(evidenceBrief.usage.mayReplaceEvidence, false);

const missingVisibleScene = compileFilmReferenceBrief({beatId: "missing", sourceText: "An abstract thought.", viewerTask: "Feel the idea"});
assert.equal(missingVisibleScene.status, "BLOCKED");
assert.ok(missingVisibleScene.failures.includes("VISIBLE_SCENE_REQUIREMENT_REQUIRED"));

console.log(JSON.stringify({contract: "A1FilmReferenceMatcherTest/v1", status: "PASS", topCandidate: ranking.topCandidates[0], integratedFactoryCandidate: integratedFactoryDecision.candidates[0], evidenceFilmDecision: evidenceFilmDecision.status, localCandidate: localRanking.topCandidates[0], indexedSegmentCandidate: indexedDecision.candidates[0], evidenceUsage: evidenceBrief.usage, blocked: missingVisibleScene.failures}, null, 2));
