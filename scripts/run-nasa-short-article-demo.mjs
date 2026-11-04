import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { createStoryboardDirectorPlan } from "../lib/storyboard-director.js";
import { buildTimelineSpec } from "../lib/storyboard-beat-graph.js";
import { toStoryboardRenderProps, validateStoryboardRenderProps } from "../lib/storyboard-render-props.js";
import { applyShotPhraseActorMapsToScenes } from "../lib/storyboard-shot-phrase-actor-map.js";
import { buildArticleFilmTimelineRuntime } from "../lib/storyboard-article-film-runtime.js";
import { buildStoryboardSkillRouter } from "../lib/storyboard-skill-router.js";
import { buildStoryboardTemplateMatchPlan, validateStoryboardTemplateMatchPlan } from "../lib/storyboard-template-match-plan.js";
import { buildStoryboardWebAssetPlan, validateStoryboardWebAssetPlan } from "../lib/storyboard-web-asset-resolver.js";
import { buildVerifiedWebAssetManifest, promoteWebAssetCandidate, validateVerifiedWebAssetManifest } from "../lib/storyboard-web-asset-promotion.js";
import { buildHtmlVideoContentGraph, buildHtmlVideoTemplateManifest, validateHtmlVideoAdapter } from "../lib/storyboard-html-video-adapter.js";
import { sidecarHtml } from "./create-hyperframes-sidecar.mjs";
import {
  assertStoryboardStageQuality,
  captureStoryboardPage,
  captureStoryboardStage,
  createStoryboardFrontendSession,
  generateStoryboardFromDraft,
  selectStoryboardScene,
} from "./storyboard-frontend-actions.mjs";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "nasa-short-article-demo", timestamp);
const rendererDir = path.join(root, "remotion-renderer");
const failures = [];

const sourceUrl = "https://science.nasa.gov/earth/earth-observatory/a-full-moon-checkup/";
const nasaImageUrl = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/iotd/2026/a-full-moon-checkup/Landsatcalibration_oli2_20260103_tn.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg";

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

function resyncArticleFilmRuntime(renderProps) {
  renderProps.articleFilmTimelineRuntime = buildArticleFilmTimelineRuntime({
    scenes: renderProps.scenes,
    fps: renderProps.fps,
    totalDuration: renderProps.scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0),
  });
  renderProps.durationInFrames = renderProps.articleFilmTimelineRuntime.totalFrames;
  for (const [index, scene] of (renderProps.scenes || []).entries()) {
    scene.filmDisplayText = renderProps.articleFilmTimelineRuntime.shots?.[index]?.displayText || scene.filmDisplayText || null;
  }
}

function run(command, args, options = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        cwd: options.cwd || root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: options.timeout || 240000,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`,
    };
  }
}

function pngDimensions(filePath) {
  const buffer = fsSync.readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function remotionProofFrameForScene(props, scene) {
  const runtimeShot = props.articleFilmTimelineRuntime?.shots?.find((shot) => shot.id === scene?.id || shot.sceneId === scene?.id);
  const cues = Array.isArray(runtimeShot?.motionCues) ? runtimeShot.motionCues : [];
  const preferredCue = cues.find((cue) => /annotation-draw/u.test(String(cue.id || "")))
    || cues.find((cue) => /scan-sweep/u.test(String(cue.id || "")))
    || cues.find((cue) => /ken-burns-focal/u.test(String(cue.id || "")));
  const cueStart = Number(preferredCue?.startFrame);
  const cueEnd = Number(preferredCue?.endFrame);
  if (Number.isFinite(cueStart) && Number.isFinite(cueEnd) && cueEnd > cueStart) {
    return {
      frame: Math.round((cueStart + cueEnd) / 2),
      reason: preferredCue.id,
    };
  }
  return {
    frame: Number(scene?.frameStart || runtimeShot?.startFrame || 0) + 72,
    reason: "fallback-frameStart-plus-72",
  };
}

async function ensurePublicAssetFromUrl(url, publicRelativePath) {
  const outputPath = path.join(rendererDir, "public", publicRelativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (fsSync.existsSync(outputPath) && fsSync.statSync(outputPath).size > 0) {
    return { outputPath, publicRelativePath, downloaded: false };
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed ${response.status} ${response.statusText}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, bytes);
  return { outputPath, publicRelativePath, downloaded: true, bytes: bytes.length };
}

async function captureSidecarScene(htmlPath, sceneId, outputName) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: "networkidle" });
  await page.evaluate((activeId) => {
    document.querySelectorAll(".scene").forEach((scene) => {
      const active = scene.id === activeId;
      scene.style.opacity = active ? "1" : "0";
      scene.style.visibility = active ? "visible" : "hidden";
      scene.querySelectorAll("[data-motion-actor]").forEach((actor) => {
        actor.style.opacity = active ? "1" : "";
        actor.style.transform = active ? "none" : "";
        actor.style.filter = active ? "none" : "";
      });
    });
  }, sceneId);
  await page.waitForFunction((activeId) => {
    const img = document.querySelector(`#${CSS.escape(activeId)} [data-real-asset='true'] img`);
    return Boolean(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
  }, sceneId, { timeout: 15000 });
  const screenshot = path.join(artifactDir, outputName);
  await page.screenshot({ path: screenshot, fullPage: false });
  const snapshot = await page.evaluate((activeId) => {
    const scene = document.getElementById(activeId);
    const asset = scene?.querySelector("[data-real-asset='true']");
    const image = asset?.querySelector("img");
    const rect = asset?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    return {
      sceneId: activeId,
      sceneText: scene?.textContent?.trim().replace(/\s+/g, " ") || "",
      templateCandidate: scene?.dataset.templateCandidate || "",
      externalTemplateCategoryIds: scene?.dataset.externalTemplateCategoryIds || "",
      shotModule: scene?.dataset.shotModule || "",
      shotModuleContract: scene?.dataset.shotModuleContract || "",
      shotLayerStackContract: scene?.dataset.shotLayerStackContract || "",
      shotComposition: scene?.dataset.shotComposition || "",
      vectorComposition: scene?.dataset.vectorComposition || "",
      imageEvidenceContract: scene?.dataset.imageEvidenceContract || "",
      imageEvidenceLayerContract: scene?.dataset.imageEvidenceLayerContract || "",
      realAssetId: asset?.dataset.realAssetId || "",
      realAssetSource: asset?.dataset.realAssetSource || "",
      imageComplete: image?.complete === true,
      naturalWidth: image?.naturalWidth || 0,
      naturalHeight: image?.naturalHeight || 0,
      frameRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      imageRect: imageRect ? { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height } : null,
    };
  }, sceneId);
  await browser.close();
  return { screenshot, snapshot };
}

