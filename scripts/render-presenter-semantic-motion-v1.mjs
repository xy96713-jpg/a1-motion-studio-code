#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {performance} from "node:perf_hooks";
import sharp from "sharp";
import {assertPresenterSemanticMarkerLayout} from "../apps/studio-next/src/lib/a1-presenter-semantic-marker-layout-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(root, "apps/studio-next/public");
const candidateRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/editorial-shot-director-v1/candidate-v3");
const outputRoot = path.join(candidateRoot, "representative-motion-v1");
const reviewRoot = path.join(outputRoot, "review-frames");
const outputFile = path.join(outputRoot, "presenter-semantic-motion-960x540.mp4");
const contactSheetFile = path.join(outputRoot, "motion-state-board.png");
const manifestFile = path.join(outputRoot, "manifest.json");
const propsFile = path.join(outputRoot, "render-props.json");
const authorizationFile = path.join(outputRoot, "delegated-authority.json");
const sourceManifestFile = path.join(candidateRoot, "manifest.json");
const workspaceFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhaseFile = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const componentFile = path.join(rendererRoot, "src/PresenterSemanticMotionV1.tsx");
const entryFile = path.join(rendererRoot, "src/presenter-semantic-motion-index.tsx");
const width = 960;
const height = 540;
const fps = 30;

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const asset = (publicUrl, sha256) => ({publicUrl, sha256});

fs.mkdirSync(reviewRoot, {recursive: true});

const sourceManifest = readJson(sourceManifestFile);
const workspaceBeforeSha256 = sha256File(workspaceFile);
const currentPhaseBeforeSha256 = sha256File(currentPhaseFile);
assert(sourceManifest.contract === "A1EditorialShotDirectorStaticBoardCandidate/v3", "presenter-motion-source-contract-invalid");
assert(sourceManifest.manifestSha256 === "06bb8eecbc0dcae78912c2e93ef742208e5d7d8d4d2010ca83f1bf0060dda6f8", "presenter-motion-source-manifest-drifted");
assert(sourceManifest.actualPixelReview === "PASS", "presenter-motion-static-pixel-review-not-pass");
assert(sourceManifest.userVisualApproval === "NOT_APPROVED" && sourceManifest.productionAdmission === false, "presenter-motion-user-approval-boundary-invalid");
assert(sourceManifest.boundaries?.motionPerformed === false && sourceManifest.boundaries?.assemblyCreated === false, "presenter-motion-source-boundary-invalid");

const presenterVideo = asset("/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-video-093bc1315163.mov", "093bc13151633d34f0bdc1176de77f1b71eeda7c7ccbb4d3ff2507cbc45babc5");
const narrationAudio = asset("/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav", "ad156741f33dc1ae0d01f4b155a577d5cc33d1036e70f29b278a213d8a46b73b");
const font = asset("/a1-editorial-fonts/fusion-pixel.ttf", "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32");
for (const binding of [presenterVideo, narrationAudio, font]) {
  const file = publicFile(binding.publicUrl);
  assert(fs.existsSync(file), `presenter-motion-source-missing:${binding.publicUrl}`);
  assert(sha256File(file) === binding.sha256, `presenter-motion-source-sha-mismatch:${binding.publicUrl}`);
}

const timing = {
  "ED-01": {startMs: 0, endMs: 3353, peakAtMs: 1677},
  "ED-07": {startMs: 30280, endMs: 35160, peakAtMs: 32730},
  "ED-13": {startMs: 56720, endMs: 61520, peakAtMs: 59220},
  "ED-19": {startMs: 87860, endMs: 97500, peakAtMs: 92680},
  "ED-31": {startMs: 187120, endMs: 197660, peakAtMs: 192530},
};
const targetIds = Object.keys(timing);
const sourceShots = new Map(sourceManifest.shots.filter((shot) => targetIds.includes(shot.shotId)).map((shot) => [shot.shotId, shot]));
assert(sourceShots.size === targetIds.length, "presenter-motion-target-shot-count-invalid");

let cursor = 0;
const segments = targetIds.map((shotId) => {
  const source = sourceShots.get(shotId);
  assert(source.presenterProposal?.actualPixelReview === "PASS", `presenter-motion-shot-pixel-review-not-pass:${shotId}`);
  assert(source.incumbentComparisonGate?.status === "PASS" && source.incumbentComparisonGate?.decision === "REPLACE_INCUMBENT", `presenter-motion-incumbent-gate-invalid:${shotId}`);
  const layout = assertPresenterSemanticMarkerLayout(source.presenterProposal.layout);
  const range = timing[shotId];
  const durationInFrames = Math.round((range.endMs - range.startMs) / 1000 * fps);
  const peakFrame = Math.round((range.peakAtMs - range.startMs) / 1000 * fps);
  const segment = {
    shotId,
    grammar: source.presenterMarker.grammar,
    sourceText: source.sourceText,
    outputStartFrame: cursor,
    durationInFrames,
    sourceStartFrame: Math.round(range.startMs / 1000 * fps),
    sourceStartMs: range.startMs,
    sourceEndMs: range.endMs,
    peakFrame,
    sourceStaticPreview: source.preview,
    layout,
    incumbentComparisonGateSha256: source.incumbentComparisonGate.gateSha256,
  };
  cursor += durationInFrames;
  return segment;
});
const totalFrames = cursor;

