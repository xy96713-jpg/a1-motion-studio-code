#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertTasteBoundBoundedCanaryPlan} from "../apps/studio-next/src/lib/a1-taste-bound-bounded-canary-plan-v1.mjs";
import {buildTasteBoundImagegenRequestPack} from "../apps/studio-next/src/lib/a1-taste-bound-imagegen-request-pack-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const outputRoot = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1");
const outputPath = path.join(outputRoot, "taste-bound-imagegen-request-pack.json");
const requestRoot = path.join(outputRoot, "imagegen-requests");
const planPath = path.join(outputRoot, "taste-bound-bounded-canary-plan.json");
const workspacePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stableArtifactFileName = (shotId) => `${shotId}-taste-bound-canary-${plan.planSha256.slice(0, 12)}.png`;
const workspaceBefore = fs.readFileSync(workspacePath);
const workspace = readProjectWorkspace(appRoot);
const plan = assertTasteBoundBoundedCanaryPlan(JSON.parse(fs.readFileSync(planPath, "utf8")));
const pack = buildTasteBoundImagegenRequestPack(workspace, plan, {appRoot});

fs.mkdirSync(requestRoot, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
for (const request of pack.requests) fs.writeFileSync(path.join(requestRoot, `${request.shotId}.json`), `${JSON.stringify(request, null, 2)}\n`, "utf8");
if (Buffer.compare(workspaceBefore, fs.readFileSync(workspacePath)) !== 0) throw new Error("taste-bound-imagegen-request-pack-build-mutated-workspace");

console.log(JSON.stringify({status: pack.status, contract: pack.contract, outputPath, outputFileSha256: sha256(fs.readFileSync(outputPath)), requestRoot, requestFiles: pack.requests.map((request) => `${request.shotId}.json`), plannedArtifactFiles: pack.requests.map((request) => stableArtifactFileName(request.shotId)), packSha256: pack.packSha256, canaryPlanSha256: pack.source.canaryPlanSha256, ed13TemporalPlanStatus: pack.preflight.ed13TemporalPlanStatus, imageGenerationPerformed: pack.preflight.imageGenerationPerformed, candidateFilesCreated: pack.preflight.candidateFilesCreated, workspaceMutationPerformed: pack.preflight.workspaceMutationPerformed, approvalMutationPerformed: pack.preflight.approvalMutationPerformed}, null, 2));
