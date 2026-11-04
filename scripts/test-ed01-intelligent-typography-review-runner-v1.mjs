#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {runEd01IntelligentTypographyReview} from "./build-ed01-intelligent-typography-review-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work/test-fixtures/ed01-intelligent-typography-review-runner-v1");
fs.rmSync(outputRoot, {recursive: true, force: true});
const result = await runEd01IntelligentTypographyReview({outputRoot});

assert.equal(result.report.contract, "A1Ed01IntelligentTypographyReviewRun/v1");
assert.equal(result.report.status, "READY_FOR_USER_MATERIAL_REVIEW");
assert.equal(result.report.productionAdmission, false);
assert.equal(result.report.userVisualApproval, "NOT_APPROVED");
assert.equal(result.report.counts.structureCandidates, 12);
assert.equal(result.report.counts.materialCandidates, 18);
assert.ok(result.report.counts.materialHardPass >= 15);
assert.equal(result.report.counts.cjkRoleAudited, 18);
assert.equal(result.report.counts.pixelBalanceMeasured, 18);
assert.equal(result.report.counts.shortlist, 6);
assert.equal(result.report.motionRenderAllowed, false);
assert.equal(result.report.auditEngines.cjkRole.contract, "A1CjkRoleLayoutAudit/v1");
assert.equal(result.report.auditEngines.cjkRole.heroScope, "DISPLAY_GLYPH_ONLY");
assert.equal(result.report.auditEngines.pixelBalance.contract, "A1TypographyPixelBalanceAudit/v1");
assert.equal(result.report.auditEngines.pixelBalance.disposition, "SIGNAL_ONLY_NEVER_AESTHETIC_APPROVAL");
for (const file of [result.report.files.mechanicalScores, result.report.files.pairwiseReview, result.report.files.preferenceLedger, result.report.files.motionSpecs, result.report.files.materialBoard, result.report.files.shortlistBoard]) assert.ok(fs.existsSync(file));
const pairwise = JSON.parse(fs.readFileSync(result.report.files.pairwiseReview, "utf8"));
assert.equal(pairwise.candidates.length, 6);
assert.equal(pairwise.pairs.length, 15);
for (const topology of ["SUBJECT_CARVED_WALL", "ORBITAL_PHRASE_FIELD", "EDGE_CROP_TAKEOVER"]) assert.equal(pairwise.candidates.filter((candidate) => candidate.topology === topology).length, 2);
const ledger = JSON.parse(fs.readFileSync(result.report.files.preferenceLedger, "utf8"));
assert.equal(ledger.status, "AWAITING_USER_DECISION");
const motions = JSON.parse(fs.readFileSync(result.report.files.motionSpecs, "utf8"));
assert.equal(motions.specs.length, 6);
assert.ok(motions.specs.every((spec) => spec.renderAllowed === false));
const shortlistBoard = await sharp(result.report.files.shortlistBoard).metadata();
assert.equal(shortlistBoard.width, 1920);
assert.equal(shortlistBoard.height, 720);
assert.equal(result.report.shortlist.length, 6);
for (const candidate of result.report.shortlist) {
  const large = await sharp(candidate.preview960).metadata();
  const small = await sharp(candidate.preview480).metadata();
  assert.deepEqual([large.width, large.height], [960, 540]);
  assert.deepEqual([small.width, small.height], [480, 270]);
  assert.equal(candidate.cjkRoleAuditStatus, "PASS");
  assert.equal(candidate.pixelBalanceStatus, "MEASURED_REVIEW_REQUIRED");
}

console.log("A1 ED-01 intelligent typography review runner PASS");
