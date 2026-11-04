#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {performance} from "node:perf_hooks";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const appPublicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(appPublicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "opening-ten-shot-motion-candidate-v1");
const stillRoot = path.join(outputRoot, "review-frames");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const directorManifestFile = path.join(generatedRoot, "opening-ten-shot-director-board-v1/manifest.json");
const directorReviewFile = path.join(generatedRoot, "opening-ten-shot-director-board-v1/agent-actual-pixel-review.json");
const outputFile = path.join(outputRoot, "opening-10-shot-candidate-960x540.mp4");
const propsFile = path.join(outputRoot, "render-props.json");
const contactSheetFile = path.join(outputRoot, "opening-10-shot-motion-contact-sheet.png");
const manifestFile = path.join(outputRoot, "manifest.json");
const rejectedR0Root = path.join(outputRoot, "history-r0-double-cursor-rejected");
const presenterVideoUri = "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-video-093bc1315163.mov";
const audioUri = "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav";
const presenterVideoFile = path.join(appPublicRoot, presenterVideoUri);
const audioFile = path.join(appPublicRoot, audioUri);
const width = 960;
const height = 540;
const fps = 30;

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const publicFile = (publicUrl) => path.join(appPublicRoot, String(publicUrl).replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(appPublicRoot, file).split(path.sep).join("/")}`;
const frameAt = (ms) => Math.round((ms / 1000) * fps);

const workspace = readJson(workspaceFile);
const director = readJson(directorManifestFile);
const directorReview = readJson(directorReviewFile);
if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") throw new Error("opening-motion-runtime-not-frozen-idle");
if (workspace.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("opening-motion-user-boundary-invalid");
if ((workspace.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("opening-motion-assembly-must-remain-empty");
if (workspace.production.shotIntelligence.wholeFilmStaticBoard.status !== "PENDING_USER_APPROVAL") throw new Error("opening-motion-static-board-gate-invalid");
if (director.status !== "AGENT_ACTUAL_PIXEL_PASS" || directorReview.status !== "PASS") throw new Error("opening-motion-director-board-not-reviewed");
if (!fs.existsSync(presenterVideoFile) || sha256File(presenterVideoFile) !== "093bc13151633d34f0bdc1176de77f1b71eeda7c7ccbb4d3ff2507cbc45babc5") throw new Error("opening-motion-presenter-video-invalid");
if (!fs.existsSync(audioFile) || sha256File(audioFile) !== "ad156741f33dc1ae0d01f4b155a577d5cc33d1036e70f29b278a213d8a46b73b") throw new Error("opening-motion-audio-invalid");

const coveragePlans = new Map(workspace.production.shotVisualCoveragePlan.shotPlans.map((shot) => [shot.shotId, shot]));
const shots = director.shots.map((shot) => {
  const coverage = coveragePlans.get(shot.shotId);
  if (!coverage) throw new Error(`opening-motion-coverage-missing:${shot.shotId}`);
  if (!fs.existsSync(publicFile(shot.frame.publicUrl)) || sha256File(publicFile(shot.frame.publicUrl)) !== shot.frame.sha256) throw new Error(`opening-motion-frame-invalid:${shot.shotId}`);
  const states = coverage.route === "SCREEN_EVIDENCE" ? coverage.screenStateBindings : null;
  if (coverage.route === "SCREEN_EVIDENCE") {
    if (!Array.isArray(states) || states.length !== 3 || coverage.screenActions?.length !== 3) throw new Error(`opening-motion-screen-binding-invalid:${shot.shotId}`);
    for (const state of states) if (!fs.existsSync(publicFile(state.publicUrl)) || sha256File(publicFile(state.publicUrl)) !== state.sha256) throw new Error(`opening-motion-screen-state-invalid:${shot.shotId}:${state.role}`);
  }
  return {
    shotId: shot.shotId,
    startMs: shot.timeRange.startMs,
    endMs: shot.timeRange.endMs,
    durationMs: shot.timeRange.durationMs,
    route: coverage.route,
    sourceText: shot.sourceText,
    framePublicUrl: shot.frame.publicUrl,
    frameSha256: shot.frame.sha256,
    screenActionId: coverage.screenActionId || null,
    states,
  };
});
if (shots.length !== 10 || shots.at(0)?.shotId !== "ED-01" || shots.at(-1)?.shotId !== "ED-10") throw new Error("opening-motion-shot-range-invalid");
if (shots.filter((shot) => shot.route === "SCREEN_EVIDENCE").length !== 5) throw new Error("opening-motion-screen-count-invalid");

const props = {
  contract: "A1OpeningTenShotMotionCandidate/v1",
  width,
  height,
  fps,
  durationMs: director.openingRange.durationMs,
  presenterVideoUri,
  audioUri,
  shots,
};
const totalFrames = Math.ceil((props.durationMs / 1000) * fps);
const timingAudit = shots.map((shot) => ({
  shotId: shot.shotId,
  startMs: shot.startMs,
  endMs: shot.endMs,
  startFrame: frameAt(shot.startMs),
  endFrame: frameAt(shot.endMs),
  quantizationErrorMs: Math.max(Math.abs(frameAt(shot.startMs) / fps * 1000 - shot.startMs), Math.abs(frameAt(shot.endMs) / fps * 1000 - shot.endMs)),
}));
if (timingAudit.some((item) => item.quantizationErrorMs > 1000 / fps)) throw new Error("opening-motion-timeline-quantization-invalid");

fs.mkdirSync(stillRoot, {recursive: true});
if (fs.existsSync(outputFile) && fs.existsSync(manifestFile) && !fs.existsSync(rejectedR0Root)) {
  const priorManifest = readJson(manifestFile);
  if (priorManifest.contract === "A1OpeningTenShotMotionCandidateManifest/v1" && priorManifest.status === "CANDIDATE_ONLY_PENDING_AGENT_ACTUAL_PIXEL_REVIEW") {
    fs.mkdirSync(rejectedR0Root, {recursive: true});
    fs.copyFileSync(outputFile, path.join(rejectedR0Root, "opening-10-shot-candidate-r0.mp4"));
    fs.copyFileSync(manifestFile, path.join(rejectedR0Root, "manifest-r0.json"));
    if (fs.existsSync(contactSheetFile)) fs.copyFileSync(contactSheetFile, path.join(rejectedR0Root, "contact-sheet-r0.png"));
    const rejection = {
      contract: "A1OpeningTenShotMotionCandidateRejection/v1",
      status: "VISUAL_REJECTED_DOUBLE_CURSOR",
      sourceVideoSha256: priorManifest.output?.sha256 || null,
      reason: "Verified source frames already contain the real cursor; the reconstructed cursor created a visible duplicate in ED-02.",
      userVisualApproval: "NOT_APPROVED",
      rejectedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(rejectedR0Root, "rejection.json"), `${JSON.stringify(rejection, null, 2)}\n`);
  }
}
fs.writeFileSync(propsFile, `${JSON.stringify(props, null, 2)}\n`);
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const startedAt = performance.now();
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/opening-ten-shot-motion-index.tsx"), publicDir: appPublicRoot, rootDir: rendererRoot, enableCaching: true});
const bundleMs = Math.round(performance.now() - startedAt);
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const reviewSamples = [];
try {
  const composition = await selectComposition({serveUrl, id: "A1OpeningTenShotMotionCandidateV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  if (composition.durationInFrames !== totalFrames || composition.width !== width || composition.height !== height || composition.fps !== fps) throw new Error("opening-motion-composition-metadata-invalid");
  await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputFile, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: false, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  for (const shot of shots) {
    const fractions = shot.route === "SCREEN_EVIDENCE" ? [0.18, 0.48, 0.82] : [0.5];
    for (const fraction of fractions) {
      const sampleMs = shot.startMs + shot.durationMs * fraction;
      const frame = Math.min(totalFrames - 1, Math.max(0, frameAt(sampleMs)));
      const label = `${shot.shotId.toLowerCase()}-${String(Math.round(fraction * 100)).padStart(2, "0")}`;
      const file = path.join(stillRoot, `${label}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      reviewSamples.push({shotId: shot.shotId, fraction, frame, publicUrl: publicUrlFor(file), sha256: sha256File(file)});
    }
  }
} finally {
  await browser.close({silent: true});
}
const renderMs = Math.round(performance.now() - startedAt - bundleMs);
if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size < 1_000_000) throw new Error("opening-motion-output-invalid");

