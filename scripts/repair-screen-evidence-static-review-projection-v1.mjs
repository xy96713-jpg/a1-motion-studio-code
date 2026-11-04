#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const generatedRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const reviewManifestPath = path.join(generatedRoot, "continuous-screen-evidence-v2/static-review-v1/manifest.json");
const sourcePlansPath = path.join(generatedRoot, "continuous-screen-evidence-v2/shot-performance-plans.json");
const routeAuthorityPath = path.join(generatedRoot, "source-presentation-routes-v1/authority.json");
const expectedWorkspaceSha256 = process.argv.find((arg) => /^[a-f0-9]{64}$/u.test(arg)) || null;
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const review = readJson(reviewManifestPath);
const sourcePlans = readJson(sourcePlansPath);
const routeAuthority = readJson(routeAuthorityPath);
const reviewByShot = new Map((review.entries || []).map((entry) => [entry.shotId, entry]));
const sourcePlansByShot = new Map((sourcePlans.shots || []).map((shot) => [shot.shotId, shot]));

function rawPreviewForShot(shot) {
  const existing = shot.sourcePreview?.presentationRoute === "SOURCE_COLLAGE" ? null : shot.sourcePreview;
  if (existing?.publicUrl) return structuredClone(existing);
  if (shot.preview?.presentationRoute !== "SOURCE_COLLAGE" && shot.preview?.publicUrl) return structuredClone(shot.preview);
  const sourceFrame = sourcePlansByShot.get(shot.shotId)?.evidenceFrames?.at(-1);
  return sourceFrame?.publicUrl ? {
    kind: "VERIFIED_SCREEN_SOURCE",
    publicUrl: sourceFrame.publicUrl,
    sha256: sourceFrame.sha256 || null,
    provenance: "CURRENT_SCREEN_SOURCE_RESULT_FRAME",
  } : null;
}

function rehashWorkspace(workspace) {
  const hashInput = structuredClone(workspace);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  if (hashInput.production?.packagingAnchorProof) delete hashInput.production.packagingAnchorProof.persistedWorkspaceSha256After;
  workspace.workspaceSha256 = sha256Json(hashInput);
  if (workspace.reviewLedger) workspace.reviewLedger.workspaceSha256 = workspace.workspaceSha256;
  return workspace;
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`screen-review-projection-workspace-cas:${current.workspaceSha256}`);
  const now = new Date().toISOString();
  const next = recalculateEditorialAssetWorkbench(structuredClone(current), now);
  next.production.shotVisualCoveragePlan.shotPlans = next.production.shotVisualCoveragePlan.shotPlans.map((shot) => {
    const entry = reviewByShot.get(shot.shotId);
    if (!entry) return shot;
    return {
      ...shot,
      sourcePreview: rawPreviewForShot(shot),
      preview: {
        kind: "SOURCE_COLLAGE_STATIC_REVIEW",
        publicUrl: entry.staticPreview.publicUrl,
        sha256: entry.staticPreview.sha256,
        presentationRoute: entry.presentationRoute,
        annotationRoute: entry.annotationRoute,
        sourceWindowRoute: entry.sourceWindowRoute,
        staticReviewManifestSha256: review.manifestSha256,
        reviewOnly: true,
        sourcePixelsPreserved: true,
        syntheticCursorAdded: false,
        productionAdmission: false,
        userVisualApproval: "NOT_APPROVED",
      },
    };
  });
  next.production.sourcePresentationRouteAuthority = routeAuthority;
  next.production.screenEvidenceStaticReview = {
    ...structuredClone(next.production.screenEvidenceStaticReview || {}),
    contract: review.contract,
    status: review.status,
    manifestSha256: review.manifestSha256,
    contactSheet: review.contactSheet,
    shotIds: review.shotIds,
    current: true,
    reviewOnly: true,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
  };
  const event = createProductionEvent({workspace: next, action: "repair-screen-evidence-static-review-projection-v1", targetId: review.manifestSha256, payload: {shotCount: review.shotIds.length, staticReviewManifestSha256: review.manifestSha256, routeAuthoritySha256: routeAuthority.authoritySha256, productionAdmission: false, userVisualApproval: "NOT_APPROVED"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const repaired = assertEditorialAssetWorkbench(rehashWorkspace(next));
  for (const shotId of review.shotIds) {
    const shot = repaired.production.shotVisualCoveragePlan.shotPlans.find((item) => item.shotId === shotId);
    assert.equal(shot?.preview?.presentationRoute, "SOURCE_COLLAGE", `screen-review-preview-route:${shotId}`);
    assert.ok(shot?.sourcePreview?.publicUrl, `screen-review-source-preview:${shotId}`);
  }
  const files = {
    "source-presentation-routes-v1/authority.json": routeAuthority,
    "continuous-screen-evidence-v2/static-review-v1/manifest.json": review,
  };
  const persisted = persistProjectState(appRoot, repaired, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `screen-review-projection-repair-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: persisted.workspaceSha256, shotCount: review.shotIds.length, staticReviewManifestSha256: review.manifestSha256, routeAuthoritySha256: routeAuthority.authoritySha256, userVisualApproval: "NOT_APPROVED", productionAdmission: false};
});

console.log(JSON.stringify(result, null, 2));
