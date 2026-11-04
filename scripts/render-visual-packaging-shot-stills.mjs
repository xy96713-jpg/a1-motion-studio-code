import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { validateVisualPackagingSemanticParity, visualPackagingShotRequiresVerifiedSource } from "../lib/visual-packaging-semantic-parity.js";
import { visualPackagingRenderFingerprint } from "../lib/visual-packaging-render-fingerprint.js";
import {assertVisualPackagingTemplateAdmission} from "../lib/visual-packaging-template-admission.js";
import {assertVisualPackagingScenePlanAdmission} from "../lib/visual-packaging-scene-plan-admission.js";

const root = path.resolve(import.meta.dirname, "..");
const rendererDir = path.join(root, "remotion-renderer");
const remotionBin = path.join(rendererDir, "node_modules", ".bin", "remotion");
const projectId = process.env.A1_VISUAL_PACKAGING_PROJECT_ID || "visual-package-89472ed3fac3";
const shotId = process.env.A1_VISUAL_PACKAGING_SHOT_ID || "02";
const manifestPath = process.env.A1_VISUAL_PACKAGING_MANIFEST_PATH
  ? path.resolve(process.env.A1_VISUAL_PACKAGING_MANIFEST_PATH)
  : path.join(root, "apps/studio-next/generated/visual-packaging-projects", projectId, "render-manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

if (manifest.contract !== "A1LayeredArticleManifest/v1") throw new Error(`Unsupported manifest: ${manifest.contract}`);
const templateAdmission = assertVisualPackagingTemplateAdmission(manifest);
const scenePlanAdmission = assertVisualPackagingScenePlanAdmission(manifest);
const calculatedFingerprint = visualPackagingRenderFingerprint({composition: "A1LayeredArticleProof", shotId, renderManifest: manifest});
const renderManifestFingerprint = process.env.A1_VISUAL_PACKAGING_RENDER_FINGERPRINT || calculatedFingerprint;
if (renderManifestFingerprint !== calculatedFingerprint) throw new Error("Render manifest fingerprint mismatch");
const shotIndex = manifest.shots.findIndex((shot) => shot.id === shotId);
if (shotIndex < 0) throw new Error(`Shot not found: ${shotId}`);
const shot = manifest.shots[shotIndex];
const stabilizationRequired = shot.motionOwnership?.contract === "A1MotionOwnership/v1"
  && shot.layerConsumption?.contract === "A1LayerConsumption/v1";
const semanticAdapterParity = validateVisualPackagingSemanticParity(shot);
if (!semanticAdapterParity.ok) throw new Error(`visual-packaging-semantic-adapter-parity-failed:${shotId}:${semanticAdapterParity.failures.join(",")}`);
const image = shot.layers.find((layer) => layer.kind === "evidence" || layer.kind === "subject");
const hasReviewedImage = Boolean(image?.source?.uri) && image?.source?.reviewed === true;
if (visualPackagingShotRequiresVerifiedSource(shot) && !hasReviewedImage) throw new Error(`Shot ${shotId} has no reviewed render image`);

const shotStart = manifest.shots.slice(0, shotIndex).reduce((sum, item) => sum + item.durationFrames, 0);
const illustrationEvent = shot.semanticMotion.events.find((event) => event.actor === "illustration");
const typographyEvent = shot.semanticMotion.events.find((event) => event.actor === "typography");
const semanticEvent = shot.semanticMotion.events.find((event) => event.actor === "semantic-elements");
const localFrames = {
  start: Math.min(shot.durationFrames - 1, (illustrationEvent?.start ?? 8) + 6),
  hold: Math.min(shot.durationFrames - 13, Math.max((illustrationEvent?.end ?? 51) + 20, (typographyEvent?.start ?? 80) + 30, (semanticEvent?.end ?? 0) + 12)),
};
const configuredOutputDir = process.env.A1_VISUAL_PACKAGING_STILL_OUTPUT_DIR || "";
const outputDir = configuredOutputDir
  ? path.resolve(configuredOutputDir)
  : projectId === "visual-package-89472ed3fac3" && shotId === "02"
    ? path.join(root, ".codex-artifacts", "visual-packaging-remotion-shot-02")
    : path.join(root, ".codex-artifacts", `visual-packaging-remotion-${projectId}-${shotId}`);
const propsPath = path.join(outputDir, "props.json");
await fs.mkdir(outputDir, {recursive: true});
await fs.writeFile(propsPath, `${JSON.stringify({manifest}, null, 2)}\n`);

const renderStill = (name, frame) => new Promise((resolve, reject) => {
  const outputPath = path.join(outputDir, `${name}.png`);
  const child = spawn(remotionBin, [
    "still", "src/index.ts", "A1LayeredArticleProof", outputPath,
    "--props", propsPath, `--frame=${frame}`, "--overwrite", "--scale=0.5", "--log=warn",
  ], {cwd: rendererDir, stdio: ["ignore", "pipe", "pipe"]});
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("close", (code) => code === 0 ? resolve(outputPath) : reject(new Error(output.slice(-5000))));
});

async function inspectVisibleWebMaterial(framePath, shot, hasReviewedImage) {
  if (shot.templatePlan?.materialMode !== "data-evidence" || !hasReviewedImage) {
    return {
      contract: "A1VisualPackagingVerifiedWebMaterialVisibility/v1",
      required: false,
      status: "not-required",
    };
  }
  // Data evidence is rendered in the right-hand source panel of the licensed
  // stat-counter adapter. Inspect the rendered pixels, not only the manifest
  // binding, so a silently ignored image prop cannot pass publication.
  const region = {left: 430, top: 60, width: 470, height: 420};
  const {data, info} = await sharp(framePath).extract(region).raw().toBuffer({resolveWithObject: true});
  let brightPixels = 0;
  let nonDarkPixels = 0;
  const totalPixels = info.width * info.height;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const maximum = Math.max(red, green, blue);
    if (maximum > 180) brightPixels += 1;
    if (maximum > 80) nonDarkPixels += 1;
  }
  const brightPixelRatio = Number((brightPixels / totalPixels).toFixed(4));
  const nonDarkPixelRatio = Number((nonDarkPixels / totalPixels).toFixed(4));
  return {
    contract: "A1VisualPackagingVerifiedWebMaterialVisibility/v1",
    required: true,
    status: brightPixelRatio >= 0.12 || nonDarkPixelRatio >= 0.12 ? "visible" : "missing",
    region,
    brightPixelRatio,
    nonDarkPixelRatio,
    threshold: {brightPixelRatio: 0.12, nonDarkPixelRatio: 0.12},
  };
}

