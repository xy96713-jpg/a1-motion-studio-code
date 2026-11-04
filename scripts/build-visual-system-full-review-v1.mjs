#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "visual-system-full-review-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererGeneratedDir = path.join(root, "remotion-renderer/src/generated");
const systemPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/visual-production-system-v1/system-plan.json");
const candidatePath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json");
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const rendererPublicDir = path.join(root, "remotion-renderer/public");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const tokenise = (text) => {
  const tokens = String(text || "未命名镜头").match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{1,4}/gu) || [String(text || "未命名镜头")];
  return tokens.slice(0, 4);
};
const candidate = readJson(candidatePath);
const systemPlan = readJson(systemPlanPath);
if (systemPlan.summary.sceneCount !== 47) throw new Error(`expected-47-scenes:${systemPlan.summary.sceneCount}`);
const candidateById = new Map((candidate.scenes || []).map((scene) => [scene.beatId, scene]));
const sourcePlanSha256 = shaFile(systemPlanPath);
const bridgedAssets = new Map();
function bridgeAsset(asset) {
  if (!asset) return null;
  if (bridgedAssets.has(asset)) return bridgedAssets.get(asset);
  const sourcePath = path.join(rendererPublicDir, asset);
  if (!fs.existsSync(sourcePath)) return null;
  const outputRelative = `generated/system-line/${phaseId}/assets/${shaFile(sourcePath).slice(0, 12)}-${path.basename(asset)}`;
  const appOutput = path.join(root, "apps/studio-next/public", outputRelative);
  const rendererOutput = path.join(rendererPublicDir, outputRelative);
  fs.mkdirSync(path.dirname(appOutput), {recursive: true});
  fs.mkdirSync(path.dirname(rendererOutput), {recursive: true});
  fs.copyFileSync(sourcePath, appOutput);
  fs.copyFileSync(sourcePath, rendererOutput);
  bridgedAssets.set(asset, outputRelative);
  return outputRelative;
}

const editorialPresetByFamily = {
  "hero-material-title": {visualRole: "hero-photo", materialPriority: "primary", titleMode: "overlay-giant", layoutSilhouette: "full-bleed", accentRole: "chromatic-echo", photoTreatment: "darkroom", motionGrammar: "photo-push"},
  "evidence-macro-annotation": {visualRole: "evidence-page", materialPriority: "primary", titleMode: "evidence-margin", layoutSilhouette: "tilted-page", accentRole: "yellow-signal", photoTreatment: "xerox", motionGrammar: "object-rotate"},
  "scale-collision": {visualRole: "image-number-collage", materialPriority: "primary", titleMode: "overlay-giant", layoutSilhouette: "repeat-collage", accentRole: "red-conflict", photoTreatment: "duotone", motionGrammar: "repeat-stagger"},
  "role-triptych": {visualRole: "role-triptych", materialPriority: "primary", titleMode: "split-vertical", layoutSilhouette: "triptych", accentRole: "cobalt-direction", photoTreatment: "natural", motionGrammar: "vertical-reveal"},
  "contrast-rail": {visualRole: "dark-verdict", materialPriority: "none", titleMode: "black-field", layoutSilhouette: "dark-field", accentRole: "red-conflict", photoTreatment: "darkroom", motionGrammar: "hard-cut-scale"},
  "type-gesture": {visualRole: "dark-verdict", materialPriority: "none", titleMode: "black-field", layoutSilhouette: "dark-field", accentRole: "chromatic-echo", photoTreatment: "darkroom", motionGrammar: "hard-cut-scale"},
  "quiet-verdict": {visualRole: "quiet-object", materialPriority: "secondary", titleMode: "quiet-corner", layoutSilhouette: "negative-space", accentRole: "none", photoTreatment: "soft-blur", motionGrammar: "quiet-hold"},
  "process-path": {visualRole: "evidence-page", materialPriority: "secondary", titleMode: "evidence-margin", layoutSilhouette: "tilted-page", accentRole: "cobalt-direction", photoTreatment: "halftone", motionGrammar: "object-rotate"},
  "archive-cascade": {visualRole: "image-number-collage", materialPriority: "primary", titleMode: "overlay-giant", layoutSilhouette: "repeat-collage", accentRole: "red-conflict", photoTreatment: "xerox", motionGrammar: "repeat-stagger"},
  "object-crop": {visualRole: "macro-object", materialPriority: "primary", titleMode: "overlay-giant", layoutSilhouette: "macro-overlay", accentRole: "yellow-signal", photoTreatment: "natural", motionGrammar: "photo-push"},
};