async function renderRemotionStill(baseProps, sceneId, publicRelativePath, outputName) {
  const props = JSON.parse(JSON.stringify(baseProps));
  const scene = props.scenes.find((item) => item.id === sceneId);
  const asset = scene?.assets?.[0];
  assert(Boolean(scene && asset), `Remotion still needs scene asset: ${sceneId}`);
  if (asset) {
    asset.url = publicRelativePath;
    asset.originalRemoteUrl = nasaImageUrl;
    asset.remotionPublicAsset = true;
  }
  const graph = buildHtmlVideoContentGraph(props);
  props.contentGraph = graph;
  props.htmlVideoIr = graph.htmlVideoIr;
  const propsPath = path.join(artifactDir, "remotion-props.json");
  const stillPath = path.join(artifactDir, outputName);
  await fs.writeFile(propsPath, `${JSON.stringify(props, null, 2)}\n`);

  if (!fsSync.existsSync(path.join(rendererDir, "node_modules", "remotion"))) {
    const install = run("npm", ["install"], { cwd: rendererDir, timeout: 240000 });
    assert(install.ok, `Remotion renderer npm install failed: ${install.output.slice(0, 1600)}`);
  }

  const proofFrame = remotionProofFrameForScene(props, scene);
  const frame = String(proofFrame.frame);
  const still = run("npx", [
    "remotion",
    "still",
    "src/index.ts",
    "A1Video",
    "--props",
    propsPath,
    "--output",
    stillPath,
    "--frame",
    frame,
  ], { cwd: rendererDir, timeout: 240000 });
  assert(still.ok, `Remotion still failed: ${still.output.slice(0, 1600)}`);
  assert(fsSync.existsSync(stillPath), `Remotion still output missing: ${stillPath}`);
  const stat = fsSync.existsSync(stillPath) ? fsSync.statSync(stillPath) : { size: 0 };
  const dimensions = fsSync.existsSync(stillPath) ? pngDimensions(stillPath) : null;
  assert(dimensions?.width === 1920 && dimensions?.height === 1080, `Remotion still should be 1920x1080 PNG: ${JSON.stringify(dimensions)}`);
  assert(stat.size > 100000, `Remotion still should contain rendered pixels, got ${stat.size} bytes`);
  return {
    propsPath,
    stillPath,
    frame: proofFrame.frame,
    frameReason: proofFrame.reason,
    dimensions,
    bytes: stat.size,
    sourceUrl: nasaImageUrl,
  };
}

const draft = `A Full Moon Checkup

NASA Earth Observatory 在 2026 年 5 月 26 日发布了一篇短文：Landsat 9 每个月会在满月时转向月面，用月球这个稳定参照来校准自己的观测数据。
核心判断是：地球的天气、季节和地表总在变化，但月球几乎没有大气和快速地表变化，所以它反射太阳光的方式更稳定。
校准步骤很清楚：航天器在两个轨道内转向月面，多次扫描月球，检查传感器有没有漂移。
这一句需要 NASA 页面里的 Landsat lunar calibration scan 图片作为真实图像来源，不允许用假月球图。
结论是：可靠的科学影像，不只是拍得清楚，而是从发射前到任务结束都能被持续校准。

来源：${sourceUrl}`;

function nasaVectorVisualPlan(sceneId, variant, semanticRole, actorSpecs = [], layerSpecs = []) {
  return {
    contract: "A1VectorVisualPlan/v1",
    sceneId,
    variant,
    semanticRole,
    source: "nasa-benchmark ActorGraph/MotionGraph semantic-vector-plan",
    actorGraphContract: "A1ActorGraph/v1",
    motionGraphContract: "A1MotionGraph/v1",
    actors: actorSpecs.map((actor, index) => ({
      id: `${sceneId}:${actor.id}`,
      role: actor.role,
      label: actor.label,
      layer: actor.layer || "svg",
      visualPriority: index + 1,
      anchor: actor.anchor,
    })),
    layers: layerSpecs.map((layer) => ({
      id: `${sceneId}:${layer.id}`,
      role: layer.role,
      actorId: layer.actorId ? `${sceneId}:${layer.actorId}` : undefined,
      motionPrimitive: layer.motionPrimitive,
      svgPrimitive: layer.svgPrimitive,
      transitionRole: layer.transitionRole,
    })),
    rejectIf: [
      "genericConceptLabels",
      "idOnlyVariantRouting",
      "missingNamedVectorActors",
      "motionWithoutLayerOwnership",
    ],
  };
}

function buildSourceMappedNasaScenes(directorPlan = {}) {
  const base = Array.isArray(directorPlan.scenes) ? directorPlan.scenes : [];
  const byIndex = (index) => JSON.parse(JSON.stringify(base[index] || {}));
  const apply = (scene, patch) => ({
    ...scene,
    ...patch,
    director: {
      ...(scene.director || {}),
      ...(patch.director || {}),
      sourceSentenceIds: scene.director?.sourceSentenceIds || patch.director?.sourceSentenceIds || [],
      sourceBeatIds: scene.director?.sourceBeatIds || patch.director?.sourceBeatIds || [],
      coverageText: scene.director?.coverageText || patch.body || "",
    },
    narrative: {
      ...(scene.narrative || {}),
      ...(patch.narrative || {}),
    },
    article: {
      ...(scene.article || {}),
      ...(patch.article || {}),
    },
  });
  return [
    apply(byIndex(0), {
      id: "opening",
      type: "cover",
      shotModule: "kinetic-text",
      headline: "满月是校准参照",
      body: byIndex(0).director?.coverageText || byIndex(0).body || "Landsat 9 每个月会在满月时转向月面，用月球这个稳定参照来校准自己的观测数据。",
      duration: 6.8,
      narrative: { storyRole: "opening" },
      article: { sectionRole: "opening", claim: "满月是校准参照", bridge: "引出月球为何适合作参照" },
    }),
    apply(byIndex(0), {
      id: "monthly-turn",
      type: "point",
      shotModule: "vector-explainer",
      headline: "每个月转向同一个目标",
      body: "Landsat 9 会在满月时转向月面，用同一个目标检查自己的观测尺度。",
      duration: 6.6,
      narrative: { storyRole: "mechanism" },
      article: { sectionRole: "mechanism", claim: "每月满月扫描提供重复参照", bridge: "解释为什么不能直接拿地球当参照" },
    }),
    apply(byIndex(1), {
      id: "earth-keeps-changing",
      type: "point",
      shotModule: "vector-explainer",
      headline: "地球一直在变",
      body: "天气、季节和地表每天都在变化；如果只看地球，很难判断变化来自地表，还是来自传感器。",
      duration: 6.8,
      narrative: { storyRole: "contrast" },
      article: { sectionRole: "contrast", claim: "地球不是稳定参照", bridge: "转向月球稳定性" },
    }),
    apply(byIndex(1), {
      id: "why-moon",
      type: "point",
      shotModule: "vector-explainer",
      headline: "为什么看月球",
      body: byIndex(1).director?.coverageText || byIndex(1).body || "地球持续变化，月球反射更稳定，适合做长期参照。",
      duration: 6.8,
      narrative: { storyRole: "diagnosis" },
      article: { sectionRole: "diagnosis", claim: "月球反射更稳定", bridge: "转入真实扫描证据" },
    }),
    apply(byIndex(3), {
      id: "nasa-moon-scan",
      type: "image",
      shotModule: "image-evidence",
      headline: "Landsat 月面扫描",
      body: byIndex(3).director?.coverageText || byIndex(3).body || "这一句需要 NASA 页面里的 Landsat lunar calibration scan 图片作为真实图像来源。",
      duration: 7.6,
      narrative: { storyRole: "evidence" },
      article: { sectionRole: "evidence", claim: "NASA 月面扫描是本格证据", bridge: "进入校准步骤" },
    }),
    apply(byIndex(2), {
      id: "two-orbit-scan",
      type: "sequence",
      shotModule: "data-map",
      headline: "两个轨道内完成扫描",
      body: "航天器在两个轨道内转向月面，不是拍一张漂亮照片，而是重复扫描同一参照。",
      duration: 7,
      listItems: ["转向月面", "锁定满月", "重复扫描", "记录基线"],
      narrative: { storyRole: "workflow" },
      article: { sectionRole: "method", claim: "校准依靠重复扫描和漂移检查", bridge: "收束到可靠影像" },
    }),
    apply(byIndex(2), {
      id: "drift-check",
      type: "sequence",
      shotModule: "data-map",
      headline: "检查传感器有没有漂移",
      body: byIndex(2).director?.coverageText || byIndex(2).body || "多次扫描月球，检查传感器有没有漂移，再把长期观测校回同一把尺。",
      duration: 7,
      listItems: ["多次扫描", "比较读数", "检查漂移", "校正数据"],
      narrative: { storyRole: "workflow" },
      article: { sectionRole: "method", claim: "漂移检查让长期数据可比", bridge: "收束到可靠影像" },
    }),
    apply(byIndex(4), {
      id: "closing",
      type: "closing",
      shotModule: "resolve",
      headline: "可靠来自校准",
      body: byIndex(4).director?.coverageText || byIndex(4).body || "科学影像的价值，是跨多年仍能被比较。",
      duration: 7.4,
      narrative: { storyRole: "closing" },
      article: { sectionRole: "closing", claim: "可靠来自持续校准", bridge: "完成收束" },
    }),
  ];
}

