#!/usr/bin/env node
// Formal authority correction only. No media generation or Resolve mutation.
import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const now = new Date().toISOString();
const body = {
  contract: "A1V8BoundedIndependentActualPixelReview/v1",
  status: "VISUAL_REPAIR_REQUIRED",
  current: true,
  reasonCodes: [
    "INDEPENDENT_ACTUAL_PIXEL_REVIEW_REJECTED",
    "ED13_PRESENTER_DOMINANCE_REJECTED",
    "ED12_GENERIC_HUD_LABEL_PANEL_REPAIR_REQUIRED",
    "ED17_TEXT_SAFE_AREA_REPAIR_REQUIRED",
  ],
  boundedShotIds: ["ED-12", "ED-13", "ED-17"],
  passedShotIds: ["ED-10", "ED-16", "ED-31"],
  preservedPixelShotIds: ["ED-10", "ED-16", "ED-31"],
  nextAction: "REPAIR_V8_BOUNDED_ACTUAL_PIXEL_REVIEW_FAILURES",
  maximumPromotionStatus: "READY_FOR_ACTUAL_PIXEL_REVIEW",
  motionAllowed: false,
  resolveInsertAllowed: false,
  finalFilmRenderAllowed: false,
  productionWired: false,
  userVisualApproval: "NOT_APPROVED",
  recordedAt: now,
};
const record = {...body, auditSha256: sha256(Buffer.from(JSON.stringify(body)))};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const previousReview = current.production.staticPackageReview || null;
  const history = [
    ...(Array.isArray(previousReview?.history) ? previousReview.history : []),
    ...(previousReview ? [{...previousReview, current: false, supersededBy: record.auditSha256}] : []),
  ];
  next.production.staticPackageReview = {
    ...previousReview,
    ...record,
    history,
    visualRepairMatrix: {
      ...(previousReview?.visualRepairMatrix || {}),
      canaryShotIds: ["ED-10", "ED-13", "ED-31"],
      repairShotIds: record.boundedShotIds,
      independentReviewVerdict: "VISUAL_REJECTED",
    },
    objectiveCanary: previousReview?.objectiveCanary
      ? {...previousReview.objectiveCanary, current: false, status: "REVIEW_ONLY_SUPERSEDED_BY_BOUNDED_REPAIR"}
      : null,
    v8Expansion: previousReview?.v8Expansion
      ? {...previousReview.v8Expansion, current: false, status: "REVIEW_ONLY_REPAIR_REQUIRED"}
      : null,
    productionArtifact: false,
    packagingDeliverable: false,
  };
  next.production.objectiveVisualGate = {
    ...(current.production.objectiveVisualGate || {}),
    current: false,
    status: "VISUAL_REPAIR_REQUIRED",
    nextAction: "REPAIR_V8_BOUNDED_ACTUAL_PIXEL_REVIEW_FAILURES",
    userVisualApproval: "NOT_APPROVED",
    productionWired: false,
    resolveInsertAuthorized: false,
    finalFilm: false,
  };
  if (current.production.goldenFilmVisualSystemMaturity) {
    next.production.goldenFilmVisualSystemMaturity = {
      ...current.production.goldenFilmVisualSystemMaturity,
      current: false,
      status: "HISTORY_SUPERSEDED_BY_V8_VISUAL_REPAIR",
      nextAction: "REPAIR_V8_BOUNDED_ACTUAL_PIXEL_REVIEW_FAILURES",
      userVisualApproval: "NOT_APPROVED",
    };
  }
  if (current.production.canonicalPackageExport) {
    next.production.canonicalPackageExport = {
      ...current.production.canonicalPackageExport,
      current: false,
      status: "HISTORY_SUPERSEDED_BY_V8_VISUAL_REPAIR",
      resolveInsertAuthorized: false,
      productionWired: false,
      finalFilm: false,
    };
  }
  next.production.packagingDeliverySourceProjection = {
    ...(current.production.packagingDeliverySourceProjection || {}),
    status: "VISUAL_REPAIR_REQUIRED",
    productionReadyShotCount: 0,
    productionAdmissionAllowed: false,
  };
  next.production.productionWired = false;
  next.production.aeLevelProven = false;
  next.production.resolveExportReady = false;
  next.production.resolveInsertReady = false;
  next.production.resolveProjectMutationPerformed = false;
  if (next.production.assembly?.status !== "NOT_CREATED") {
    throw new Error(`assembly-status-must-remain-not-created:${next.production.assembly?.status}`);
  }
  const event = createProductionEvent({
    workspace: current,
    action: "record-v8-bounded-visual-repair-required",
    targetId: "V8_BOUNDED_VISUAL_REPAIR",
    payload: {auditSha256: record.auditSha256, status: record.status, motionAllowed: false, resolveInsertAllowed: false},
  });
  return persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `v8-bounded-visual-repair-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"static-package-review-v8/independent-actual-pixel-review-reject-v1.json": record},
  });
});

console.log(JSON.stringify({
  status: record.status,
  auditSha256: record.auditSha256,
  workspaceSha256: result.workspaceSha256,
  transitionSha256: result.transitionSha256,
  motionAllowed: false,
  resolveInsertAllowed: false,
  finalFilmRenderAllowed: false,
}, null, 2));
