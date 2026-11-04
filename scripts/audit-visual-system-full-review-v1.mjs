#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const root = process.cwd();
const phaseId = "visual-system-full-review-v1";
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const sourceRoot = path.join(root, "apps/studio-next/public/generated/system-line/visual-production-system-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const planPath = path.join(publicRoot, "render-plan.json");
const sourcePlanPath = path.join(sourceRoot, "system-plan.json");
const renderReportPath = path.join(publicRoot, "render-report.json");
const parityPath = path.join(publicRoot, "parity-report.json");
const reportPath = path.join(publicRoot, "report.json");
const failures = [];

for (const required of [planPath, sourcePlanPath, renderReportPath, parityPath, reportPath]) {
  if (!fs.existsSync(required)) failures.push(`missing:${path.relative(root, required)}`);
}
if (failures.length) {
  const result = {contract: "A1VisualSystemFullReviewVisualQualityAudit/v1", phaseId, status: "FAIL", failures};
  writeJson(path.join(artifactRoot, "visual-quality-audit.json"), result);
  writeJson(path.join(publicRoot, "visual-quality-audit.json"), result);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}

const plan = readJson(planPath);
const sourcePlan = readJson(sourcePlanPath);
const renderReport = readJson(renderReportPath);
const parity = readJson(parityPath);
const buildReport = readJson(reportPath);
const sourceById = new Map(sourcePlan.scenes.map((scene) => [scene.sceneId, scene]));
const frameById = new Map(renderReport.frames.map((frame) => [frame.sceneId, frame]));
const fontById = new Map(sourcePlan.fontRegistry.map((font) => [font.id, font]));
const materialById = new Map(sourcePlan.materialRegistry.map((asset) => [asset.id, asset]));
const expectedWidth = renderReport.remotion.width / 1920 * 538;
const expectedHeight = renderReport.remotion.height / 1080 * 302;
const framesDir = path.join(publicRoot, "frames");
const assetRoot = path.join(root, "apps/studio-next/public");
const requiredFamilyIds = new Set(sourcePlan.compositionRegistry.map((family) => family.id));

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function inspectFrame(framePath) {
  const metadata = await sharp(framePath).metadata();
  const stats = await sharp(framePath).stats();
  const rgb = stats.channels.slice(0, 3);
  const meanRgb = rgb.map((channel) => round(channel.mean, 2));
  const stdevRgb = rgb.map((channel) => round(channel.stdev, 2));
  const meanLuma = mean(rgb.map((channel) => channel.mean));
  const stdevLuma = mean(rgb.map((channel) => channel.stdev));
  const alpha = stats.channels.length === 4 ? stats.channels[3] : null;
  const raw = await sharp(framePath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let opaquePixels = 0;
  let visiblePixels = 0;
  let nonUniformPixels = 0;
  let cobaltPixels = 0;
  let paperPixels = 0;
  let edgeLumaTotal = 0;
  let edgePixels = 0;
  const width = raw.info.width;
  const height = raw.info.height;
  const edge = Math.max(2, Math.floor(Math.min(width, height) * 0.05));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = raw.data[offset];
      const g = raw.data[offset + 1];
      const b = raw.data[offset + 2];
      const a = raw.data[offset + 3];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (b - r > 28 && b - g > 5 && b > 130) cobaltPixels += 1;
      if (r > 210 && g > 205 && b > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 32) paperPixels += 1;
      if (a >= 250) opaquePixels += 1;
      if (a >= 8) visiblePixels += 1;
      if (Math.abs(luma - meanLuma) >= Math.max(6, stdevLuma * 0.25)) nonUniformPixels += 1;
      if (x < edge || y < edge || x >= width - edge || y >= height - edge) {
        edgeLumaTotal += luma;
        edgePixels += 1;
      }
    }
  }
  const totalPixels = width * height;
  return {
    width,
    height,
    channels: metadata.channels ?? raw.info.channels,
    hasAlpha: metadata.hasAlpha === true,
    fileBytes: fs.statSync(framePath).size,
    meanRgb,
    stdevRgb,
    meanLuma: round(meanLuma, 2),
    stdevLuma: round(stdevLuma, 2),
    entropy: round(stats.entropy, 3),
    alphaMean: alpha ? round(alpha.mean, 2) : 255,
    alphaCoverage: round(visiblePixels / totalPixels, 4),
    opaqueCoverage: round(opaquePixels / totalPixels, 4),
    nonUniformRatio: round(nonUniformPixels / totalPixels, 4),
    cobaltRatio: round(cobaltPixels / totalPixels, 4),
    paperRatio: round(paperPixels / totalPixels, 4),
    edgeContrast: round(Math.abs(meanLuma - edgeLumaTotal / Math.max(edgePixels, 1)), 2),
  };
}

