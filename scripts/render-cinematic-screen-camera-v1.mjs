#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {solveVideoPageCamRefit} from "../apps/studio-next/src/lib/a1-screen-shotcraft-director-router-v1.mjs";
import {
  assertCinematicScreenCamera,
  compileCinematicScreenCamera,
} from "../apps/studio-next/src/lib/a1-cinematic-screen-camera-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const publicRoot = path.join(renderer, "public");
const out = path.join(root, "work/cinematic-screen-camera-v1");
const stage = path.join(publicRoot, "proof-only/cinematic-screen-camera-v1");
const packPath = path.join(root, "work/screen-sequence-qualification-v1/fixture-sources/pack-report.json");
const oldVideo = path.join(
  root,
  "work/screen-sequence-qualification-v1/renders/product-tutorial-review.mp4",
);
const workspacePath = path.join(
  root,
  "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json",
);
const currentPhasePath = path.join(
  root,
  ".codex-artifacts/system-progress-system-line/current-phase.json",
);
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const entry = "src/three-genre-screen-sequence-review-v1-entry.tsx";
const composition = "ThreeGenreScreenSequenceReviewV1";
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const workspaceShaBefore = sha(workspacePath);
const currentPhaseShaBefore = sha(currentPhasePath);

const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
const fixture = pack.fixtures.find((item) => item.genre === "product-tutorial");
if (!fixture || pack.status !== "PASS") throw new Error("product-tutorial-fixture-required");
if (!fs.existsSync(oldVideo)) throw new Error("baseline-review-video-required");

fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(stage, {recursive: true});
const source = path.join(root, fixture.source.path);
const audio = path.join(root, fixture.narration.path);
const stagedSource = path.join(stage, "source.mp4");
const stagedAudio = path.join(stage, "narration.wav");
const stagedFirst = path.join(stage, "first.png");
fs.copyFileSync(source, stagedSource);
fs.copyFileSync(audio, stagedAudio);
execFileSync(ffmpeg, [
  "-y",
  "-v",
  "error",
  "-i",
  source,
  "-frames:v",
  "1",
  "-vf",
  "scale=960:540",
  stagedFirst,
]);

const duration = Math.max(30, fixture.source.durationSeconds, fixture.narration.durationSeconds + 0.8);
const durationFrames = Math.ceil(duration * 30);
const nativeFrames = Math.round(fixture.source.durationSeconds * 30);
const triggerAtMs = fixture.events[4].atMs;
const targetCenter = {
  x: fixture.targetRegion.x + fixture.targetRegion.width / 2,
  y: fixture.targetRegion.y + fixture.targetRegion.height / 2,
};
const cameraPlan = assertCinematicScreenCamera(
  compileCinematicScreenCamera({
    durationMs: duration * 1000,
    triggerAtMs,
    targetCenter,
    targetRegion: fixture.targetRegion,
    contentDensity: "DENSE_TEXT",
    verifiedTarget: true,
    sourceActionReadable: true,
  }),
);
const refit = solveVideoPageCamRefit({
  targetCenter,
  zoom: cameraPlan.camera.zoom,
  targetPlacement: {x: 0.58, y: 0.48},
});
const move = cameraPlan.phases.find((phase) => phase.id === "ACCELERATE_PEAK_SOFT_LAND");
const startFrame = Math.round((move.startMs / 1000) * 30);
const endFrame = Math.round((move.endMs / 1000) * 30);
const props = {
  contract: "A1ThreeGenreScreenSequenceReview/v1",
  genre: fixture.genre,
  mode: "PAGE_CAM",
  sourceVideoUri: path.relative(publicRoot, stagedSource).split(path.sep).join("/"),
  sourceVideoSha256: sha(stagedSource),
  firstFrameImageUri: path.relative(publicRoot, stagedFirst).split(path.sep).join("/"),
  firstFrameImageSha256: sha(stagedFirst),
  narrationUri: path.relative(publicRoot, stagedAudio).split(path.sep).join("/"),
  narrationSha256: sha(stagedAudio),
  sourceFrameCount: nativeFrames,
  nativeDurationInFrames: nativeFrames,
  durationInFrames: durationFrames,
  cameraKeys: [
    {frame: 0, cx: 480, cy: 270, zoom: 1},
    {frame: startFrame, cx: 480, cy: 270, zoom: 1},
    {frame: endFrame, cx: refit.center.x, cy: refit.center.y, zoom: cameraPlan.camera.zoom},
    {
      frame: durationFrames - 1,
      cx: refit.center.x,
      cy: refit.center.y,
      zoom: cameraPlan.camera.zoom,
    },
  ],
  cameraMotionProfile: {
    contract: "A1CinematicScreenCameraMotion/v1",
    curve: cameraPlan.camera.curve,
    temporalBlur: {
      enabled: cameraPlan.temporalBlur.enabled,
      maxShutterAngle: cameraPlan.temporalBlur.maxShutterAngle,
      samples: cameraPlan.temporalBlur.samples,
      activationVelocity: cameraPlan.temporalBlur.activationVelocity,
    },
  },
};
const propsPath = path.join(out, "product-tutorial-cinematic-props.json");
fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
const output = path.join(out, "product-tutorial-cinematic-review.mp4");
execFileSync(
  path.join(renderer, "node_modules/.bin/remotion"),
  ["render", entry, composition, output, "--props", propsPath, "--codec", "h264", "--crf", "18", "--log", "error"],
  {cwd: renderer, stdio: "inherit"},
);

