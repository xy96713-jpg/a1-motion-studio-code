#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackagingParagraphCanaryPlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-plan-v1.mjs";
import {readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";
import {assertGenerationMayUseCurrentVisualAuthority, resolveCurrentVisualAuthority} from "../apps/studio-next/src/lib/a1-current-visual-authority-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const outputPath = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-plan.json");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspaceBefore = fs.readFileSync(workspacePath);
const workspace = readProjectWorkspace(appRoot);
const audit = JSON.parse(fs.readFileSync(path.join(repoRoot, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json"), "utf8"));
const visualAuthority = resolveCurrentVisualAuthority({appRoot});
assertGenerationMayUseCurrentVisualAuthority(visualAuthority);
const effectiveAction = audit.effectiveReviewAuthority?.nextAction;
const effectiveWorkspace = effectiveAction?.id === "GENERATE_NEW_CURRENT_CANDIDATE"
  ? {...workspace, production: {...workspace.production, authority: {...workspace.production.authority, nextAction: {...effectiveAction, requiresUser: true, targetShotIds: ["ED-12", "ED-13", "ED-14"]}}}}
  : workspace;
const plan = buildPackagingParagraphCanaryPlan(effectiveWorkspace, {appRoot});
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
if (Buffer.compare(workspaceBefore, fs.readFileSync(workspacePath)) !== 0) throw new Error("packaging-paragraph-canary-plan-build-mutated-workspace");
const outputFileSha256 = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
console.log(JSON.stringify({status: plan.status, contract: plan.contract, outputPath, outputFileSha256, planSha256: plan.planSha256, shotIds: plan.shots.map((shot) => shot.shotId), densitySequence: plan.styleBriefs.map((brief) => brief.tasteDimensions.densityProfile), imageGenerationRequestCount: plan.staticStage.imageGenerationRequestCount, deterministicSourceCompositeCount: plan.staticStage.deterministicSourceCompositeCount, imageGenerationPerformed: false, workspaceMutationPerformed: false}, null, 2));
