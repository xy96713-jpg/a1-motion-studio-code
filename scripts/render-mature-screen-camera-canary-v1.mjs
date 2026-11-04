#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {compileMatureScreenCameraGrammar} from "../apps/studio-next/src/lib/a1-mature-screen-camera-grammar-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const sourceRoot = path.join(root, "work/event-settle-screen-wave15-v1/props");
const incumbentRoot = path.join(root, "work/roi-safe-screen-cycle-proof-v1");
const outputRoot = path.join(root, "work/mature-screen-camera-system-v1/canary");
const selected = ["ED-03", "ED-05", "ED-29"];
const ffmpeg = "/Users/a1/.local/bin/ffmpeg";
const requireFromRenderer = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = requireFromRenderer("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = requireFromRenderer("@remotion/renderer");

fs.mkdirSync(outputRoot, {recursive: true});
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {cwd: root, stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 16000) stderr = stderr.slice(-16000); });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)}:${code}:${stderr.slice(-5000)}`)));
});

const jobs = selected.map((shotId) => {
  const slug = shotId.toLowerCase();
  const sourceProps = JSON.parse(fs.readFileSync(path.join(sourceRoot, `${slug}.json`), "utf8"));
  const scene = structuredClone(sourceProps.scenes[0]);
  const compiled = compileMatureScreenCameraGrammar({durationMs: scene.durationMs, cameraTrack: scene.cameraTrack, attentionTrack: scene.screenDirection.attentionTrack});
  if (compiled.status !== "PASS") throw new Error(`mature-camera-compile:${shotId}:${compiled.failures.join(",")}`);
  scene.shotId = scene.shotId.replace("EVENT-SETTLE-DRAFT", "MATURE-CAMERA-CANARY");
  scene.cameraTrack = compiled.cameraTrack;
  scene.screenDirection.cameraTrack = compiled.cameraTrack;
  scene.screenDirection.cameraPath = "CINEMATIC_EASE_IN_OUT_RESTORE";
  scene.screenDirection.motionBlurPolicy = "TEMPORAL_CAMERA_ONLY";
  scene.screenDirection.temporalMotionBlur = {shutterAngle: compiled.motionBlur.shutterAngle, samples: compiled.motionBlur.samples};
  scene.screenDirection.grammar = `MATURE_SCREEN_CAMERA_GRAMMAR_V1:${compiled.decisions.map((item) => item.grammar).join("+") || "NO_CAMERA"}`;
  const props = {...sourceProps, scenes: [scene], showReviewLabels: false, boundaryTransitionFrames: 0};
  const propsPath = path.join(outputRoot, `${slug}-props.json`);
  const outputPath = path.join(outputRoot, `${slug}-mature-camera-960x540.mp4`);
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  return {shotId, slug, props, propsPath, outputPath, compiled};
});

const startedAt = Date.now();
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/screen-camera-diagnostic-entry.tsx"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
try {
  for (const [index, job] of jobs.entries()) {
    console.error(`rendering ${job.shotId} (${index + 1}/${jobs.length})`);
    const composition = await selectComposition({serveUrl, id: "A1ScreenCameraDiagnosticV1", inputProps: job.props, puppeteerInstance: browser, logLevel: "warn"});
    await renderMedia({serveUrl, composition, inputProps: job.props, outputLocation: job.outputPath, codec: "h264", pixelFormat: "yuv420p", crf: 16, imageFormat: "jpeg", jpegQuality: 92, concurrency: 1, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  }
} finally {
  await browser.close({silent: true});
}

const comparisons = [];
for (const job of jobs) {
  const incumbentPath = path.join(incumbentRoot, `${job.slug}-v6-roi-safe-960x540.mp4`);
  const comparePath = path.join(outputRoot, `${job.slug}-v6-vs-mature-1920x540.mp4`);
  await run(ffmpeg, ["-y", "-i", incumbentPath, "-i", job.outputPath, "-filter_complex", "[0:v]drawtext=text='v6  CSS速度模糊':x=32:y=28:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.66[v6];[1:v]drawtext=text='Mature  多帧相机模糊':x=32:y=28:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.66[m];[v6][m]hstack=inputs=2[v]", "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-shortest", comparePath]);
  comparisons.push(comparePath);
}
const reelPath = path.join(outputRoot, "v6-vs-mature-temporal-blur-three-shot-review-1920x540.mp4");
const concatPath = path.join(outputRoot, "concat.txt");
fs.writeFileSync(concatPath, comparisons.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", reelPath]);
const report = {
  contract: "A1MatureScreenCameraCanary/v1",
  status: jobs.every((job) => fs.existsSync(job.outputPath)) ? "PASS" : "FAIL",
  renderer: {remotionVersion: "4.0.396", motionBlurPackageVersion: "4.0.396", mechanism: "CAMERA_MOTION_BLUR_SOURCE_FRAME_LOCKED", shutterAngle: 100, samples: 6},
  items: jobs.map((job) => ({shotId: job.shotId, propsPath: job.propsPath, outputPath: job.outputPath, outputSha256: sha256File(job.outputPath), bytes: fs.statSync(job.outputPath).size, decisions: job.compiled.decisions, audits: job.compiled.audits, summary: job.compiled.summary})),
  reelPath,
  reelSha256: sha256File(reelPath),
  elapsedMs: Date.now() - startedAt,
  boundary: {proofOnly: true, currentAuthorityMutated: false, fullWaveOverwritten: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, elapsedMs: report.elapsedMs, reelPath, items: report.items.map(({shotId, bytes, summary}) => ({shotId, bytes, summary}))}, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
