#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const familyRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2");
const sourceManifestPath = path.join(familyRoot, "all-sixteen-shot-v2/manifest.json");
const plansPath = path.join(familyRoot, "shot-performance-plans.json");
const outputRoot = path.join(familyRoot, "insertion-pack-v2");
const manifestPath = path.join(outputRoot, "insertion-manifest.json");
const contactPath = path.join(outputRoot, "sixteen-shot-insertion-contact.png");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const ffprobePath = path.join(root, "node_modules/@ffprobe-installer/darwin-arm64/ffprobe");
const fps = 60;
const width = 960;
const height = 540;

const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
const atomicWriteJson = (filePath, value) => {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};
const publicUrl = (filePath) => `/${path.relative(publicRoot, filePath)}`;
const relative = (filePath) => path.relative(root, filePath);
const artifactMatches = (artifact) => {
  if (!artifact?.path || !artifact?.sha256) return false;
  const filePath = path.join(root, artifact.path);
  return fs.existsSync(filePath) && sha256File(filePath) === artifact.sha256;
};
const probeClip = (filePath) => {
  const output = run(ffprobePath, [
    "-v", "error",
    "-count_frames",
    "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames:format=duration",
    "-of", "json",
    filePath,
  ]);
  const result = JSON.parse(output);
  const video = result.streams.find((stream) => stream.codec_type === "video");
  return {
    codec: video?.codec_name || null,
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    fps: video?.r_frame_rate || null,
    frameCount: Number(video?.nb_read_frames || 0),
    durationSeconds: Number(result.format?.duration || 0),
    audioStreamCount: result.streams.filter((stream) => stream.codec_type === "audio").length,
  };
};

