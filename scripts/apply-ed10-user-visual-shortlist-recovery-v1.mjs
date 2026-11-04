#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha = process.env.A1_ED10_EXPECTED_WORKSPACE_SHA || "98092133b317e22c76e62ebf67ad37e660fe8bc0bf334b4055a34150c2138ca8";
const recordedAt = process.env.A1_ED10_SHORTLIST_RECORDED_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const shortlistDirections = ["direction-02", "direction-04"];
const nonPriorityDirections = ["direction-01", "direction-03"];
const shortlistLabel = "C02/C04";
const recoveredStatus = "RECOVERED_EXISTING_LOOK_MASTER_CANDIDATES";
const shortlistStatus = "USER_SCREENED_SHORTLIST_PENDING_FINAL_CONFIRMATION";

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha) throw new Error(`ed10-shortlist-workspace-sha-mismatch:${current.workspaceSha256}`);
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  if (!plan || runtime.status !== "LOOK_MASTER_REVIEW_REQUIRED" || plan.status !== "LOOK_MASTER_REVIEW_REQUIRED") throw new Error("ed10-look-master-review-authority-required");
  const discovery = plan.fastCandidateDiscovery;
  const explorationCandidates = plan.explorationCandidates || discovery?.candidates || [];
  if (!discovery || explorationCandidates.length !== 4) throw new Error("ed10-four-existing-look-master-candidates-required");
  const rawBySha = new Map((runtime.lookMasterRawReferences || []).map((reference) => [reference.artifact?.sha256, reference]));

  const candidateByDirection = new Map(explorationCandidates.map((candidate) => [candidate.directionId, candidate]));
  for (const directionId of [...shortlistDirections, ...nonPriorityDirections]) {
    if (!candidateByDirection.get(directionId)?.artifact?.sha256) throw new Error(`ed10-existing-candidate-missing:${directionId}`);
  }
  const previousAutomaticRanking = discovery.historicalAutomaticRanking || {
    status: discovery.recommendationStatus || null,
    recommendedDirectionId: discovery.recommendedDirectionId || null,
    recommendedCandidateId: discovery.recommendedCandidateId || null,
    effectiveDirectionCount: discovery.effectiveDirectionCount || null,
    effectiveCandidateIds: discovery.effectiveCandidateIds || null,
    rankingArtifactSha256: discovery.rankingArtifactSha256 || null,
    advisoryOnly: true,
    preservedAt: recordedAt,
  };
  discovery.historicalAutomaticRanking = previousAutomaticRanking;
  discovery.automaticEffectiveDirectionCount = previousAutomaticRanking.effectiveDirectionCount;
  discovery.automaticEffectiveCandidateIds = previousAutomaticRanking.effectiveCandidateIds;
  discovery.explorationCandidateCount = explorationCandidates.length;
  discovery.userScreenedShortlistCount = shortlistDirections.length;
  discovery.userScreenedNonPriorityCount = nonPriorityDirections.length;
  discovery.userScreenedShortlistDirections = shortlistDirections;
  discovery.userScreenedNonPriorityDirections = nonPriorityDirections;
  discovery.userScreenedShortlistCandidateIds = shortlistDirections.map((directionId) => candidateByDirection.get(directionId).candidateId);
  discovery.userScreenedNonPriorityCandidateIds = nonPriorityDirections.map((directionId) => candidateByDirection.get(directionId).candidateId);
  discovery.candidateStatus = recoveredStatus;
  discovery.recommendationStatus = shortlistStatus;
  discovery.recommendedDirectionId = null;
  discovery.recommendedCandidateId = null;
  discovery.effectiveDirectionCount = shortlistDirections.length;
  discovery.effectiveCandidateIds = discovery.userScreenedShortlistCandidateIds;
  discovery.userScreening = {
    contract: "A1UserVisualLookMasterScreening/v1",
    status: shortlistStatus,
    source: "USER_PRIOR_VISUAL_JUDGMENT",
    note: "用户此前明确：2、4 可以，1、3 一般般。C02/C04 保留为当前有效 shortlist；不在二者之间自动选择。",
    shortlistLabel,
    shortlistedDirectionIds: shortlistDirections,
    nonPriorityDirectionIds: nonPriorityDirections,
    recordedAt,
  };
  const discoveryHashInput = structuredClone(discovery);
  delete discoveryHashInput.discoverySha256;
  delete discoveryHashInput.generatedAt;
  discovery.discoverySha256 = sha256(discoveryHashInput);

  for (const candidate of explorationCandidates) {
    const isShortlisted = shortlistDirections.includes(candidate.directionId);
    const rawReference = rawBySha.get(candidate.artifact?.sha256);
    candidate.userVisualDisposition = isShortlisted ? "USER_SCREENED_SHORTLIST" : "SEEN_NOT_PRIORITY";
    candidate.userVisualDispositionLabel = isShortlisted ? "用户初筛可用 · 待最终母版确认" : "已看过但非优先";
    candidate.userVisualDispositionSource = "USER_PRIOR_VISUAL_JUDGMENT";
    candidate.userVisualDispositionRecordedAt = recordedAt;
    candidate.candidateProvenance = "EXISTING_GENERATED_CANDIDATE";
    candidate.existingGenerationTime = rawReference?.artifact?.generatedAt || null;
    candidate.existingCandidateRecordedAt = rawReference?.createdAt || null;
  }

  const activeCandidateSet = plan.activeCandidateSet;
  activeCandidateSet.status = "PENDING_USER_LOOK_MASTER_REVIEW";
  activeCandidateSet.source = "fastCandidateDiscovery";
  activeCandidateSet.candidateCount = shortlistDirections.length;
  activeCandidateSet.effectiveDirectionCount = shortlistDirections.length;
  activeCandidateSet.directionIds = shortlistDirections;
  activeCandidateSet.candidateIds = discovery.userScreenedShortlistCandidateIds;
  activeCandidateSet.candidates = explorationCandidates
    .filter((candidate) => shortlistDirections.includes(candidate.directionId))
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      directionId: candidate.directionId,
      artifactSha256: candidate.artifact.sha256,
      artifactPublicUrl: candidate.artifact.publicUrl,
      compositePublicUrl: candidate.compositePreview?.publicUrl || null,
      status: "USER_SCREENED_SHORTLIST",
    }));
  activeCandidateSet.selectedDirectionId = null;
  activeCandidateSet.selectedCandidateId = null;
  activeCandidateSet.reviewSha256 = null;
  activeCandidateSet.recommendationStatus = shortlistStatus;
  activeCandidateSet.userScreening = discovery.userScreening;
  plan.recommendation = null;
  plan.selectedLookMasterId = null;
  plan.selectedLookMasterBinding = null;
  plan.userVisualScreening = discovery.userScreening;
  plan.currentCandidateSource = {
    contract: "A1CurrentPackageCandidateSource/v1",
    source: "fastCandidateDiscovery",
    status: recoveredStatus,
    candidateProvenance: "EXISTING_GENERATED_CANDIDATES",
    existingCandidateCount: explorationCandidates.length,
    currentShortlistCount: shortlistDirections.length,
    shortlistLabel,
    legacySelectorDisabled: true,
  };
  plan.candidateDirectionAuthority = "USER_VISUAL_SCREENING_SHORTLIST_PENDING_FINAL_CONFIRMATION";
  runtime.currentCandidateSource = {
    contract: "A1CurrentPackageCandidateSource/v1",
    status: recoveredStatus,
    source: "fastCandidateDiscovery",
    shotIds: ["ED-10"],
    candidateProvenance: "EXISTING_GENERATED_CANDIDATES",
    existingCandidateCount: explorationCandidates.length,
    currentShortlistCount: shortlistDirections.length,
    shortlistLabel,
    legacySelectorsDisabled: true,
  };
  runtime.updatedAt = recordedAt;
  next.production.packagingReview = {
    ...next.production.packagingReview,
    status: "LOOK_MASTER_REVIEW_REQUIRED",
    currentDecision: null,
    currentShotId: null,
    binding: null,
    requiresExplicitApproval: true,
    userApprovalStatus: "USER_SCREENED_LOOK_MASTER_FINAL_CONFIRMATION_REQUIRED",
    nextAction: "review-user-screened-look-master-shortlist",
    updatedAt: recordedAt,
  };
  next.production.authority = {
    ...next.production.authority,
    nextAction: {
      id: "review-user-screened-look-master-shortlist",
      label: "审阅用户初筛保留的 C02/C04；最终确认母版后才允许进入 Assembly",
      requiresUser: true,
      targetShotIds: ["ED-10"],
    },
  };
  next.production.shotIntelligence = runtime;
  const recalculated = recalculateEditorialAssetWorkbench(next, recordedAt);
  assertEditorialAssetWorkbench(recalculated);
  const event = createProductionEvent({
    workspace: recalculated,
    action: "record-ed10-user-visual-shortlist",
    targetId: "ED-10",
    payload: {
      sourceWorkspaceSha256: current.workspaceSha256,
      candidateProvenance: "EXISTING_GENERATED_CANDIDATES",
      explorationCandidateCount: explorationCandidates.length,
      shortlistedDirections: shortlistDirections,
      nonPriorityDirections,
      shortlistedCandidateIds: discovery.userScreenedShortlistCandidateIds,
      nonPriorityCandidateIds: discovery.userScreenedNonPriorityCandidateIds,
      candidateArtifactSha256: explorationCandidates.map((candidate) => candidate.artifact.sha256),
      originalGenerationTimes: explorationCandidates.map((candidate) => ({candidateId: candidate.candidateId, artifactSha256: candidate.artifact.sha256, rawReferenceId: candidate.rawReferenceId})),
      automaticRankingPreservedAsAdvisory: previousAutomaticRanking,
    },
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {event});
  console.log(JSON.stringify({
    status: "PASS",
    workspaceSha256: recalculated.workspaceSha256,
    eventId: event.eventId,
    candidateProvenance: "EXISTING_GENERATED_CANDIDATES",
    existingCandidateCount: explorationCandidates.length,
    shortlistLabel,
    shortlistDirections,
    nonPriorityDirections,
    recommendation: null,
    runtimeStatus: recalculated.production.shotIntelligence.status,
    userApprovalStatus: recalculated.production.packagingReview.userApprovalStatus,
  }, null, 2));
});
