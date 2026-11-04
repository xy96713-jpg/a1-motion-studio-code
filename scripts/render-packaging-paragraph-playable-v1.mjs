#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";

import {readPackagingParagraphEffectiveLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-effective-lifecycle-v1.mjs";
import {readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";
import {readPackagingParagraphUserDecision} from "../apps/studio-next/src/lib/a1-packaging-paragraph-user-decision-v1.mjs";
import {readPackagingParagraphPlayablePlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-plan-v1.mjs";
import {
  assertPackagingParagraphPlayableRenderAuthorization,
  assertPackagingParagraphPlayableRenderResult,
  assertPackagingParagraphPlayableRenderState,
  buildPackagingParagraphPlayableRenderImplementationBinding,
  createPackagingParagraphPlayableRenderProps,
  createPackagingParagraphPlayableRenderResult,
  packagingParagraphPlayableRenderPaths,
  updatePackagingParagraphPlayableRenderState,
} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-render-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const appPublicRoot = path.join(appRoot, "public");
const rendererRoot = path.join(projectRoot, "remotion-renderer");
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const projectRequire = createRequire(path.join(projectRoot, "package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const ffprobePath = projectRequire("@ffprobe-installer/ffprobe").path;
const sharp = projectRequire("sharp");

const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.resolve(appPublicRoot, String(publicUrl).replace(/^\//u, ""));
const assertPublicFile = (publicUrl, expectedSha256) => {
  const file = publicFile(publicUrl);
  if (!file.startsWith(`${appPublicRoot}${path.sep}`) || !fs.existsSync(file) || shaFile(file) !== expectedSha256) throw new Error(`paragraph-playable-render-public-input-invalid:${publicUrl}`);
  return file;
};

function probe(file) {
  const {spawnSync} = projectRequire("node:child_process");
  const result = spawnSync(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], {encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`paragraph-playable-render-ffprobe-failed:${result.stderr || result.stdout || result.status}`);
  return JSON.parse(result.stdout);
}

function rational(value) {
  const [numerator, denominator] = String(value || "").split("/").map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : 0;
}

function streamDurationMs(stream) {
  const seconds = Number(stream?.duration);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const ticks = Number(stream?.duration_ts);
  const timeBase = rational(stream?.time_base);
  return Number.isFinite(ticks) && ticks > 0 && timeBase > 0 ? ticks * timeBase * 1000 : 0;
}

async function normalizedPixels(file, {width = 320, height = 180} = {}) {
  return sharp(file).resize(width, height, {fit: "fill"}).removeAlpha().raw().toBuffer();
}

function meanAbsolutePixelDelta(left, right) {
  if (left.length !== right.length) throw new Error("paragraph-playable-render-pixel-buffer-mismatch");
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return Number((total / left.length / 255).toFixed(6));
}

async function contactSheet(samples, output) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 32;
  const composites = [];
  for (const [index, sample] of samples.entries()) {
    const left = index % 3 * tileWidth;
    const top = Math.floor(index / 3) * (tileHeight + labelHeight);
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0d1112"/><text x="12" y="21" fill="#dfff68" font-family="monospace" font-size="12" font-weight="700">${sample.shotId} · ${sample.phase} · F${sample.frame}</text></svg>`);
    composites.push({input: label, left, top});
    composites.push({input: await sharp(sample.file).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer(), left, top: top + labelHeight});
  }
  await sharp({create: {width: tileWidth * 3, height: (tileHeight + labelHeight) * 3, channels: 4, background: "#0d1112"}}).composite(composites).png().toFile(output);
}

function binding(file, publicUrl) {
  return {publicUrl, sha256: shaFile(file), bytes: fs.statSync(file).size};
}

const baseLifecycle = readPackagingParagraphCanaryLifecycle(appRoot);
const lifecycle = readPackagingParagraphEffectiveLifecycle(appRoot, {baseLifecycle}) || baseLifecycle;
const userDecision = readPackagingParagraphUserDecision(appRoot, {lifecycle});
const plan = readPackagingParagraphPlayablePlan(appRoot, {lifecycle, userDecision});
if (!plan || userDecision?.decision !== "APPROVE_STATIC_PARAGRAPH_CANARY") throw new Error("paragraph-playable-render-approved-plan-required");
const expectedPlanSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedPlanSha256 || "")) || expectedPlanSha256 !== plan.planSha256) throw new Error("paragraph-playable-render-plan-cas-failed");
const paths = packagingParagraphPlayableRenderPaths(appRoot, plan.planSha256);
if (!fs.existsSync(paths.authorization) || !fs.existsSync(paths.state)) throw new Error("paragraph-playable-render-authorization-required");
const implementation = buildPackagingParagraphPlayableRenderImplementationBinding(projectRoot);
const authorization = assertPackagingParagraphPlayableRenderAuthorization(readJson(paths.authorization), {plan, userDecision, implementation});
const initialState = assertPackagingParagraphPlayableRenderState(readJson(paths.state), {authorization});
if (["BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW", "BOUNDED_PLAYABLE_AGENT_REVIEWING", "BOUNDED_PLAYABLE_AGENT_RECOMMENDS_USER_REVIEW", "BOUNDED_PLAYABLE_VISUAL_REPAIR_REQUIRED"].includes(initialState.status)) {
  console.log(JSON.stringify({status: initialState.status, idempotent: true, output: initialState.output}, null, 2));
  process.exit(0);
}
if (initialState.status === "BOUNDED_PLAYABLE_RENDERING" && fs.existsSync(paths.lock)) {
  console.log(JSON.stringify({status: initialState.status, idempotent: true, workerAlreadyRunning: true}, null, 2));
  process.exit(0);
}
if (initialState.status !== "BOUNDED_PLAYABLE_RENDER_QUEUED") throw new Error(`paragraph-playable-render-not-queueable:${initialState.status}`);

let workerLock;
try {
  workerLock = fs.openSync(paths.lock, "wx");
} catch {
  console.log(JSON.stringify({status: initialState.status, idempotent: true, workerAlreadyRunning: true}, null, 2));
  process.exit(0);
}

let tempRoot = null;
let publicStaging = null;
let browser = null;
try {
  updatePackagingParagraphPlayableRenderState(appRoot, {authorization, status: "BOUNDED_PLAYABLE_RENDERING", pid: process.pid});
  const props = createPackagingParagraphPlayableRenderProps(plan);
  const sourceBindings = [
    {publicUrl: props.audio.publicUrl, file: assertPublicFile(props.audio.publicUrl, props.audio.sha256), sha256: props.audio.sha256},
    ...props.shots.map((shot) => ({publicUrl: shot.staticFrame.publicUrl, file: assertPublicFile(shot.staticFrame.publicUrl, shot.staticFrame.sha256), sha256: shot.staticFrame.sha256})),
  ];
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-packaging-paragraph-playable-"));
  const samplesRoot = path.join(tempRoot, "samples");
  fs.mkdirSync(samplesRoot, {recursive: true});
  const videoFile = path.join(tempRoot, "packaging-paragraph-playable-960x540.mp4");
  const sheetFile = path.join(tempRoot, "temporal-contact-sheet.png");

  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: appPublicRoot, rootDir: rendererRoot, enableCaching: true});
  browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const composition = await selectComposition({serveUrl, id: props.compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  if (composition.durationInFrames !== props.durationInFrames || composition.fps !== props.fps || composition.width !== props.width || composition.height !== props.height) throw new Error("paragraph-playable-render-composition-metadata-mismatch");
  const samples = [];
  for (const shot of props.shots) {
    for (const phase of ["setup", "action", "hold"]) {
      const frame = shot.reviewFrames[phase];
      const file = path.join(samplesRoot, `${shot.shotId.toLowerCase()}-${phase}-f${String(frame).padStart(4, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", scale: props.reviewScale, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      samples.push({shotId: shot.shotId, phase, frame, file});
    }
  }
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    outputLocation: videoFile,
    frameRange: [0, composition.durationInFrames - 1],
    scale: props.reviewScale,
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 90,
    crf: 20,
    concurrency: Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) / 4))),
    hardwareAcceleration: "if-possible",
    overwrite: false,
    puppeteerInstance: browser,
    logLevel: "warn",
  });
  await browser.close({silent: true});
  browser = null;
  await contactSheet(samples, sheetFile);

  const sampleReports = [];
  const shotAudits = [];
  for (const shot of props.shots) {
    const shotSamples = samples.filter((sample) => sample.shotId === shot.shotId);
    const [setupPixels, actionPixels, holdPixels] = await Promise.all(shotSamples.map((sample) => normalizedPixels(sample.file)));
    const staticPixels = await normalizedPixels(assertPublicFile(shot.staticFrame.publicUrl, shot.staticFrame.sha256));
    const audit = {
      shotId: shot.shotId,
      setupActionDelta: meanAbsolutePixelDelta(setupPixels, actionPixels),
      actionHoldDelta: meanAbsolutePixelDelta(actionPixels, holdPixels),
      holdStaticParityDelta: meanAbsolutePixelDelta(holdPixels, staticPixels),
    };
    shotAudits.push(audit);
    for (const sample of shotSamples) sampleReports.push({shotId: sample.shotId, phase: sample.phase, frame: sample.frame, sha256: shaFile(sample.file), bytes: fs.statSync(sample.file).size, publicUrl: `${paths.publicUrlRoot}/samples/${path.basename(sample.file)}`});
  }

  const mediaProbe = probe(videoFile);
  const videoStream = mediaProbe.streams.find((stream) => stream.codec_type === "video");
  const audioStream = mediaProbe.streams.find((stream) => stream.codec_type === "audio");
  const containerDurationMs = Number(mediaProbe.format?.duration || 0) * 1000;
  const videoDurationMs = streamDurationMs(videoStream);
  const audioDurationMs = streamDurationMs(audioStream);
  const videoFrameCount = Number(videoStream?.nb_frames || 0);
  const audioSampleRate = Number(audioStream?.sample_rate || 0);
  // AAC-LC may expose one priming packet plus up to two packet-aligned tail
  // boundaries in the muxed stream. Keep the video timeline exact and bound
  // only this codec-level padding; source coverage and playbackRate remain
  // independent hard checks below.
  const maximumAacBoundaryPaddingMs = audioSampleRate > 0 ? 3 * 1024 / audioSampleRate * 1000 + 1 : 0;
  const checks = {
    authorizedImplementationCurrent: authorization.source.implementationSha256 === implementation.implementationSha256,
    sourceBindingsPreserved: sourceBindings.every((item) => shaFile(item.file) === item.sha256),
    reviewOnly960x540: videoStream?.width === 960 && videoStream?.height === 540,
    fps30: videoStream?.avg_frame_rate === "30/1",
    audioPresent: Boolean(audioStream),
    h264Video: videoStream?.codec_name === "h264",
    exactVideoFrameCount: videoFrameCount === props.durationInFrames,
    videoDurationMatchesFramePlan: Math.abs(videoDurationMs - props.timeline.encodedDurationMs) <= 1,
    audioCoversAuthoritativeWindow: audioDurationMs >= props.timeline.authoritativeDurationMs - maximumAacBoundaryPaddingMs && audioDurationMs <= props.timeline.encodedDurationMs + maximumAacBoundaryPaddingMs,
    sourceWindowFullyCovered: props.timeline.quantization.authoritativeSourceRangeFullyCovered === true,
    noAudioTimeCompression: props.audio.playbackRate === 1 && props.timeline.sourceAudioTimeCompressionAllowed === false,
    nineTemporalSamples: sampleReports.length === 9,
    semanticMotionVisible: shotAudits.every((item) => item.setupActionDelta >= 0.012 && item.actionHoldDelta >= 0.006),
    stableHoldReturnsToBoundStaticPixels: shotAudits.every((item) => item.holdStaticParityDelta <= 0.004),
    staticSlideshowRejectedByPolicy: props.shots.every((shot) => Boolean(shot.semanticActionId)),
    wholeFilmStillFrozen: authorization.boundary.wholeFilmMotionAllowed === false && authorization.boundary.fullFilmVisualApproval === false,
    downstreamStillFrozen: authorization.boundary.resolveAllowed === false && authorization.boundary.finalRenderAllowed === false && authorization.boundary.publicationAllowed === false,
  };

  publicStaging = `${paths.publicRoot}.staging-${process.pid}-${crypto.randomUUID()}`;
  fs.mkdirSync(path.join(publicStaging, "samples"), {recursive: true, mode: 0o700});
  fs.copyFileSync(videoFile, path.join(publicStaging, path.basename(videoFile)));
  fs.copyFileSync(sheetFile, path.join(publicStaging, path.basename(sheetFile)));
  for (const sample of samples) fs.copyFileSync(sample.file, path.join(publicStaging, "samples", path.basename(sample.file)));
  const result = createPackagingParagraphPlayableRenderResult({
    authorization,
    props,
    video: binding(path.join(publicStaging, path.basename(videoFile)), `${paths.publicUrlRoot}/${path.basename(videoFile)}`),
    contactSheet: binding(path.join(publicStaging, path.basename(sheetFile)), `${paths.publicUrlRoot}/${path.basename(sheetFile)}`),
    reportPublicUrl: `${paths.publicUrlRoot}/result.json`,
    samples: sampleReports,
    media: {
      container: {durationMs: containerDurationMs},
      video: {codec: videoStream?.codec_name || null, width: videoStream?.width || null, height: videoStream?.height || null, fps: videoStream?.avg_frame_rate || null, durationMs: videoDurationMs, frameCount: videoFrameCount},
      audio: {codec: audioStream?.codec_name || null, sampleRate: audioStream?.sample_rate || null, channels: audioStream?.channels || null, durationMs: audioDurationMs, maximumBoundaryPaddingMs: maximumAacBoundaryPaddingMs},
      sourceRange: structuredClone(props.timeline.quantization),
      shotAudits,
    },
    checks,
  });
  fs.writeFileSync(path.join(publicStaging, "render-props.json"), `${JSON.stringify(props, null, 2)}\n`, {encoding: "utf8", flag: "wx", mode: 0o600});
  fs.writeFileSync(path.join(publicStaging, "result.json"), `${JSON.stringify(result, null, 2)}\n`, {encoding: "utf8", flag: "wx", mode: 0o600});
  if (result.status !== "PASS_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW") throw new Error(`paragraph-playable-render-objective-audit-failed:${result.failures.join(",")}:videoFrames=${videoFrameCount}:videoDurationMs=${videoDurationMs}:audioDurationMs=${audioDurationMs}:containerDurationMs=${containerDurationMs}:aacBoundaryMs=${maximumAacBoundaryPaddingMs}`);
  if (fs.existsSync(paths.publicRoot)) {
    const existingResult = assertPackagingParagraphPlayableRenderResult(readJson(path.join(paths.publicRoot, "result.json")), {authorization, props});
    if (existingResult.resultSha256 !== result.resultSha256) throw new Error("paragraph-playable-render-publication-conflict");
    fs.rmSync(publicStaging, {recursive: true, force: true});
    publicStaging = null;
  } else {
    fs.mkdirSync(path.dirname(paths.publicRoot), {recursive: true});
    fs.renameSync(publicStaging, paths.publicRoot);
    publicStaging = null;
  }
  const output = {
    resultSha256: result.resultSha256,
    objectiveAuditStatus: result.status,
    video: result.output.video,
    contactSheet: result.output.contactSheet,
    reportPublicUrl: result.output.reportPublicUrl,
  };
  const state = updatePackagingParagraphPlayableRenderState(appRoot, {authorization, status: "BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW", output});
  console.log(JSON.stringify({status: state.status, resultSha256: result.resultSha256, video: result.output.video, contactSheet: result.output.contactSheet, failures: result.failures, automaticAgentReviewReady: true, userVisualApproval: "NOT_APPROVED", wholeFilmMotionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, null, 2));
} catch (error) {
  if (browser) await browser.close({silent: true}).catch(() => {});
  const message = error instanceof Error ? error.message : String(error);
  try {
    const state = assertPackagingParagraphPlayableRenderState(readJson(paths.state), {authorization});
    if (["BOUNDED_PLAYABLE_RENDER_QUEUED", "BOUNDED_PLAYABLE_RENDERING"].includes(state.status)) updatePackagingParagraphPlayableRenderState(appRoot, {authorization, status: "BOUNDED_PLAYABLE_RENDER_FAILED", failure: message});
  } catch {}
  throw error;
} finally {
  if (tempRoot) fs.rmSync(tempRoot, {recursive: true, force: true});
  if (publicStaging) fs.rmSync(publicStaging, {recursive: true, force: true});
  if (workerLock != null) fs.closeSync(workerLock);
  fs.rmSync(paths.lock, {force: true});
}
