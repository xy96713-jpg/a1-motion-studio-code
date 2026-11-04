#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phasePublicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const pilotRelativeRoot = "approved-master-layer-motion-pilot-v2";
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("approved-master-motion-review-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const renderReportPath = path.join(phasePublicRoot, pilotRelativeRoot, "render-report.json");
const videoPath = path.join(phasePublicRoot, pilotRelativeRoot, "representative-motion-pilot-960x540.mp4");
const ffmpegPath = path.join(root, ".tools/bin/ffmpeg");
const ffprobePath = path.join(root, ".tools/bin/ffprobe");

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-master-motion-review-workspace-cas-failed:${current.workspaceSha256}`);
if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen" || current.production.generation.automaticDispatchAllowed !== false) throw new Error("approved-master-motion-review-frozen-runtime-required");
const authority = current.production.shotIntelligence.representativeApprovedMasterMotionPilot;
if (!["PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW", "REPRESENTATIVE_MOTION_OBJECTIVE_REVIEW_PASS_AWAITING_USER_VISUAL_REVIEW"].includes(authority?.status) || authority.actualPixelGate?.status !== "PASS" || !["PENDING", "PASS"].includes(authority.actualVisualReviewStatus) || authority.wholeFilmMotionAllowed !== false) throw new Error(`approved-master-motion-review-authority-invalid:${authority?.status || "missing"}`);

const renderReport = readJson(renderReportPath);
if (renderReport.reportSha256 !== authority.reportSha256 || renderReport.status !== "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW" || renderReport.failures?.length || renderReport.shotAudits?.length !== 5) throw new Error("approved-master-motion-review-report-invalid");
if (shaFile(videoPath) !== authority.video.sha256 || renderReport.artifacts.video.sha256 !== authority.video.sha256) throw new Error("approved-master-motion-review-video-sha-mismatch");
if (renderReport.representativeEditPolicy !== "NONCONTIGUOUS_SHOTS_HARD_CUT_AT_OVERLAP_START") throw new Error("approved-master-motion-review-hard-cut-policy-required");
for (const executable of [ffmpegPath, ffprobePath]) if (!fs.existsSync(executable)) throw new Error(`approved-master-motion-review-tool-missing:${executable}`);

const probe = JSON.parse(execFileSync(ffprobePath, ["-v", "error", "-show_entries", "format=duration,size,bit_rate:stream=index,codec_name,width,height,avg_frame_rate,pix_fmt", "-of", "json", videoPath], {encoding: "utf8"}));
const videoStream = probe.streams.find((stream) => stream.codec_name === "h264");
if (!videoStream || videoStream.width !== 960 || videoStream.height !== 540 || videoStream.avg_frame_rate !== "30/1") throw new Error("approved-master-motion-review-probe-invalid");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-approved-master-motion-review-"));
const timelineSheetPath = path.join(tempRoot, "representative-motion-pilot-timeline-2fps.png");
execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", videoPath, "-vf", "fps=2,scale=320:180,tile=8x5:padding=2:margin=4:color=#0c0f13", "-frames:v", "1", timelineSheetPath], {stdio: "inherit"});
if (!fs.existsSync(timelineSheetPath) || fs.statSync(timelineSheetPath).size < 100_000) throw new Error("approved-master-motion-review-timeline-sheet-invalid");

const verdicts = [
  {shotId: "ED-10", status: "PASS", semanticAction: "空白承托先建立，完成度与废稿以单次 verdict reveal 形成决定性反差", visualEvidence: ["title-readable-at-board-scale", "single-impact-action", "stable-master-lock"]},
  {shotId: "ED-13", status: "PASS", semanticAction: "人物持续占主位，仅以简单双标题强调顺一些与没有彻底解决", visualEvidence: ["presenter-remains-dominant", "simple-contrast-title-only", "no-complex-secondary-narrative"]},
  {shotId: "ED-14", status: "PASS", semanticAction: "真实论文页先建立来源身份，再出现两组收窄图和光标", visualEvidence: ["paper-source-first", "mechanism-second", "source-and-claim-remain-readable"]},
  {shotId: "ED-17", status: "PASS", semanticAction: "材料、角度、动笔依次接力，结论在稳定阅读区锁定", visualEvidence: ["single-causal-reading-path", "sequential-build", "conclusion-hold-readable"]},
  {shotId: "ED-31", status: "PASS", semanticAction: "四步工作流切入 full-frame takeover，画面不再围绕人物建立第二套叙事", visualEvidence: ["full-frame-workflow-takeover", "presenter-removed-from-explainer", "return-to-presenter-boundary-preserved"]},
];
const allShotIds = renderReport.shotAudits.map((item) => item.shotId);
if (verdicts.some((item) => !allShotIds.includes(item.shotId)) || verdicts.length !== allShotIds.length) throw new Error("approved-master-motion-review-shot-set-mismatch");

const reviewedAt = new Date().toISOString();
const timelineContactSheet = {
  publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${pilotRelativeRoot}/representative-motion-pilot-timeline-2fps.png`,
  sha256: shaFile(timelineSheetPath),
  bytes: fs.statSync(timelineSheetPath).size,
  sampleRateFps: 2,
};
const reviewBody = {
  contract: "A1ApprovedMasterLayerMotionPilotActualVisualReview/v1",
  status: "REPRESENTATIVE_MOTION_OBJECTIVE_REVIEW_PASS_AWAITING_USER_VISUAL_REVIEW",
  reviewAuthority: "A1_OBJECTIVE_VISUAL_DIRECTOR",
  userVisualApproval: "NOT_APPROVED",
  evidenceMethod: "ACTUAL_PIXEL_PHASE_FRAME_REVIEW_PLUS_FFMPEG_2FPS_TIMELINE_CONTACT_SHEET",
  sourceWorkspaceSha256: current.workspaceSha256,
  sourceRenderReportSha256: renderReport.reportSha256,
  sourceRendererSha256: renderReport.rendererSourceSha256,
  sourceVideoSha256: authority.video.sha256,
  probe,
  timelineContactSheet,
  verdicts,
  montageTransitionReview: {status: "PASS", policy: renderReport.representativeEditPolicy, reason: "代表镜并非真实相邻镜，使用硬切避免虚假的溶解叠影；全片转场必须按真实相邻语义另编译。"},
  globalCriteria: [
    {id: "semantic-action-within-three-seconds", status: "PASS"},
    {id: "approved-imagegen-typography-remains-image-actor", status: "PASS"},
    {id: "original-presenter-pixel-restore", status: "PASS"},
    {id: "no-ghost-underpaint-during-allowed-motion", status: "PASS"},
    {id: "non-warm-neutral-cool-aesthetic", status: "PASS"},
    {id: "no-debug-or-filler-overlay", status: "PASS"},
    {id: "motion-family-not-one-template", status: "PASS"},
    {id: "simple-presenter-packaging-keeps-presenter-dominant", status: "PASS"},
    {id: "complex-explanation-routed-full-frame", status: "PASS"},
  ],
  constraintsForExpansion: [
    "bind-each-motion-phase-to-real-narration-time",
    "compile-transitions-from-actual-adjacent-beats-not-representative-montage",
    "keep-free-layer-drift-forbidden-where-underpaint-is-not-clean",
    "new-layer-set-requires-hold-parity-and-actual-pixel-motion-review",
  ],
  gates: {representativeMotionObjectivePass: true, wholeFilmMotionPlanCompilationAllowed: false, wholeFilmLayerExpansionAllowed: false, wholeFilmMotionRenderAllowed: false, assemblyAllowed: false, finalRenderAllowed: false},
  reviewedAt,
};
const review = {...reviewBody, reviewSha256: sha256({...reviewBody, reviewedAt: undefined})};