const directiveText = "你客观看 最优执行 不要总是我批准";
const authorizationBody = {
  contract: "A1DelegatedInternalVisualAuthority/v1",
  status: "ACTIVE_FOR_THIS_BOUNDED_PROOF",
  directive: {text: directiveText, sha256: sha256Value(directiveText), observedAt: "2026-08-17"},
  delegatedAgentDecision: "APPROVED_FOR_BOUNDED_REPRESENTATIVE_MOTION",
  allowed: [
    "SELECT_ALREADY_PIXEL_REVIEWED_STATIC_CANDIDATES",
    "RENDER_ISOLATED_540P_REPRESENTATIVE_MOTION",
    "RENDER_REVIEW_FRAMES_AND_CONTACT_SHEET",
    "RUN_TECHNICAL_AND_ACTUAL_PIXEL_AUDITS",
  ],
  excluded: [
    "CHANGE_CORE_AESTHETIC_DIRECTION",
    "OVERWRITE_CANONICAL_WHOLE_FILM",
    "WRITE_DAVINCI_RESOLVE",
    "FINAL_RENDER",
    "EXTERNAL_PUBLICATION",
  ],
  approvalSemantics: {
    delegatedAgentApprovalIsUserVisualApproval: false,
    userVisualApproval: "NOT_APPROVED",
    productionAdmission: false,
  },
  sourceStaticCandidate: {publicUrl: publicUrlFor(sourceManifestFile), sha256: sha256File(sourceManifestFile), manifestSha256: sourceManifest.manifestSha256},
};
const authorization = {...authorizationBody, authoritySha256: sha256Value(authorizationBody)};
fs.writeFileSync(authorizationFile, `${JSON.stringify(authorization, null, 2)}\n`);

const props = {
  contract: "A1PresenterSemanticMotion/v1",
  width,
  height,
  fps,
  totalFrames,
  presenterVideo,
  narrationAudio,
  font,
  segments: segments.map(({sourceText, sourceStaticPreview, incumbentComparisonGateSha256, ...segment}) => segment),
};
fs.writeFileSync(propsFile, `${JSON.stringify(props, null, 2)}\n`);

const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const startedAt = performance.now();
const serveUrl = await bundle({entryPoint: entryFile, publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const samples = [];
try {
  const composition = await selectComposition({serveUrl, id: "A1PresenterSemanticMotionV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  assert(composition.durationInFrames === totalFrames && composition.width === width && composition.height === height && composition.fps === fps, "presenter-motion-composition-metadata-invalid");
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    outputLocation: outputFile,
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
  for (const segment of segments) {
    const localFrames = [
      {state: "PRE", frame: 2},
      {state: "ENTER", frame: Math.min(24, segment.peakFrame - 8)},
      {state: "PEAK", frame: segment.peakFrame},
      {state: "HOLD", frame: segment.durationInFrames - 24},
      {state: "POST", frame: segment.durationInFrames - 2},
    ];
    for (const sample of localFrames) {
      const frame = segment.outputStartFrame + sample.frame;
      const file = path.join(reviewRoot, `${segment.shotId.toLowerCase()}-${sample.state.toLowerCase()}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      samples.push({shotId: segment.shotId, grammar: segment.grammar, state: sample.state, frame, localFrame: sample.frame, publicUrl: publicUrlFor(file), sha256: sha256File(file)});
    }
  }
} finally {
  await browser.close({silent: true});
}

const tileWidth = 384;
const tileHeight = 216;
const labelHeight = 30;
const tileBlockHeight = tileHeight + labelHeight;
const columns = 5;
const rows = segments.length;
const tiles = await Promise.all(samples.map(async (sample) => {
  const base = await sharp(publicFile(sample.publicUrl)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="${tileWidth}" height="${labelHeight}" fill="#080a0b"/><text x="12" y="20" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#f3c64f">${sample.shotId} · ${sample.state}</text><text x="${tileWidth - 10}" y="20" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="#d8ddd8">${sample.grammar}</text></svg>`);
  return sharp({create: {width: tileWidth, height: tileBlockHeight, channels: 3, background: "#080a0b"}})
    .composite([{input: label, left: 0, top: 0}, {input: base, left: 0, top: labelHeight}])
    .png()
    .toBuffer();
}));
await sharp({create: {width: columns * tileWidth, height: rows * tileBlockHeight, channels: 3, background: "#080a0b"}})
  .composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileBlockHeight})))
  .png({compressionLevel: 9})
  .toFile(contactSheetFile);

