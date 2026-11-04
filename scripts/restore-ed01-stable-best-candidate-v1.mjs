#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const asset = current.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === "ED-01");
  const stableRound = asset?.revisionHistory?.find((item) => item.reason === "ed01-terminal-notch-refinement-v10");
  const stableCandidate = stableRound?.candidates?.find((item) => item.candidateId === "ED-01-D12-V1");
  if (!asset || !stableCandidate || !stableRound?.candidateRender || !stableRound.visualCritic) throw new Error("ed01-stable-best-candidate-required");
  const next = structuredClone(current);
  const target = next.library.assets.find((item) => item.id === asset.id);
  target.revisionHistory ||= [];
  if (target.candidates?.[0]?.candidateId === "ED-01-D13-V1") {
    target.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(target.visualRevision?.round || 1), strategyCycle: Number(target.visualStrategyCycle || 0), reason: "ed01-terminal-notch-rejected-hard-failure", candidates: structuredClone(target.candidates), selectedCandidateId: target.selectedCandidateId || null, candidateRender: target.candidateRender || null, visualCritic: target.visualCritic || null, archivedAt: now});
  }
  target.candidates = [structuredClone(stableCandidate)];
  target.selectedCandidateId = null;
  target.candidateRender = structuredClone(stableRound.candidateRender);
  target.visualCritic = structuredClone(stableRound.visualCritic);
  target.bestEffectHeroFrame = null;
  target.status = "ready-for-review";
  target.review = {status: "pending", note: "ED-01 恢复 D12：同一渲染两次 21/20，中位数 21/24，无硬失败；仍未达到 22/24。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  target.candidateSetAudit = {contract: "A1ShotCandidateSetAudit/v1", status: "STABLE_VISUAL_REVIEW_BLOCKED", candidateCount: 1, structureDirectionCount: 3, distinctSilhouetteCount: 1, requiredDistinctSilhouetteCount: 1, visualPrimitiveId: "presenter-object-bound-pixel-relay", candidateId: "ED-01-D12-V1", imageGenerationDispatched: false, renderDispatched: false, preflightAt: now, blockingReason: "stable-median-below-22"};
  target.visualRevision = {...(target.visualRevision || {}), strategySwitchId: "ed01-glyph-handoff-v9-stable-restore", prompt: "保留 D12 逐字接力版本；禁止采用 D13 的独立终点高亮。", createdAt: now};
  target.candidateBatch = {contract: "A1ShotCandidateBatch/v1", batchId: `ED-01-batch-stable-d12-${sha256(stableCandidate.candidateSha256).slice(0, 12)}`, scope: "single-shot", shotId: "ED-01", candidateIds: ["ED-01-D12-V1"], candidateCount: 1, sourceDependencySha256: stableCandidate.sourceDependencySha256, batchDependencySha256: sha256({shotId: "ED-01", candidateId: "ED-01-D12-V1", candidateSha256: stableCandidate.candidateSha256}), previousBatchId: target.candidateBatch?.batchId || null, generatedAt: now, status: "ready-for-shot-review"};
  delete next.production.maturityLoop.shotReports["ED-01"];
  next.production.generation.automaticDispatchAllowed = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.maturityLoop.nextAction = "refine-current-explicit-anchor-primitives";
  recalculated.production.authority.nextAction = {id: "refine-current-explicit-anchor-primitives", label: "代表镜头 ED-01 需要一次受控静态精修审片", requiresUser: false, targetShotIds: ["ED-01"]};
  recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  recalculated.production.visualDirector.generationFreeze = {...(recalculated.production.visualDirector.generationFreeze || {}), frozen: true, status: "frozen", reason: "visual-anchor-static-refinement-required", scope: "explicit-anchor-static-refinement", imageGenerationAllowed: false, automaticDispatchAllowed: false, compositorReviewAllowed: true};
  const hashInput = structuredClone(recalculated); delete hashInput.workspaceSha256; if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  recalculated.workspaceSha256 = sha256Json(hashInput); recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256;
  assertEditorialAssetWorkbench(recalculated); persistProjectState(appRoot, recalculated);
  return {workspaceSha256: recalculated.workspaceSha256, restoredCandidateId: "ED-01-D12-V1", median: stableRound.visualCritic.criticStability?.median, scores: stableRound.visualCritic.criticStability?.scores, hardFailures: stableRound.visualCritic.hardFailures};
});

console.log(JSON.stringify({status: "ED01_STABLE_BEST_RESTORED", ...result}, null, 2));