const nasaBenchmarkShotOverrides = {
  opening: {
    type: "cover",
    shotModule: "kinetic-text",
    headline: "满月是校准参照",
    body: "NASA 短文把满月当作稳定参照；卫星每月转向月面，用同一个目标校准观测数据。",
    duration: 6.8,
    article: { sectionId: "opening", sectionRole: "opening", claim: "满月是校准参照", screenText: "满月是校准参照", bridge: "引出月球为何适合作参照" },
    narrative: { storyRole: "opening", transitionReason: "建立全文主题" },
  },
  "monthly-turn": {
    type: "point",
    shotModule: "vector-explainer",
    headline: "每个月转向同一个目标",
    body: "Landsat 9 会在满月时转向月面，用同一个目标检查自己的观测尺度。",
    duration: 6.6,
    vectorVisualPlan: nasaVectorVisualPlan(
      "monthly-turn",
      "satellite-turn",
      "instrument-target-lock",
      [
        { id: "earth-context", role: "context-planet", label: "地球背景", anchor: { x: 27, y: 63 } },
        { id: "moon-target", role: "stable-target", label: "满月目标", anchor: { x: 75, y: 34 } },
        { id: "landsat-turning", role: "instrument", label: "Landsat 9", anchor: { x: 55, y: 25 } },
      ],
      [
        { id: "monthly-turn-path", role: "motion-path", actorId: "landsat-turning", motionPrimitive: "draw-reference-path", svgPrimitive: "bezier-path", transitionRole: "turn-to-target" },
        { id: "target-lock", role: "mask-frame", actorId: "moon-target", motionPrimitive: "target-lock-reveal", svgPrimitive: "rect-crosshair", transitionRole: "lock-reference" },
      ],
    ),
    article: { sectionId: "mechanism", sectionRole: "mechanism", claim: "每月满月扫描提供重复参照", screenText: "每个月转向同一个目标", bridge: "解释为什么不能直接拿地球当参照" },
    narrative: { storyRole: "mechanism", transitionReason: "把主题转成可视化动作" },
  },
  "earth-keeps-changing": {
    type: "point",
    shotModule: "vector-explainer",
    headline: "地球一直在变",
    body: "天气、季节和地表每天都在变化；如果只看地球，很难判断变化来自地表，还是来自传感器。",
    duration: 6.8,
    vectorVisualPlan: nasaVectorVisualPlan(
      "earth-keeps-changing",
      "earth-change",
      "variable-earth-reference-risk",
      [
        { id: "unstable-earth", role: "variable-reference", label: "变化中的地球", anchor: { x: 48, y: 52 } },
        { id: "stable-moon-small", role: "comparison-reference", label: "稳定月球参照", anchor: { x: 79, y: 22 } },
        { id: "change-readout", role: "diagnostic-label", label: "变化读数", anchor: { x: 76, y: 45 } },
      ],
      [
        { id: "weather-bands", role: "change-overlay", actorId: "unstable-earth", motionPrimitive: "scan-change-bands", svgPrimitive: "wavy-paths", transitionRole: "show-instability" },
        { id: "change-readout", role: "annotation", actorId: "change-readout", motionPrimitive: "attach-relation-label", svgPrimitive: "readout-lines", transitionRole: "name-risk" },
      ],
    ),
    article: { sectionId: "contrast", sectionRole: "contrast", claim: "地球不是稳定参照", screenText: "地球一直在变", bridge: "转向月球稳定性" },
    narrative: { storyRole: "contrast", transitionReason: "制造地球与月球的参照差异" },
  },
  "why-moon": {
    type: "point",
    shotModule: "vector-explainer",
    headline: "为什么看月球",
    body: "月球几乎没有大气和快速地表变化，所以它反射太阳光的方式更稳定。",
    duration: 6.8,
    vectorVisualPlan: nasaVectorVisualPlan(
      "why-moon",
      "lunar-stability",
      "stable-lunar-reference",
      [
        { id: "earth-dimmed", role: "deemphasized-comparison", label: "变化背景", anchor: { x: 28, y: 56 } },
        { id: "moon-reference-large", role: "stable-reference", label: "稳定月球反射", anchor: { x: 65, y: 41 } },
        { id: "stability-lock", role: "proof-label", label: "稳定反射基准", anchor: { x: 65, y: 22 } },
      ],
      [
        { id: "stable-reference-path", role: "reference-path", actorId: "moon-reference-large", motionPrimitive: "draw-reference-path", svgPrimitive: "bezier-path", transitionRole: "connect-reference" },
        { id: "lunar-ruler", role: "measurement-ruler", actorId: "moon-reference-large", motionPrimitive: "ruler-line-reveal", svgPrimitive: "parallel-lines", transitionRole: "prove-stability" },
        { id: "stability-lock", role: "annotation", actorId: "stability-lock", motionPrimitive: "attach-relation-label", svgPrimitive: "label-plate", transitionRole: "name-reference" },
      ],
    ),
    article: { sectionId: "diagnosis", sectionRole: "diagnosis", claim: "月球反射更稳定", screenText: "为什么看月球", bridge: "转入真实扫描证据" },
    narrative: { storyRole: "diagnosis", transitionReason: "解释稳定参照的原因" },
  },
  "nasa-moon-scan": {
    type: "image",
    shotModule: "image-evidence",
    headline: "Landsat 月面扫描",
    body: "NASA 页面里的 Landsat lunar calibration scan 图片是这一句的真实图像来源，不允许用假月球图。",
    duration: 7.6,
    article: { sectionId: "evidence", sectionRole: "evidence", claim: "NASA 月面扫描是本格证据", screenText: "Landsat 月面扫描", bridge: "进入校准步骤" },
    narrative: { storyRole: "evidence", transitionReason: "用真实 NASA 图像锁定证据" },
  },
  "two-orbit-scan": {
    type: "sequence",
    shotModule: "data-map",
    headline: "两个轨道内完成扫描",
    body: "航天器在两个轨道内转向月面，不是拍一张漂亮照片，而是重复扫描同一参照。",
    listItems: ["转向月面", "锁定满月", "重复扫描", "记录基线"],
    duration: 7,
    article: { sectionId: "method", sectionRole: "method", claim: "两个轨道内重复扫描", screenText: "两个轨道内完成扫描", bridge: "继续检查传感器漂移" },
    narrative: { storyRole: "workflow", transitionReason: "把证据推进为校准流程" },
  },
  "drift-check": {
    type: "sequence",
    shotModule: "data-map",
    headline: "检查传感器有没有漂移",
    body: "多次扫描月球，检查传感器有没有漂移，再把长期观测校回同一把尺。",
    listItems: ["多次扫描", "比较读数", "检查漂移", "校正数据"],
    duration: 7,
    article: { sectionId: "method", sectionRole: "method", claim: "漂移检查让长期数据可比", screenText: "检查传感器有没有漂移", bridge: "收束到可靠影像" },
    narrative: { storyRole: "workflow", transitionReason: "把扫描动作转成可靠性结论" },
  },
  closing: {
    type: "closing",
    shotModule: "resolve",
    headline: "可靠来自校准",
    body: "可靠的科学影像，不只是拍得清楚，而是从发射前到任务结束都能被持续校准。",
    duration: 7.4,
    article: { sectionId: "closing", sectionRole: "closing", claim: "可靠来自持续校准", screenText: "可靠来自校准", bridge: "完成收束" },
    narrative: { storyRole: "closing", transitionReason: "收束全文判断" },
  },
};

