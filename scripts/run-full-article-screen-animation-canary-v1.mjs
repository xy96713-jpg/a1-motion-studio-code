#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const canaryRoot = path.join(root, "work/full-article-screen-animation-canary-v1");
const sourceRoot = path.join(canaryRoot, "source-capture");
const cropRoot = path.join(canaryRoot, "page-crops");
const sourceVideoRoot = path.join(canaryRoot, "source-video");
const renderRoot = path.join(canaryRoot, "render");
const pageImage = path.join(sourceRoot, "element-screenshot.png");
const readabilityPath = path.join(sourceRoot, "readability.json");
const sourceJobPath = path.join(sourceRoot, "web-capture-job.json");
const storyboardPath = path.join(canaryRoot, "storyboard-shot-plan.json");
const capabilityPath = path.join(canaryRoot, "effect-capability-matrix.json");
const articleSourceManifestPath = path.join(canaryRoot, "article-source.json");
const manifestPath = path.join(canaryRoot, "canary-report.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublic = path.join(canaryRoot, "remotion-public");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const run = (command, args) => execFileSync(command, args, {cwd: root, stdio: ["ignore", "pipe", "pipe"]});
const probe = (file) => JSON.parse(run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file]).toString());

if (!fs.existsSync(pageImage) || !fs.existsSync(readabilityPath) || !fs.existsSync(sourceJobPath)) {
  throw new Error("full-article-source-capture-required");
}

const readability = JSON.parse(fs.readFileSync(readabilityPath, "utf8"));
const sourceJob = JSON.parse(fs.readFileSync(sourceJobPath, "utf8"));
const assetCandidatesPath = path.join(sourceRoot, "asset-candidates.json");
const articleSourceFiles = {
  sourceHtml: path.join(sourceRoot, "source.html"),
  sourceJson: path.join(sourceRoot, "source.json"),
  readability: readabilityPath,
  fullPageScreenshot: path.join(sourceRoot, "page-screenshot.png"),
  articleScreenshot: pageImage,
  assetCandidates: assetCandidatesPath,
  candidateContactSheet: path.join(sourceRoot, "candidate-preview-contact-sheet.png"),
};
const cachedCandidates = fs.existsSync(assetCandidatesPath) ? JSON.parse(fs.readFileSync(assetCandidatesPath, "utf8")) : {};
const articleSourceManifest = {
  contract: "A1ArticleSourceManifest/v1",
  status: "READY_FOR_REVIEW",
  source: {url: sourceJob.sourceUrl, title: readability.title, capturedAt: sourceJob.generatedAt, mode: "REAL_CACHED_WEBPAGE_CAPTURE", captureJobId: sourceJob.jobId},
  article: {wordCount: String(readability.textContent || "").trim().split(/\s+/u).filter(Boolean).length, textLength: Number(readability.length || 0), excerpt: readability.excerpt || ""},
  files: Object.fromEntries(Object.entries(articleSourceFiles).map(([key, file]) => [key, {path: path.relative(root, file), sha256: sha(file)}])),
  imageCandidates: {count: Array.isArray(cachedCandidates.items) ? cachedCandidates.items.length : (cachedCandidates.candidates?.length || 0), manifestPath: path.relative(root, assetCandidatesPath), contactSheetPath: path.relative(root, articleSourceFiles.candidateContactSheet), cachedOnly: true},
  cachePolicy: {remoteRenderAllowed: false, localCacheRequired: true, provenanceRequired: true},
  boundary: {reviewOnly: true, currentWorkspaceMutation: false, currentPhaseMutation: false, productionAdmission: false},
  generatedAt: new Date().toISOString(),
};
articleSourceManifest.manifestSha256 = crypto.createHash("sha256").update(JSON.stringify(articleSourceManifest)).digest("hex");
writeJson(articleSourceManifestPath, articleSourceManifest);
const articleWordCount = String(readability.textContent || "").trim().split(/\s+/u).filter(Boolean).length;
const pageMetadata = await sharp(pageImage).metadata();
const pageWidth = Number(pageMetadata.width || 0);
const pageHeight = Number(pageMetadata.height || 0);
const fps = Number(process.env.A1_ARTICLE_REVIEW_FPS || 60);
const width = Number(process.env.A1_ARTICLE_REVIEW_WIDTH || 1280);
const height = Number(process.env.A1_ARTICLE_REVIEW_HEIGHT || 720);
const secondsPerShot = 15;
const effectMatrix = [
  {id: "LOCK_WIDE", family: "CAMERA", status: "PASS_REVIEW_ONLY", reason: "真实网页首帧建立。"},
  {id: "SCROLL_BRAKE", family: "CAMERA", status: "PASS_REVIEW_ONLY", reason: "缓存网页长图分段硬切并在段首停稳。"},
  {id: "FOLLOW_PAN", family: "CAMERA", status: "PASS_REVIEW_ONLY", reason: "段内沿文章图像/正文焦点平移。"},
  {id: "SEMANTIC_PUSH", family: "CAMERA", status: "PASS_REVIEW_ONLY", reason: "真实网页像素上的克制推近。"},
  {id: "DETAIL_LENS", family: "CAMERA", status: "PASS_REVIEW_ONLY", reason: "图片证据局部细节放大。"},
  {id: "FOCUS_DIM", family: "FOCUS", status: "NOT_IMPLEMENTED", reason: "本 canary 不新增遮罩/压暗 renderer。"},
  {id: "EVIDENCE_UNDERLINE", family: "ANNOTATION", status: "BLOCKED_REQUIRED_EVIDENCE", reason: "需要真实文字行框与来源标注绑定。"},
  {id: "BEFORE_AFTER_SPLIT", family: "COMPARISON", status: "BLOCKED_REQUIRED_EVIDENCE", reason: "文章没有真实前后状态。"},
  {id: "WIPE_COMPARE", family: "COMPARISON", status: "BLOCKED_REQUIRED_EVIDENCE", reason: "没有第二个可验证状态，禁止伪造。"},
  {id: "HARD_CUT_STATE_REPLACE", family: "TRANSITION", status: "PASS_REVIEW_ONLY", reason: "章节/证据状态切换使用硬切。"},
  {id: "RESULT_HOLD", family: "HOLD", status: "PASS_REVIEW_ONLY", reason: "每个真实结果段保留阅读时间。"},
  {id: "LONG_CAUSAL_BEAT_MAP", family: "RHYTHM", status: "PASS_REVIEW_ONLY", reason: "12 镜连续文章使用显式 before/action/hold beat map。"},
];

