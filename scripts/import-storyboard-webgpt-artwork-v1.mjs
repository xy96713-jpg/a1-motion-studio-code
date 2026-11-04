#!/usr/bin/env node
/**
 * Import ChatGPT-web generated artwork into the isolated /storyboard draft.
 *
 * This updates apps/studio-next/public/generated/storyboard/current only.
 * It does not modify remotion-renderer source props or refresh an MP4.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const phaseId = "storyboard-webgpt-artwork-import-v1";
const bridgePhaseId = "storyboard-webgpt-artwork-bridge-v1";
const defaultBridgeManifest = `apps/studio-next/public/generated/system-line/${bridgePhaseId}/manifest.json`;
const defaultInputDir = `apps/studio-next/public/generated/system-line/${bridgePhaseId}/inbox`;
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardDir = path.join(root, "apps/studio-next/public/generated/storyboard/current");
const generatedArtworkDir = path.join(root, "apps/studio-next/public/generated-artwork/webgpt-artwork-v1");
const storyboardPropsPath = path.join(storyboardDir, "storyboard-props.json");
const storyboardManifestPath = path.join(storyboardDir, "storyboard-manifest.json");
const storyboardApprovalPath = path.join(storyboardDir, "storyboard-approval.json");

function argValue(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function pngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
}

function findInputForJob(inputDir, job) {
  const files = fs.existsSync(inputDir)
    ? fs.readdirSync(inputDir).filter((file) => /\.(png|jpg|jpeg|webp)$/iu.test(file))
    : [];
  const exact = files.find((file) => file === job.expectedFileName);
  if (exact) return path.join(inputDir, exact);
  const beatPattern = new RegExp(`(^|[-_])${job.beatId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}($|[-_.])`, "iu");
  const beatMatch = files.find((file) => beatPattern.test(file));
  return beatMatch ? path.join(inputDir, beatMatch) : null;
}

const bridgeManifestPath = path.resolve(root, argValue("--bridge-manifest", defaultBridgeManifest));
const inputDir = path.resolve(root, argValue("--input-dir", defaultInputDir));
if (!fs.existsSync(bridgeManifestPath)) throw new Error(`bridge manifest not found: ${rel(bridgeManifestPath)}`);
if (!fs.existsSync(storyboardPropsPath)) throw new Error(`storyboard props not found: ${rel(storyboardPropsPath)}`);

const bridge = readJson(bridgeManifestPath);
if (bridge.contract !== "A1StoryboardWebGPTArtworkBridge/v1") throw new Error(`invalid bridge contract: ${bridge.contract}`);
const artworkSource = bridge.provider === "codex-imagegen"
  ? "codex-built-in"
  : bridge.browserAutomationRequired
    ? "chatgpt-web-browser-automation"
    : "chatgpt-web-manual";
const props = readJson(storyboardPropsPath);
const beforePropsSha256 = sha256File(storyboardPropsPath);
const sceneByBeatId = new Map((props.scenes || []).map((scene) => [scene.beatId, scene]));
const imported = [];
const missing = [];

fs.mkdirSync(generatedArtworkDir, {recursive: true});
for (const job of bridge.jobs || []) {
  const inputFile = findInputForJob(inputDir, job);
  if (!inputFile) {
    missing.push({beatId: job.beatId, expectedFileName: job.expectedFileName});
    continue;
  }
  const dimensions = pngDimensions(inputFile);
  if (!dimensions || dimensions.width < 768 || dimensions.height < 432) {
    missing.push({beatId: job.beatId, expectedFileName: job.expectedFileName, reason: "image-dimensions-invalid"});
    continue;
  }
  const sourceSha256 = sha256File(inputFile);
  const extension = path.extname(inputFile).toLowerCase() || ".png";
  const outFileName = `${job.beatId}-${sourceSha256.slice(0, 12)}${extension}`;
  const outPath = path.join(generatedArtworkDir, outFileName);
  fs.copyFileSync(inputFile, outPath);
  const copiedSha256 = sha256File(outPath);
  if (copiedSha256 !== sourceSha256) throw new Error(`copy hash mismatch: ${job.beatId}`);
  const scene = sceneByBeatId.get(job.beatId);
  if (scene) {
    scene.storyboard = {
      ...(scene.storyboard || {}),
      artworkStatus: "pending-visual-review",
      artworkFile: `webgpt-artwork-v1/${outFileName}`,
      artworkPath: rel(outPath),
      artworkSource,
      artworkPromptSha256: job.promptSha256,
      artworkSha256: copiedSha256,
      artworkReviewOnly: true,
      rendererAdoptionAllowed: false,
      factualEvidenceAllowed: false,
    };
  }
  imported.push({
    beatId: job.beatId,
    macroId: job.macroId,
    screenText: job.screenText,
    inputFile: rel(inputFile),
    localPath: rel(outPath),
    publicUrl: `/generated-artwork/webgpt-artwork-v1/${outFileName}`,
    provider: bridge.provider,
    sha256: copiedSha256,
    dimensions,
    status: scene ? "imported-into-storyboard-draft" : "copied-but-scene-missing",
  });
}

fs.writeFileSync(storyboardPropsPath, stableJson(props));
if (fs.existsSync(storyboardApprovalPath)) fs.unlinkSync(storyboardApprovalPath);

const afterPropsSha256 = sha256File(storyboardPropsPath);
let storyboardManifest = fs.existsSync(storyboardManifestPath) ? readJson(storyboardManifestPath) : {};
storyboardManifest = {
  ...storyboardManifest,
  generatedAt: new Date().toISOString(),
  current: {
    ...(storyboardManifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: afterPropsSha256,
    sceneCount: Array.isArray(props.scenes) ? props.scenes.length : 0,
    macroCount: new Set((props.scenes || []).map((scene) => scene.macroId).filter(Boolean)).size,
    macroIds: Array.from(new Set((props.scenes || []).map((scene) => scene.macroId).filter(Boolean))),
    totalDurationMs: (props.scenes || []).length ? Math.max(...props.scenes.map((scene) => scene.sourceEndMs || 0)) : 0,
  },
  assets: {
    ...(storyboardManifest.assets || {}),
    webGptArtworkCount: imported.length,
    pendingVisualReviewArtworkCount: (props.scenes || []).filter((scene) => scene.storyboard?.artworkStatus === "pending-visual-review").length,
    webGptArtwork: imported,
  },
};
fs.writeFileSync(storyboardManifestPath, stableJson(storyboardManifest));

const report = {
  contract: "A1StoryboardWebGPTArtworkImport/v1",
  phaseId,
  status: imported.length ? "IMPORTED_PENDING_VISUAL_REVIEW" : "NO_IMAGES_IMPORTED",
  generatedAt: new Date().toISOString(),
  provider: bridge.provider,
  providerMode: bridge.providerMode,
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    bridgeManifestPath: rel(bridgeManifestPath),
    bridgeManifestSha256: sha256File(bridgeManifestPath),
    inputDir: rel(inputDir),
    beforeStoryboardPropsSha256: beforePropsSha256,
    afterStoryboardPropsSha256: afterPropsSha256,
  },
  summary: {
    expectedCount: (bridge.jobs || []).length,
    importedCount: imported.length,
    missingCount: missing.length,
    storyboardDraftChanged: beforePropsSha256 !== afterPropsSha256,
    allImportedReviewBlocked: imported.every((item) => item.status === "imported-into-storyboard-draft"),
  },
  imported,
  missing,
  nextAction: imported.length ? "review-imported-artwork-on-4311-storyboard" : "add-generated-images-to-inbox-and-rerun-import",
};

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
fs.writeFileSync(path.join(artifactRoot, "report.json"), stableJson(report));
fs.writeFileSync(path.join(publicRoot, "report.json"), stableJson(report));

console.log(JSON.stringify({status: report.status, summary: report.summary, nextAction: report.nextAction}, null, 2));
if (!imported.length) process.exitCode = 2;