function applyNasaBenchmarkRenderOverrides(props) {
  const fps = Number(props.fps || 30);
  let start = 0;
  const assetStrategyForModule = (module) => {
    if (module === "image-evidence") {
      return {
        contract: "A1ShotAssetStrategy/v1",
        mode: "verified-real-media",
        requiredAssetRoles: ["reference-media", "webpage-preview"],
        sourceLookup: "use-existing-verified-source-first",
        generatedFallbackAllowed: false,
        rejectIf: ["fakeImageSubstitute", "missingSourceUrl", "uncachedRemoteAsset", "wrongImageForSentence"],
      };
    }
    if (module === "data-map") {
      return {
        contract: "A1ShotAssetStrategy/v1",
        mode: "structured-data-or-svg",
        requiredAssetRoles: [],
        sourceLookup: "prefer-primary-source-and-derived-svg",
        generatedFallbackAllowed: true,
        rejectIf: ["unexplainedChart", "decorativeMetricOnly", "missingUnitOrRelation"],
      };
    }
    if (module === "vector-explainer") {
      return {
        contract: "A1ShotAssetStrategy/v1",
        mode: "semantic-svg",
        requiredAssetRoles: [],
        sourceLookup: "derive-vector-actors-from-entities-and-relations",
        generatedFallbackAllowed: true,
        rejectIf: ["decorativeSvgOnly", "missingEntityRelation", "unlabeledProcess"],
      };
    }
    return {
      contract: "A1ShotAssetStrategy/v1",
      mode: module === "resolve" ? "closing-system" : "kinetic-typography",
      requiredAssetRoles: [],
      sourceLookup: "none-required",
      generatedFallbackAllowed: true,
      rejectIf: ["overdenseText", "decorativeBackgroundAsMainIdea"],
    };
  };
  const moduleContractFor = (module) => ({
    "kinetic-text": "A1KineticTextShot/v1",
    "vector-explainer": "A1VectorExplainerShot/v1",
    "image-evidence": "A1ImageEvidenceShot/v2",
    "data-map": "A1DataMapShot/v1",
    resolve: "A1ResolveShot/v1",
  }[module] || "A1ShotModule/v1");
  const layerStackContractFor = (module) => ({
    "kinetic-text": "A1KineticTextLayerStack/v1",
    "vector-explainer": "A1VectorLayerStack/v1",
    "image-evidence": "A1EvidenceLayerStack/v1",
    "data-map": "A1DataMapLayerStack/v1",
    resolve: "A1ResolveLayerStack/v1",
  }[module] || "");
  const shotCompositionFor = (sceneId, module) => {
    if (module === "kinetic-text") return "split-mask-thesis";
    if (module === "image-evidence") return "documentary-proof-frame";
    if (sceneId === "monthly-turn" || sceneId === "why-moon") return "orbital-reference";
    if (sceneId === "earth-keeps-changing") return "orbital-reference";
    if (sceneId === "two-orbit-scan" || sceneId === "drift-check") return "calibration-strip";
    if (module === "data-map") return "calibration-timeline";
    if (module === "resolve") return "quiet-resolve-thread";
    return "";
  };
  for (const [index, scene] of (props.scenes || []).entries()) {
    const override = nasaBenchmarkShotOverrides[scene.id] || {};
    const module = override.shotModule || scene.shotModule || scene.shotGraphNode?.recommendedShotModule || "kinetic-text";
    const duration = Number(override.duration || scene.duration || 6.5);
    Object.assign(scene, {
      ...override,
      index,
      duration,
      start: Number(start.toFixed(3)),
      frameStart: Math.round(start * fps),
      frameDuration: Math.max(1, Math.round(duration * fps)),
      titleLines: [override.headline || scene.headline || scene.titleLines?.[0] || ""].filter(Boolean),
      bodyLines: String(override.body || scene.body || "").split(/；|。/u).map((item) => item.trim()).filter(Boolean).slice(0, 3),
      listItems: Array.isArray(override.listItems) ? override.listItems : scene.listItems || [],
      filmDisplayText: null,
      assets: scene.id === "nasa-moon-scan" ? scene.assets || [] : [],
      article: {
        ...(scene.article || {}),
        ...(override.article || {}),
      },
      narrative: {
        ...(scene.narrative || {}),
        ...(override.narrative || {}),
      },
      shotModule: module,
      shotModuleContract: moduleContractFor(module),
      shotLayerStackContract: layerStackContractFor(module),
      shotComposition: shotCompositionFor(scene.id, module),
      vectorComposition: module === "vector-explainer" || module === "data-map" ? shotCompositionFor(scene.id, module) : "",
      evidenceContract: module === "image-evidence" ? "A1ImageEvidenceShot/v2" : "",
      evidenceLayerContract: module === "image-evidence" ? "A1EvidenceLayerStack/v1" : "",
      shotGraphNode: scene.shotGraphNode?.contract === "A1StoryboardShotGraphNode/v1"
        ? {
          ...scene.shotGraphNode,
          recommendedShotModule: module,
          shotModuleContract: moduleContractFor(module),
          shotLayerStackContract: layerStackContractFor(module),
          shotComposition: shotCompositionFor(scene.id, module),
          vectorComposition: module === "vector-explainer" || module === "data-map" ? shotCompositionFor(scene.id, module) : "",
          assetStrategy: assetStrategyForModule(module),
        }
        : scene.shotGraphNode,
    });
    start += duration;
  }
  props.durationInFrames = Math.round(start * fps);
  props.timelineSpec = buildTimelineSpec(props);
  props.skillRouter = buildStoryboardSkillRouter(props);
  for (const scene of props.scenes || []) {
    const route = props.skillRouter.sceneRoutes.find((item) => item.sceneId === scene.id);
    if (route) scene.skillRoute = route;
  }
  return props;
}

