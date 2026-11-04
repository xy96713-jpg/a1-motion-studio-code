#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderScriptPath = fileURLToPath(import.meta.url);
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicRoot = path.join(rendererRoot, "public");
const projectPublicRoot = path.join(root, "apps/studio-next/public");
const plansPath = path.join(projectPublicRoot, "generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/shot-performance-plans.json");
const requestedShotIds = String(process.env.A1_SCREEN_EVIDENCE_SHOT_IDS || "")
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);
const scope = requestedShotIds.length > 0
  ? "event-canary"
  : process.env.A1_SCREEN_EVIDENCE_SCOPE === "all" ? "all" : "opening-five";
const outputFamily = scope === "all"
  ? "all-sixteen-shot-v2"
  : scope === "event-canary" ? "event-directed-canary-v1" : "opening-five-shot-v2";
const outputStem = scope === "all"
  ? "all-sixteen-screen-actions"
  : scope === "event-canary" ? "event-directed-screen-actions" : "opening-five-screen-actions";
const outputRoot = path.join(projectPublicRoot, `generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/${outputFamily}`);
const outputPath = path.join(outputRoot, `${outputStem}-960x540.mp4`);
const propsPath = path.join(outputRoot, "render-props.json");
const manifestPath = path.join(outputRoot, "manifest.json");
const contactPath = path.join(outputRoot, `${outputStem}-contact.png`);
const reelSourcePath = path.join(rendererRoot, "src/ContinuousScreenEvidenceReelV2.tsx");
const rootSourcePath = path.join(rendererRoot, "src/Root.tsx");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const ffprobePath = path.join(root, "node_modules/@ffprobe-installer/darwin-arm64/ffprobe");
const openingShotIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"];
const width = 960;
const height = 540;
const fps = 60;
const audioUri = "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav";
const audioPath = path.join(rendererPublicRoot, audioUri);

const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const atomicWriteJson = (filePath, value) => {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};
const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
if (plans.status !== "PASS") throw new Error("continuous-screen-shot-plans-not-pass");
const shotIds = scope === "all" ? plans.screenEvidenceShotIds : scope === "event-canary" ? requestedShotIds : openingShotIds;
if (new Set(shotIds).size !== shotIds.length) throw new Error("continuous-screen-render-duplicate-shot-id");

