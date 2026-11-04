#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {adoptBackgroundLibraryExpansionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {
  buildBackgroundLibraryUserDecision,
  buildBackgroundSupplyPlan,
  buildBackgroundVarietyBatchPlan,
  buildEditorialVideoCompositionGrammar,
} from "../apps/studio-next/src/lib/a1-video-composition-background-supply-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const laneRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentAuthority = current.production.articleAssetProductionAuthority;
  if (!["BACKGROUND_PIXELS_READY_FOR_USER_REVIEW", "BACKGROUND_LIBRARY_EXPANSION_ACTIVE"].includes(currentAuthority?.status)) throw new Error(`open-background-supply-state-invalid:${currentAuthority?.status || "missing"}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.automaticDispatchAllowed !== false) throw new Error("open-background-supply-requires-frozen-empty-generation-queue");
  const styleDna = readJson(path.join(laneRoot, "style-dna.json"));
  const sourceCandidateReview = readJson(path.join(laneRoot, "actual-pixel-review.json"));
  const now = new Date().toISOString();
  const sampledReferences = [
    {creator: "胡泊Hubo", videoId: "BV1a63d6CEBa", url: "https://www.bilibili.com/video/BV1a63d6CEBa/", sampledFrameCount: 12},
    {creator: "差评君", videoId: "BV1Kv4y1j7hQ", url: "https://www.bilibili.com/video/BV1Kv4y1j7hQ/", sampledFrameCount: 12},
  ];
  const grammar = buildEditorialVideoCompositionGrammar({workspace: current, sampledReferences, now});
  const userDecision = buildBackgroundLibraryUserDecision({candidateReview: sourceCandidateReview, userDirective: "都还可以", now});
  const supplyPlan = buildBackgroundSupplyPlan({workspace: current, grammar, userDecision, now});
  const varietyBatchPlan = buildBackgroundVarietyBatchPlan({workspace: current, grammar, supplyPlan, styleDna, now});
  const authority = adoptBackgroundLibraryExpansionAuthority(currentAuthority, {grammar, sourceCandidateReview, userDecision, supplyPlan, varietyBatchPlan, now});

  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = authority;
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "background-library-open-supply-adopted",
    targetId: supplyPlan.supplyPlanSha256,
    payload: {
      grammarSha256: grammar.grammarSha256,
      userDecisionSha256: userDecision.decisionSha256,
      supplyPlanSha256: supplyPlan.supplyPlanSha256,
      nextBatchPlanSha256: varietyBatchPlan.batchPlanSha256,
      approvedUsableCount: supplyPlan.coverage.approvedDistinctCount,
      minimumCoverageFloor: supplyPlan.countPolicy.minimumCoverageFloor,
      maximumCount: null,
      imageGenerationPerformed: false,
      motionPerformed: false,
    },
    now,
  });
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const reportBody = {
    contract: "A1OpenBackgroundSupplyAdoptionReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    authoritySha256: authority.authoritySha256,
    grammarSha256: grammar.grammarSha256,
    userDecisionSha256: userDecision.decisionSha256,
    supplyPlanSha256: supplyPlan.supplyPlanSha256,
    nextBatchPlanSha256: varietyBatchPlan.batchPlanSha256,
    approvedUsableCount: supplyPlan.coverage.approvedDistinctCount,
    minimumCoverageFloor: supplyPlan.countPolicy.minimumCoverageFloor,
    maximumCount: null,
    nextAction: authority.authorization.nextAction,
    requiresUser: authority.authorization.requiresUser,
    imageGenerationPerformed: false,
    frozenBoundaries: authority.nextBackgroundVarietyBatchPlan.frozenBoundaries,
    createdAt: now,
  };
  const report = {...reportBody, reportSha256: sha256(reportBody)};
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `open-background-supply-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "article-asset-background-lane-v1/video-composition-grammar.json": grammar,
      "article-asset-background-lane-v1/user-library-decision.json": userDecision,
      "article-asset-background-lane-v1/background-supply-plan.json": supplyPlan,
      "article-asset-background-lane-v1/next-variety-batch-plan.json": varietyBatchPlan,
      "article-asset-background-lane-v1/open-supply-adoption-report.json": report,
    },
  });
  return {authority, grammar, userDecision, supplyPlan, varietyBatchPlan, persisted};
});

console.log(JSON.stringify({
  status: result.authority.status,
  workspaceSha256: result.persisted.workspaceSha256,
  grammarSha256: result.grammar.grammarSha256,
  userDecisionSha256: result.userDecision.decisionSha256,
  approvedUsableCount: result.supplyPlan.coverage.approvedDistinctCount,
  minimumCoverageFloor: result.supplyPlan.countPolicy.minimumCoverageFloor,
  maximumCount: result.supplyPlan.countPolicy.maximumCount,
  openRoleCount: result.supplyPlan.coverage.openRoleCount,
  nextBatchPlanSha256: result.varietyBatchPlan.batchPlanSha256,
  nextAction: result.authority.authorization.nextAction,
  requiresUser: result.authority.authorization.requiresUser,
  imageGenerationPerformed: false,
}, null, 2));
