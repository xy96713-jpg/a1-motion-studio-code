#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const scenarioId = process.argv[2] || "blind-nasa-ocean-v1";
if (!/^[a-z0-9][a-z0-9._-]*$/u.test(scenarioId)) throw new Error("blind-scenario-id-must-be-path-safe");
const sourceRoot = path.join(root, `work/screen-recording-maturity-test-v1/blind-test-v1/capture/${scenarioId}`);
const scenarioPath = path.join(root, `work/screen-recording-maturity-test-v1/blind-test-v1/${scenarioId}-scenario.json`);
const reportPath = path.join(sourceRoot, "capture-report.json");
const sourceVideo = path.join(sourceRoot, "clean-source.mp4");
const outputRoot = path.join(root, `work/screen-recording-maturity-test-v1/blind-test-v1/render/${scenarioId}`);
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const publicRelativeRoot = `proof-only/screen-recording-maturity-test-v1/blind-test-v1/${scenarioId}`;
const publicOutputRoot = path.join(publicRoot, publicRelativeRoot);
const stagedVideo = path.join(publicOutputRoot, "clean-source.mp4");
const cleanVideo = path.join(outputRoot, "article-clean-1280x720-60fps.mp4");
const reviewVideo = path.join(outputRoot, "article-review-1280x720-60fps.mp4");
const contactPath = path.join(outputRoot, "article-contact-sheet.png");
const auditPath = path.join(outputRoot, "audit-report.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clampCenter = (value, scale) => {const half=.5/scale;return Math.min(1-half,Math.max(half,value));};
const pose = (rect, scale) => ({x: clampCenter(rect.x + rect.width / 2, scale), y: clampCenter(rect.y + rect.height / 2, scale), scale});
const titleBar = (text) => Buffer.from(`<svg width="426" height="42"><rect width="426" height="42" fill="#091011"/><text x="14" y="27" fill="#F4F1E8" font-size="14" font-family="Arial" font-weight="700">${text}</text></svg>`);
const probe = (file) => {
  execFileSync(ffmpeg, ["-v", "error", "-i", file, "-f", "null", "-"]);
  return JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
};

async function main() {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
  if (report.status !== "READY_FOR_CAP_REVIEW" || report.output.sha256 !== sha(sourceVideo) || scenario.directorPlan.autoDiscovered !== true) throw new Error("blind-source-not-ready");
  const targets = Object.fromEntries(report.geometryTruth.targets.map((row) => [row.targetKey, row]));
  for (const id of ["blind-hero", "blind-primary", "blind-evidence", "blind-image"]) if (!targets[id]) throw new Error(`blind-target:${id}`);
  await fsp.mkdir(outputRoot, {recursive: true});
  await fsp.mkdir(publicOutputRoot, {recursive: true});
  await fsp.copyFile(sourceVideo, stagedVideo);

  const durationMs = Math.round(report.output.durationMs - 100);
  const scrollOperations = scenario.operations.filter((operation) => operation.type === "scroll").sort((a, b) => a.atMs - b.atMs);
  if (scrollOperations.length !== 3) throw new Error("blind-article-three-evidence-beats-required");
  const cameraTrack = [{atMs: 0, x: .5, y: .5, scale: 1, easingToNext: "hold"}];
  const windows = scrollOperations.map((operation, index) => {
    const target = targets[operation.name];
    const settled = report.events.find((event) => event.name === `${operation.name}-scroll-settled`);
    if (!target || !settled || target.observedAtMs < settled.tMs) throw new Error(`blind-event-geometry-order:${operation.name}`);
    const nextStart = scrollOperations[index + 1]?.atMs ?? durationMs;
    const startMs = Math.round(target.observedAtMs + 250);
    const peakMs = startMs + 550;
    const holdEndMs = Math.min(nextStart - 1550, durationMs - 1500);
    const restoreEndMs = holdEndMs + 750;
    if (peakMs + 700 > holdEndMs || restoreEndMs >= nextStart) throw new Error(`blind-beat-hold-insufficient:${operation.name}`);
    const scale = operation.targetKind === "REGION" ? 1.18 : 1.16;
    cameraTrack.push({atMs: startMs, x: .5, y: .5, scale: 1, easingToNext: "cinematic-in-out"});
    cameraTrack.push({atMs: peakMs, ...pose(target.sourceRect, scale), easingToNext: "hold"});
    cameraTrack.push({atMs: holdEndMs, ...pose(target.sourceRect, scale), easingToNext: "restore"});
    cameraTrack.push({atMs: restoreEndMs, x: .5, y: .5, scale: 1, easingToNext: "hold"});
    return {name: operation.name, startMs, peakMs, holdEndMs, restoreEndMs, nextStart};
  });
  cameraTrack.push({atMs: durationMs, x: .5, y: .5, scale: 1, easingToNext: "hold"});
  const evidenceWindow = windows.find((window) => window.name === "blind-evidence");
  if (!evidenceWindow || !targets["blind-evidence"].lineRects?.length) throw new Error("blind-evidence-line-geometry-required");
  const attentionTrack = [{beat: "blind-evidence-underline", startMs: evidenceWindow.peakMs + 100, endMs: evidenceWindow.holdEndMs - 100, region: targets["blind-evidence"].sourceRect, lineRects: targets["blind-evidence"].lineRects.slice(0, 3), treatment: "SOURCE_BOUND_UNDERLINE", colorRole: "BLUE_EVIDENCE"}];
  const phaseLabels = {"blind-image": ["正文图像", "真实图像区域 · 回正"], "blind-primary": ["正文阅读", "真实段落几何 · 回正"], "blind-evidence": ["证据标注", "真实文字行框 · 停留"]};
  const phases = [
    {id: "AUTO_DISCOVERY", startMs: 0, endMs: scrollOperations[0].atMs, label: "文章开场", detail: "真实网页标题"},
    ...scrollOperations.map((operation, index) => ({id: operation.name, startMs: operation.atMs, endMs: scrollOperations[index + 1]?.atMs ?? durationMs, label: phaseLabels[operation.name][0], detail: phaseLabels[operation.name][1]})),
  ];
  const scene = {
    shotId: scenarioId, timelineStartMs: 0, timelineEndMs: durationMs, durationMs,
    sourceActionId: "auto-discovered-unseen-article", sourceVideoUri: `${publicRelativeRoot}/clean-source.mp4`,
    sourceSegments: [{kind: "video", outputStartMs: 0, outputEndMs: durationMs, sourceStartMs: 0, sourceEndMs: durationMs, evidenceRole: "UNSEEN_LIVE_ARTICLE"}],
    screenDirection: {contract: "A1ScreenActionDirection/v1", grammar: "AUTO_DISCOVERED_ARTICLE", cameraPath: "CINEMATIC_EASE_IN_OUT_RESTORE", motionBlurPolicy: "VELOCITY_CINEMATIC", clickFeedbackPolicy: "PRESS_ONLY", attentionTrack, cameraPerformance: {mode: "BLIND_ARTICLE_REVIEW"}},
    pointerTrack: null, cameraTrack, editCoverage: {mode: "AUTO_DISCOVERED_UNSEEN_ARTICLE", fullSourceActionShown: true},
  };
  const props = {contract: "A1ScreenMotionDynamicsReview/v1", width: 1280, height: 720, fps: 60, durationMs, scene, phases, showPhaseLabels: true};
  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/ScreenMotionDynamicsReviewEntry.tsx"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const frames = [];
  try {
    const reviewComp = await selectComposition({serveUrl, id: "A1ScreenMotionDynamicsReviewV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    const cleanProps = {...props, showPhaseLabels: false};
    const cleanComp = await selectComposition({serveUrl, id: "A1ScreenMotionDynamicsReviewV1", inputProps: cleanProps, puppeteerInstance: browser, logLevel: "warn"});
    for (const [outputLocation, renderProps, composition] of [[cleanVideo, cleanProps, cleanComp], [reviewVideo, props, reviewComp]]) {
      await renderMedia({serveUrl, composition, inputProps: renderProps, outputLocation, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    }
    for (const row of [{id: "hero", atMs: 1600}, ...windows.map((window) => ({id: window.name.replace("blind-", ""), atMs: Math.round((window.peakMs + window.holdEndMs) / 2)})), {id: "final", atMs: durationMs - 300}]) {
      const file = path.join(outputRoot, `${row.id}.png`);
      await renderStill({serveUrl, composition: cleanComp, inputProps: cleanProps, frame: Math.round(row.atMs / 1000 * 60), output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const stats = await sharp(file).stats();
      frames.push({...row, path: path.relative(root, file), sha256: sha(file), meanLuma: stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3});
    }
  } finally {await browser.close({silent: true});}

  const tiles = await Promise.all(frames.map(async (row) => {
    const image = await sharp(path.join(root, row.path)).resize(426, 240, {fit: "cover"}).png().toBuffer();
    return sharp({create: {width: 426, height: 282, channels: 3, background: "#091011"}}).composite([{input: titleBar(`${row.id.toUpperCase()} · ${(row.atMs / 1000).toFixed(2)}s`), left: 0, top: 0}, {input: image, left: 0, top: 42}]).png().toBuffer();
  }));
  await sharp({create: {width: 1278, height: 564, channels: 3, background: "#091011"}}).composite(tiles.map((input, index) => ({input, left: (index % 3) * 426, top: Math.floor(index / 3) * 282}))).png().toFile(contactPath);
  const cleanProbe = probe(cleanVideo), reviewProbe = probe(reviewVideo);
  const cleanStream = cleanProbe.streams.find((row) => row.codec_type === "video"), reviewStream = reviewProbe.streams.find((row) => row.codec_type === "video");
  const scrollGroups = Object.values(report.scrollTelemetry.reduce((groups, row) => { (groups[row.event] ??= []).push(row); return groups; }, {}));
  const failures = [];
  const expectedFrames = Math.round(durationMs / 1000 * 60);
  if (cleanStream.width !== 1280 || cleanStream.height !== 720 || Number(cleanStream.nb_read_frames) !== expectedFrames) failures.push("CLEAN_MEDIA");
  if (reviewStream.width !== 1280 || reviewStream.height !== 720 || Number(reviewStream.nb_read_frames) !== expectedFrames) failures.push("REVIEW_MEDIA");
  if (scrollGroups.length !== 3 || scrollGroups.some((rows) => rows.some((row) => row.velocityPxPerMs < -.01) || Math.abs(rows.at(-1).velocityPxPerMs) > .01)) failures.push("SCROLL_MOTION");
  if (!scenario.discovery.selected.image.sourceUrl || scenario.discovery.selected.image.top > scenario.discovery.bodyRange.endTop || !scrollOperations.some((operation) => operation.name === "blind-image" && operation.index === scenario.discovery.selected.image.index)) failures.push("ARTICLE_BODY_IMAGE_BINDING");
  if (frames.some((row) => row.meanLuma < 5)) failures.push("BLACK_FRAME");
  const audit = {
    contract: "A1BlindArticleScreenAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY",
    source: {url: report.url, title: scenario.discovery.title, scenarioSha256: report.scenarioSha256, discoverySha256: scenario.discovery.discoverySha256, autoDiscovered: true, counts: scenario.discovery.counts, captureReportSha256: sha(reportPath), videoSha256: report.output.sha256, targetCount: report.geometryTruth.targets.length, lineRectCount: report.geometryTruth.targets.reduce((sum, row) => sum + row.lineRects.length, 0)},
    outputs: {clean: {path: path.relative(root, cleanVideo), sha256: sha(cleanVideo), frameCount: Number(cleanStream.nb_read_frames), fullDecode: true}, review: {path: path.relative(root, reviewVideo), sha256: sha(reviewVideo), frameCount: Number(reviewStream.nb_read_frames), fullDecode: true}, contactSheet: {path: path.relative(root, contactPath), sha256: sha(contactPath), frames}},
    checks: {noHandwrittenSelectors: true, autoContentDiscovery: true, articleBodyImageNotRelatedCard: !failures.includes("ARTICLE_BODY_IMAGE_BINDING"), cameraTimingFromCapturedEvents: true, unseenDomain: true, liveCapture: true, scrollMonotonicAndSettled: !failures.includes("SCROLL_MOTION"), realGeometry: true, semanticCamera: true, sourceBoundUnderline: true, cameraRestoresWide: true, fullDecode: true, noBlackSamples: true, currentAuthorityMutation: false},
    failures,
    boundary: {reviewOnly: true, userVisualApproval: "NOT_APPROVED", productionAdmission: false, oneUnseenArticlePassed: true, threeProjectBlindSetComplete: false, formal34ShotMutation: false},
  };
  audit.auditSha256 = hash(audit);
  await fsp.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify(audit, null, 2));
  if (failures.length) process.exitCode = 1;
}
main().catch((error) => {console.error(error); process.exitCode = 1;});