const selected = shotIds.map((shotId) => {
  const shot = plans.shots.find((item) => item.shotId === shotId);
  if (!shot || shot.status !== "PASS") throw new Error(`continuous-screen-shot-not-pass:${shotId}`);
  return shot;
});
for (const shot of selected) {
  const sourceFile = path.join(rendererPublicRoot, shot.sourceVideoUri.replace(/^\//u, ""));
  if (!fs.existsSync(sourceFile)) throw new Error(`continuous-screen-render-source-missing:${shot.shotId}`);
  if (sha256File(sourceFile) !== shot.sourceVideoSha256) throw new Error(`continuous-screen-render-source-sha-mismatch:${shot.shotId}`);
  for (const segment of shot.sourceSegments.filter((item) => item.kind === "still")) {
    const stillFile = path.join(rendererPublicRoot, segment.sourceStillUri.replace(/^\//u, ""));
    if (!fs.existsSync(stillFile) || sha256File(stillFile) !== segment.sourceStillSha256) {
      throw new Error(`continuous-screen-render-still-invalid:${shot.shotId}:${segment.evidenceRole}`);
    }
  }
}

// Browser screenshots are valid evidence but are not guaranteed to be the
// exact encoded pixel that precedes a result hold. Materialize every
// video-to-still result hold from the terminal frame of its own verified
// source segment so the hold cannot flash or jump backwards.
const freezePublicRelativeRoot = `generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/${outputFamily}/terminal-freezes`;
const selectedForRender = selected.map((shot) => {
  const sourceFile = path.join(rendererPublicRoot, shot.sourceVideoUri.replace(/^\//u, ""));
  const sourceSegments = shot.sourceSegments.map((segment, index, segments) => {
    const previous = segments[index - 1];
    if (segment.kind !== "still" || previous?.kind !== "video" || !/HOLD/u.test(String(segment.evidenceRole || ""))) return segment;
    const fileName = `${shot.shotId.toLowerCase()}-${String(segment.evidenceRole || "result-hold").toLowerCase()}.png`;
    const projectFreezePath = path.join(projectPublicRoot, freezePublicRelativeRoot, fileName);
    const rendererFreezePath = path.join(rendererPublicRoot, freezePublicRelativeRoot, fileName);
    fs.mkdirSync(path.dirname(projectFreezePath), {recursive: true});
    fs.mkdirSync(path.dirname(rendererFreezePath), {recursive: true});
    const sourceProbe = spawnSync(ffprobePath, [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=avg_frame_rate",
      "-of", "json", sourceFile,
    ], {encoding: "utf8"});
    if (sourceProbe.status !== 0) throw new Error(`continuous-screen-terminal-freeze-probe-failed:${shot.shotId}:${sourceProbe.stderr}`);
    const sourceRate = JSON.parse(sourceProbe.stdout).streams?.[0]?.avg_frame_rate || "25/1";
    const [rateNumerator, rateDenominator] = sourceRate.split("/").map(Number);
    const sourceFps = rateNumerator > 0 && rateDenominator > 0 ? rateNumerator / rateDenominator : 25;
    const terminalFrameSeconds = Math.max(0, Number(previous.sourceEndMs || 0) / 1000 - 1 / sourceFps - .001);
    const extract = spawnSync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", sourceFile,
      "-ss", terminalFrameSeconds.toFixed(6),
      "-frames:v", "1",
      projectFreezePath,
    ], {encoding: "utf8"});
    if (extract.status !== 0 || !fs.existsSync(projectFreezePath)) throw new Error(`continuous-screen-terminal-freeze-failed:${shot.shotId}:${extract.stderr}`);
    fs.copyFileSync(projectFreezePath, rendererFreezePath);
    const terminalSha256 = sha256File(projectFreezePath);
    return {
      ...segment,
      sourceStillUri: `/${freezePublicRelativeRoot}/${fileName}`,
      sourceStillSha256: terminalSha256,
      holdPixelSource: "PREVIOUS_VERIFIED_VIDEO_TERMINAL_FRAME",
      replacedEvidenceStillUri: segment.sourceStillUri,
      replacedEvidenceStillSha256: segment.sourceStillSha256,
    };
  });
  return {...shot, sourceSegments};
});

const props = {
  contract: "A1ContinuousScreenEvidenceReel/v2",
  width,
  height,
  fps,
  audioUri,
  clickSoundUri: "generated/system-line/ui-sfx/click-soft.wav",
  boundaryTransitionFrames: 18,
  showReviewLabels: false,
  scenes: selectedForRender.map((shot) => ({
    shotId: shot.shotId,
    timelineStartMs: shot.timelineStartMs,
    timelineEndMs: shot.timelineEndMs,
    durationMs: shot.durationMs,
    sourceActionId: shot.sourceActionId,
    sourceVideoUri: shot.sourceVideoUri,
    sourceSegments: shot.sourceSegments,
    screenDirection: shot.screenDirection,
    pointerTrack: shot.pointerTrack,
    cameraTrack: shot.cameraTrack,
    editCoverage: shot.editCoverage,
  })),
};
const totalFrames = selected.reduce((total, shot) => total + Math.round((shot.durationMs / 1000) * fps), 0);
fs.mkdirSync(outputRoot, {recursive: true});
const recoveredStagingDirectories = fs.readdirSync(outputRoot, {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(".staging-"))
  .map((entry) => path.join(outputRoot, entry.name));
for (const stalePath of recoveredStagingDirectories) fs.rmSync(stalePath, {recursive: true, force: true});

const recipeInputs = {
  contract: "A1ContinuousScreenEvidenceRenderRecipe/v2",
  scope,
  props,
  sourceMediaSha256: selectedForRender.map((shot) => ({
    shotId: shot.shotId,
    sourceVideoSha256: shot.sourceVideoSha256,
    stills: shot.sourceSegments.filter((segment) => segment.kind === "still").map((segment) => ({
      sourceStillUri: segment.sourceStillUri,
      sourceStillSha256: segment.sourceStillSha256,
    })),
  })),
  reelSourceSha256: sha256File(reelSourcePath),
  rootSourceSha256: sha256File(rootSourcePath),
  renderScriptSha256: sha256File(renderScriptPath),
  audioSha256: sha256File(audioPath),
};
const sourcePlansSha256 = sha256File(plansPath);
const recipeSha256 = sha256Value(recipeInputs);
const resolveManifestArtifactPath = (artifactPath, fallbackRoot = root) => (
  path.isAbsolute(artifactPath) ? artifactPath : path.join(fallbackRoot, artifactPath)
);
const artifactMatches = (filePath, expectedSha256) => (
  Boolean(filePath && expectedSha256)
  && fs.existsSync(filePath)
  && sha256File(filePath) === expectedSha256
);
const manifestArtifactsMatch = (manifest) => {
  if (!manifest?.output || !manifest?.contactSheet || !Array.isArray(manifest.frames)) return false;
  const videoMatches = artifactMatches(resolveManifestArtifactPath(manifest.output.path), manifest.output.sha256);
  const contactMatches = artifactMatches(resolveManifestArtifactPath(manifest.contactSheet.path), manifest.contactSheet.sha256);
  const framesMatch = manifest.frames.every((frame) => artifactMatches(
    resolveManifestArtifactPath(frame.file, outputRoot),
    frame.sha256,
  ));
  return videoMatches && contactMatches && framesMatch;
};

let existingManifest = null;
if (fs.existsSync(manifestPath)) {
  try {
    existingManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    existingManifest = null;
  }
}
const existingManifestMatchesVerifiedArtifacts = Boolean(
  existingManifest?.contract === "A1ContinuousScreenEvidenceRender/v2"
  && existingManifest.scope === scope
  && JSON.stringify(existingManifest.shotIds) === JSON.stringify(shotIds)
  && existingManifest.output?.fullDecodePass === true
  && existingManifest.output?.blackInterruptions === false
  && existingManifest.cameraAudit?.status === "PASS"
  && existingManifest.boundary?.candidateOnly === true
  && existingManifest.boundary?.productionAdmission === false
  && existingManifest.boundary?.currentAuthorityMutated === false
  && existingManifest.boundary?.userVisualApproval === "NOT_APPROVED"
  && manifestArtifactsMatch(existingManifest)
);
const existingVisualRecipeMatches = Boolean(
  existingManifestMatchesVerifiedArtifacts
  && existingManifest.cache?.recipeInputs?.scope === scope
  && JSON.stringify(existingManifest.cache?.recipeInputs?.props) === JSON.stringify(props)
  && existingManifest.cache?.recipeInputs?.reelSourceSha256 === recipeInputs.reelSourceSha256
  && existingManifest.cache?.recipeInputs?.rootSourceSha256 === recipeInputs.rootSourceSha256
  && existingManifest.cache?.recipeInputs?.renderScriptSha256 === recipeInputs.renderScriptSha256
  && existingManifest.cache?.recipeInputs?.audioSha256 === recipeInputs.audioSha256
  && JSON.stringify(existingManifest.cache?.recipeInputs?.sourceMediaSha256) === JSON.stringify(recipeInputs.sourceMediaSha256)
);
const forceRender = process.env.A1_FORCE_RENDER === "1";
if (!forceRender && existingVisualRecipeMatches) {
  const metadataRebound = existingManifest.sourcePlansSha256 !== sourcePlansSha256
    || existingManifest.cache?.recipeSha256 !== recipeSha256;
  let admittedManifest = existingManifest;
  if (metadataRebound) {
    const reboundBase = {
      ...existingManifest,
      sourcePlansPath: path.relative(root, plansPath),
      sourcePlansSha256,
      cache: {
        contract: "A1ContinuousScreenEvidenceRenderCache/v2",
        recipeSha256,
        recipeInputs,
        lastResult: "REBOUND_METADATA_WITH_IDENTICAL_VISUAL_RECIPE",
        atomicAdmission: true,
        concurrencyLimit: 2,
      },
    };
    delete reboundBase.sha256;
    admittedManifest = {...reboundBase, sha256: sha256Value(reboundBase)};
    atomicWriteJson(propsPath, props);
    atomicWriteJson(manifestPath, admittedManifest);
  }
  console.log(JSON.stringify({
    status: admittedManifest.status,
    cacheHit: true,
    cacheSeeded: false,
    metadataRebound,
    recoveredStagingDirectoryCount: recoveredStagingDirectories.length,
    recipeSha256,
    outputPath: admittedManifest.output.path,
    outputSha256: admittedManifest.output.sha256,
    contactPath: admittedManifest.contactSheet.path,
    contactSha256: admittedManifest.contactSheet.sha256,
    userVisualApproval: admittedManifest.boundary.userVisualApproval,
  }, null, 2));
  process.exit(0);
}
if (!forceRender && existingManifestMatchesVerifiedArtifacts && !existingManifest.cache?.recipeSha256) {
  const seededBase = {
    ...existingManifest,
    cache: {
      contract: "A1ContinuousScreenEvidenceRenderCache/v2",
      recipeSha256,
      recipeInputs,
      lastResult: "SEEDED_FROM_CURRENT_VERIFIED_RENDER",
      atomicAdmission: true,
      concurrencyLimit: 2,
    },
  };
  delete seededBase.sha256;
  const seededManifest = {...seededBase, sha256: sha256Value(seededBase)};
  atomicWriteJson(propsPath, props);
  atomicWriteJson(manifestPath, seededManifest);
  console.log(JSON.stringify({
    status: seededManifest.status,
    cacheHit: true,
    cacheSeeded: true,
    recoveredStagingDirectoryCount: recoveredStagingDirectories.length,
    recipeSha256,
    outputPath: seededManifest.output.path,
    outputSha256: seededManifest.output.sha256,
    contactPath: seededManifest.contactSheet.path,
    contactSha256: seededManifest.contactSheet.sha256,
    userVisualApproval: seededManifest.boundary.userVisualApproval,
  }, null, 2));
  process.exit(0);
}

const stagingRoot = path.join(outputRoot, `.staging-${process.pid}-${Date.now()}`);
const stagingOutputPath = path.join(stagingRoot, path.basename(outputPath));
const stagingContactPath = path.join(stagingRoot, path.basename(contactPath));
fs.mkdirSync(stagingRoot, {recursive: true});
if (process.env.A1_SCREEN_EVIDENCE_INJECT_FAILURE_AFTER_STAGE_SETUP === "1") {
  throw new Error("continuous-screen-injected-failure-after-stage-setup");
}

const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({
  entryPoint: path.join(rendererRoot, "src/index.ts"),
  publicDir: rendererPublicRoot,
  rootDir: rendererRoot,
  enableCaching: true,
});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const renderedFrames = [];
try {
  const composition = await selectComposition({
    serveUrl,
    id: "A1ContinuousScreenEvidenceReelV2",
    inputProps: props,
    puppeteerInstance: browser,
    logLevel: "warn",
  });
  if (composition.durationInFrames !== totalFrames) {
    throw new Error(`continuous-screen-render-duration-drift:${composition.durationInFrames}:${totalFrames}`);
  }
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    outputLocation: stagingOutputPath,
    codec: "h264",
    crf: 18,
    imageFormat: "jpeg",
    concurrency: 2,
    muted: false,
    hardwareAcceleration: "disable",
    overwrite: true,
    puppeteerInstance: browser,
    logLevel: "warn",
  });
  let sceneStartFrame = 0;
  for (const scene of props.scenes) {
    const sceneFrames = Math.round((scene.durationMs / 1000) * fps);
    const capBindings = scene.screenDirection?.narrationActionTrack?.timingSource === "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING"
      ? scene.screenDirection.narrationActionTrack.capNativeBindings || []
      : [];
    const reviewMoments = capBindings.length
      ? [["focus", capBindings[0].eventTimeMs], ["result", capBindings.at(-1).eventTimeMs]]
      : [["focus", scene.durationMs * .36], ["result", scene.durationMs * .76]];
    for (const [label, atMs] of reviewMoments) {
      const frame = Math.min(totalFrames - 1, sceneStartFrame + Math.round((atMs / 1000) * fps));
      const file = path.join(stagingRoot, `${scene.shotId.toLowerCase()}-${label}.png`);
      await renderStill({
        serveUrl,
        composition,
        inputProps: props,
        frame,
        output: file,
        imageFormat: "png",
        overwrite: true,
        puppeteerInstance: browser,
        logLevel: "warn",
      });
      renderedFrames.push({shotId: scene.shotId, label, frame, file, sha256: sha256File(file)});
    }
    sceneStartFrame += sceneFrames;
  }
} finally {
  await browser.close({silent: true});
}

const probe = spawnSync(ffprobePath, [
  "-v", "error",
  "-show_entries", "format=duration:stream=codec_name,width,height,r_frame_rate",
  "-of", "json",
  stagingOutputPath,
], {encoding: "utf8"});
if (probe.status !== 0) throw new Error(`continuous-screen-render-probe-failed:${probe.stderr}`);
const mediaInfo = JSON.parse(probe.stdout);
const decode = spawnSync(ffmpegPath, ["-v", "error", "-i", stagingOutputPath, "-f", "null", "-"], {encoding: "utf8"});
if (decode.status !== 0) throw new Error(`continuous-screen-full-decode-failed:${decode.stderr}`);
const blackDetect = spawnSync(ffmpegPath, [
  "-hide_banner", "-i", stagingOutputPath,
  "-vf", "blackdetect=d=0.04:pix_th=0.08",
  "-an", "-f", "null", "-",
], {encoding: "utf8"});
const blackText = `${blackDetect.stdout || ""}\n${blackDetect.stderr || ""}`;
if (blackDetect.status !== 0 || blackText.includes("black_start:")) throw new Error("continuous-screen-black-interruption-detected");

const cameraMeasurements = props.scenes.map((scene) => {
  const maxScale = Math.max(...scene.cameraTrack.map((item) => item.scale));
  const moveDurations = scene.cameraTrack.slice(1).map((item, index) => item.atMs - scene.cameraTrack[index].atMs);
  const videoRates = scene.sourceSegments.filter((item) => item.kind === "video").map((item) => (
    (item.sourceEndMs - item.sourceStartMs) / (item.outputEndMs - item.outputStartMs)
  ));
  return {
    shotId: scene.shotId,
    maxScale,
    minimumCameraKeyframeSpacingMs: Math.min(...moveDurations),
    sourcePlaybackRates: videoRates,
    wideEstablish: scene.cameraTrack[0].scale === 1,
    wideRestore: scene.cameraTrack.at(-1).scale === 1,
    cameraModel: scene.screenDirection.cameraModel,
    grammar: scene.screenDirection.grammar,
    noEventNoMovement: scene.screenDirection.rules.noEventNoMovement,
    forcedWideRestore: scene.screenDirection.rules.forcedWideRestore,
    finalHoldMs: scene.screenDirection.rules.minimumFinalHoldMs,
  };
});
const cameraPass = cameraMeasurements.every((item) => (
  item.maxScale <= 1.8
  && item.minimumCameraKeyframeSpacingMs >= 260
  && item.sourcePlaybackRates.every((rate) => rate === 1)
  && item.wideEstablish
  && ["C4_BEZIER_EVENT_FOCUS_HOLD_V1", "CAP_NATIVE_RENDERED_NO_A1_CAMERA"].includes(item.cameraModel)
  && item.noEventNoMovement
  && item.forcedWideRestore === false
  && item.finalHoldMs >= 760
));
if (!cameraPass) throw new Error("continuous-screen-camera-contract-failed");

const columns = scope === "all" ? 4 : 5;
const tileWidth = 384;
const tileHeight = 238;
const tiles = [];
for (const [index, frame] of renderedFrames.entries()) {
  const image = await sharp(frame.file).resize(tileWidth, 216, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="22"><rect width="100%" height="100%" fill="#111617"/><text x="9" y="15" fill="#f2efe4" font-size="12" font-family="monospace">${frame.shotId} · ${frame.label}</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: tileHeight, channels: 3, background: "#111617"}})
    .composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: 216}])
    .png()
    .toBuffer();
  tiles.push({input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight});
}
const contactRows = Math.ceil(renderedFrames.length / columns);
await sharp({create: {width: columns * tileWidth, height: contactRows * tileHeight, channels: 3, background: "#111617"}})
  .composite(tiles)
  .png()
  .toFile(stagingContactPath);

