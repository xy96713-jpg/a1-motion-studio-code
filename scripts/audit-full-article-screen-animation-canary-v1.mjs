#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync, execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "work/full-article-screen-animation-canary-v1");
const reportPath = path.join(dir, "canary-report.json");
const storyboardPath = path.join(dir, "storyboard-shot-plan.json");
const matrixPath = path.join(dir, "effect-capability-matrix.json");
const liveCapturePath = path.join(dir, "live-capture/live-capture-report.json");
const articleSourcePath = path.join(dir, "article-source.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fail = [];
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const storyboard = JSON.parse(fs.readFileSync(storyboardPath, "utf8"));
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const liveCapture = fs.existsSync(liveCapturePath) ? JSON.parse(fs.readFileSync(liveCapturePath, "utf8")) : null;
const articleSource = fs.existsSync(articleSourcePath) ? JSON.parse(fs.readFileSync(articleSourcePath, "utf8")) : null;
const videoPath = path.join(root, report.reviewVideo.path);

if (report.contract !== "A1FullArticleScreenAnimationCanary/v1") fail.push("REPORT_CONTRACT");
if (report.reviewVideo?.durationMs < 180000) fail.push("FULL_FILM_DURATION");
if (report.storyboard?.shotCount !== 12 || storyboard.shots?.length !== 12) fail.push("SHOT_COUNT");
if (matrix.contract !== "A1ScreenEffectCapabilityMatrix/v1") fail.push("MATRIX_CONTRACT");
if (matrix.items?.length < 12) fail.push("EFFECT_MATRIX_COVERAGE");
if (report.boundary?.productionAdmission !== false || report.boundary?.currentWorkspaceMutation !== false || report.boundary?.currentPhaseMutation !== false) fail.push("ISOLATION_BOUNDARY");
if (!liveCapture) fail.push("LIVE_CAPTURE_MISSING");
if (liveCapture && (liveCapture.contract !== "A1LiveArticleScrollCapture/v1" || liveCapture.status !== "READY_FOR_CAP_REVIEW" || liveCapture.source?.mode !== "LIVE_BROWSER_PAGE" || liveCapture.geometryTruth?.status !== "PASS_REVIEW_ONLY" || liveCapture.targetFailures?.length || liveCapture.output?.fullDecodePass !== true || liveCapture.output?.durationMs < 59000 || liveCapture.output?.durationMs > 61000)) fail.push("LIVE_CAPTURE_CONTRACT");
if (!articleSource || articleSource.contract !== "A1ArticleSourceManifest/v1" || articleSource.status !== "READY_FOR_REVIEW" || articleSource.boundary?.productionAdmission !== false || articleSource.imageCandidates?.cachedOnly !== true) fail.push("ARTICLE_SOURCE_MANIFEST");
for (const frame of report.stillFrames || []) {
  const file = path.join(root, frame.path);
  if (!fs.existsSync(file) || sha(file) !== frame.sha256) fail.push(`STILL:${frame.label}`);
}

const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", videoPath], {encoding: "utf8"}));
const stream = probe.streams.find((item) => item.codec_type === "video");
if (!stream || stream.width !== report.reviewVideo.width || stream.height !== report.reviewVideo.height || stream.r_frame_rate !== "60/1") fail.push("MEDIA_CONTRACT");
if (Number(probe.format.duration) < 179.5) fail.push("MEDIA_DURATION");
const decode = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", videoPath, "-f", "null", "-"], {encoding: "utf8"});
if (decode.status !== 0) fail.push("FULL_DECODE");
const black = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "info", "-i", videoPath, "-vf", "blackdetect=d=0.5:pix_th=0.01", "-an", "-f", "null", "-"], {encoding: "utf8"});
if (/black_start:/u.test(`${black.stdout}\n${black.stderr}`)) fail.push("BLACK_SEGMENT");

const audit = {
  contract: "A1FullArticleScreenAnimationCanaryAudit/v1",
  status: fail.length ? "FAIL" : "PASS_REVIEW_ONLY",
  source: report.source,
  articleSource: articleSource ? {
    path: "work/full-article-screen-animation-canary-v1/article-source.json",
    status: articleSource.status,
    sourceUrl: articleSource.source?.url || null,
    wordCount: articleSource.article?.wordCount || null,
    cachedImageCount: articleSource.imageCandidates?.count || 0,
    manifestSha256: articleSource.manifestSha256 || null,
  } : null,
  storyboard: {shotCount: storyboard.shots?.length || 0, durationMs: report.storyboard?.durationMs || null},
  media: {path: report.reviewVideo.path, sha256: sha(videoPath), width: stream?.width || null, height: stream?.height || null, fps: stream?.r_frame_rate || null, durationMs: Math.round(Number(probe.format.duration) * 1000), frameCount: Number(stream?.nb_read_frames || 0), fullDecodePass: decode.status === 0, blackSegmentPass: !/black_start:/u.test(`${black.stdout}\n${black.stderr}`)},
  effects: {
    total: matrix.items?.length || 0,
    passReviewOnly: matrix.items?.filter((item) => item.status === "PASS_REVIEW_ONLY").map((item) => item.id) || [],
    blockedRequiredEvidence: matrix.items?.filter((item) => item.status === "BLOCKED_REQUIRED_EVIDENCE").map((item) => item.id) || [],
    notImplemented: matrix.items?.filter((item) => item.status === "NOT_IMPLEMENTED").map((item) => item.id) || [],
  },
  liveCapture: liveCapture ? {
    path: "work/full-article-screen-animation-canary-v1/live-capture/live-capture-report.json",
    status: liveCapture.status,
    sourceMode: liveCapture.source?.mode || null,
    durationMs: liveCapture.output?.durationMs || null,
    eventCount: liveCapture.events?.length || 0,
    targetCount: liveCapture.domTargets?.length || 0,
    targetFailures: liveCapture.targetFailures || [],
    geometryTruthStatus: liveCapture.geometryTruth?.status || null,
    fullDecodePass: liveCapture.output?.fullDecodePass === true,
    videoPath: liveCapture.output?.path || null,
    videoSha256: liveCapture.output?.sha256 || null,
  } : null,
  frames: report.stillFrames,
  boundary: report.boundary,
  failures: fail,
  generatedAt: new Date().toISOString(),
};
audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
fs.writeFileSync(path.join(dir, "full-article-audit-report.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
if (fail.length) process.exitCode = 1;
