#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");

const root = process.cwd();
const phaseId = "h-series-text-motion-targeted-still-proof-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const frameRoot = path.join(artifactRoot, "frames");
const publicFrameRoot = path.join(publicRoot, "frames");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const contactSheetPath = path.join(artifactRoot, "targeted-still-proof-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "targeted-still-proof-contact-sheet.png");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const entryPoint = path.join(root, "remotion-renderer/src/system-line-h-frame-index.tsx");
const targetedProofPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-proof-v1/report.json");
const patchPlanPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-proof-v1/projected-motion-patches.json");
const sceneFrames = 90;
const frameSpecs = [
  {label: "enter", localFrame: 14},
  {label: "emphasize", localFrame: 32},
  {label: "hold", localFrame: 58},
];
const expectedVisualMasterId = "july1-retro-print-archive-wireframe-v1";

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

async function meanAbsDiff(aFile, bFile) {
  const a = await sharp(aFile).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const b = await sharp(bFile).removeAlpha().raw().toBuffer({resolveWithObject: true});
  if (a.info.width !== b.info.width || a.info.height !== b.info.height || a.info.channels !== b.info.channels) {
    throw new Error(`diff-size-mismatch:${aFile}:${bFile}`);
  }
  let sum = 0;
  let active = 0;
  const channels = a.info.channels;
  const pixels = a.info.width * a.info.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * channels;
    const dr = Math.abs(a.data[offset] - b.data[offset]);
    const dg = Math.abs(a.data[offset + 1] - b.data[offset + 1]);
    const db = Math.abs(a.data[offset + 2] - b.data[offset + 2]);
    const diff = (dr + dg + db) / 3;
    sum += diff;
    if (diff > 8) active += 1;
  }
  return {
    meanAbsDiff: Number((sum / pixels).toFixed(4)),
    activeDiffFraction: Number((active / pixels).toFixed(4)),
  };
}