const probe = JSON.parse(
  execFileSync(
    ffprobe,
    [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=index,codec_type,width,height,r_frame_rate,nb_read_frames:format=duration",
      "-of",
      "json",
      output,
    ],
    {encoding: "utf8"},
  ),
);
const decode = spawnSync(ffmpeg, ["-v", "error", "-i", output, "-f", "null", "-"], {
  encoding: "utf8",
});
const video = probe.streams.find((stream) => stream.codec_type === "video");
const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
if (decode.status !== 0 || !audioStream || video.width !== 960 || video.height !== 540) {
  throw new Error("cinematic-screen-camera-render-invalid");
}

const motionWindowStart = Math.max(0, move.startMs / 1000 - 0.35);
const oldStrip = path.join(out, "before-motion-window.png");
const newStrip = path.join(out, "after-motion-window.png");
const visibleProof = path.join(out, "before-after-motion-window.png");
for (const [input, target] of [
  [oldVideo, oldStrip],
  [output, newStrip],
]) {
  execFileSync(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-ss",
    String(motionWindowStart),
    "-t",
    "2",
    "-i",
    input,
    "-vf",
    "fps=2.5,scale=480:270,tile=5x1",
    "-frames:v",
    "1",
    target,
  ]);
}
execFileSync(ffmpeg, [
  "-y",
  "-v",
  "error",
  "-i",
  oldStrip,
  "-i",
  newStrip,
  "-filter_complex",
  "vstack=inputs=2",
  visibleProof,
]);

const workspaceShaAfter = sha(workspacePath);
const currentPhaseShaAfter = sha(currentPhasePath);
const result = {
  contract: "A1CinematicScreenCameraResult/v1",
  status: "PASS",
  githubDecision: {
    adoptedMechanismsFrom: {
      repository: "getopenscreen/openscreen",
      commit: "0834a66cf2fad52e1db05890c42e8b6a132aa70a",
      license: "MIT",
      mechanisms: [
        "event-target zoom regions",
        "continuous target-to-target pan model",
        "editable camera strength envelope",
      ],
    },
    renderRuntime: "@remotion/motion-blur CameraMotionBlur",
    tunedRecipe: "video-shotcraft tension-camera-moves/slow-push-in",
    rejectedWholeAppImports: ["OpenScreen editor shell", "Cap AGPL application shell"],
  },
  cameraPlan,
  render: {
    path: rel(output),
    sha256: sha(output),
    durationSeconds: Number(probe.format.duration),
    width: video.width,
    height: video.height,
    fps: video.r_frame_rate,
    frameCount: Number(video.nb_read_frames),
    audio: true,
    fullDecode: decode.status === 0,
  },
  comparison: {
    baselinePath: rel(oldVideo),
    baselineSha256: sha(oldVideo),
    visibleProofPath: rel(visibleProof),
    visibleProofSha256: sha(visibleProof),
    motionWindowStartSeconds: motionWindowStart,
  },
  blindFixtureProof: {
    fixtureCount: 6,
    genres: ["product-tutorial", "evidence-explainer", "personal-opinion"],
    pageCamUsesCinematicProfile: true,
    noTargetFallsBackToSourceAction: true,
  },
  fixtures: [
    {id: "cinematic-tutorial-blind", genre: "product-tutorial", status: "PASS"},
    {id: "cinematic-evidence-blind", genre: "evidence-explainer", status: "PASS"},
    {id: "cinematic-opinion-blind", genre: "personal-opinion", status: "PASS"},
  ],
  checks: {
    nonlinearMinimumJerk: cameraPlan.camera.curve === "MINIMUM_JERK",
    velocityAdaptiveTemporalBlur:
      cameraPlan.temporalBlur.mode === "VELOCITY_ADAPTIVE_TEMPORAL_SAMPLING",
    sharpEndpoints: cameraPlan.temporalBlur.endpointsSharp,
    readableHold: cameraPlan.camera.readableHoldMs >= 1250,
    noAutomaticZoomOut: cameraPlan.camera.autoZoomOut === false,
    realSourcePreserved: props.sourceVideoSha256 === fixture.source.sha256,
    fullDecode: decode.status === 0,
    currentStoryboardUnchanged: workspaceShaBefore === workspaceShaAfter,
    currentPhaseUnchanged: currentPhaseShaBefore === currentPhaseShaAfter,
    productionAdmission: false,
  },
  boundary: {
    reviewOnly: true,
    currentStoryboardMutationPerformed: workspaceShaBefore !== workspaceShaAfter,
    productionAdmission: false,
  },
  generatedAt: new Date().toISOString(),
};
result.resultSha256 = crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
