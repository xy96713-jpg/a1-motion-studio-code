#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {auditPresenterReferenceGrammar, buildReferencePackagingStudy} from "../apps/studio-next/src/lib/a1-reference-packaging-study-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "presenter-light-overlay-system-v2");
const corpus = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/reference-sequence-corpus-v3/corpus.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(candidateRoot, "manifest.json"), "utf8"));
const workspace = readProjectWorkspace(appRoot);
const targetShotIds = ["ED-01", "ED-07", "ED-13", "ED-19", "ED-31"];
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));

const study = buildReferencePackagingStudy(corpus);
assert.equal(study.sourceCount, 3);
assert.equal(study.sequenceCount, 12);
assert.equal(study.frameCount, 48);
assert.deepEqual(study.sourceIds, ["fern", "vox", "cleo-abram"]);
assert.equal(study.qualityGate.runtimeReferenceAssetAllowed, false);
assert.notEqual(manifest.referenceStudy.studySha256, study.studySha256);
assert.equal(manifest.referenceGrammarAudit.status, "PASS");
assert.equal(manifest.userVisualApproval, "NOT_APPROVED");
assert.equal(manifest.productionAdmitted, false);
assert.equal(manifest.motionAllowed, false);

for (const board of [manifest.reviewBoards.threeStateBoard, manifest.reviewBoards.referenceComparisonBoard]) {
  assert.ok(fs.existsSync(publicFile(board.publicUrl)), `review-board-missing:${board.publicUrl}`);
  assert.equal(sha256File(publicFile(board.publicUrl)), board.sha256, `review-board-sha:${board.publicUrl}`);
}

const candidateItems = new Map(manifest.packageItems.map((item) => [item.shotId, item]));
for (const item of [...candidateItems.values()].filter((candidate) => candidate.presenterReferenceGrammar)) {
  const shotId = item.shotId;
  assert.equal(item.presenterReferenceGrammar.panelAllowed, false, `${shotId}:panel-policy`);
  assert.equal(item.presenterReferenceGrammar.persistentChromeAllowed, false, `${shotId}:chrome-policy`);
  assert.equal(item.presenterReferenceGrammar.repeatedFixedAnchorAllowed, false, `${shotId}:anchor-policy`);
  assert.equal(item.styleLineage.compositionMethod, "A1_PRESENTER_REFERENCE_GRAMMAR_STATIC_FRAME_V2", `${shotId}:composition-method`);
  if (item.presenterReferenceGrammar.referenceCreatorIds?.includes("covacut")) assert.equal(item.comparisonGate.status, "BLOCK", `${shotId}:excluded-source-comparison-gate`);
  if (item.comparisonGate.status !== "BLOCK") assert.notEqual(item.comparisonGate.incumbent.artifactSha256, item.comparisonGate.candidate.artifactSha256, `${shotId}:candidate-must-differ`);
}

const currentItems = workspace.production.shotIntelligence.wholeFilmStaticBoard?.items || [];
const currentTargetItems = currentItems.filter((item) => targetShotIds.includes(item.shotId));
const currentHasReferenceGrammar = currentTargetItems.length === targetShotIds.length && currentTargetItems.every((item) => item.presenterReferenceGrammar);
const currentAudit = currentHasReferenceGrammar
  ? auditPresenterReferenceGrammar({items: currentItems, targetShotIds, study})
  : {status: "LEGACY_INCUMBENT_RETAINED"};
if (currentAudit.status === "PASS") assert.equal(currentAudit.status, "PASS", JSON.stringify(currentAudit));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1PresenterReferenceGrammarSystemTest/v1",
  studySha256: study.studySha256,
  sourceIds: study.sourceIds,
  sequenceCount: study.sequenceCount,
  frameCount: study.frameCount,
  targetShotIds,
  candidateGrammarStatus: manifest.referenceGrammarAudit.status,
  currentGrammarStatus: currentAudit.status,
  reviewBoards: manifest.reviewBoards,
  userVisualApproval: manifest.userVisualApproval,
  motionAllowed: manifest.motionAllowed,
}, null, 2));
