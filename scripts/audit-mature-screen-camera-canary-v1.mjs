#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const canaryRoot = path.join(root, "work/mature-screen-camera-system-v1/canary");
const blurRoot = path.join(root, "work/mature-screen-camera-system-v1/blur-audit");
const canaryPath = path.join(canaryRoot, "report.json");
const rendererPath = path.join(root, "remotion-renderer/src/ContinuousScreenEvidenceReelV2.tsx");
const packagePath = path.join(root, "remotion-renderer/package.json");
const failures = [];
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

if (!fs.existsSync(canaryPath)) failures.push("CANARY_REPORT_MISSING");
const canary = fs.existsSync(canaryPath) ? readJson(canaryPath) : null;
if (canary?.status !== "PASS") failures.push("CANARY_REPORT_NOT_PASS");
if (canary?.items?.length !== 3) failures.push("CANARY_SHOT_COUNT");
for (const item of canary?.items || []) {
  if (!fs.existsSync(item.outputPath) || sha256File(item.outputPath) !== item.outputSha256) failures.push(`CANARY_OUTPUT_SHA:${item.shotId}`);
  if (item.summary?.maximumAnchorDriftPx > 1) failures.push(`ANCHOR_DRIFT:${item.shotId}`);
  if (item.summary?.resultHoldMs < 900) failures.push(`RESULT_HOLD:${item.shotId}`);
  if ((item.audits || []).some((audit) => audit.roiVisible === false)) failures.push(`ROI_NOT_VISIBLE:${item.shotId}`);
}

const renderer = fs.readFileSync(rendererPath, "utf8");
if (!renderer.includes("TEMPORAL_CAMERA_ONLY")) failures.push("TEMPORAL_POLICY_RENDERER_MISSING");
if (!renderer.includes("<Freeze frame={sourceFrame}>") || !renderer.includes("data-a1-source-frame-lock")) failures.push("SOURCE_FRAME_LOCK_MISSING");
if (!renderer.includes("temporalMotionBlurActive") || !renderer.includes("cameraVelocity > 0.00035")) failures.push("MOVEMENT_ONLY_BLUR_GATE_MISSING");
const pkg = readJson(packagePath);
if (pkg.dependencies?.["@remotion/motion-blur"] !== pkg.dependencies?.remotion) failures.push("MOTION_BLUR_VERSION_MISMATCH");

const frameIds = ["action-move", "action-hold", "result-move", "result-hold", "return-move", "return-hold"];
const pixelRows = [];
const rawImage = async (file) => {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  return {data, info};
};
const sharpness = ({data, info}) => {
  const {width, height, channels} = info;
  let total = 0;
  let totalSquared = 0;
  let count = 0;
  const gray = (offset) => data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * channels;
      const laplacian = gray(offset - width * channels) + gray(offset + width * channels) + gray(offset - channels) + gray(offset + channels) - 4 * gray(offset);
      total += laplacian;
      totalSquared += laplacian * laplacian;
      count += 1;
    }
  }
  const mean = total / count;
  return totalSquared / count - mean * mean;
};
for (const id of frameIds) {
  const nonePath = path.join(blurRoot, `${id}-none.png`);
  const temporalPath = path.join(blurRoot, `${id}-temporal.png`);
  if (!fs.existsSync(nonePath) || !fs.existsSync(temporalPath)) {
    failures.push(`BLUR_AUDIT_FRAME_MISSING:${id}`);
    continue;
  }
  const none = await rawImage(nonePath);
  const temporal = await rawImage(temporalPath);
  if (none.data.length !== temporal.data.length) {
    failures.push(`BLUR_AUDIT_DIMENSION:${id}`);
    continue;
  }
  let absolute = 0;
  let changed = 0;
  for (let index = 0; index < none.data.length; index += 1) {
    const delta = Math.abs(none.data[index] - temporal.data[index]);
    absolute += delta;
    if (delta > 2) changed += 1;
  }
  const kind = id.endsWith("move") ? "move" : "hold";
  const row = {id, kind, meanAbsPixelDiff: absolute / none.data.length, changedChannelFraction: changed / none.data.length, noneSharpness: sharpness(none), temporalSharpness: sharpness(temporal), byteIdentical: none.data.equals(temporal.data)};
  pixelRows.push(row);
  if (kind === "move" && (row.meanAbsPixelDiff < 5 || row.temporalSharpness >= row.noneSharpness * .95)) failures.push(`TEMPORAL_BLUR_NOT_VISIBLE:${id}`);
  if (kind === "hold" && !row.byteIdentical) failures.push(`HOLD_FRAME_CHANGED:${id}`);
}

const report = {
  contract: "A1MatureScreenCameraCanaryAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  canaryReport: canaryPath,
  canaryReportSha256: fs.existsSync(canaryPath) ? sha256File(canaryPath) : null,
  renderer: {motionBlurPackageVersion: pkg.dependencies?.["@remotion/motion-blur"], remotionVersion: pkg.dependencies?.remotion, sourceFrameLocked: renderer.includes("<Freeze frame={sourceFrame}>"), movementOnlyGate: renderer.includes("cameraVelocity > 0.00035")},
  pixelRows,
  failures,
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(canaryRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