function assetPathFromPublicUrl(publicUrl) {
  return path.join(assetRoot, publicUrl.replace(/^\//, ""));
}

const sceneResults = [];
for (const scene of plan.scenes) {
  const sourceScene = sourceById.get(scene.sceneId);
  const frame = frameById.get(scene.sceneId);
  const font = fontById.get(scene.fontId);
  const framePath = frame ? path.join(root, "apps/studio-next/public", frame.publicUrl.replace(/^\//, "")) : null;
  const materialPath = scene.materialAsset ? assetPathFromPublicUrl(`/${scene.materialAsset}`) : null;
  const issues = [];
  let pixels = null;
  if (!sourceScene) issues.push("source-scene-missing");
  if (!frame) issues.push("render-frame-missing");
  if (!font) issues.push("font-not-registered");
  else if (!font.formalRenderAllowed) issues.push("font-review-only");
  if (!scene.familyId || !requiredFamilyIds.has(scene.familyId)) issues.push("family-not-registered");
  if (!scene.materialAsset) issues.push("base-material-missing");
  else if (!fs.existsSync(materialPath)) issues.push("base-material-file-missing");
  if (sourceScene && sourceScene.typography?.materialAssetId) {
    const sourceMaterial = materialById.get(sourceScene.typography.materialAssetId);
    if (!sourceMaterial) issues.push("source-material-not-registered");
    else if (sourceMaterial.textFree !== true || sourceMaterial.editableCopyRequired !== true) issues.push("material-copy-policy-failed");
  }
  if (framePath && fs.existsSync(framePath)) {
    try {
      pixels = await inspectFrame(framePath);
      if (pixels.width !== Math.round(expectedWidth) || pixels.height !== Math.round(expectedHeight)) issues.push("frame-dimensions-unexpected");
      if (pixels.fileBytes < 2048) issues.push("frame-file-too-small");
      if (pixels.stdevLuma < 8 || pixels.entropy < 0.2) issues.push("frame-near-blank-or-low-variance");
      if (pixels.alphaCoverage < 0.5) issues.push("frame-mostly-transparent");
      if (pixels.cobaltRatio > 0.5) issues.push("legacy-solid-cobalt-background-risk");
    } catch (error) {
      issues.push(`frame-decode-failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  sceneResults.push({
    sceneId: scene.sceneId,
    familyId: scene.familyId,
    sourceLabel: scene.sourceLabel,
    title: scene.title,
    tokens: scene.tokens,
    support: scene.support,
    motionGrammar: sourceScene?.motion?.grammar ?? null,
    fontId: scene.fontId,
    fontFamily: scene.fontFamily,
    fontFormalRenderAllowed: font?.formalRenderAllowed ?? false,
    sourceMaterialAssetId: sourceScene?.typography?.materialAssetId ?? null,
    materialAsset: scene.materialAsset,
    materialAssetExists: materialPath ? fs.existsSync(materialPath) : false,
    frame: frame ? {frame: frame.frame, publicUrl: frame.publicUrl, sha256: frame.sha256} : null,
    pixels,
    autoReviewStatus: issues.length ? "AUTO_REVIEW_WITH_RISKS" : "PASS_PENDING_HUMAN",
    issues,
    humanDecision: "PENDING",
    reviewerNotes: "",
  });
}

const familyCounts = Object.fromEntries([...new Set(plan.scenes.map((scene) => scene.familyId))].sort().map((familyId) => [familyId, sceneResults.filter((scene) => scene.familyId === familyId).length]));
const missingFrameCount = sceneResults.filter((scene) => scene.issues.includes("render-frame-missing")).length;
const missingMaterialCount = sceneResults.filter((scene) => scene.issues.includes("base-material-file-missing")).length;
const lowVarianceCount = sceneResults.filter((scene) => scene.issues.includes("frame-near-blank-or-low-variance")).length;
const legacyCobaltBackgroundCount = sceneResults.filter((scene) => scene.issues.includes("legacy-solid-cobalt-background-risk")).length;
const paperDominantSceneCount = sceneResults.filter((scene) => (scene.pixels?.paperRatio ?? 0) >= 0.45).length;
const riskySceneCount = sceneResults.filter((scene) => scene.autoReviewStatus === "AUTO_REVIEW_WITH_RISKS").length;
const allSceneIdsMatch = plan.scenes.length === sourcePlan.scenes.length && plan.scenes.every((scene) => sourceById.has(scene.sceneId)) && renderReport.frames.length === plan.scenes.length;
const allFamiliesCovered = requiredFamilyIds.size === 10 && [...requiredFamilyIds].every((familyId) => familyCounts[familyId]);
const technicalFailures = [
  ...(allSceneIdsMatch ? [] : ["scene-or-frame-count-mismatch"]),
  ...(allFamiliesCovered ? [] : ["composition-family-coverage-mismatch"]),
  ...(missingFrameCount ? [`missing-frame-count:${missingFrameCount}`] : []),
  ...(missingMaterialCount ? [`missing-material-count:${missingMaterialCount}`] : []),
  ...(riskySceneCount ? [`risky-scene-count:${riskySceneCount}`] : []),
  ...(legacyCobaltBackgroundCount ? [`legacy-cobalt-background-count:${legacyCobaltBackgroundCount}`] : []),
  ...(parity.gates?.rendererParity === "PASS" ? [] : ["renderer-parity-not-pass"]),
  ...(buildReport.currentAuthority?.unchanged === true ? [] : ["current-authority-changed"]),
];
const audit = {
  contract: "A1VisualSystemFullReviewVisualQualityAudit/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  status: technicalFailures.length ? "AUTO_REVIEW_WITH_RISKS" : "PASS",
  sourceOfTruth: "shared-motion-ir",
  sourcePlanSha256: sha256(sourcePlanPath),
  renderPlanSha256: sha256(planPath),
  sceneCount: sceneResults.length,
  familyIds: [...new Set(sceneResults.map((scene) => scene.familyId))].sort(),
  familyCounts,
  metrics: {
    expectedFrame: {width: Math.round(expectedWidth), height: Math.round(expectedHeight)},
    renderedFrames: renderReport.frames.length,
    missingFrameCount,
    missingMaterialCount,
    lowVarianceCount,
    legacyCobaltBackgroundCount,
    paperDominantSceneCount,
    riskySceneCount,
    materialBackedSceneCount: sceneResults.filter((scene) => scene.materialAssetExists).length,
    formalFontSceneCount: sceneResults.filter((scene) => scene.fontFormalRenderAllowed).length,
    reviewOnlyFontSceneCount: sceneResults.filter((scene) => !scene.fontFormalRenderAllowed).length,
  },
  technicalFailures,
  gates: {
    pixelFrames: technicalFailures.some((failure) => failure.startsWith("missing-frame") || failure.startsWith("risky-scene")) ? "REVIEW" : "PASS",
    assetsAndFonts: missingMaterialCount || sceneResults.some((scene) => scene.issues.includes("font-not-registered")) ? "FAIL" : "PASS",
    rendererParity: parity.gates?.rendererParity ?? "MISSING",
    currentAuthorityUnchanged: buildReport.currentAuthority?.unchanged === true,
    humanVisualApproval: "PENDING",
    rendererAdoptionAllowed: false,
    fullBoardGenerationAllowed: false,
  },
  scenes: sceneResults,
};
const ledger = {
  contract: "A1VisualSystemFullReviewHumanReviewLedger/v1",
  phaseId,
  sourceOfTruth: "shared-motion-ir",
  sourcePlanSha256: audit.sourcePlanSha256,
  generatedAt: audit.generatedAt,
  reviewMode: "47-scene-hold-frame-ledger",
  status: "PENDING_HUMAN_REVIEW",
  instructions: [
    "逐镜查看 frame.publicUrl 或 contact sheet，不以自动 PASS 代替视觉批准。",
    "确认构图家族、字体角色、素材关系、阅读顺序和运动语法是否符合视觉母版。",
    "只有明确批准后，才允许生成正式全文板、写回 H47 authority 或进入 1080p。",
  ],
  scenes: sceneResults.map((scene) => ({
    sceneId: scene.sceneId,
    familyId: scene.familyId,
    sourceLabel: scene.sourceLabel,
    title: scene.title,
    tokens: scene.tokens,
    fontId: scene.fontId,
    fontFamily: scene.fontFamily,
    materialAsset: scene.materialAsset,
    motionGrammar: scene.motionGrammar,
    frame: scene.frame,
    autoReviewStatus: scene.autoReviewStatus,
    issues: scene.issues,
    humanDecision: "PENDING",
    reviewerNotes: "",
  })),
  gates: {
    autoTechnicalAudit: audit.status,
    humanVisualApproval: "PENDING",
    rendererAdoptionAllowed: false,
    fullBoardGenerationAllowed: false,
  },
};

writeJson(path.join(artifactRoot, "visual-quality-audit.json"), audit);
writeJson(path.join(publicRoot, "visual-quality-audit.json"), audit);
writeJson(path.join(artifactRoot, "review-ledger.json"), ledger);
writeJson(path.join(publicRoot, "review-ledger.json"), ledger);
console.log(JSON.stringify({
  contract: audit.contract,
  status: audit.status,
  sceneCount: audit.sceneCount,
  familyCount: audit.familyIds.length,
  metrics: audit.metrics,
  technicalFailures: audit.technicalFailures,
  ledger: {status: ledger.status, sceneCount: ledger.scenes.length},
}, null, 2));
if (audit.gates.assetsAndFonts === "FAIL" || audit.technicalFailures.includes("current-authority-changed")) process.exitCode = 1;
