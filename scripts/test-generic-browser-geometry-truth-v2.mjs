#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {auditScreenGeometryTruth} from "../apps/studio-next/src/lib/a1-screen-geometry-truth-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, "work/cross-project-screen-validation-v1/englishflow-geometry-truth-v2/capture-report.json");
const receiptPath = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/cap-receipt.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
const audit = auditScreenGeometryTruth(report.geometryTruth, {sourceSha256: report.output.sha256, sourceWidth: report.output.width, sourceHeight: report.output.height, targetKey: "answer_submit"});
assert.equal(report.geometryTruth.status, "PASS_REVIEW_ONLY");
assert.equal(audit.status, "PASS");
assert.equal(report.geometryTruth.frame.pointPixelScale.x, 1);
assert.equal(report.geometryTruth.frame.pointPixelScale.y, 1);
assert.equal(report.geometryTruth.targets.length, 4);
assert.equal(report.clickTargetProof.length, 3);
assert.ok(report.clickTargetProof.every((item) => item.insideTarget === true && item.centerErrorPx < 48));
assert.equal(receipt.geometryTruth.status, "PASS_REVIEW_ONLY");
assert.equal(receipt.geometryTruth.targetCount, 4);
assert.equal(receipt.reviewVideo.fullDecodePass, true);
console.log(JSON.stringify({contract: "A1GenericBrowserGeometryTruthTest/v1", status: "PASS", source: report.output, geometryTruthSha256: report.geometryTruth.geometryTruthSha256, targetCount: report.geometryTruth.targets.length, capReceiptSha256: receipt.receiptSha256, reviewVideo: receipt.reviewVideo}, null, 2));
