#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {verifyFontGlyphOutlineProof} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {assertFormalTypographyGlyphAdmission} from "../apps/studio-next/src/lib/a1-formal-typography-admission-v1.mjs";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const pilotRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/approved-master-layer-motion-pilot-v4");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("representative-motion-v4-review-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const report = readJson(path.join(pilotRoot, "render-report.json"));
const manifest = readJson(path.join(pilotRoot, "shot-assets/manifest.json"));
const imagegenProof = readJson(path.join(pilotRoot, "shot-assets/ED-31/imagegen-look-master-proof.json"));
const ed13Proof = readJson(path.join(pilotRoot, "shot-assets/ED-13/actual-pixel-reduction-proof.json"));
const styleAudit = readJson(path.join(pilotRoot, "shot-assets/ED-31/style-brief-audit.json"));
const fontProof = readJson(path.join(pilotRoot, "shot-assets/ED-31/actual-pixel-font-proof.json"));
verifyFontGlyphOutlineProof({proof: fontProof, fontPath: path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf"), expectedFontSha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"});
const formalTypographyGlyphAdmission = assertFormalTypographyGlyphAdmission({contract: "A1FormalTypographyGlyphAdmission/v1", status: "PASS", productionAdmissionAllowed: true, method: "FONT_FILE_DIRECT_GLYPH_OUTLINE_AND_ACTUAL_PIXEL_PROOF", cssFontDeclarationAcceptedAsProof: false, fontSha256: fontProof.actualGlyphSource.sha256, proofSha256: fontProof.proofSha256, outlineSetSha256: sha256(Object.values(fontProof.outlineProof).map((item) => item.outlineSha256).join("|")), unmigratedBlockingRoutes: [], admittedScope: "REPRESENTATIVE_MOTION_V4_ED31", admittedAt: new Date().toISOString()}, {proofSha256: fontProof.proofSha256});
const plan = readJson(path.join(pilotRoot, "plan.json"));
const props = readJson(path.join(pilotRoot, "input-props.json"));
const rejection = readJson(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/approved-master-layer-motion-pilot-v3/deterministic-draft-rejection.json"));
const videoPath = path.join(pilotRoot, "representative-motion-pilot-960x540.mp4");
const contactPath = path.join(pilotRoot, "representative-motion-pilot-contact-sheet.png");
const timelinePath = path.join(pilotRoot, "representative-motion-pilot-timeline-5fps.png");
const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`representative-motion-v4-review-workspace-cas-failed:${current.workspaceSha256}`);
const authority = current.production.shotIntelligence.representativeApprovedMasterMotionPilot;
const staged = current.production.shotIntelligence.representativeMotionV4StagedPreview;
if (!String(authority?.publicUrl || "").includes("approved-master-layer-motion-pilot-v2") || staged?.status !== "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW_STAGED_NOT_CURRENT" || staged.reportSha256 !== report.reportSha256 || staged.actualPixelGate?.status !== "PASS" || staged.workbenchCurrent !== false) throw new Error("representative-motion-v4-review-staged-preview-invalid");
if (report.status !== "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW_STAGED_NOT_CURRENT" || report.workbenchCurrent !== false || report.failures.length !== 0 || report.shotAudits.length !== 5 || report.shotAudits.some((item) => item.status !== "ACTUAL_PIXEL_GATE_PASS")) throw new Error("representative-motion-v4-review-report-invalid");
if (shaFile(videoPath) !== report.artifacts.video.sha256 || shaFile(contactPath) !== report.artifacts.contactSheet.sha256 || shaFile(timelinePath) !== report.artifacts.timeline.sha256 || report.artifacts.timeline.sampleRateFps !== 5) throw new Error("representative-motion-v4-review-artifact-sha-mismatch");
if (manifest.imagegenMasterSha256 !== "bbc847fc8db8d59edee96f2dc5dadcd44e6e531cceef38332445f1732a390db7" || imagegenProof.provider !== "built-in-imagegen" || imagegenProof.preservation?.rasterIsPrimaryArtComposition !== true || imagegenProof.preservation?.redrawForbidden !== true || styleAudit.status !== "PASS") throw new Error("representative-motion-v4-review-imagegen-proof-invalid");
if (fontProof.status !== "ACTUAL_PIXEL_FONT_PASS" || fontProof.actualGlyphSource?.sha256 !== "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32" || fontProof.actualGlyphSource?.family !== "A1 Fusion Pixel" || fontProof.actualGlyphSource?.renderer !== "FONTKIT_DIRECT_GLYPH_OUTLINES" || fontProof.actualGlyphSource?.cssFontDeclarationAcceptedAsProof !== false || fontProof.sourceHanVisibleGlyphCount !== 0 || fontProof.targetRaster?.width !== 960 || fontProof.targetRaster?.height !== 540 || fontProof.targetRaster?.resamplingToFormal !== "NEAREST_NEIGHBOR" || Object.values(fontProof.crops || {}).length !== 3) throw new Error("representative-motion-v4-review-actual-pixel-font-proof-invalid");
if (ed13Proof.status !== "ACTUAL_PIXEL_PASS" || Object.values(ed13Proof.forbiddenRegionAlphaPixels).some((value) => value !== 0) || ed13Proof.presenterDominancePreserved !== true) throw new Error("representative-motion-v4-review-ed13-residue-invalid");
if (rejection.status !== "VISUAL_REJECTED_DETERMINISTIC_DRAFT" || rejection.current !== false || rejection.supersededEvidence !== true || rejection.gates?.motionRenderAllowed !== false || rejection.gates?.workbenchCurrentAllowed !== false) throw new Error("representative-motion-v4-review-v3-rejection-invalid");
if (current.production.assembly.status !== "NOT_CREATED" || current.production.assembly.productionWired !== false || current.production.motion.aeLevelProven !== false || current.production.assembly.userVisualApproval !== "NOT_APPROVED") throw new Error("representative-motion-v4-review-locks-required");
const probe = JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_frames:format=duration,size", "-of", "json", videoPath], {encoding: "utf8"}));
if (probe.streams?.[0]?.width !== 960 || probe.streams[0].height !== 540 || probe.streams[0].avg_frame_rate !== "30/1" || Number(probe.streams[0].nb_frames) !== 501) throw new Error("representative-motion-v4-review-video-probe-invalid");

