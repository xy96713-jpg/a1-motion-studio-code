#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const workspace = JSON.parse(fs.readFileSync(path.join(phaseRoot, "workspace.json"), "utf8"));
const workspaceReport = JSON.parse(fs.readFileSync(path.join(phaseRoot, "report.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(phaseRoot, "research-mode-candidate-authority-reconciliation-v1/report.json"), "utf8"));
const runtime = workspace.production.shotIntelligence;

assert.equal(report.status, "HISTORY_READ_ONLY");
assert.equal(report.current, false);
assert.notEqual(report.workspaceSha256After, workspace.workspaceSha256);
assert.notEqual(report.supersededBy?.currentWorkspaceSha256, workspace.workspaceSha256, "an old report must not masquerade as the current workspace");
assert.equal(report.authorityScope, "HISTORY_READ_ONLY");
assert.equal(runtime.wholeFilmBatchRecommendation.status, "COMPLETE");
// The research reconciliation may be complete, but it still cannot unlock
// Assembly before the user approves the whole-film static board.
assert.equal(runtime.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
assert.equal(runtime.wholeFilmBatchRecommendation.exceptions.length, 0);
assert.equal(runtime.wholeFilmBatchRecommendation.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
assert.equal(runtime.wholeFilmStaticBoard.status, "PENDING_USER_APPROVAL");
assert.equal(runtime.wholeFilmStaticBoard.decision, null);
assert.equal(workspace.production.visualProductionRun.status, "WHOLE_FILM_STATIC_BOARD_READY");
assert.equal(workspace.production.authority.currentStage, "whole-film-static-board-review");
assert.equal(workspace.production.authority.nextAction.id, "review-whole-film-static-board");
assert.match(workspace.status, /^PACKAGING_LANE_/u);
assert.equal(workspaceReport.workspaceSha256, workspace.workspaceSha256);

const ed14 = runtime.decisionSet.items.find((item) => item.shotId === "ED-14");
const ed14Packet = runtime.researchPackets.find((item) => item.shotId === "ED-14");
const ed14Plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-14");
for (const value of [ed14.sourceText, ed14Plan.semanticJob, ed14Plan.viewerTakeaway]) {
  assert.doesNotMatch(value, /默认路径|低风险路径|优先走常见、稳妥、可复用|优先选择低风险、可复用/iu);
}
assert.match(ed14.sourceText, /英文新闻样本/u);
assert.match(ed14.sourceText, /词汇多样性下降尤其明显/u);
assert.equal(ed14Packet.claimBoundary.status, "BOUND");
assert.equal(ed14Packet.researchReadiness.status, "READY");
assert.equal(ed14Plan.claimBoundaryPolicyVersion, 1);
assert.equal(ed14Plan.claimBoundary.status, "BOUND");
if (ed14Plan.provisionalWholeFilmBoardSelection?.artifact?.sha256) {
  const selectedEd14Raw = runtime.lookMasterRawReferences.find((raw) => raw.shotId === "ED-14" && raw.planSha256 === ed14Plan.planSha256 && raw.artifact?.sha256 === ed14Plan.provisionalWholeFilmBoardSelection.artifact.sha256);
  assert.equal(selectedEd14Raw?.recommendationEligible, true);
  assert.equal(selectedEd14Raw?.selectionEligible, true);
  assert.equal(selectedEd14Raw?.assemblyEligible, true);
  assert.equal(selectedEd14Raw?.semanticPixelAudit?.researchAudit?.status, "PASS");
}

for (const shotId of ["ED-09", "ED-17", "ED-19"]) {
  const decision = runtime.decisionSet.items.find((item) => item.shotId === shotId);
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const context = runtime.videoPackagingContexts.items.find((item) => item.shotId === shotId);
  assert.equal(decision.presentationMode, decision.assemblyMode);
  if (decision.modeBinding) assert.equal(decision.modeBinding.status, "PASS");
  assert.equal(plan.assemblyMode, decision.assemblyMode);
  assert.equal(plan.presentationMode, decision.presentationMode);
  if (plan.modeBinding) assert.equal(plan.modeBinding.status, "PASS");
  assert.equal(context.assemblyMode, decision.assemblyMode);
  assert.equal(context.presentationMode, decision.presentationMode);
  assert.equal(plan.videoContext.contextSha256, context.contextSha256);
}

const eligible = runtime.lookMasterRawReferences.filter((raw) => raw.recommendationEligible === true || raw.selectionEligible === true);
assert.ok(eligible.length > 0);
for (const raw of eligible) {
  assert.equal(raw.candidateAuditAuthority?.status, "PASS");
  assert.equal(raw.pixelAudit?.status, "PASS");
  assert.equal(raw.pixelAudit?.admissionAllowed, true);
  assert.equal(raw.pixelAudit?.footageCompatibility?.status, "PASS");
  assert.equal(raw.semanticPixelAudit?.status, "PASS");
  assert.equal(raw.semanticPixelAudit?.recommendationEligible, true);
  assert.equal(raw.current !== false, true);
  assert.equal(raw.assemblyEligible, true);
  assert.equal(raw.serverVisualAssessment?.status, "PASS");
}
const currentEd34Plan = runtime.packageLookMasterPlans.find((plan) => plan.shotId === "ED-34");
const staleEd34 = runtime.lookMasterRawReferences.find((raw) => raw.shotId === "ED-34"
  && (raw.current === false || raw.planSha256 !== currentEd34Plan?.planSha256));
assert.ok(staleEd34, "ED-34 must retain a historical raw candidate for the stale-binding regression");
assert.notEqual(staleEd34.recommendationEligible, true, "an ED-34 raw candidate without current binding cannot be eligible");

const ed01 = runtime.decisionSet.items.find((item) => item.shotId === "ED-01");
assert.equal(ed01.packageDecision, "NO_PACKAGE");
assert.equal(ed01.sequenceReview.localPackageDecision, "NO_PACKAGE");
assert.equal(ed01.sequenceReview.packageSuppressedReason, null);
assert.equal(ed01.sequenceReview.claimAssociation.method, "PRODUCT_TO_OPERATION_BRIDGE");
assert.equal(ed01.sequenceReview.claimAssociation.candidateRecall, true);
assert.equal(ed01.sequenceReview.claimAssociation.suppressionEligible, false);

assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(runtime.currentAssembly.length, 0);
assert.equal(runtime.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
assert.equal(runtime.wholeFilmBatchRecommendation.criticAllowed, false);
assert.equal(runtime.wholeFilmBatchRecommendation.motionAllowed, false);

console.log(JSON.stringify({contract: "A1LiveResearchModeCandidateAuthorityTest/v1", status: "PASS", workspaceSha256: workspace.workspaceSha256, lifecycle: runtime.wholeFilmBatchRecommendation.nextUserGate, eligibleCandidateCount: eligible.length, checks: {historicalReportIsolated: true, ed14ClaimNarrowed: true, modeBindingsCurrent: true, candidateAuthoritySingleSource: true, ed34Revoked: true, ed01Truthful: true, staticBoardPendingUserApproval: true, downstreamLocked: true}}, null, 2));
