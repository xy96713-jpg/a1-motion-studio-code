#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {buildCurrentFilmManifest, sha256File} from "../lib/current-film-manifest.js";

const root = process.cwd();
const targetBeatIds = ["H03-B02", "H10-B04", "H11-B03"];
const stillDir = path.join(root, "apps/studio-next/public/generated/storyboard-stills");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const rendererPath = path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx");
const reportPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-large-typography-clean-contract-v1/report.json");
const publicReportPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-large-typography-clean-contract-v1/report.json");
const contactSheetPath = path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-large-typography-clean-contract-v1/contact-sheet.png");
const publicContactSheetPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-large-typography-clean-contract-v1/contact-sheet.png");

const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
const renderer = fs.readFileSync(rendererPath, "utf8");
const currentFilm = buildCurrentFilmManifest(root);
const currentBinding = {
  propsSha256: currentFilm.current.rendererPropsSha256,
  rendererSourceSha256: currentFilm.current.rendererSourceSha256,
  assetManifestSha256: currentFilm.current.assetManifestSha256,
  audioSha256: currentFilm.current.audioSha256,
  buildId: currentFilm.current.buildId,
};

function ratio(value, total) {
  return Number((total ? value / total : 0).toFixed(6));
}

async function pixelMetrics(filePath) {
  const {data, info} = await sharp(filePath).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const channels = info.channels;
  const total = info.width * info.height;
  const rowDark = new Array(info.height).fill(0);
  const columnDark = new Array(info.width).fill(0);
  let nearBlack = 0;
  let paper = 0;
  let saturated = 0;
  let saturatedRed = 0;
  let saturatedYellow = 0;
  let saturatedBlue = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * channels;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const maximum = Math.max(r, g, b);
      const minimum = Math.min(r, g, b);
      const saturation = maximum ? (maximum - minimum) / maximum : 0;
      if (maximum < 70) {
        nearBlack += 1;
        rowDark[y] += 1;
        columnDark[x] += 1;
      }
      if (r > 225 && g > 225 && b > 218 && Math.abs(r - g) < 16 && Math.abs(g - b) < 20) paper += 1;
      if (saturation > 0.48 && maximum > 120) {
        saturated += 1;
        if (r > g * 1.3 && r > b * 1.25) saturatedRed += 1;
        if (r > 150 && g > 110 && b < 100) saturatedYellow += 1;
        if (b > r * 1.25 && b > g * 1.05) saturatedBlue += 1;
      }
    }
  }
  return {
    width: info.width,
    height: info.height,
    paperFraction: ratio(paper, total),
    nearBlackFraction: ratio(nearBlack, total),
    saturatedFraction: ratio(saturated, total),
    saturatedRedFraction: ratio(saturatedRed, total),
    saturatedYellowFraction: ratio(saturatedYellow, total),
    saturatedBlueFraction: ratio(saturatedBlue, total),
    maxDarkRowFraction: ratio(Math.max(...rowDark), info.width),
    maxDarkColumnFraction: ratio(Math.max(...columnDark), info.height),
  };
}

