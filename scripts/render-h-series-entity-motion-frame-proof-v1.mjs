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
const phaseId = "h-series-entity-motion-frame-proof-v1";
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const propsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const previousReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/entity-evidence-motion-quality-proof-v1/report.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const frameRoot = path.join(artifactRoot, "frames");
const publicFrameRoot = path.join(publicRoot, "frames");
const contactSheetPath = path.join(artifactRoot, "entity-motion-frame-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "entity-motion-frame-contact-sheet.png");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const publicCurrentPhasePath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/current-phase.json");
const sceneFrames = 90;
const selectedBeatIds = ["H04-B01", "H04-B02", "H07-B04"];

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

async function buildContactSheet(frames, outputPath) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 56;
  const columns = 2;
  const rows = Math.ceil(frames.length / columns);
  const composites = [];
  for (const [index, frame] of frames.entries()) {
    const left = index % columns * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(frame.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d9d5ca"/><text x="16" y="24" fill="#111315" font-family="Arial,sans-serif" font-size="16">${frame.beatId} · ${frame.label}</text><text x="16" y="44" fill="#2848a8" font-family="Arial,sans-serif" font-size="12">${frame.entities.join(" · ")} · ${frame.curve} · ${frame.motionStyle}</text></svg>`);
    composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(outputPath);
  return {width: columns * tileWidth, height: rows * (tileHeight + labelHeight)};
}

const props = readJson(propsPath);
const previousReport = fs.existsSync(previousReportPath) ? readJson(previousReportPath) : {};
const scenes = props.scenes.filter((scene) => selectedBeatIds.includes(scene.beatId));
const tempProps = {...props, reviewBeatIds: selectedBeatIds};
fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(publicFrameRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const failures = [];
if (previousReport.contract !== "A1EntityEvidenceMotionQualityProof/v1" || previousReport.status !== "PASS" || previousReport.nextAction !== phaseId) failures.push("previous-entity-motion-proof-not-ready");
if (scenes.length !== selectedBeatIds.length) failures.push("selected-entity-scenes-missing");
for (const scene of scenes) {
  const assetBacked = scene.entityEvidence.filter((entry) => entry.asset && entry.assetSha256);
  if (!assetBacked.length) failures.push(`${scene.beatId}:no-asset-backed-entity`);
}

let browser;
const renderedFrames = [];
try {
  const serveUrl = await bundle({entryPoint, webpackOverride: (config) => config});
  browser = await openBrowser("chrome", {chromeMode: "headless-shell"});
  const composition = await selectComposition({serveUrl, id: "A1SystemLineHFrameReview", inputProps: tempProps, puppeteerInstance: browser, logLevel: "warn"});
  for (const [sceneIndex, scene] of scenes.entries()) {
    const frameSpecs = [
      {label: "early", localFrame: 24},
      {label: "hold", localFrame: 58},
    ];
    for (const spec of frameSpecs) {
      const frame = sceneIndex * sceneFrames + spec.localFrame;
      const file = path.join(frameRoot, `${scene.beatId.toLowerCase()}-${spec.label}.png`);
      await renderStill({serveUrl, composition, inputProps: tempProps, frame, output: file, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const publicFile = path.join(publicFrameRoot, path.basename(file));
      fs.copyFileSync(file, publicFile);
      renderedFrames.push({
        beatId: scene.beatId,
        label: spec.label,
        frame,
        localFrame: spec.localFrame,
        file: path.relative(root, file),
        publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(file)}`,
        sha256: sha256(file),
        entities: scene.entityEvidence.map((entry) => entry.name),
        assetBackedEntities: scene.entityEvidence.filter((entry) => entry.asset).map((entry) => entry.name),
        curve: scene.motionPlan.primaryCurve,
        motionStyle: scene.motionPlan.motionStyle,
      });
    }
  }
} catch (error) {
  failures.push(`render-still:${error?.message || String(error)}`);
} finally {
  if (browser) await browser.close({silent: true});
}

let contactSheet = null;
if (renderedFrames.length) {
  contactSheet = await buildContactSheet(renderedFrames.map((frame) => ({...frame, file: path.join(root, frame.file)})), contactSheetPath);
  fs.copyFileSync(contactSheetPath, publicContactSheetPath);
}

const status = failures.length ? "FAIL" : "PASS";
const nextAction = status === "PASS" ? "refresh-h-series-540p-review-mp4-after-entity-frame-proof-v1" : "repair-h-series-entity-motion-frame-proof";
const report = {
  contract: "A1HSeriesEntityMotionFrameProof/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  finalRenderAllowed: false,
  selectedBeatIds,
  frames: renderedFrames,
  contactSheet: contactSheet ? {path: path.relative(root, contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/entity-motion-frame-contact-sheet.png`, sha256: sha256(contactSheetPath), ...contactSheet} : null,
  failures,
  evidence: {
    props: path.relative(root, propsPath),
    propsSha256: sha256(propsPath),
    previousReport: path.relative(root, previousReportPath),
  },
  knownLimit: "This proves refreshed still frames for entity/motion scenes only. The existing 540p full-review MP4 must be refreshed next to include the renderer patch.",
  nextAction,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

const currentPhase = {
  contract: "A1SystemProgressPhase/v1",
  phaseId,
  status: status === "PASS" ? "complete" : "active",
  startedAt: new Date().toISOString(),
  completedAt: status === "PASS" ? new Date().toISOString() : null,
  systemCapability: {
    id: "h-series-entity-motion-frame-proof",
    layer: "rendered-still-proof",
    reusableDelta: "After official-asset renderer support, render still frames for the named-entity scenes so visual evidence exists before refreshing the full 540p review MP4.",
    userVisibleOutcome: "The system has a contact sheet proving source-bound official marks and motion states on the relevant H-series scenes.",
  },
  workspaceIsolation: {
    worktree: root,
    branch: "codex/system-maturity-line-20260722",
    frontendPort: 4311,
    phaseRoot: ".codex-artifacts/system-progress-system-line",
    publicRoot: "apps/studio-next/public/generated/system-line",
    mainLinePortForbidden: 4310,
  },
  visualMaster: {id: "july1-retro-print-archive-wireframe-v1", referenceMode: "current H-series visual baseline"},
  proof: {
    reviewUrl: "http://127.0.0.1:4311/system-line-review",
    entityMotionFrameProofReportPath: path.relative(root, reportPath),
    entityMotionFrameProofPublicReportPath: path.relative(root, publicReportPath),
    entityMotionFrameProofReportSha256: sha256(reportPath),
    contactSheetUrl: report.contactSheet?.publicUrl || null,
    contactSheetSha256: report.contactSheet?.sha256 || null,
    checks: {entityMotionFrameProof: status === "PASS", reviewOnly: true, finalRenderBlocked: true},
    knownVerificationLimit: report.knownLimit,
  },
  next: {
    recommended: {
      id: nextAction,
      reason: status === "PASS"
        ? "Entity/motion still frames are refreshed. Next safe automatic phase is to refresh the 540p review MP4 so the live review video matches the renderer patch."
        : "Repair still-frame proof before refreshing the full review MP4.",
      requiresExplicitApproval: false,
      riskTags: ["automatic-system-hardening", "rendered-still-proof", "no-final-render-yet", "no-resolve-export-yet"],
    },
  },
};
fs.writeFileSync(currentPhasePath, `${JSON.stringify(currentPhase, null, 2)}\n`);
fs.mkdirSync(path.dirname(publicCurrentPhasePath), {recursive: true});
fs.writeFileSync(publicCurrentPhasePath, `${JSON.stringify(currentPhase, null, 2)}\n`);

console.log(JSON.stringify({
  status,
  phaseId,
  selectedBeatIds,
  frameCount: renderedFrames.length,
  contactSheet: report.contactSheet?.publicUrl || null,
  failures,
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  nextAction,
}, null, 2));

if (status !== "PASS") process.exitCode = 2;