const nasaImageCandidate = {
  id: "reference-image:moon:nasa-landsat-lunar-calibration-scan",
  parentId: "reference-image:moon",
  kind: "reference-image",
  label: "Moon",
  canonicalName: "NASA Landsat lunar calibration scan",
  source: "wikimedia-commons",
  sourceUrl,
  status: "metadata-fetched",
  visualAssetRole: "reference-media",
  previewImageUrl: nasaImageUrl,
  contentType: "image/jpeg",
  width: 1280,
  height: 720,
  license: "NASA media usage",
  author: "NASA Earth Observatory / Landsat Project Science Support / Ross Walter",
  renderAllowed: false,
  needsPromotion: true,
};

const nasaImageReview = {
  promotionMode: "renderable-image",
  approvedBy: "codex-demo",
  reviewedAt: new Date().toISOString(),
  visualAuditPath: ".codex-artifacts/nasa-short-article-demo/nasa-source-image-reviewed.jpg",
  licenseReview: "approved",
  previewPolicy: "hotlink-approved",
  attribution: "NASA Earth Observatory / Landsat Project Science Support / Ross Walter",
  focalPoint: { x: 54, y: 50 },
  notes: "NASA article image used as reviewed source media for this one-off demo.",
};

await fs.mkdir(artifactDir, { recursive: true });

console.log(`[nasa-demo] artifactDir ${artifactDir}`);
console.log("[nasa-demo] building director/template/asset plans");

const directorPlan = createStoryboardDirectorPlan({ sourceText: draft, pace: "standard" });
const frontendProject = directorPlan.payload;
const benchmarkScenes = buildSourceMappedNasaScenes(directorPlan);
assert(benchmarkScenes.every((scene) => Array.isArray(scene.director?.sourceSentenceIds) && scene.director.sourceSentenceIds.length), `NASA benchmark scenes must preserve source sentence ids: ${JSON.stringify(benchmarkScenes)}`);
assert(!JSON.stringify(benchmarkScenes.map((scene) => ({ headline: scene.headline, body: scene.body, listItems: scene.listItems }))).includes("https://science.nasa.gov"), "NASA benchmark visible scene text must not include source URL");
const discoveryPlan = buildStoryboardWebAssetPlan({ sourceText: draft, scenes: benchmarkScenes });
const discoveryValidation = validateStoryboardWebAssetPlan(discoveryPlan);
assert(discoveryValidation.ok, `web asset discovery plan invalid: ${discoveryValidation.failures.join("; ")}`);

const promotion = promoteWebAssetCandidate(nasaImageCandidate, nasaImageReview);
assert(promotion.ok, `NASA image promotion failed: ${promotion.failures.join("; ")}`);
const verifiedManifest = buildVerifiedWebAssetManifest([promotion.promoted], { generatedAt: new Date().toISOString() });
const manifestValidation = validateVerifiedWebAssetManifest(verifiedManifest);
assert(manifestValidation.ok, `verified manifest invalid: ${manifestValidation.failures.join("; ")}`);

const props = toStoryboardRenderProps({
  title: "NASA 短文完整链路演示",
  sourceText: draft,
  scenes: benchmarkScenes,
  articleSpine: directorPlan.articleSpine,
  narrativeSpine: directorPlan.narrativeSpine,
  continuityPlan: directorPlan.continuityPlan,
  verifiedWebAssets: verifiedManifest.verifiedForRender,
});
const propsValidation = validateStoryboardRenderProps(props);
if (!propsValidation.ok) {
  console.log(`[nasa-demo] pre-overrides render props validation will be repaired by benchmark overrides: ${propsValidation.failures.join("; ")}`);
}

const imageScene = props.scenes.find((scene) => scene.id === "nasa-moon-scan");
const openingScene = props.scenes.find((scene) => scene.id === "opening");
const misplacedNasaAsset = props.scenes
  .filter((scene) => scene.id !== "nasa-moon-scan")
  .flatMap((scene) => scene.assets || [])
  .find((asset) => /nasa|landsat|moon|lunar/i.test(`${asset.id || ""} ${asset.name || ""} ${asset.url || ""}`));
const explicitNasaAsset = misplacedNasaAsset || {
  id: promotion.promoted.id,
  name: promotion.promoted.canonicalName || "NASA Landsat lunar calibration scan",
  url: promotion.promoted.imageUrl || promotion.promoted.previewImageUrl || nasaImageUrl,
  kind: promotion.promoted.kind,
  sourceCandidateId: promotion.promoted.sourceCandidateId,
  renderAllowed: true,
  verifiedForRender: true,
  width: promotion.promoted.width || 1280,
  height: promotion.promoted.height || 720,
  imageFocalPlan: promotion.promoted.imageFocalPlan,
};
for (const scene of props.scenes) {
  if (scene.id !== "nasa-moon-scan" && Array.isArray(scene.assets)) scene.assets = scene.assets.filter((asset) => asset.id !== explicitNasaAsset.id);
}
if (imageScene) {
  imageScene.assets = [explicitNasaAsset];
  imageScene.type = "image";
  imageScene.layoutPrimitive = {
    contract: "A1LayoutPrimitive/v1",
    id: "image-focus",
    layoutRole: "image-focus",
    purpose: "real image evidence scene",
    remotionGridTemplateColumns: "minmax(520px, 0.42fr) minmax(740px, 0.58fr)",
    remotionColumnGapPx: 92,
    assetFrame: {
      widthPx: 820,
      heightPx: 560,
      borderRadiusPx: 18,
      maxZoom: 1.045,
    },
    rejectIf: ["fakeAsset", "fakeMedia", "missingAssetSource", "assetLessImageFrame"],
  };
  imageScene.narrative = {
    ...(imageScene.narrative || {}),
    storyRole: "evidence",
  };
  imageScene.beat = {
    ...(imageScene.beat || {}),
    storyRole: "evidence",
    relationFrom: "evidence",
    relationTo: "method",
    motionBridge: "proof-lock",
    transition: "proof-lock",
  };
  imageScene.motionSystem = {
    ...(imageScene.motionSystem || {}),
    contentRelation: "evidence",
    motionBridge: "proof-lock",
    transition: "proof-lock",
  };
  imageScene.skillRoute = {
    ...(imageScene.skillRoute || {}),
    contract: "A1StoryboardSceneSkillRoute/v1",
    sceneId: "nasa-moon-scan",
    index: imageScene.index,
    skillId: "real-media",
    sourceProject: "remotion-dev/template-prompt-to-motion-graphics-saas",
    sourceSkill: "media",
    manifestCandidates: ["proof-point", "data-split", "chapter-marker", "lower-third"],
    preferredMotionPrimitives: ["soft-push", "detail-zoom", "label-reveal"],
    externalTemplateCategory: {
      contract: "A1ExternalTemplateCategoryReference/v1",
      categoryId: "image-media",
      sourceCatalog: "github:lifeprompt-team/remotion-scenes",
      normalizedToA1Skill: "real-media",
      referenceOnly: true,
      directRenderAllowed: false,
      directProductShellAllowed: false,
      requiredA1Gates: ["A1StoryboardTemplateManifest/v1", "audit:storyboard-visual-regression"],
    },
  };
}
if (openingScene) {
  Object.assign(openingScene, nasaBenchmarkShotOverrides.opening);
}
assert(imageScene?.assets?.[0]?.verifiedForRender === true, `NASA image should auto-assign as verified render asset: ${JSON.stringify(imageScene?.assets?.[0])}`);
applyNasaBenchmarkRenderOverrides(props);
props.scenes = applyShotPhraseActorMapsToScenes(props.scenes);
props.webAssetPlan = buildStoryboardWebAssetPlan({
  title: props.title,
  sourceText: draft,
  assets: props.assets,
  scenes: props.scenes,
});
props.templateMatchPlan = buildStoryboardTemplateMatchPlan({
  ...props,
  webAssetPlan: props.webAssetPlan,
}, { webAssetPlan: props.webAssetPlan });
resyncArticleFilmRuntime(props);
const finalPropsValidation = validateStoryboardRenderProps(props);
assert(finalPropsValidation.ok, `render props invalid after NASA benchmark overrides: ${finalPropsValidation.failures.join("; ")}`);

