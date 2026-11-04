#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {approveEd10DirectionCForEditableTypographyRebuild, assertEd10LookMasterCandidateAuthority, bindEd10DirectionCForExplicitReview, ED10_DIRECTION_C_SHA256} from "../apps/studio-next/src/lib/a1-ed10-look-master-candidate-authority-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(path.join(projectRoot, "apps/studio-next")));
const reviewFixture = structuredClone(workspace);
reviewFixture.production.shotIntelligence.visualReplacement = {
  ...reviewFixture.production.shotIntelligence.visualReplacement,
  status: "AWAITING_USER_LOOK_MASTER_REVIEW",
  stopAtUserLookMasterReview: true,
  noLayerReconstruction: true,
  layerReconstructionStarted: false,
};
const bound = bindEd10DirectionCForExplicitReview(reviewFixture, {now: "2026-08-20T00:00:00.000Z", userQuote: "c 还行 符合整体美学吧", projectRoot});
const authority = assertEd10LookMasterCandidateAuthority(bound.authority, {projectRoot});
const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(bound.workspace, "2026-08-20T00:00:00.000Z"));
const plan = recalculated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10");

assert.equal(authority.candidate.sha256, ED10_DIRECTION_C_SHA256);
assert.equal(authority.userVisualApproval, "NOT_APPROVED");
assert.equal(authority.typographyRoute.generatedRasterTextAcceptedAsCanonical, false);
assert.equal(authority.typographyRoute.editableLayerCandidateSha256, null);
assert.equal(plan.activeCandidateSet.candidateIds.length, 1);
assert.equal(plan.selectedLookMasterId, null);
assert.equal(recalculated.production.generation.summary.queued, 0);
assert.equal(recalculated.production.generation.summary.running, 0);
assert.equal(recalculated.production.generation.workerStatus, "frozen");
assert.throws(() => assertEd10LookMasterCandidateAuthority(authority, {projectRoot, requireExplicitApproval: true}), /explicit-visual-approval-required/u);
assert.throws(() => assertEd10LookMasterCandidateAuthority({...authority, candidate: {...authority.candidate, sha256: "0".repeat(64)}}, {projectRoot}), /identity-invalid/u);

const approved = approveEd10DirectionCForEditableTypographyRebuild(bound.workspace, {now: "2026-08-20T00:01:00.000Z", userQuote: "确认 批准了", projectRoot});
const approvedAuthority = assertEd10LookMasterCandidateAuthority(approved.authority, {projectRoot, requireExplicitApproval: true});
const approvedRecalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(approved.workspace, "2026-08-20T00:01:00.000Z"));
assert.equal(approvedAuthority.userVisualApproval, "APPROVED_DIRECTION_FOR_EDITABLE_TYPOGRAPHY_REBUILD");
assert.equal(approvedAuthority.layerReconstructionAllowed, true);
assert.equal(approvedAuthority.productionAdmission, false);
assert.equal(approvedAuthority.assemblyAllowed, false);
assert.equal(approvedAuthority.approval.quote, "确认 批准了");
assert.equal(approvedRecalculated.production.authority.nextAction.id, "build-ed10-direction-c-eva-editable-layer-and-actual-pixel-proof");
assert.equal(approvedRecalculated.production.generation.summary.queued, 0);
assert.equal(approvedRecalculated.production.generation.summary.running, 0);

console.log(JSON.stringify({status: "PASS", candidateSha256: authority.candidate.sha256, userVisualApproval: authority.userVisualApproval, approvedUserVisualApproval: approvedAuthority.userVisualApproval, approvedNextAction: approvedRecalculated.production.authority.nextAction.id, typographyRouteStatus: authority.typographyRoute.status, generatedImages: false, mediaRenderPerformed: false}, null, 2));
