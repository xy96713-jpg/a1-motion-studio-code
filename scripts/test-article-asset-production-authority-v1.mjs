#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority, assertBackgroundCandidateExecutionPolicy, assertBackgroundLaneRequestPack} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const laneRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const authority = assertArticleAssetProductionAuthority(workspace.production.articleAssetProductionAuthority);
const styleDna = readJson(path.join(laneRoot, "style-dna.json"));
const styleBriefSet = readJson(path.join(laneRoot, "style-briefs.json"));
const requestPack = assertBackgroundLaneRequestPack(readJson(path.join(laneRoot, "request-pack.json")), {appRoot, styleDna, styleBriefs: styleBriefSet.briefs});
const execution = readExecutionStatus(appRoot);

const expectedStage = authority.status === "BACKGROUND_CANDIDATE_GENERATING"
  ? "article-asset-background-candidate-generation"
  : authority.status === "BACKGROUND_PIXELS_READY_FOR_USER_REVIEW"
    ? "article-asset-background-actual-pixel-review"
    : authority.status === "BACKGROUND_LIBRARY_EXPANSION_ACTIVE"
      ? "article-asset-background-open-library-expansion"
    : authority.status === "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW"
      ? "article-asset-background-wave-actual-pixel-review"
    : "article-asset-background-request-review";
if (workspace.status !== authority.status || workspace.production.authority.currentStage !== expectedStage || workspace.production.authority.nextAction.id !== authority.authorization.nextAction || workspace.production.authority.nextAction.requiresUser !== authority.authorization.requiresUser) throw new Error("article-asset-production-authority-current-state-invalid");
if (authority.authorization.requestPackSha256 !== requestPack.requestPackSha256 || requestPack.requests.length !== 2) throw new Error("article-asset-production-authority-request-binding-invalid");
if (workspace.production.articlePackagingKit?.gates?.userVisualApproval === "APPROVED" || workspace.production.articlePackagingKit?.legacySystemReview?.status !== "HISTORY_ONLY") throw new Error("article-asset-production-authority-user-approval-boundary-invalid");
if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.automaticDispatchAllowed !== false) throw new Error("article-asset-production-authority-generation-freeze-invalid");
if (execution.status !== authority.status || execution.effectiveAuthority.source.mode !== "PERSISTED_BASE_ONLY" || execution.packagingParagraphLifecycle !== null || execution.visualDirectionAuthorityError !== null || execution.visualDirectionAuthority?.counts?.characterRequired !== 0) throw new Error("article-asset-production-authority-execution-status-invalid");
if (authority.status !== "BACKGROUND_REQUEST_READY_AWAITING_AUTHORIZATION") {
  const executionPolicy = assertBackgroundCandidateExecutionPolicy(readJson(path.join(laneRoot, "execution-policy.json")), {requestPackSha256: requestPack.requestPackSha256});
  if (authority.executionPolicy?.executionPolicySha256 !== executionPolicy.executionPolicySha256 || executionPolicy.executionScope.laneCompletionClaimAllowed !== false) throw new Error("article-asset-production-authority-execution-policy-binding-invalid");
}
if (authority.status === "BACKGROUND_PIXELS_READY_FOR_USER_REVIEW" && (authority.candidateReview?.candidateCount !== 2 || authority.candidateReview?.laneComplete !== false || authority.candidateReview?.userVisualApproval !== "NOT_APPROVED")) throw new Error("article-asset-production-authority-review-boundary-invalid");
if (authority.status === "BACKGROUND_LIBRARY_EXPANSION_ACTIVE" && (authority.candidateReview?.candidateCount !== 2 || authority.candidateReview?.laneComplete !== false || authority.candidateReview?.userVisualApproval !== "NOT_APPROVED" || authority.backgroundLibraryUserDecision?.decisions?.filter((item) => item.currentDirectionApproved === true).length !== 2 || authority.backgroundSupplyPlan?.countPolicy?.maximumCount !== null || authority.backgroundSupplyPlan?.countPolicy?.deriveFromDensityProfileCount !== false || authority.authorization?.requiresUser !== false)) throw new Error("article-asset-production-authority-open-supply-boundary-invalid");
if (authority.status === "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW" && (authority.nextBackgroundVarietyBatchReview?.candidateCount !== 6 || authority.nextBackgroundVarietyBatchReview?.userVisualApproval !== "NOT_APPROVED" || authority.authorization?.requiresUser !== true || authority.authorization?.nextAction !== "REVIEW_DEFAULT_LIBRARY_BACKGROUND_WAVE")) throw new Error("article-asset-production-authority-wave-review-boundary-invalid");

console.log(JSON.stringify({
  status: "PASS",
  authoritySha256: authority.authoritySha256,
  styleDnaSha256: styleDna.styleDnaSha256,
  requestPackSha256: requestPack.requestPackSha256,
  requestCount: requestPack.requests.length,
  referenceAttachmentCounts: requestPack.requests.map((request) => request.referenceAttachments.length),
  generatedFormalTextAllowed: styleDna.typography.generatedFormalTextAllowed,
  peopleAllowedByDefault: styleDna.subjectPolicy.peopleAllowedByDefault,
  queue: execution.queue,
  imageGenerationPerformed: requestPack.authorization.imageGenerationPerformed,
  currentStage: expectedStage,
  currentCanaryCandidateCount: authority.nextBackgroundVarietyBatchReview?.candidateCount || authority.candidateReview?.candidateCount || 0,
  laneComplete: authority.candidateReview?.laneComplete ?? false,
}, null, 2));