async function inspectSourceReadability(shot, image, hasReviewedImage) {
  if (!hasReviewedImage || !image?.source?.uri) {
    return {contract: "A1SourceReadabilityGate/v1", status: "not-required", reasons: []};
  }
  if (!stabilizationRequired) {
    return {contract: "A1SourceReadabilityGate/v1", status: "legacy-unverified", reasons: ["missing-stabilization-contracts"]};
  }
  const sourcePath = path.resolve(rendererDir, "public", image.source.uri.replace(/^\//u, ""));
  const metadata = await sharp(sourcePath).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const aspectRatio = height > 0 ? width / height : 0;
  const {data, info} = await sharp(sourcePath).resize({width: 600, height: 600, fit: "inside", withoutEnlargement: true}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const lineIsBlank = (axis, lineIndex) => {
    const length = axis === "row" ? info.width : info.height;
    let nearWhite = 0;
    let nearBlack = 0;
    for (let offset = 0; offset < length; offset += 1) {
      const x = axis === "row" ? offset : lineIndex;
      const y = axis === "row" ? lineIndex : offset;
      const index = (y * info.width + x) * info.channels;
      const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
      if (luminance >= 247) nearWhite += 1;
      if (luminance <= 8) nearBlack += 1;
    }
    return Math.max(nearWhite, nearBlack) / length >= 0.97;
  };
  const countBlankEdge = (axis, reverse = false) => {
    const size = axis === "row" ? info.height : info.width;
    let count = 0;
    for (let step = 0; step < size; step += 1) {
      const index = reverse ? size - 1 - step : step;
      if (!lineIsBlank(axis, index)) break;
      count += 1;
    }
    return count;
  };
  const blank = {
    top: countBlankEdge("row"),
    bottom: countBlankEdge("row", true),
    left: countBlankEdge("column"),
    right: countBlankEdge("column", true),
  };
  const contentWidth = Math.max(0, info.width - blank.left - blank.right);
  const contentHeight = Math.max(0, info.height - blank.top - blank.bottom);
  const invalidEdgeRatio = 1 - (contentWidth * contentHeight) / Math.max(1, info.width * info.height);
  const reasons = [];
  if (aspectRatio < 0.5 || aspectRatio > 3.2) reasons.push(`extreme-source-aspect:${aspectRatio.toFixed(3)}`);
  if (invalidEdgeRatio > 0.15) reasons.push(`blank-or-black-edge:${invalidEdgeRatio.toFixed(3)}`);
  return {
    contract: "A1SourceReadabilityGate/v1",
    status: reasons.length ? "fail" : "pass",
    dimensions: {width, height},
    aspectRatio: Number(aspectRatio.toFixed(4)),
    blankEdges: blank,
    invalidEdgeRatio: Number(invalidEdgeRatio.toFixed(4)),
    thresholds: {minimumAspectRatio: 0.5, maximumAspectRatio: 3.2, maximumInvalidEdgeRatio: 0.15},
    reasons,
  };
}

const frames = {
  start: shotStart + localFrames.start,
  hold: shotStart + localFrames.hold,
};
const startPath = await renderStill("start", frames.start);
const holdPath = await renderStill("hold", frames.hold);
const sampleRatios = [0, 0.15, 0.3, 0.55, 0.75, 0.9];
const sampleOutputs = [];
for (const ratio of sampleRatios) {
  const localFrame = Math.min(shot.durationFrames - 1, Math.round((shot.durationFrames - 1) * ratio));
  const name = `sample-${String(Math.round(ratio * 100)).padStart(2, "0")}`;
  sampleOutputs.push({ratio, localFrame, frame: shotStart + localFrame, output: await renderStill(name, shotStart + localFrame)});
}
const visualFrameGate = stabilizationRequired
  ? {contract: "A1VisualFrameGate/v1", status: "pass", sampleCount: sampleOutputs.length, samples: sampleOutputs}
  : {contract: "A1VisualFrameGate/v1", status: "legacy-unverified", sampleCount: sampleOutputs.length, samples: sampleOutputs};
const sourceReadability = await inspectSourceReadability(shot, image, hasReviewedImage);
if (stabilizationRequired && sourceReadability.status === "fail") throw new Error(`source-readability-failed:${shotId}:${sourceReadability.reasons.join(",")}`);
const verifiedWebMaterialVisibility = await inspectVisibleWebMaterial(holdPath, shot, hasReviewedImage);
if (verifiedWebMaterialVisibility.required && verifiedWebMaterialVisibility.status !== "visible") throw new Error(`verified-web-material-not-visible:${shotId}`);
const report = {
  contract: "A1VisualPackagingShotStillProof/v1",
  ok: true,
  composition: "A1LayeredArticleProof",
  projectId,
  shotId,
  renderManifestFingerprint,
  verifiedAssetId: hasReviewedImage ? image.source.provenance?.split("|")[0] : "",
  templatePlan: shot.templatePlan || null,
  templateAdmission,
  scenePlanAdmission,
  fit: hasReviewedImage ? image.source.fit : undefined,
  motionPrimitive: hasReviewedImage ? image.source.motionPrimitive : undefined,
  attribution: hasReviewedImage ? image.source.attribution : undefined,
  verifiedWebMaterialVisibility,
  visualFrameGate,
  sourceReadability,
  semanticAdapterParity,
  shotStart,
  localFrames,
  frames,
  outputs: {start: startPath, hold: holdPath},
};
await fs.writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