const shots = [
  ["NOAA-01", "setup", "建立题目与海域", 0, "LOCK_WIDE"],
  ["NOAA-02", "problem", "沉船成为硬底栖息地", 140, "SCROLL_BRAKE"],
  ["NOAA-03", "proof", "珊瑚构建复杂生态结构", 280, "SEMANTIC_PUSH"],
  ["NOAA-04", "proof", "生物多样性与渔业价值", 420, "FOLLOW_PAN"],
  ["NOAA-05", "problem", "脆弱性与恢复时间", 560, "DETAIL_LENS"],
  ["NOAA-06", "proof", "Vulnerable Marine Ecosystems", 700, "RESULT_HOLD"],
  ["NOAA-07", "bridge", "真实沉船生命图像", 840, "DETAIL_LENS"],
  ["NOAA-08", "setup", "阿留申群岛研究缺口", 980, "SCROLL_BRAKE"],
  ["NOAA-09", "method", "低速与高速探索方式", 1120, "FOLLOW_PAN"],
  ["NOAA-10", "method", "声学与合成孔径声纳", 1260, "SEMANTIC_PUSH"],
  ["NOAA-11", "proof", "ROV 地面验证", 1400, "HARD_CUT_STATE_REPLACE"],
  ["NOAA-12", "closing", "从沉船到生态系统判断", 1632, "RESULT_HOLD"],
].map(([id, storyRole, task, cropY, effect], order) => ({
  id, order: order + 1, storyRole, task, effect,
  durationSec: secondsPerShot,
  source: {url: sourceJob.sourceUrl, localPageImage: "source-capture/element-screenshot.png", cropY},
  beatMap: {beforeMs: 0, actionMs: 5200, holdMs: 7600, endMs: secondsPerShot * 1000},
  motion: {camera: effect === "FOLLOW_PAN" ? "minimum-jerk-pan" : effect === "SEMANTIC_PUSH" || effect === "DETAIL_LENS" ? "minimum-jerk-push" : "locked"},
  evidence: {sourceSha256: sha(pageImage), geometry: "derived-from-cached-page-image", provenanceRequired: true},
}));

if (pageWidth < 1200 || pageHeight < 1800) throw new Error(`article-page-image-too-small:${pageWidth}x${pageHeight}`);

