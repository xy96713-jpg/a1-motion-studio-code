#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const canaryRoot = path.join(root, "work/full-article-screen-animation-canary-v1");
const sourceImage = path.join(canaryRoot, "source-capture/element-screenshot.png");
const outputRoot = path.join(canaryRoot, "effect-gallery");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublic = path.join(outputRoot, "remotion-public");
const outputVideo = path.join(outputRoot, "noaa-article-effect-gallery-40s-1280x720-60fps.mp4");
const reportPath = path.join(outputRoot, "effect-gallery-report.json");
const matrixPath = path.join(outputRoot, "effect-gallery-capability-matrix.json");
const contactSheetPath = path.join(outputRoot, "effect-gallery-contact-sheet.png");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => require("node:child_process").execFileSync(command, args, {cwd: root, stdio: ["ignore", "pipe", "pipe"]});
const probe = (file) => JSON.parse(run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file]).toString());
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

if (!fs.existsSync(sourceImage)) throw new Error("article-source-image-required");
fs.mkdirSync(outputRoot, {recursive: true});
fs.mkdirSync(rendererPublic, {recursive: true});
fs.mkdirSync(path.dirname(path.join(rendererPublic, "full-article-screen-animation-canary-v1/article-page.png")), {recursive: true});
fs.copyFileSync(sourceImage, path.join(rendererPublic, "full-article-screen-animation-canary-v1/article-page.png"));
for (const relative of ["a1-editorial-fonts", "generated/system-line/editorial-asset-workbench-v1/font-cache"]) {
  const source = path.join(rendererRoot, "public", relative);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(rendererPublic, relative), {recursive: true, force: true});
}

const sceneFrames = 300;
const scenes = [
  {id: "E01", effect: "SCROLL_BRAKE", intent: "滚动到标题后停稳", top: 40, focusX: 720, zoom: 1.02},
  {id: "E02", effect: "FOLLOW_PAN", intent: "从左侧珊瑚跟到右侧沉船", top: 900, focusX: 390, zoom: 1.03},
  {id: "E03", effect: "LINE_READING_TRACK", intent: "沿真实段落逐行阅读", top: 620, focusX: 720, zoom: 1.05, lineY: [808, 850, 892]},
  {id: "E04", effect: "SEMANTIC_PUSH", intent: "语义推近：珊瑚生态证据", top: 900, focusX: 390, zoom: 1.18},
  {id: "E05", effect: "DETAIL_LENS", intent: "局部细节放大但保留上下文", top: 900, focusX: 400, zoom: 1.04},
  {id: "E06", effect: "FOCUS_DIM", intent: "聚焦真实方法段落", top: 1510, focusX: 720, zoom: 1.02, target: {x: 150, y: 1640, width: 1140, height: 320}},
  {id: "E07", effect: "HARD_CUT_STATE_REPLACE", intent: "图像状态硬切到方法状态", top: 900, focusX: 720, zoom: 1.04},
  {id: "E08", effect: "RESULT_HOLD", intent: "结尾结果停留", top: 1730, focusX: 720, zoom: 1.03},
];

