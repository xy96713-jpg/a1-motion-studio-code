#!/usr/bin/env node
import assert from "node:assert/strict";

import {buildTypographyDesignBrief, compilePresenterHeroStructureCandidates} from "./lib/a1-intelligent-typography-director-v1.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const input = {
  shotId: "ED-01",
  exactCopy: "智能写作工具台",
  semanticEvent: "IDENTITY",
  semanticRuns: ["智能写作", "工具台"],
  carrier: "PRESENTER_BASE",
  source: {file: "source.jpg", sha256: SHA_A, width: 1920, height: 1080},
  masks: {
    unified: {file: "unified.png", sha256: SHA_B},
    face: {file: "face.png", sha256: "c".repeat(64)},
    hair: {file: "hair.png", sha256: "d".repeat(64)},
    eyes: {file: "eyes.png", sha256: "e".repeat(64)},
    mouth: {file: "mouth.png", sha256: "f".repeat(64)},
    microphone: {file: "microphone.png", sha256: "1".repeat(64)},
  },
  geometry: {
    subjectBounds: {left: 630, top: 180, right: 1430, bottom: 1080},
    faceBounds: {left: 850, top: 235, right: 1120, bottom: 560},
  },
};
const brief = buildTypographyDesignBrief(input);

assert.equal(brief.contract, "A1TypographyDesignBrief/v1");
assert.equal(brief.typographyRole, "PRESENTER_HERO");
assert.equal(brief.exactCopy, "智能写作工具台");
assert.deepEqual(brief.copyStructure.semanticRuns.map((run) => run.text), ["智能写作", "工具台"]);
assert.deepEqual(brief.allowedTopologies, ["SUBJECT_CARVED_WALL", "ORBITAL_PHRASE_FIELD", "EDGE_CROP_TAKEOVER"]);
assert.equal(brief.renderStage, "STRUCTURE_ONLY");
assert.equal(brief.productionAdmission, false);
assert.equal(brief.userVisualApproval, "NOT_APPROVED");
assert.equal(brief.source.sha256, SHA_A);
assert.equal(brief.masks.unified.sha256, SHA_B);
assert.match(brief.briefSha256, /^[a-f0-9]{64}$/u);
assert.throws(() => buildTypographyDesignBrief({...input, exactCopy: ""}), /exact-copy-required/u);
assert.throws(() => buildTypographyDesignBrief({...input, source: {...input.source, sha256: "bad"}}), /source-sha-invalid/u);

const candidates = compilePresenterHeroStructureCandidates(brief);
assert.equal(candidates.length, 12);
assert.deepEqual(Object.fromEntries(brief.allowedTopologies.map((topology) => [topology, candidates.filter((candidate) => candidate.topology === topology).length])), {
  SUBJECT_CARVED_WALL: 4,
  ORBITAL_PHRASE_FIELD: 4,
  EDGE_CROP_TAKEOVER: 4,
});
assert.equal(new Set(candidates.map((candidate) => candidate.candidateId)).size, 12);
assert.equal(new Set(candidates.map((candidate) => candidate.planSha256)).size, 12);
assert.throws(() => compilePresenterHeroStructureCandidates({
  ...brief,
  copyStructure: {readingOrder: [0, 1, 2], semanticRuns: [
    ...brief.copyStructure.semanticRuns,
    {id: "run-3", text: "误复制"},
  ]},
}), /requires-exactly-two-semantic-runs/u);
assert.throws(() => compilePresenterHeroStructureCandidates({
  ...brief,
  copyStructure: {readingOrder: [0, 1], semanticRuns: [
    brief.copyStructure.semanticRuns[0],
    {...brief.copyStructure.semanticRuns[1], text: "错字"},
  ]},
}), /structure-copy-binding-invalid/u);
for (const candidate of candidates) {
  assert.equal(candidate.contract, "A1TypographyStructureCandidatePlan/v1");
  assert.equal(candidate.briefSha256, brief.briefSha256);
  assert.equal(candidate.renderStage, "STRUCTURE_ONLY");
  assert.equal(candidate.productionAdmission, false);
  assert.equal(candidate.materialRecipe, null);
  assert.deepEqual(candidate.runs.map((run) => run.text), ["智能写作", "工具台"]);
  assert.ok(candidate.runs.every((run) => [run.left, run.top, run.size, run.scaleX, run.scaleY, run.rotation].every(Number.isFinite)));
  assert.ok(candidate.contactTargets.length >= 2);
  assert.match(candidate.planSha256, /^[a-f0-9]{64}$/u);
}

console.log("A1 intelligent typography director brief and candidate contracts PASS");