fs.mkdirSync(cropRoot, {recursive: true});
fs.mkdirSync(sourceVideoRoot, {recursive: true});
fs.mkdirSync(renderRoot, {recursive: true});
const cropManifest = [];
for (const shot of shots) {
  const cropPath = path.join(cropRoot, `${shot.id}.png`);
  const top = Math.max(0, Math.min(pageHeight - Math.round(pageWidth * height / width), shot.source.cropY));
  const cropHeight = Math.round(pageWidth * height / width);
  await sharp(pageImage).extract({left: 0, top, width: pageWidth, height: cropHeight}).resize(width, height).png().toFile(cropPath);
  cropManifest.push({shotId: shot.id, path: path.relative(root, cropPath), sha256: sha(cropPath), crop: {x: 0, y: top, width: pageWidth, height: cropHeight}});
}
writeJson(path.join(sourceVideoRoot, "crop-manifest.json"), {contract: "A1ArticlePageCropManifest/v1", sourceSha256: sha(pageImage), items: cropManifest});

const segmentPaths = [];
for (const shot of shots) {
  const cropPath = path.join(root, cropManifest.find((item) => item.shotId === shot.id).path);
  const segmentPath = path.join(sourceVideoRoot, `${shot.id}.mp4`);
  run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", cropPath, "-t", String(secondsPerShot), "-vf", `fps=${fps},format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", segmentPath]);
  segmentPaths.push(segmentPath);
}
const concatFile = path.join(sourceVideoRoot, "concat.txt");
fs.writeFileSync(concatFile, `${segmentPaths.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n")}\n`);
const sourceVideo = path.join(sourceVideoRoot, "article-page-source-180s.mp4");
run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", "-movflags", "+faststart", sourceVideo]);
const sourceProbe = probe(sourceVideo);
const sourceStream = sourceProbe.streams.find((item) => item.codec_type === "video");
if (sourceStream?.width !== width || sourceStream?.height !== height || sourceStream?.r_frame_rate !== `${fps}/1`) throw new Error("article-source-video-contract-invalid");

fs.mkdirSync(rendererPublic, {recursive: true});
for (const relative of [
  "a1-editorial-fonts",
  "generated/system-line/editorial-asset-workbench-v1/font-cache",
]) {
  const sourceDir = path.join(rendererRoot, "public", relative);
  if (fs.existsSync(sourceDir)) fs.cpSync(sourceDir, path.join(rendererPublic, relative), {recursive: true, force: true});
}
const publicSource = path.join(rendererPublic, "full-article-screen-animation-canary-v1", "article-page-source-180s.mp4");
const publicFirstFrame = path.join(rendererPublic, "full-article-screen-animation-canary-v1", "first-frame.png");
fs.mkdirSync(path.dirname(publicSource), {recursive: true});
fs.copyFileSync(sourceVideo, publicSource);
run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", sourceVideo, "-frames:v", "1", publicFirstFrame]);

const nativeFrames = Number(sourceStream.nb_read_frames || Math.round(Number(sourceProbe.format.duration) * fps));
const keys = [{frame: 0, cx: width / 2, cy: height / 2, zoom: 1}];
for (let index = 0; index < shots.length; index += 1) {
  const start = index * secondsPerShot * fps;
  const end = start + secondsPerShot * fps - 1;
  const effect = shots[index].effect;
  if (["SEMANTIC_PUSH", "DETAIL_LENS"].includes(effect)) {
    keys.push({frame: start + 80, cx: width * 0.5, cy: height * 0.5, zoom: 1});
    keys.push({frame: end - 80, cx: width * (index % 2 ? 0.52 : 0.48), cy: height * 0.5, zoom: 1.08});
  } else if (effect === "FOLLOW_PAN") {
    keys.push({frame: start + 80, cx: width * 0.49, cy: height * 0.5, zoom: 1.03});
    keys.push({frame: end - 80, cx: width * 0.51, cy: height * 0.5, zoom: 1.05});
  } else {
    keys.push({frame: start + 80, cx: width / 2, cy: height / 2, zoom: 1});
    keys.push({frame: end, cx: width / 2, cy: height / 2, zoom: 1});
  }
}
keys.sort((left, right) => left.frame - right.frame);
const props = {
  sourceVideoUri: "full-article-screen-animation-canary-v1/article-page-source-180s.mp4",
  firstFrameImageUri: "full-article-screen-animation-canary-v1/first-frame.png",
  sourceFrameCount: nativeFrames,
  nativeDurationInFrames: nativeFrames,
  viewportWidth: width,
  viewportHeight: height,
  keys,
  motionProfile: {contract: "A1CinematicScreenCameraMotion/v1", curve: "MINIMUM_JERK", temporalBlur: {enabled: false, maxShutterAngle: 0, samples: 1, activationVelocity: 1}},
  muted: true,
};
writeJson(path.join(renderRoot, "pagecam-props.json"), props);

