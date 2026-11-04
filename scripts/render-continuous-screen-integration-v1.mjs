import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {compileContinuousScreenSourceMapping, assertContinuousLayoutPolicy, auditContinuousSourceFrameClock, returnCameraAfterSourceEvent, reframeContinuousReadingTargets} from "../apps/studio-next/src/lib/a1-continuous-screen-source-mapping-v1.mjs";
import {motionReviewHash, motionReviewSource} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";

export async function renderContinuousScreenIntegration({root, workspace, configPath, stillsOnly = false}) {
  const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
  const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex");
  const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path.resolve(root, file)], {encoding: "utf8"}));
  const config = read(configPath), report = read(config.sourceReportPath), direction = read(config.directionPropsPath), proof = read(config.directionProofPath);
  if (hash(report.output.path) !== report.output.sha256 || proof.sourceSha256 !== report.output.sha256) throw new Error("CONTINUOUS_SOURCE_PROOF_INVALID");
  if (direction.fps !== 60 || direction.width !== 960 || direction.height !== 540 || direction.scenes?.length !== 1) throw new Error("CONTINUOUS_DIRECTION_CANVAS_INVALID");
  const allShots = workspace.production.shotIntelligence.currentStoryboardAuthority.shots;
  const shots = report.sequenceBinding.shotIds.map((id) => allShots.find((shot) => shot.shotId === id));
  assertContinuousLayoutPolicy(shots, report);
  for (const shot of shots) {
    const auth = shot?.singleShotMotionCanaryAuthorization;
    if (shot?.route !== "SCREEN_EVIDENCE" || !shot.prototypeEligible || auth?.scope !== "INTERNAL_REVIEW_CANARY_ONLY" || auth.sourceVersionId !== shot.versionId || auth.sourceArtifactSha256 !== shot.artifactSha256 || auth.sourceMotionDesignSha256 !== shot.motionDesignContract?.motionDesignSha256) throw new Error("CONTINUOUS_CANARY_AUTHORIZATION_REQUIRED");
  }
  const metadata = probe(report.output.path), stream = metadata.streams.find((s) => s.codec_type === "video");
  if (stream.r_frame_rate !== "60/1") throw new Error("CONTINUOUS_CFR60_REQUIRED");
  const frames = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", path.resolve(root, report.output.path)], {encoding: "utf8", maxBuffer: 4 * 1024 * 1024})).frames;
  const [timeBaseNumerator, timeBaseDenominator] = stream.time_base.split("/").map(Number);
  const sourceFrameClock = auditContinuousSourceFrameClock({timestamps: frames.map((frame) => Number(frame.best_effort_timestamp_time)), fps: 60, timeBaseSeconds: timeBaseNumerator / timeBaseDenominator});
  if (sourceFrameClock.frameCount !== Number(stream.nb_frames)) throw new Error("SOURCE_DECODED_FRAME_COUNT_MISMATCH");
  let reading = null, readingEvidenceSha256 = null;
  if (config.readingTargets) {
    const requestEvidence = read(config.readingTargets.evidencePath);
    if (hash(requestEvidence.referenceFrame.path) !== requestEvidence.referenceFrame.sha256) throw new Error("READING_REFERENCE_PIXELS_CHANGED");
    readingEvidenceSha256 = hash(config.readingTargets.evidencePath);
    reading = reframeContinuousReadingTargets({scene: direction.scenes[0], report, requestEvidence, ...config.readingTargets});
    if (!config.returnAfterEvent) throw new Error("READING_TARGETS_REQUIRE_EVENT_BOUND_RETURN");
  }
  const correction = config.returnAfterEvent ? returnCameraAfterSourceEvent({scene: reading?.scene || direction.scenes[0], report, destinationCamera: reading?.returnCamera, settledAtMs: reading?.proof.resultSettledMs || proof.entry.end, ...config.returnAfterEvent}) : null;
  const mapping = compileContinuousScreenSourceMapping({shots, report, directionScene: correction?.scene || direction.scenes[0], sourceFrameCount: Number(stream.nb_frames)});
  const rendererFiles = ["remotion-renderer/src/ContinuousScreenEvidenceReelV2.tsx", "remotion-renderer/src/current-screen-integration-entry.tsx", "scripts/render-continuous-screen-integration-v1.mjs", "apps/studio-next/src/lib/a1-continuous-screen-source-mapping-v1.mjs", "apps/studio-next/src/lib/a1-screen-motion-curves-v1.mjs", "apps/studio-next/src/lib/a1-screen-review-direction-v1.mjs"];
  const rendererSha256 = motionReviewHash(rendererFiles.map((file) => [file, hash(file)]));
  const input = {config, readingEvidenceSha256, sourceFrameClock, reportSha256: hash(config.sourceReportPath), directionSha256: hash(config.directionPropsPath), directionProofSha256: hash(config.directionProofPath), narrationSha256: hash(config.narrationPath), sources: shots.map(motionReviewSource), rendererSha256};
  const identity = motionReviewHash(input);
  const dir = path.join(root, "work/screen-production-integration-v1", `continuous-${identity.slice(0, 16)}`);
  const manifestPath = path.join(dir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    const cached = read(manifestPath);
    for (const media of [cached.sequence, ...cached.items.map((item) => item.video)]) if (hash(media.path) !== media.sha256) throw new Error("CONTINUOUS_CACHE_MEDIA_CORRUPT");
    console.log(JSON.stringify({status: "CACHE_HIT", manifestPath})); return;
  }
  const publicDir = path.join(dir, "public"); fs.mkdirSync(publicDir, {recursive: true});
  const sourceUri = `source-${report.output.sha256.slice(0, 16)}.mp4`;
  fs.copyFileSync(path.resolve(root, report.output.path), path.join(publicDir, sourceUri));
  const props = {...direction, scenes: mapping.slots.map((slot) => ({...slot.scene, sourceVideoUri: sourceUri})), audioUri: "", renderAudio: false, boundaryTransitionFrames: 0, showReviewLabels: false};
  fs.writeFileSync(path.join(dir, "props.json"), JSON.stringify(props));
  fs.writeFileSync(path.join(dir, "mapping.json"), JSON.stringify(mapping, null, 2));
  fs.writeFileSync(path.join(dir, "input.json"), JSON.stringify(input, null, 2));
  if (correction) fs.writeFileSync(path.join(dir, "direction-correction.json"), JSON.stringify(correction.proof, null, 2));
  if (reading) fs.writeFileSync(path.join(dir, "reading-framing.json"), JSON.stringify(reading.proof, null, 2));
  console.log(JSON.stringify({status: "RENDERING_INTERNAL_SEQUENCE", dir, frames: mapping.totalFrames, gapFrames: mapping.gapFrames}));
  const rendererRoot = path.join(root, "remotion-renderer"), require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler"), {openBrowser, selectComposition, renderMedia, renderStill} = require("@remotion/renderer");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/current-screen-integration-entry.tsx"), publicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const silent = path.join(dir, "review.mp4");
  try {
    const composition = await selectComposition({serveUrl, id: "A1CurrentScreenIntegrationReview", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    if (composition.durationInFrames !== mapping.totalFrames) throw new Error("CONTINUOUS_RENDER_FRAME_LOSS");
    for (const second of config.reviewTimes || [0, mapping.totalFrames / 120, (mapping.totalFrames - 1) / 60]) {
      const frame = Math.round(second * 60), output = path.join(dir, `still-${frame}.png`);
      if (frame < 0 || frame >= mapping.totalFrames) throw new Error("REVIEW_FRAME_OUT_OF_BOUNDS");
      if (!fs.existsSync(output)) await renderStill({serveUrl, composition, inputProps: props, frame, output, puppeteerInstance: browser, logLevel: "warn"});
    }
    if (stillsOnly) {console.log(JSON.stringify({status: "INTERNAL_STILLS_READY", dir}));return;}
    await renderMedia({serveUrl, composition, inputProps: props, codec: "h264", outputLocation: silent, crf: 17, concurrency: 2, muted: true, puppeteerInstance: browser, logLevel: "warn"});
  } finally {await browser.close({silent: true});}
  const sequencePath = path.join(dir, "narrated.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", silent, "-ss", String(mapping.sequenceBinding.startMs / 1000), "-i", path.resolve(root, config.narrationPath), "-map", "0:v", "-map", "1:a", "-t", String(mapping.totalFrames / 60), "-c:v", "copy", "-c:a", "aac", sequencePath]);
  execFileSync("ffmpeg", ["-v", "error", "-i", sequencePath, "-f", "null", "-"], {stdio: "pipe"});
  const items = [];
  for (const slot of mapping.slots.filter((slot) => slot.kind === "SHOT")) {
    const shot = shots.find((s) => s.shotId === slot.shotId), local = path.join(dir, `${slot.shotId}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", silent, "-vf", `trim=start_frame=${slot.firstFrame}:end_frame=${slot.endFrame},setpts=PTS-STARTPTS`, "-an", "-r", "60", "-c:v", "libx264", "-crf", "17", local]);
    const clip = probe(local), video = clip.streams.find((s) => s.codec_type === "video");
    if (Number(video.nb_frames) !== slot.endFrame - slot.firstFrame || video.avg_frame_rate !== "60/1" || Math.abs(Number(clip.format.duration) * 1000 - shot.timeRange.durationMs) > 80) throw new Error("CONTINUOUS_SHOT_EXTRACT_INVALID");
    items.push({shotId: shot.shotId, source: motionReviewSource(shot), sourceRange: {sourceStartMs: slot.sourceStartMs, sourceEndMs: slot.sourceEndMs}, video: {path: path.relative(root, local), sha256: hash(local), durationMs: Number(clip.format.duration) * 1000, width: video.width, height: video.height, fps: 60}});
  }
  const manifest = {contract: "A1ContinuousScreenIntegrationReview/v1", status: "INTERNAL_VISUAL_REVIEW_REQUIRED", inputIdentity: identity, sourceSha256: report.output.sha256, rendererFiles, rendererSha256, sequenceBinding: mapping.sequenceBinding, gapFrames: mapping.gapFrames, sequence: {path: path.relative(root, sequencePath), sha256: hash(sequencePath), durationMs: mapping.totalFrames / 60 * 1000, narrationSha256: input.narrationSha256}, items, normalSpeedNarratedReview: "NOT_COMPLETED", productionAdmission: false, workspaceMutation: false};
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({status: manifest.status, manifestPath, sourceDecode: "PASS", gapFrames: mapping.gapFrames}));
}
