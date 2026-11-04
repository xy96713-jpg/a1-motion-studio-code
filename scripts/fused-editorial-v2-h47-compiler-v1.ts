import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {A1LayeredShotDesignV2Schema} from "../apps/studio-next/src/lib/a1-layered-shot-design-v2.ts";

export const A1_FUSED_EDITORIAL_V2_H47_COMPILER_CONTRACT = "A1FusedEditorialV2H47Compiler/v1" as const;

const familyOptions: Record<string, string[]> = {
  "insertion-flow": ["full-bleed-hero", "relationship-map"],
  "type-statement": ["quiet-bridge", "dark-verdict"],
  "editorial-metaphor": ["cutout-collage", "quiet-bridge", "dark-verdict"],
  "model-comparison": ["vertical-shutters", "metric-verdict"],
  "process-chain": ["relationship-map", "paper-evidence", "vertical-shutters"],
  "annotation-judgement": ["paper-evidence", "quiet-bridge", "relationship-map"],
  "direction-convergence": ["dark-verdict", "quiet-bridge", "relationship-map"],
};

const fallbackMaterialByFamily: Record<string, string[]> = {
  "full-bleed-hero": ["editorial-documentary-reset-v1/source/selection-action.png", "editorial-documentary-reset-v1/source/workbench-overview.png"],
  "paper-evidence": ["editorial-documentary-reset-v1/source/document-surface.png", "editorial-documentary-reset-v1/source/paragraph-assist.png", "editorial-documentary-reset-v1/source/presentation-mode.png"],
  "cutout-collage": ["visual-grammar-v4/illustrations/03-style-accumulation.png", "visual-grammar-v4/illustrations/05-human-intervention-alt-a.png", "visual-grammar-v4/illustrations/06-human-intervention-alt-b.png"],
  "metric-verdict": ["visual-grammar-v4/illustrations/01-default-convergence.png", "visual-grammar-v4/illustrations/04-default-convergence-alt.png"],
  "relationship-map": ["editorial-documentary-reset-v1/source/ai-taste-highlight.png", "editorial-documentary-reset-v1/source/question-highlight.png"],
  "vertical-shutters": ["visual-grammar-v4/illustrations/01-default-convergence.png", "visual-grammar-v4/illustrations/04-default-convergence-alt.png"],
  "dark-verdict": ["editorial-documentary-reset-v1/source/problem-remains-highlight.png", "layered-anchor-v2/final/h11-direction-cluster.png"],
};

type AssetBinding = {assetUri: string | null; localSha256: string | null};

