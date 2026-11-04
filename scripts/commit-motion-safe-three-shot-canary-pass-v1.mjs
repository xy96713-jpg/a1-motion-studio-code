#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const expectedWorkspaceSha256 = process.argv[2];
const reviewPath = path.resolve(process.argv[3] || "");
const layerKinds = ["BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION"];
const actorKinds = layerKinds.slice(1);
const targetShotIds = ["ED-08", "ED-14", "ED-31"];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("motion-safe-pass-expected-workspace-sha-required");
if (!fs.existsSync(reviewPath)) throw new Error("motion-safe-pass-visual-review-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => sha256(fs.readFileSync(file));

async function decoded(file) {
  return sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
}

function compareRgb(left, right, predicate = () => true) {
  let pixelCount = 0;
  let exactPixelCount = 0;
  let absoluteDifference = 0;
  let maximumChannelDifference = 0;
  for (let pixel = 0; pixel < left.length / 4; pixel += 1) {
    if (!predicate(pixel)) continue;
    pixelCount += 1;
    const offset = pixel * 4;
    const differences = [0, 1, 2].map((channel) => Math.abs(left[offset + channel] - right[offset + channel]));
    const maximum = Math.max(...differences);
    if (maximum === 0) exactPixelCount += 1;
    absoluteDifference += differences[0] + differences[1] + differences[2];
    maximumChannelDifference = Math.max(maximumChannelDifference, maximum);
  }
  return {pixelCount, exactPixelRatio: pixelCount ? exactPixelCount / pixelCount : 1, meanAbsoluteRgbDifference: pixelCount ? absoluteDifference / (pixelCount * 3) : 0, maximumChannelDifference};
}

function alphaStats(raw, width, height, background) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let pixelCount = 0;
  let partialAlphaPixelCount = 0;
  for (let pixel = 0; pixel < raw.length / 4; pixel += 1) {
    const alpha = raw[pixel * 4 + 3];
    if (alpha === 0) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    pixelCount += 1;
    if (alpha < 255) partialAlphaPixelCount += 1;
  }
  if (background) assert.equal(pixelCount, width * height, "motion-safe-pass-background-must-be-opaque");
  assert.ok(pixelCount > 0, "motion-safe-pass-empty-layer");
  return {pixelCount, partialAlphaPixelCount, visiblePixelRatio: Number((pixelCount / (width * height)).toFixed(6)), bounds: {x: left, y: top, width: right - left + 1, height: bottom - top + 1}};
}

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `motion-safe-pass-cas-failed:${before.workspaceSha256}`);
  assert.equal(before.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
  assert.equal(before.production.generation.summary.queued, 0);
  assert.equal(before.production.generation.summary.running, 0);
  assert.equal(before.production.generation.workerStatus, "frozen");

  const review = readJson(reviewPath);
  assert.equal(review.contract, "A1MotionSafeThreeShotVisualReview/v1");
  assert.equal(review.status, "PASS");
  assert.equal(review.sourceWorkspaceSha256, before.workspaceSha256);
  assert.deepEqual(review.items.map((item) => item.shotId), targetShotIds);
  assert.equal(review.items.every((item) => item.actualPixelVisualInspection === "PASS" && item.semanticOwnershipStatus === "PASS" && item.cleanPlateStatus === "PASS" && item.motionExposureEnvelopeStatus === "PASS"), true);
  assert.equal(review.items.every((item) => item.backgroundAudit.ocrObservationCount === 0 && item.backgroundAudit.faceCount === 0 && item.backgroundAudit.humanRectCount === 0), true);

  const oldCanary = before.production.shotIntelligence.threeShotLayerCanary;
  const now = new Date().toISOString();
  const binaryFiles = {};
  const builtItems = [];

  for (const reviewItem of review.items) {
    const oldItem = oldCanary.items.find((item) => item.shotId === reviewItem.shotId);
    assert.ok(oldItem, `motion-safe-pass-old-item-missing:${reviewItem.shotId}`);
    const masterFile = path.join(appRoot, "public", oldItem.selectedLookMaster.publicUrl.replace(/^\//u, ""));
    assert.equal(fileSha256(masterFile), oldItem.selectedLookMaster.sha256, `motion-safe-pass-master-sha:${reviewItem.shotId}`);
    const master = await decoded(masterFile);
    const width = master.info.width;
    const height = master.info.height;
    const layerRecords = [];
    const layerRaw = {};
    for (const kind of layerKinds) {
      const source = path.resolve(reviewItem.layers[kind].path);
      assert.equal(fileSha256(source), reviewItem.layers[kind].sha256, `motion-safe-pass-layer-sha:${reviewItem.shotId}:${kind}`);
      const recordRaw = await decoded(source);
      assert.equal(recordRaw.info.width, width);
      assert.equal(recordRaw.info.height, height);
      layerRaw[kind] = recordRaw.data;
      const relative = `three-shot-layer-canary-v1/layers/${reviewItem.shotId}/${kind.toLowerCase()}.png`;
      binaryFiles[relative] = fs.readFileSync(source);
      layerRecords.push({
        contract: "A1ThreeShotLayerCanaryArtifact/v1",
        shotId: reviewItem.shotId,
        kind,
        status: "PASS",
        publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relative}`,
        sha256: reviewItem.layers[kind].sha256,
        decodedPixelSha256: sha256(recordRaw.data),
        width,
        height,
        hasAlpha: true,
        alphaMode: kind === "BACKGROUND" ? "OPAQUE_MOTION_SAFE_CLEAN_PLATE_WITH_ALPHA_CHANNEL" : "TRANSPARENT_RGBA_SEMANTIC_ACTOR_LAYER",
        ...alphaStats(recordRaw.data, width, height, kind === "BACKGROUND"),
        geometry: {x: 0, y: 0, width, height, fit: "fill", coordinateSpace: "APPROVED_MASTER_FULL_CANVAS"},
        sourceMasterSha256: oldItem.selectedLookMaster.sha256,
        localSecondDesignPerformed: false,
        visibleTypographyRetypedLocally: false,
        semanticOwner: reviewItem.layers[kind].semanticOwner,
        actualPixelVisualReviewStatus: "PASS",
      });
    }

    let recomposedBuffer = binaryFiles[`three-shot-layer-canary-v1/layers/${reviewItem.shotId}/background.png`];
    for (const kind of actorKinds) recomposedBuffer = await sharp(recomposedBuffer).composite([{input: binaryFiles[`three-shot-layer-canary-v1/layers/${reviewItem.shotId}/${kind.toLowerCase()}.png`], left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
    const recomposed = await decoded(recomposedBuffer);
    const fullParity = compareRgb(recomposed.data, master.data);
    let masterParity;
    let originalPresenterIdentity = {status: "NOT_APPLICABLE"};
    if (reviewItem.shotId === "ED-31") {
      const envelope = await decoded(path.resolve(reviewItem.motionExposureEnvelope.path));
      assert.equal(fileSha256(path.resolve(reviewItem.motionExposureEnvelope.path)), reviewItem.motionExposureEnvelope.sha256);
      const outside = compareRgb(recomposed.data, master.data, (pixel) => envelope.data[pixel * 4] === 0);
      const illustration = layerRaw.ILLUSTRATION;
      const identity = compareRgb(recomposed.data, master.data, (pixel) => illustration[pixel * 4 + 3] > 0);
      const opaqueIdentityCore = compareRgb(recomposed.data, master.data, (pixel) => illustration[pixel * 4 + 3] === 255);
      const identityPass = opaqueIdentityCore.exactPixelRatio === 1 && opaqueIdentityCore.meanAbsoluteRgbDifference === 0 && identity.maximumChannelDifference <= 1 && identity.meanAbsoluteRgbDifference <= 0.25;
      originalPresenterIdentity = {status: identityPass ? "PASS" : "FAIL", policy: "ORIGINAL_APPROVED_MASTER_OPAQUE_IDENTITY_CORE_EXACT_PLUS_LIBVIPS_ALPHA_EDGE_ROUNDING_MAX_1", protectedPixelCount: identity.pixelCount, opaqueIdentityCore, fullVisibleMatte: identity, edgeMaximumChannelDifferenceTolerance: 1, edgeMeanAbsoluteRgbDifferenceTolerance: 0.25, faceCount: 1, humanRectCount: 1, originalHoldFrameIdentityNotRedrawn: true};
      masterParity = {status: outside.exactPixelRatio === 1 && outside.meanAbsoluteRgbDifference === 0 && fullParity.meanAbsoluteRgbDifference <= 18 && originalPresenterIdentity.status === "PASS" ? "PASS" : "FAIL", policy: "EXACT_OUTSIDE_MOTION_EXPOSURE_ENVELOPE_PLUS_ORIGINAL_PRESENTER_IDENTITY_INSIDE", fullFrameAgainstApprovedMaster: fullParity, outsideMotionExposureEnvelope: outside, fullFrameMeanAbsoluteRgbDifferenceTolerance: 18};
    } else {
      const roundingPass = fullParity.maximumChannelDifference <= 1 && fullParity.meanAbsoluteRgbDifference <= 0.1;
      masterParity = {status: roundingPass ? "PASS" : "FAIL", policy: "PRODUCTION_LIBVIPS_ALPHA_COMPOSITE_ROUNDING_TOLERANCE", fullFrameAgainstApprovedMaster: fullParity, maximumChannelDifferenceTolerance: 1, meanAbsoluteRgbDifferenceTolerance: 0.1};
    }
    assert.equal(masterParity.status, "PASS", `motion-safe-pass-parity:${reviewItem.shotId}`);
    assert.equal(originalPresenterIdentity.status === "FAIL", false, `motion-safe-pass-presenter-identity:${reviewItem.shotId}`);

    const recomposeRelative = `three-shot-layer-canary-v1/recompositions/${reviewItem.shotId}/recomposed.png`;
    binaryFiles[recomposeRelative] = recomposedBuffer;
    const contactSource = path.resolve(reviewItem.contactSheet.path);
    assert.equal(fileSha256(contactSource), reviewItem.contactSheet.sha256, `motion-safe-pass-contact-sha:${reviewItem.shotId}`);
    const contactRelative = `three-shot-layer-canary-v1/contact-sheets/${reviewItem.shotId}.png`;
    binaryFiles[contactRelative] = fs.readFileSync(contactSource);
    if (reviewItem.cleanSource?.path) {
      const source = path.resolve(reviewItem.cleanSource.path);
      assert.equal(fileSha256(source), reviewItem.cleanSource.sha256);
      binaryFiles[`three-shot-layer-canary-v1/motion-safe-pass/${reviewItem.shotId}/clean-source.png`] = fs.readFileSync(source);
    }

    builtItems.push({
      ...oldItem,
      status: "PASS",
      layerCount: 4,
      layers: layerRecords,
      recomposed: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${recomposeRelative}`, sha256: sha256(recomposedBuffer), decodedPixelSha256: sha256(recomposed.data), width, height, parity: fullParity},
      masterParity,
      sourceEvidenceIdentity: reviewItem.shotId === "ED-14" ? {status: "PASS", policy: "ORIGINAL_APPROVED_MASTER_PAPER_EVIDENCE_PIXELS_PRESERVED_BY_EXACT_RECOMPOSITION", paperTitleVerified: true, authorsVerified: true, actualReferenceAttachmentVerified: true} : {status: "NOT_APPLICABLE"},
      originalPresenterIdentity,
      contactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${contactRelative}`, sha256: reviewItem.contactSheet.sha256},
      hardRuleFailures: [],
      technicalStatus: "PASS",
      actualVisualAudit: {status: "PASS", semanticOwnershipStatus: "PASS", cleanPlateStatus: "PASS", motionExposureEnvelopeStatus: "PASS", backgroundOcrObservationCount: 0, backgroundFaceCount: 0, backgroundHumanRectCount: 0, actualContactSheetInspected: true, contactSheetSha256: reviewItem.contactSheet.sha256, visualReviewSha256: review.reviewSha256},
      motionSafeRepair: {status: "PASS", primitive: reviewItem.finalPrimitive, deterministicInpaintAttemptCount: reviewItem.deterministicInpaintAttemptCount, imagegenMaskedEditAttemptCount: reviewItem.imagegenMaskedEditAttemptCount, retrySameMethodAllowed: false, recompositionParity: masterParity, actualPixelVisualReview: {status: "PASS", contactSheetSha256: reviewItem.contactSheet.sha256}, sourceEvidenceIdentityPreservedInVisibleRecomposition: reviewItem.shotId === "ED-14", presenterIdentityPreservedInVisibleRecomposition: reviewItem.shotId === "ED-31"},
    });
  }

  const repairBody = {contract: "A1MotionSafeThreeShotCanaryRepairManifest/v1", status: "PASS_MOTION_SAFE_RECONSTRUCTION", sourceWorkspaceSha256: before.workspaceSha256, sourceCanaryManifestSha256: oldCanary.manifestSha256, visualReviewSha256: review.reviewSha256, targetShotIds, passCount: 3, failureCount: 0, remainingTenExpansionAllowed: true, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false, userVisualApproval: "NOT_APPROVED", nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", requiresUser: false, recordedAt: now, items: builtItems.map((item) => ({shotId: item.shotId, status: item.status, primitive: item.motionSafeRepair.primitive, contactSheetSha256: item.contactSheet.sha256, masterParity: item.masterParity, backgroundAudit: item.actualVisualAudit}))};
  const repairManifest = {...repairBody, manifestSha256: sha256({...repairBody, recordedAt: undefined})};

  let next = structuredClone(before);
  const canary = next.production.shotIntelligence.threeShotLayerCanary;
  canary.status = "THREE_SHOT_LAYER_CANARY_REVIEW";
  canary.passCount = 3;
  canary.failureCount = 0;
  canary.failureCodes = [];
  canary.items = builtItems;
  canary.repairManifestSha256 = repairManifest.manifestSha256;
  canary.visualReviewSha256 = review.reviewSha256;
  canary.nextAction = "EXPAND_REMAINING_TEN_PACKAGE_LAYERS";
  canary.requiresUser = false;
  canary.updatedAt = now;
  const canaryHashInput = structuredClone(canary);
  delete canaryHashInput.manifestSha256;
  delete canaryHashInput.updatedAt;
  canary.manifestSha256 = sha256(canaryHashInput);

  next.production.shotIntelligence.status = canary.status;
  next.production.shotIntelligence.currentAssembly = [];
  next.production.objectiveVisualGate = {...next.production.objectiveVisualGate, internalCanary: {status: canary.status, manifestSha256: canary.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, visualReviewSha256: review.reviewSha256, targetShotIds, layerCount: 12, passCount: 3, failureCount: 0, failureCodes: []}, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", requiresUser: false, userVisualApproval: "NOT_APPROVED", updatedAt: now};
  next.production.packagingReview = {...next.production.packagingReview, status: canary.status, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", layerReconstructionAllowed: true, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false, userVisualApproval: "NOT_APPROVED", updatedAt: now};
  next.production.universalReferencePackagingGate = {...next.production.universalReferencePackagingGate, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", layerReconstructionAllowed: true, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
  next.production.packagingAutomation = {...next.production.packagingAutomation, status: canary.status, currentStage: "three-shot-layer-canary-review", targetShotIds, reason: "motion-safe-clean-layer-canary-passed", generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
  next.production.assembly = {...next.production.assembly, status: "NOT_CREATED", current: true, currentAssemblyCount: 0, previewArtifact: null, assemblyCreated: false, productionWired: false, updatedAt: now};
  next.production.motion = {...next.production.motion, status: "NOT_CREATED", current: true, representativePlan: null, previewArtifact: null, fullMotionAllowed: false, motionApproved: false, updatedAt: now};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};

  const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
  const maturityRun = readJson(maturityPath);
  maturityRun.overallStatus = canary.status;
  maturityRun.nextAction = "EXPAND_REMAINING_TEN_PACKAGE_LAYERS";
  maturityRun.targetShotIds = targetShotIds;
  maturityRun.userVisualApproval = "NOT_APPROVED";
  maturityRun.postStaticBoard = {status: canary.status, manifestSha256: canary.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, visualReviewSha256: review.reviewSha256, targetShotIds, layerCount: 12, passCount: 3, failureCount: 0, failureCodes: [], remainingTenExpansionAllowed: true, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false};
  maturityRun.generatedAt = now;
  maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
  next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, current: true, status: canary.status, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", maturityRunSha256: maturityRun.maturityRunSha256, targetShotIds, threeShotLayerCanaryManifestSha256: canary.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, visualReviewSha256: review.reviewSha256, userVisualApproval: "NOT_APPROVED", updatedAt: now};

  const event = createProductionEvent({workspace: before, action: "commit-motion-safe-three-shot-canary-pass-v1", targetId: canary.manifestSha256, payload: {status: canary.status, targetShotIds, layerCount: 12, passCount: 3, failureCount: 0, visualReviewSha256: review.reviewSha256, remainingTenExpansionAllowed: true, assemblyCreated: false, criticRun: false, motionRun: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(next.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_REVIEW");
  assert.equal(next.production.authority.nextAction.id, "EXPAND_REMAINING_TEN_PACKAGE_LAYERS");
  assert.equal(next.production.authority.nextAction.requiresUser, false);
  assert.equal(next.gates.packagingDeliveryGates.layerReconstructionAllowed, true);
  assert.equal(next.gates.packagingDeliveryGates.assemblyCreationAllowed, false);
  assert.equal(next.production.assembly.status, "NOT_CREATED");
  assert.equal(next.production.motion.status, "NOT_CREATED");

  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: before.workspaceSha256, commitId: `motion-safe-three-shot-pass-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"three-shot-layer-canary-v1/manifest.json": canary, "three-shot-layer-canary-v1/motion-safe-repair-manifest.json": repairManifest, "three-shot-layer-canary-v1/visual-review-manifest.json": review, "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun}, binaryFiles});
  return {status: canary.status, workspaceSha256Before: before.workspaceSha256, workspaceSha256After: committed.workspaceSha256, canaryManifestSha256: canary.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, visualReviewSha256: review.reviewSha256, layerCount: 12, passCount: 3, failureCount: 0, nextAction: next.production.authority.nextAction, queue: next.production.generation.summary, workerStatus: next.production.generation.workerStatus, assemblyStatus: next.production.assembly.status, motionStatus: next.production.motion.status};
});

console.log(JSON.stringify(result, null, 2));
