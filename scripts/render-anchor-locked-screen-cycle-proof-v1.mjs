#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {
  deriveAnchorLockedPose,
  projectSourcePoint,
  sampleAnchorLockedSegment,
} from "../apps/studio-next/src/lib/a1-anchor-locked-screen-camera-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const sourceRoot = path.join(root, "work/event-settle-screen-wave15-v1");
const v4Root = path.join(root, "work/cinematic-screen-cycle-proof-v1");
const outputRoot = path.join(root, "work/anchor-locked-screen-cycle-proof-v1");
const selected = ["ED-03", "ED-05", "ED-29"];
const ffmpeg = process.env.FFMPEG_PATH || "/Users/a1/.local/bin/ffmpeg";
const FAR_ANCHOR_DISTANCE = 0.26;
const PRE_RETURN_DURATION_MS = 520;
const PRE_RETURN_GAP_MS = 80;
const FINAL_RETURN_DURATION_MS = 560;
const FINAL_WIDE_HOLD_MS = 520;
const MINIMUM_READABLE_HOLD_MS = 900;

fs.mkdirSync(outputRoot, {recursive: true});
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args, cwd = root) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {cwd, stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 16000) stderr = stderr.slice(-16000);
  });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)}:${code}:${stderr.slice(-5000)}`)));
});

const poseOf = (keyframe) => ({x: keyframe.x, y: keyframe.y, scale: keyframe.scale});
const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
const lockKeyframe = ({atMs, fromPose, sourceAnchor, targetScale, phase, beatId}) => {
  const lock = deriveAnchorLockedPose({fromPose, sourceAnchor, targetScale});
  return {
    start: {atMs, ...fromPose, easingToNext: "cinematic-in-out", anchorLockToNext: lock.anchorLockToNext, phase, beatId},
    targetPose: lock.pose,
  };
};

function buildAnchorLockedTrack(sourceTrack, durationMs, shotId) {
  const moves = [];
  for (let index = 0; index < sourceTrack.length - 1; index += 1) {
    if (sourceTrack[index].easingToNext !== "hold") moves.push({start: sourceTrack[index], end: sourceTrack[index + 1]});
  }
  const track = [{...sourceTrack[0], anchorLockToNext: undefined}];
  const audits = [];
  let currentPose = poseOf(track[0]);
  let currentAnchor = null;
  let lastSettledAtMs = 0;

  for (const move of moves) {
    const nextAnchor = {x: move.end.x, y: move.end.y};
    const farReframe = currentAnchor && distance(currentAnchor, nextAnchor) > FAR_ANCHOR_DISTANCE;
    if (farReframe) {
      const restoreEndMs = move.start.atMs - PRE_RETURN_GAP_MS;
      const restoreStartMs = restoreEndMs - PRE_RETURN_DURATION_MS;
      if (restoreStartMs - lastSettledAtMs >= 500) {
        const restore = lockKeyframe({atMs: restoreStartMs, fromPose: currentPose, sourceAnchor: currentAnchor, targetScale: 1.03, phase: "ANCHOR_RETURN_START", beatId: `${move.start.beatId}-prewide`});
        track.push(restore.start);
        currentPose = restore.targetPose;
        track.push({atMs: restoreEndMs, ...currentPose, easingToNext: "hold", phase: "ANCHOR_RETURN_SETTLED", beatId: `${move.start.beatId}-prewide`});
      }
    }
    if (track.at(-1).atMs < move.start.atMs) {
      track.push({atMs: move.start.atMs, ...currentPose, easingToNext: "hold", phase: "ANCHOR_HOLD", beatId: move.start.beatId});
    }
    const zoom = lockKeyframe({atMs: move.start.atMs, fromPose: currentPose, sourceAnchor: nextAnchor, targetScale: move.end.scale, phase: "ANCHOR_ZOOM_START", beatId: move.start.beatId});
    track.at(-1).easingToNext = zoom.start.easingToNext;
    track.at(-1).anchorLockToNext = zoom.start.anchorLockToNext;
    track.at(-1).phase = zoom.start.phase;
    currentPose = zoom.targetPose;
    track.push({atMs: move.end.atMs, ...currentPose, easingToNext: "hold", phase: "ANCHOR_ZOOM_SETTLED", beatId: move.end.beatId});
    const sampled = sampleAnchorLockedSegment({fromPose: poseOf(zoom.start), toPose: currentPose, anchorLockToNext: zoom.start.anchorLockToNext});
    audits.push({beatId: move.end.beatId, farReframe: Boolean(farReframe), sourceAnchor: nextAnchor, maxAnchorDriftPx: sampled.maxDriftPx});
    currentAnchor = nextAnchor;
    lastSettledAtMs = move.end.atMs;
  }

  const returnStartMs = Math.max(lastSettledAtMs + MINIMUM_READABLE_HOLD_MS, durationMs - FINAL_RETURN_DURATION_MS - FINAL_WIDE_HOLD_MS);
  const returnEndMs = returnStartMs + FINAL_RETURN_DURATION_MS;
  if (!currentAnchor || returnEndMs > durationMs - 180) throw new Error(`anchor-cycle-timing-invalid:${shotId}`);
  const restore = lockKeyframe({atMs: returnStartMs, fromPose: currentPose, sourceAnchor: currentAnchor, targetScale: 1.03, phase: "ANCHOR_FINAL_RETURN_START", beatId: `${shotId.toLowerCase()}-handoff`});
  track.push(restore.start);
  currentPose = restore.targetPose;
  track.push({atMs: returnEndMs, ...currentPose, easingToNext: "hold", phase: "ANCHOR_FINAL_RETURN_SETTLED", beatId: `${shotId.toLowerCase()}-handoff`});
  track.push({atMs: durationMs, ...currentPose, easingToNext: "hold", phase: "HOLD_END", beatId: `${shotId.toLowerCase()}-handoff`});
  const restoreAudit = sampleAnchorLockedSegment({fromPose: poseOf(restore.start), toPose: currentPose, anchorLockToNext: restore.start.anchorLockToNext});
  audits.push({beatId: `${shotId.toLowerCase()}-handoff`, farReframe: false, sourceAnchor: currentAnchor, maxAnchorDriftPx: restoreAudit.maxDriftPx});
  return {track, audits, returnStartMs, returnEndMs, readableHoldMs: returnStartMs - lastSettledAtMs};
}

function legacySegmentDriftPx(from, to, sourcePoint) {
  const before = projectSourcePoint({sourcePoint, cameraPose: poseOf(from)});
  const after = projectSourcePoint({sourcePoint, cameraPose: poseOf(to)});
  return Math.hypot((after.x - before.x) * 960, (after.y - before.y) * 540);
}

const items = [];
for (const shotId of selected) {
  const slug = shotId.toLowerCase();
  const sourceProps = JSON.parse(fs.readFileSync(path.join(sourceRoot, "props", `${slug}.json`), "utf8"));
  const scene = structuredClone(sourceProps.scenes[0]);
  const legacyMoves = scene.cameraTrack.flatMap((keyframe, index, track) => keyframe.easingToNext === "hold" ? [] : [{from: keyframe, to: track[index + 1]}]);
  const legacyMaxFocusDriftPx = Math.max(...legacyMoves.map(({from, to}) => legacySegmentDriftPx(from, to, {x: to.x, y: to.y})));
  const compiled = buildAnchorLockedTrack(scene.cameraTrack, scene.durationMs, shotId);
  scene.shotId = scene.shotId.replace("EVENT-SETTLE-DRAFT", "ANCHOR-LOCKED-CYCLE-PROOF");
  scene.cameraTrack = compiled.track;
  scene.screenDirection.cameraTrack = compiled.track;
  scene.screenDirection.cameraPath = "CINEMATIC_EASE_IN_OUT_RESTORE";
  scene.screenDirection.motionBlurPolicy = "VELOCITY_CINEMATIC";
  scene.screenDirection.grammar = `${scene.screenDirection.grammar}+ANCHOR_LOCKED_CYCLE_V1`;
  const props = {...sourceProps, scenes: [scene]};
  const propsPath = path.join(outputRoot, `${slug}-v5-props.json`);
  const v5Path = path.join(outputRoot, `${slug}-v5-anchor-locked-960x540.mp4`);
  const v4Path = path.join(v4Root, `${slug}-v4-cinematic-cycle-960x540.mp4`);
  const comparePath = path.join(outputRoot, `${slug}-v4-vs-v5-1920x540.mp4`);
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  await run("npx", ["remotion", "render", "src/screen-camera-diagnostic-entry.tsx", "A1ScreenCameraDiagnosticV1", v5Path, "--props", propsPath, "--codec", "h264", "--crf", "16", "--concurrency", "1"], renderer);
  await run(ffmpeg, ["-y", "-i", v4Path, "-i", v5Path, "-filter_complex", "[0:v]drawtext=text='v4  平移式缩放':x=32:y=28:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.66[v4];[1:v]drawtext=text='v5  锚点锁定缩放':x=32:y=28:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.66[v5];[v4][v5]hstack=inputs=2[v]", "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-shortest", comparePath]);
  items.push({shotId, propsPath, v4Path, v5Path, comparePath, legacyMaxFocusDriftPx, anchorLockedMaxFocusDriftPx: Math.max(...compiled.audits.map((item) => item.maxAnchorDriftPx)), returnStartMs: compiled.returnStartMs, returnEndMs: compiled.returnEndMs, readableHoldMs: compiled.readableHoldMs, segmentAudits: compiled.audits, v5Sha256: sha256File(v5Path), compareSha256: sha256File(comparePath)});
}

const reelPath = path.join(outputRoot, "v4-vs-v5-anchor-locked-three-shot-review-1920x540.mp4");
const concatList = path.join(outputRoot, "concat.txt");
fs.writeFileSync(concatList, items.map((item) => `file '${item.comparePath.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", reelPath]);
const report = {
  contract: "A1AnchorLockedScreenCycleProof/v1",
  status: items.every((item) => item.anchorLockedMaxFocusDriftPx < 0.01) ? "PASS" : "FAIL",
  selectedShotIds: selected,
  baseline: {version: "v4", worstFocusDriftPx: Math.max(...items.map((item) => item.legacyMaxFocusDriftPx))},
  candidate: {version: "v5", worstFocusDriftPx: Math.max(...items.map((item) => item.anchorLockedMaxFocusDriftPx)), farReframePolicy: "RETURN_NEAR_WIDE_THEN_ANCHOR_ZOOM"},
  items,
  reelPath,
  reelSha256: sha256File(reelPath),
  boundary: {proofOnly: true, currentAuthorityMutated: false, fullWaveOverwritten: false, userVisualApproval: "NOT_APPROVED"},
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, baseline: report.baseline, candidate: report.candidate, reelPath, items: items.map(({shotId, readableHoldMs, legacyMaxFocusDriftPx, anchorLockedMaxFocusDriftPx}) => ({shotId, readableHoldMs, legacyMaxFocusDriftPx, anchorLockedMaxFocusDriftPx}))}, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