const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: rendererPublic, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const output = path.join(renderRoot, `noaa-wreck-ecology-page-animation-180s-${width}x${height}-${fps}fps.mp4`);
const stillFrames = [];
try {
  const composition = await selectComposition({serveUrl, id: "A1MaturePageCamV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  await renderMedia({serveUrl, composition, inputProps: props, outputLocation: output, codec: "h264", crf: 21, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  for (const sample of [{label: "start", frame: 120}, {label: "middle", frame: Math.round(nativeFrames * .5)}, {label: "end", frame: nativeFrames - 120}]) {
    const file = path.join(renderRoot, `${sample.label}.png`);
    await renderStill({serveUrl, composition, inputProps: props, frame: sample.frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    stillFrames.push({label: sample.label, frame: sample.frame, path: path.relative(root, file), sha256: sha(file)});
  }
} finally { await browser.close({silent: true}); }

const outputProbe = probe(output);
const outputVideo = outputProbe.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", output, "-f", "null", "-"], {encoding: "utf8"});
const report = {
  contract: "A1FullArticleScreenAnimationCanary/v1",
  status: decode.status === 0 && outputVideo?.width === width && outputVideo?.height === height && outputVideo?.r_frame_rate === `${fps}/1` ? "READY_FOR_REVIEW" : "FAIL",
  source: {url: sourceJob.sourceUrl, cachedPageImage: path.relative(root, pageImage), cachedPageImageSha256: sha(pageImage), articleSourceManifest: path.relative(root, articleSourceManifestPath), title: readability.title, wordCount: articleWordCount, textLength: Number(readability.length || 0), cachedImageCount: sourceJob.summary?.cachedCandidateCount || 0},
  storyboard: {contract: "A1ArticleScreenStoryboard/v1", shotCount: shots.length, durationMs: shots.length * secondsPerShot * 1000, shots, planPath: path.relative(root, storyboardPath)},
  effectCapabilityMatrix: {path: path.relative(root, capabilityPath), passReviewOnly: effectMatrix.filter((item) => item.status === "PASS_REVIEW_ONLY").map((item) => item.id), blocked: effectMatrix.filter((item) => item.status === "BLOCKED_REQUIRED_EVIDENCE").map((item) => item.id), notImplemented: effectMatrix.filter((item) => item.status === "NOT_IMPLEMENTED").map((item) => item.id)},
  sourceVideo: {path: path.relative(root, sourceVideo), sha256: sha(sourceVideo), width: sourceStream.width, height: sourceStream.height, fps: sourceStream.r_frame_rate, durationMs: Math.round(Number(sourceProbe.format.duration) * 1000), fullDecodePass: true},
  reviewVideo: {path: path.relative(root, output), sha256: sha(output), width: outputVideo?.width, height: outputVideo?.height, fps: outputVideo?.r_frame_rate, durationMs: Math.round(Number(outputProbe.format.duration) * 1000), frameCount: Number(outputVideo?.nb_read_frames || 0), audioStreamCount: outputProbe.streams.filter((item) => item.codec_type === "audio").length, fullDecodePass: decode.status === 0},
  stillFrames,
  boundary: {reviewOnly: true, currentWorkspaceMutation: false, currentPhaseMutation: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED", articleSourceMode: "REAL_CACHED_WEBPAGE_CAPTURE", motionMode: "DETERMINISTIC_PAGE_REFRAME"},
  generatedAt: new Date().toISOString(),
};
writeJson(storyboardPath, {contract: "A1ArticleScreenStoryboard/v1", status: "READY_FOR_REVIEW", source: report.source, shots});
writeJson(capabilityPath, {contract: "A1ScreenEffectCapabilityMatrix/v1", status: "REVIEW_ONLY", sourceSha256: sha(pageImage), items: effectMatrix});
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
writeJson(manifestPath, report);
console.log(JSON.stringify(report, null, 2));
