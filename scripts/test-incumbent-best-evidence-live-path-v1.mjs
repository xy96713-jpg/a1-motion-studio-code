import assert from "node:assert/strict";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {finalizeWholeFilmLookMasterBatch} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";

const workspace = readProjectWorkspace("./apps/studio-next");
const workspaceShaBefore = workspace.workspaceSha256;
const dryRun = finalizeWholeFilmLookMasterBatch(structuredClone(workspace), workspace.production.shotVisualCoveragePlan, {
  now: "2026-08-17T04:00:00.000Z",
});
const gateRows = dryRun.workspace.production.shotIntelligence.packageLookMasterPlans
  .map((plan) => ({
    shotId: plan.shotId,
    decision: plan.wholeFilmBoardRecommendation?.incumbentBestEvidenceGate?.decision || null,
    recommendationStatus: plan.wholeFilmBoardRecommendation?.status || null,
  }))
  .filter((row) => row.decision);

assert.ok(gateRows.length > 0, "live finalize path must emit at least one incumbent gate decision");
assert.ok(gateRows.every((row) => ["NO_INCUMBENT_REPLACE", "REPLACE_INCUMBENT", "KEEP_INCUMBENT"].includes(row.decision)));
assert.ok(gateRows.some((row) => row.decision === "KEEP_INCUMBENT"), "current production fixture must exercise incumbent preservation");
assert.equal(workspace.workspaceSha256, workspaceShaBefore, "incumbent dry-run must not mutate the source workspace");
assert.equal(dryRun.workspace.workspaceSha256, workspaceShaBefore, "finalize dry-run must preserve workspace identity");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1IncumbentBestEvidenceGateLivePathTest/v1",
  dryRunOnly: true,
  workspaceSha: workspaceShaBefore,
  gateDecisionCount: gateRows.length,
  keepIncumbentShotIds: gateRows.filter((row) => row.decision === "KEEP_INCUMBENT").map((row) => row.shotId),
  replaceIncumbentShotIds: gateRows.filter((row) => row.decision === "REPLACE_INCUMBENT").map((row) => row.shotId),
}, null, 2));