async function buildContactSheet(items, outputPath) {
  const tileWidth = 360;
  const tileHeight = 203;
  const labelHeight = 70;
  const groupGap = 34;
  const columns = 6;
  const rows = items.length;
  const width = columns * tileWidth;
  const height = 110 + rows * (tileHeight + labelHeight + groupGap);
  const composites = [];
  for (const [row, item] of items.entries()) {
    const top = 110 + row * (tileHeight + labelHeight + groupGap);
    const labelSvg = Buffer.from(`<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#d9d5ca"/>
      <text x="18" y="26" fill="#111315" font-family="Arial,sans-serif" font-size="18" font-weight="800">${escapeXml(item.beatId)} · ${escapeXml(item.screenText)}</text>
      <text x="18" y="52" fill="#2848a8" font-family="Arial,sans-serif" font-size="13">${escapeXml(item.currentSignature)} → ${escapeXml(item.proposedSignature)} · best diff ${item.bestMeanAbsDiff}</text>
    </svg>`);
    composites.push({input: labelSvg, left: 0, top});
    for (const [col, frame] of item.frames.entries()) {
      const image = await sharp(frame.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
      const label = Buffer.from(`<svg width="${tileWidth}" height="28" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${frame.mode === "projected" ? "#2848a8" : "#111315"}"/>
        <text x="10" y="19" fill="#f2efe7" font-family="Arial,sans-serif" font-size="13">${frame.mode} · ${frame.label}${frame.diff ? ` · diff ${frame.diff.meanAbsDiff}` : ""}</text>
      </svg>`);
      composites.push({input: image, left: col * tileWidth, top: top + labelHeight});
      composites.push({input: label, left: col * tileWidth, top: top + labelHeight + tileHeight - 28});
    }
  }
  const header = Buffer.from(`<svg width="${width}" height="110" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f2efe7"/>
    <text x="24" y="42" fill="#111315" font-family="Arial,sans-serif" font-size="30" font-weight="900">H-series targeted text-motion rendered still proof</text>
    <text x="24" y="76" fill="#555" font-family="Arial,sans-serif" font-size="15">current/proposed Remotion stills at enter, emphasize, hold. Proof-only; current 540p MP4 and renderer source props stay unchanged.</text>
  </svg>`);
  composites.push({input: header, left: 0, top: 0});
  await sharp({create: {width, height, channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(outputPath);
  return {width, height};
}

for (const required of [propsPath, entryPoint, targetedProofPath, patchPlanPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

const props = readJson(propsPath);
const targetedProof = readJson(targetedProofPath);
const patchPlan = readJson(patchPlanPath);
const patchByBeatId = new Map((patchPlan.patches || []).map((patch) => [patch.beatId, patch]));
const selectedBeatIds = (targetedProof.proofItems || []).map((item) => item.beatId);
const selectedScenes = selectedBeatIds.map((beatId) => props.scenes.find((scene) => scene.beatId === beatId)).filter(Boolean);
const projectedScenes = props.scenes.map((scene) => {
  const patch = patchByBeatId.get(scene.beatId);
  if (!patch) return scene;
  return {...scene, motionPlan: patch.projectedMotionPlan};
});
const currentProps = {...props, reviewBeatIds: selectedBeatIds};
const projectedProps = {...props, scenes: projectedScenes, reviewBeatIds: selectedBeatIds};

fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(publicFrameRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const failures = [];
if (props.contract !== "A1MicrobeatLayeredFullPlan/v1") failures.push("invalid-current-props-contract");
if (props.reviewOnly !== true || props.finalRenderAllowed !== false) failures.push("current-props-not-review-locked");
if (targetedProof.contract !== "A1HSeriesTextMotionTargetedProof/v1" || targetedProof.status !== "READY_FOR_BOUNDED_PREVIEW_REVIEW") failures.push("targeted-proof-not-ready");
if (targetedProof.visualMasterId !== expectedVisualMasterId) failures.push(`wrong-visual-master:${targetedProof.visualMasterId}`);
if (patchPlan.contract !== "A1HSeriesProjectedMotionPatches/v1" || patchPlan.proofOnly !== true || patchPlan.rendererPatchAllowed !== false || patchPlan.fullMp4RenderAllowed !== false || patchPlan.finalRenderAllowed !== false || patchPlan.resolveExportAllowed !== false) failures.push("projected-patch-plan-locks-invalid");
if (selectedBeatIds.length < 10 || selectedScenes.length !== selectedBeatIds.length) failures.push(`selected-scenes-invalid:${selectedScenes.length}/${selectedBeatIds.length}`);
if ((patchPlan.patches || []).some((patch) => !selectedBeatIds.includes(patch.beatId))) failures.push("patch-plan-has-unselected-beat");

let browser;
let contactSheet = null;
const proofItems = [];
try {
  const serveUrl = await bundle({entryPoint, webpackOverride: (config) => config});
  browser = await openBrowser("chrome", {chromeMode: "headless-shell"});
  const currentComposition = await selectComposition({serveUrl, id: "A1SystemLineHFrameReview", inputProps: currentProps, puppeteerInstance: browser, logLevel: "warn"});
  const projectedComposition = await selectComposition({serveUrl, id: "A1SystemLineHFrameReview", inputProps: projectedProps, puppeteerInstance: browser, logLevel: "warn"});
  for (const [sceneIndex, scene] of selectedScenes.entries()) {
    const patch = patchByBeatId.get(scene.beatId);
    const itemFrames = [];
    const diffFrames = [];
    for (const spec of frameSpecs) {
      const frame = sceneIndex * sceneFrames + spec.localFrame;
      const currentFile = path.join(frameRoot, `${scene.beatId.toLowerCase()}-${spec.label}-current.png`);
      const projectedFile = path.join(frameRoot, `${scene.beatId.toLowerCase()}-${spec.label}-projected.png`);
      await renderStill({serveUrl, composition: currentComposition, inputProps: currentProps, frame, output: currentFile, imageFormat: "png", scale: 0.5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      await renderStill({serveUrl, composition: projectedComposition, inputProps: projectedProps, frame, output: projectedFile, imageFormat: "png", scale: 0.5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const diff = await meanAbsDiff(currentFile, projectedFile);
      for (const file of [currentFile, projectedFile]) fs.copyFileSync(file, path.join(publicFrameRoot, path.basename(file)));
      const currentFrame = {
        mode: "current",
        beatId: scene.beatId,
        label: spec.label,
        localFrame: spec.localFrame,
        frame,
        file: path.relative(root, currentFile),
        publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(currentFile)}`,
        sha256: sha256(currentFile),
      };
      const projectedFrame = {
        mode: "projected",
        beatId: scene.beatId,
        label: spec.label,
        localFrame: spec.localFrame,
        frame,
        file: path.relative(root, projectedFile),
        publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(projectedFile)}`,
        sha256: sha256(projectedFile),
        diff,
      };
      itemFrames.push(currentFrame, projectedFrame);
      diffFrames.push({label: spec.label, ...diff});
    }
    const bestMeanAbsDiff = Math.max(...diffFrames.map((frame) => frame.meanAbsDiff));
    const bestActiveDiffFraction = Math.max(...diffFrames.map((frame) => frame.activeDiffFraction));
    proofItems.push({
      beatId: scene.beatId,
      macroId: scene.macroId,
      screenText: scene.screenText,
      currentSignature: patch.currentSignature,
      proposedSignature: patch.proposedSignature,
      currentMotionStyle: scene.motionPlan.motionStyle,
      projectedMotionStyle: patch.projectedMotionPlan.motionStyle,
      currentPrimaryCurve: scene.motionPlan.primaryCurve,
      projectedPrimaryCurve: patch.projectedMotionPlan.primaryCurve,
      bestMeanAbsDiff: Number(bestMeanAbsDiff.toFixed(4)),
      bestActiveDiffFraction: Number(bestActiveDiffFraction.toFixed(4)),
      diffFrames,
      frames: itemFrames,
    });
  }
  const sheetInput = proofItems.map((item) => ({...item, frames: item.frames.map((frame) => ({...frame, file: path.join(root, frame.file), diff: frame.diff}))}));
  contactSheet = await buildContactSheet(sheetInput, contactSheetPath);
  fs.copyFileSync(contactSheetPath, publicContactSheetPath);
} catch (error) {
  failures.push(`render-still:${error?.message || String(error)}`);
} finally {
  if (browser) await browser.close({silent: true});
}

const lowDiffItems = proofItems.filter((item) => item.bestMeanAbsDiff < 1.2 || item.bestActiveDiffFraction < 0.003);
if (proofItems.length !== selectedBeatIds.length) failures.push(`rendered-proof-item-count:${proofItems.length}/${selectedBeatIds.length}`);
if (lowDiffItems.length > 2) failures.push(`too-many-low-visual-diff-items:${lowDiffItems.map((item) => item.beatId).join(",")}`);
if (proofItems.length && Math.min(...proofItems.map((item) => item.bestMeanAbsDiff)) < 0.35) failures.push("some-projected-stills-visually-identical");

const status = failures.length ? "FAIL" : "PASS";
const report = {
  contract: "A1HSeriesTextMotionTargetedStillProof/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  visualMasterId: expectedVisualMasterId,
  proofOnly: true,
  dryRunOnly: true,
  rendererSourcePropsModified: false,
  currentMainMp4Modified: false,
  rendererPatchAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: path.relative(root, propsPath),
    propsSha256: sha256(propsPath),
    targetedProofPath: path.relative(root, targetedProofPath),
    targetedProofSha256: sha256(targetedProofPath),
    patchPlanPath: path.relative(root, patchPlanPath),
    patchPlanSha256: sha256(patchPlanPath),
  },
  summary: {
    selectedBeatCount: selectedBeatIds.length,
    renderedProofItemCount: proofItems.length,
    renderedStillCount: proofItems.reduce((count, item) => count + item.frames.length, 0),
    frameStates: frameSpecs.map((spec) => spec.label),
    minBestMeanAbsDiff: proofItems.length ? Number(Math.min(...proofItems.map((item) => item.bestMeanAbsDiff)).toFixed(4)) : 0,
    maxBestMeanAbsDiff: proofItems.length ? Number(Math.max(...proofItems.map((item) => item.bestMeanAbsDiff)).toFixed(4)) : 0,
    averageBestMeanAbsDiff: proofItems.length ? Number((proofItems.reduce((sum, item) => sum + item.bestMeanAbsDiff, 0) / proofItems.length).toFixed(4)) : 0,
    lowDiffItemCount: lowDiffItems.length,
    uniqueProjectedMotionStyles: [...new Set(proofItems.map((item) => item.projectedMotionStyle))],
    currentMainMp4Unchanged: true,
  },
  selectedBeatIds,
  proofItems,
  lowDiffItems: lowDiffItems.map((item) => ({beatId: item.beatId, bestMeanAbsDiff: item.bestMeanAbsDiff, bestActiveDiffFraction: item.bestActiveDiffFraction})),
  contactSheet: contactSheet ? {
    path: path.relative(root, contactSheetPath),
    publicUrl: `/generated/system-line/${phaseId}/targeted-still-proof-contact-sheet.png`,
    sha256: sha256(contactSheetPath),
    ...contactSheet,
  } : null,
  failures,
  knownLimit: "This is bounded still proof from projected in-memory props. It proves visual manifestation of targeted motion changes, but it is not renderer source adoption and does not refresh the current 540p MP4.",
  nextAction: failures.length ? "repair-targeted-still-proof-or-motion-plan-before-adoption" : "review-bounded-still-proof-before-any-renderer-source-adoption",
};

fs.mkdirSync(artifactRoot, {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.mkdirSync(publicRoot, {recursive: true});
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  status,
  summary: report.summary,
  failures,
  lowDiffItems: report.lowDiffItems,
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  contactSheet: report.contactSheet?.path || null,
  nextAction: report.nextAction,
}, null, 2));

if (status !== "PASS") process.exitCode = 2;
