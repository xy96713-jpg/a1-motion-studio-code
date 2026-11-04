#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const waveRoot = path.join(root, "work/mature-screen-camera-system-v1/wave15");
const manifestPath = path.join(waveRoot, "render-manifest.json");
const canaryAuditPath = path.join(root, "work/mature-screen-camera-system-v1/canary/audit-report.json");
const framesRoot = path.join(waveRoot, "proof-frames");
const contactPath = path.join(waveRoot, "mature-screen-camera-wave15-contact-sheet.png");
const ffmpeg = "/Users/a1/.local/bin/ffmpeg";
const ffprobe = "ffprobe";
fs.mkdirSync(framesRoot, {recursive: true});
const failures = [];
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

if (!fs.existsSync(manifestPath)) failures.push("RENDER_MANIFEST_MISSING");
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
const canaryAudit = fs.existsSync(canaryAuditPath) ? readJson(canaryAuditPath) : null;
if (manifest?.status !== "PASS") failures.push("RENDER_MANIFEST_NOT_PASS");
if (manifest?.items?.length !== 15) failures.push("SHOT_COUNT_NOT_15");
if (manifest?.maxConcurrency !== 2) failures.push("CONCURRENCY_NOT_2");
if (canaryAudit?.status !== "PASS") failures.push("TEMPORAL_BLUR_CANARY_NOT_PASS");

const proofFrames = [];
for (const item of manifest?.items || []) {
  if (!fs.existsSync(item.outputPath) || sha256File(item.outputPath) !== item.outputSha256) failures.push(`OUTPUT_SHA:${item.shotId}`);
  const probe = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-show_entries", "stream=codec_name,width,height,r_frame_rate", "-of", "json", item.outputPath], {encoding: "utf8"});
  if (probe.status !== 0) {
    failures.push(`OUTPUT_DECODE:${item.shotId}`);
    continue;
  }
  const metadata = JSON.parse(probe.stdout);
  const video = metadata.streams.find((stream) => stream.width && stream.height);
  if (video?.codec_name !== "h264" || video?.width !== 960 || video?.height !== 540 || video?.r_frame_rate !== "60/1") failures.push(`OUTPUT_FORMAT:${item.shotId}`);
  if (item.summary?.maximumAnchorDriftPx > 1) failures.push(`ANCHOR_DRIFT:${item.shotId}`);
  if (item.summary?.resultHoldMs < 900) failures.push(`RESULT_HOLD:${item.shotId}`);
  if ((item.audits || []).some((audit) => audit.roiVisible === false)) failures.push(`ROI_NOT_VISIBLE:${item.shotId}`);
  const invalidGrammar = (item.decisions || []).some((decision) => !["ANCHOR_PUSH", "WIDE_RESET_THEN_PUSH", "ROI_EMPHASIS_ONLY"].includes(decision.grammar));
  if (invalidGrammar) failures.push(`GRAMMAR_UNKNOWN:${item.shotId}`);
  const expectsBlur = Number(item.summary?.motionSegmentCount || 0) > 0;
  if (expectsBlur && item.motionBlur?.kind !== "TEMPORAL_CAMERA_ONLY") failures.push(`MOVING_SHOT_BLUR_POLICY:${item.shotId}`);
  if (!expectsBlur && item.motionBlur?.kind !== "NONE") failures.push(`STATIC_SHOT_BLUR_POLICY:${item.shotId}`);

  const props = readJson(item.propsPath);
  const scene = props.scenes[0];
  const lastDecision = item.decisions?.at(-1);
  const proofKeyframe = lastDecision
    ? scene.cameraTrack.find((keyframe) => keyframe.beatId === lastDecision.beatId && ["ANCHOR_PUSH_SETTLED", "ROI_EMPHASIS_HOLD"].includes(keyframe.phase))
    : null;
  const proofAtMs = Math.min(scene.durationMs - 100, Math.max(100, Number(proofKeyframe?.atMs || scene.durationMs * .6) + 80));
  const framePath = path.join(framesRoot, `${item.shotId.toLowerCase()}-proof.png`);
  const extract = spawnSync(ffmpeg, ["-loglevel", "error", "-y", "-ss", (proofAtMs / 1000).toFixed(3), "-i", item.outputPath, "-frames:v", "1", framePath], {encoding: "utf8"});
  if (extract.status !== 0 || !fs.existsSync(framePath)) failures.push(`PROOF_FRAME:${item.shotId}`);
  else proofFrames.push({shotId: item.shotId, proofAtMs, framePath, metadata});
}

if (proofFrames.length === 15) {
  const cellWidth = 480;
  const cellHeight = 292;
  const composites = [];
  for (const [index, frame] of proofFrames.entries()) {
    const label = Buffer.from(`<svg width="${cellWidth}" height="${cellHeight}"><rect width="${cellWidth}" height="22" fill="rgba(10,14,16,.78)"/><text x="10" y="16" font-family="Menlo,monospace" font-size="13" font-weight="700" fill="#f5f1e8">${frame.shotId} · ${(frame.proofAtMs / 1000).toFixed(2)}s</text></svg>`);
    const cell = await sharp(frame.framePath).resize(cellWidth, 270).extend({top: 22, bottom: 0, left: 0, right: 0, background: "#0a0e10"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer();
    composites.push({input: cell, left: (index % 5) * cellWidth, top: Math.floor(index / 5) * cellHeight});
  }
  await sharp({create: {width: cellWidth * 5, height: cellHeight * 3, channels: 3, background: "#0a0e10"}}).composite(composites).png().toFile(contactPath);
}
if (!fs.existsSync(contactPath)) failures.push("CONTACT_SHEET_MISSING");

const report = {
  contract: "A1MatureScreenCameraWave15Audit/v1",
  status: failures.length ? "FAIL" : "PASS",
  renderManifest: manifestPath,
  renderManifestSha256: fs.existsSync(manifestPath) ? sha256File(manifestPath) : null,
  canaryAudit: canaryAuditPath,
  shotCount: manifest?.items?.length || 0,
  decodedCount: proofFrames.length,
  grammarCounts: (manifest?.items || []).flatMap((item) => item.decisions.map((decision) => decision.grammar)).reduce((acc, grammar) => ({...acc, [grammar]: (acc[grammar] || 0) + 1}), {}),
  motionBlur: {movingShots: (manifest?.items || []).filter((item) => item.motionBlur?.kind === "TEMPORAL_CAMERA_ONLY").length, staticShots: (manifest?.items || []).filter((item) => item.motionBlur?.kind === "NONE").length, sourceFrameLocked: canaryAudit?.renderer?.sourceFrameLocked === true, holdFramesByteIdentical: canaryAudit?.pixelRows?.filter((row) => row.kind === "hold").every((row) => row.byteIdentical) === true},
  proofFrames: proofFrames.map(({shotId, proofAtMs, framePath}) => ({shotId, proofAtMs, framePath, sha256: sha256File(framePath)})),
  contactSheet: fs.existsSync(contactPath) ? {path: contactPath, sha256: sha256File(contactPath)} : null,
  failures,
  boundary: {proofOnly: true, currentAuthorityMutated: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(waveRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, shotCount: report.shotCount, decodedCount: report.decodedCount, grammarCounts: report.grammarCounts, motionBlur: report.motionBlur, contactSheet: report.contactSheet, failures: report.failures}, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