fs.renameSync(stagingOutputPath, outputPath);
fs.renameSync(stagingContactPath, contactPath);
for (const frame of renderedFrames) {
  const admittedFile = path.join(outputRoot, path.basename(frame.file));
  fs.renameSync(frame.file, admittedFile);
  frame.file = admittedFile;
  frame.sha256 = sha256File(admittedFile);
}
fs.rmSync(stagingRoot, {recursive: true, force: true});

const manifestBase = {
  contract: "A1ContinuousScreenEvidenceRender/v2",
  scope,
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW",
  compositionId: "A1ContinuousScreenEvidenceReelV2",
  shotIds,
  sourcePlansPath: path.relative(root, plansPath),
  sourcePlansSha256,
  cache: {
    contract: "A1ContinuousScreenEvidenceRenderCache/v2",
    recipeSha256,
    recipeInputs,
    lastResult: "RENDERED_AND_ATOMICALLY_ADMITTED",
    atomicAdmission: true,
    concurrencyLimit: 2,
  },
  output: {
    path: path.relative(root, outputPath),
    publicUrl: `/${path.relative(projectPublicRoot, outputPath)}`,
    sha256: sha256File(outputPath),
    width,
    height,
    fps,
    durationSeconds: Number(mediaInfo.format.duration),
    fullDecodePass: true,
    blackInterruptions: false,
  },
  contactSheet: {
    path: path.relative(root, contactPath),
    publicUrl: `/${path.relative(projectPublicRoot, contactPath)}`,
    sha256: sha256File(contactPath),
  },
  frames: renderedFrames.map((frame) => ({...frame, file: path.basename(frame.file)})),
  cameraAudit: {status: "PASS", model: "C2_WIDE_FOCUS_RESTORE_V2", measurements: cameraMeasurements},
  cursorAudit: {
    syntheticCursorAdded: false,
    sourcePixelCursorPreserved: true,
    presentationPointerTelemetryBound: selected.find((shot) => shot.shotId === "ED-06")?.pointerTelemetry || null,
  },
  boundary: {
    candidateOnly: true,
    productionAdmission: false,
    currentAuthorityMutated: false,
    userVisualApproval: "NOT_APPROVED",
  },
};
const manifest = {...manifestBase, sha256: sha256Value(manifestBase)};
atomicWriteJson(propsPath, props);
atomicWriteJson(manifestPath, manifest);
console.log(JSON.stringify({
  status: manifest.status,
  cacheHit: false,
  cacheSeeded: false,
  recoveredStagingDirectoryCount: recoveredStagingDirectories.length,
  recipeSha256,
  outputPath: manifest.output.path,
  outputSha256: manifest.output.sha256,
  durationSeconds: manifest.output.durationSeconds,
  contactPath: manifest.contactSheet.path,
  contactSha256: manifest.contactSheet.sha256,
  cameraAudit: manifest.cameraAudit.status,
  fullDecodePass: manifest.output.fullDecodePass,
  userVisualApproval: manifest.boundary.userVisualApproval,
}, null, 2));