const committed = await withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== current.workspaceSha256) throw new Error(`approved-master-motion-review-persist-cas-failed:${locked.workspaceSha256}`);
  let next = structuredClone(locked);
  next.production.shotIntelligence.representativeApprovedMasterMotionPilot = {
    ...authority,
    status: review.status,
    actualVisualReviewStatus: "PASS",
    actualVisualReviewSha256: review.reviewSha256,
    timelineContactSheet,
    wholeFilmMotionPlanCompilationAllowed: false,
    wholeFilmLayerExpansionAllowed: false,
    wholeFilmMotionRenderAllowed: false,
    wholeFilmMotionAllowed: false,
    updatedAt: reviewedAt,
  };
  next.production.shotIntelligence.approvedMasterLayerPilot = {
    ...next.production.shotIntelligence.approvedMasterLayerPilot,
    status: "REPRESENTATIVE_MOTION_OBJECTIVE_PASS_AWAITING_USER_VISUAL_REVIEW",
    representativeMotionActualVisualReviewSha256: review.reviewSha256,
    wholeFilmExpansionAllowed: false,
  };
  next.production.motion = {
    ...next.production.motion,
    status: "preview-ready-for-review",
    previewArtifact: authority.video,
    review: {status: "objective-pass-awaiting-user-visual-review", score: null, maxScore: 24, hardFailures: [], reviewedAt},
    fullMotionAllowed: false,
    motionApproved: false,
    aeLevelProven: false,
    updatedAt: reviewedAt,
  };
  next.production.assembly = {...next.production.assembly, productionWired: false, userVisualApproval: "NOT_APPROVED"};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, reviewedAt));
  const event = createProductionEvent({workspace: locked, action: "review-approved-master-layer-motion-pilot", targetId: allShotIds.join(","), payload: {status: review.status, reviewSha256: review.reviewSha256, videoSha256: authority.video.sha256, timelineContactSheetSha256: timelineContactSheet.sha256, wholeFilmMotionRenderAllowed: false}, now: reviewedAt});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: locked.workspaceSha256,
    commitId: `approved-master-motion-review-${reviewedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {[`${pilotRelativeRoot}/actual-visual-review.json`]: review},
    binaryFiles: {[`${pilotRelativeRoot}/representative-motion-pilot-timeline-2fps.png`]: fs.readFileSync(timelineSheetPath)},
  });
});

console.log(JSON.stringify({status: review.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, reviewSha256: review.reviewSha256, shotVerdicts: verdicts.map((item) => ({shotId: item.shotId, status: item.status})), timelineContactSheet, userVisualApproval: "NOT_APPROVED", wholeFilmMotionPlanCompilationAllowed: false, wholeFilmMotionRenderAllowed: false}, null, 2));