function shaFile(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function pickSceneFamily(scene: any, index: number, previous: string | null, previousPrevious: string | null) {
  const options = familyOptions[scene.family] || ["paper-evidence", "quiet-bridge", "relationship-map"];
  for (let offset = 0; offset < options.length; offset += 1) {
    const candidate = options[(index + offset) % options.length];
    if (candidate !== previous || candidate !== previousPrevious) return candidate;
  }
  return options[index % options.length];
}

function layerFromScene(scene: any, kind: string) {
  return (Array.isArray(scene.layers) ? scene.layers : []).find((layer: any) => layer.kind === kind) || null;
}

function channel(channelName: string, source: string, visualJob: string, asset: AssetBinding, emptyReason: string | null, extras: Record<string, unknown> = {}) {
  return {
    contract: "A1ShotVisualLayer/v2",
    channel: channelName,
    source,
    visualJob,
    assetUri: asset.assetUri,
    sourceUrl: null,
    localSha256: asset.localSha256,
    prompt: null,
    promptSha256: null,
    emptyReason,
    independent: true,
    reviewStatus: source === "none" ? "not-required" : "pending",
    ...extras,
  };
}

export function createFusedEditorialV2H47Compiler({rendererPublicDir}: {rendererPublicDir: string}) {
  const assetFromUri = (uri: string | null): AssetBinding => {
    if (!uri) return {assetUri: null, localSha256: null};
    const file = path.join(rendererPublicDir, uri);
    return fs.existsSync(file) ? {assetUri: uri, localSha256: shaFile(file)} : {assetUri: null, localSha256: null};
  };
  const assetFromLayer = (layer: any): AssetBinding => {
    if (!layer?.asset || typeof layer.asset !== "string") return {assetUri: null, localSha256: null};
    const uri = layer.asset.replace(/^\//u, "");
    const file = path.join(rendererPublicDir, uri);
    if (!fs.existsSync(file)) return {assetUri: null, localSha256: null};
    return {assetUri: uri, localSha256: /^[a-f0-9]{64}$/u.test(layer.assetSha256 || "") ? layer.assetSha256 : shaFile(file)};
  };

  return function compileFusedEditorialV2Shot(scene: any, index: number, previous: string | null, previousPrevious: string | null) {
    const semantic = scene.storyboard?.semanticDecision || {};
    const family = pickSceneFamily(scene, index, previous, previousPrevious);
    const backgroundAsset: AssetBinding = {assetUri: null, localSha256: null};
    const existingMaterialAsset = assetFromLayer(layerFromScene(scene, "midground-object"));
    const fallbackAssets = fallbackMaterialByFamily[family] || [];
    const fallbackAsset = fallbackAssets.length ? assetFromUri(fallbackAssets[index % fallbackAssets.length]) : {assetUri: null, localSha256: null};
    const materialAsset = existingMaterialAsset.assetUri ? existingMaterialAsset : fallbackAsset;
    const existingForegroundAsset = assetFromLayer(layerFromScene(scene, "foreground-subject"));
    const foregroundAsset = family === "cutout-collage" ? assetFromUri("layered-anchor-v2/final/h03-paper-spiral.png") : family === "dark-verdict" ? assetFromUri("layered-anchor-v2/final/h11-direction-cluster.png") : family === "quiet-bridge" ? existingForegroundAsset : {assetUri: null, localSha256: null};
    const headlineLines = Array.isArray(scene.titleLines) && scene.titleLines.length ? scene.titleLines : [String(scene.screenText || scene.presentation?.primary || "")];
    const sourceMaterial = materialAsset.assetUri ? "article-source" : "none";
    const sourceForeground = foregroundAsset.assetUri ? "style-pack" : "none";
    const sourceBackground = backgroundAsset.assetUri ? "style-pack" : "none";
    const elementKinds = new Set<string>();
    if (String(semantic.shotType || "").includes("selection") || scene.family === "insertion-flow") elementKinds.add("selection");
    if (scene.family === "process-chain" || String(semantic.visualIntent || "").includes("path")) elementKinds.add("relationship-path");
    if (scene.family === "model-comparison") elementKinds.add("metric");
    if (scene.family === "direction-convergence") elementKinds.add("direction");
    if (scene.family === "annotation-judgement") elementKinds.add("annotation");
    if (!elementKinds.size) elementKinds.add("label");
    const role = index === 0 ? "film-title" : index === 46 ? "finale" : scene.family === "model-comparison" ? "metric" : scene.family === "annotation-judgement" ? "annotation" : "headline";
    const familyRole = role === "metric" ? "number" : role === "annotation" ? "annotation" : role === "film-title" ? "condensed-title" : role === "finale" || family === "dark-verdict" || family === "cutout-collage" ? "judgement" : "body";
    const support = String(scene.presentation?.secondary || "").trim() || null;
    const design = {
      contract: "A1LayeredShotDesign/v2" as const,
      shotId: String(scene.beatId),
      order: index + 1,
      visualMasterId: "fused-editorial-v2" as const,
      sceneFamily: family,
      narrative: {
        task: String(semantic.visualJob || scene.presentation?.state || "推进文章叙事"),
        importance: Math.max(1, Math.min(5, Math.round(Number(scene.storyboard?.arcIntensity || .5) * 5))),
        visualFocus: String(scene.storyboard?.visualFocusText || scene.screenText || scene.presentation?.primary || ""),
        whyThisShotExists: String(semantic.reason || "让当前语义判断拥有独立画面，并把决定交给下一镜。"),
        carryIn: index ? `承接 ${String(scene.storyboard?.semanticDecision?.microbeatPhase || "上一镜")}` : "从文章开场建立主视觉对象",
        carryOut: index < 46 ? `把${String(scene.storyboard?.semanticDelta || "当前判断")}交给下一镜` : "收束为作者仍可决定的方向",
      },
      layers: {
        background: {...channel("background", sourceBackground, "建立融合母版的纸张或黑墨底色", backgroundAsset, sourceBackground === "none" ? "使用确定性纸张/黑场，不额外塞入配图。" : null), mode: scene.backgroundState === "carbon-conflict" ? "ink" : "paper"},
        material: {...channel("material", sourceMaterial, sourceMaterial === "none" ? "明确本镜由文字与语义元素承担，不伪造证据素材" : "承载当前语义任务的编辑材料", materialAsset, sourceMaterial === "none" ? "当前句的语言或确定性关系图已经是主事件。" : null), mode: sourceMaterial === "none" ? "none" : "editorial-image", evidenceAllowed: false},
        foreground: {...channel("foreground", sourceForeground, sourceForeground === "none" ? "不增加假前景，保持画面留白" : "建立材料与文字之间的空间前景", foregroundAsset, sourceForeground === "none" ? "当前镜头没有通过遮罩审片的独立前景。" : null), mode: sourceForeground === "none" ? "none" : "depth-plane", maskAssetId: null},
        semanticElements: {...channel("semanticElements", "deterministic", "让线、标签、选择和方向只附着于当前语义对象", {assetUri: null, localSha256: null}, null), elementKinds: [...elementKinds] as any, attachTo: ["headline", String(scene.family)], decorative: false},
        typography: {...channel("typography", "editable-text", "用真实字体承载可编辑中文判断", {assetUri: null, localSha256: null}, null), source: "editable-text", role, familyRole, editableCopy: {headlineLines, support, number: role === "metric" ? String(index + 1).padStart(2, "0") : null, annotation: null}, bakedTitle: {enabled: false, assetUri: null, ocrStatus: "not-required", humanCharacterReview: "not-required", editableTruth: null}},
        finish: {...channel("finish", "deterministic", "统一纸张颗粒、印刷错位、调色和边缘融合", {assetUri: null, localSha256: null}, null), treatments: family === "dark-verdict" ? ["paper-grain", "chromatic-echo", "unified-grade"] : ["paper-grain", "unified-grade", "edge-blend"]},
      },
      treatment: {crop: sourceMaterial === "none" ? "none" : "cinematic-crop", cropAlternatives: sourceMaterial === "none" ? [] : [`${scene.beatId}-contain`, `${scene.beatId}-focal-cover`, `${scene.beatId}-cinematic-crop`], selectedCropId: sourceMaterial === "none" ? null : `${scene.beatId}-cinematic-crop`, cutout: "not-needed", textSafeArea: {left: .05, top: .08, right: .95, bottom: .9}},
      review: {status: "pending-visual-review" as const, structurePass: true, humanVisualApprovalRequired: true as const, blockers: []},
    };
    return A1LayeredShotDesignV2Schema.parse(design);
  };
}

export type FusedEditorialV2H47Compiler = ReturnType<typeof createFusedEditorialV2H47Compiler>;
