#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertNasSemanticSceneCatalog, assertNasSemanticSceneRetrieval, compileNasSemanticSceneCatalog, retrieveNasSemanticScenes} from "../apps/studio-next/src/lib/a1-nas-semantic-scene-index-v2.mjs";

const sha = (letter) => letter.repeat(64);
const vector = (index) => Array.from({length: 16}, (_, offset) => offset === index ? 1 : 0);
const catalog = compileNasSemanticSceneCatalog({
  source: {path: "/mnt/nas/reference.mp4", sha256: sha("a"), durationMs: 30000, rightsStatus: "REFERENCE_ONLY", referenceOnly: true},
  analysisProxy: {path: "work/proxy.mp4", sha256: sha("b"), width: 1280, height: 720},
  provider: {scene: "PySceneDetect", transcript: "MLX Whisper", visual: "OpenCLIP", store: "LanceDB"},
  scenes: [
    {id: "s1", startMs: 0, endMs: 8000, keyframe: {path: "work/1.png", sha256: sha("c"), atMs: 4000}, transcript: "founder speaking to camera about the company", ocrText: "CEO", vlmDescription: "one person speaking in an interview", roles: ["PERSON", "VISIBLE_SPEAKING"], embedding: vector(0)},
    {id: "s2", startMs: 8000, endMs: 18000, keyframe: {path: "work/2.png", sha256: sha("d"), atMs: 13000}, transcript: "the system processes each item in order", ocrText: "workflow", vlmDescription: "a visible step by step process", roles: ["PROCESS", "MECHANISM"], embedding: vector(1)},
    {id: "s3", startMs: 18000, endMs: 30000, keyframe: {path: "work/3.png", sha256: sha("e"), atMs: 24000}, transcript: "quiet empty room", ocrText: "", vlmDescription: "a lonely atmospheric interior", roles: ["ATMOSPHERE", "CINEMATIC_REFERENCE"], embedding: vector(2)},
  ],
});
assertNasSemanticSceneCatalog(catalog);
assert.equal(catalog.counts.sceneCount, 3);

const fixtures = [
  {id: "person", text: "founder interview speaking", role: "IDENTITY_OR_TESTIMONY", embedding: vector(0), expected: "s1"},
  {id: "process", text: "system workflow process", role: "PROCESS_OR_SYSTEM", embedding: vector(1), expected: "s2"},
  {id: "cinematic", text: "lonely quiet atmosphere", role: "ATMOSPHERE_OR_EMOTION", embedding: vector(2), expected: "s3"},
];
for (const fixture of fixtures) {
  const retrieval = retrieveNasSemanticScenes(catalog, {id: fixture.id, text: fixture.text, narrativeRole: fixture.role, embedding: fixture.embedding, minimumMs: 3000, maximumMs: 12000}, {allowReferenceOnly: true, limit: 3});
  assertNasSemanticSceneRetrieval(retrieval);
  assert.equal(retrieval.topCandidates[0].sceneId, fixture.expected);
  assert.equal(retrieval.topCandidates[0].status, "REFERENCE_ONLY_REVIEW");
  assert.equal(retrieval.topCandidates[0].productionUseAllowed, false);
}

const rightsBlocked = retrieveNasSemanticScenes(catalog, {id: "blocked", text: "founder", narrativeRole: "IDENTITY_OR_TESTIMONY", embedding: vector(0)}, {allowReferenceOnly: false});
assert.equal(rightsBlocked.status, "NO_ELIGIBLE_CANDIDATES");
assert.ok(rightsBlocked.candidates.every((candidate) => candidate.status === "RIGHTS_BLOCKED"));

console.log(JSON.stringify({contract: "A1NasSemanticSceneIndexTest/v2", status: "PASS", catalogSha256: catalog.catalogSha256, fixtures: fixtures.map(({id, expected}) => ({id, expected, status: "PASS"})), rightsBlocked: rightsBlocked.status}, null, 2));
