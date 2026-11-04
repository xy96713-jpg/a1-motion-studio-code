import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import {buildEditorialDocumentaryPlan} from "../lib/h-series-editorial-documentary-plan-v1.js";

const require = createRequire(import.meta.url);
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const root = process.cwd();
const sourcePropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const captureReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-documentary-reset-v1/source/report.json");
const sourceAudioPath = process.env.A1_JULY1_AUDIO_PATH || "/Users/a1/Documents/Codex/声音/outputs/voice_clone_july1/july1_full_16k_mono.wav";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-documentary-reset-v1");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/editorial-documentary-reset-v1");
const rendererPublicDir = path.join(root, "remotion-renderer/public/editorial-documentary-reset-v1");
const propsPath = path.join(root, "remotion-renderer/src/generated/editorialDocumentaryPilotProps.json");

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const sha256Buffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sha256File = async (filePath) => sha256Buffer(await fs.readFile(filePath));
const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

async function main() {
  const [sourceProps, captureReport] = await Promise.all([readJson(sourcePropsPath), readJson(captureReportPath)]);
  if (captureReport.status !== "PASS") throw new Error("Real writing-workbench source capture is not ready");
  const plan = buildEditorialDocumentaryPlan(sourceProps.scenes || []);
  if (plan.status !== "READY_FOR_PILOT_REVIEW") throw new Error(`Editorial documentary plan blocked: ${JSON.stringify(plan.audit)}`);

  const pilotBeatIds = ["H01-B01", "H01-B02", "H01-B03", "H01-B04", "H01-B05", "H01-B06", "H02-B01", "H02-B02", "H02-B03", "H02-B04"];
  const pilotScenes = pilotBeatIds.map((beatId) => sourceProps.scenes.find((scene) => scene.beatId === beatId));
  if (pilotScenes.some((scene) => !scene)) throw new Error("Pilot beat mapping is incomplete");
  const durationMs = Math.max(...pilotScenes.map((scene) => scene.sourceEndMs));
  const fps = 30;
  const durationInFrames = Math.ceil(durationMs / 1000 * fps);

  const audioDir = path.join(rendererPublicDir, "audio");
  const audioPath = path.join(audioDir, "july1-opening-43s.wav");
  await fs.mkdir(audioDir, {recursive: true});
  const ffmpeg = spawnSync(ffmpegPath, [
    "-y", "-i", sourceAudioPath, "-t", (durationMs / 1000).toFixed(3), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath,
  ], {encoding: "utf8"});
  if (ffmpeg.status !== 0) throw new Error(`Audio extraction failed: ${ffmpeg.stderr}`);

  const captures = Object.fromEntries(captureReport.captures.map((capture) => [capture.id, `editorial-documentary-reset-v1/source/${capture.file}`]));
  const props = {
    contract: "A1EditorialDocumentaryPilot/v1",
    projectId: sourceProps.projectId,
    fps,
    width: 1920,
    height: 1080,
    durationInFrames,
    reviewOnly: true,
    currentAuthorityMutated: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    planContract: plan.contract,
    audioSrc: "editorial-documentary-reset-v1/audio/july1-opening-43s.wav",
    captures,
    beats: pilotScenes.map((scene) => ({
      beatId: scene.beatId,
      macroId: scene.macroId,
      startFrame: Math.round(scene.sourceStartMs / 1000 * fps),
      durationInFrames: Math.max(1, Math.round((scene.sourceEndMs - scene.sourceStartMs) / 1000 * fps)),
      sourceStartMs: scene.sourceStartMs,
      sourceEndMs: scene.sourceEndMs,
      screenText: scene.screenText,
      recordingReplaceable: scene.recordingReplaceable,
    })),
  };

  await writeJson(propsPath, props);
  const propsSha256 = await sha256File(propsPath);
  const sourcePropsSha256 = await sha256File(sourcePropsPath);
  const audioSha256 = await sha256File(audioPath);
  const planWithBinding = {
    ...plan,
    sourceBinding: {
      sourcePropsPath: path.relative(root, sourcePropsPath),
      sourcePropsSha256,
      sourceAudioPath,
      sourceAudioSha256: await sha256File(sourceAudioPath),
      realWorkbenchCaptureContract: captureReport.contract,
      realWorkbenchCaptureCount: captureReport.captures.length,
    },
    pilot: {
      beatIds: pilotBeatIds,
      durationMs,
      durationInFrames,
      propsPath: path.relative(root, propsPath),
      propsSha256,
      audioPath: path.relative(root, audioPath),
      audioSha256,
    },
  };

  const report = {
    contract: "A1EditorialDocumentaryResetReport/v1",
    status: "READY_TO_RENDER_PILOT",
    reviewOnly: true,
    currentAuthorityMutated: false,
    currentPropsUnchanged: true,
    rendererAdoptionAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    visualThesis: plan.visualThesis,
    sourceBinding: planWithBinding.sourceBinding,
    summary: {
      sourceBeatCount: plan.audit.sourceBeatCount,
      continuousSceneCount: plan.groups.length,
      pilotBeatCount: pilotBeatIds.length,
      pilotDurationSec: durationMs / 1000,
      realWorkbenchCaptureCount: captureReport.captures.length,
      generatedArtworkCount: 0,
      currentPropsUnchanged: true,
    },
    pilot: {
      propsSha256,
      video: {publicUrl: "/generated/system-line/editorial-documentary-reset-v1/editorial-documentary-pilot.mp4", status: "pending-render"},
      poster: {publicUrl: "/generated/system-line/editorial-documentary-reset-v1/editorial-documentary-poster.png", status: "pending-render"},
      contactSheet: {publicUrl: "/generated/system-line/editorial-documentary-reset-v1/editorial-documentary-contact-sheet.png", status: "pending-render"},
    },
    allocation: plan.visualAllocation,
    groups: plan.groups,
    checks: {
      everySourceBeatMappedExactlyOnce: plan.audit.everyBeatMappedExactlyOnce,
      realRuntimeCaptured: captureReport.checks.realRuntimeUsed,
      sourceCaptureMutationBlocked: captureReport.checks.documentMutationAllowed === false,
      generatedArtworkUsedInPilot: false,
      currentFilmMutated: false,
    },
    failures: [],
    nextAction: "render-and-direct-review-editorial-documentary-pilot-before-any-full-film-adoption",
  };

  await Promise.all([
    writeJson(path.join(artifactDir, "plan.json"), planWithBinding),
    writeJson(path.join(publicDir, "plan.json"), planWithBinding),
    writeJson(path.join(artifactDir, "report.json"), report),
    writeJson(path.join(publicDir, "report.json"), report),
  ]);

  console.log(JSON.stringify({status: report.status, propsPath: path.relative(root, propsPath), propsSha256, durationInFrames, continuousSceneCount: plan.groups.length, pilotBeatCount: pilotBeatIds.length}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
