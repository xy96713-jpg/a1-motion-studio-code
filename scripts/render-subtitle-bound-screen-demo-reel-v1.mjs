#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const directorPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json");
const outputRoot = path.join(root, "work/current-screen-demo-smooth-cursor-v1");
const outputPath = path.join(outputRoot, "smooth-camera-cursor-screen-demo-ed02-ed03-ed27-960x540.mp4");
const comparisonPath = path.join(outputRoot, "camera-only-vs-independent-cursor-comparison.mp4");
const priorOutputPath = path.join(root, "work/current-screen-demo-smooth-camera-v1/smooth-camera-screen-demo-ed02-ed03-ed27-960x540.mp4");
const contactPath = path.join(outputRoot, "smooth-camera-cursor-contact-sheet.png");
const propsPath = path.join(outputRoot, "render-props.json");
const manifestPath = path.join(outputRoot, "manifest.json");
const srtPath = "/Users/a1/Documents/Codex/声音/outputs/subtitles_july1/july1_full_voice_bright_natural_corrected.srt";
const audioUri = "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav";
const audioPath = path.join(publicRoot, audioUri);
const fps = 30;
const width = 960;
const height = 540;

const performanceSpecs = {
  "ED-02": {
    sourceAssetId: "source-documentary-selection-action",
    sourceActionId: "causalRewrite",
    sourceStartMs: 900,
    sourceEndMs: 3067,
    focus: {x: 0.5, y: 0.5, scale: 1},
    cameraTrack: [
      {atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
      {atMs: 180, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in"},
      {atMs: 720, x: 0.56, y: 0.51, scale: 1.24, easingToNext: "hold"},
      {atMs: 1370, x: 0.56, y: 0.51, scale: 1.24, easingToNext: "glide"},
      {atMs: 1700, x: 0.585, y: 0.505, scale: 1.27, easingToNext: "restore"},
      {atMs: 2167, x: 0.5, y: 0.5, scale: 1.02, easingToNext: "hold"},
    ],
    cursorTrack: [
      {atMs: 0, x: 0.43, y: 0.55, easingToNext: "curved", bend: -0.18},
      {atMs: 520, x: 0.53, y: 0.54, easingToNext: "hold"},
      {atMs: 1100, x: 0.53, y: 0.54, easingToNext: "curved", bend: 0.2},
      {atMs: 1600, x: 0.59, y: 0.53, easingToNext: "hold"},
      {atMs: 1900, x: 0.59, y: 0.53, easingToNext: "curved", bend: -0.12},
      {atMs: 2167, x: 0.52, y: 0.52, easingToNext: "hold"},
    ],
    cursorClicks: [{atMs: 1600, x: 0.59, y: 0.53, kind: "click"}],
    cursorBinding: {mode: "DOM_REGION_RECONSTRUCTED", sourceContract: "A1InteractionTrace/v1", sourceSha256: "507fcbfdc0f85d824a555cf6afe726d915884915a8aa26fb9e8b8e50137064a4"},
  },
  "ED-03": {
    sourceAssetId: "source-documentary-preference-action",
    sourceActionId: "preference",
    sourceStartMs: 0,
    sourceEndMs: 4120,
    focus: {x: 0.5, y: 0.5, scale: 1},
    cameraTrack: [
      {atMs: 0, x: 0.5, y: 0.5, scale: 1.02, easingToNext: "cinematic-in"},
      {atMs: 430, x: 0.56, y: 0.49, scale: 1.23, easingToNext: "hold"},
      {atMs: 1320, x: 0.56, y: 0.49, scale: 1.23, easingToNext: "restore"},
      {atMs: 1736, x: 0.5, y: 0.5, scale: 1.04, easingToNext: "cinematic-in"},
      {atMs: 2260, x: 0.56, y: 0.49, scale: 1.24, easingToNext: "hold"},
      {atMs: 3460, x: 0.56, y: 0.49, scale: 1.24, easingToNext: "restore"},
      {atMs: 3946, x: 0.5, y: 0.5, scale: 1.03, easingToNext: "cinematic-in"},
      {atMs: 4460, x: 0.56, y: 0.28, scale: 1.16, easingToNext: "hold"},
      {atMs: 5550, x: 0.56, y: 0.28, scale: 1.16, easingToNext: "restore"},
      {atMs: 6040, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    ],
    sourceSegments: [
      {kind: "video", outputStartMs: 0, outputEndMs: 1736, sourceStartMs: 2200, sourceEndMs: 4120},
      {kind: "video", outputStartMs: 1736, outputEndMs: 3946, sourceStartMs: 650, sourceEndMs: 2350},
      {kind: "still", outputStartMs: 3946, outputEndMs: 6040, sourceStillUri: "/generated/system-line/editorial-asset-workbench-v1/source-cache/writing-workbench-semantic-evidence-v1/preference-intercept-03-style-proof.png", sourceStillSha256: "ae3ffc8286adf63459affd6fc17556535b1fc81211af185dc1bbdc1abbb5420b"},
    ],
    cursorTrack: [
      {atMs: 0, x: 0.46, y: 0.54, easingToNext: "curved", bend: -0.16},
      {atMs: 620, x: 0.59, y: 0.52, easingToNext: "hold"},
      {atMs: 1300, x: 0.59, y: 0.52, easingToNext: "curved", bend: 0.2},
      {atMs: 1900, x: 0.46, y: 0.52, easingToNext: "curved", bend: -0.18},
      {atMs: 2550, x: 0.59, y: 0.52, easingToNext: "hold"},
      {atMs: 3460, x: 0.59, y: 0.52, easingToNext: "curved", bend: 0.22},
      {atMs: 4200, x: 0.64, y: 0.3, easingToNext: "curved", bend: -0.18},
      {atMs: 4800, x: 0.66, y: 0.25, easingToNext: "hold"},
      {atMs: 5550, x: 0.66, y: 0.25, easingToNext: "curved", bend: 0.12},
      {atMs: 6040, x: 0.62, y: 0.28, easingToNext: "hold"},
    ],
    cursorClicks: [
      {atMs: 760, x: 0.59, y: 0.52, kind: "click"},
      {atMs: 2680, x: 0.59, y: 0.52, kind: "click"},
      {atMs: 4860, x: 0.66, y: 0.25, kind: "click"},
    ],
    cursorBinding: {mode: "DOM_REGION_RECONSTRUCTED", sourceContract: "A1RealWritingWorkbenchActionPack/v1", sourceSha256: "296845c3e88b7dd305e4803cd25ab426b6d902472477bf37d3982362fef17438"},
  },
  "ED-27": {
    sourceAssetId: "source-documentary-paragraph-action",
    sourceActionId: "paragraph",
    sourceStartMs: 350,
    sourceEndMs: 3550,
    focus: {x: 0.5, y: 0.5, scale: 1},
    sourceSegments: [
      {kind: "still", outputStartMs: 0, outputEndMs: 4630, sourceStillUri: "/generated/system-line/editorial-asset-workbench-v1/source-cache/writing-workbench-action-pack-v1/paragraph-01-slot.png", sourceStillSha256: "f3acc7523b4cebc73f398e62af90de8cd46664b217f55ad3b5f0ff2e4ab65a68"},
      {kind: "video", outputStartMs: 4630, outputEndMs: 7380, sourceStartMs: 800, sourceEndMs: 3550},
      {kind: "still", outputStartMs: 7380, outputEndMs: 13160, sourceStillUri: "/generated/system-line/editorial-asset-workbench-v1/source-cache/writing-workbench-action-pack-v1/paragraph-02-request.png", sourceStillSha256: "0abe52dd8d7d456bab1f276f924af675dd62fc696f2a5621a2b9b85ce1245fb8"},
    ],
    cameraTrack: [
      {atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
      {atMs: 760, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in"},
      {atMs: 1700, x: 0.48, y: 0.47, scale: 1.19, easingToNext: "hold"},
      {atMs: 4250, x: 0.48, y: 0.47, scale: 1.19, easingToNext: "glide"},
      {atMs: 5350, x: 0.455, y: 0.45, scale: 1.33, easingToNext: "hold"},
      {atMs: 9300, x: 0.455, y: 0.45, scale: 1.33, easingToNext: "glide"},
      {atMs: 10200, x: 0.5, y: 0.43, scale: 1.27, easingToNext: "hold"},
      {atMs: 11600, x: 0.5, y: 0.43, scale: 1.27, easingToNext: "restore"},
      {atMs: 13160, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    ],
    cursorTrack: [
      {atMs: 0, x: 0.4, y: 0.51, easingToNext: "curved", bend: -0.14},
      {atMs: 1200, x: 0.4365, y: 0.4963, easingToNext: "hold"},
      {atMs: 4300, x: 0.4365, y: 0.4963, easingToNext: "curved", bend: 0.16},
      {atMs: 5000, x: 0.455, y: 0.485, easingToNext: "hold"},
      {atMs: 6100, x: 0.455, y: 0.485, easingToNext: "curved", bend: -0.2},
      {atMs: 7100, x: 0.56, y: 0.49, easingToNext: "hold"},
      {atMs: 9300, x: 0.56, y: 0.49, easingToNext: "curved", bend: 0.14},
      {atMs: 10200, x: 0.53, y: 0.46, easingToNext: "hold"},
      {atMs: 11600, x: 0.53, y: 0.46, easingToNext: "curved", bend: -0.12},
      {atMs: 13160, x: 0.5, y: 0.5, easingToNext: "hold"},
    ],
    cursorClicks: [{atMs: 5000, x: 0.455, y: 0.485, kind: "click"}],
    cursorBinding: {mode: "DOM_REGION_RECONSTRUCTED", sourceContract: "A1RealWritingWorkbenchActionPack/v1", sourceSha256: "296845c3e88b7dd305e4803cd25ab426b6d902472477bf37d3982362fef17438"},
  },
};

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const srtTime = (value) => {
  const [hours, minutes, rest] = value.split(":");
  const [seconds, millis] = rest.split(",");
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(millis);
};

const parseSrt = (text) => text.trim().split(/\n\s*\n/u).map((block) => {
  const [idLine, timing, ...textLines] = block.split(/\r?\n/u);
  const [start, end] = timing.split(" --> ");
  return {id: Number(idLine), startMs: srtTime(start), endMs: srtTime(end), text: textLines.join(" ").trim()};
});

async function main() {
  fs.mkdirSync(outputRoot, {recursive: true});
  const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
  const director = JSON.parse(fs.readFileSync(directorPath, "utf8"));
  const cues = parseSrt(fs.readFileSync(srtPath, "utf8"));
  const assets = new Map((workspace.library?.assets || []).map((asset) => [asset.id, asset]));
  const sourceShots = Object.keys(performanceSpecs).map((shotId) => {
    const shot = director.plan.shots.find((item) => item.shotId === shotId);
    const spec = performanceSpecs[shotId];
    const sourceAsset = assets.get(spec.sourceAssetId);
    if (!shot) throw new Error(`subtitle-bound-shot-missing:${shotId}`);
    if (!sourceAsset?.videoEvidence?.publicUrl || !sourceAsset.videoEvidence.sha256) throw new Error(`subtitle-bound-source-missing:${shotId}:${spec.sourceAssetId}`);
    const sourcePath = path.join(publicRoot, sourceAsset.videoEvidence.publicUrl.replace(/^\//u, ""));
    if (!fs.existsSync(sourcePath)) throw new Error(`subtitle-bound-source-file-missing:${shotId}`);
    if (sha256File(sourcePath) !== sourceAsset.videoEvidence.sha256) throw new Error(`subtitle-bound-source-sha-mismatch:${shotId}`);
    const cursorSourcePath = spec.cursorBinding?.sourceContract === "A1InteractionTrace/v1"
      ? path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02/interaction-trace.json")
      : path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/source-cache/writing-workbench-action-pack-v1/report.json");
    if (!spec.cursorBinding || !fs.existsSync(cursorSourcePath)) throw new Error(`subtitle-bound-cursor-source-missing:${shotId}`);
    if (sha256File(cursorSourcePath) !== spec.cursorBinding.sourceSha256) throw new Error(`subtitle-bound-cursor-source-sha-mismatch:${shotId}`);
    for (const segment of spec.sourceSegments || []) {
      if (segment.kind !== "still") continue;
      const stillPath = path.join(publicRoot, segment.sourceStillUri.replace(/^\//u, ""));
      if (!fs.existsSync(stillPath)) throw new Error(`subtitle-bound-support-still-missing:${shotId}`);
      if (sha256File(stillPath) !== segment.sourceStillSha256) throw new Error(`subtitle-bound-support-still-sha-mismatch:${shotId}`);
    }
    const shotCues = shot.cueIds.map((cueId) => cues.find((cue) => cue.id === cueId)).filter(Boolean).map((cue) => ({
      id: cue.id,
      text: cue.text,
      startMs: cue.startMs - shot.editWindow.startMs,
      endMs: cue.endMs - shot.editWindow.startMs,
    }));
    if (shotCues.length !== shot.cueIds.length) throw new Error(`subtitle-bound-cues-missing:${shotId}`);
    if (shotCues.some((cue) => cue.startMs < 0 || cue.endMs > shot.editWindow.durationMs)) throw new Error(`subtitle-bound-cue-window-invalid:${shotId}`);
    const segmentPlaybackRates = (spec.sourceSegments || [])
      .filter((segment) => segment.kind === "video")
      .map((segment) => (segment.sourceEndMs - segment.sourceStartMs) / (segment.outputEndMs - segment.outputStartMs));
    return {
      shotId,
      timelineStartMs: shot.editWindow.startMs,
      timelineEndMs: shot.editWindow.endMs,
      durationMs: shot.editWindow.durationMs,
      sourceVideoUri: sourceAsset.videoEvidence.publicUrl,
      sourceVideoSha256: sourceAsset.videoEvidence.sha256,
      sourceAssetId: spec.sourceAssetId,
      sourceActionId: spec.sourceActionId,
      sourceStartMs: spec.sourceStartMs,
      sourceEndMs: spec.sourceEndMs,
      playbackRate: segmentPlaybackRates.length > 0
        ? Math.min(...segmentPlaybackRates)
        : (spec.sourceEndMs - spec.sourceStartMs) / shot.editWindow.durationMs,
      sourceSegments: spec.sourceSegments || null,
      focus: spec.focus,
      cameraTrack: spec.cameraTrack || null,
      cursorTrack: spec.cursorTrack || null,
      cursorClicks: spec.cursorClicks || [],
      cursorBinding: spec.cursorBinding || null,
      cues: shotCues,
    };
  });
  const props = {contract: "A1SubtitleBoundScreenDemoReel/v1", audioUri, width, height, fps, scenes: sourceShots.map(({sourceVideoSha256, sourceAssetId, playbackRate, ...scene}) => scene)};
  const totalFrames = sourceShots.reduce((sum, scene) => sum + Math.round((scene.durationMs / 1000) * fps), 0);
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);

  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const samples = [
    {shotId: "ED-02", label: "selection-and-rewrite-entry", localMs: 1500},
    {shotId: "ED-03", label: "positive-preference", localMs: 1000},
    {shotId: "ED-03", label: "negative-preference", localMs: 2900},
    {shotId: "ED-03", label: "style-library-result", localMs: 5000},
    {shotId: "ED-27", label: "paragraph-gap", localMs: 2200},
    {shotId: "ED-27", label: "paragraph-request-entry", localMs: 7600},
    {shotId: "ED-27", label: "paragraph-request-complete", localMs: 11600},
  ];
  const frameFiles = [];
  try {
    const composition = await selectComposition({serveUrl, id: "A1SubtitleBoundScreenDemoReelV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    if (composition.durationInFrames !== totalFrames) throw new Error(`subtitle-bound-duration-drift:${composition.durationInFrames}:${totalFrames}`);
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputPath, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: false, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const starts = new Map();
    let cursor = 0;
    for (const scene of sourceShots) {
      starts.set(scene.shotId, cursor);
      cursor += Math.round((scene.durationMs / 1000) * fps);
    }
    for (const sample of samples) {
      const frame = Math.min(totalFrames - 1, starts.get(sample.shotId) + Math.round((sample.localMs / 1000) * fps));
      const file = path.join(outputRoot, `${sample.shotId.toLowerCase()}-${sample.label}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      frameFiles.push({...sample, frame, file: path.basename(file), sha256: sha256File(file)});
    }
  } finally {
    await browser.close({silent: true});
  }

  if (!fs.existsSync(priorOutputPath)) throw new Error("smooth-camera-prior-proof-missing");
  const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
  const {execFileSync} = await import("node:child_process");
  execFileSync(ffmpegPath, ["-y", "-i", priorOutputPath, "-i", outputPath, "-filter_complex", "[0:v]scale=960:540[left];[1:v]scale=960:540[right];[left][right]hstack=inputs=2[v]", "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", comparisonPath], {stdio: "pipe"});

  const thumbs = await Promise.all(frameFiles.map((item) => sharp(path.join(outputRoot, item.file)).resize(480, 270, {fit: "cover"}).png().toBuffer()));
  await sharp({create: {width: 1920, height: 540, channels: 3, background: "#080a0b"}})
    .composite(thumbs.map((input, index) => ({input, left: (index % 4) * 480, top: Math.floor(index / 4) * 270})))
    .png().toFile(contactPath);

  const manifest = {
    contract: "A1SubtitleBoundScreenDemoReelManifest/v1",
    status: "PROOF_ONLY_READY_FOR_ACTUAL_PIXEL_REVIEW",
    timingAuthority: {kind: "corrected-srt-edit-windows", srtPath, srtSha256: sha256File(srtPath), directorInputSha256: sha256File(directorPath)},
    audio: {uri: audioUri, sha256: sha256File(audioPath), sourceTimelinePreserved: true},
    scenes: sourceShots,
    output: {path: path.relative(root, outputPath), sha256: sha256File(outputPath), width, height, fps, durationInFrames: totalFrames, durationMs: Math.round((totalFrames / fps) * 1000)},
    comparison: {left: "waypoint-dead-zone-cinematic-v1", right: "independent-dom-bound-cursor-v1", path: path.relative(root, comparisonPath), sha256: sha256File(comparisonPath)},
    cursorSystem: {contract: "A1IndependentCursorTrack/v1", model: "CURVED_DOM_BOUND_WAYPOINTS", cursorLayerIndependent: true, sourceMayContainOriginalPointer: true, capturedEventClaimsAllowedOnlyWhenModeIsCaptured: true},
    contactSheet: {path: path.relative(root, contactPath), sha256: sha256File(contactPath), samples: frameFiles},
    sourceWorkspaceSha256: workspace.workspaceSha256,
    planSha256: sha256Value({sourceWorkspaceSha256: workspace.workspaceSha256, sourceShots}),
    boundary: {proofOnly: true, reviewOnly: true, productionAdmission: false, userVisualApproval: "NOT_APPROVED", currentBoardMutationPerformed: false, currentPhaseMutationPerformed: false, motionAdmissionPerformed: false},
    renderedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({status: manifest.status, output: manifest.output, contactSheet: manifest.contactSheet, scenes: manifest.scenes.map(({shotId, durationMs, sourceActionId, playbackRate, cues}) => ({shotId, durationMs, sourceActionId, playbackRate, cueIds: cues.map((cue) => cue.id)})), boundary: manifest.boundary}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