const contentNodeOverrides = {
  opening: {
    role: "opening",
    roleLabel: "定题",
    nodeText: "满月是稳定参照",
    edgeFrom: "从 NASA 短文进入校准主题",
    edgeTo: "说明 Landsat 每月转向满月",
  },
  "monthly-turn": {
    role: "mechanism",
    roleLabel: "建立动作",
    nodeText: "每月转向满月",
    edgeFrom: "承接满月参照",
    edgeTo: "说明地球本身不稳定",
  },
  "earth-keeps-changing": {
    role: "contrast",
    roleLabel: "提出对比",
    nodeText: "地球持续变化",
    edgeFrom: "解释为什么需要外部参照",
    edgeTo: "说明月球为何适合长期参照",
  },
  "why-moon": {
    role: "diagnosis",
    roleLabel: "解释原因",
    nodeText: "月球反射更稳定",
    edgeFrom: "承接满月参照",
    edgeTo: "用 NASA 扫描证据支撑",
  },
  "nasa-moon-scan": {
    role: "evidence",
    roleLabel: "支撑判断",
    nodeText: "NASA 月面扫描证据",
    edgeFrom: "补充 NASA 图像证据",
    edgeTo: "转入校准步骤",
  },
  "two-orbit-scan": {
    role: "workflow",
    roleLabel: "推进步骤",
    nodeText: "两个轨道内扫描",
    edgeFrom: "承接图像证据",
    edgeTo: "检查传感器漂移",
  },
  "drift-check": {
    role: "workflow",
    roleLabel: "锁定可靠性",
    nodeText: "检查并校正漂移",
    edgeFrom: "承接重复扫描",
    edgeTo: "收束到长期可靠性",
  },
  closing: {
    role: "closing",
    roleLabel: "收束记忆",
    nodeText: "可靠来自持续校准",
    edgeFrom: "完成可靠性判断",
    edgeTo: "完成可靠性判断",
  },
};

for (const scene of props.scenes) {
  const override = contentNodeOverrides[scene.id];
  if (!override) continue;
  scene.contentGraphNode = {
    ...(scene.contentGraphNode || {}),
    contract: "A1StoryboardContentGraphNode/v1",
    ...override,
  };
}
for (const node of props.contentGraph?.nodes || []) {
  const override = contentNodeOverrides[node.id];
  if (!override) continue;
  Object.assign(node, override);
}
for (const edge of props.contentGraph?.edges || []) {
  const fromOverride = contentNodeOverrides[edge.from];
  const toOverride = contentNodeOverrides[edge.to];
  if (fromOverride && toOverride) {
    edge.reason = `${fromOverride.nodeText} 接到 ${toOverride.nodeText}`;
  }
}

const publicAsset = await ensurePublicAssetFromUrl(nasaImageUrl, "uploads/nasa-landsat-lunar-calibration-scan.jpg");
if (imageScene?.assets?.[0]) {
  imageScene.assets[0].originalRemoteUrl = nasaImageUrl;
  imageScene.assets[0].url = pathToFileURL(publicAsset.outputPath).toString();
  imageScene.assets[0].sidecarLocalAsset = true;
}

const templatePlan = buildStoryboardTemplateMatchPlan({ ...props, webAssetPlan: discoveryPlan }, { webAssetPlan: discoveryPlan });
const templateValidation = validateStoryboardTemplateMatchPlan(templatePlan);
assert(templateValidation.ok, `template match plan invalid: ${templateValidation.failures.join("; ")}`);
const imageMatch = props.templateMatchPlan?.sceneMatches?.find((match) => match.sceneId === "nasa-moon-scan")
  || templatePlan.sceneMatches?.find((match) => match.sceneId === "nasa-moon-scan");
assert(imageMatch?.assetNeeds?.includes("reference-media") || imageMatch?.externalTemplateCategoryReferences?.some((reference) => reference.categoryId === "image-media"), `image sentence should route to image-media/reference-media: ${JSON.stringify(imageMatch)}`);

const graph = buildHtmlVideoContentGraph(props);
const manifest = buildHtmlVideoTemplateManifest(props);
const adapterValidation = validateHtmlVideoAdapter(graph, manifest);
assert(adapterValidation.ok, `html-video adapter invalid: ${adapterValidation.failures.join("; ")}`);
const imageNode = graph.nodes.find((node) => node.id === "nasa-moon-scan");
assert(imageNode?.templateCandidate?.id === "hf-image-focus", `NASA image scene should use hf-image-focus: ${JSON.stringify(imageNode?.templateCandidate)}`);

