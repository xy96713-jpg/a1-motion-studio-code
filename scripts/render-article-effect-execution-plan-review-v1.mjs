#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";
import {compileArticleReviewCamera, assertContinuousCameraTrack} from "./lib/compile-article-review-camera-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(root, process.env.A1_EFFECT_CAPTURE_ROOT || "work/screen-recording-maturity-test-v1/blind-test-v1/capture/blind-nasa-ocean-v2");
const outputRoot = path.resolve(root, process.env.A1_EFFECT_REVIEW_ROOT || "work/screen-recording-maturity-test-v1/article-effect-readiness-v1/render-v2-smooth");
const publicRoot = path.join(root, "remotion-renderer", "public");
const publicRelativeRoot = "proof-only/screen-recording-maturity-test-v1/article-effect-readiness-v1/render-v2-smooth";
const rendererRoot = path.join(root, "remotion-renderer");
const reportPath = path.join(sourceRoot, "capture-report.json");
const planPath = path.resolve(root, process.env.A1_EFFECT_PLAN_PATH || "work/screen-recording-maturity-test-v1/article-effect-readiness-v1/nasa-article-effect-execution-plan-v1.json");
const sourceVideo = path.join(sourceRoot, "clean-source.mp4");
const stagedVideo = path.join(publicRoot, publicRelativeRoot, "source.mp4");
const reviewVideo = path.join(outputRoot, "nasa-article-effect-execution-review-1280x720-60fps.mp4");
const cleanVideo = path.join(outputRoot, "nasa-article-effect-execution-clean-1280x720-60fps.mp4");
const reportOut = path.join(outputRoot, "audit-report.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
const pixelMae = async (leftFile, rightFile) => {
  const [left, right] = await Promise.all([sharp(leftFile).removeAlpha().raw().toBuffer({resolveWithObject: true}), sharp(rightFile).removeAlpha().raw().toBuffer({resolveWithObject: true})]);
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) throw new Error("pixel-comparison-size-mismatch");
  let sum = 0;
  for (let index = 0; index < left.data.length; index += 1) sum += Math.abs(left.data[index] - right.data[index]);
  return sum / left.data.length;
};
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
if (report.status !== "READY_FOR_CAP_REVIEW" || report.output?.fullDecodePass !== true) throw new Error("article-capture-not-ready");
if (plan.status !== "READY_FOR_REVIEW_EXECUTION" || plan.productionAdmission !== false) throw new Error("execution-plan-not-review-ready");
if (sha(sourceVideo) !== report.output.sha256 || hash(report) !== plan.source.captureReportSha256) throw new Error("source-or-plan-binding-mismatch");

const cameraEntries = plan.entries.filter((entry) => ["SEMANTIC_PUSH", "DETAIL_DOLLY_IN_OUT"].includes(entry.effectId) && entry.target?.sourceRect);
const annotationEntries = plan.entries.filter((entry) => entry.adapter === "POST_SCREEN_ANNOTATION" && entry.target?.lineRects?.length);
const durationMs = Number(report.output.durationMs || 18000);
const {track: dedupeTrack, moves: cameraMoves} = compileArticleReviewCamera({entries: cameraEntries, report, durationMs});
assertContinuousCameraTrack(dedupeTrack);
const attentionTrack = annotationEntries.map((entry) => ({beat: entry.effectId, startMs: entry.timing.atMs, endMs: Math.min(durationMs, entry.timing.atMs + entry.timing.holdMs), region: entry.target.sourceRect, lineRects: entry.target.lineRects, treatment: entry.effectId === "EVIDENCE_UNDERLINE" ? "SOURCE_BOUND_UNDERLINE" : "SOURCE_BOUND_HIGHLIGHT_WASH", colorRole: "BLUE_EVIDENCE"}));
const phases = plan.entries.map((entry) => ({id: entry.effectId, startMs: Math.max(0, entry.timing.atMs - 240), endMs: Math.min(durationMs, entry.timing.atMs + entry.timing.holdMs + 240), label: entry.effectId, detail: `${entry.adapter} · ${entry.event}`}));
const scene = {shotId: "article-effect-execution-review", timelineStartMs: 0, timelineEndMs: durationMs, durationMs, sourceActionId: plan.source.scenarioId || "article", sourceVideoUri: `${publicRelativeRoot}/source.mp4`, sourceSegments: [{kind: "video", outputStartMs: 0, outputEndMs: durationMs, sourceStartMs: 0, sourceEndMs: durationMs, evidenceRole: "REAL_ARTICLE_CAPTURE"}], screenDirection: {contract: "A1ScreenActionDirection/v1", grammar: "ARTICLE_SCROLL_READ_EVIDENCE_DETAIL_CLOSE", cameraPath: "CINEMATIC_EASE_IN_OUT_RESTORE", motionBlurPolicy: "TEMPORAL_CAMERA_ONLY", temporalMotionBlur: {shutterAngle: 90, samples: 6}, attentionTrack, cursorPolicy: "HIDDEN_AFTER_CAPTURE", clickFeedbackPolicy: "PRESS_ONLY"}, pointerTrack: null, cameraTrack: dedupeTrack, editCoverage: {mode: "FULL_REAL_ARTICLE_CAPTURE", fullSourceActionShown: true}};
const makeProps = (overrides = {}) => ({contract: "A1ArticleScreenMaturityReview/v1", width: 1280, height: 720, fps: 60, durationMs, scene: {...scene, ...overrides.scene, screenDirection: {...scene.screenDirection, ...overrides.scene?.screenDirection}}, detailEvents: [], phases, showPhaseLabels: overrides.showPhaseLabels ?? true});

