#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const artifactSha256 = "5b347c737f6067d92e9f172deb2f70d888ad90bc17794b409af0f6c151b14bf2";
const sourcePath = "/Users/a1/.codex/generated_images/019fd508-584a-72b1-aef1-7769be501897/exec-aca78b25-e1af-4e27-872d-c65ada1b7200.png";
const now = new Date().toISOString();
const reasons = [
  "CRT-global-surface-overrides-A1-cream-charcoal-editorial-family",
  "paper-halftone-and-quiet-space-suppressed",
  "人物标题工作台同时过重",
  "continuous-quiet-space-below-25-percent",
  "CRT-treated-as-global-filter-not-local-causal-node",
  "frame-not-recognizably-A1",
];

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("preview-rejection-requires-idle-generation-queue");
  if (current.production.shotIntelligence.currentAssembly?.length) throw new Error("preview-rejection-assembly-must-remain-locked");
  const next = structuredClone(current);
  const reviews = Array.isArray(next.production.previewOnlyVisualReviews) ? next.production.previewOnlyVisualReviews : [];
  const record = {
    contract: "A1PreviewCandidateVisualReview/v1",
    shotId: "ED-07",
    artifactSha256,
    sourcePath,
    dimensions: {width: 1672, height: 941},
    semantic: "AI 先出稿 / 人来把关",
    fusionMode: "CRT character machine",
    intendedRole: "FULLSCREEN EXPLAINER + integrated TYPOGRAPHY",
    compatibility: "UNVERIFIED",
    status: "VISUAL_REJECTED",
    deliveryUsage: "preview-only",
    imported: false,
    current: false,
    recommendationEligible: false,
    selectionEligible: false,
    winnerEligible: false,
    boardEligible: false,
    boundToCurrentPlan: false,
    generationPerformed: false,
    reasons,
    rejectedAt: now,
  };
  next.production.previewOnlyVisualReviews = [...reviews.filter((item) => item?.artifactSha256 !== artifactSha256), record];
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "reject-preview-candidate-visual",
    targetId: artifactSha256,
    payload: {
      contract: record.contract,
      shotId: record.shotId,
      status: record.status,
      imported: false,
      recommendationEligible: false,
      boardEligible: false,
      generationPerformed: false,
      reasons,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const decision = {contract: record.contract, status: "PASS", record, imported: false, recommendationEligible: false, boardEligible: false, generated: false, recordedAt: now};
  const saved = persistProjectState(appRoot, recalculated, {event, files: {"semantic-authority-convergence-v1/preview-candidate-visual-rejection.json": decision}});
  console.log(JSON.stringify({status: "PASS", workspaceSha256: saved.workspaceSha256, record, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length}, null, 2));
});