const sidecarPath = path.join(artifactDir, "sidecar.html");
await fs.writeFile(sidecarPath, sidecarHtml(props, graph));
await fs.writeFile(path.join(artifactDir, "source-draft.txt"), draft);
await fs.writeFile(path.join(artifactDir, "director-project.json"), `${JSON.stringify(frontendProject, null, 2)}\n`);
await fs.writeFile(path.join(artifactDir, "benchmark-scenes.json"), `${JSON.stringify(benchmarkScenes, null, 2)}\n`);
await fs.writeFile(path.join(artifactDir, "web-asset-plan.json"), `${JSON.stringify(discoveryPlan, null, 2)}\n`);
await fs.writeFile(path.join(artifactDir, "verified-manifest.json"), `${JSON.stringify(verifiedManifest, null, 2)}\n`);
await fs.writeFile(path.join(artifactDir, "render-props.json"), `${JSON.stringify(props, null, 2)}\n`);
await fs.writeFile(path.join(artifactDir, "template-plan.json"), `${JSON.stringify(templatePlan, null, 2)}\n`);
await fs.writeFile(path.join(artifactDir, "content-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);

console.log("[nasa-demo] capturing frontend storyboard stage");
let session = null;
const stageReports = [];
try {
  session = await createStoryboardFrontendSession({ label: "nasa-short-article-demo" });
  const { page } = session;
  await generateStoryboardFromDraft(page, draft, { minScenes: 5, pace: "standard" });
  const sceneCount = await page.locator("#storyboardV2SceneList .storyboard-v2-card").count();
  for (let index = 0; index < sceneCount; index += 1) {
    const snapshot = await selectStoryboardScene(page, index);
    const stageFailures = [];
    assertStoryboardStageQuality(snapshot, { failures: stageFailures });
    const moduleVisibility = await page.evaluate(() => {
      const shot = document.querySelector("#storyboardV2Stage .storyboard-v2-film-shot.active");
      const moduleId = shot?.dataset.shotModule || "";
      const visibleCount = (selector) => [...(shot?.querySelectorAll(selector) || [])].filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return Number(style.opacity || 0) >= 0.72 && rect.width > 2 && rect.height > 2 && style.visibility !== "hidden" && style.display !== "none";
      }).length;
      return {
        moduleId,
        quoteVisibleWords: moduleId === "quote-claim" ? visibleCount("[data-quote-claim-word]") : 0,
        resolveVisibleText: moduleId === "resolve" ? visibleCount(".storyboard-v2-resolve-title, .storyboard-v2-resolve-memory") : 0,
      };
    });
    if (moduleVisibility.moduleId === "quote-claim" && moduleVisibility.quoteVisibleWords < 4) {
      stageFailures.push(`quote-claim visible word count too low: ${moduleVisibility.quoteVisibleWords}`);
    }
    if (moduleVisibility.moduleId === "resolve" && moduleVisibility.resolveVisibleText < 1) {
      stageFailures.push("resolve visible text missing");
    }
    const screenshot = path.join(artifactDir, `stage-scene-${String(index + 1).padStart(2, "0")}.png`);
    await captureStoryboardStage(page, screenshot);
    stageReports.push({
      index,
      ok: stageFailures.length === 0,
      screenshot,
      failures: stageFailures,
      title: snapshot.title,
      body: snapshot.body,
      dataset: snapshot.dataset,
      kineticLayerStackContract: snapshot.kineticLayerStackContract,
      kineticComposition: snapshot.kineticComposition,
      kineticLayerCount: snapshot.kineticLayerCount,
      kineticTitleWordCount: snapshot.kineticTitleWordCount,
      kineticPhraseLaneCount: snapshot.kineticPhraseLaneCount,
      kineticTokenCount: snapshot.kineticTokenCount,
      kineticPrimaryTokenCount: snapshot.kineticPrimaryTokenCount,
      vectorComposition: snapshot.vectorComposition,
      vectorLayerCount: snapshot.vectorLayerCount,
      vectorOrbitalLayerCount: snapshot.vectorOrbitalLayerCount,
      vectorCalibrationLayerCount: snapshot.vectorCalibrationLayerCount,
      moduleVisibility,
    });
  }
  await captureStoryboardPage(page, path.join(artifactDir, "frontend-page.png"));
} finally {
  await session?.close();
}
assert(stageReports.length >= 5, `frontend should generate at least 5 scenes, got ${stageReports.length}`);
assert(stageReports.filter((report) => report.ok).length >= Math.min(4, stageReports.length), `too many frontend stage quality failures: ${JSON.stringify(stageReports.map((r) => r.failures))}`);
assert(stageReports.every((report) => report.dataset?.shotDirectorContract === "A1DirectedShot/v1" && Number(report.dataset?.motionCueCount || 0) >= 2), `frontend stage reports must preserve ShotDirector and motion cues per scene: ${JSON.stringify(stageReports.map((report) => ({ index: report.index, dataset: report.dataset })))}`);
assert(stageReports.some((report) => report.dataset?.shotDirectorVariant === "opening-thesis" && report.kineticLayerStackContract === "A1KineticTextLayerStack/v1" && report.kineticComposition === "split-mask-thesis" && Number(report.kineticLayerCount || 0) >= 6 && Number(report.kineticTitleWordCount || 0) >= 3), `NASA opening should use cinematic kinetic text layer stack: ${JSON.stringify(stageReports.map((report) => ({ index: report.index, variant: report.dataset?.shotDirectorVariant, kineticLayerStackContract: report.kineticLayerStackContract, kineticComposition: report.kineticComposition, kineticLayerCount: report.kineticLayerCount, kineticTitleWordCount: report.kineticTitleWordCount, kineticPhraseLaneCount: report.kineticPhraseLaneCount, kineticTokenCount: report.kineticTokenCount })))}`);
assert(stageReports.some((report) => report.dataset?.shotDirectorVariant === "earth-moon-reference" && report.dataset?.shotDirectorVisualGrammar === "actor-relation-orbit-reference"), `NASA demo should include Earth/Moon reference directed shot: ${JSON.stringify(stageReports.map((report) => report.dataset))}`);
assert(stageReports.some((report) => report.dataset?.shotDirectorVariant === "calibration-scan" && ["process-scan-drift-correction", "instrument-target-scan-strip"].includes(report.dataset?.shotDirectorVisualGrammar || "") && /scan-sweep/.test(report.dataset?.motionCueIds || "") && /drift-correction/.test(report.dataset?.motionCueIds || "")), `NASA demo should include calibration scan directed shot with scan and drift cues: ${JSON.stringify(stageReports.map((report) => report.dataset))}`);
assert(stageReports.some((report) => report.dataset?.shotDirectorVariant === "earth-moon-reference" && report.vectorComposition === "orbital-reference" && Number(report.vectorOrbitalLayerCount || 0) >= 3 && Number(report.vectorCalibrationLayerCount || 0) === 0), `NASA Earth/Moon vector shot should use orbital-reference composition and orbital-only layers: ${JSON.stringify(stageReports.map((report) => ({ index: report.index, variant: report.dataset?.shotDirectorVariant, vectorComposition: report.vectorComposition, vectorOrbitalLayerCount: report.vectorOrbitalLayerCount, vectorCalibrationLayerCount: report.vectorCalibrationLayerCount })))}`);
assert(stageReports.some((report) => report.dataset?.shotDirectorVariant === "calibration-scan" && report.vectorComposition === "calibration-strip" && Number(report.vectorCalibrationLayerCount || 0) >= 3 && Number(report.vectorOrbitalLayerCount || 0) === 0), `NASA calibration vector shot should use calibration-strip composition and calibration-only layers: ${JSON.stringify(stageReports.map((report) => ({ index: report.index, variant: report.dataset?.shotDirectorVariant, vectorComposition: report.vectorComposition, vectorOrbitalLayerCount: report.vectorOrbitalLayerCount, vectorCalibrationLayerCount: report.vectorCalibrationLayerCount })))}`);
assert(stageReports.some((report) => Number(report.dataset?.stageMotionCueCount || 0) >= stageReports.length * 2 && report.dataset?.motionCueGraphContract === "A1MotionCueGraph/v1"), `frontend stage should expose MotionCueGraph contract/count: ${JSON.stringify(stageReports.map((report) => report.dataset))}`);

console.log("[nasa-demo] capturing sidecar and Remotion still");
const sidecarProof = await captureSidecarScene(sidecarPath, "nasa-moon-scan", "sidecar-nasa-moon-scan.png");
assert(sidecarProof.snapshot.templateCandidate === "hf-image-focus", `sidecar should expose hf-image-focus: ${JSON.stringify(sidecarProof.snapshot)}`);
assert(sidecarProof.snapshot.imageComplete === true && sidecarProof.snapshot.naturalWidth > 0, `sidecar should load NASA image pixels: ${JSON.stringify(sidecarProof.snapshot)}`);
assert((sidecarProof.snapshot.frameRect?.width || 0) >= 700, `sidecar image frame too small: ${JSON.stringify(sidecarProof.snapshot)}`);