function headlineLines(source, scene) {
  const lines = Array.isArray(source.titleLines) && source.titleLines.length ? source.titleLines : [source.screenText || scene.sceneId];
  return lines.map((line) => String(line).trim()).filter(Boolean).slice(0, 3);
}

function buildEditorialDesign(scene, source, materialAsset, candidateAssets, backgroundAsset) {
  const preset = editorialPresetByFamily[scene.familyId] || editorialPresetByFamily["quiet-verdict"];
  const resolvedMaterial = preset.materialPriority === "none" ? null : materialAsset;
  const focalPointBySilhouette = {"full-bleed": {x: 68, y: 54}, "tilted-page": {x: 54, y: 52}, "repeat-collage": {x: 56, y: 50}, triptych: {x: 60, y: 50}, "negative-space": {x: 72, y: 54}, "macro-overlay": {x: 68, y: 54}, "dark-field": null};
  const candidates = candidateAssets.map((asset, index) => {
    const localUri = bridgeAsset(asset);
    return localUri ? {id: `${scene.sceneId}-candidate-${index + 1}`, localUri: `/${localUri}`, sourceUrl: null, sha256: shaFile(path.join(rendererPublicDir, asset)), treatment: ["contain", "focal-cover", "cinematic-crop", "cutout-collage"][index % 4]} : null;
  }).filter(Boolean).slice(0, 4);
  const lines = headlineLines(source, scene);
  const visualFocus = String(source.screenText || lines.join(" ") || scene.sceneId);
  const support = Array.isArray(source.supportTokens) && source.supportTokens.length ? source.supportTokens.join(" · ") : null;
  return {
    shotId: scene.sceneId,
    order: Number(String(scene.sceneId).match(/B(\d+)/u)?.[1] || 1),
    sourceBeatId: scene.sceneId,
    visualRole: preset.visualRole,
    materialPriority: preset.materialPriority,
    materialCoverage: resolvedMaterial ? (preset.materialPriority === "primary" ? .82 : .58) : 0,
    titleMode: preset.titleMode,
    layoutSilhouette: preset.layoutSilhouette,
    accentRole: preset.accentRole,
    photoTreatment: preset.photoTreatment,
    foregroundActor: preset.visualRole === "macro-object" ? "concrete-object" : null,
    motionGrammar: preset.motionGrammar,
    narrative: {visualFocus, carryIn: "继承上一镜的语义对象", carryOut: "把当前判断交给下一镜"},
    layers: {
      background: {assetUri: preset.layoutSilhouette === "dark-field" ? null : backgroundAsset ? `/${backgroundAsset}` : null, mode: preset.layoutSilhouette === "dark-field" ? "charcoal" : "warm-gray"},
      material: {assetUri: resolvedMaterial ? `/${resolvedMaterial}` : null, mode: resolvedMaterial ? preset.layoutSilhouette : "none", candidates, focalPoint: resolvedMaterial ? focalPointBySilhouette[preset.layoutSilhouette] || {x: 58, y: 50} : null, sourceKind: resolvedMaterial ? "locally-cached-editorial-material" : "none"},
      foreground: {assetUri: null, mode: "none"},
      semanticElements: {kinds: preset.visualRole === "evidence-page" ? ["highlight", "source-label"] : preset.visualRole === "image-number-collage" ? ["metric", "repeat"] : preset.visualRole === "dark-verdict" ? ["verdict"] : ["direction"], decorativeBlueLine: false},
      typography: {headlineLines: lines, support, fontRole: preset.visualRole === "dark-verdict" || preset.visualRole === "quiet-object" ? "judgement" : "giantChinese"},
      finish: {treatments: ["unified-grade", preset.photoTreatment === "natural" ? "grain" : preset.photoTreatment, preset.accentRole === "none" ? "edge-blend" : "chromatic-echo"]},
    },
  };
}

