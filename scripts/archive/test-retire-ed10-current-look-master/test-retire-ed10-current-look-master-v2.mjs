#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {activeEd10OldArtifactReferences, ED10_RETIRED_ARTIFACT_SHA256, retireEd10CurrentLookMaster} from "../apps/studio-next/src/lib/a1-ed10-current-look-master-retirement-v2.mjs";
import {deriveProductionAuthority} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const alternativeBefore = current.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === "ED-10" && item.artifact?.sha256 === "4ffd636d05a60503edcaa9a6a605898aefbf73974521f6a6f141963b7a370e9f");
assert.ok(alternativeBefore, "known alternative candidate must exist before retirement");
const alreadyRetired = current.production.shotIntelligence.retiredLookMasterArtifacts?.some((item) => item.artifactSha256 === ED10_RETIRED_ARTIFACT_SHA256 && item.selectionEligible === false);
const next = alreadyRetired
  ? current
  : assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(
      retireEd10CurrentLookMaster(current, {now: "2026-08-20T03:30:00.000Z", userQuote: "当前图是旧版本，不再作为当前版本使用。", expectedWorkspaceSha256: current.workspaceSha256}).workspace,
      "2026-08-20T03:30:00.000Z",
    ));
assert.deepEqual(activeEd10OldArtifactReferences(next), []);
const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
assert.equal(plan.selectedLookMasterId, null);
assert.equal(plan.provisionalWholeFilmBoardSelection, null);
assert.equal(plan.selectedLookMasterBinding, null);
assert.equal(plan.systemSelection, null);
const retiredRaw = next.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === "ED-10" && item.artifact?.sha256 === ED10_RETIRED_ARTIFACT_SHA256);
assert.equal(retiredRaw.current, false);
assert.equal(retiredRaw.selectionEligible, false);
assert.equal(retiredRaw.cacheReadmissionAllowed, false);
const alternativeAfter = next.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === "ED-10" && item.artifact?.sha256 === alternativeBefore.artifact.sha256);
assert.equal(alternativeAfter.status, alternativeBefore.status, "alternative candidate status must be preserved");
assert.equal(alternativeAfter.current, alternativeBefore.current, "alternative candidate current flag must be preserved");
assert.equal(next.production.shotIntelligence.visualReplacement.status, "IN_PROGRESS");
assert.equal(next.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
assert.equal(next.production.generation.summary.queued, 0);
assert.equal(next.production.generation.summary.running, 0);
const authority = deriveProductionAuthority(next);
assert.equal(authority.currentStage, "ed10-look-master-replacement-review");
assert.equal(authority.nextAction.id, "review-existing-ed10-replacement-candidates");
assert.equal(authority.nextAction.requiresUser, true);
console.log(JSON.stringify({status: "PASS", workspaceSha256: current.workspaceSha256, activeOldArtifactReferences: [], alternativePreserved: alternativeAfter.artifact.sha256}, null, 2));
