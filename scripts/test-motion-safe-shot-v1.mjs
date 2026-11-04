#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";
import {
  A1_SHOT_LAYER_CANDIDATE_CONTRACT,
  A1_SHOT_LAYER_REVIEW_CONTRACT,
  MOTION_SAFE_LAYER_KINDS,
  MOTION_SAFE_SHOT_IDS,
  assertCandidateShape,
  fileSha256,
  hashJson,
} from "../apps/studio-next/src/lib/a1-motion-safe-shot-candidate-v4.mjs";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir, artifactDir} = projectDirs(appRoot);
const systemProgressDir = path.dirname(artifactDir);
const candidateRoot = "remaining-ten-motion-safe-v4";
const formalRoot = "whole-film-layer-reconstruction-v4";
const urlToFile = (url) => {
  const prefix = "/generated/system-line/editorial-asset-workbench-v1/";
  assert.ok(String(url).startsWith(prefix), `public-url-prefix:${url}`);
  const file = path.resolve(publicDir, String(url).slice(prefix.length));
  assert.ok(file.startsWith(`${path.resolve(publicDir)}${path.sep}`), `public-url-root:${url}`);
  assert.ok(fs.existsSync(file), `artifact-file-exists:${file}`);
  return file;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readPublicJson = (relative) => readJson(path.join(publicDir, relative));
const readArtifactJson = (relative) => readJson(path.join(artifactDir, relative));
const decodedSha = async (url) => {
  const decoded = await sharp(urlToFile(url)).ensureAlpha().raw().toBuffer();
  return fileSha256FromBytes(decoded);
};
const fileSha256FromBytes = (bytes) => {
  return crypto.createHash("sha256").update(bytes).digest("hex");
};

async function main() {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.match(workspace.workspaceSha256, /^[a-f0-9]{64}$/u, "workspace-admitted-sha");
  const review = readPublicJson(`${candidateRoot}/visual-review-contract.json`);
  assert.equal(review.contract, A1_SHOT_LAYER_REVIEW_CONTRACT);
  assert.equal(review.status, "VISUAL_PASS");
  assert.equal(review.machineGateStatus, "TECHNICAL_PASS");
  assert.equal(review.machineVisualStatus, "REVIEW_REQUIRED");
  assert.equal(review.automaticVisualPassMappingForbidden, true);
  assert.deepEqual(review.cacheMissShotIds, ["ED-07"]);
  assert.equal(review.cacheHitShotIds.length, 9);
  assert.equal(review.productionStateWritten, false);
  for (const shotId of MOTION_SAFE_SHOT_IDS) {
    const candidate = readPublicJson(`${candidateRoot}/candidates/${shotId}/candidate.json`);
    assertCandidateShape(candidate);
    // Candidates are immutable inputs to the admission CAS. Their source
    // workspace SHA is the pre-admission snapshot; the formal manifest below
    // binds the post-admission workspace SHA.
    assert.equal(candidate.source.workspaceSha256, review.sourceWorkspaceSha256, `${shotId}-candidate-source-workspace-sha`);
    assert.equal(candidate.source.sourceSelectedMasterSetSha256, workspace.production.objectiveVisualGate.selectedMasterSetSha256, `${shotId}-master-set-sha`);
    assert.equal(candidate.layers.length, MOTION_SAFE_LAYER_KINDS.length, `${shotId}-layer-count`);
    for (const layer of candidate.layers) {
      const file = urlToFile(layer.publicUrl || layer.path);
      assert.equal(fileSha256(file), layer.sha256, `${shotId}-${layer.kind}-encoded-pixel-sha`);
      assert.equal(await decodedSha(layer.publicUrl || layer.path), layer.decodedPixelSha256, `${shotId}-${layer.kind}-decoded-pixel-sha`);
    }
    for (const field of ["actorUnion", "vacancyRepairMask", "cleanPlateChangeMask", "motionExposureEnvelope"]) {
      assert.equal(fileSha256(urlToFile(candidate[field].path)), candidate[field].sha256, `${shotId}-${field}-sha`);
    }
    assert.equal(candidate.technicalStatus, "TECHNICAL_PASS");
    assert.equal(candidate.visualStatus, "REVIEW_REQUIRED");
    assert.equal(candidate.productionStateWritten, false);
  }
  assert.equal(review.ed13IdentityGate.decision, "VISUAL_PASS");
  assert.match(review.ed13IdentityGate.sourceMatteSha256, /^[a-f0-9]{64}$/u);
  const manifest = readPublicJson(`${formalRoot}/manifest.json`);
  const audit = readPublicJson(`${formalRoot}/actual-pixel-audit.json`);
  const admission = readPublicJson(`${formalRoot}/remaining-ten-admission.json`);
  assert.equal(manifest.contract, "A1WholeFilmLayerReconstruction/v2");
  assert.equal(manifest.status, "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS");
  assert.equal(manifest.current, true);
  assert.equal(manifest.packageCount, 13);
  assert.equal(manifest.layerCount, 52);
  assert.equal(manifest.systemPixelPassCount, 13);
  assert.equal(manifest.failureCount, 0);
  assert.equal(manifest.visualReviewContract, A1_SHOT_LAYER_REVIEW_CONTRACT);
  assert.equal(manifest.expansionCandidateContract, A1_SHOT_LAYER_CANDIDATE_CONTRACT);
  const manifestBody = structuredClone(manifest); delete manifestBody.manifestSha256;
  assert.equal(hashJson(manifestBody), manifest.manifestSha256, "manifest-sha");
  assert.equal(audit.status, "PASS");
  assert.equal(audit.sourceManifestSha256, manifest.manifestSha256);
  const auditBody = structuredClone(audit); delete auditBody.auditSha256;
  assert.equal(hashJson(auditBody), audit.auditSha256, "audit-sha");
  assert.equal(admission.status, "ADMITTED");
  assert.equal(manifest.sourceWorkspaceSha256, admission.compareAndSwap.observedWorkspaceSha256, "formal-manifest-admission-source-sha");
  assert.equal(admission.formalManifestSha256, manifest.manifestSha256);
  assert.equal(admission.actualPixelAuditSha256, audit.auditSha256);
  assert.equal(admission.cacheHitCount, 9);
  assert.equal(admission.cacheMissCount, 1);
  assert.equal(admission.assemblyCreated, false);
  assert.equal(admission.motionCreated, false);
  for (const item of manifest.items) {
    assert.equal(item.layerCount, 4, `${item.shotId}-formal-layer-count`);
    for (const layer of item.layers) {
      const file = urlToFile(layer.publicUrl || layer.path);
      assert.equal(fileSha256(file), layer.sha256, `${item.shotId}-${layer.kind}-formal-sha`);
      assert.equal(await decodedSha(layer.publicUrl || layer.path), layer.decodedPixelSha256, `${item.shotId}-${layer.kind}-formal-decoded-sha`);
    }
  }
  assert.equal(workspace.production.assembly.status, "NOT_CREATED");
  assert.equal(workspace.production.motion.status, "preview-ready-for-review");
  assert.equal(workspace.production.motion.previewArtifact.sha256, workspace.production.shotIntelligence.representativeApprovedMasterMotionPilot.video.sha256);
  const representativePilot = workspace.production.shotIntelligence.representativeApprovedMasterMotionPilot;
  assert.match(representativePilot.video.publicUrl, /approved-master-layer-motion-pilot-v4/u, "current-preview-v4-authority");
  assert.equal(representativePilot.deliveryContract?.route, "COMPOSITE_COMPATIBILITY_PREVIEW");
  assert.equal(representativePilot.deliveryContract?.productionArtifact, false);
  assert.equal(representativePilot.deliveryContract?.resolveInsertEligible, false);
  assert.equal(representativePilot.formalTypographyGlyphAdmission?.status, "PASS");
  assert.equal(representativePilot.formalTypographyGlyphAdmission?.cssFontDeclarationAcceptedAsProof, false);
  assert.equal(representativePilot.formalTypographyGlyphAdmission?.proofSha256, representativePilot.actualPixelFontProofSha256);
  assert.equal(workspace.production.formalPackagingTypographyAdmission?.status, "BLOCKED_UNMIGRATED_ROUTES");
  assert.ok(representativePilot.supersededPreviews?.some((item) => item.status === "SUPERSEDED_BY_PRESENTER_SEMANTIC_COMPLEXITY_HARD_GATE_V1" && item.video?.sha256 === "5c4675c917c8066912a519081d60cd7aa051259e920745c5135f1d11627fe038"), "old-preview-superseded");
  assert.ok(representativePilot.supersededPreviews?.some((item) => item.status === "SUPERSEDED_BY_IMAGEGEN_LED_V4" && item.video?.sha256 === "2091323026da9d823739b9b5777b83518b7aa0bad4eccb13d3db384908b2514e"), "v2-preview-superseded-by-v4");
  const representativeProps = readPublicJson("approved-master-layer-motion-pilot-v4/input-props.json");
  const ed13Motion = representativeProps.shots.find((item) => item.shotId === "ED-13");
  const ed31Motion = representativeProps.shots.find((item) => item.shotId === "ED-31");
  assert.equal(ed13Motion.mode, "SIMPLE_PRESENTER_CONTRAST_TITLE_V4");
  assert.deepEqual(Object.keys(ed13Motion.layers).filter((key) => ed13Motion.layers[key]), ["TYPOGRAPHY"]);
  assert.equal(ed13Motion.motionIrScene.presenterPackagingComplexity.applied.status, "SIMPLE_PRESENTER_PACKAGING_PASS");
  assert.equal(ed31Motion.mode, "IMAGEGEN_PAPER_RIBBON_FULLSCREEN_WORKFLOW_TAKEOVER");
  assert.equal(ed31Motion.motionIrScene.imagegenMasterSha256, "bbc847fc8db8d59edee96f2dc5dadcd44e6e531cceef38332445f1732a390db7");
  assert.ok(Object.values(ed31Motion.workflowActors).some((binding) => binding.sha256 === ed31Motion.motionIrScene.imagegenMasterSha256), "ed31-imagegen-master-used-as-motion-actor");
  assert.equal(ed31Motion.motionIrScene.presenterPackagingComplexity.applied.status, "COMPLEX_EXPLANATION_FULL_FRAME_TAKEOVER_PASS");
  const ed31FontProof = readPublicJson("approved-master-layer-motion-pilot-v4/shot-assets/ED-31/actual-pixel-font-proof.json");
  assert.equal(ed31FontProof.status, "ACTUAL_PIXEL_FONT_PASS");
  assert.equal(ed31FontProof.actualGlyphSource.family, "A1 Fusion Pixel");
  assert.equal(ed31FontProof.actualGlyphSource.sha256, "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32");
  assert.equal(ed31FontProof.actualGlyphSource.renderer, "FONTKIT_DIRECT_GLYPH_OUTLINES");
  assert.equal(ed31FontProof.actualGlyphSource.cssFontDeclarationAcceptedAsProof, false);
  assert.equal(Object.values(ed31FontProof.outlineProof).every((item) => item.postscriptName === "Fusion-Pixel-Regular" && item.glyphIds.every((id) => id > 0) && /^[a-f0-9]{64}$/u.test(item.outlineSha256)), true);
  assert.equal(ed31FontProof.sourceHanVisibleGlyphCount, 0);
  assert.equal(ed31FontProof.targetRaster.resamplingToFormal, "NEAREST_NEIGHBOR");
  assert.deepEqual(Object.keys(ed31FontProof.crops).sort(), ["result", "stages", "title"]);
  const ed13V4Proof = readPublicJson("approved-master-layer-motion-pilot-v4/shot-assets/ED-13/actual-pixel-reduction-proof.json");
  assert.deepEqual(ed13V4Proof.forbiddenRegionAlphaPixels, {"decorative-blue-underline": 0, "lower-right-small-icon": 0}, "ed13-v4-forbidden-alpha-zero");
  const rejectedV3 = readPublicJson("approved-master-layer-motion-pilot-v3/deterministic-draft-rejection.json");
  assert.equal(rejectedV3.status, "VISUAL_REJECTED_DETERMINISTIC_DRAFT");
  assert.equal(rejectedV3.current, false);
  assert.equal(rejectedV3.gates.motionRenderAllowed, false);
  assert.equal(workspace.production.assembly.productionWired, false);
  assert.equal(workspace.production.motion.fullMotionAllowed, false);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  const phase = readJson(path.join(systemProgressDir, "current-phase.json"));
  const authorityReport = readJson(path.join(systemProgressDir, "system-line-current-authority-v2/report.json"));
  const workbenchReport = readPublicJson("report.json");
  const deliveryContractReview = representativePilot.deliveryContract?.route === "COMPOSITE_COMPATIBILITY_PREVIEW";
  const expectedReviewStatus = deliveryContractReview ? "PACKAGING_DELIVERY_CONTRACT_REVIEW" : "REPRESENTATIVE_MOTION_OBJECTIVE_PASS_AWAITING_USER_VISUAL_REVIEW";
  const expectedReviewAction = deliveryContractReview ? "REVIEW_PACKAGING_DELIVERY_CONTRACT" : "REVIEW_REPRESENTATIVE_MOTION_PREVIEW";
  for (const [label, value] of [["phase", phase], ["authority-report", authorityReport]]) {
    assert.equal(value.authority.workspaceSha256, workspace.workspaceSha256, `${label}-workspace-sha`);
    assert.equal(value.status, expectedReviewStatus, `${label}-status`);
    assert.equal(value.authority.nextAction.id, expectedReviewAction, `${label}-next-action`);
    assert.deepEqual(value.authority.nextAction.targetShotIds, deliveryContractReview ? [] : ["ED-10", "ED-13", "ED-14", "ED-17", "ED-31"], `${label}-targets`);
  }
  assert.equal(phase.next.recommended.id, expectedReviewAction, "phase-recommended-next-action");
  assert.deepEqual(phase.next.recommended.targetShotIds, deliveryContractReview ? [] : ["ED-10", "ED-13", "ED-14", "ED-17", "ED-31"], "phase-recommended-targets");
  assert.equal(workbenchReport.workspaceSha256, workspace.workspaceSha256, "workbench-report-workspace-sha");
  assert.equal(workbenchReport.lifecycleProjection.status, expectedReviewStatus, "workbench-report-lifecycle-status");
  assert.deepEqual(workbenchReport.lifecycleProjection.targetShotIds, deliveryContractReview ? [] : ["ED-10", "ED-13", "ED-14", "ED-17", "ED-31"], "workbench-report-targets");
  const response = await fetch("http://127.0.0.1:4311/api/system-line/editorial-asset-workbench");
  assert.equal(response.ok, true, "live-api-ok");
  const api = await response.json();
  assert.equal(api.workspace.workspaceSha256, workspace.workspaceSha256, "live-api-workspace-sha");
  assert.equal(api.workspace.status, expectedReviewStatus, "live-api-workspace-status");
  assert.equal(api.workspace.production.authority.nextAction.id, expectedReviewAction, "live-api-workspace-authority-next-action");
  assert.deepEqual(api.workspace.production.authority.nextAction.targetShotIds, deliveryContractReview ? [] : ["ED-10", "ED-13", "ED-14", "ED-17", "ED-31"], "live-api-workspace-authority-targets");
  assert.equal(api.report.lifecycleStatus, expectedReviewStatus, "live-api-lifecycle-status");
  assert.equal(api.report.nextAction.id, expectedReviewAction, "live-api-next-action");
  assert.deepEqual(api.report.nextAction.targetShotIds, deliveryContractReview ? [] : ["ED-10", "ED-13", "ED-14", "ED-17", "ED-31"], "live-api-targets");
  assert.equal(api.packagingLaneSummary.status, expectedReviewStatus, "live-api-packaging-status");
  const pageResponse = await fetch("http://127.0.0.1:4311/system-line-visual-workbench");
  assert.equal(pageResponse.ok, true, "live-page-ok");
  const pageHtml = await pageResponse.text();
  assert.doesNotMatch(pageHtml, /data-a1-representative-motion-review="current"/u, "live-page-compatibility-preview-not-current");
  assert.match(pageHtml, /REVIEW_PACKAGING_DELIVERY_CONTRACT|PACKAGING_DELIVERY_CONTRACT_REVIEW/u, "live-page-delivery-contract-review");
  assert.match(pageHtml, /COMPOSITE_COMPATIBILITY_PREVIEW/u, "live-page-compatibility-route");
  assert.doesNotMatch(pageHtml, /<video[^>]+representative-motion-pilot-960x540\.mp4/u, "live-page-no-compatibility-video");
  assert.doesNotMatch(pageHtml, /<video[^>]+approved-master-layer-motion-pilot-v1\/representative-motion-pilot-960x540\.mp4/u, "live-page-old-preview-not-current");
  assert.doesNotMatch(pageHtml, /<video[^>]+approved-master-layer-motion-pilot-v2\/representative-motion-pilot-960x540\.mp4/u, "live-page-v2-preview-not-current");
  if (!deliveryContractReview) {
    assert.match(pageHtml, /representative-motion-pilot-timeline-5fps\.png/u, "live-page-timeline-sheet");
    for (const shotId of ["ED-10", "ED-13", "ED-14", "ED-17", "ED-31"]) assert.match(pageHtml, new RegExp(`data-a1-representative-motion-shot="${shotId}"`, "u"), `live-page-${shotId}-marker`);
  }
  assert.doesNotMatch(pageHtml, /data-a1-representative-motion-approve/u, "live-page-no-auto-approve");
  console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, packageCount: manifest.packageCount, layerCount: manifest.layerCount, cacheHitCount: admission.cacheHitCount, cacheMissCount: admission.cacheMissCount, decodedPixelChecks: manifest.layerCount, currentPhase: phase.status, nextAction: phase.next.recommended.id, liveApi: "PASS", assembly: workspace.production.assembly.status, motion: workspace.production.motion.status}, null, 2));
}

await main();
