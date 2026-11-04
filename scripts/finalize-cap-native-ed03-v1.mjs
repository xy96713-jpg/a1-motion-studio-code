#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetShotId = process.env.A1_CAP_NATIVE_SHOT_ID || "ED-03";
const shotSlug = targetShotId.toLowerCase();
const runTag = process.env.A1_CAP_NATIVE_RUN_TAG || "v1";
if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(runTag)) throw new Error(`cap-native-run-tag-invalid:${runTag}`);
const shotSpecs = {
  "ED-02": {workDirectory: `cap-native-ed02-${runTag}`, projectBasename: "ed-02-preference.cap", actionId: "causalRewrite"},
  "ED-03": {workDirectory: `cap-native-ed03-${runTag}`, projectBasename: "ed-03-preference.cap", actionId: "preference"},
  "ED-24": {workDirectory: `cap-native-ed24-${runTag}`, projectBasename: "ed-24-preference.cap", actionId: "negativePreferenceRecord"},
  "ED-26": {workDirectory: `cap-native-ed26-${runTag}`, projectBasename: "ed-26-preference.cap", actionId: "preferenceGeneration"},
};
const shotSpec = shotSpecs[targetShotId];
if (!shotSpec) throw new Error(`cap-native-finalize-unsupported:${targetShotId}`);
const workRoot = path.join(root, "work", shotSpec.workDirectory);
const captureReportPath = path.join(workRoot, "report.json");
const projectPath = path.join(workRoot, shotSpec.projectBasename);
const capExportPath = path.join(workRoot, `${shotSlug}-cap-native-960x540.mp4`);
const phase = "generated/system-line/editorial-asset-workbench-v1";
const family = `${phase}/continuous-screen-evidence-v2/cap-native-v1`;
const studioPublicRoot = path.join(root, "apps/studio-next/public");
const rendererPublicRoot = path.join(root, "remotion-renderer/public");
const publicVideoPath = path.join(studioPublicRoot, family, `${shotSlug}-preference-960x540.mp4`);
const publicContactPath = path.join(studioPublicRoot, family, `${shotSlug}-preference-contact.png`);
const publicReportPath = path.join(studioPublicRoot, family, `${shotSlug}-report.json`);
const artifactReportPath = path.join(root, `.codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/cap-native-v1/${shotSlug}-report.json`);
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed:${result.stderr || result.stdout}`);
  return result.stdout;
};
const probe = (file) => JSON.parse(run(ffprobe, [
  "-v", "error", "-count_frames",
  "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames:format=duration,size",
  "-of", "json", file,
]));

const capture = JSON.parse(fs.readFileSync(captureReportPath, "utf8"));
if (!["A1CapNativePreferenceCapture/v2", "A1CapNativePreferenceCapture/v3"].includes(capture.contract) || capture.narrationBinding?.contract !== "A1CapNarrationBinding/v1" || capture.narrationBinding?.status !== "PASS" || capture.narrationBinding?.shotId !== targetShotId) {
  throw new Error(`cap-native-${shotSlug}-capture-not-bound`);
}
if (!fs.existsSync(capExportPath) || !fs.existsSync(projectPath)) throw new Error(`cap-native-${shotSlug}-input-missing`);

const frameCount = Math.round(capture.narrationBinding.timelineDurationMs / 1000 * 60);
const finalFrame = frameCount - 1;

fs.mkdirSync(path.dirname(publicVideoPath), {recursive: true});
run(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-y",
  "-i", capExportPath,
  "-vf", `trim=start_frame=0:end_frame=${frameCount},setpts=PTS-STARTPTS,scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:color=black`,
  "-an", "-r", "60",
  "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  publicVideoPath,
]);
run(ffmpeg, ["-v", "error", "-i", publicVideoPath, "-f", "null", "-"]);
const media = probe(publicVideoPath);
const videoStream = media.streams.find((stream) => stream.codec_type === "video");
if (videoStream?.width !== 960 || videoStream?.height !== 540 || videoStream?.r_frame_rate !== "60/1" || Number(videoStream?.nb_read_frames) !== frameCount || media.streams.some((stream) => stream.codec_type === "audio")) {
  throw new Error(`cap-native-${shotSlug}-output-invalid:${JSON.stringify(media)}`);
}
const black = spawnSync(ffmpeg, ["-hide_banner", "-i", publicVideoPath, "-vf", "blackdetect=d=0.04:pix_th=0.02", "-an", "-f", "null", "-"], {encoding: "utf8"});
if (black.status !== 0 || `${black.stdout}\n${black.stderr}`.includes("black_start:")) throw new Error(`cap-native-${shotSlug}-black-frame`);

const bindingFrames = capture.narrationBinding.bindings.map((binding) => ({
  ...binding,
  frame: Math.min(finalFrame, Math.max(0, Math.round(binding.eventTimeMs / 1000 * 60))),
}));
const frameFiles = [];
for (const binding of bindingFrames) {
  const file = path.join(workRoot, `${binding.event}.png`);
  run(ffmpeg, ["-v", "error", "-y", "-i", publicVideoPath, "-vf", `select=eq(n\\,${binding.frame})`, "-vsync", "0", "-frames:v", "1", file]);
  const publicFile = path.join(studioPublicRoot, family, `${shotSlug}-cue-${binding.cueId}-${binding.event}.png`);
  const rendererFile = path.join(rendererPublicRoot, family, path.basename(publicFile));
  fs.copyFileSync(file, publicFile);
  fs.mkdirSync(path.dirname(rendererFile), {recursive: true});
  fs.copyFileSync(file, rendererFile);
  frameFiles.push({...binding, file, publicFile, publicUrl: `/${family}/${path.basename(publicFile)}`, sha256: sha256(file)});
}
const thumbs = await Promise.all(frameFiles.map((item) => sharp(item.file).resize(640, 360, {fit: "cover"}).png().toBuffer()));
await sharp({create: {width: 1920, height: 360, channels: 3, background: "#111617"}})
  .composite(thumbs.map((input, index) => ({input, left: index * 640, top: 0})))
  .png()
  .toFile(publicContactPath);

const rendererVideoPath = path.join(rendererPublicRoot, family, path.basename(publicVideoPath));
const rendererContactPath = path.join(rendererPublicRoot, family, path.basename(publicContactPath));
fs.mkdirSync(path.dirname(rendererVideoPath), {recursive: true});
fs.copyFileSync(publicVideoPath, rendererVideoPath);
fs.copyFileSync(publicContactPath, rendererContactPath);

const configPath = path.join(projectPath, "project-config.json");
const cursorPath = path.join(projectPath, "content/segments/segment-0/cursor.json");
const report = {
  contract: "A1CapNativeShotCandidate/v1",
  status: "READY_FOR_USER_SHOT_REVIEW",
  shotId: targetShotId,
  sourceActionId: shotSpec.actionId,
  sourceText: capture.narrationBinding.sourceText,
  narrationBinding: capture.narrationBinding,
  semanticProof: capture.semanticProof || null,
  capProject: {
    path: path.relative(root, projectPath),
    projectConfigSha256: sha256(configPath),
    cursorTrackSha256: sha256(cursorPath),
    renderer: "CAP_0_5_9_NATIVE_ZOOM_SPRING_CURSOR_EXPORTER",
    a1CameraApplied: false,
  },
  output: {
    path: path.relative(root, publicVideoPath),
    publicUrl: `/${family}/${path.basename(publicVideoPath)}`,
    sha256: sha256(publicVideoPath),
    width: 960,
    height: 540,
    fps: 60,
    frameCount,
    frameCalibratedDurationSeconds: frameCount / 60,
    audioStreamCount: 0,
    fullDecodePass: true,
    blackInterruptions: false,
  },
  contactSheet: {
    path: path.relative(root, publicContactPath),
    publicUrl: `/${family}/${path.basename(publicContactPath)}`,
    sha256: sha256(publicContactPath),
    frames: frameFiles.map(({file, publicFile, ...item}) => ({...item, path: path.relative(root, publicFile)})),
  },
  boundaries: {
    candidateOnly: true,
    productionWorkspaceMutation: false,
    currentPhaseMutation: false,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
  },
};
const bytes = `${JSON.stringify(report, null, 2)}\n`;
fs.writeFileSync(publicReportPath, bytes);
fs.mkdirSync(path.dirname(artifactReportPath), {recursive: true});
fs.writeFileSync(artifactReportPath, bytes);
console.log(JSON.stringify(report, null, 2));
