#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {assertPackagingParagraphObjectivePixelAudit} from "../apps/studio-next/src/lib/a1-packaging-paragraph-objective-pixel-audit-v1.mjs";
import {assertPackagingParagraphVisualDirectorAssessment, createPackagingParagraphVisualDirectorAssessment} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-director-assessment-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const inputPath = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_DIRECTOR_INPUT;
if (!inputPath || !fs.existsSync(inputPath)) throw new Error("paragraph-visual-director-assessment-input-required");
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json"), "utf8")));
const reviewRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-review-v1", pack.source.canaryPlanSha256);
const objectivePath = path.join(reviewRoot, "objective-pixel-audit-v1/objective-pixel-audit.json");
if (!fs.existsSync(objectivePath)) throw new Error("paragraph-visual-director-assessment-objective-audit-required");
const objectiveAudit = assertPackagingParagraphObjectivePixelAudit(JSON.parse(fs.readFileSync(objectivePath, "utf8")), {requestPackSha256: pack.packSha256, planSha256: pack.source.canaryPlanSha256});
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const assessment = assertPackagingParagraphVisualDirectorAssessment(createPackagingParagraphVisualDirectorAssessment({...input, pack, objectiveAudit}), {requestPackSha256: pack.packSha256, planSha256: pack.source.canaryPlanSha256, objectivePixelAuditSha256: objectiveAudit.auditSha256});
const outputRoot = path.join(reviewRoot, "visual-director-assessment-v1");
const stagingRoot = path.join(reviewRoot, ".visual-director-assessment-v1.staging");
const outputPath = path.join(outputRoot, "assessment.json");
if (fs.existsSync(outputRoot) || fs.existsSync(stagingRoot)) throw new Error("paragraph-visual-director-assessment-target-must-be-new");
let published = false;
try {
  fs.mkdirSync(stagingRoot, {recursive: true});
  fs.writeFileSync(path.join(stagingRoot, "assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
  fs.renameSync(stagingRoot, outputRoot);
  published = true;
} finally {
  if (!published && fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, {recursive: true, force: true});
}
console.log(JSON.stringify({status: assessment.status, assessmentSha256: assessment.assessmentSha256, outputPath, reviewerKind: assessment.reviewer.kind, human: false, mayClaimHumanStatus: false, subsequentHumanUserActualPixelReviewRequired: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, workspaceMutationPerformed: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, null, 2));
