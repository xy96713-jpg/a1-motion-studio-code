#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = process.cwd();
const workDir = path.join(root, "work/current-screen-demo-smooth-cursor-v1");
const propsPath = path.join(workDir, "render-props.json");
const manifestPath = path.join(workDir, "manifest.json");
const reportPath = path.join(workDir, "audit/smooth-camera-cursor-audit.json");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");

const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const failures = [];
const measurements = [];

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const ease = (name, value) => {
  const progress = Math.min(1, Math.max(0, value));
  if (name === "cinematic-in" || name === "glide" || name === "restore") {
    return progress * progress * (3 - 2 * progress);
  }
  return progress;
};

const evaluate = (track, localMs) => {
  if (localMs <= track[0].atMs) return track[0];
  if (localMs >= track.at(-1).atMs) return track.at(-1);
  const index = track.findIndex((item) => item.atMs > localMs);
  const from = track[index - 1];
  const to = track[index];
  const progress = ease(from.easingToNext, (localMs - from.atMs) / (to.atMs - from.atMs));
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    scale: from.scale + (to.scale - from.scale) * progress,
  };
};

const smootherStep = (value) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

const evaluateCursor = (track, localMs) => {
  if (localMs <= track[0].atMs) return track[0];
  if (localMs >= track.at(-1).atMs) return track.at(-1);
  const index = track.findIndex((item) => item.atMs > localMs);
  const from = track[index - 1];
  const to = track[index];
  if (from.easingToNext === "hold") return from;
  const progress = smootherStep((localMs - from.atMs) / (to.atMs - from.atMs));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(0.0001, Math.hypot(dx, dy));
  const controlX = (from.x + to.x) / 2 - (dy / distance) * distance * Number(from.bend || 0);
  const controlY = (from.y + to.y) / 2 + (dx / distance) * distance * Number(from.bend || 0);
  const inverse = 1 - progress;
  return {
    x: inverse * inverse * from.x + 2 * inverse * progress * controlX + progress * progress * to.x,
    y: inverse * inverse * from.y + 2 * inverse * progress * controlY + progress * progress * to.y,
  };
};

for (const scene of props.scenes) {
  const track = scene.cameraTrack;
  assert(Array.isArray(track) && track.length >= 2, `${scene.shotId}: missing camera track`);
  if (!Array.isArray(track) || track.length < 2) continue;
  assert(track[0].atMs === 0, `${scene.shotId}: camera track must start at 0ms`);
  assert(track.at(-1).atMs === scene.durationMs, `${scene.shotId}: camera track must end at scene duration`);
  assert(track[0].scale <= 1.05, `${scene.shotId}: opening must establish a wide view`);
  assert(track.at(-1).scale <= 1.05, `${scene.shotId}: ending must restore a wide view`);

  for (let index = 1; index < track.length; index += 1) {
    assert(track[index].atMs > track[index - 1].atMs, `${scene.shotId}: camera keyframes are not strictly ordered`);
    const moving = track[index].x !== track[index - 1].x || track[index].y !== track[index - 1].y || track[index].scale !== track[index - 1].scale;
    if (moving) assert(track[index].atMs - track[index - 1].atMs >= 330, `${scene.shotId}: camera move shorter than 330ms`);
  }

  const frameMs = 1000 / props.fps;
  let previous = evaluate(track, 0);
  let maxScaleStep = 0;
  let maxCenterStep = 0;
  let maxScale = previous.scale;
  let maxScaleStepAtMs = 0;
  let maxCenterStepAtMs = 0;
  for (let localMs = frameMs; localMs <= scene.durationMs; localMs += frameMs) {
    const current = evaluate(track, localMs);
    const scaleStep = Math.abs(current.scale - previous.scale);
    const centerStep = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (scaleStep > maxScaleStep) {
      maxScaleStep = scaleStep;
      maxScaleStepAtMs = Math.round(localMs);
    }
    if (centerStep > maxCenterStep) {
      maxCenterStep = centerStep;
      maxCenterStepAtMs = Math.round(localMs);
    }
    maxScale = Math.max(maxScale, current.scale);
    previous = current;
  }
  assert(maxScale <= 1.35, `${scene.shotId}: zoom exceeds 1.35x`);
  assert(maxScaleStep <= 0.03, `${scene.shotId}: per-frame zoom step is too abrupt (${maxScaleStep})`);
  assert(maxCenterStep <= 0.025, `${scene.shotId}: per-frame pan step is too abrupt (${maxCenterStep})`);
  const videoSegments = (scene.sourceSegments || []).filter((segment) => segment.kind === "video");
  const videoPlaybackRates = videoSegments.length > 0
    ? videoSegments.map((segment) => (segment.sourceEndMs - segment.sourceStartMs) / (segment.outputEndMs - segment.outputStartMs))
    : [(scene.sourceEndMs - scene.sourceStartMs) / scene.durationMs];
  const minimumVideoPlaybackRate = Math.min(...videoPlaybackRates);
  assert(minimumVideoPlaybackRate >= 0.75, `${scene.shotId}: source interaction is slowed below 0.75x (${minimumVideoPlaybackRate})`);
  const cursorTrack = scene.cursorTrack;
  assert(Array.isArray(cursorTrack) && cursorTrack.length >= 2, `${scene.shotId}: independent cursor track is missing`);
  let maxCursorStep = 0;
  let maxCursorAcceleration = 0;
  let maxCursorStepAtMs = 0;
  if (Array.isArray(cursorTrack) && cursorTrack.length >= 2) {
    assert(cursorTrack[0].atMs === 0, `${scene.shotId}: cursor track must start at 0ms`);
    assert(cursorTrack.at(-1).atMs === scene.durationMs, `${scene.shotId}: cursor track must end at scene duration`);
    assert(scene.cursorBinding?.mode === "DOM_REGION_RECONSTRUCTED" || scene.cursorBinding?.mode === "CAPTURED_POINTER_EVENT", `${scene.shotId}: cursor provenance mode is missing`);
    assert(Boolean(scene.cursorBinding?.sourceSha256), `${scene.shotId}: cursor source SHA is missing`);
    let previousCursor = evaluateCursor(cursorTrack, 0);
    let previousStep = 0;
    for (let localMs = frameMs; localMs <= scene.durationMs; localMs += frameMs) {
      const currentCursor = evaluateCursor(cursorTrack, localMs);
      const step = Math.hypot(currentCursor.x - previousCursor.x, currentCursor.y - previousCursor.y);
      const acceleration = Math.abs(step - previousStep);
      if (step > maxCursorStep) {
        maxCursorStep = step;
        maxCursorStepAtMs = Math.round(localMs);
      }
      maxCursorAcceleration = Math.max(maxCursorAcceleration, acceleration);
      previousCursor = currentCursor;
      previousStep = step;
    }
    assert(maxCursorStep <= 0.035, `${scene.shotId}: cursor moves too far in one frame (${maxCursorStep})`);
    assert(maxCursorAcceleration <= 0.018, `${scene.shotId}: cursor acceleration is too abrupt (${maxCursorAcceleration})`);
    for (const click of scene.cursorClicks || []) {
      const cursorAtClick = evaluateCursor(cursorTrack, click.atMs);
      assert(Math.hypot(cursorAtClick.x - click.x, cursorAtClick.y - click.y) <= 0.04, `${scene.shotId}: click pulse is detached from cursor path`);
    }
  }
  measurements.push({shotId: scene.shotId, maxScale, maxScaleStep, maxScaleStepAtMs, maxCenterStep, maxCenterStepAtMs, minimumVideoPlaybackRate, maxCursorStep, maxCursorStepAtMs, maxCursorAcceleration});

  if (scene.sourceSegments?.length) {
    const segments = [...scene.sourceSegments].sort((a, b) => a.outputStartMs - b.outputStartMs);
    assert(segments[0].outputStartMs === 0, `${scene.shotId}: source segments do not start at 0ms`);
    assert(segments.at(-1).outputEndMs === scene.durationMs, `${scene.shotId}: source segments do not cover the scene end`);
    for (let index = 1; index < segments.length; index += 1) {
      assert(segments[index - 1].outputEndMs === segments[index].outputStartMs, `${scene.shotId}: source segment gap or overlap`);
    }
  }
}

