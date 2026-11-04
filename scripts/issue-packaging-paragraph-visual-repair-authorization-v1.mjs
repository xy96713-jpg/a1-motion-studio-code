#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertPackagingParagraphVisualRepairPlan, buildPackagingParagraphVisualRepairImplementationBinding, createPackagingParagraphVisualRepairAuthorization} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-repair-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const planPath = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_PLAN;
if (!planPath || !fs.existsSync(planPath)) throw new Error("paragraph-visual-repair-plan-path-required");
const plan = assertPackagingParagraphVisualRepairPlan(JSON.parse(fs.readFileSync(planPath, "utf8")), {projectRoot});
const implementation = buildPackagingParagraphVisualRepairImplementationBinding(projectRoot);
const authorization = createPackagingParagraphVisualRepairAuthorization({plan, implementation});
const outputRoot = path.join(artifactRoot, "packaging-paragraph-visual-repair-authorizations", plan.planSha256);
const outputPath = path.join(outputRoot, "current-thread-default-autostart-20260813.json");
if (fs.existsSync(outputRoot)) throw new Error("paragraph-visual-repair-authorization-target-must-be-new");
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(authorization, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({status: authorization.status, outputPath, authorizationSha256: authorization.authorizationSha256, planSha256: plan.planSha256, authorizedAction: authorization.authorizedAction, imageGenerationAllowed: false, productionAdmitted: false}, null, 2));
