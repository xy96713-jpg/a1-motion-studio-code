#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";
import {
  A1_REMAINING_TEN_ADMISSION_CONTRACT,
  A1_SHOT_LAYER_CANDIDATE_CONTRACT,
  A1_SHOT_LAYER_REVIEW_CONTRACT,
  MOTION_SAFE_LAYER_KINDS,
  MOTION_SAFE_SHOT_IDS,
  assertCandidateShape,
  candidateFingerprint,
  fileSha256,
  hashJson,
} from "../apps/studio-next/src/lib/a1-motion-safe-shot-candidate-v4.mjs";
import {
  persistProjectState,
  projectDirs,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir, artifactDir} = projectDirs(appRoot);
const candidateRelativeRoot = "remaining-ten-motion-safe-v4";
const formalRelativeRoot = "whole-film-layer-reconstruction-v4";
const reviewRelative = `${candidateRelativeRoot}/visual-review-contract.json`;
const formalManifestRelative = `${formalRelativeRoot}/manifest.json`;
const formalAuditRelative = `${formalRelativeRoot}/actual-pixel-audit.json`;
const formalAdmissionRelative = `${formalRelativeRoot}/remaining-ten-admission.json`;
const maturityRelative = "golden-film-visual-system-maturity-v1/maturity-run.json";
const expectedWorkspaceDefault = "a711dfbedd60287bc57337be476fd4f3c86d19115541eddf3093f96df1846a49";
const args = process.argv.slice(2);
const valueOf = (name, fallback = null) => {
  const prefix = `${name}=`;
  const inline = args.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicPath = (relative) => path.join(publicDir, relative);
const artifactPath = (relative) => path.join(artifactDir, relative);
const publicUrl = (relative) => `/generated/system-line/editorial-asset-workbench-v1/${relative.split(path.sep).join("/")}`;
const fileForPublicUrl = (url) => {
  const prefix = "/generated/system-line/editorial-asset-workbench-v1/";
  if (!String(url || "").startsWith(prefix)) throw new Error(`admission-url-invalid:${url}`);
  const file = path.resolve(publicDir, String(url).slice(prefix.length));
  const rootPath = path.resolve(publicDir);
  if (file !== rootPath && !file.startsWith(`${rootPath}${path.sep}`)) throw new Error(`admission-file-outside-public-root:${url}`);
  return file;
};
const sha = (file) => {
  if (!fs.existsSync(file)) throw new Error(`admission-file-missing:${file}`);
  return fileSha256(file);
};
const copyPublicBinary = (sourceUrl, destinationRelative, binaryFiles) => {
  const source = fileForPublicUrl(sourceUrl);
  const bytes = fs.readFileSync(source);
  binaryFiles[destinationRelative] = bytes;
  return {publicUrl: publicUrl(destinationRelative), sha256: shaFromBytes(bytes)};
};
const shaFromBytes = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const jsonSafe = (value) => JSON.parse(JSON.stringify(value));
const pathExistsInsidePublic = (url) => {
  const file = fileForPublicUrl(url);
  if (!fs.existsSync(file)) throw new Error(`admission-referenced-file-missing:${file}`);
  return file;
};
const jsonAt = (relative) => {
  const file = publicPath(relative);
  if (!fs.existsSync(file)) throw new Error(`admission-json-missing:${file}`);
  return readJson(file);
};

async function decodedSha(url) {
  const file = pathExistsInsidePublic(url);
  const decoded = await sharp(file).ensureAlpha().raw().toBuffer();
  return shaFromBytes(decoded);
}

function expectedFormalLayerRelative(shotId, kind) {
  return `${formalRelativeRoot}/layers/${shotId}/${kind.toLowerCase()}.png`;
}

function expectedFormalRecomposedRelative(shotId) {
  return `${formalRelativeRoot}/recompositions/${shotId}/recomposed.png`;
}

function reviewEvidenceToFormal(candidate, shotId, binaryFiles) {
  const evidence = candidate.reviewEvidence;
  const base = `${formalRelativeRoot}/review/${shotId}`;
  const overview = copyPublicBinary(evidence.fullBackgroundOverview.publicUrl, `${base}/full-background-overview.png`, binaryFiles);
  const exposure = copyPublicBinary(evidence.exposure80px.publicUrl, `${base}/motion-exposure-80px.png`, binaryFiles);
  const changedConnectedRegions = (evidence.changedConnectedRegions || []).map((region) => {
    const before = copyPublicBinary(region.before.publicUrl, `${base}/${region.regionId}-before.png`, binaryFiles);
    const after = copyPublicBinary(region.after.publicUrl, `${base}/${region.regionId}-after.png`, binaryFiles);
    return {regionId: region.regionId, bounds: region.bounds, before, after};
  });
  return {...evidence, fullBackgroundOverview: overview, exposure80px: {...evidence.exposure80px, ...exposure}, changedConnectedRegions};
}

async function formalizeCandidate(candidate, binaryFiles, reviewItem) {
  const shotId = candidate.shotId;
  const layerRecords = [];
  for (const kind of MOTION_SAFE_LAYER_KINDS) {
    const sourceLayer = candidate.layers.find((layer) => layer.kind === kind);
    assert.ok(sourceLayer, `${shotId}-${kind}-candidate-layer-missing`);
    const sourceFile = fileForPublicUrl(sourceLayer.path || sourceLayer.publicUrl);
    assert.equal(sha(sourceFile), sourceLayer.sha256, `${shotId}-${kind}-encoded-sha`);
    assert.equal(await decodedSha(sourceLayer.path || sourceLayer.publicUrl), sourceLayer.decodedPixelSha256, `${shotId}-${kind}-decoded-sha`);
    const relative = expectedFormalLayerRelative(shotId, kind);
    const bytes = fs.readFileSync(sourceFile);
    binaryFiles[relative] = bytes;
    layerRecords.push({...sourceLayer, path: publicUrl(relative), publicUrl: publicUrl(relative), sha256: shaFromBytes(bytes), sourceCandidatePath: sourceLayer.path || sourceLayer.publicUrl});
  }
  const recomposedSource = fileForPublicUrl(candidate.recomposed.path);
  assert.equal(sha(recomposedSource), candidate.recomposed.sha256, `${shotId}-recomposed-encoded-sha`);
  assert.equal(await decodedSha(candidate.recomposed.path), candidate.recomposed.decodedPixelSha256, `${shotId}-recomposed-decoded-sha`);
  const recomposedRelative = expectedFormalRecomposedRelative(shotId);
  binaryFiles[recomposedRelative] = fs.readFileSync(recomposedSource);
  const maskFields = ["actorUnion", "vacancyRepairMask", "cleanPlateChangeMask", "motionExposureEnvelope"];
  const formalMasks = {};
  for (const field of maskFields) {
    const source = fileForPublicUrl(candidate[field].path);
    assert.equal(sha(source), candidate[field].sha256, `${shotId}-${field}-sha`);
    const relative = `${formalRelativeRoot}/masks/${shotId}/${field}.png`;
    binaryFiles[relative] = fs.readFileSync(source);
    formalMasks[field] = {...candidate[field], path: publicUrl(relative), publicUrl: publicUrl(relative), sourceCandidatePath: candidate[field].path};
  }
  const formalReviewEvidence = reviewEvidenceToFormal(candidate, shotId, binaryFiles);
  const reviewEvidenceSha256 = hashJson(formalReviewEvidence);
  return {
    contract: "A1WholeFilmLayerItem/v3",
    candidateContract: A1_SHOT_LAYER_CANDIDATE_CONTRACT,
    shotId,
    status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS",
    admissionStatus: "ADMITTED_AFTER_EXPLICIT_VISUAL_REVIEW",
    sourceWorkspaceSha256: candidate.source.workspaceSha256,
    sourcePreflightSha256: candidate.source.sourcePreflightSha256,
    sourceSelectedMasterSetSha256: candidate.source.sourceSelectedMasterSetSha256,
    visualMasterRef: candidate.source.visualMasterRef,
    selectedLookMaster: {sha256: candidate.masterSha256},
    candidateId: candidate.candidateId,
    candidateFingerprint: candidate.fingerprint,
    recipeKey: candidate.recipeKey,
    methodSha256: candidate.methodSha256,
    detectorSha256: candidate.detectorSha256,
    masterSha256: candidate.masterSha256,
    cleanSha256: candidate.cleanSha256,
    actorUnionSha256: candidate.actorUnionSha256,
    actorEditSha256: candidate.actorEditSha256,
    presenterIdentity: candidate.presenterIdentity,
    layerCount: layerRecords.length,
    layers: layerRecords,
    actorUnion: formalMasks.actorUnion,
    vacancyRepairMask: formalMasks.vacancyRepairMask,
    cleanPlateChangeMask: formalMasks.cleanPlateChangeMask,
    motionExposureEnvelope: formalMasks.motionExposureEnvelope,
    recomposed: {...candidate.recomposed, path: publicUrl(recomposedRelative), publicUrl: publicUrl(recomposedRelative), sourceCandidatePath: candidate.recomposed.path},
    repair: candidate.repair,
    backgroundAudit: candidate.backgroundAudit,
    technicalStatus: "TECHNICAL_PASS",
    visualReview: {
      contract: A1_SHOT_LAYER_REVIEW_CONTRACT,
      decision: reviewItem.decision,
      machineGateStatus: reviewItem.machineGateStatus,
      machineVisualStatus: reviewItem.machineVisualStatus,
      reviewEvidenceSha256,
      sourceReviewItemSha256: reviewItem.evidenceSha256,
      identityGate: reviewItem.identityGate,
    },
    visualApprovalStatus: "VISUAL_PASS",
    actualPixelVisualReview: "VISUAL_PASS",
    productionStateWritten: false,
  };
}

function formalizeCanaryItem(item, binaryFiles, workspace, sourceReview) {
  const shotId = item.shotId;
  const layers = item.layers.map((layer) => {
    const source = fileForPublicUrl(layer.publicUrl || layer.path);
    assert.equal(sha(source), layer.sha256, `${shotId}-${layer.kind}-canary-encoded-sha`);
    const relative = expectedFormalLayerRelative(shotId, layer.kind);
    binaryFiles[relative] = fs.readFileSync(source);
    return {...layer, path: publicUrl(relative), publicUrl: publicUrl(relative), sourceCanaryPath: layer.publicUrl || layer.path};
  });
  const recomposedSource = fileForPublicUrl(item.recomposed.publicUrl || item.recomposed.path);
  assert.equal(sha(recomposedSource), item.recomposed.sha256, `${shotId}-canary-recomposed-sha`);
  const recomposedRelative = expectedFormalRecomposedRelative(shotId);
  binaryFiles[recomposedRelative] = fs.readFileSync(recomposedSource);
  const reviewEvidence = item.contactSheet
    ? {contract: "A1ThreeShotLayerCanaryVisualReview/v1", contactSheet: {...item.contactSheet, sourceCanaryPath: item.contactSheet.publicUrl, formalPublicUrl: publicUrl(`${formalRelativeRoot}/review/${shotId}/canary-contact-sheet.png`)}, status: "VISUAL_PASS"}
    : null;
  if (item.contactSheet) copyPublicBinary(item.contactSheet.publicUrl, `${formalRelativeRoot}/review/${shotId}/canary-contact-sheet.png`, binaryFiles);
  return {
    ...structuredClone(item),
    contract: "A1WholeFilmLayerItem/v3",
    candidateContract: "A1ThreeShotLayerCanaryItem/v1",
    status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS",
    admissionStatus: "PRESERVED_EXISTING_CANARY_AFTER_EXPLICIT_VISUAL_REVIEW",
    sourceWorkspaceSha256: workspace.workspaceSha256,
    selectedLookMaster: item.selectedLookMaster,
    layerCount: layers.length,
    layers,
    recomposed: {...item.recomposed, path: publicUrl(recomposedRelative), publicUrl: publicUrl(recomposedRelative), sourceCanaryPath: item.recomposed.publicUrl},
    technicalStatus: "TECHNICAL_PASS",
    visualReview: {contract: "A1ThreeShotLayerCanaryVisualReview/v1", decision: "VISUAL_PASS", sourceReviewSha256: sourceReview?.visualReviewSha256 || item.actualVisualAudit?.visualReviewSha256 || null, actualPixelAuditSha256: item.actualVisualAudit?.contactSheetSha256 || null},
    visualApprovalStatus: "VISUAL_PASS",
    actualPixelVisualReview: item.actualVisualAudit || {status: "PASS"},
    productionStateWritten: false,
    current: true,
    authorityScope: "CURRENT",
  };
}

function updatePackagePlans(workspace, items, manifestSha256, reviewSha256) {
  const byShot = new Map(items.map((item) => [item.shotId, item]));
  workspace.production.shotIntelligence.packageAssetKitPlans = workspace.production.shotIntelligence.packageAssetKitPlans.map((plan) => {
    const item = byShot.get(plan.shotId);
    if (!item) return plan;
    return {
      ...plan,
      deterministicWholeFilmLayers: {
        contract: "A1PackageDeterministicWholeFilmLayerBinding/v1",
        status: "ADMITTED_AFTER_EXPLICIT_VISUAL_REVIEW",
        shotId: plan.shotId,
        candidateContract: item.candidateContract,
        candidateId: item.candidateId || null,
        candidateFingerprint: item.candidateFingerprint || null,
        manifestSha256,
        visualReviewContract: A1_SHOT_LAYER_REVIEW_CONTRACT,
        visualReviewSha256: reviewSha256,
        visualReviewStatus: "VISUAL_PASS",
        technicalStatus: "TECHNICAL_PASS",
        layerCount: item.layerCount,
        layerShas: item.layers.map((layer) => ({kind: layer.kind, sha256: layer.sha256, decodedPixelSha256: layer.decodedPixelSha256})),
        recomposedSha256: item.recomposed.sha256,
        productionWired: false,
        assemblyCreated: false,
        motionCreated: false,
        userVisualApproval: "NOT_APPROVED",
      },
    };
  });
}

function buildMaturityRun(review, manifest, now) {
  const file = publicPath(maturityRelative);
  const run = readJson(file);
  const next = {
    ...run,
    current: true,
    overallStatus: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS",
    nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION",
    targetShotIds: [],
    userVisualApproval: "NOT_APPROVED",
    postStaticBoard: {
      status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS",
      manifestSha256: manifest.manifestSha256,
      visualReviewSha256: review.reviewSha256,
      targetShotIds: [],
      packageCount: 13,
      layerCount: 52,
      passCount: 13,
      failureCount: 0,
      failureCodes: [],
      remainingTenExpansionAllowed: false,
      assemblyCreationAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      actualVisualAuditSha256: manifest.actualPixelAuditSha256,
    },
    runtimeFreeze: {...(run.runtimeFreeze || {}), workerStatus: "frozen", queued: 0, running: 0, generationAllowed: false, automaticDispatchAllowed: false},
    generatedAt: now,
  };
  const hashInput = structuredClone(next);
  delete hashInput.maturityRunSha256;
  next.maturityRunSha256 = hashJson(jsonSafe(hashInput));
  return next;
}

async function main() {
  const expectedWorkspaceSha256 = valueOf("--expected-workspace-sha", expectedWorkspaceDefault);
  const result = await withProjectLock(appRoot, async () => {
    const current = readProjectWorkspace(appRoot);
    if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`admission-workspace-cas-mismatch:${expectedWorkspaceSha256}:${current.workspaceSha256}`);
    const reviewFile = publicPath(reviewRelative);
    const review = readJson(reviewFile);
    if (review.contract !== A1_SHOT_LAYER_REVIEW_CONTRACT || review.status !== "VISUAL_PASS" || review.machineGateStatus !== "TECHNICAL_PASS" || review.machineVisualStatus !== "REVIEW_REQUIRED" || review.productionStateWritten !== false || review.admissionAllowed !== true) throw new Error("admission-review-contract-invalid");
    if (review.sourceWorkspaceSha256 !== current.workspaceSha256) throw new Error("admission-review-workspace-sha-invalid");
    if (review.reviewedShotIds.join(",") !== [...MOTION_SAFE_SHOT_IDS].join(",")) throw new Error("admission-review-shot-order-invalid");
    const reviewSha256 = review.reviewSha256;
    assert.match(String(reviewSha256), /^[a-f0-9]{64}$/u, "admission-review-sha-invalid");
    const candidates = [];
    const candidateByShot = new Map();
    const preflightPath = "/private/tmp/a1-remaining-ten-motion-safe-v13/preflight.json";
    const preflight = readJson(preflightPath);
    const preflightSha256 = fileSha256(preflightPath);
    if (preflight.contract !== "A1RemainingTenMotionSafePreflight/v3" || preflight.sourceWorkspaceSha256 !== current.workspaceSha256) throw new Error("admission-preflight-invalid");
    const preflightByShot = new Map(preflight.items.map((item) => [item.shotId, item]));
    for (const shotId of MOTION_SAFE_SHOT_IDS) {
      const candidateFile = publicPath(`${candidateRelativeRoot}/candidates/${shotId}/candidate.json`);
      const candidate = readJson(candidateFile);
      assertCandidateShape(candidate);
      const reviewItem = review.items.find((item) => item.shotId === shotId);
      if (!reviewItem || reviewItem.candidateId !== candidate.candidateId || reviewItem.fingerprint !== candidate.fingerprint || reviewItem.candidateManifestSha256 !== fileSha256(candidateFile)) throw new Error(`admission-review-candidate-binding-invalid:${shotId}`);
      if (candidate.source.workspaceSha256 !== current.workspaceSha256 || candidate.source.sourcePreflightSha256 !== preflightSha256 || candidate.source.sourceSelectedMasterSetSha256 !== current.production.objectiveVisualGate.selectedMasterSetSha256) throw new Error(`admission-candidate-source-sha-invalid:${shotId}`);
      const selectedMaster = current.production.objectiveVisualGate.selectedMasters.find((item) => item.shotId === shotId);
      const preflightItem = preflightByShot.get(shotId);
      if (!selectedMaster || !preflightItem) throw new Error(`admission-source-binding-missing:${shotId}`);
      assert.equal(candidate.masterSha256, selectedMaster.artifactSha256, `${shotId}-selected-master-sha`);
      assert.equal(candidate.cleanSha256, preflightItem.cleanSource.sha256, `${shotId}-clean-sha`);
      assert.equal(candidate.actorUnionSha256, preflightItem.actorUnion.sha256, `${shotId}-actor-union-sha`);
      assert.equal(candidate.motionExposureEnvelope.sha256, preflightItem.motionExposureEnvelope.sha256, `${shotId}-exposure-envelope-sha`);
      assert.equal(candidate.methodSha256, hashJson(candidate.method), `${shotId}-method-sha`);
      assert.equal(candidate.detectorSha256, hashJson(candidate.detector), `${shotId}-detector-sha`);
      const expectedFingerprint = candidateFingerprint({workspaceSha256: current.workspaceSha256, sourceSelectedMasterSetSha256: current.production.objectiveVisualGate.selectedMasterSetSha256, visualMasterRef: candidate.source.visualMasterRef, shotId, recipeKey: candidate.recipeKey, masterSha256: candidate.masterSha256, cleanSha256: candidate.cleanSha256, actorUnionSha256: candidate.actorUnionSha256, actorEditSha256: candidate.actorEditSha256, methodSha256: candidate.methodSha256, detectorSha256: candidate.detectorSha256});
      assert.equal(candidate.fingerprint, expectedFingerprint, `${shotId}-fingerprint`);
      assert.equal(reviewItem.decision, "VISUAL_PASS", `${shotId}-visual-review-decision`);
      assert.equal(reviewItem.machineGateStatus, "TECHNICAL_PASS", `${shotId}-machine-gate`);
      if (shotId === "ED-13") {
        assert.equal(reviewItem.identityGate?.decision, "VISUAL_PASS", "ED-13-identity-gate-decision");
        assert.match(String(reviewItem.identityGate?.sourceMatteSha256), /^[a-f0-9]{64}$/u, "ED-13-identity-matte-sha");
      }
      candidates.push(candidate);
      candidateByShot.set(shotId, {candidate, reviewItem});
    }
    const binaryFiles = {};
    const canary = current.production.shotIntelligence.threeShotLayerCanary;
    if (canary?.itemCount !== 3 || canary.layerCount !== 12 || canary.passCount !== 3 || canary.failureCount !== 0) throw new Error("admission-canary-source-invalid");
    const canaryReview = {visualReviewSha256: canary.visualReviewSha256, actualVisualAuditSha256: canary.actualVisualAuditSha256};
    const canaryItems = canary.items.map((item) => formalizeCanaryItem(item, binaryFiles, current, canaryReview));
    const candidateItems = [];
    for (const shotId of MOTION_SAFE_SHOT_IDS) {
      const {candidate, reviewItem} = candidateByShot.get(shotId);
      candidateItems.push(await formalizeCandidate(candidate, binaryFiles, reviewItem));
    }
    const allItems = [...canaryItems, ...candidateItems].sort((a, b) => a.shotId.localeCompare(b.shotId));
    assert.equal(allItems.length, 13, "admission-package-count");
    assert.equal(allItems.reduce((sum, item) => sum + item.layerCount, 0), 52, "admission-layer-count");
    const now = new Date().toISOString();
    const reviewFileSha256 = fileSha256(reviewFile);
    const manifestBody = {
      contract: "A1WholeFilmLayerReconstruction/v2",
      version: 2,
      status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS",
      current: true,
      authorityScope: "CURRENT",
      sourceWorkspaceSha256: current.workspaceSha256,
      sourcePackageBoardSha256: current.production.objectiveVisualGate.packageBoardSha256,
      sourceTimelineBoardSha256: current.production.objectiveVisualGate.timelineBoardSha256,
      sourceSelectedMasterSetSha256: current.production.objectiveVisualGate.selectedMasterSetSha256,
      objectiveVisualGateSha256: current.production.objectiveVisualGate.gateSha256,
      sourceCanaryManifestSha256: canary.manifestSha256,
      sourceCanaryVisualReviewSha256: canary.visualReviewSha256,
      expansionCandidateContract: A1_SHOT_LAYER_CANDIDATE_CONTRACT,
      visualReviewContract: A1_SHOT_LAYER_REVIEW_CONTRACT,
      atomicAdmissionContract: A1_REMAINING_TEN_ADMISSION_CONTRACT,
      remainingTenCandidateFingerprints: Object.fromEntries(candidates.map((candidate) => [candidate.shotId, candidate.fingerprint])),
      remainingTenVisualReviewSha256: reviewSha256,
      remainingTenVisualReviewFileSha256: reviewFileSha256,
      packageCount: 13,
      itemCount: 13,
      layerCount: 52,
      systemPixelPassCount: 13,
      failureCount: 0,
      items: allItems,
      formalOutputRoot: formalRelativeRoot,
      assemblyCreated: false,
      criticRun: false,
      motionRun: false,
      userVisualApproval: "NOT_APPROVED",
      systemVisualApproval: "EXPLICIT_DELEGATED_VISUAL_REVIEW",
      productionWired: false,
      aeLevelProven: false,
      assemblyCreationAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION",
      productionStateWritten: false,
      generatedAt: now,
    };
    const manifest = {...manifestBody, manifestSha256: hashJson(jsonSafe(manifestBody))};
    const auditBody = {
      contract: "A1WholeFilmLayerActualPixelAudit/v2",
      status: "PASS",
      current: true,
      authorityScope: "CURRENT",
      sourceManifestSha256: manifest.manifestSha256,
      sourceWorkspaceSha256: current.workspaceSha256,
      candidateContract: A1_SHOT_LAYER_CANDIDATE_CONTRACT,
      reviewContract: A1_SHOT_LAYER_REVIEW_CONTRACT,
      admissionContract: A1_REMAINING_TEN_ADMISSION_CONTRACT,
      machineGateStatus: "TECHNICAL_PASS",
      visualReviewStatus: "VISUAL_PASS",
      automaticVisualPassMappingForbidden: true,
      packageCount: 13,
      layerCount: 52,
      systemPixelPassCount: 13,
      failureCount: 0,
      reviewedShotIds: allItems.map((item) => item.shotId),
      cacheHitShotIds: review.cacheHitShotIds,
      cacheMissShotIds: review.cacheMissShotIds,
      ed07Review: review.ed07RepairReview,
      ed13IdentityGate: review.ed13IdentityGate,
      userVisualApproval: "NOT_APPROVED",
      systemVisualApproval: "EXPLICIT_DELEGATED_VISUAL_REVIEW",
      productionWired: false,
      generatedAt: now,
    };
    const audit = {...auditBody, auditSha256: hashJson(jsonSafe(auditBody))};
    const admissionBody = {
      contract: A1_REMAINING_TEN_ADMISSION_CONTRACT,
      version: 1,
      status: "ADMITTED",
      atomic: true,
      compareAndSwap: {expectedWorkspaceSha256, observedWorkspaceSha256: current.workspaceSha256},
      sourceCandidateContract: A1_SHOT_LAYER_CANDIDATE_CONTRACT,
      sourceReviewContract: A1_SHOT_LAYER_REVIEW_CONTRACT,
      sourceReviewSha256: reviewSha256,
      sourceReviewFileSha256: reviewFileSha256,
      sourceCandidateFingerprints: manifest.remainingTenCandidateFingerprints,
      cacheHitCount: review.cacheHitShotIds.length,
      cacheMissCount: review.cacheMissShotIds.length,
      cacheHitShotIds: review.cacheHitShotIds,
      cacheMissShotIds: review.cacheMissShotIds,
      formalPackageCount: manifest.packageCount,
      formalLayerCount: manifest.layerCount,
      formalManifestSha256: manifest.manifestSha256,
      actualPixelAuditSha256: audit.auditSha256,
      assemblyCreated: false,
      motionCreated: false,
      productionWired: false,
      productionStateWritten: false,
      generatedAt: now,
    };
    const admission = {...admissionBody, admissionSha256: hashJson(jsonSafe(admissionBody))};
    let next = structuredClone(current);
    const shotIntelligence = next.production.shotIntelligence;
    shotIntelligence.wholeFilmLayerReconstruction = manifest;
    shotIntelligence.wholeFilmLayerActualPixelAudit = audit;
    shotIntelligence.threeShotLayerCanary = {...shotIntelligence.threeShotLayerCanary, current: false, authorityScope: "HISTORY_READ_ONLY", historyReadOnly: true, supersededBy: manifest.manifestSha256};
    const existingMaturity = next.production.goldenFilmVisualSystemMaturity;
    next.production.goldenFilmVisualSystemMaturity = {
      ...existingMaturity,
      status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS",
      nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION",
      targetShotIds: [],
      packageBoardSha256: next.production.objectiveVisualGate.packageBoardSha256,
      timelineBoardSha256: next.production.objectiveVisualGate.timelineBoardSha256,
      selectedMasterSetSha256: next.production.objectiveVisualGate.selectedMasterSetSha256,
      objectiveVisualGateSha256: next.production.objectiveVisualGate.gateSha256,
      userVisualApproval: "NOT_APPROVED",
      wholeFilmLayerManifestSha256: manifest.manifestSha256,
      wholeFilmLayerActualPixelAuditSha256: audit.auditSha256,
      remainingTenCandidateContract: A1_SHOT_LAYER_CANDIDATE_CONTRACT,
      remainingTenVisualReviewSha256: reviewSha256,
      remainingTenAdmissionSha256: admission.admissionSha256,
      updatedAt: now,
    };
    next.production.objectiveVisualGate = {
      ...next.production.objectiveVisualGate,
      targetShotIds: [],
      nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION",
      requiresUser: true,
      internalCanaryAllowed: false,
      wholeFilmLayerManifestSha256: manifest.manifestSha256,
      wholeFilmLayerActualPixelAuditSha256: audit.auditSha256,
      remainingTenVisualReviewSha256: reviewSha256,
      updatedAt: now,
    };
    next.production.assembly = {...next.production.assembly, status: "NOT_CREATED", current: true, assemblyCreated: false, productionWired: false, currentAssemblyCount: 0, previewArtifact: null, userVisualApproval: "NOT_APPROVED", updatedAt: now};
    next.production.motion = {...next.production.motion, status: "NOT_CREATED", current: true, representativePlan: null, previewArtifact: null, fullMotionAllowed: false, motionApproved: false, updatedAt: now};
    next.production.packagingAutomation = {...next.production.packagingAutomation, status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS", currentStage: "whole-film-layer-actual-pixel-pass-motion-locked", targetShotIds: [], generationFreeze: {...next.production.packagingAutomation.generationFreeze, frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    // The package-look runtime keeps its schema status in the canary family;
    // the current lifecycle/authority transition is derived from the bound
    // wholeFilmLayerReconstruction v2 manifest below.  Do not inject the
    // lifecycle terminal status into the older runtime enum.
    updatePackagePlans(next, allItems, manifest.manifestSha256, reviewSha256);
    next.gates = {...next.gates, acceptedShotIrAllowed: false, motionPrototypeAllowed: false, finalRenderAllowed: false, blindFullFilmGenerationAllowed: false, packagingDeliveryGates: {...next.gates.packagingDeliveryGates, layerReconstructionAllowed: false, assemblyCreationAllowed: false, criticReviewAllowed: false, motionAllowed: false, productionWired: false, motionApproved: false, status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS"}};
    next.production.eventLedger.eventCount += 1;
    const event = createProductionEvent({workspace: current, action: "admit-remaining-ten-motion-safe-v4", targetId: MOTION_SAFE_SHOT_IDS.join(","), payload: {admissionContract: A1_REMAINING_TEN_ADMISSION_CONTRACT, admissionSha256: admission.admissionSha256, formalManifestSha256: manifest.manifestSha256, actualPixelAuditSha256: audit.auditSha256, reviewSha256, cacheHitCount: review.cacheHitShotIds.length, cacheMissCount: review.cacheMissShotIds.length, formalPackageCount: 13, formalLayerCount: 52, assemblyCreated: false, motionCreated: false}, now});
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const run = buildMaturityRun(review, manifest, now);
    next.production.goldenFilmVisualSystemMaturity.maturityRunSha256 = run.maturityRunSha256;
    next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const lifecycleCheck = next.production.shotIntelligence.wholeFilmLayerReconstruction;
    assert.equal(lifecycleCheck.status, "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS", "admission-recalculated-status");
    assert.equal(next.production.shotIntelligence.wholeFilmLayerActualPixelAudit.sourceManifestSha256, lifecycleCheck.manifestSha256, "admission-recalculated-audit-binding");
    assert.equal(next.production.assembly.status, "NOT_CREATED", "admission-assembly-created");
    assert.equal(next.production.motion.status, "NOT_CREATED", "admission-motion-created");
    assert.equal(next.production.assembly.productionWired, false, "admission-production-wired");
    assert.equal(next.production.generation.summary.queued, 0, "admission-queue-queued");
    assert.equal(next.production.generation.summary.running, 0, "admission-queue-running");
    assert.equal(next.production.generation.workerStatus, "frozen", "admission-worker-state");
    assert.equal(next.production.authority.nextAction.id, "AWAIT_MOTION_STAGE_AUTHORIZATION", "admission-authority-next-action");
    assert.deepEqual(next.production.authority.nextAction.targetShotIds, [], "admission-authority-targets");
    const committed = persistProjectState(appRoot, next, {
      event,
      expectedWorkspaceSha256: current.workspaceSha256,
      commitId: `admit-remaining-ten-motion-safe-v4-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
      files: {[formalManifestRelative]: manifest, [formalAuditRelative]: audit, [formalAdmissionRelative]: admission, [maturityRelative]: run},
      binaryFiles,
    });
    return {status: "ADMITTED", commitId: committed.commitId, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, formalManifestSha256: manifest.manifestSha256, actualPixelAuditSha256: audit.auditSha256, admissionSha256: admission.admissionSha256, reviewSha256, packageCount: 13, layerCount: 52, cacheHitCount: review.cacheHitShotIds.length, cacheMissCount: review.cacheMissShotIds.length, failedShotIds: [], assemblyCreated: false, motionCreated: false, productionWired: false};
  });
  console.log(JSON.stringify(result, null, 2));
}

await main();
