#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const sourceReportPath = path.join(root, "work/cross-project-screen-validation-v1/englishflow-geometry-truth-v2/capture-report.json");
const sourceVideoPath = path.join(root, "work/cross-project-screen-validation-v1/englishflow-geometry-truth-v2/clean-source.mp4");
const outDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/golden-screen-demo-v1");
const publicRelative = "proof-only/golden-screen-demo-v1/englishflow-clean-source.mp4";
const publicVideoPath = path.join(publicRoot, publicRelative);
const outputPath = path.join(outDir, "englishflow-golden-screen.mp4");
const manifestPath = path.join(outDir, "manifest.json");
const sourceSha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = (file) => JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));

const report = JSON.parse(fs.readFileSync(sourceReportPath, "utf8"));
if (report.status !== "READY_FOR_CAP_REVIEW" || !report.geometryTruth || report.geometryTruth.status !== "PASS_REVIEW_ONLY") throw new Error("golden-screen-source-not-ready");
if (sourceSha(sourceVideoPath) !== report.output.sha256) throw new Error("golden-screen-source-sha-mismatch");
const targets = Object.fromEntries(report.geometryTruth.targets.map((target) => [target.targetKey, target.sourceRect]));
const pointerTrack = report.cursorTelemetry.moves.map((point) => ({tMs: point.tMs, x: point.x, y: point.y, kind: "move"}));
const clicks = report.cursorTelemetry.clicks.filter((click) => click.down).map((click) => ({atMs: click.tMs, x: click.x, y: click.y, kind: "press", event: click.event}));
const durationMs = report.output.durationMs;
await fsp.mkdir(outDir, {recursive: true});
await fsp.mkdir(path.dirname(publicVideoPath), {recursive: true});
await fsp.copyFile(sourceVideoPath, publicVideoPath);
const props = {contract: "A1GoldenScreenDemo/v1", sourceVideoUri: publicRelative, durationMs, pointerTrack, clicks, targets};
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const stills = [];
try {
  const composition = await selectComposition({serveUrl, id: "A1GoldenScreenDemoV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputPath, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  for (const sample of [{label: "establish", ms: 800}, {label: "action", ms: 1700}, {label: "feedback", ms: 4400}, {label: "submit", ms: 5250}, {label: "result", ms: 5900}]) {
    const file = path.join(outDir, `${sample.label}.png`);
    await renderStill({serveUrl, composition, inputProps: props, frame: Math.round(sample.ms / 1000 * 60), output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    stills.push({label: sample.label, ms: sample.ms, path: path.relative(root, file), sha256: sourceSha(file)});
  }
} finally {
  await browser.close({silent: true});
}
const contactPath = path.join(outDir, "contact.png");
const thumbs = await Promise.all(stills.map((item) => sharp(path.join(root, item.path)).resize(384, 216, {fit: "cover"}).png().toBuffer()));
await sharp({create: {width: 1920, height: 216, channels: 3, background: "#0b0e10"}}).composite(thumbs.map((input, index) => ({input, left: index * 384, top: 0}))).png().toFile(contactPath);
const media = probe(outputPath);
const video = media.streams.find((item) => item.codec_type === "video") || media.streams[0];
const decode = execFileSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-i", outputPath, "-f", "null", "-"], {encoding: "utf8"});
const manifest = {
  contract: "A1GoldenScreenDemoManifest/v1",
  status: "PASS_REVIEW_ONLY",
  source: {path: path.relative(root, sourceVideoPath), sha256: sourceSha(sourceVideoPath), durationMs, geometryTruthSha256: report.geometryTruth.geometryTruthSha256},
  shotMap: [
    {id: "establish", rangeMs: [0, 1200], function: "ESTABLISH", technique: "LOCK_WIDE"},
    {id: "mission", rangeMs: [1200, 2400], function: "ACTION", technique: "SOURCE_ACTION_PLUS_DASHED_TARGET", target: "mission_handoff"},
    {id: "answer", rangeMs: [3920, 4750], function: "FEEDBACK", technique: "SOURCE_BOUND_HIGHLIGHT", target: "answer_select"},
    {id: "submit", rangeMs: [4920, 5580], function: "DECISION", technique: "CURSOR_PUNCH_PLUS_ARROW", target: "answer_submit"},
    {id: "result", rangeMs: [5450, durationMs], function: "RESULT_HOLD", technique: "SEMANTIC_PUSH_THEN_CLEAN_HOLD", target: "result_hold"},
  ],
  output: {path: path.relative(root, outputPath), sha256: sourceSha(outputPath), width: video.width, height: video.height, fps: video.r_frame_rate, durationMs: Math.round(Number(media.format.duration) * 1000), fullDecodePass: decode === ""},
  stills,
  contactSheet: {path: path.relative(root, contactPath), sha256: sourceSha(contactPath)},
  effects: {sourceBound: true, dashedTarget: true, highlight: true, arrow: true, cursorPress: true, resultHold: true, decorativeTransition: false, browserChromeIncluded: false, dockIncluded: false},
  boundary: {reviewOnly: true, productionAdmission: false, sourceInteractionMutated: false, userVisualApproval: "NOT_APPROVED"},
};
manifest.manifestSha256 = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({...manifest, manifestPath: path.relative(root, manifestPath)}, null, 2));
