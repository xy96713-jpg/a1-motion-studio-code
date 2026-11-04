#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {
  deriveAnchorLockedPose,
  deriveRoiSafeAnchorLockedPose,
  projectSourceRegion,
  sampleAnchorLockedSegment,
} from "../apps/studio-next/src/lib/a1-anchor-locked-screen-camera-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const sourceRoot = path.join(root, "work/event-settle-screen-wave15-v1");
const v5Root = path.join(root, "work/anchor-locked-screen-cycle-proof-v1");
const outputRoot = path.join(root, "work/roi-safe-screen-cycle-proof-v1");
const selected = ["ED-03", "ED-05", "ED-29"];
const ffmpeg = process.env.FFMPEG_PATH || "/Users/a1/.local/bin/ffmpeg";
const SAFE_MARGIN_PX = 6;
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
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 16000) stderr = stderr.slice(-16000); });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)}:${code}:${stderr.slice(-5000)}`)));
});
const poseOf = (keyframe) => ({x: keyframe.x, y: keyframe.y, scale: keyframe.scale});
const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);

function compileTrack({sourceTrack, attentionTrack, durationMs, shotId}) {
  const regionByBeat = new Map(attentionTrack.map((item) => [item.beat, item.region]));
  const moves = sourceTrack.flatMap((start, index, track) => start.easingToNext === "hold" ? [] : [{start, end: track[index + 1]}]);
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
        const restore = deriveAnchorLockedPose({fromPose: currentPose, sourceAnchor: currentAnchor, targetScale: 1});
        track.push({atMs: restoreStartMs, ...currentPose, easingToNext: "cinematic-in-out", anchorLockToNext: restore.anchorLockToNext, phase: "ROI_SAFE_RETURN_START", beatId: `${move.start.beatId}-prewide`});
        currentPose = restore.pose;
        track.push({atMs: restoreEndMs, ...currentPose, easingToNext: "hold", phase: "ROI_SAFE_RETURN_SETTLED", beatId: `${move.start.beatId}-prewide`});
      }
    }
    if (track.at(-1).atMs < move.start.atMs) track.push({atMs: move.start.atMs, ...currentPose, easingToNext: "hold", phase: "ROI_SAFE_HOLD", beatId: move.start.beatId});
    const targetRegion = regionByBeat.get(move.end.beatId) || null;
    const solution = targetRegion
      ? deriveRoiSafeAnchorLockedPose({fromPose: currentPose, sourceAnchor: nextAnchor, targetRegion, requestedScale: move.end.scale, safeMarginPx: SAFE_MARGIN_PX})
      : {...deriveAnchorLockedPose({fromPose: currentPose, sourceAnchor: nextAnchor, targetScale: move.end.scale}), status: "PASS", requestedScale: move.end.scale, resolvedScale: move.end.scale, scaleCappedForRoi: false, projectedRegion: null};
    if (solution.status !== "PASS" || !solution.anchorLockToNext) throw new Error(`roi-safe-camera-solution:${shotId}:${move.end.beatId}:${solution.reason}`);
    track.at(-1).easingToNext = "cinematic-in-out";
    track.at(-1).anchorLockToNext = solution.anchorLockToNext;
    track.at(-1).phase = "ROI_SAFE_ZOOM_START";
    currentPose = solution.pose;
    track.push({atMs: move.end.atMs, ...currentPose, easingToNext: "hold", phase: "ROI_SAFE_ZOOM_SETTLED", beatId: move.end.beatId});
    const sampled = sampleAnchorLockedSegment({fromPose: poseOf(track.at(-2)), toPose: currentPose, anchorLockToNext: solution.anchorLockToNext});
    audits.push({beatId: move.end.beatId, farReframe: Boolean(farReframe), requestedScale: solution.requestedScale, resolvedScale: solution.resolvedScale, scaleCappedForRoi: solution.scaleCappedForRoi, targetRegion, projectedRegion: solution.projectedRegion?.pixels || null, maxAnchorDriftPx: sampled.maxDriftPx});
    currentAnchor = nextAnchor;
    lastSettledAtMs = move.end.atMs;
  }

  const returnStartMs = Math.max(lastSettledAtMs + MINIMUM_READABLE_HOLD_MS, durationMs - FINAL_RETURN_DURATION_MS - FINAL_WIDE_HOLD_MS);
  const returnEndMs = returnStartMs + FINAL_RETURN_DURATION_MS;
  const restore = deriveAnchorLockedPose({fromPose: currentPose, sourceAnchor: currentAnchor, targetScale: 1});
  track.push({atMs: returnStartMs, ...currentPose, easingToNext: "cinematic-in-out", anchorLockToNext: restore.anchorLockToNext, phase: "ROI_SAFE_FINAL_RETURN_START", beatId: `${shotId.toLowerCase()}-handoff`});
  currentPose = restore.pose;
  track.push({atMs: returnEndMs, ...currentPose, easingToNext: "hold", phase: "ROI_SAFE_FINAL_RETURN_SETTLED", beatId: `${shotId.toLowerCase()}-handoff`});
  track.push({atMs: durationMs, ...currentPose, easingToNext: "hold", phase: "HOLD_END", beatId: `${shotId.toLowerCase()}-handoff`});
  const restoreAudit = sampleAnchorLockedSegment({fromPose: poseOf(track.at(-3)), toPose: currentPose, anchorLockToNext: restore.anchorLockToNext});
  audits.push({beatId: `${shotId.toLowerCase()}-handoff`, requestedScale: 1, resolvedScale: currentPose.scale, scaleCappedForRoi: false, targetRegion: null, projectedRegion: null, maxAnchorDriftPx: restoreAudit.maxDriftPx});
  return {track, audits, returnStartMs, returnEndMs, readableHoldMs: returnStartMs - lastSettledAtMs};
}

const items = [];
for (const shotId of selected) {
  const slug = shotId.toLowerCase();
  const sourceProps = JSON.parse(fs.readFileSync(path.join(sourceRoot, "props", `${slug}.json`), "utf8"));
  const scene = structuredClone(sourceProps.scenes[0]);
  const compiled = compileTrack({sourceTrack: scene.cameraTrack, attentionTrack: scene.screenDirection.attentionTrack, durationMs: scene.durationMs, shotId});
  scene.shotId = scene.shotId.replace("EVENT-SETTLE-DRAFT", "ROI-SAFE-CYCLE-PROOF");
  scene.cameraTrack = compiled.track;
  scene.screenDirection.cameraTrack = compiled.track;
  scene.screenDirection.cameraPath = "CINEMATIC_EASE_IN_OUT_RESTORE";
  scene.screenDirection.motionBlurPolicy = "VELOCITY_CINEMATIC";
  scene.screenDirection.grammar = `${scene.screenDirection.grammar}+ROI_SAFE_CYCLE_V1`;
  const props = {...sourceProps, scenes: [scene]};
  const propsPath = path.join(outputRoot, `${slug}-v6-props.json`);
  const v6Path = path.join(outputRoot, `${slug}-v6-roi-safe-960x540.mp4`);
  const v5Path = path.join(v5Root, `${slug}-v5-anchor-locked-960x540.mp4`);
  const comparePath = path.join(outputRoot, `${slug}-v5-vs-v6-1920x540.mp4`);
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  await run("npx", ["remotion", "render", "src/screen-camera-diagnostic-entry.tsx", "A1ScreenCameraDiagnosticV1", v6Path, "--props", propsPath, "--codec", "h264", "--crf", "16", "--concurrency", "1"], renderer);
  await run(ffmpeg, ["-y", "-i", v5Path, "-i", v6Path, "-filter_complex", "[0:v]drawtext=text='v5  锚点锁定但ROI裁切':x=32:y=28:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.66[v5];[1:v]drawtext=text='v6  ROI完整可见硬约束':x=32:y=28:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.66[v6];[v5][v6]hstack=inputs=2[v]", "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-shortest", comparePath]);
  const roiAudits = compiled.audits.filter((item) => item.targetRegion);
  items.push({shotId, propsPath, v5Path, v6Path, comparePath, readableHoldMs: compiled.readableHoldMs, maxAnchorDriftPx: Math.max(...compiled.audits.map((item) => item.maxAnchorDriftPx)), roiAudits, allRoisFullyVisible: roiAudits.every((item) => item.projectedRegion.left >= SAFE_MARGIN_PX - 1e-6 && item.projectedRegion.top >= SAFE_MARGIN_PX - 1e-6 && item.projectedRegion.right <= 960 - SAFE_MARGIN_PX + 1e-6 && item.projectedRegion.bottom <= 540 - SAFE_MARGIN_PX + 1e-6), v6Sha256: sha256File(v6Path), compareSha256: sha256File(comparePath)});
}
const reelPath = path.join(outputRoot, "v5-vs-v6-roi-safe-three-shot-review-1920x540.mp4");
const concatList = path.join(outputRoot, "concat.txt");
fs.writeFileSync(concatList, items.map((item) => `file '${item.comparePath.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", reelPath]);
const report = {contract: "A1RoiSafeScreenCycleProof/v1", status: items.every((item) => item.allRoisFullyVisible && item.maxAnchorDriftPx < .01) ? "PASS" : "FAIL", safeMarginPx: SAFE_MARGIN_PX, selectedShotIds: selected, items, reelPath, reelSha256: sha256File(reelPath), boundary: {proofOnly: true, currentAuthorityMutated: false, fullWaveOverwritten: false, userVisualApproval: "NOT_APPROVED"}, generatedAt: new Date().toISOString()};
fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, safeMarginPx: SAFE_MARGIN_PX, reelPath, items: items.map(({shotId, readableHoldMs, maxAnchorDriftPx, allRoisFullyVisible, roiAudits}) => ({shotId, readableHoldMs, maxAnchorDriftPx, allRoisFullyVisible, roiAudits}))}, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
