#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work/remotion-screen-coverage-proof-v1");
const plan = JSON.parse(fs.readFileSync(path.join(outputRoot, "plan.json"), "utf8"));
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const require = createRequire(path.join(root, "apps/studio-next/package.json"));
const sharp = require("sharp");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const pixelDelta = async (left, right) => {
  const [a, b] = await Promise.all([left, right].map((file) => sharp(file).resize(320, 180).removeAlpha().grayscale().raw().toBuffer()));
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length / 255).toFixed(6));
};
const luma = async (file) => {
  const stats = await sharp(file).stats();
  return Number((stats.channels.slice(0, 3).reduce((sum, item) => sum + item.mean, 0) / 765).toFixed(6));
};
const extract = (video, seconds, file) => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.max(0, seconds)), "-i", video, "-frames:v", "1", file]);

const failures = [];
const items = [];
const tiles = [];
for (const item of plan.items) {
  const video = path.join(root, item.expectedRenderPath);
  const shotFailures = [];
  if (!fs.existsSync(video)) {
    failures.push(`${item.shotId}:RENDER_MISSING`);
    continue;
  }
  const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames:format=duration,size", "-of", "json", video], {encoding: "utf8"}));
  const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
  const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format.duration);
  const props = JSON.parse(fs.readFileSync(path.join(root, item.propsPath), "utf8"));
  const expectedDurationMs = Number(props.scenes?.[0]?.durationMs);
  if (videoStream?.width !== 960 || videoStream?.height !== 540 || videoStream?.r_frame_rate !== "60/1") shotFailures.push("VIDEO_CONTRACT");
  if (!audioStream) shotFailures.push("AUDIO_MISSING");
  if (!Number.isFinite(expectedDurationMs) || Math.abs(duration * 1000 - expectedDurationMs) > 100) shotFailures.push("DURATION_DRIFT");
  const mediumSeconds = Math.min(duration - .2, (item.poses[1].atMs + 200) / 1000);
  const resultSeconds = Math.min(duration - .2, (item.poses[2].atMs + 200) / 1000);
  const finalSeconds = Math.max(resultSeconds, duration - .12);
  const mediumFile = path.join(outputRoot, `${item.shotId.toLowerCase()}-medium.jpg`);
  const resultFile = path.join(outputRoot, `${item.shotId.toLowerCase()}-result.jpg`);
  const finalFile = path.join(outputRoot, `${item.shotId.toLowerCase()}-final.jpg`);
  extract(video, mediumSeconds, mediumFile);
  extract(video, resultSeconds, resultFile);
  extract(video, finalSeconds, finalFile);
  const [mediumLuma, resultLuma, finalLuma, cutDelta, finalHoldDelta] = await Promise.all([
    luma(mediumFile), luma(resultFile), luma(finalFile), pixelDelta(mediumFile, resultFile), pixelDelta(resultFile, finalFile),
  ]);
  if ([mediumLuma, resultLuma, finalLuma].some((value) => value < .08)) shotFailures.push("BLACK_OR_NEAR_BLACK_FRAME");
  if (cutDelta < .015) shotFailures.push("RESULT_COVERAGE_CUT_NOT_VISIBLE");
  if (finalHoldDelta > .06) shotFailures.push("RESULT_HOLD_UNSTABLE");
  if (item.poses.some((pose) => pose.transition !== "HARD_CUT" || pose.continuousPanAllowed !== false || pose.motionBlurAllowed !== false)) shotFailures.push("COVERAGE_POLICY_DRIFT");
  failures.push(...shotFailures.map((failure) => `${item.shotId}:${failure}`));
  const label = (text) => Buffer.from(`<svg width="480" height="36"><rect width="100%" height="100%" fill="#0c0f13"/><text x="12" y="24" fill="#dfff68" font-family="monospace" font-size="13">${text}</text></svg>`);
  for (const [role, file] of [["MEDIUM", mediumFile], ["RESULT", resultFile]]) {
    const image = await sharp(file).resize(480, 270).jpeg({quality: 90}).toBuffer();
    tiles.push(await sharp({create: {width: 480, height: 306, channels: 3, background: "#0c0f13"}}).composite([{input: image, top: 0, left: 0}, {input: label(`${item.shotId} · ${item.directorFamily} · ${role}`), top: 270, left: 0}]).jpeg({quality: 90}).toBuffer());
  }
  items.push({
    shotId: item.shotId,
    status: shotFailures.length ? "FAIL" : "PASS",
    directorFamily: item.directorFamily,
    coverageSha256: item.coverageSha256,
    render: {path: item.expectedRenderPath, sha256: sha256(video), width: videoStream?.width, height: videoStream?.height, fps: videoStream?.r_frame_rate, frameCount: Number(videoStream?.nb_read_frames), durationMs: Math.round(duration * 1000), expectedDurationMs, audioCodec: audioStream?.codec_name || null},
    pixels: {mediumLuma, resultLuma, finalLuma, cutDelta, finalHoldDelta, mediumFrameSha256: sha256(mediumFile), resultFrameSha256: sha256(resultFile), finalFrameSha256: sha256(finalFile)},
    failures: shotFailures,
  });
}

const contactSheet = path.join(outputRoot, "cross-family-coverage-contact-sheet.jpg");
await sharp({create: {width: 960, height: items.length * 306, channels: 3, background: "#0c0f13"}}).composite(tiles.map((input, index) => ({input, left: (index % 2) * 480, top: Math.floor(index / 2) * 306}))).jpeg({quality: 92}).toFile(contactSheet);
const body = {
  contract: "A1RemotionScreenCoverageProofAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  sourcePlanSha256: plan.planSha256,
  fixtureCount: items.length,
  familyCount: new Set(items.map((item) => item.directorFamily)).size,
  requirements: {width: 960, height: 540, fps: 60, hardCutsOnly: true, continuousPanForbidden: true, motionBlurForbidden: true, minimumVisibleCutDelta: .015, maximumFinalHoldDelta: .06},
  items,
  contactSheet: {path: path.relative(root, contactSheet), sha256: sha256(contactSheet)},
  boundary: {diagnosticOnly: true, productionAdmission: false, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"},
  failures,
};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(outputRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
