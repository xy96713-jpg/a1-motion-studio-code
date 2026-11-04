#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertPackagingParagraphVisualRepairAuthorization, assertPackagingParagraphVisualRepairPlan, buildPackagingParagraphVisualRepairImplementationBinding, createPackagingParagraphVisualRepairBatch, renderPackagingParagraphVisualRepair} from "../apps/studio-next/src/lib/a1-packaging-paragraph-visual-repair-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const planPath = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_PLAN;
const authorizationPath = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_AUTHORIZATION;
if (process.env.A1_EXECUTE_PACKAGING_PARAGRAPH_VISUAL_REPAIR !== "1" || !planPath || !authorizationPath) throw new Error("paragraph-visual-repair-explicit-hash-bound-execution-required");
const plan = assertPackagingParagraphVisualRepairPlan(JSON.parse(fs.readFileSync(planPath, "utf8")), {projectRoot});
const implementation = buildPackagingParagraphVisualRepairImplementationBinding(projectRoot);
const authorization = assertPackagingParagraphVisualRepairAuthorization(JSON.parse(fs.readFileSync(authorizationPath, "utf8")), {plan, implementation});
const reviewRoot = path.join(projectRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-repair-v1", plan.planSha256);
const stagingRoot = path.join(projectRoot, "apps/studio-next/public/generated/system-line/.staging", `packaging-paragraph-canary-repair-v1-${plan.planSha256}`);
if (fs.existsSync(reviewRoot) || fs.existsSync(stagingRoot)) throw new Error("paragraph-visual-repair-output-target-must-be-new");
const outputs = await renderPackagingParagraphVisualRepair(plan);
let published = false;
try {
  fs.mkdirSync(stagingRoot, {recursive: true});
  for (const [shotId, bytes] of Object.entries(outputs)) fs.writeFileSync(path.join(stagingRoot, `${shotId}.png`), bytes, {flag: "wx"});
  const batch = createPackagingParagraphVisualRepairBatch({plan, authorization, implementation, outputs});
  fs.writeFileSync(path.join(stagingRoot, "manifest.json"), `${JSON.stringify(batch, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
  fs.mkdirSync(path.dirname(reviewRoot), {recursive: true});
  fs.renameSync(stagingRoot, reviewRoot);
  published = true;
  console.log(JSON.stringify({status: batch.status, reviewRoot, manifestSha256: batch.manifestSha256, items: batch.items, reusedExactShotIds: ["ED-13"], generatedShotIds: [], productionAdmitted: false, workspaceMutationPerformed: false, userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, null, 2));
} finally {
  if (!published && fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, {recursive: true, force: true});
}