fs.mkdirSync(outputRoot, {recursive: true});
const recoveredStagingDirectories = fs.readdirSync(outputRoot, {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(".staging-"))
  .map((entry) => path.join(outputRoot, entry.name));
for (const stalePath of recoveredStagingDirectories) fs.rmSync(stalePath, {recursive: true, force: true});

const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
if (sourceManifest.contract !== "A1ContinuousScreenEvidenceRender/v2" || sourceManifest.scope !== "all") {
  throw new Error("continuous-screen-insertion-source-manifest-invalid");
}
if (sourceManifest.boundary?.candidateOnly !== true || sourceManifest.boundary?.userVisualApproval !== "NOT_APPROVED") {
  throw new Error("continuous-screen-insertion-source-boundary-invalid");
}
if (plans.contract !== "A1ContinuousScreenEvidenceShotPlans/v2" || plans.status !== "PASS") {
  throw new Error("continuous-screen-insertion-plans-invalid");
}
if (JSON.stringify(sourceManifest.shotIds) !== JSON.stringify(plans.screenEvidenceShotIds)) {
  throw new Error("continuous-screen-insertion-shot-membership-drift");
}
const sourceVideoPath = path.join(root, sourceManifest.output.path);
if (!fs.existsSync(sourceVideoPath) || sha256File(sourceVideoPath) !== sourceManifest.output.sha256) {
  throw new Error("continuous-screen-insertion-source-video-invalid");
}
const expectedSourceFrameCount = plans.shots.reduce((total, shot) => total + Math.round((shot.durationMs / 1000) * fps), 0);
const sourceProbe = probeClip(sourceVideoPath);
if (sourceProbe.width !== width || sourceProbe.height !== height || sourceProbe.fps !== `${fps}/1` || sourceProbe.frameCount !== expectedSourceFrameCount) {
  throw new Error(`continuous-screen-insertion-source-probe-invalid:${JSON.stringify(sourceProbe)}`);
}

const authorityBefore = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
const settings = {codec: "h264", crf: 18, preset: "medium", pixelFormat: "yuv420p", fps, width, height, audio: false};
const packageRecipe = {
  contract: "A1ContinuousScreenEvidenceInsertionRecipe/v2",
  sourceVideoSha256: sourceManifest.output.sha256,
  sourceManifestSha256: sha256File(sourceManifestPath),
  sourcePlansSha256: sha256File(plansPath),
  settings,
};
const recipeSha256 = sha256Value(packageRecipe);
let existingManifest = null;
try {
  existingManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch {
  existingManifest = null;
}
let recipeSourceStartFrame = 0;
const visualSliceByShotId = new Map(plans.shots.map((shot) => {
  const sourceFrameCount = Math.round((shot.durationMs / 1000) * fps);
  const visualSlice = {
    sourceVideoSha256: sourceManifest.output.sha256,
    sourceStartFrame: recipeSourceStartFrame,
    sourceEndFrameExclusive: recipeSourceStartFrame + sourceFrameCount,
    insertionStartFrame: Math.round((shot.timelineStartMs / 1000) * fps),
    insertionEndFrameExclusive: Math.round((shot.timelineEndMs / 1000) * fps),
    settings,
  };
  recipeSourceStartFrame += sourceFrameCount;
  return [shot.shotId, visualSlice];
}));
const expectedCacheKeys = new Map([...visualSliceByShotId].map(([shotId, visualSlice]) => [shotId, sha256Value(visualSlice)]));
const existingEntryByShot = new Map((existingManifest?.entries || []).map((entry) => [entry.shotId, entry]));
const reusableEntries = new Map(plans.shots.flatMap((shot) => {
  const entry = existingEntryByShot.get(shot.shotId);
  const visualSlice = visualSliceByShotId.get(shot.shotId);
  return artifactMatches(entry?.file) && entry?.cacheKey === expectedCacheKeys.get(shot.shotId)
    ? [[shot.shotId, entry]]
    : [];
}));
const contactReusable = existingManifest?.recipeSha256 === recipeSha256 && artifactMatches(existingManifest.contactSheet);
if (
  process.env.A1_FORCE_INSERTION_EXPORT !== "1"
  && reusableEntries.size === plans.shots.length
  && contactReusable
  && existingManifest?.timingAuthority?.semanticWindowExactBoardBindingCount === plans.semanticWindowExactBoardBindingCount
  && existingManifest?.timingAuthority?.tailHoldMaxMs === plans.editWindowTailHold.maxMs
) {
  console.log(JSON.stringify({
    status: existingManifest.status,
    cacheHit: true,
    reusedEntryCount: reusableEntries.size,
    renderedEntryCount: 0,
    recoveredStagingDirectoryCount: recoveredStagingDirectories.length,
    recipeSha256,
    manifestPath: relative(manifestPath),
    manifestSha256: existingManifest.manifestSha256,
    contactSheetSha256: existingManifest.contactSheet.sha256,
    userVisualApproval: existingManifest.boundary.userVisualApproval,
  }, null, 2));
  process.exit(0);
}

const stagingRoot = path.join(outputRoot, `.staging-${process.pid}-${Date.now()}`);
fs.mkdirSync(stagingRoot, {recursive: true});
if (process.env.A1_SCREEN_INSERTION_INJECT_FAILURE_AFTER_STAGE_SETUP === "1") {
  throw new Error("continuous-screen-insertion-injected-failure-after-stage-setup");
}

let sourceStartFrame = 0;
const entries = [];
let renderedEntryCount = 0;
for (const shot of plans.shots) {
  const sourceFrameCount = Math.round((shot.durationMs / 1000) * fps);
  const sourceEndFrame = sourceStartFrame + sourceFrameCount;
  const timelineStartFrame = Math.round((shot.timelineStartMs / 1000) * fps);
  const timelineEndFrameExclusive = Math.round((shot.timelineEndMs / 1000) * fps);
  const insertionFrameCount = timelineEndFrameExclusive - timelineStartFrame;
  if (sourceFrameCount <= 0 || insertionFrameCount <= 0) throw new Error(`continuous-screen-insertion-frame-range-invalid:${shot.shotId}`);
  const finalFile = path.join(outputRoot, `${shot.shotId.toLowerCase()}-screen-evidence-960x540.mp4`);
  const cacheKey = expectedCacheKeys.get(shot.shotId);
  let probe;
  const reusable = process.env.A1_FORCE_INSERTION_EXPORT !== "1" ? reusableEntries.get(shot.shotId) : null;
  if (reusable) {
    probe = reusable.probe;
  } else {
    const stagingFile = path.join(stagingRoot, path.basename(finalFile));
    run(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", sourceVideoPath,
      "-vf", `trim=start_frame=${sourceStartFrame}:end_frame=${sourceEndFrame},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=0.100,trim=end_frame=${insertionFrameCount},setpts=PTS-STARTPTS`,
      "-an",
      "-c:v", "libx264", "-preset", settings.preset, "-crf", String(settings.crf),
      "-pix_fmt", settings.pixelFormat, "-r", String(fps), "-movflags", "+faststart",
      stagingFile,
    ]);
    probe = probeClip(stagingFile);
    if (probe.width !== width || probe.height !== height || probe.fps !== `${fps}/1` || probe.frameCount !== insertionFrameCount || probe.audioStreamCount !== 0) {
      throw new Error(`continuous-screen-insertion-probe-invalid:${shot.shotId}:${JSON.stringify(probe)}`);
    }
    const decode = spawnSync(ffmpegPath, ["-v", "error", "-i", stagingFile, "-f", "null", "-"], {encoding: "utf8"});
    if (decode.status !== 0) throw new Error(`continuous-screen-insertion-decode-failed:${shot.shotId}:${decode.stderr}`);
    fs.renameSync(stagingFile, finalFile);
    renderedEntryCount += 1;
  }
  if (!fs.existsSync(finalFile)) throw new Error(`continuous-screen-insertion-file-missing:${shot.shotId}`);
  entries.push({
    shotId: shot.shotId,
    status: "CANDIDATE_ONLY",
    mode: "SCREEN_EVIDENCE_OPAQUE_REPLACEMENT",
    timeline: {
      role: "EDIT_SLOT_THROUGH_NEXT_BEAT_START",
      startMs: shot.timelineStartMs,
      endMs: shot.timelineEndMs,
      startFrame: timelineStartFrame,
      endFrameExclusive: timelineEndFrameExclusive,
      frameCount: insertionFrameCount,
      frameCalibratedDurationSeconds: insertionFrameCount / fps,
    },
    semanticWindow: shot.semanticWindow,
    editWindow: shot.editWindow,
    tailHoldMs: shot.editWindow.tailHoldMs,
    sourceReelSlice: {startFrame: sourceStartFrame, endFrameExclusive: sourceEndFrame, frameCount: sourceFrameCount},
    semantic: {
      route: shot.route,
      sourceActionId: shot.sourceActionId,
      semanticSlice: shot.semanticSlice,
      sourceText: shot.sourceText,
      sourceActions: shot.sourceActions,
    },
    sourceBinding: {
      sourceAssetId: shot.sourceAssetId,
      sourceVideoUri: shot.sourceVideoUri,
      sourceVideoSha256: shot.sourceVideoSha256,
      sourceSegments: shot.sourceSegments,
      evidenceFrames: shot.evidenceFrames,
      pointerProvenance: shot.pointerProvenance,
      syntheticCursorAdded: false,
    },
    cameraTrack: shot.cameraTrack,
    typographySpec: {editableTextRequired: false, reason: "VERIFIED_REAL_PRODUCT_CAPTURE"},
    file: {
      path: relative(finalFile),
      publicUrl: publicUrl(finalFile),
      sha256: sha256File(finalFile),
      width,
      height,
      fps,
      frameCount: insertionFrameCount,
      durationSeconds: probe.durationSeconds,
      audio: false,
      alpha: false,
      background: "OPAQUE",
    },
    probe,
    cacheKey,
    productionEligible: false,
    userVisualApproved: false,
  });
  sourceStartFrame = sourceEndFrame;
}
if (sourceStartFrame !== expectedSourceFrameCount) throw new Error("continuous-screen-insertion-source-frame-total-drift");

const tileWidth = 384;
const tileHeight = 216;
const labelHeight = 26;
const columns = 4;
const tiles = [];
for (const [index, entry] of entries.entries()) {
  const framePath = path.join(stagingRoot, `${entry.shotId.toLowerCase()}-mid.png`);
  run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", (entry.timeline.frameCalibratedDurationSeconds * 0.55).toFixed(3),
    "-i", path.join(root, entry.file.path), "-frames:v", "1", framePath,
  ]);
  const image = await sharp(framePath).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111617"/><text x="10" y="18" fill="#dfff68" font-size="13" font-family="monospace">${entry.shotId} · ${entry.timeline.startFrame}–${entry.timeline.endFrameExclusive - 1} · ${entry.timeline.frameCount}f</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: tileHeight + labelHeight, channels: 3, background: "#111617"}})
    .composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: tileHeight}])
    .png()
    .toBuffer();
  tiles.push({input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)});
}
const stagingContactPath = path.join(stagingRoot, path.basename(contactPath));
await sharp({create: {width: columns * tileWidth, height: 4 * (tileHeight + labelHeight), channels: 3, background: "#111617"}})
  .composite(tiles)
  .png()
  .toFile(stagingContactPath);
