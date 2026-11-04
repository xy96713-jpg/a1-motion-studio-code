#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";

const fixturePath = path.resolve(import.meta.dirname, "../apps/studio-next/src/data/test-fixtures/a1-creator-packaging-cross-article-holdout-v1.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const workspace = {
  article: {shotCount: fixture.shots.length, sourceTextSha256: hash(fixture.sourceRevisionHash)},
  library: {assets: fixture.shots.map((shot) => ({route: "shot-composition", shotDemand: {...shot}}))},
  production: {
    project: {projectId: fixture.articleId},
    referenceConditioning: {referenceCorpusContract: "A1ReferenceSequenceCorpus/v2", referenceCorpusSha256: hash("cross-article-reference")},
    shotIntelligence: {semanticDesignBriefSet: {briefs: []}},
  },
};

assert.equal(workspace.production.creatorPackagingProjectOverrides, undefined, "holdout must not prefill project axes");
assert.ok(fixture.shots.every((shot) => !Object.hasOwn(shot, "packageDecision") && !Object.hasOwn(shot, "contentTreatment") && !Object.hasOwn(shot, "frameOccupation")), "fixture must contain subtitles only");
const sequence = buildCanonicalCreatorPackagingSequence(workspace, {now: "2026-08-09T00:00:00.000Z"});
const byId = (shotId) => sequence.decisions.find((item) => item.shotId === shotId);

assert.ok(sequence.decisions.every((item) => item.derivationAuthority === "GENERIC_SEMANTIC_DERIVATION"));
assert.equal(sequence.maturity.status, "GENERIC_HOLDOUT_DERIVED");
assert.equal(sequence.maturity.crossArticleStatus, "CROSS_ARTICLE_HOLDOUT_REQUIRED");
assert.equal(byId("HOLDOUT-ALPHA-01").semanticSignals.evidenceOwnership, "VERIFIED_EVIDENCE");
assert.equal(byId("HOLDOUT-ALPHA-01").networkDecision, "REQUIRED");
assert.deepEqual([byId("HOLDOUT-ALPHA-01").packageDecision, byId("HOLDOUT-ALPHA-01").frameOccupation], ["NO_PACKAGE", "CLEAN_BASE"]);
assert.equal(byId("HOLDOUT-ALPHA-05").semanticSignals.evidenceOwnership, "SCREEN_EVIDENCE");
assert.equal(byId("HOLDOUT-ALPHA-05").networkDecision, "SKIP");
assert.deepEqual([byId("HOLDOUT-ALPHA-02").packageDecision, byId("HOLDOUT-ALPHA-02").frameOccupation], ["PACKAGE", "OVERLAY"]);
assert.deepEqual([byId("HOLDOUT-ALPHA-03").contentTreatment, byId("HOLDOUT-ALPHA-03").frameOccupation], ["HERO_TYPOGRAPHY", "FULL_FRAME_TAKEOVER"]);
assert.deepEqual([byId("HOLDOUT-ALPHA-06").contentTreatment, byId("HOLDOUT-ALPHA-06").frameOccupation], ["EDITORIAL_EXPLAINER", "SPLIT"]);
assert.equal(byId("HOLDOUT-ALPHA-09").semanticSignals.repetitionSuppressed, true);
assert.equal(byId("HOLDOUT-ALPHA-09").packageDecision, "NO_PACKAGE");
assert.ok(byId("HOLDOUT-ALPHA-02").semanticSignals.informationGainScore > byId("HOLDOUT-ALPHA-09").semanticSignals.informationGainScore);
assert.equal(byId("HOLDOUT-ALPHA-09").semanticSignals.comparisonBasis.sameParagraph, true);
assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.status, "PASS");
assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.chain.proofShotId, "HOLDOUT-ALPHA-01");
assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.chain.questionShotId, "HOLDOUT-ALPHA-02");
assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.chain.verdictShotId, "HOLDOUT-ALPHA-03");
assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.chain.resetShotId, "HOLDOUT-ALPHA-04");
assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.chain.returnToProofShotId, "HOLDOUT-ALPHA-05");
assert.ok(sequence.rhythmAudit.hupoOrderedSequenceAudit.coverage.localChainDensity >= 0.45);

console.log(JSON.stringify({
  status: "PASS",
  contract: fixture.contract,
  articleId: fixture.articleId,
  sourceRevisionHash: sequence.sourceRevisionHash,
  genericDecisionCount: sequence.maturity.genericDecisionCount,
  packageDecisionIds: sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId),
  noPackageDecisionIds: sequence.decisions.filter((item) => item.packageDecision === "NO_PACKAGE").map((item) => item.shotId),
  evidenceOwnership: Object.fromEntries(sequence.decisions.map((item) => [item.shotId, item.semanticSignals.evidenceOwnership])),
  hupo: sequence.rhythmAudit.hupoOrderedSequenceAudit,
  claimBoundary: sequence.maturity.claimBoundary,
}, null, 2));
