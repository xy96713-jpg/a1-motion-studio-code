#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("whole-film-layer-review-valid-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const expansionShotIds = new Set(["ED-07", "ED-09", "ED-10", "ED-12", "ED-13", "ED-17", "ED-19", "ED-33"]);

const visualFindings = {
  "ED-07": {verdict: "PASS", actorMap: {TYPOGRAPHY: "question-headline", ILLUSTRATION: "terminal-takeover", ELEMENT_KIT: "input-to-runaway-dissolution"}},
  "ED-09": {verdict: "PASS", actorMap: {TYPOGRAPHY: "two-line-language-verdict", ILLUSTRATION: "meaning-disintegration-field", ELEMENT_KIT: "cobalt-underline-and-scatter"}},
  "ED-10": {verdict: "PASS", actorMap: {TYPOGRAPHY: "hero-waste-draft-title", ILLUSTRATION: "rolled-material-field", ELEMENT_KIT: "cobalt-seams-and-pixel-edges"}},
  "ED-12": {verdict: "PASS", actorMap: {TYPOGRAPHY: "model-list", ILLUSTRATION: "routing-path", ELEMENT_KIT: "routing-nodes"}},
  "ED-13": {verdict: "PASS", actorMap: {TYPOGRAPHY: "two-material-contrast-statements", ILLUSTRATION: "generated-presenter-parity-only-motion-disabled", ELEMENT_KIT: "pixel-step-and-microphone-bridge"}, originalPresenterComposite: "PASS"},
  "ED-17": {verdict: "PASS", actorMap: {TYPOGRAPHY: "three-step-method", ILLUSTRATION: "typewriter-scroll-pen", ELEMENT_KIT: "cobalt-action-arrows-and-baseline"}},
  "ED-19": {verdict: "PASS", actorMap: {TYPOGRAPHY: "four-verb-sequence", ILLUSTRATION: "structural-halftone-base-motion-disabled", ELEMENT_KIT: "chevrons-and-cursor"}},
  "ED-33": {verdict: "PASS", actorMap: {TYPOGRAPHY: "controllability-conclusion", ILLUSTRATION: "rolled-editorial-paper", ELEMENT_KIT: "cobalt-ribbon-and-sculpture-anchor"}},
};

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`whole-film-layer-review-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.workerStatus !== "frozen" || current.production.generation.summary.running !== 0 || current.production.generation.automaticDispatchAllowed !== false) throw new Error("whole-film-layer-review-frozen-runtime-required");
  const source = current.production.shotIntelligence.wholeFilmDeterministicLayerReconstruction;
  if (source?.status !== "TECHNICAL_PARITY_PASS_PENDING_EXPANSION_ACTUAL_PIXEL_VISUAL_REVIEW" || source.packageCount !== 13 || source.items?.length !== 13) throw new Error("whole-film-layer-review-technical-manifest-required");
  if (source.manifestSha256 !== "4c35ca72617bdb800f0f3909e85cf5adc55b697ad63e480bf951f0a7716379d2") throw new Error(`whole-film-layer-review-unexpected-source-manifest:${source.manifestSha256}`);

  const reviewedItems = [];
  const reviews = [];
  for (const sourceItem of source.items) {
    const item = structuredClone(sourceItem);
    const parity = item.approvedMasterParity || item.holdFrameParity;
    if (!parity || parity.status !== "PASS" || parity.exactPixelRatio !== 1 || parity.meanAbsoluteRgbDifference !== 0) throw new Error(`whole-film-layer-review-parity-invalid:${item.shotId}`);
    for (const asset of [...item.layers, item.recomposedMaster, item.finalComposite, item.contactSheet]) {
      const file = publicFile(asset.publicUrl);
      if (!fs.existsSync(file) || fileSha256(file) !== asset.sha256) throw new Error(`whole-film-layer-review-asset-sha-invalid:${item.shotId}:${asset.publicUrl}`);
    }
    const finalMetadata = await sharp(publicFile(item.finalComposite.publicUrl)).metadata();
    if (finalMetadata.width !== 1672 || finalMetadata.height !== 941) throw new Error(`whole-film-layer-review-final-dimensions-invalid:${item.shotId}`);
    if (expansionShotIds.has(item.shotId)) {
      const finding = visualFindings[item.shotId];
      if (!finding || finding.verdict !== "PASS") throw new Error(`whole-film-layer-review-finding-missing:${item.shotId}`);
      for (const layer of item.layers) {
        layer.visualApprovalStatus = "PASS_WITH_MOTION_OPERATION_CONSTRAINTS";
        if (item.shotId === "ED-19" && layer.kind === "ILLUSTRATION") layer.motionOperationConstraint = "MOTION_DISABLED_STRUCTURAL_HALFTONE_BASE_ONLY";
        if (item.shotId === "ED-13" && layer.kind === "ILLUSTRATION") layer.motionOperationConstraint = "MOTION_DISABLED_REPLACED_BY_ORIGINAL_PRESENTER_PIXEL_COMPOSITE";
      }
      item.status = "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS";
      item.visualApprovalStatus = "PASS_WITH_MOTION_OPERATION_CONSTRAINTS";
      item.actualPixelVisualReview = {contract: "A1WholeFilmLayerActualPixelVisualReview/v1", status: "PASS", reviewer: "a1-visual-director", contactSheetSha256: item.contactSheet.sha256, criteria: ["semantic-actor-map-visible", "approved-master-exact-recomposition", "local-underpaint-supports-in-place-reveal", "no-free-layer-drift", "neutral-cool-aesthetic-preserved", ...(item.shotId === "ED-13" ? ["original-presenter-face-body-microphone-boom-restored"] : [])], finding};
      reviews.push({shotId: item.shotId, status: "PASS", contactSheet: item.contactSheet, actorMap: finding.actorMap, originalPresenterComposite: finding.originalPresenterComposite || "NOT_APPLICABLE"});
    }
    reviewedItems.push(item);
  }
  if (reviewedItems.some((item) => item.status !== "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS")) throw new Error("whole-film-layer-review-not-all-pass");
  const now = new Date().toISOString();
  const body = {...source, status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS", items: reviewedItems, actualPixelVisualPassCount: 13, expansionActualPixelVisualPassCount: reviews.length, expansionPendingVisualReviewCount: 0, motionPlanCompilationAllowed: true, reviewRenderAllowed: false, visualReviewAuthority: "A1_VISUAL_DIRECTOR_ACTUAL_PIXEL_CONTACT_SHEET_REVIEW", reviewedAt: now};
  delete body.manifestSha256;
  delete body.generatedAt;
  const manifest = {...body, generatedAt: source.generatedAt, manifestSha256: sha256({...body, generatedAt: undefined, reviewedAt: undefined})};
  const reviewBody = {contract: "A1WholeFilmDeterministicLayerActualPixelVisualReview/v1", status: "PASS", sourceManifestSha256: source.manifestSha256, reviewedManifestSha256: manifest.manifestSha256, packageCount: 13, representativePassCount: 5, expansionPassCount: 8, failureCount: 0, reviews, motionPlanCompilationAllowed: true, reviewRenderAllowed: false, generationCount: 0, workerStatus: "frozen", reviewedAt: now};
  const review = {...reviewBody, reviewSha256: sha256({...reviewBody, reviewedAt: undefined})};
  manifest.actualPixelVisualReviewSha256 = review.reviewSha256;
  let next = structuredClone(current);
  next.production.shotIntelligence.wholeFilmDeterministicLayerReconstruction = manifest;
  next.production.shotIntelligence.wholeFilmDeterministicLayerActualVisualReview = review;
  next.production.shotIntelligence.approvedMasterLayerPilot = {...next.production.shotIntelligence.approvedMasterLayerPilot, wholeFilmExpansionStatus: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS", wholeFilmManifestSha256: manifest.manifestSha256, wholeFilmActualPixelVisualReviewSha256: review.reviewSha256, wholeFilmMotionPlanCompilationAllowed: true};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "review-whole-film-deterministic-approved-master-layers", targetId: "13-package-shots", payload: {sourceManifestSha256: source.manifestSha256, reviewedManifestSha256: manifest.manifestSha256, reviewSha256: review.reviewSha256, packageCount: 13, expansionPassCount: 8, failureCount: 0, motionPlanCompilationAllowed: true, generationCount: 0, workerStatus: "frozen"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `whole-film-layer-actual-visual-review-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/whole-film/manifest.json": manifest, "approved-master-layer-reconstruction-v1/whole-film/actual-pixel-visual-review.json": review}});
  return {status: review.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, sourceManifestSha256: source.manifestSha256, manifestSha256: manifest.manifestSha256, reviewSha256: review.reviewSha256, packageCount: manifest.packageCount, passCount: manifest.actualPixelVisualPassCount, failureCount: review.failureCount, motionPlanCompilationAllowed: manifest.motionPlanCompilationAllowed, reviewRenderAllowed: manifest.reviewRenderAllowed, workerStatus: "frozen"};
});

console.log(JSON.stringify(result, null, 2));
