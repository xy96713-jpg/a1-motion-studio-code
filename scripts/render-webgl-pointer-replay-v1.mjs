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
const sourceDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-cap-native-pointer-v3");
const outDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-pointer-replay-v1");
const sourceVideo = path.join(sourceDir, "webgl-native-pointer.mp4");
const sourceReport = path.join(sourceDir, "report.json");
const sourceIdentity = path.join(sourceDir, "page-identity.png");
const sourceContact = path.join(sourceDir, "frames/contact.png");
const publicRelative = "proof-only/webgl-pointer-replay-v1/webgl-native-pointer.mp4";
const publicVideo = path.join(publicRoot, publicRelative);
const output = path.join(outDir, "webgl-pointer-replay.mp4");
const manifestPath = path.join(outDir, "manifest.json");
const telemetryPath = path.join(outDir, "replay-telemetry.json");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = (file) => JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file], {encoding: "utf8"}));

const track = [
  {tMs: 0, x: 0.82, y: 0.80},
  {tMs: 650, x: 0.80, y: 0.79},
  {tMs: 1450, x: 0.70, y: 0.70},
  {tMs: 2100, x: 0.56, y: 0.61},
  {tMs: 2450, x: 0.48, y: 0.58},
  {tMs: 3100, x: 0.48, y: 0.58},
  {tMs: 3950, x: 0.58, y: 0.53},
  {tMs: 4650, x: 0.70, y: 0.45},
  {tMs: 5200, x: 0.77, y: 0.39},
  {tMs: 6100, x: 0.77, y: 0.39},
  {tMs: 7600, x: 0.58, y: 0.50},
  {tMs: 8800, x: 0.48, y: 0.58},
];
const clicks = [
  {atMs: 2450, x: 0.48, y: 0.58, kind: "press"},
  {atMs: 5200, x: 0.77, y: 0.39, kind: "press"},
];

async function main() {
  if (!fs.existsSync(sourceVideo) || !fs.existsSync(sourceReport)) throw new Error("webgl-replay-source-missing");
  const report = JSON.parse(fs.readFileSync(sourceReport, "utf8"));
  const sourceSha = sha256(sourceVideo);
  if (report.source?.sha256 !== sourceSha) throw new Error("webgl-replay-source-sha-mismatch");
  const media = probe(sourceVideo);
  const video = media.streams.find((item) => item.codec_type === "video") || media.streams[0];
  const durationMs = Math.round(Number(media.format.duration) * 1000);
  await fsp.mkdir(outDir, {recursive: true});
  await fsp.mkdir(path.dirname(publicVideo), {recursive: true});
  await fsp.copyFile(sourceVideo, publicVideo);
  const telemetry = {contract: "A1ReviewOnlyPointerReplay/v1", provenance: "REPLAY_FROM_CAPTURE_ACTION_PLAN", sourceVideoSha256: sourceSha, sourceFrame: "FULL_CAPTURE_WINDOW_NORMALIZED", track, clicks};
  telemetry.sha256 = crypto.createHash("sha256").update(JSON.stringify(telemetry)).digest("hex");
  await fsp.writeFile(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
  const props = {contract: "A1NativePointerReplay/v1", sourceVideoUri: publicRelative, durationMs, sourceWidth: Number(video.width), sourceHeight: Number(video.height), pointerTrack: track, clicks, clickRippleDurationMs: 360};
  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const stills = [];
  try {
    const composition = await selectComposition({serveUrl, id: "A1NativePointerReplayV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: output, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    for (const sample of [{label: "entry", ms: 1450}, {label: "first-click", ms: 2450}, {label: "retarget", ms: 5200}]) {
      const file = path.join(outDir, `${sample.label}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame: Math.round(sample.ms / 1000 * 60), output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      stills.push({label: sample.label, ms: sample.ms, path: path.relative(root, file), sha256: sha256(file)});
    }
  } finally {
    await browser.close({silent: true});
  }
  const contactPath = path.join(outDir, "contact.png");
  const thumbs = await Promise.all(stills.map((item) => sharp(path.join(root, item.path)).resize(640, 360, {fit: "cover"}).png().toBuffer()));
  await sharp({create: {width: 1920, height: 360, channels: 3, background: "#0c0f10"}}).composite(thumbs.map((input, index) => ({input, left: index * 640, top: 0}))).png().toFile(contactPath);
  const manifest = {
    contract: "A1ReviewOnlyWebGLPointerReplayManifest/v1",
    status: "PASS_REVIEW_ONLY",
    source: {path: path.relative(root, sourceVideo), sha256: sourceSha, width: video.width, height: video.height, durationMs, identityProof: path.relative(root, sourceIdentity), visualProof: path.relative(root, sourceContact)},
    replay: {path: path.relative(root, output), sha256: sha256(output), pointerProvenance: "REPLAY_FROM_CAPTURE_ACTION_PLAN", telemetryPath: path.relative(root, telemetryPath), telemetrySha256: telemetry.sha256, clickCount: clicks.length, waypointCount: track.length},
    stills,
    contactSheet: {path: path.relative(root, contactPath), sha256: sha256(contactPath)},
    boundary: {proofOnly: true, sourceMutation: false, productionAdmission: false, formalBehaviorManifest: false, userVisualApproval: "NOT_APPROVED", nativeCursorProvenance: "NOT_CLAIMED"},
  };
  manifest.manifestSha256 = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({...manifest, manifestPath: path.relative(root, manifestPath)}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