fs.renameSync(stagingContactPath, contactPath);
fs.rmSync(stagingRoot, {recursive: true, force: true});

const authorityAfter = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
if (JSON.stringify(authorityAfter) !== JSON.stringify(authorityBefore)) throw new Error("continuous-screen-insertion-mutated-current-authority");
const manifestBody = {
  contract: "A1ContinuousScreenEvidenceInsertionManifest/v2",
  status: "CANDIDATE_ONLY_READY_FOR_EDITOR_INSERT_REVIEW",
  recipeSha256,
  recipe: packageRecipe,
  source: {
    reviewReel: {path: sourceManifest.output.path, sha256: sourceManifest.output.sha256},
    sourceManifest: {path: relative(sourceManifestPath), sha256: sha256File(sourceManifestPath)},
    shotPlans: {path: relative(plansPath), sha256: sha256File(plansPath)},
  },
  entryCount: entries.length,
  entries,
  timingAuthority: {
    semanticWindowRole: "EXACT_SUBTITLE_AND_WHOLE_FILM_BOARD_SEMANTIC_CLAIM",
    semanticWindowExactBoardBindingCount: plans.semanticWindowExactBoardBindingCount,
    editWindowRole: "EDIT_SLOT_THROUGH_NEXT_BEAT_START",
    editWindowCount: plans.shots.length,
    tailHoldPurpose: plans.editWindowTailHold.purpose,
    tailHoldMinMs: plans.editWindowTailHold.minMs,
    tailHoldMaxMs: plans.editWindowTailHold.maxMs,
    tailHoldTotalMs: plans.editWindowTailHold.totalMs,
  },
  contactSheet: {path: relative(contactPath), publicUrl: publicUrl(contactPath), sha256: sha256File(contactPath)},
  cache: {
    perShotContentAddressed: true,
    reusableEntryCount: reusableEntries.size,
    renderedEntryCount,
    recoveredStagingDirectoryCount: recoveredStagingDirectories.length,
    atomicManifestAdmission: true,
    concurrencyLimit: 1,
  },
  authorityMutationAudit: {before: authorityBefore, after: authorityAfter, mutated: false},
  boundary: {
    candidateOnly: true,
    productionAdmission: false,
    currentAuthorityMutated: false,
    canonicalLayerExtractionPerformed: false,
    resolveWritePerformed: false,
    finalRender: false,
    userVisualApproval: "NOT_APPROVED",
  },
};
const manifest = {...manifestBody, manifestSha256: sha256Value(manifestBody), generatedAt: new Date().toISOString()};
atomicWriteJson(manifestPath, manifest);
console.log(JSON.stringify({
  status: manifest.status,
  cacheHit: renderedEntryCount === 0,
  reusedEntryCount: reusableEntries.size,
  renderedEntryCount,
  recoveredStagingDirectoryCount: recoveredStagingDirectories.length,
  entryCount: entries.length,
  recipeSha256,
  manifestPath: relative(manifestPath),
  manifestSha256: manifest.manifestSha256,
  contactSheetPath: manifest.contactSheet.path,
  contactSheetSha256: manifest.contactSheet.sha256,
  authorityMutated: false,
  userVisualApproval: manifest.boundary.userVisualApproval,
}, null, 2));