const props = {contract: "A1ArticleScreenEffectGallery/v1", pageImageUri: "full-article-screen-animation-canary-v1/article-page.png", pageWidth: 1440, pageHeight: 2442, width: 1280, height: 720, fps: 60, sceneFrames, scenes, reviewLabels: true};
const capabilityMatrix = {
  contract: "A1ArticleEffectGalleryCapabilityMatrix/v1",
  status: "REVIEW_ONLY",
  sourceMode: "REAL_CACHED_WEBPAGE_CAPTURE",
  items: [
    ["LOCK_WIDE", "PASS_REVIEW_ONLY", "真实网页首帧建立。"],
    ["SCROLL_BRAKE", "PASS_REVIEW_ONLY", "页面纵向移动后明确停稳。"],
    ["FOLLOW_PAN", "PASS_REVIEW_ONLY", "从左侧珊瑚图跟随到右侧沉船图。"],
    ["LINE_READING_TRACK", "PASS_REVIEW_ONLY", "沿真实段落行框移动阅读轨迹。"],
    ["SEMANTIC_PUSH", "PASS_REVIEW_ONLY", "语义目标推近，安全区自动夹限。"],
    ["DETAIL_LENS", "PASS_REVIEW_ONLY", "真实页面局部细节镜头，同时保留上下文。"],
    ["FOCUS_DIM", "PASS_REVIEW_ONLY", "真实方法段落聚焦，其余页面压暗。"],
    ["EVIDENCE_UNDERLINE", "PASS_REVIEW_ONLY", "真实文章段落行框上的 review-only 标注。"],
    ["HARD_CUT_STATE_REPLACE", "PASS_REVIEW_ONLY", "图像状态到方法状态的明确硬切。"],
    ["RESULT_HOLD", "PASS_REVIEW_ONLY", "结尾状态保持足够阅读时间。"],
    ["BEFORE_AFTER_SPLIT", "BLOCKED_REQUIRED_EVIDENCE", "文章没有真实前后状态，禁止伪造。"],
    ["WIPE_COMPARE", "BLOCKED_REQUIRED_EVIDENCE", "文章没有第二个可验证状态，禁止伪造。"],
  ].map(([id, status, reason]) => ({id, status, reason, scope: "EFFECT_GALLERY_REVIEW_ONLY"})),
};
writeJson(matrixPath, capabilityMatrix);
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: rendererPublic, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const stills = [];
try {
  const composition = await selectComposition({serveUrl, id: "A1ArticleScreenEffectGalleryV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputVideo, codec: "h264", crf: 19, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  for (let index = 0; index < scenes.length; index += 1) {
    const still = path.join(outputRoot, `${scenes[index].id}.png`);
    await renderStill({serveUrl, composition, inputProps: props, frame: index * sceneFrames + Math.round(sceneFrames * .58), output: still, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    stills.push({id: scenes[index].id, effect: scenes[index].effect, path: path.relative(root, still), sha256: sha(still)});
  }
} finally {
  await browser.close({silent: true});
}

const thumbWidth = 640;
const thumbHeight = 360;
const contact = await sharp({create: {width: thumbWidth * 4, height: thumbHeight * 2, channels: 3, background: "#071013"}}).composite(await Promise.all(stills.map(async (still, index) => ({input: await sharp(path.join(root, still.path)).resize(thumbWidth, thumbHeight).png().toBuffer(), left: (index % 4) * thumbWidth, top: Math.floor(index / 4) * thumbHeight})))).png().toFile(contactSheetPath);
const probeResult = probe(outputVideo);
const stream = probeResult.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(path.join(root, ".tools/bin/ffmpeg"), ["-hide_banner", "-loglevel", "error", "-i", outputVideo, "-f", "null", "-"], {encoding: "utf8"});
const report = {contract: "A1ArticleScreenEffectGalleryReport/v1", status: stream?.width === 1280 && stream?.height === 720 && stream?.r_frame_rate === "60/1" && Math.round(Number(probeResult.format.duration) * 1000) === 40000 && decode.status === 0 ? "READY_FOR_REVIEW" : "FAIL", source: {pageImage: "work/full-article-screen-animation-canary-v1/source-capture/element-screenshot.png", pageImageSha256: sha(sourceImage), mode: "REAL_CACHED_WEBPAGE_CAPTURE"}, scenes, capabilityMatrix: {path: path.relative(root, matrixPath), sha256: sha(matrixPath), passReviewOnly: capabilityMatrix.items.filter((item) => item.status === "PASS_REVIEW_ONLY").map((item) => item.id), blockedRequiredEvidence: capabilityMatrix.items.filter((item) => item.status === "BLOCKED_REQUIRED_EVIDENCE").map((item) => item.id)}, output: {path: path.relative(root, outputVideo), sha256: sha(outputVideo), width: stream?.width || null, height: stream?.height || null, fps: stream?.r_frame_rate || null, durationMs: Math.round(Number(probeResult.format.duration) * 1000), frameCount: Number(stream?.nb_read_frames || 0), audioStreamCount: probeResult.streams.filter((item) => item.codec_type === "audio").length, fullDecodePass: decode.status === 0}, evidence: {contactSheet: path.relative(root, contactSheetPath), stills}, boundary: {reviewOnly: true, currentWorkspaceMutation: false, currentPhaseMutation: false, productionAdmission: false}, generatedAt: new Date().toISOString()};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));
