#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha = process.env.A1_ED10_EXPECTED_WORKSPACE_SHA || "d860bc931c9857d53326bf732c84976e91ad944cd010c28358486df9447b9aaf";
const now = process.env.A1_ED10_RESTORE_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const historyReason = "unauthorized-presenter-first-reentry-after-look-master-stop";

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha) throw new Error(`ed10-mirror-workspace-sha-mismatch:${current.workspaceSha256}`);
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  if (!plan || runtime.status !== "LOOK_MASTER_REVIEW_REQUIRED" || plan.status !== "LOOK_MASTER_REVIEW_REQUIRED") throw new Error("ed10-look-master-review-authority-required");
  const rankingPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/ed10-look-master-fast-discovery-v1/ranking.json");
  const ranking = JSON.parse(fs.readFileSync(rankingPath, "utf8"));
  const discovery = plan.fastCandidateDiscovery;
  if (!discovery || discovery.candidates?.length !== 4) throw new Error("ed10-current-four-candidate-discovery-required");
  discovery.status = "LOOK_MASTER_REVIEW_REQUIRED";
  discovery.candidateStatus = ranking.candidateStatus || "ACTUAL_LOOK_MASTER_CANDIDATES";
  discovery.recommendationStatus = ranking.recommendationStatus || "AUTO_RANKED_PENDING_USER_LOOK_MASTER_REVIEW";
  discovery.recommendedDirectionId = ranking.recommended?.directionId || "direction-01";
  discovery.recommendedCandidateId = ranking.recommended?.candidateId || discovery.candidates[0]?.candidateId || null;
  discovery.effectiveDirectionCount = 4;
  discovery.rankingArtifactSha256 = sha256(fs.readFileSync(rankingPath));
  const discoveryHashInput = structuredClone(discovery);
  delete discoveryHashInput.discoverySha256;
  delete discoveryHashInput.generatedAt;
  discovery.discoverySha256 = sha256(discoveryHashInput);

  // The former comparative board selected direction-02 for the unauthorized
  // presenter-first route. Keep it auditable, but make the four-image fast
  // discovery artifact the only current review source.
  if (plan.comparativeReviewBoard) plan.historicalPresenterFirstComparativeReviewBoard ||= {...structuredClone(plan.comparativeReviewBoard), status: "HISTORY_READ_ONLY", current: false, historyReadOnly: true, advisoryOnly: true, supersededReason: historyReason, supersededAt: now};
  if (plan.comparativeReview) plan.historicalPresenterFirstComparativeReview ||= {...structuredClone(plan.comparativeReview), status: "HISTORY_READ_ONLY", current: false, historyReadOnly: true, advisoryOnly: true, supersededReason: historyReason, supersededAt: now};
  if (plan.portfolioAudit) plan.historicalPresenterFirstPortfolioAudit ||= {...structuredClone(plan.portfolioAudit), status: "HISTORY_READ_ONLY", current: false, historyReadOnly: true, advisoryOnly: true, supersededReason: historyReason, supersededAt: now};
  plan.comparativeReviewBoard = null;
  plan.comparativeReview = null;
  plan.portfolioAudit = null;
  plan.activeCandidateSet.reviewSha256 = null;
  plan.activeCandidateSet.status = "PENDING_USER_LOOK_MASTER_REVIEW";
  plan.activeCandidateSet.selectedDirectionId = null;
  plan.activeCandidateSet.selectedCandidateId = null;
  plan.activeCandidateSet.recommendationStatus = "AUTO_RANKED_PENDING_USER_LOOK_MASTER_REVIEW";
  plan.selectedLookMasterId = null;
  plan.selectedLookMasterBinding = null;
  plan.recommendation = null;
  plan.currentCandidateSource = {contract: "A1CurrentPackageCandidateSource/v1", source: "fastCandidateDiscovery", legacySelectorDisabled: true};
  plan.candidateDirectionAuthority = "FAST_CANDIDATE_DISCOVERY_PENDING_USER_REVIEW";
  runtime.currentCandidateSource = {contract: "A1CurrentPackageCandidateSource/v1", status: "ACTIVE", source: "fastCandidateDiscovery", shotIds: ["ED-10"], legacySelectorsDisabled: true};
  runtime.updatedAt = now;
  next.production.packagingReview = {
    ...next.production.packagingReview,
    status: "LOOK_MASTER_REVIEW_REQUIRED",
    currentDecision: null,
    currentShotId: null,
    binding: null,
    requiresExplicitApproval: true,
    userApprovalStatus: "RECOMMENDED_LOOK_MASTER_CONFIRMATION_REQUIRED",
    nextAction: "review-recommended-package-look-master",
    updatedAt: now,
  };
  next.production.authority = {
    ...next.production.authority,
    nextAction: {
      id: "review-recommended-package-look-master",
      label: "审阅 ED-10 四个完整 Look Master 候选；确认母版后才允许进入 Assembly",
      requiresUser: true,
      targetShotIds: ["ED-10"],
    },
  };
  next.production.shotIntelligence = runtime;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  assertEditorialAssetWorkbench(recalculated);
  const event = createProductionEvent({
    workspace: recalculated,
    action: "refresh-ed10-look-master-review-mirrors",
    targetId: "ED-10",
    payload: {
      sourceWorkspaceSha256: current.workspaceSha256,
      rankingArtifactSha256: discovery.rankingArtifactSha256,
      candidateIds: plan.activeCandidateSet.candidateIds,
      candidateArtifactSha256: plan.explorationCandidates.map((candidate) => candidate.artifact.sha256),
      recommendationStatus: discovery.recommendationStatus,
      recommendedDirectionId: discovery.recommendedDirectionId,
      currentStatus: runtime.status,
      historyReason,
    },
  });
  persistProjectState(appRoot, recalculated, {event});
  console.log(JSON.stringify({
    status: "PASS",
    workspaceSha256: recalculated.workspaceSha256,
    eventId: event.eventId,
    runtimeStatus: runtime.status,
    discoveryStatus: discovery.status,
    candidateCount: discovery.effectiveDirectionCount,
    recommendationStatus: discovery.recommendationStatus,
    recommendedDirectionId: discovery.recommendedDirectionId,
    rankingArtifactSha256: discovery.rankingArtifactSha256,
    automation: recalculated.production.packagingAutomation,
  }, null, 2));
});
