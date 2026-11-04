#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {sha256Json} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const candidateRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/system-validation-candidate-v1");
const expectedWorkspaceSha256 = process.argv[2];
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const read = (name) => JSON.parse(fs.readFileSync(path.join(candidateRoot, name), "utf8"));
const artifactFile = (artifact) => artifact?.path ? path.resolve(root, artifact.path) : path.resolve(publicRoot, String(artifact?.publicUrl || "").replace(/^\//u, ""));
const verifyArtifact = (artifact, label) => {
  const file = artifactFile(artifact);
  if (!artifact || !/^[a-f0-9]{64}$/u.test(String(artifact.sha256 || "")) || !file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || fileSha256(file) !== artifact.sha256) throw new Error(`system-validation-adoption-artifact-invalid:${label}`);
  if (artifact.bytes != null && fs.statSync(file).size !== artifact.bytes) throw new Error(`system-validation-adoption-artifact-size-invalid:${label}`);
  return file;
};
const verifyJsonHash = (value, hashKey, timeKeys = ["generatedAt"]) => {
  const body = {...value};
  const expected = body[hashKey];
  delete body[hashKey];
  for (const key of timeKeys) delete body[key];
  return /^[a-f0-9]{64}$/u.test(String(expected || "")) && sha256Json(body) === expected;
};

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("system-validation-adoption-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`system-validation-adoption-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen" || current.production.generation.automaticDispatchAllowed !== false) throw new Error("system-validation-adoption-frozen-empty-runtime-required");
  const runtime = current.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  const decision = runtime.wholeFilmStaticBoardDecision;
  const layerPilot = runtime.approvedMasterLayerPilot;
  const deterministic = runtime.deterministicLayerReconstructionPilot;
  if (board?.status !== "APPROVED" || decision?.decision !== "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY") throw new Error("system-validation-adoption-approved-board-required");
  if (layerPilot?.status !== "DETERMINISTIC_SEMANTIC_LAYERING_BLOCKED_USE_APPROVED_MASTER_RASTER_SLICE_MOTION" || deterministic?.status !== "BLOCK_SEMANTIC_LAYER_SEPARATION" || layerPilot.deterministicActualVisualReviewSha256 !== deterministic.actualVisualReviewSha256) throw new Error("system-validation-adoption-failed-layer-route-authority-required");

  const report = read("report.json");
  const admission = read("admission.json");
  const review = read("actual-visual-review.json");
  const insertion = read("insertion-manifest.json");
  const typography = read("editable-typography-specs.json");
  if (report.contract !== "A1SystemValidationCandidateReport/v2" || report.status !== "READY_FOR_USER_REVIEW" || !verifyJsonHash(report, "reportSha256", ["generatedAt"])) throw new Error("system-validation-adoption-report-invalid");
  if (admission.contract !== "A1SystemValidationCandidateAdmission/v1" || admission.status !== "CANDIDATE_ONLY_READY_FOR_USER_REVIEW" || admission.reportSha256 !== report.reportSha256 || admission.actualVisualReviewSha256 !== review.reviewSha256 || admission.productionEligible !== false || admission.userVisualApproval !== "NOT_APPROVED") throw new Error("system-validation-adoption-admission-invalid");
  if (review.contract !== "A1SystemValidationActualPixelReview/v1" || review.status !== "SYSTEM_VISUAL_PASS" || !verifyJsonHash(review, "reviewSha256", ["generatedAt"]) || review.boundary?.productionEligible !== false || review.boundary?.userVisualApproval !== "NOT_APPROVED") throw new Error("system-validation-adoption-visual-review-invalid");
  if (insertion.contract !== "A1SystemValidationInsertionManifest/v2" || insertion.status !== "CANDIDATE_ONLY" || !verifyJsonHash(insertion, "manifestSha256", ["generatedAt"]) || insertion.entryCount !== 13 || insertion.entries?.length !== 13) throw new Error("system-validation-adoption-insertion-manifest-invalid");
  if (typography.contract !== "A1SystemValidationEditableTypographyCoverage/v1" || !verifyJsonHash(typography, "auditSha256", ["generatedAt"]) || typography.entryCount !== 13 || typography.candidateEditableSpecReadyCount !== 13 || typography.canonicalEditableLayerReadyCount !== 4 || typography.postApprovalRebuildCount !== 9) throw new Error("system-validation-adoption-typography-spec-invalid");
  if (report.source?.packageBoardSha256 !== board.sha256 || report.source?.timelineBoardSha256 !== board.timelineBoard?.sha256 || insertion.sourceBoardSha256 !== board.sha256 || insertion.sourceTimelineBoardSha256 !== board.timelineBoard?.sha256 || typography.sourceBoardSha256 !== board.sha256) throw new Error("system-validation-adoption-current-board-binding-invalid");

  verifyArtifact(report.render?.fullVideo, "full-video");
  verifyArtifact(report.render?.smokeVideo, "smoke-video");
  for (const [key, artifact] of Object.entries(report.render?.contactSheets || {})) verifyArtifact(artifact, `contact-sheet:${key}`);
  for (const [key, artifact] of Object.entries({review: report.actualVisualReview?.evidence, insertion: report.insertionManifest, typography: report.typographyCoverage, browser: report.browserAudit, matrix: report.completenessMatrix})) verifyArtifact(artifact, `report:${key}`);
  for (const source of report.source?.sourceHashes || []) {
    const file = path.resolve(root, source.path);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || fileSha256(file) !== source.sha256) throw new Error(`system-validation-adoption-source-drift:${source.path}`);
  }

  const boardByShot = new Map((board.items || []).map((item) => [item.shotId, item]));
  const packageShotIds = [];
  for (const entry of insertion.entries) {
    const boardItem = boardByShot.get(entry.shotId);
    if (!boardItem || entry.selectedMaster?.sha256 !== boardItem.artifactSha256 || entry.selectedMaster?.publicUrl !== boardItem.artifactPublicUrl) throw new Error(`system-validation-adoption-master-binding-invalid:${entry.shotId}`);
    const clipFile = verifyArtifact(entry.file, `clip:${entry.shotId}`);
    const sidecarFile = path.join(path.dirname(clipFile), `${entry.shotId}.json`);
    if (!fs.existsSync(sidecarFile)) throw new Error(`system-validation-adoption-sidecar-missing:${entry.shotId}`);
    const sidecar = JSON.parse(fs.readFileSync(sidecarFile, "utf8"));
    if (sidecar.contract !== "A1SystemValidationClipCache/v1" || sidecar.cacheKey !== entry.cacheKey || sidecar.sha256 !== entry.file.sha256) throw new Error(`system-validation-adoption-sidecar-invalid:${entry.shotId}`);
    if (entry.typography?.candidateEditableSpecReady !== true || entry.typography?.specification?.sha256 !== report.typographyCoverage.sha256) throw new Error(`system-validation-adoption-typography-entry-invalid:${entry.shotId}`);
    if ((entry.semanticMotion?.actorCount || 0) < 1) throw new Error(`system-validation-adoption-semantic-motion-missing:${entry.shotId}`);
    packageShotIds.push(entry.shotId);
  }
  if (new Set(packageShotIds).size !== 13 || insertion.deliveryCoverage?.opaqueReplacementCount !== 11 || insertion.deliveryCoverage?.alphaOverlayCount !== 2 || JSON.stringify(insertion.deliveryCoverage?.alphaOverlayShotIds) !== JSON.stringify(["ED-13", "ED-31"])) throw new Error("system-validation-adoption-delivery-coverage-invalid");
  for (const shotId of ["ED-13", "ED-31"]) {
    const overlay = report.render?.alphaOverlays?.[shotId];
    verifyArtifact(overlay?.file, `alpha-overlay:${shotId}`);
    verifyArtifact(overlay?.sourcePng, `alpha-source:${shotId}`);
    if (overlay?.format !== "prores4444-yuva" || overlay?.probe?.streams?.[0]?.codec_name !== "prores" || !String(overlay?.probe?.streams?.[0]?.pix_fmt || "").startsWith("yuva") || overlay?.alphaAudit?.transparentAndVisiblePixelsPresent !== true || overlay?.containsBaseFootage !== false || overlay?.containsPresenterPixels !== false) throw new Error(`system-validation-adoption-alpha-contract-invalid:${shotId}`);
  }
  if (report.render?.fullVideo?.probe?.streams?.find((stream) => stream.codec_type === "video")?.width !== 960 || report.render?.fullVideo?.probe?.streams?.find((stream) => stream.codec_type === "video")?.height !== 540 || !report.render?.fullVideo?.probe?.streams?.some((stream) => stream.codec_type === "audio" && stream.codec_name === "aac")) throw new Error("system-validation-adoption-full-video-probe-invalid");
  if (report.render?.semanticMotion?.allRepresentativeShotsMultiActor !== true || report.render?.semanticMotion?.minimumActorsPerRepresentative < 3 || review.findings?.some((finding) => finding.status !== "PASS")) throw new Error("system-validation-adoption-actual-visual-evidence-incomplete");

  const now = new Date().toISOString();
  const candidateBody = {
    contract: "A1ApprovedMasterRasterSliceMotionCandidate/v1",
    status: "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW",
    current: true,
    authorityScope: "CURRENT",
    architecture: "APPROVED_MASTER_RASTER_SLICE_MOTION_WITH_HASH_BOUND_EDITABLE_TYPOGRAPHY_SHADOW",
    sourceBoardSha256: board.sha256,
    sourceTimelineBoardSha256: board.timelineBoard.sha256,
    sourceApprovalDecisionSha256: decision.decisionSha256,
    sourceFailedLayerVisualReviewSha256: deterministic.actualVisualReviewSha256,
    reportSha256: report.reportSha256,
    actualVisualReviewStatus: review.status,
    actualVisualReviewSha256: review.reviewSha256,
    insertionManifestSha256: insertion.manifestSha256,
    typographyAuditSha256: typography.auditSha256,
    packageShotIds,
    packageCount: packageShotIds.length,
    insertionClipCount: insertion.entryCount,
    alphaOverlayShotIds: insertion.deliveryCoverage.alphaOverlayShotIds,
    semanticMotionRepresentativeShotIds: insertion.semanticMotionCoverage.representativeShotIds,
    video: {publicUrl: report.render.fullVideo.publicUrl, sha256: report.render.fullVideo.sha256, bytes: report.render.fullVideo.bytes, durationMs: Math.round(Number(report.render.fullVideo.probe.format.duration) * 1000), width: 960, height: 540, fps: 30, audioBound: true},
    contactSheets: structuredClone(report.render.contactSheets),
    typography: {candidateEditableSpecReadyCount: 13, canonicalEditableLayerReadyCount: 4, postApprovalRebuildCount: 9, fontAssetId: "type-pixel-correction", fontFamily: "A1 Fusion Pixel", fontSha256: typography.policy.postApprovalReconstructionFont.sha256, visibleFormalTextSource: "APPROVED_MASTER_RASTER", editableShadowStatus: "9_SHOTS_REBUILD_REMAINING"},
    technicalReviewStatus: "SYSTEM_VISUAL_PASS",
    reviewOnly: true,
    productionEligible: false,
    promotedRender: false,
    userVisualApproval: "NOT_APPROVED",
    resolveWritePerformed: false,
    finalRenderAllowed: false,
    published: false,
    adoptedAt: now,
  };
  const candidate = {...candidateBody, candidateSha256: sha256({...candidateBody, adoptedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate = candidate;
  next.production.shotIntelligence.approvedMasterLayerPilot = {
    ...layerPilot,
    status: "WHOLE_FILM_RASTER_SLICE_MOTION_CANDIDATE_READY_FOR_USER_VISUAL_REVIEW",
    replacementCandidateSha256: candidate.candidateSha256,
    replacementCandidateReportSha256: report.reportSha256,
    wholeFilmExpansionAllowed: false,
    motionExpansionAllowed: false,
    updatedAt: now,
  };
  next.production.release.review540p = {status: "ready-for-review", publicUrl: candidate.video.publicUrl, sha256: candidate.video.sha256, approvedAt: null, renderedAt: report.generatedAt, durationMs: candidate.video.durationMs, width: 960, height: 540};
  next.production.release.final1080p = {...next.production.release.final1080p, status: "locked-awaiting-final-user-visual-review"};
  next.production.release.davinciPackage = {...next.production.release.davinciPackage, status: "locked-awaiting-final-user-visual-review"};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (next.gates?.finalRenderAllowed !== false || next.production.release.review540p.status !== "ready-for-review") throw new Error("system-validation-adoption-final-gate-escaped");
  const adoptionBody = {contract: "A1SystemValidationCandidatePostStaticApprovalAdoption/v1", status: "PASS", candidateSha256: candidate.candidateSha256, reportSha256: report.reportSha256, reviewSha256: review.reviewSha256, insertionManifestSha256: insertion.manifestSha256, boardSha256: board.sha256, timelineBoardSha256: board.timelineBoard.sha256, approvalDecisionSha256: decision.decisionSha256, video: candidate.video, packageCount: 13, alphaOverlayCount: 2, userVisualApproval: "NOT_APPROVED", finalRenderAllowed: false, adoptedAt: now};
  const adoption = {...adoptionBody, adoptionSha256: sha256({...adoptionBody, adoptedAt: undefined})};
  const event = createProductionEvent({workspace: current, action: "adopt-system-validation-candidate-after-static-board-approval", targetId: candidate.candidateSha256, payload: adoption, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `system-validation-candidate-adoption-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"system-validation-candidate-v1/post-static-approval-adoption.json": adoption}});
  return {...adoption, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId};
});

console.log(JSON.stringify(result, null, 2));
