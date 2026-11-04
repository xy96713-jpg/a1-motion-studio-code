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
const outputRoot = path.join(root, "work/mature-screen-camera-system-v1/wave15");
const propsRoot = path.join(outputRoot, "props");
const renderRoot = path.join(outputRoot, "renders");
const manifestPath = path.join(outputRoot, "render-manifest.json");
const ffmpeg = "/Users/a1/.local/bin/ffmpeg";
const shotIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"];
const requireFromRenderer = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = requireFromRenderer("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = requireFromRenderer("@remotion/renderer");
fs.mkdirSync(propsRoot, {recursive: true});
fs.mkdirSync(renderRoot, {recursive: true});

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {cwd: root, stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 16000) stderr = stderr.slice(-16000); });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)}:${code}:${stderr.slice(-5000)}`)));
});

const rendererIdentity = {
  rendererSha256: sha256File(path.join(rendererRoot, "src/ContinuousScreenEvidenceReelV2.tsx")),
  grammarSha256: sha256File(path.join(root, "apps/studio-next/src/lib/a1-mature-screen-camera-grammar-v1.mjs")),
  geometrySha256: sha256File(path.join(root, "apps/studio-next/src/lib/a1-anchor-locked-screen-camera-v1.mjs")),
  packageLockSha256: sha256File(path.join(rendererRoot, "package-lock.json")),
};
const buildSha256 = sha256Value(rendererIdentity);
const prior = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
const priorByShot = new Map((prior?.items || []).map((item) => [item.shotId, item]));
const jobs = shotIds.map((shotId) => {
  const slug = shotId.toLowerCase();
  const sourcePropsPath = path.join(sourceRoot, `${slug}.json`);
  const sourceProps = JSON.parse(fs.readFileSync(sourcePropsPath, "utf8"));
  const scene = structuredClone(sourceProps.scenes[0]);
  const compiled = compileMatureScreenCameraGrammar({durationMs: scene.durationMs, cameraTrack: scene.cameraTrack, attentionTrack: scene.screenDirection.attentionTrack});
  if (compiled.status !== "PASS") throw new Error(`mature-wave15-compile:${shotId}:${compiled.failures.join(",")}`);
  scene.shotId = scene.shotId.replace("EVENT-SETTLE-DRAFT", "MATURE-CAMERA-WAVE15");
  scene.cameraTrack = compiled.cameraTrack;
  scene.screenDirection.cameraTrack = compiled.cameraTrack;
  scene.screenDirection.cameraPath = "CINEMATIC_EASE_IN_OUT_RESTORE";
  scene.screenDirection.motionBlurPolicy = compiled.motionBlur.kind === "NONE" ? "NONE" : "TEMPORAL_CAMERA_ONLY";
  scene.screenDirection.temporalMotionBlur = {shutterAngle: compiled.motionBlur.shutterAngle, samples: compiled.motionBlur.samples};
  scene.screenDirection.grammar = `MATURE_SCREEN_CAMERA_GRAMMAR_V1:${compiled.decisions.map((item) => item.grammar).join("+") || "NO_CAMERA"}`;
  const props = {...sourceProps, scenes: [scene], showReviewLabels: false, boundaryTransitionFrames: 0};
  const propsSha256 = sha256Value(props);
  const propsPath = path.join(propsRoot, `${slug}.json`);
  const outputPath = path.join(renderRoot, `${slug}-mature-camera-960x540.mp4`);
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  return {shotId, slug, props, propsPath, propsSha256, outputPath, compiled};
});

const reused = [];
const pending = [];
for (const job of jobs) {
  const old = priorByShot.get(job.shotId);
  if (prior?.buildSha256 === buildSha256 && old?.propsSha256 === job.propsSha256 && fs.existsSync(job.outputPath) && sha256File(job.outputPath) === old.outputSha256) reused.push({...old, reused: true});
  else pending.push(job);
}

const startedAt = Date.now();
let serveUrl = null;
let browser = null;
const rendered = [];
if (pending.length) {
  serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/screen-camera-diagnostic-entry.tsx"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const renderOne = async (job) => {
      const composition = await selectComposition({serveUrl, id: "A1ScreenCameraDiagnosticV1", inputProps: job.props, puppeteerInstance: browser, logLevel: "warn"});
      await renderMedia({serveUrl, composition, inputProps: job.props, outputLocation: job.outputPath, codec: "h264", pixelFormat: "yuv420p", crf: 16, imageFormat: "jpeg", jpegQuality: 92, concurrency: 1, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      return {shotId: job.shotId, propsPath: job.propsPath, propsSha256: job.propsSha256, outputPath: job.outputPath, outputSha256: sha256File(job.outputPath), bytes: fs.statSync(job.outputPath).size, decisions: job.compiled.decisions, audits: job.compiled.audits, summary: job.compiled.summary, motionBlur: job.compiled.motionBlur, reused: false};
    };
    for (let index = 0; index < pending.length; index += 2) {
      const batch = pending.slice(index, index + 2);
      console.error(`rendering ${batch.map((item) => item.shotId).join(",")} (${index + 1}-${index + batch.length}/${pending.length})`);
      rendered.push(...await Promise.all(batch.map(renderOne)));
    }
  } finally {
    await browser.close({silent: true});
  }
}
const renderedByShot = new Map([...reused, ...rendered].map((item) => [item.shotId, item]));
const items = shotIds.map((shotId) => renderedByShot.get(shotId));
if (items.some((item) => !item)) throw new Error("mature-wave15-render-item-missing");
const concatPath = path.join(outputRoot, "concat.txt");
const reelPath = path.join(outputRoot, "mature-screen-camera-wave15-review-960x540.mp4");
fs.writeFileSync(concatPath, items.map((item) => `file '${item.outputPath.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", reelPath]);
const manifest = {
  contract: "A1MatureScreenCameraWave15Render/v1",
  status: items.length === 15 ? "PASS" : "FAIL",
  shotIds,
  buildSha256,
  rendererIdentity,
  renderedCount: rendered.length,
  reusedCount: reused.length,
  maxConcurrency: 2,
  items,
  reel: {path: reelPath, sha256: sha256File(reelPath), bytes: fs.statSync(reelPath).size},
  elapsedMs: Date.now() - startedAt,
  boundary: {proofOnly: true, currentAuthorityMutated: false, fullWaveOverwritten: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, renderedCount: manifest.renderedCount, reusedCount: manifest.reusedCount, elapsedMs: manifest.elapsedMs, reel: manifest.reel, grammarCounts: items.flatMap((item) => item.decisions.map((decision) => decision.grammar)).reduce((acc, grammar) => ({...acc, [grammar]: (acc[grammar] || 0) + 1}), {})}, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
