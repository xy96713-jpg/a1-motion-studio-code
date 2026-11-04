#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {buildCurrentFilmManifest, sha256File} from "../lib/current-film-manifest.js";

const root = process.cwd();
const stillDir = path.join(root, "apps/studio-next/public/generated/storyboard-stills");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-12-frame-visual-master-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/current-12-frame-visual-master-v1");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const selection = [
  {beatId: "H01-B01", expectedArchetype: "thesis-statement"},
  {beatId: "H05-B02", expectedArchetype: "thesis-statement"},
  {beatId: "H01-B02", expectedArchetype: "process-path"},
  {beatId: "H04-B02", expectedArchetype: "process-path"},
  {beatId: "H10-B01", expectedArchetype: "process-path"},
  {beatId: "H03-B02", expectedArchetype: "contrast-turn"},
  {beatId: "H10-B04", expectedArchetype: "contrast-turn"},
  {beatId: "H03-B03", expectedArchetype: "evidence-source"},
  {beatId: "H05-B03", expectedArchetype: "archive-timeline"},
  {beatId: "H07-B01", expectedArchetype: "archive-timeline"},
  {beatId: "H11-B02", expectedArchetype: "quiet-resolution"},
  {beatId: "H11-B03", expectedArchetype: "quiet-resolution"},
];

const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
const currentFilm = buildCurrentFilmManifest(root);
const requiredArchetypes = ["thesis-statement", "process-path", "contrast-turn", "evidence-source", "archive-timeline", "quiet-resolution"];

async function metrics(filePath) {
  const {data, info} = await sharp(filePath).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const total = info.width * info.height;
  const rows = new Array(info.height).fill(0);
  let dark = 0;
  let paper = 0;
  let saturated = 0;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const index = (y * info.width + x) * info.channels;
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
    if (maximum < 70) { dark += 1; rows[y] += 1; }
    if (r > 225 && g > 225 && b > 218 && Math.abs(r - g) < 18 && Math.abs(g - b) < 22) paper += 1;
    if (maximum > 120 && maximum > 0 && (maximum - minimum) / maximum > 0.48) saturated += 1;
  }
  return {
    width: info.width,
    height: info.height,
    darkFraction: Number((dark / total).toFixed(6)),
    paperFraction: Number((paper / total).toFixed(6)),
    saturatedFraction: Number((saturated / total).toFixed(6)),
    maxDarkRowFraction: Number((Math.max(...rows) / info.width).toFixed(6)),
  };
}

const frames = [];
for (const item of selection) {
  const scene = props.scenes.find((candidate) => candidate.beatId === item.beatId) || null;
  const stillPath = path.join(stillDir, `${item.beatId}.png`);
  const metadataPath = path.join(stillDir, `${item.beatId}.json`);
  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : null;
  const exists = fs.existsSync(stillPath) && fs.statSync(stillPath).size > 0;
  const pixels = exists ? await metrics(stillPath) : null;
  const actualArchetype = scene?.storyboard?.visualArchetype?.id || null;
  const verifiedEvidenceCount = (scene?.entityEvidence || []).filter((entity) => entity.asset && entity.assetSha256 && entity.sourceUrl && entity.officialHost).length;
  const checks = {
    sceneExists: Boolean(scene),
    archetypeMatches: actualArchetype === item.expectedArchetype,
    stillExists: exists,
    stillHashMatchesMetadata: Boolean(exists && metadata?.sha256 === sha256File(stillPath)),
    currentBuildBound: metadata?.sourceBinding?.buildId === currentFilm.current.buildId,
    expectedDimensions: pixels?.width === 960 && pixels?.height === 540,
    visiblePaperField: Boolean(pixels && pixels.paperFraction >= 0.28),
    restrainedSaturation: Boolean(pixels && pixels.saturatedFraction < 0.15),
    noFullWidthBlackBand: Boolean(pixels && pixels.maxDarkRowFraction < 0.52),
    evidenceSourceBound: item.expectedArchetype !== "evidence-source" || verifiedEvidenceCount >= 1,
  };
  frames.push({
    ...item,
    actualArchetype,
    screenText: scene?.screenText || null,
    still: path.relative(root, stillPath),
    metadata: path.relative(root, metadataPath),
    sha256: exists ? sha256File(stillPath) : null,
    verifiedEvidenceCount,
    pixels,
    checks,
    status: Object.values(checks).every(Boolean) ? "PIXEL_PROOF_PASS" : "FAIL",
  });
}

const tileWidth = 480, tileHeight = 270, gutter = 10, columns = 4, rows = 3;
const tiles = await Promise.all(selection.map((item) => sharp(path.join(stillDir, `${item.beatId}.png`)).resize(tileWidth, tileHeight).png().toBuffer()));
const contactSheet = await sharp({create: {width: columns * tileWidth + (columns - 1) * gutter, height: rows * tileHeight + (rows - 1) * gutter, channels: 3, background: "#dfe2dd"}})
  .composite(tiles.map((input, index) => ({input, left: (index % columns) * (tileWidth + gutter), top: Math.floor(index / columns) * (tileHeight + gutter)})))
  .png()
  .toBuffer();
for (const output of [path.join(artifactRoot, "contact-sheet.png"), path.join(publicRoot, "contact-sheet.png")]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, contactSheet);
}

const coveredArchetypes = Array.from(new Set(frames.map((frame) => frame.actualArchetype).filter(Boolean)));
const failures = [
  ...frames.flatMap((frame) => Object.entries(frame.checks).filter(([, pass]) => !pass).map(([check]) => `${frame.beatId}:${check}`)),
  ...requiredArchetypes.filter((id) => !coveredArchetypes.includes(id)).map((id) => `missing-archetype-coverage:${id}`),
];
const report = {
  contract: "A1Current12FrameVisualMaster/v1",
  generatedAt: new Date().toISOString(),
  status: failures.length ? "BLOCKED" : "PIXEL_PROOF_PASS",
  reviewOnly: true,
  visualReviewStatus: "REQUIRES_DIRECT_CONTACT_SHEET_REVIEW",
  sourceBinding: {
    propsSha256: currentFilm.current.rendererPropsSha256,
    rendererSourceSha256: currentFilm.current.rendererSourceSha256,
    assetManifestSha256: currentFilm.current.assetManifestSha256,
    audioSha256: currentFilm.current.audioSha256,
    buildId: currentFilm.current.buildId,
  },
  selection,
  frameCount: frames.length,
  requiredArchetypes,
  coveredArchetypes,
  frames,
  contactSheet: {
    artifactPath: path.relative(root, path.join(artifactRoot, "contact-sheet.png")),
    publicPath: path.relative(root, path.join(publicRoot, "contact-sheet.png")),
    sha256: (await sharp(contactSheet).png().toBuffer()).toString("base64").slice(0, 0) || sha256File(path.join(artifactRoot, "contact-sheet.png")),
  },
  failures,
  nextAction: failures.length ? "repair-current-master-frames" : "perform-direct-visual-review-and-record-acceptance",
};
for (const output of [path.join(artifactRoot, "report.json"), path.join(publicRoot, "report.json")]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({status: report.status, frameCount: frames.length, coveredArchetypes, failures, contactSheet: report.contactSheet.artifactPath, reportPath: path.relative(root, path.join(artifactRoot, "report.json"))}, null, 2));
if (failures.length) process.exitCode = 2;
