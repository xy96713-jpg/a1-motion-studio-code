#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_PRESENTATION_PROOF_SHOT_IDS, A1_PRESENTATION_RENDERER_PROOF_CONTRACT} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const source = fs.readFileSync(path.join(root, "remotion-renderer/src/EditorialMontageBoard.tsx"), "utf8");
const proof = workspace.production?.presentationRendererProof;
const packagingActive = workspace.production?.packagingBeatPlan?.contract === "A1PackagingBeatPlan/v1";
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const executors = ["object-bound-presenter-type", "source-bound-annotation", "type-gesture-verdict", "evidence-package-full-bleed", "quiet-presenter", "semantic-object-package"];
const decisions = workspace.production?.presentationDecisions?.items || [];
check(decisions.length === 34, `decision-count:${decisions.length}`);
check(decisions.every((item) => executors.includes(item.rendererExecutor)), "decision-executor-unmapped");
if (packagingActive) {
  check(proof?.status === "SUPERSEDED" && proof?.supersededBy === "A1PackagingBeatPlan/v1", "legacy-static-proof-not-superseded");
} else {
  check(proof?.contract === A1_PRESENTATION_RENDERER_PROOF_CONTRACT && proof.status === "READY_FOR_REVIEW", "static-proof-not-ready");
  check(proof?.rendererExecutorCoverage?.mappedShotCount === 34 && proof?.rendererExecutorCoverage?.totalShotCount === 34, "coverage-not-34-of-34");
  check(proof?.rendererExecutorCoverage?.genericFallbackCount === 0, "generic-fallback-present");
  check(JSON.stringify(proof?.shotIds || []) === JSON.stringify(A1_PRESENTATION_PROOF_SHOT_IDS), "six-shot-proof-scope-invalid");
}
check(source.includes("resolveEditorialRendererExecutor"), "resolver-not-exported");
check(source.includes("data-a1-renderer-executor={rendererExecutor}"), "renderer-executor-data-marker-missing");
check(!source.includes("function Title("), "generic-title-function-remains");
for (const executor of executors) check(source.includes(`rendererExecutor === "${executor}"`), `executor-switch-missing:${executor}`);
for (const still of proof?.stills || []) check(fs.existsSync(path.join(root, "apps/studio-next/public", still.publicUrl.replace(/^\/+/, ""))), `proof-still-missing:${still.shotId}`);

console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", contract: "A1PresentationRendererExecutorCoverage/v1", scope: packagingActive ? "legacy-advisory" : "active-shot-presentation", workspaceSha256: workspace.workspaceSha256, mappedShotCount: proof?.rendererExecutorCoverage?.mappedShotCount || 0, totalShotCount: proof?.rendererExecutorCoverage?.totalShotCount || 0, genericFallbackCount: proof?.rendererExecutorCoverage?.genericFallbackCount || 0, sixShotIds: proof?.shotIds || [], failures}, null, 2));
if (failures.length) process.exitCode = 1;