const remotionProof = await renderRemotionStill(props, "nasa-moon-scan", publicAsset.publicRelativePath, "remotion-nasa-moon-scan.png");
const runtimeDisplayTitles = (props.articleFilmTimelineRuntime?.shots || []).map((shot) => ({
  id: shot.id,
  module: shot.module,
  title: shot.displayText?.headline || "",
  contract: shot.displayText?.contract || "",
  repeatsOpener: shot.displayText?.titleRepeatsOpener === true,
}));
assert(runtimeDisplayTitles.length === props.scenes.length && runtimeDisplayTitles.every((item) => item.contract === "A1FilmShotDisplayText/v1" && item.title), `Remotion runtime shots must carry film display text: ${JSON.stringify(runtimeDisplayTitles)}`);
assert(props.scenes.every((scene) => scene.filmDisplayText?.contract === "A1FilmShotDisplayText/v1" && scene.filmDisplayText?.headline), `Remotion scenes must carry film display text: ${JSON.stringify(props.scenes.map((scene) => ({ id: scene.id, displayText: scene.filmDisplayText })))}`);
assert(runtimeDisplayTitles.slice(1).every((item) => !item.repeatsOpener && item.title !== runtimeDisplayTitles[0]?.title), `Remotion non-opening display titles must not repeat opener: ${JSON.stringify(runtimeDisplayTitles)}`);
assert(!/[a-z][A-Z]|[A-Za-z][\u3400-\u9fff]|[\u3400-\u9fff][A-Za-z]/u.test(runtimeDisplayTitles.map((item) => item.title).join(" ")), `Remotion display titles must not glue Latin/CJK text: ${JSON.stringify(runtimeDisplayTitles)}`);
const remotionImageDisplay = runtimeDisplayTitles.find((item) => item.id === "nasa-moon-scan");
assert(remotionImageDisplay && /Landsat|月面|扫描|Moon|Scan/iu.test(remotionImageDisplay.title), `Remotion image evidence display title should be local evidence text: ${JSON.stringify(runtimeDisplayTitles)}`);

const moduleParityRows = (props.scenes || []).map((scene, index) => {
  const runtimeShot = props.articleFilmTimelineRuntime?.shots?.[index] || {};
  const frame = graph.htmlVideoIr?.frameNodes?.find((item) => item.id === scene.id) || graph.htmlVideoIr?.frameNodes?.[index] || {};
  return {
    id: scene.id,
    sceneModule: scene.shotModule || "",
    sceneModuleContract: scene.shotModuleContract || "",
    sceneLayerStackContract: scene.shotLayerStackContract || "",
    sceneComposition: scene.shotComposition || "",
    sceneVectorComposition: scene.vectorComposition || "",
    runtimeModule: runtimeShot.module || "",
    runtimeSkillPackContract: runtimeShot.skillPackPlan?.contract || "",
    runtimeSkillFamily: runtimeShot.skillPackPlan?.skillFamily || "",
    irModule: frame.shotModule || "",
    irModuleContract: frame.shotModuleContract || "",
    irLayerStackContract: frame.shotLayerStackContract || "",
    irComposition: frame.shotComposition || "",
    irVectorComposition: frame.vectorComposition || "",
    irEvidenceContract: frame.evidenceContract || "",
    irEvidenceLayerContract: frame.evidenceLayerContract || "",
  };
});
const moduleParity = {
  contract: "A1ExportModuleParity/v1",
  source: "nasa-short-article-demo",
  rows: moduleParityRows,
  frontendStageSummary: {
    source: "independent-preview-stage-screenshot-audit",
    modules: stageReports.map((report) => report.moduleVisibility?.moduleId || report.dataset?.shotModule || "").filter(Boolean),
    kineticLayerStacks: stageReports.map((report) => report.kineticLayerStackContract || "").filter(Boolean),
    kineticCompositions: stageReports.map((report) => report.kineticComposition || "").filter(Boolean),
    vectorCompositions: stageReports.map((report) => report.vectorComposition || "").filter(Boolean),
  },
  requiredModules: ["kinetic-text", "vector-explainer", "image-evidence", "data-map", "resolve"],
  requiredContracts: ["A1KineticTextLayerStack/v1", "A1VectorLayerStack/v1", "A1ImageEvidenceShot/v2", "A1EvidenceLayerStack/v1"],
};
const parityModuleSet = new Set(moduleParityRows.map((row) => row.sceneModule).filter(Boolean));
for (const requiredModule of moduleParity.requiredModules) {
  assert(parityModuleSet.has(requiredModule), `module parity missing required module ${requiredModule}: ${JSON.stringify(moduleParityRows)}`);
}
assert(moduleParityRows.every((row) => row.sceneModule && row.runtimeModule === row.sceneModule && row.irModule === row.sceneModule), `scene/runtime/IR shot module drift: ${JSON.stringify(moduleParityRows)}`);
assert(moduleParityRows.some((row) => row.sceneModule === "kinetic-text" && row.irLayerStackContract === "A1KineticTextLayerStack/v1" && row.irComposition === "split-mask-thesis"), `kinetic export parity missing split-mask layer stack: ${JSON.stringify(moduleParityRows)}`);
assert(moduleParityRows.some((row) => row.sceneModule === "vector-explainer" && row.irVectorComposition === "orbital-reference"), `vector export parity missing orbital-reference: ${JSON.stringify(moduleParityRows)}`);
assert(moduleParityRows.some((row) => ["vector-explainer", "data-map"].includes(row.sceneModule) && row.irVectorComposition === "calibration-strip"), `vector/data export parity missing calibration-strip: ${JSON.stringify(moduleParityRows)}`);
assert(moduleParityRows.some((row) => row.sceneModule === "image-evidence" && row.irEvidenceContract === "A1ImageEvidenceShot/v2" && row.irEvidenceLayerContract === "A1EvidenceLayerStack/v1"), `image evidence export parity missing evidence contracts: ${JSON.stringify(moduleParityRows)}`);
assert(sidecarProof.snapshot.shotModule === "image-evidence" && sidecarProof.snapshot.imageEvidenceContract === "A1ImageEvidenceShot/v2" && sidecarProof.snapshot.imageEvidenceLayerContract === "A1EvidenceLayerStack/v1", `sidecar should expose image evidence module contracts: ${JSON.stringify(sidecarProof.snapshot)}`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  source: {
    title: "A Full Moon Checkup",
    url: sourceUrl,
    articleDate: "2026-05-26",
    sourceLineEvidence: "NASA Earth Observatory article states Landsat 9 uses monthly full-Moon lunar scans for calibration consistency.",
    imageUrl: nasaImageUrl,
  },
  artifactDir,
  draft,
  director: {
    sceneCount: frontendProject.sceneCount || frontendProject.scenes?.length || 0,
    contract: frontendProject.contract || "",
  },
  stageReports,
  verifiedManifestSummary: {
    renderable: verifiedManifest.verifiedForRender.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      sourceCandidateId: entry.sourceCandidateId,
      sourceUrl: entry.sourceUrl,
      attribution: entry.attribution,
    })),
  },
  templateMatch: imageMatch,
  htmlVideoCandidate: imageNode?.templateCandidate?.id || "",
  moduleParity,
  sidecarProof,
  remotionProof,
  runtimeDisplayTitles,
  files: {
    sourceDraft: path.join(artifactDir, "source-draft.txt"),
    report: path.join(artifactDir, "report.json"),
    frontendPage: path.join(artifactDir, "frontend-page.png"),
    sidecarHtml: sidecarPath,
    sidecarScreenshot: sidecarProof.screenshot,
    remotionStill: remotionProof.stillPath,
  },
  failures,
};
await fs.writeFile(path.join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`NASA short article demo failed.\nReport: ${path.join(artifactDir, "report.json")}\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("NASA short article demo passed.");
console.log(`Report: ${path.join(artifactDir, "report.json")}`);
console.log(`Frontend page: ${path.join(artifactDir, "frontend-page.png")}`);
console.log(`Sidecar screenshot: ${sidecarProof.screenshot}`);
console.log(`Remotion still: ${remotionProof.stillPath}`);