const thumbs = await Promise.all(reviewSamples.map((sample) => sharp(publicFile(sample.publicUrl)).resize(480, 270, {fit: "cover"}).png().toBuffer()));
const columns = 4;
const rows = Math.ceil(thumbs.length / columns);
await sharp({create: {width: columns * 480, height: rows * 270, channels: 3, background: "#080a0b"}})
  .composite(thumbs.map((input, index) => ({input, left: (index % columns) * 480, top: Math.floor(index / columns) * 270})))
  .png({compressionLevel: 9})
  .toFile(contactSheetFile);

const screenMotionAudit = shots.filter((shot) => shot.route === "SCREEN_EVIDENCE").map((shot) => ({
  shotId: shot.shotId,
  actionId: shot.screenActionId,
  stateRoles: shot.states.map((state) => state.role),
  sourcePlaybackRate: 1,
  sourceStateKind: "VERIFIED_STILL_SEQUENCE",
  cameraPath: "ONE_PRIMARY_CUBIC_PATH_WITH_SETTLE",
  maximumScale: {"ED-02": 1.34, "ED-03": 1.28, "ED-04": 1.3, "ED-05": 1.2, "ED-06": 1.18}[shot.shotId],
  minimumSettleMs: 350,
  hardJumpZoom: false,
  cursorPath: "VERIFIED_SOURCE_CURSOR_STATE_TRANSITION",
  syntheticCursorRendered: false,
}));
const renderedAt = new Date().toISOString();
const manifestBody = {
  contract: "A1OpeningTenShotMotionCandidateManifest/v1",
  status: "CANDIDATE_ONLY_PENDING_AGENT_ACTUAL_PIXEL_REVIEW",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceDirectorManifestSha256: director.manifestSha256,
  sourceDirectorReviewSha256: directorReview.reviewSha256,
  sourceWholeFilmBoardSha256: workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256,
  sourceTimelineBoardSha256: workspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.sha256,
  timingAuthority: {kind: "CANONICAL_10_SHOT_TIMELINE", durationMs: props.durationMs, fps, totalFrames, maximumQuantizationErrorMs: Math.max(...timingAudit.map((item) => item.quantizationErrorMs)), shots: timingAudit},
  media: {
    presenterVideo: {publicUrl: `/${presenterVideoUri}`, sha256: sha256File(presenterVideoFile), playbackRate: 1, continuousAcrossOpening: true},
    audio: {publicUrl: `/${audioUri}`, sha256: sha256File(audioFile), playbackRate: 1, continuousAcrossOpening: true},
  },
  screenMotionAudit,
  output: {publicUrl: publicUrlFor(outputFile), sha256: sha256File(outputFile), bytes: fs.statSync(outputFile).size, width, height, fps, durationInFrames: totalFrames, durationMs: Math.round(totalFrames / fps * 1000)},
  contactSheet: {publicUrl: publicUrlFor(contactSheetFile), sha256: sha256File(contactSheetFile), width: columns * 480, height: rows * 270, sampleCount: reviewSamples.length, samples: reviewSamples},
  renderMetrics: {bundleMs, renderMs, totalMs: Math.round(performance.now() - startedAt), concurrency: 2, imagegenCalls: 0, sourceVideoPlaybackRate: 1},
  revisionHistory: {repairCount: 1, rejectedR0: {status: "VISUAL_REJECTED_DOUBLE_CURSOR", directory: "history-r0-double-cursor-rejected"}},
  boundaries: {candidateOnly: true, userVisualApproval: "NOT_APPROVED", currentBoardMutationPerformed: false, currentPhaseMutationPerformed: false, workspaceMutationPerformed: false, assemblyPerformed: false, layerExtractionPerformed: false, resolvePerformed: false, finalRenderPerformed: false},
  propsSha256: sha256Value(props),
  renderedAt,
};
const manifest = {...manifestBody, manifestSha256: sha256Value(manifestBody)};
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: manifest.status, output: manifest.output, contactSheet: manifest.contactSheet, timing: {durationMs: props.durationMs, totalFrames, maximumQuantizationErrorMs: manifest.timingAuthority.maximumQuantizationErrorMs}, renderMetrics: manifest.renderMetrics, boundary: manifest.boundaries}, null, 2)}\n`);
