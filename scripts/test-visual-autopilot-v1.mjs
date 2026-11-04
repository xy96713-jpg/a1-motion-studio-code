import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, updateEditorialAsset} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {queueAssetGeneration} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {applyAutopilotCandidateSelection, assertVisualAutopilot, runVisualAutopilotReview} from "../apps/studio-next/src/lib/a1-visual-autopilot-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const source = assertEditorialAssetWorkbench(JSON.parse(fs.readFileSync(workspacePath, "utf8")));
const reviewed = runVisualAutopilotReview(source, "2026-07-30T15:00:00.000Z");
const autopilot = assertVisualAutopilot(reviewed.production.autopilot);
const results = [];
const check = (id, pass) => results.push({id, status: pass ? "PASS" : "FAIL"});

check("recommendation-first-contract", autopilot.mode === "recommendation-first" && autopilot.status === "recommendation-ready" && autopilot.gates.automaticApprovalAllowed === true && autopilot.critic.automaticApprovalAllowed === true);
check("current-four-direction-anchor-is-ranked", autopilot.recommendation?.assetId === "glyph-board-polished-waste" && autopilot.recommendation.recommendedCandidateId === "glyph-board-polished-waste-direction-01" && autopilot.recommendation.alternatives.length === 4);
check("preferred-quality-threshold-is-met-with-honest-confidence", autopilot.recommendation?.score >= 22 && autopilot.recommendation.confidence === "review-required" && autopilot.recommendation.scoreDelta < 1);
check("three-anchor-plan-selects-article-spread", autopilot.generationPlan.anchorLimit === 3 && autopilot.generationPlan.completedAnchorCount === 1 && JSON.stringify(autopilot.generationPlan.nextAnchorAssetIds) === JSON.stringify(["glyph-board-ai-taste", "glyph-board-control-not-restart"]));
check("review-does-not-dispatch-or-open-downstream", reviewed.production.generation.automaticDispatchAllowed === false && autopilot.gates.generationDispatchAllowed === false && autopilot.gates.shotCompositionAllowed === false && autopilot.gates.renderAllowed === false && reviewed.gates.shotCompositionAllowed === false && reviewed.gates.finalRenderAllowed === false);

const recommendation = autopilot.recommendation;
let adopted = applyAutopilotCandidateSelection(reviewed, recommendation.assetId, recommendation.recommendedCandidateId, "2026-07-30T15:00:01.000Z");
adopted = updateEditorialAsset(adopted, recommendation.assetId, {action: "approve", note: "test explicit adoption"}, "2026-07-30T15:00:01.100Z");
let queuedJobCount = 0;
for (const assetId of autopilot.generationPlan.nextAnchorAssetIds) {
  const queued = queueAssetGeneration(adopted, assetId, "2026-07-30T15:00:01.200Z");
  adopted = queued.workspace;
  queuedJobCount += queued.jobs.length;
}
adopted.production.generation.automaticDispatchAllowed = true;
adopted.production.autopilot.status = "generating-next-anchors";
adopted.production.autopilot.gates.generationDispatchAllowed = true;
adopted = recalculateEditorialAssetWorkbench(adopted, "2026-07-30T15:00:01.300Z");
assertEditorialAssetWorkbench(adopted);
check("one-explicit-adoption-queues-two-four-direction-batches", queuedJobCount === 8 && adopted.production.generation.summary.queued === 8 && new Set(adopted.production.generation.jobs.filter((job) => job.status === "queued").map((job) => job.candidateId)).size === 8);
check("authorized-auto-dispatch-stays-concurrency-two", adopted.production.generation.automaticDispatchAllowed === true && adopted.policy.automaticDispatchAllowed === true && adopted.production.generation.concurrency === 2);
check("adoption-still-locks-shot-motion-and-render", adopted.gates.shotCompositionAllowed === false && adopted.gates.motionPrototypeAllowed === false && adopted.gates.finalRenderAllowed === false);

const failures = results.filter((item) => item.status === "FAIL");
console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", results, failures: failures.map((item) => item.id)}, null, 2));
if (failures.length) process.exitCode = 1;