const outputPath = path.join(root, manifest.output.path);
assert(fs.existsSync(outputPath), "rendered MP4 is missing");
if (fs.existsSync(outputPath)) assert(sha256(outputPath) === manifest.output.sha256, "rendered MP4 SHA does not match manifest");
assert(manifest.boundary?.proofOnly === true, "proof-only boundary is missing");
assert(manifest.boundary?.productionAdmission === false, "production admission must remain false");
assert(manifest.boundary?.userVisualApproval === "NOT_APPROVED", "user approval must remain NOT_APPROVED");
assert(manifest.cursorSystem?.cursorLayerIndependent === true, "independent cursor contract is missing");
assert(manifest.cursorSystem?.capturedEventClaimsAllowedOnlyWhenModeIsCaptured === true, "cursor provenance claim guard is missing");

const blackDetectResult = spawnSync(ffmpegPath, [
  "-hide_banner", "-i", outputPath, "-vf", "blackdetect=d=0.03:pix_th=0.08", "-an", "-f", "null", "-",
], {encoding: "utf8"});
const blackDetect = `${blackDetectResult.stdout || ""}\n${blackDetectResult.stderr || ""}`;
assert(blackDetectResult.status === 0, "black-frame inspection command failed");
assert(!blackDetect.includes("black_start:"), "render contains a detected black interruption");

const report = {
  contract: "A1SmoothScreenDemoCameraCursorAudit/v1",
  status: failures.length === 0 ? "PASS" : "FAIL",
  model: "WAYPOINT_DEAD_ZONE_CINEMATIC_V1",
  measurements,
  checks: {
    exactSubtitleWindowDuration: true,
    wideEstablishAndRestore: true,
    minimumMoveDurationMs: 330,
    maximumZoom: 1.35,
    maximumPerFrameZoomStep: 0.03,
    maximumPerFrameCenterStep: 0.025,
    maximumPerFrameCursorStep: 0.035,
    maximumPerFrameCursorAcceleration: 0.018,
    minimumSourceInteractionPlaybackRate: 0.75,
    blackInterruptions: !blackDetect.includes("black_start:"),
    sourceSegmentCoverage: true,
    proofOnlyBoundary: true,
  },
  evidence: {
    videoPath: path.relative(root, outputPath),
    videoSha256: fs.existsSync(outputPath) ? sha256(outputPath) : null,
    motionStripPath: "work/current-screen-demo-smooth-cursor-v1/audit/camera-cursor-motion-strip.png",
    manifestPath: path.relative(root, manifestPath),
    technicalResearchPath: "work/current-screen-demo-smooth-camera-v1/technical-research.md",
    technicalResearchSha256: sha256(path.join(root, "work/current-screen-demo-smooth-camera-v1/technical-research.md")),
  },
  failures,
};

fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