assert(fs.existsSync(outputFile) && fs.statSync(outputFile).size > 1_000_000, "presenter-motion-output-invalid");
assert(fs.existsSync(contactSheetFile), "presenter-motion-contact-sheet-missing");
assert(sha256File(workspaceFile) === workspaceBeforeSha256, "presenter-motion-workspace-mutated");
assert(sha256File(currentPhaseFile) === currentPhaseBeforeSha256, "presenter-motion-current-phase-mutated");
for (const segment of segments) {
  const shotSamples = samples.filter((sample) => sample.shotId === segment.shotId);
  assert(new Set(shotSamples.map((sample) => sample.sha256)).size === 5, `presenter-motion-static-state-pixels-not-distinct:${segment.shotId}`);
}

const manifestBody = {
  contract: "A1PresenterSemanticMotionManifest/v1",
  status: "AGENT_REPRESENTATIVE_MOTION_REVIEW_PENDING_ACTUAL_PIXEL_INSPECTION",
  current: false,
  reviewOnly: true,
  productionAdmitted: false,
  delegatedAuthority: {publicUrl: publicUrlFor(authorizationFile), sha256: sha256File(authorizationFile), authoritySha256: authorization.authoritySha256, decision: authorization.delegatedAgentDecision},
  sourceAuthority: {
    staticCandidatePublicUrl: publicUrlFor(sourceManifestFile),
    staticCandidateFileSha256: sha256File(sourceManifestFile),
    staticCandidateManifestSha256: sourceManifest.manifestSha256,
    sourceWorkspaceSemanticSha256: sourceManifest.sourceWorkspaceSha256,
    sourceBoardSha256: sourceManifest.sourceBoardSha256,
    sourceTimelineBoardSha256: sourceManifest.sourceTimelineBoardSha256,
    workspaceFileSha256: workspaceBeforeSha256,
    currentPhaseFileSha256: currentPhaseBeforeSha256,
  },
  output: {publicUrl: publicUrlFor(outputFile), sha256: sha256File(outputFile), bytes: fs.statSync(outputFile).size, width, height, fps, durationInFrames: totalFrames, durationMs: Math.round(totalFrames / fps * 1000)},
  motionStateBoard: {publicUrl: publicUrlFor(contactSheetFile), sha256: sha256File(contactSheetFile), width: columns * tileWidth, height: rows * tileBlockHeight, columns: ["PRE", "ENTER", "PEAK", "HOLD", "POST"], samples},
  shots: segments.map((segment) => ({
    shotId: segment.shotId,
    grammar: segment.grammar,
    sourceText: segment.sourceText,
    sourceStartMs: segment.sourceStartMs,
    sourceEndMs: segment.sourceEndMs,
    peakAtMs: timing[segment.shotId].peakAtMs,
    outputStartFrame: segment.outputStartFrame,
    durationInFrames: segment.durationInFrames,
    layoutSha256: segment.layout.layoutSha256,
    sourceStaticPreview: segment.sourceStaticPreview,
    incumbentComparisonGateSha256: segment.incumbentComparisonGateSha256,
    actualPixelReview: "PENDING",
  })),
  sourceBindings: {presenterVideo, narrationAudio, font},
  renderEvidence: {
    componentSha256: sha256File(componentFile),
    entrySha256: sha256File(entryFile),
    propsPublicUrl: publicUrlFor(propsFile),
    propsSha256: sha256File(propsFile),
    sampleCount: samples.length,
    allFiveStatesPixelDistinct: true,
    renderMs: Math.round(performance.now() - startedAt),
    imageGenCalls: 0,
    concurrency: 2,
  },
  boundaries: {
    candidateOnly: true,
    delegatedAgentApproval: "APPROVED_FOR_BOUNDED_REPRESENTATIVE_MOTION",
    userVisualApproval: "NOT_APPROVED",
    productionEligible: false,
    canonicalWholeFilmMutationPerformed: false,
    workspaceMutationPerformed: false,
    currentPhaseMutationPerformed: false,
    assemblyPerformed: false,
    layerExtractionPerformed: false,
    resolvePerformed: false,
    finalRenderPerformed: false,
    externalPublicationPerformed: false,
  },
  generatedAt: new Date().toISOString(),
};
const manifest = {...manifestBody, manifestSha256: sha256Value(manifestBody)};
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: manifest.status, output: manifest.output, motionStateBoard: {publicUrl: manifest.motionStateBoard.publicUrl, sha256: manifest.motionStateBoard.sha256, sampleCount: samples.length}, delegatedAuthority: manifest.delegatedAuthority, boundaries: manifest.boundaries}, null, 2)}\n`);
