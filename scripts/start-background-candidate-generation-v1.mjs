#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  advanceArticleAssetProductionAuthority,
  assertBackgroundLaneRequestPack,
  buildBackgroundCandidateExecutionPolicy,
} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const laneRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentAuthority = current.production.articleAssetProductionAuthority;
  if (currentAuthority?.status !== "BACKGROUND_REQUEST_READY_AWAITING_AUTHORIZATION") throw new Error(`background-candidate-generation-start-state-invalid:${currentAuthority?.status || "missing"}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.automaticDispatchAllowed !== false) throw new Error("background-candidate-generation-global-queue-must-remain-frozen");

  const styleDna = readJson(path.join(laneRoot, "style-dna.json"));
  const styleBriefs = readJson(path.join(laneRoot, "style-briefs.json"));
  const requestPack = assertBackgroundLaneRequestPack(readJson(path.join(laneRoot, "request-pack.json")), {appRoot, styleDna, styleBriefs: styleBriefs.briefs});
  const now = new Date().toISOString();
  const executionPolicy = buildBackgroundCandidateExecutionPolicy({requestPack, userDirectiveAt: now, now});
  const authority = advanceArticleAssetProductionAuthority(currentAuthority, {status: "BACKGROUND_CANDIDATE_GENERATING", executionPolicy, now});
  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = authority;
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "background-candidate-generation-started",
    targetId: requestPack.requestPackSha256,
    payload: {
      executionPolicySha256: executionPolicy.executionPolicySha256,
      outputCount: 2,
      initialCanaryBatchOnly: true,
      laneCompletionClaimAllowed: false,
      globalWorkerQueueMutationPerformed: false,
    },
    now,
  });
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const receiptBody = {
    contract: "A1BackgroundCandidateExecutionStartReceipt/v1",
    status: "DISPATCH_IN_PROGRESS",
    requestPackSha256: requestPack.requestPackSha256,
    executionPolicySha256: executionPolicy.executionPolicySha256,
    authoritySha256: authority.authoritySha256,
    candidateIds: requestPack.requests.map((request) => request.candidateId),
    globalQueue: {automaticDispatchAllowed: false, queued: 0, running: 0},
    startedAt: now,
  };
  const receipt = {...receiptBody, receiptSha256: sha256(receiptBody)};
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `background-candidate-start-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "article-asset-background-lane-v1/execution-policy.json": executionPolicy,
      "article-asset-background-lane-v1/execution-start-receipt.json": receipt,
    },
  });
  return {authority, executionPolicy, requestPack, persisted};
});

console.log(JSON.stringify({
  status: result.authority.status,
  nextAction: result.authority.authorization.nextAction,
  requiresUser: result.authority.authorization.requiresUser,
  requestPackSha256: result.requestPack.requestPackSha256,
  executionPolicySha256: result.executionPolicy.executionPolicySha256,
  workspaceSha256: result.persisted.workspaceSha256,
  initialCanaryBatchOnly: true,
  laneCompletionClaimAllowed: false,
}, null, 2));
