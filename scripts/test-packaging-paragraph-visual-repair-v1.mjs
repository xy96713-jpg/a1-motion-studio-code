#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {assertPackagingParagraphObjectivePixelAudit} from "../apps/studio-next/src/lib/a1-packaging-paragraph-objective-pixel-audit-v1.mjs";
import {assertPackagingParagraphVisualDirectorAssessment} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-director-assessment-v1.mjs";
import {A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_PLAN_CONTRACT, assertPackagingParagraphVisualRepairAuthorization, buildPackagingParagraphVisualRepairImplementationBinding, buildPackagingParagraphVisualRepairObjectiveAudit, createPackagingParagraphVisualRepairAuthorization, createPackagingParagraphVisualRepairBatch, createPackagingParagraphVisualRepairPlan, renderPackagingParagraphVisualRepair} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-repair-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json"), "utf8")));
const originalReviewRoot = pack.isolationPolicy.reviewPublicRoot;
const objectiveAudit = assertPackagingParagraphObjectivePixelAudit(JSON.parse(fs.readFileSync(path.join(originalReviewRoot, "objective-pixel-audit-v1/objective-pixel-audit.json"), "utf8")), {requestPackSha256: pack.packSha256, planSha256: pack.source.canaryPlanSha256});
const reviewManifest = JSON.parse(fs.readFileSync(path.join(originalReviewRoot, "manifest.json"), "utf8"));
const assessment = assertPackagingParagraphVisualDirectorAssessment(JSON.parse(fs.readFileSync(path.join(originalReviewRoot, "visual-director-assessment-v1/assessment.json"), "utf8")), {requestPackSha256: pack.packSha256, planSha256: pack.source.canaryPlanSha256, objectivePixelAuditSha256: objectiveAudit.auditSha256});
const implementation = buildPackagingParagraphVisualRepairImplementationBinding(projectRoot);
const plan = createPackagingParagraphVisualRepairPlan({pack, assessment, objectiveAudit, reviewManifest, implementation, projectRoot});
const authorization = createPackagingParagraphVisualRepairAuthorization({plan, implementation, issuedAt: "2026-08-13T00:00:00.000Z"});
assertPackagingParagraphVisualRepairAuthorization(authorization, {plan, implementation});
const outputs = await renderPackagingParagraphVisualRepair(plan);
const batch = createPackagingParagraphVisualRepairBatch({plan, authorization, implementation, outputs, publishedAt: "2026-08-13T00:00:01.000Z"});
assert.equal(batch.items.find((item) => item.shotId === "ED-13").sha256, plan.originalOutputs["ED-13"].sha256);
assert.notEqual(batch.items.find((item) => item.shotId === "ED-12").sha256, plan.originalOutputs["ED-12"].sha256);
assert.notEqual(batch.items.find((item) => item.shotId === "ED-14").sha256, plan.originalOutputs["ED-14"].sha256);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-visual-repair-"));
try {
  const outputFiles = {};
  for (const [shotId, bytes] of Object.entries(outputs)) {
    outputFiles[shotId] = path.join(tempRoot, `${shotId}.png`);
    fs.writeFileSync(outputFiles[shotId], bytes);
  }
  const localVision = Object.fromEntries(["ED-12", "ED-13", "ED-14"].map((shotId) => [shotId, {ocr: {status: "PASS", observationCount: 1, text: shotId}, human: {status: "PASS", method: "local-vision-face-and-human-bounds-v1", faces: [], humans: []}}]));
  const audit = await buildPackagingParagraphVisualRepairObjectiveAudit({plan, batch, implementation, outputFiles, localVision});
  assert.equal(audit.status, "READY_FOR_VISUAL_DIRECTOR_AGENT_ASSESSMENT");
  assert.equal(audit.boundary.machinePassCannotApprove, true);
  assert.equal(audit.boundary.userVisualApproval, "NOT_APPROVED");
  const tampered = structuredClone(authorization);
  tampered.planSha256 = "0".repeat(64);
  assert.throws(() => assertPackagingParagraphVisualRepairAuthorization(tampered, {plan, implementation}), /authorization-invalid/u);
  const previewRoot = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_TEST_PREVIEW_ROOT;
  if (previewRoot) {
    if (fs.existsSync(previewRoot)) throw new Error("paragraph-visual-repair-test-preview-target-must-be-new");
    fs.mkdirSync(previewRoot, {recursive: true});
    for (const [shotId, bytes] of Object.entries(outputs)) fs.writeFileSync(path.join(previewRoot, `${shotId}.png`), bytes, {flag: "wx"});
  }
  console.log(JSON.stringify({status: "PASS", contract: A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_PLAN_CONTRACT, planSha256: plan.planSha256, ed12Changed: true, ed13ExactReuse: true, ed14Changed: true, deterministicAuditStatus: audit.status, unauthorizedReceiptRejected: true, machinePassCannotApprove: true, previewRoot: previewRoot || null, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