const frames = [];
for (const beatId of targetBeatIds) {
  const stillPath = path.join(stillDir, `${beatId}.png`);
  const metadataPath = path.join(stillDir, `${beatId}.json`);
  const scene = props.scenes.find((item) => item.beatId === beatId) || null;
  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : null;
  const foreground = scene?.layers?.find((item) => item.kind === "foreground-subject") || null;
  const exists = fs.existsSync(stillPath) && fs.statSync(stillPath).size > 0;
  const pixels = exists ? await pixelMetrics(stillPath) : null;
  const checks = {
    sceneExists: Boolean(scene),
    stillExists: exists,
    currentBuildBound: metadata?.sourceBinding?.buildId === currentBinding.buildId,
    currentPropsBound: metadata?.sourceBinding?.propsSha256 === currentBinding.propsSha256,
    currentRendererBound: metadata?.sourceBinding?.rendererSourceSha256 === currentBinding.rendererSourceSha256,
    stillHashMatchesMetadata: Boolean(exists && metadata?.sha256 === sha256File(stillPath)),
    adoptedArtworkBound: Boolean(
      foreground?.asset
      && scene?.layout?.assetPlacement?.contract === "A1VisualFitDecision/v2"
      && scene?.layout?.assetPlacement?.sourcePolicy === "text-free-non-evidence-styleframe"
      && scene?.layout?.assetPlacement?.factualEvidenceAllowed === false
    ),
    singleEditableStatementRoute: scene?.storyboard?.typographyDirector?.preset === "poster-slam"
      && scene?.storyboard?.typographyDirector?.editableTextLayer === true
      && scene?.storyboard?.typographyDirector?.imageBakedTextAllowed === false,
    expectedDimensions: pixels?.width === 960 && pixels?.height === 540,
    paperFieldVisible: Boolean(pixels && pixels.paperFraction >= 0.42),
    visibleInkPresent: Boolean(pixels && pixels.nearBlackFraction >= 0.005 && pixels.nearBlackFraction <= 0.12),
    noBlackLetterboxBand: Boolean(pixels && pixels.maxDarkRowFraction < 0.38),
    noBlackVerticalPlate: Boolean(pixels && pixels.maxDarkColumnFraction < 0.42),
    noRedYellowGeometryFlood: Boolean(pixels && pixels.saturatedRedFraction < 0.015 && pixels.saturatedYellowFraction < 0.005),
    restrainedTotalSaturation: Boolean(pixels && pixels.saturatedFraction < 0.08),
  };
  frames.push({
    beatId,
    still: path.relative(root, stillPath),
    metadata: path.relative(root, metadataPath),
    sha256: exists ? sha256File(stillPath) : null,
    pixels,
    checks,
    status: Object.values(checks).every(Boolean) ? "PIXEL_PROOF_PASS" : "FAIL",
  });
}

const routeChecks = {
  rendererUsesDedicatedAdoptedStatementRoute: renderer.includes('data-a1-generated-artwork-priority="renderer-bound-editorial-statement"'),
  rendererSuppressesLegacySemanticStage: renderer.includes('data-a1-semantic-stage-suppressed="true"'),
  currentPropsParity: currentFilm.gates.board.storyboardRendererParity === true,
};

const contactTiles = await Promise.all(targetBeatIds.map((beatId) => sharp(path.join(stillDir, `${beatId}.png`)).resize(640, 360).png().toBuffer()));
const contactSheet = await sharp({create: {width: 1940, height: 360, channels: 3, background: "#e5e7e2"}})
  .composite(contactTiles.map((input, index) => ({input, left: index * 650, top: 0})))
  .png()
  .toBuffer();
for (const output of [contactSheetPath, publicContactSheetPath]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, contactSheet);
}

const failures = [
  ...frames.flatMap((frame) => Object.entries(frame.checks).filter(([, pass]) => !pass).map(([check]) => `${frame.beatId}:${check}`)),
  ...Object.entries(routeChecks).filter(([, pass]) => !pass).map(([check]) => `renderer:${check}`),
];
const report = {
  contract: "A1StoryboardLargeTypographyCleanContract/v2",
  generatedAt: new Date().toISOString(),
  status: failures.length ? "FAIL" : "PIXEL_PROOF_PASS",
  proofMode: "observed-rendered-pixels-plus-current-source-binding",
  sourceBinding: currentBinding,
  targets: targetBeatIds,
  frames,
  routeChecks,
  contactSheet: {
    artifactPath: path.relative(root, contactSheetPath),
    publicPath: path.relative(root, publicContactSheetPath),
    sha256: createHash("sha256").update(contactSheet).digest("hex"),
  },
  thresholds: {
    paperFractionMinimum: 0.42,
    nearBlackFractionRange: [0.005, 0.12],
    maxDarkRowFraction: 0.38,
    maxDarkColumnFraction: 0.42,
    saturatedRedFractionMaximum: 0.015,
    saturatedYellowFractionMaximum: 0.005,
    saturatedFractionMaximum: 0.08,
  },
  failures,
  rule: "A clean statement frame must be a current-build-bound 960x540 render with one editable local title, adopted text-free artwork, visible paper and ink, no broad black bar, and no red-yellow saturation flood.",
};
for (const output of [reportPath, publicReportPath]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({status: report.status, proofMode: report.proofMode, frameCount: frames.length, failures, reportPath: path.relative(root, reportPath), contactSheet: path.relative(root, contactSheetPath)}, null, 2));
if (failures.length) process.exitCode = 2;
