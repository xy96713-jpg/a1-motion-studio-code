#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildTasteBoundBoundedCanaryPlan} from "../apps/studio-next/src/lib/a1-taste-bound-bounded-canary-plan-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const output = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/taste-bound-bounded-canary-plan.json");
const workspace = readProjectWorkspace(appRoot);
const plan = buildTasteBoundBoundedCanaryPlan(workspace, {appRoot});
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: plan.status, contract: plan.contract, output, planSha256: plan.planSha256, storyboardRevisionSha256: plan.source.storyboardRevisionSha256, waves: plan.waves.map((wave) => ({waveId: wave.waveId, shotIds: wave.shotIds, maxConcurrentJobs: wave.maxConcurrentJobs})), imageGenerationPerformed: plan.proof.imageGenerationPerformed, workspaceMutationPerformed: plan.proof.workspaceMutationPerformed, userVisualApproval: plan.approvalBoundary.userVisualApprovalRemains}, null, 2));
