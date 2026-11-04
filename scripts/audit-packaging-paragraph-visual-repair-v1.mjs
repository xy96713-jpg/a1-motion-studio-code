#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {assertPackagingParagraphVisualRepairBatch, assertPackagingParagraphVisualRepairObjectiveAudit, assertPackagingParagraphVisualRepairPlan, buildPackagingParagraphVisualRepairImplementationBinding, buildPackagingParagraphVisualRepairObjectiveAudit} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-repair-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const planPath = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_PLAN;
if (!planPath || !fs.existsSync(planPath)) throw new Error("paragraph-visual-repair-plan-path-required");
const plan = assertPackagingParagraphVisualRepairPlan(JSON.parse(fs.readFileSync(planPath, "utf8")), {projectRoot});
const implementation = buildPackagingParagraphVisualRepairImplementationBinding(projectRoot);
const reviewRoot = path.join(projectRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-repair-v1", plan.planSha256);
const batch = assertPackagingParagraphVisualRepairBatch(JSON.parse(fs.readFileSync(path.join(reviewRoot, "manifest.json"), "utf8")), {plan, implementation});
const outputFiles = Object.fromEntries(["ED-12", "ED-13", "ED-14"].map((shotId) => [shotId, path.join(reviewRoot, `${shotId}.png`)]));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-visual-repair-audit-"));
const localVision = {};
try {
  const ocrBinary = path.join(tempRoot, "a1-local-vision-ocr");
  const humanBinary = path.join(tempRoot, "a1-local-vision-human-bounds");
  for (const [source, output] of [["scripts/run-local-vision-ocr-v1.swift", ocrBinary], ["scripts/run-local-vision-human-bounds-v1.swift", humanBinary]]) {
    const compile = spawnSync("swiftc", [path.join(projectRoot, source), "-o", output], {encoding: "utf8"});
    if (compile.status !== 0) throw new Error(`paragraph-visual-repair-local-vision-compile-failed:${source}:${compile.stderr.trim()}`);
  }
  for (const [shotId, file] of Object.entries(outputFiles)) {
    const ocrProbe = spawnSync(ocrBinary, [file], {encoding: "utf8"});
    const humanProbe = spawnSync(humanBinary, [file], {encoding: "utf8"});
    if (ocrProbe.status !== 0 || humanProbe.status !== 0) throw new Error(`paragraph-visual-repair-local-vision-probe-failed:${shotId}`);
    localVision[shotId] = {ocr: JSON.parse(ocrProbe.stdout.trim()), human: JSON.parse(humanProbe.stdout.trim())};
  }
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
const audit = assertPackagingParagraphVisualRepairObjectiveAudit(await buildPackagingParagraphVisualRepairObjectiveAudit({plan, batch, implementation, outputFiles, localVision}), {plan, batch, implementation});
const auditRoot = path.join(reviewRoot, "objective-pixel-audit-v1");
if (fs.existsSync(auditRoot)) throw new Error("paragraph-visual-repair-audit-target-must-be-new");
fs.mkdirSync(auditRoot, {recursive: true});
fs.writeFileSync(path.join(auditRoot, "objective-pixel-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
const panels = await Promise.all(["ED-12", "ED-13", "ED-14"].map((shotId) => sharp(outputFiles[shotId]).resize(640, 360, {fit: "fill"}).png().toBuffer()));
const strip = await sharp({create: {width: 1920, height: 360, channels: 4, background: "#eef1ef"}}).composite(panels.map((input, index) => ({input, left: index * 640, top: 0}))).png({compressionLevel: 9}).toBuffer();
fs.writeFileSync(path.join(auditRoot, "paragraph-review-strip.png"), strip, {flag: "wx"});
const assessmentTemplate = {
  contract: "A1PackagingParagraphVisualRepairAssessmentInput/v1",
  status: "UNREVIEWED_ACTUAL_PIXELS_REQUIRED",
  objectiveAuditSha256: audit.auditSha256,
  reviewer: {kind: "visual-director-agent", id: "codex-a1-visual-director", model: "UNSET", human: false, mayClaimHumanStatus: false, assessedAt: "UNSET_AFTER_ACTUAL_PIXEL_INSPECTION"},
  items: ["ED-12", "ED-13", "ED-14"].map((shotId) => ({shotId, artifactSha256: audit.items.find((item) => item.shotId === shotId).sha256, expectedVisibleAction: plan.reviewCriteria.expectedVisibleActions[shotId], threeSecondRead: "UNREVIEWED", visibleAction: "UNREVIEWED", focalActor: "UNREVIEWED", visualThesisObserved: "UNREVIEWED", compositionEvidence: "UNREVIEWED", typographyEvidence: "UNREVIEWED", weaknesses: [], coreCheckResults: plan.reviewCriteria.coreCheckIds.map((id) => ({id, result: "UNREVIEWED", evidence: "UNREVIEWED"})), hardFailureResults: plan.reviewCriteria.hardFailureIds.map((id) => ({id, present: null, evidence: "UNREVIEWED"}))})),
  paragraph: Object.assign(Object.fromEntries(plan.reviewCriteria.paragraphChecks.map((id) => [id, {result: "UNREVIEWED", evidence: "UNREVIEWED"}])), {strongestHandoff: "UNREVIEWED", weakestHandoff: "UNREVIEWED", repairInstruction: null}),
  boundary: {agentMayNotClaimHumanStatus: true, userVisualApproval: "NOT_APPROVED", productionAdmissionAllowed: false, workspaceMutationAllowed: false}
};
fs.writeFileSync(path.join(auditRoot, "visual-director-assessment-input-template.json"), `${JSON.stringify(assessmentTemplate, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({status: audit.status, auditSha256: audit.auditSha256, auditPath: path.join(auditRoot, "objective-pixel-audit.json"), stripPath: path.join(auditRoot, "paragraph-review-strip.png"), assessmentTemplatePath: path.join(auditRoot, "visual-director-assessment-input-template.json"), items: audit.items.map(({shotId, status, sha256, reusedExactPixels, failures, localVision}) => ({shotId, status, sha256, reusedExactPixels, failures, ocrObservationCount: localVision?.ocr?.observationCount, faceCount: localVision?.human?.faces?.length, humanCount: localVision?.human?.humans?.length})), sequenceDifference: audit.sequenceDifference, machinePassCannotApprove: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, workspaceMutationPerformed: false}, null, 2));
