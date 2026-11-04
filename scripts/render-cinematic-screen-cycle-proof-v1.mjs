#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const sourceRoot = path.join(root, "work/event-settle-screen-wave15-v1");
const outputRoot = path.join(root, "work/cinematic-screen-cycle-proof-v1");
const publicRoot = path.join(renderer, "public/proof-only/event-settle-screen-wave15-v1");
const selected = ["ED-03", "ED-05", "ED-29"];
const ffmpeg = process.env.FFMPEG_PATH || "/Users/a1/.local/bin/ffmpeg";

fs.mkdirSync(outputRoot, {recursive: true});

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args, cwd = root) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {cwd, stdio: ["ignore", "inherit", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 16000) stderr = stderr.slice(-16000);
  });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)}:${code}:${stderr.slice(-5000)}`)));
});

const withCinematicCycle = (originalScene) => {
  const scene = structuredClone(originalScene);
  const durationMs = scene.durationMs;
  const sourceTrack = scene.cameraTrack;
  const settled = sourceTrack.at(-2);
  const minimumReadableHoldMs = 900;
  const returnDurationMs = 560;
  const finalWideHoldMs = 520;
  const desiredReturnStartMs = durationMs - returnDurationMs - finalWideHoldMs;
  const returnStartMs = Math.max(settled.atMs + minimumReadableHoldMs, desiredReturnStartMs);
  const returnEndMs = returnStartMs + returnDurationMs;
  if (returnEndMs > durationMs - 180) throw new Error(`cinematic-cycle-insufficient-time:${scene.shotId}`);

  const motionTrack = sourceTrack.slice(0, -1).map((keyframe) => ({
    ...keyframe,
    easingToNext: keyframe.easingToNext === "hold" ? "hold" : "cinematic-in-out",
  }));
  const lastSettled = motionTrack.at(-1);
  lastSettled.easingToNext = "hold";
  motionTrack.push({
    atMs: returnStartMs,
    x: lastSettled.x,
    y: lastSettled.y,
    scale: lastSettled.scale,
    easingToNext: "cinematic-in-out",
    phase: "RESTORE_START",
    beatId: `${scene.shotId.toLowerCase()}-handoff`,
  });
  motionTrack.push({
    atMs: returnEndMs,
    x: 0.5,
    y: 0.5,
    scale: 1.03,
    easingToNext: "hold",
    phase: "RESTORE_SETTLED",
    beatId: `${scene.shotId.toLowerCase()}-handoff`,
  });
  motionTrack.push({
    atMs: durationMs,
    x: 0.5,
    y: 0.5,
    scale: 1.03,
    easingToNext: "hold",
    phase: "HOLD_END",
    beatId: `${scene.shotId.toLowerCase()}-handoff`,
  });
  scene.shotId = scene.shotId.replace("EVENT-SETTLE-DRAFT", "CINEMATIC-CYCLE-PROOF");
  scene.cameraTrack = motionTrack;
  scene.screenDirection.cameraTrack = motionTrack;
  scene.screenDirection.cameraPath = "CINEMATIC_EASE_IN_OUT_RESTORE";
  scene.screenDirection.motionBlurPolicy = "VELOCITY_CINEMATIC";
  scene.screenDirection.grammar = `${scene.screenDirection.grammar}+CINEMATIC_CYCLE_V1`;
  return {scene, returnStartMs, returnEndMs, readableHoldMs: returnStartMs - settled.atMs};
};

const items = [];
for (const shotId of selected) {
  const slug = shotId.toLowerCase();
  const sourcePropsPath = path.join(sourceRoot, "props", `${slug}.json`);
  const sourceProps = JSON.parse(fs.readFileSync(sourcePropsPath, "utf8"));
  const {scene, returnStartMs, returnEndMs, readableHoldMs} = withCinematicCycle(sourceProps.scenes[0]);
  const props = {...sourceProps, scenes: [scene]};
  const propsPath = path.join(outputRoot, `${slug}-v4-props.json`);
  const v4Path = path.join(outputRoot, `${slug}-v4-cinematic-cycle-960x540.mp4`);
  const v3Path = path.join(sourceRoot, "renders", `${slug}-event-settle-960x540.mp4`);
  const comparePath = path.join(outputRoot, `${slug}-v3-vs-v4-1920x540.mp4`);
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  await run("npx", ["remotion", "render", "src/screen-camera-diagnostic-entry.tsx", "A1ScreenCameraDiagnosticV1", v4Path, "--props", propsPath, "--codec", "h264", "--crf", "16", "--concurrency", "1"], renderer);
  await run(ffmpeg, ["-y", "-i", v3Path, "-i", v4Path, "-filter_complex", "[0:v]drawtext=text='v3  仅推进/停住':x=32:y=28:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.66[v3];[1:v]drawtext=text='v4  S曲线/停住/缩回/速度模糊':x=32:y=28:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.66[v4];[v3][v4]hstack=inputs=2[v]", "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-shortest", comparePath]);
  items.push({shotId, propsPath, v3Path, v4Path, comparePath, returnStartMs, returnEndMs, readableHoldMs, v4Sha256: sha256File(v4Path), compareSha256: sha256File(comparePath)});
}

const reelPath = path.join(outputRoot, "v3-vs-v4-cinematic-cycle-three-shot-review-1920x540.mp4");
const concatList = path.join(outputRoot, "concat.txt");
fs.writeFileSync(concatList, items.map((item) => `file '${item.comparePath.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", reelPath]);
const report = {
  contract: "A1CinematicScreenCycleProof/v1",
  status: "PASS",
  selectedShotIds: selected,
  curve: "cubic-bezier(0.65,0,0.35,1)",
  motionBlurPolicy: "VELOCITY_CINEMATIC",
  motionBlurMaximumPx: 2.4,
  returnScale: 1.03,
  items,
  reelPath,
  reelSha256: sha256File(reelPath),
  boundary: {proofOnly: true, currentAuthorityMutated: false, fullWaveOverwritten: false},
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, reelPath, items: items.map(({shotId, readableHoldMs, returnStartMs, returnEndMs}) => ({shotId, readableHoldMs, returnStartMs, returnEndMs}))}, null, 2));
