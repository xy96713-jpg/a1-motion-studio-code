#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const live = assertEditorialAssetWorkbench(JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8")));
const failures = [];
const check = (id, pass, evidence = "") => {
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${evidence ? ` :: ${evidence}` : ""}`);
  if (!pass) failures.push(id);
};

const target = live.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-17");
const selectedCandidate = target?.candidates?.find((candidate) => candidate.candidateId === target.selectedCandidateId) || target?.candidates?.[0];
const boundMaterialIds = new Set(selectedCandidate?.sceneGraph?.approvedMaterialIds || []);
const unrelated = live.library.assets.find((asset) => asset.stageId !== "shot-composition" && !boundMaterialIds.has(asset.id));
check("fixture-has-approved-shot-and-unrelated-material", Boolean(target?.selectedCandidateId && unrelated), `${target?.shotDemand?.shotId}/${unrelated?.id || "missing"}`);

if (target && selectedCandidate && unrelated) {
  const unrelatedChange = structuredClone(live);
  const targetClone = unrelatedChange.library.assets.find((asset) => asset.id === target.id);
  for (const candidate of targetClone.candidates) delete candidate.sourceDependencySha256;
  targetClone.contentSha256 = editorialAssetContentSha256(targetClone);
  targetClone.review.approvedContentSha256 = targetClone.contentSha256;
  // Change the global visual-bible hash without touching a material bound to
  // ED-17. This simulates a new article-wide direction while keeping the
  // shot's actual evidence dependencies stable.
  unrelatedChange.visualBible = {...unrelatedChange.visualBible, fixtureRevision: "unrelated-checkpoint-change"};
  unrelatedChange.production.generation.workerStatus = "rendering";
  const preserved = recalculateEditorialAssetWorkbench(unrelatedChange, "2026-08-02T06:30:00.000Z");
  const preservedTarget = preserved.library.assets.find((asset) => asset.id === target.id);
  const checkpoint = preserved.production.incrementalReviewCheckpoint;
  check("unrelated-asset-change-preserves-shot-candidates", preservedTarget.candidates.length === target.candidates.length, `${target.candidates.length}->${preservedTarget.candidates.length}`);
  check("unrelated-asset-change-preserves-selected-candidate", preservedTarget.selectedCandidateId === target.selectedCandidateId && preservedTarget.review.status === "approved", `${preservedTarget.selectedCandidateId}/${preservedTarget.review.status}`);
  check("checkpoint-does-not-rebuild-unrelated-shot", !checkpoint.invalidatedShotIds.includes(target.shotDemand.shotId) && checkpoint.scope === "unchanged" && checkpoint.preservedSelectedShotIds.includes(target.shotDemand.shotId), JSON.stringify(checkpoint));
  check("authority-exposes-incremental-checkpoint", preserved.production.authority.incrementalReviewCheckpoint?.contract === "A1IncrementalShotReviewCheckpoint/v1", preserved.production.authority.incrementalReviewCheckpoint?.scope);
  check("best-effect-repair-is-bounded-to-one-shot-batch", preserved.production.authority.nextAction.batchSize === 6 && preserved.production.authority.nextAction.targetShotIds.length <= 6 && preserved.production.authority.nextAction.targetShotIds.length < preserved.article.shotCount, JSON.stringify(preserved.production.authority.nextAction));
  check("empty-queue-clears-stale-worker-status", preserved.production.generation.workerStatus === "idle", preserved.production.generation.workerStatus);

  const boundChange = structuredClone(live);
  const boundMaterial = boundChange.library.assets.find((asset) => asset.id === [...boundMaterialIds][0]);
  if (boundMaterial) boundMaterial.promptBrief = `${boundMaterial.promptBrief || "fixture"} bound-checkpoint-change`;
  const invalidated = recalculateEditorialAssetWorkbench(boundChange, "2026-08-02T06:31:00.000Z");
  const invalidatedTarget = invalidated.library.assets.find((asset) => asset.id === target.id);
  check("bound-material-change-invalidates-only-dependent-shot", invalidated.production.incrementalReviewCheckpoint.invalidatedShotIds.includes(target.shotDemand.shotId) && invalidatedTarget.selectedCandidateId === null, JSON.stringify(invalidated.production.incrementalReviewCheckpoint));
}

if (failures.length) {
  console.error(`incremental-shot-review-checkpoint-test-failed:${failures.join(",")}`);
  process.exit(1);
}
console.log("A1IncrementalShotReviewCheckpoint/v1 PASS");
