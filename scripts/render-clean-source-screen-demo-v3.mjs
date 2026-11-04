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
const source = path.join(root, "work/cross-project-screen-validation-v1/englishflow-geometry-truth-v2/clean-source.mp4");
const reportPath = path.join(root, "work/cross-project-screen-validation-v1/englishflow-geometry-truth-v2/capture-report.json");
const outDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/clean-source-screen-demo-v3");
const publicRelative = "proof-only/clean-source-screen-demo-v3/englishflow-clean-source.mp4";
const publicSource = path.join(publicRoot, publicRelative);
const output = path.join(outDir, "englishflow-clean-source-demo-v3.mp4");
const manifestPath = path.join(outDir, "manifest.json");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = (file) => JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file].map((item) => item === "count_frames" ? "-count_frames" : item), {encoding: "utf8"}));
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const resultTarget = report.geometryTruth.targets.find((target) => target.targetKey === "result_hold")?.sourceRect;
if (!resultTarget || sha(source) !== report.output.sha256) throw new Error("clean-source-v3-source-invalid");
await fsp.mkdir(outDir, {recursive: true}); await fsp.mkdir(path.dirname(publicSource), {recursive: true}); await fsp.copyFile(source, publicSource);
const props = {contract: "A1CleanSourceScreenDemo/v3", sourceVideoUri: publicRelative, durationMs: report.output.durationMs, resultTarget};
const require = createRequire(path.join(rendererRoot, "package.json")); const {bundle} = require("@remotion/bundler"); const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true}); const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"}); const stills = [];
try {
  const composition = await selectComposition({serveUrl, id: "A1CleanSourceScreenDemoV3", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  await renderMedia({serveUrl, composition, inputProps: props, outputLocation: output, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  for (const sample of [{label: "establish", ms: 800}, {label: "action", ms: 1700}, {label: "result-push", ms: 5900}, {label: "clean-hold", ms: 7600}]) { const file = path.join(outDir, `${sample.label}.png`); await renderStill({serveUrl, composition, inputProps: props, frame: Math.round(sample.ms / 1000 * 60), output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"}); stills.push({label: sample.label, ms: sample.ms, path: path.relative(root, file), sha256: sha(file)}); }
} finally { await browser.close({silent: true}); }
const contact = path.join(outDir, "contact.png"); const thumbs = await Promise.all(stills.map((item) => sharp(path.join(root, item.path)).resize(480, 270, {fit: "cover"}).png().toBuffer())); await sharp({create: {width: 1920, height: 270, channels: 3, background: "#0b0e10"}}).composite(thumbs.map((input, index) => ({input, left: index * 480, top: 0}))).png().toFile(contact);
const media = probe(output); const video = media.streams.find((item) => item.codec_type === "video") || media.streams[0]; const decode = execFileSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-i", output, "-f", "null", "-"], {encoding: "utf8"});
const manifest = {contract: "A1CleanSourceScreenDemoManifest/v3", status: "PASS_REVIEW_ONLY", source: {path: path.relative(root, source), sha256: sha(source), geometryTruthSha256: report.geometryTruth.geometryTruthSha256}, policy: {syntheticCursor: "SKIP", clickFeedback: "SKIP", dashedBoxes: "SKIP", arrows: "SKIP", highlight: "SKIP", camera: "HELPFUL_ONLY_AT_RESULT", cleanHold: "REQUIRED"}, camera: {mode: "RESULT_ONLY", peakScale: 1.05, target: resultTarget}, output: {path: path.relative(root, output), sha256: sha(output), width: video.width, height: video.height, fps: video.r_frame_rate, durationMs: Math.round(Number(media.format.duration) * 1000), fullDecodePass: decode === ""}, stills, contactSheet: {path: path.relative(root, contact), sha256: sha(contact)}, boundary: {reviewOnly: true, productionAdmission: false, sourceInteractionMutated: false, userVisualApproval: "NOT_APPROVED"}};
manifest.manifestSha256 = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex"); await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`); console.log(JSON.stringify({...manifest, manifestPath: path.relative(root, manifestPath)}, null, 2));