const scenes = systemPlan.scenes.map((scene, index) => {
  const source = candidateById.get(scene.sceneId) || {};
  const candidateAssets = [
    ...(source.entityEvidence || []).map((item) => item.asset),
    ...(source.layers || []).map((layer) => layer.asset),
  ].filter(Boolean);
  // The shared plate is a background treatment, never the primary material.
  // Prefer the first scene-bound source/artwork so the review board tests real
  // material routing instead of accidentally rendering 47 paper placeholders.
  const candidateAsset = candidateAssets.find((asset) => !asset.includes("shared-background-plate"))
    || candidateAssets[0]
    || null;
  const systemMaterial = scene.typography.materialAssetId
    ? systemPlan.materialRegistry.find((asset) => asset.id === scene.typography.materialAssetId)?.assetPath
    : null;
  const materialAsset = bridgeAsset(systemMaterial)
    || bridgeAsset(candidateAsset)
    || (scene.familyId === "evidence-macro-annotation" ? bridgeAsset("editorial-documentary-reset-v1/source/document-surface.png") : null);
  const backgroundAsset = bridgeAsset("layered-anchor-v2/final/shared-background-plate.png");
  return {
    sceneId: scene.sceneId,
    title: source.screenText || source.titleLines?.join(" / ") || scene.sceneId,
    tokens: tokenise(source.screenText || source.titleLines?.join("") || scene.sceneId),
    support: `${scene.familyId} · ${scene.motion.grammar}`,
    materialAsset,
    sourceLabel: `${scene.sceneId} / ${scene.typography.role}`,
    durationInFrames: 72,
    eventFrames: {enter: 4, emphasize: 24, hold: 48, handoff: 64},
    familyId: scene.familyId,
    fontId: scene.typography.fontId,
    fontFamily: scene.typography.fontFamily,
    editorialDesign: buildEditorialDesign(scene, source, materialAsset, candidateAssets.filter((asset) => !asset.includes("shared-background-plate")), backgroundAsset),
  };
});
const authorityBefore = shaFile(authorityPath);
const reviewPlan = {
  contract: "A1VisualSystemRenderProof/v1",
  authority: "historical-candidate-not-authoritative",
  phaseId,
  sourceOfTruth: "shared-motion-ir",
  sourcePlanContract: "A1VisualProductionSystem/v1",
  sourcePlanSha256,
  visualMaster: systemPlan.visualMaster,
  fps: 30,
  scenes,
  renderers: {remotion: {entryPoint: "remotion-renderer/src/system-line-h-frame-index.tsx", compositionId: "A1VisualProductionSystemFullReview", adapter: "EditorialMontageBoard/v1"}, hyperframes: {html: `apps/studio-next/public/generated/system-line/${phaseId}/hyperframes-proof.html`, compositionId: "a1-visual-system-full-review", adapter: "editorial-montage-css/v1"}},
  selectionTrace: systemPlan.scenes.map((scene) => ({sceneId: scene.sceneId, familyId: scene.familyId, selectionTrace: scene.selectionTrace, fontId: scene.typography.fontId, motionGrammar: scene.motion.grammar})),
  gates: {sourcePlanCompiled: true, fortySevenSceneRoutingReviewed: true, currentAuthorityUntouched: authorityBefore === shaFile(authorityPath), humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullBoardGenerationAllowed: false},
};
const report = {contract: "A1VisualSystemFullReviewBuildReport/v1", phaseId, authority: "historical-candidate-not-authoritative", status: "PASS", sceneCount: scenes.length, familyIds: [...new Set(scenes.map((scene) => scene.familyId))], sourcePlanSha256, sourcePlanPath: "apps/studio-next/public/generated/system-line/visual-production-system-v1/system-plan.json", currentAuthority: {propsSha256: authorityBefore, unchanged: authorityBefore === shaFile(authorityPath)}, gates: reviewPlan.gates};
writeJson(path.join(artifactDir, "render-plan.json"), reviewPlan);
writeJson(path.join(publicDir, "render-plan.json"), reviewPlan);
writeJson(path.join(rendererGeneratedDir, "visual-system-full-review-plan.json"), reviewPlan);
writeJson(path.join(artifactDir, "report.json"), report);
writeJson(path.join(publicDir, "report.json"), report);
console.log(JSON.stringify({status: report.status, phaseId, sceneCount: report.sceneCount, familyCount: report.familyIds.length, familyIds: report.familyIds, currentAuthorityUnchanged: report.currentAuthority.unchanged}, null, 2));