const verdicts = [
  {shotId: "ED-10", status: "PASS_REUSED_V2", evidence: ["decoded-v2-frames-reused", "source-actual-pixel-pass"]},
  {shotId: "ED-13", status: "PASS_REUSED_PRIOR_V4", evidence: ["decoded-prior-v4-frames-reused", "presenter-dominant", "two-required-title-groups-only", "blue-underline-alpha-zero", "lower-right-icon-alpha-zero"]},
  {shotId: "ED-14", status: "PASS_REUSED_V2", evidence: ["decoded-v2-frames-reused", "source-actual-pixel-pass"]},
  {shotId: "ED-17", status: "PASS_REUSED_V2", evidence: ["decoded-v2-frames-reused", "source-actual-pixel-pass"]},
  {shotId: "ED-31", status: "PASS", evidence: ["built-in-imagegen-raster-is-primary-composition", "single-continuous-paper-ribbon-causal-actor", "a1-fusion-pixel-is-visible-glyph-source", "binary-pixel-edges-at-960x540", "nearest-neighbor-formal-layer", "four-stage-labels-readable-at-540p", "terminal-result-lock-readable", "no-presenter-base-scene-residue", "stable-parity-pass"]},
];
const reviewedAt = new Date().toISOString();
const reviewBody = {
  contract: "A1RepresentativeMotionV4ActualVisualReview/v1",
  status: "REPRESENTATIVE_MOTION_OBJECTIVE_REVIEW_PASS_AWAITING_USER_VISUAL_REVIEW",
  reviewAuthority: "A1_OBJECTIVE_VISUAL_DIRECTOR",
  userVisualApproval: "NOT_APPROVED",
  evidenceMethod: "ACTUAL_STABLE_FRAME_INSPECTION_PLUS_5FPS_TIMELINE_PLUS_HASH_BOUND_PIXEL_GATES",
  sourceWorkspaceSha256: current.workspaceSha256,
  sourceRenderReportSha256: report.reportSha256,
  sourceVideoSha256: report.artifacts.video.sha256,
  sourceAssetManifestSha256: manifest.manifestSha256,
  imagegenMasterSha256: manifest.imagegenMasterSha256,
  actualPixelFontProofSha256: fontProof.proofSha256,
  rejectedDeterministicV3Status: rejection.status,
  changedShotIds: report.changedShotIds,
  reusedShotIds: report.reusedShotIds,
  probe,
  artifacts: {video: report.artifacts.video, contactSheet: report.artifacts.contactSheet, timeline5fps: report.artifacts.timeline, keyFrames: report.artifacts.frames},
  verdicts,
  gates: {representativeMotionObjectivePass: true, userVisualApproval: "NOT_APPROVED", wholeFilmMotionPlanCompilationAllowed: false, wholeFilmLayerExpansionAllowed: false, wholeFilmMotionRenderAllowed: false, assemblyAllowed: false, final1080pAllowed: false, resolveAllowed: false, releaseAllowed: false},
  nextAction: "REVIEW_REPRESENTATIVE_MOTION_PREVIEW",
  reviewedAt,
};
const review = {...reviewBody, reviewSha256: sha256({...reviewBody, reviewedAt: undefined})};
const committed = await withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== current.workspaceSha256) throw new Error(`representative-motion-v4-review-persist-cas-failed:${locked.workspaceSha256}`);
  let next = structuredClone(locked);
  const supersededPreviews = [...(authority.supersededPreviews || []), {status: "SUPERSEDED_BY_PIXEL_FONT_VERIFIED_IMAGEGEN_V4", video: authority.video, planSha256: authority.planSha256, reportSha256: authority.reportSha256, supersededAt: reviewedAt}];
  next.production.shotIntelligence.representativeApprovedMasterMotionPilot = {contract: plan.contract, status: review.status, planSha256: plan.planSha256, propsSha256: props.propsSha256, reportSha256: report.reportSha256, shotIds: plan.shotIds, changedShotIds: plan.changedShotIds, reusedShotIds: plan.reusedShotIds, durationMs: plan.durationMs, placementGate: plan.placementGate, reviewOnly: true, promotedRender: false, video: report.artifacts.video, contactSheet: report.artifacts.contactSheet, timelineContactSheet: report.artifacts.timeline, actualPixelGate: {status: "PASS", shotCount: report.shotAudits.length, failedShotIds: []}, actualVisualReviewStatus: "PASS", actualVisualReviewSha256: review.reviewSha256, actualPixelFontProofSha256: fontProof.proofSha256, formalTypographyGlyphAdmission, wholeFilmMotionPlanCompilationAllowed: false, wholeFilmLayerExpansionAllowed: false, wholeFilmMotionRenderAllowed: false, wholeFilmMotionAllowed: false, supersededPreviews, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/approved-master-layer-motion-pilot-v4/plan.json", updatedAt: reviewedAt};
  next.production.shotIntelligence.representativeMotionV4StagedPreview = {...staged, status: "PROMOTED_AFTER_ACTUAL_PIXEL_FONT_REVIEW", workbenchCurrent: true, actualVisualReviewStatus: "PASS", actualVisualReviewSha256: review.reviewSha256, updatedAt: reviewedAt};
  next.production.shotIntelligence.approvedMasterLayerPilot = {...next.production.shotIntelligence.approvedMasterLayerPilot, status: "REPRESENTATIVE_MOTION_OBJECTIVE_PASS_AWAITING_USER_VISUAL_REVIEW", representativeMotionActualVisualReviewSha256: review.reviewSha256, wholeFilmExpansionAllowed: false};
  next.production.motion = {...next.production.motion, status: "preview-ready-for-review", previewArtifact: report.artifacts.video, representativePlan: {contract: plan.contract, sha256: plan.planSha256, shotIds: plan.shotIds, changedShotIds: plan.changedShotIds, reusedShotIds: plan.reusedShotIds, durationMs: plan.durationMs, reviewOnly: true}, review: {status: "objective-pass-awaiting-user-visual-review", score: null, maxScore: 24, hardFailures: [], reviewedAt}, fullMotionAllowed: false, motionApproved: false, aeLevelProven: false, updatedAt: reviewedAt};
  next.production.assembly = {...next.production.assembly, productionWired: false, userVisualApproval: "NOT_APPROVED"};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, reviewedAt));
  const event = createProductionEvent({workspace: locked, action: "review-representative-motion-v4", targetId: report.changedShotIds.join(","), payload: {status: review.status, reviewSha256: review.reviewSha256, videoSha256: report.artifacts.video.sha256, actualPixelFontProofSha256: fontProof.proofSha256, nextAction: review.nextAction}, now: reviewedAt});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: locked.workspaceSha256, commitId: `representative-motion-v4-review-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-motion-pilot-v4/actual-visual-review.json": review}});
});
console.log(JSON.stringify({status: review.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256, reviewSha256: review.reviewSha256, video: report.artifacts.video, timeline5fps: report.artifacts.timeline, userVisualApproval: "NOT_APPROVED", nextAction: review.nextAction}, null, 2));
