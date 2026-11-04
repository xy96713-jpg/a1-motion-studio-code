#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertPackagingParagraphVisualRepairAssessment, assertPackagingParagraphVisualRepairBatch, assertPackagingParagraphVisualRepairObjectiveAudit, assertPackagingParagraphVisualRepairPlan, buildPackagingParagraphVisualRepairImplementationBinding, createPackagingParagraphVisualRepairAssessment} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-repair-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const planPath = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_PLAN;
const inputPath = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_ASSESSMENT_INPUT;
if (!planPath || !inputPath || !fs.existsSync(planPath) || !fs.existsSync(inputPath)) throw new Error("paragraph-visual-repair-assessment-paths-required");
const plan = assertPackagingParagraphVisualRepairPlan(JSON.parse(fs.readFileSync(planPath, "utf8")), {projectRoot});
const implementation = buildPackagingParagraphVisualRepairImplementationBinding(projectRoot);
const reviewRoot = path.join(projectRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-repair-v1", plan.planSha256);
const batch = assertPackagingParagraphVisualRepairBatch(JSON.parse(fs.readFileSync(path.join(reviewRoot, "manifest.json"), "utf8")), {plan, implementation});
const audit = assertPackagingParagraphVisualRepairObjectiveAudit(JSON.parse(fs.readFileSync(path.join(reviewRoot, "objective-pixel-audit-v1/objective-pixel-audit.json"), "utf8")), {plan, batch, implementation});
const assessment = assertPackagingParagraphVisualRepairAssessment(createPackagingParagraphVisualRepairAssessment({plan, batch, audit, input: JSON.parse(fs.readFileSync(inputPath, "utf8"))}), {plan, batch, audit});
const outputRoot = path.join(reviewRoot, "visual-director-assessment-v1");
if (fs.existsSync(outputRoot)) throw new Error("paragraph-visual-repair-assessment-target-must-be-new");
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(path.join(outputRoot, "assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({status: assessment.status, assessmentSha256: assessment.assessmentSha256, outputPath: path.join(outputRoot, "assessment.json"), reviewerKind: "visual-director-agent", human: false, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, workspaceMutationPerformed: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, null, 2));
