#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertPackagingParagraphCanaryPlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-plan-v1.mjs";
import {buildPackagingParagraphCanaryRequestPack} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-request-pack-v1.mjs";
import {readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const outputRoot = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const planPath = path.join(outputRoot, "packaging-paragraph-canary-plan.json");
const outputPath = path.join(outputRoot, "packaging-paragraph-canary-request-pack.json");
const requestRoot = path.join(outputRoot, "packaging-paragraph-requests");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspaceBefore = fs.readFileSync(workspacePath);
const workspace = readProjectWorkspace(appRoot);
const audit = JSON.parse(fs.readFileSync(path.join(repoRoot, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json"), "utf8"));
const effectiveAction = audit.effectiveReviewAuthority?.nextAction;
const effectiveWorkspace = effectiveAction?.id === "GENERATE_NEW_CURRENT_CANDIDATE"
  ? {...workspace, production: {...workspace.production, authority: {...workspace.production.authority, nextAction: {...effectiveAction, requiresUser: true, targetShotIds: ["ED-13"]}}}}
  : workspace;
const plan = assertPackagingParagraphCanaryPlan(JSON.parse(fs.readFileSync(planPath, "utf8")), {appRoot});
const pack = buildPackagingParagraphCanaryRequestPack(effectiveWorkspace, plan, {appRoot});
fs.mkdirSync(requestRoot, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
for (const request of pack.requests) fs.writeFileSync(path.join(requestRoot, `${request.shotId}.json`), `${JSON.stringify(request, null, 2)}\n`, "utf8");
if (Buffer.compare(workspaceBefore, fs.readFileSync(workspacePath)) !== 0) throw new Error("packaging-paragraph-canary-request-pack-build-mutated-workspace");
const outputFileSha256 = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
console.log(JSON.stringify({status: pack.status, contract: pack.contract, outputPath, outputFileSha256, requestRoot, requestFiles: pack.requests.map((request) => `${request.shotId}.json`), packSha256: pack.packSha256, canaryPlanSha256: pack.source.canaryPlanSha256, executionKinds: pack.requests.map((request) => request.executionKind), imageGenerationRequestCount: pack.preflight.imageGenerationRequestCount, deterministicCompositeCount: pack.preflight.deterministicCompositeCount, imageGenerationPerformed: false, workspaceMutationPerformed: false}, null, 2));