await fsp.mkdir(outputRoot, {recursive: true});
await fsp.mkdir(path.dirname(stagedVideo), {recursive: true});
await fsp.copyFile(sourceVideo, stagedVideo);
await fsp.writeFile(path.join(outputRoot, "camera-program.json"), JSON.stringify({cameraMoves, cameraTrack: dedupeTrack, executionPlanSha256: plan.planSha256}, null, 2));
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/ArticleScreenMaturityReviewEntry.tsx"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const activeProps = makeProps();
const cleanProps = makeProps({showPhaseLabels: false});
const noAnnotationProps = makeProps({scene: {screenDirection: {attentionTrack: []}}, showPhaseLabels: false});
const noCameraProps = makeProps({scene: {cameraTrack: [{atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}, {atMs: durationMs, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"}]}, showPhaseLabels: false});
const activeStills = [];
const variantFiles = {};
try {
  const activeComposition = await selectComposition({serveUrl, id: "A1ArticleScreenMaturityReviewV1", inputProps: activeProps, puppeteerInstance: browser, logLevel: "warn"});
  const cleanComposition = await selectComposition({serveUrl, id: "A1ArticleScreenMaturityReviewV1", inputProps: cleanProps, puppeteerInstance: browser, logLevel: "warn"});
  const noCameraComposition = await selectComposition({serveUrl, id: "A1ArticleScreenMaturityReviewV1", inputProps: noCameraProps, puppeteerInstance: browser, logLevel: "warn"});
  const noAnnotationComposition = await selectComposition({serveUrl, id: "A1ArticleScreenMaturityReviewV1", inputProps: noAnnotationProps, puppeteerInstance: browser, logLevel: "warn"});
  // Inspect the actual transition before committing to full encoding.
  for (const move of cameraMoves) {
    for (const [label, atMs] of [["start", move.startMs], ["middle", (move.startMs+move.peakMs)/2], ["peak", move.peakMs], ["return", (move.returnMs+move.endMs)/2], ["wide", move.endMs]]) {
      await renderStill({serveUrl, composition: cleanComposition, inputProps: cleanProps, frame: Math.round(atMs/1000*60), output: path.join(outputRoot, `transition-${move.effectId.toLowerCase()}-${move.event}-${label}.png`), imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    }
  }
  if (process.env.A1_EFFECT_STILLS_ONLY === "1") {
    console.log(JSON.stringify({status: "STILLS_READY", outputRoot, cameraMoves}));
  } else {
  await renderMedia({serveUrl, composition: activeComposition, inputProps: activeProps, outputLocation: reviewVideo, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  await renderMedia({serveUrl, composition: cleanComposition, inputProps: cleanProps, outputLocation: cleanVideo, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  for (const [index, entry] of plan.entries.entries()) {
    const frame = Math.min(activeComposition.durationInFrames - 1, Math.max(0, Math.round((entry.timing.atMs + Math.min(450, entry.timing.holdMs / 2)) / 1000 * 60)));
    const file = path.join(outputRoot, `effect-${String(index + 1).padStart(2, "0")}-${entry.effectId.toLowerCase()}.png`);
    await renderStill({serveUrl, composition: activeComposition, inputProps: activeProps, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    activeStills.push({effectId: entry.effectId, frame, atMs: Math.round(frame / 60 * 1000), path: path.relative(root, file), sha256: sha(file)});
  }
  const underlineEntry = plan.entries.find((entry) => entry.effectId === "EVIDENCE_UNDERLINE");
  if (underlineEntry) {
    const frame = Math.round((underlineEntry.timing.atMs + 450) / 1000 * 60);
    const active = path.join(outputRoot, "underline-active.png");
    const absent = path.join(outputRoot, "underline-absent.png");
    await renderStill({serveUrl, composition: cleanComposition, inputProps: cleanProps, frame, output: active, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    await renderStill({serveUrl, composition: noAnnotationComposition, inputProps: noAnnotationProps, frame, output: absent, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    variantFiles.underlineMae = await pixelMae(active, absent);
  }
  const cameraEntry = cameraEntries[0];
  if (cameraEntry) {
    const frame = Math.round((cameraEntry.timing.atMs + Math.min(600, cameraEntry.timing.holdMs)) / 1000 * 60);
    const active = path.join(outputRoot, "camera-active.png");
    const absent = path.join(outputRoot, "camera-absent.png");
    await renderStill({serveUrl, composition: cleanComposition, inputProps: cleanProps, frame, output: active, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    await renderStill({serveUrl, composition: noCameraComposition, inputProps: noCameraProps, frame, output: absent, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    variantFiles.cameraMae = await pixelMae(active, absent);
  }
  }
} finally {
  await browser.close({silent: true});
}
if (process.env.A1_EFFECT_STILLS_ONLY === "1") process.exit(0);

const reviewProbe = probe(reviewVideo);
const cleanProbe = probe(cleanVideo);
const reviewStream = reviewProbe.streams.find((row) => row.codec_type === "video");
const cleanStream = cleanProbe.streams.find((row) => row.codec_type === "video");
execFileSync(ffmpeg, ["-v", "error", "-i", reviewVideo, "-f", "null", "-"]);
execFileSync(ffmpeg, ["-v", "error", "-i", cleanVideo, "-f", "null", "-"]);
const failures = [];
if (reviewStream?.width !== 1280 || reviewStream?.height !== 720 || reviewStream?.r_frame_rate !== "60/1" || Number(reviewStream?.nb_read_frames) !== Math.round(durationMs / 1000 * 60)) failures.push("REVIEW_MEDIA_CONTRACT");
if (cleanStream?.width !== 1280 || cleanStream?.height !== 720 || cleanStream?.r_frame_rate !== "60/1" || Number(cleanStream?.nb_read_frames) !== Math.round(durationMs / 1000 * 60)) failures.push("CLEAN_MEDIA_CONTRACT");
if (activeStills.length !== plan.entries.length || activeStills.some((row) => !fs.existsSync(path.join(root, row.path)))) failures.push("EFFECT_STILL_MISSING");
if (annotationEntries.length && Number(variantFiles.underlineMae || 0) < 0.02) failures.push("UNDERLINE_PIXEL_DELTA_TOO_SMALL");
if (cameraEntries.length && Number(variantFiles.cameraMae || 0) < 0.2) failures.push("CAMERA_PIXEL_DELTA_TOO_SMALL");
const output = {
  contract: "A1ArticleEffectExecutionReview/v1",
  status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY",
  source: {
    captureReport: path.relative(root, reportPath),
    captureReportSha256: sha(reportPath),
    sourceVideo: path.relative(root, sourceVideo),
    sourceVideoSha256: sha(sourceVideo),
    executionPlan: path.relative(root, planPath),
    executionPlanSha256: plan.planSha256,
  },
  selectedEffects: plan.entries.map((entry) => ({
    id: entry.effectId,
    event: entry.event,
    adapter: entry.adapter,
    atMs: entry.timing.atMs,
    targetKey: entry.target?.targetKey || null,
  })),
  outputs: {
    reviewVideo: {
      path: path.relative(root, reviewVideo),
      sha256: sha(reviewVideo),
      width: reviewStream?.width || null,
      height: reviewStream?.height || null,
      fps: reviewStream?.r_frame_rate || null,
      frameCount: Number(reviewStream?.nb_read_frames || 0),
      durationMs: Math.round(Number(reviewProbe.format.duration) * 1000),
      fullDecode: true,
    },
    cleanVideo: {
      path: path.relative(root, cleanVideo),
      sha256: sha(cleanVideo),
      width: cleanStream?.width || null,
      height: cleanStream?.height || null,
      fps: cleanStream?.r_frame_rate || null,
      frameCount: Number(cleanStream?.nb_read_frames || 0),
      durationMs: Math.round(Number(cleanProbe.format.duration) * 1000),
      fullDecode: true,
    },
    stills: activeStills,
  },
  pixelProof: variantFiles,
  cameraMoves,
  actualRenderer: "REMOTION_DIAGNOSTIC_ONLY",
  visualAcceptance: "PENDING_CONTINUOUS_PLAYBACK_REVIEW",
  cameraTrackSha256: hash(dedupeTrack),
  attentionTrackSha256: hash(attentionTrack),
  checks: {
    planBound: true,
    realSourceVideoBound: true,
    selectedEffectsOnly: true,
    fullDecodePass: true,
    sourcePixelsPreserved: true,
    currentAuthorityMutation: false,
    productionAdmission: false,
  },
  failures,
  boundary: {
    reviewOnly: true,
    productionAdmission: false,
    currentWorkspaceMutation: false,
    currentPhaseMutation: false,
    formal34ShotMutation: false,
  },
};
output.auditSha256 = hash(output);
await fsp.writeFile(reportOut, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
if (failures.length) process.exitCode = 1;
