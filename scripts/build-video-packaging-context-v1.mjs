#!/usr/bin/env node
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {buildVideoPackagingContext, buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {alignShotIntelligenceDecisionSetWithCoveragePlan, buildShotIntelligenceDecisionSet} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";

const require = createRequire(import.meta.url);
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const outputDir = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1");
const outputManifestPath = path.join(outputDir, "manifest.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const now = new Date().toISOString();

const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));

function paletteFromRaw(data, channels) {
  const bins = new Map();
  for (let index = 0; index < data.length; index += channels) {
    const r = Math.round(data[index] / 32) * 32;
    const g = Math.round(data[index + 1] / 32) * 32;
    const b = Math.round(data[index + 2] / 32) * 32;
    const key = [Math.min(255, r), Math.min(255, g), Math.min(255, b)].join(",");
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  return [...bins.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4).map(([rgb, count]) => ({rgb: rgb.split(",").map(Number), fraction: Number((count / Math.max(1, data.length / channels)).toFixed(4))}));
}

async function frameAnalysis(file) {
  const image = sharp(file);
  const [metadata, stats, raw] = await Promise.all([
    image.metadata(),
    image.stats(),
    image.clone().resize(32, 18, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true}),
  ]);
  const mean = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
  const stdev = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
  return {
    width: metadata.width,
    height: metadata.height,
    averageLuminance: Number((mean / 255).toFixed(4)),
    contrast: Number((stdev / 255).toFixed(4)),
    entropy: Number(stats.entropy.toFixed(4)),
    sharpness: Number(stats.sharpness.toFixed(4)),
    busyness: stats.entropy >= 7 ? "high" : stats.entropy >= 5.4 ? "medium" : "low",
    dominantPalette: paletteFromRaw(raw.data, raw.info.channels),
  };
}

function safeZonesFor(asset) {
  const graph = asset?.candidates?.find((candidate) => candidate?.sceneGraph?.safeZones)?.sceneGraph?.safeZones;
  const subjectBounds = graph?.face ? {...graph.face, semanticRole: "presenter-face", status: "DECLARED_FROM_SOURCE_BOUND_SCENE_GRAPH"} : null;
  const safeZones = graph?.caption ? [{...graph.caption, id: "editor-caption-safe-zone", semanticRole: "editor-owned-caption"}] : [];
  return {subjectBounds, safeZones};
}

function presenterVideoFor(shotId, demand) {
  const endMs = Number(demand?.editWindow?.endMs || 0);
  return workspace.library.assets.find((asset) => {
    if (asset.id !== "source-presenter-continuous-video" || asset.status !== "approved" || !asset.assetUri || !fs.existsSync(publicFile(asset.assetUri))) return false;
    if (asset.usedByShotIds?.includes(shotId)) return true;
    return asset.presenterEvidence?.timingAuthority === "article-srt-edit-window"
      && Number(asset.presenterEvidence?.durationMs || 0) >= endMs;
  });
}

fs.mkdirSync(outputDir, {recursive: true});
const alignedDecisionSet = alignShotIntelligenceDecisionSetWithCoveragePlan(
  buildShotIntelligenceDecisionSet({
    beats: workspace.production.packagingBeatPlan.semanticBeats,
    sourceHash: workspace.article.sourceTextSha256,
    projectId: workspace.production.project.projectId,
    now,
  }),
  workspace.production.shotVisualCoveragePlan,
  {now},
);
const decisions = alignedDecisionSet.items.filter((item) => item.packageDecision === "PACKAGE");
const contexts = [];
for (const decision of decisions) {
  const demandAsset = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === decision.shotId);
  const demand = demandAsset?.shotDemand || null;
  const presenterVideo = presenterVideoFor(decision.shotId, demand);
  let holdFrame = null;
  let anchors = null;
  if (presenterVideo && demand?.editWindow?.durationMs) {
    const extractionTimeMs = Math.round(demand.editWindow.startMs + demand.editWindow.durationMs / 2);
    const outputFile = path.join(outputDir, `${decision.shotId.toLowerCase()}-hold-frame.jpg`);
    execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (extractionTimeMs / 1000).toFixed(3), "-i", publicFile(presenterVideo.assetUri), "-frames:v", "1", "-vf", "scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2", outputFile]);
    anchors = await frameAnalysis(outputFile);
    holdFrame = {
      publicUrl: `/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/${path.basename(outputFile)}`,
      sha256: fileSha256(outputFile),
      width: anchors.width,
      height: anchors.height,
      sourceAssetId: presenterVideo.id,
      sourceAssetSha256: presenterVideo.sha256,
      extractionTimeMs,
      provenance: "deterministic-hold-frame-from-registered-editor-owned-video",
    };
  }
  const zones = safeZonesFor(demandAsset);
  contexts.push(buildVideoPackagingContext({decision, demand, holdFrame, visualAnchors: anchors, ...zones, createdAt: now}));
}

const set = buildVideoPackagingContextSet(contexts, {createdAt: now});
fs.writeFileSync(outputManifestPath, `${JSON.stringify(set, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: "PASS", manifest: outputManifestPath, sha256: set.sha256, summary: set.summary, items: set.items.map((item) => ({shotId: item.shotId, frameStatus: item.frameStatus, footageCompatibility: item.footageCompatibility, baseFrame: item.baseFrame?.publicUrl || null}))}, null, 2));
