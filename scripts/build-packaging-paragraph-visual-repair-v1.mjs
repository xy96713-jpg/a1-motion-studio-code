#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {assertPackagingParagraphObjectivePixelAudit} from "../apps/studio-next/src/lib/a1-packaging-paragraph-objective-pixel-audit-v1.mjs";
import {assertPackagingParagraphVisualDirectorAssessment} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-director-assessment-v1.mjs";
import {buildPackagingParagraphVisualRepairImplementationBinding, createPackagingParagraphVisualRepairPlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-repair-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const pack = assertPackagingParagraphCanaryRequestPack(JSON.parse(fs.readFileSync(path.join(artifactRoot, "packaging-paragraph-canary-request-pack.json"), "utf8")));
const originalReviewRoot = pack.isolationPolicy.reviewPublicRoot;
const objectiveAudit = assertPackagingParagraphObjectivePixelAudit(JSON.parse(fs.readFileSync(path.join(originalReviewRoot, "objective-pixel-audit-v1/objective-pixel-audit.json"), "utf8")), {requestPackSha256: pack.packSha256, planSha256: pack.source.canaryPlanSha256});
const reviewManifest = JSON.parse(fs.readFileSync(path.join(originalReviewRoot, "manifest.json"), "utf8"));
const assessment = assertPackagingParagraphVisualDirectorAssessment(JSON.parse(fs.readFileSync(path.join(originalReviewRoot, "visual-director-assessment-v1/assessment.json"), "utf8")), {requestPackSha256: pack.packSha256, planSha256: pack.source.canaryPlanSha256, objectivePixelAuditSha256: objectiveAudit.auditSha256});
const implementation = buildPackagingParagraphVisualRepairImplementationBinding(projectRoot);
const plan = createPackagingParagraphVisualRepairPlan({pack, assessment, objectiveAudit, reviewManifest, implementation, projectRoot});
const outputRoot = path.join(artifactRoot, "packaging-paragraph-visual-repairs", assessment.assessmentSha256);
const outputPath = path.join(outputRoot, "plan.json");
if (fs.existsSync(outputRoot)) throw new Error("paragraph-visual-repair-plan-target-must-be-new");
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({status: plan.status, outputPath, planSha256: plan.planSha256, implementationSha256: implementation.implementationSha256, rerenderShotIds: plan.scope.rerenderShotIds, reuseExactShotIds: plan.scope.reuseExactShotIds, imageGenerationAllowed: false, productionAdmitted: false, workspaceMutationPerformed: false}, null, 2));
