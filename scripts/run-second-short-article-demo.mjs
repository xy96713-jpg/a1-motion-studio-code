import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createStoryboardDirectorPlan } from "../lib/storyboard-director.js";
import { buildHtmlVideoContentGraph } from "../lib/storyboard-html-video-adapter.js";
import { validateArticleFilmTimelineRuntime } from "../lib/storyboard-article-film-runtime.js";
import { validateStoryboardContentGraph } from "../lib/storyboard-content-graph.js";
import { validateStoryboardShotGraph } from "../lib/storyboard-shot-graph.js";
import { toStoryboardRenderProps, validateStoryboardRenderProps } from "../lib/storyboard-render-props.js";
import {
  buildStoryboardWebAssetPlan,
  discoverStoryboardWebAssetCandidates,
  validateStoryboardWebAssetDiscovery,
  validateStoryboardWebAssetPlan,
} from "../lib/storyboard-web-asset-resolver.js";
import {
  buildStoryboardTemplateMatchPlan,
  validateStoryboardTemplateMatchPlan,
} from "../lib/storyboard-template-match-plan.js";
import {
  assertStoryboardStageQuality,
  captureStoryboardPage,
  captureStoryboardStage,
  createStoryboardFrontendSession,
  generateStoryboardFromDraft,
  selectStoryboardScene,
  selectStoryboardSceneByArticleRole,
  selectStoryboardSceneByIntent,
} from "./storyboard-frontend-actions.mjs";

const root = process.cwd();
const rendererDir = path.join(root, "remotion-renderer");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const failures = [];

function cliValue(name = "") {
  const equalsPrefix = `--${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsArg) return equalsArg.slice(equalsPrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const sourceFileArg = cliValue("source") || process.env.A1_ARTICLE_SOURCE_FILE || "";
const sourceFilePath = sourceFileArg ? path.resolve(root, sourceFileArg) : "";
const defaultSourceText = `最近 GitHub 上的 html-video 项目很容易让人兴奋，因为它看起来像是把 AI 写视频这件事直接做成了产品。

但对 A1 来说，第一步不是把它整个搬进来。这个项目真正值得借鉴的是它怎么组织 README、模板 manifest、content graph、HTML 画面和本地 inspect，而不是它的产品壳。

如果直接照搬，A1 会多出第二套项目系统、第二套导出入口和第二套状态管理。这样短期看起来功能变多，长期会让用户不知道自己到底是在文稿分镜、图片动画，还是另一个外部视频工作台里。

更稳的接入方式是把它当成外部参考源。A1 继续负责理解全文、保存 project.json、生成 beats 和可编辑分镜；html-video 的价值进入模板 manifest 和 adapter boundary，只作为可验证的结构来源。

HyperFrames 可以继续承担关键镜头原型。它适合用 HTML、CSS、GSAP 快速证明一个镜头是否成立，再用 lint、inspect 和截图把结果回灌到 A1。

Remotion 负责稳定渲染，把已经证明可用的结构变成 schema、props 和 timeline。

最后判断标准很简单：借鉴工作流，不导入产品壳；借鉴模板结构，不直接渲染外部模板；借鉴 inspect 证据，不把 MP4 导出变成默认评审面。

来源：https://github.com/nexu-io/html-video
来源：https://hyperframes.heygen.com/
来源：https://github.com/remotion-dev/remotion`;

const sourceText = sourceFilePath ? await fs.readFile(sourceFilePath, "utf8") : defaultSourceText;
const isDefaultSource = !sourceFilePath;
const artifactDir = path.join(
  root,
  ".codex-artifacts",
  isDefaultSource ? "second-short-article-demo" : "generic-article-demo",
  timestamp
);

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function run(command, args, options = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        cwd: options.cwd || root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: options.timeout || 180000,
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
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function safeFileToken(value = "") {
  return String(value || "variant")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "variant";
}

function normalizeText(value = "") {
  return String(value || "")
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/镜头/gu, "段落")
    .replace(/画面/gu, "视觉")
    .replace(/分镜/gu, "结构")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function importantSentences(text = "") {
  return text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line && !/^来源[:：]/u.test(line))
    .flatMap((line) => line.split(/(?<=[。！？!?])/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => normalizeText(sentence).length >= 10);
}

function minimumRuntimeSeconds(text = "") {
  const sentenceCount = importantSentences(text).length;
  return isDefaultSource ? 30 : Math.max(22, Math.min(30, sentenceCount * 3.2));
}

function visibleSceneText(scene = {}) {
  return [
    ...(scene.titleLines || []),
    ...(scene.bodyLines || []),
    ...(scene.listItems || []),
    scene.quote,
    scene.caption,
    scene.dataValue,
    scene.director?.coverageText,
    scene.beat?.source,
    scene.beat?.purpose,
  ].filter(Boolean).join(" ");
}

function assertSentenceCoverage(sentences, scenes) {
  const haystacks = scenes.map((scene) => ({
    id: scene.id,
    text: normalizeText(visibleSceneText(scene)),
    sourceSentenceIds: scene.director?.sourceSentenceIds || [],
  }));
  const dropped = [];
  for (const sentence of sentences) {
    const normalized = normalizeText(sentence);
    const probes = [
      normalized.slice(0, Math.min(18, normalized.length)),
      normalized.slice(Math.max(0, Math.floor(normalized.length / 2) - 8), Math.min(normalized.length, Math.floor(normalized.length / 2) + 10)),
    ].filter((probe) => probe.length >= 8);
    if (!haystacks.some((scene) => probes.some((probe) => scene.text.includes(probe)))) {
      dropped.push(sentence);
    }
  }
  assert(dropped.length === 0, `important source sentences should be represented by shots: ${JSON.stringify(dropped)}`);
}

function assertTimelineContiguous(runtime = {}) {
  const shots = Array.isArray(runtime.shots) ? runtime.shots : [];
  for (let index = 1; index < shots.length; index += 1) {
    const previous = shots[index - 1];
    const current = shots[index];
    assert(current.startFrame === previous.endFrame, `runtime gap/overlap ${previous.id}->${current.id}: ${previous.endFrame} to ${current.startFrame}`);
  }
}

function assertNoUrlAsBodyText(props = {}) {
  const visibleText = (props.scenes || []).map(visibleSceneText).join("\n");
  assert(!/https?:\/\/\S+/iu.test(visibleText), `source URLs must not leak as visible body text: ${visibleText}`);
}

function sceneModule(scene = {}) {
  return scene.shotGraphNode?.recommendedShotModule
    || scene.runtimeShot?.module
    || scene.shotModule
    || "";
}

function proofFrameForScene(props = {}, scene = {}) {
  const runtimeShot = props.articleFilmTimelineRuntime?.shots?.find((shot) => shot.id === scene.id);
  const start = Number(runtimeShot?.startFrame ?? scene.frameStart ?? 0);
  const duration = Number(runtimeShot?.durationFrames ?? scene.frameDuration ?? 120);
  return Math.max(0, start + Math.min(90, Math.max(30, Math.floor(duration * 0.45))));
}

async function renderRemotionStill(props, scene, outputName) {
  const renderProps = JSON.parse(JSON.stringify(props));
  const graph = buildHtmlVideoContentGraph(renderProps);
  renderProps.contentGraph = graph;
  renderProps.htmlVideoIr = graph.htmlVideoIr;
  const propsPath = path.join(artifactDir, "remotion-second-article-props.json");
  const stillPath = path.join(artifactDir, outputName);
  await fs.writeFile(propsPath, `${JSON.stringify(renderProps, null, 2)}\n`);

  if (!fsSync.existsSync(path.join(rendererDir, "node_modules", "remotion"))) {
    const install = run("npm", ["install"], { cwd: rendererDir, timeout: 240000 });
    assert(install.ok, `Remotion renderer npm install failed: ${install.output.slice(0, 1600)}`);
  }

  const frame = String(proofFrameForScene(renderProps, scene));
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
  assert(stat.size > 80000, `Remotion still should contain rendered pixels, got ${stat.size} bytes`);
  return { propsPath, stillPath, frame: Number(frame), dimensions, bytes: stat.size, sceneId: scene.id };
}

async function auditFrontend() {
  const session = await createStoryboardFrontendSession({
    label: "second-short-article-demo",
    viewport: { width: 1440, height: 900 },
  });
  try {
    const sceneCount = await generateStoryboardFromDraft(session.page, sourceText, {
      minScenes: 6,
      pace: "standard",
      timeoutMs: 60000,
      disableWebAssetAutoDiscovery: true,
    });
    assert(sceneCount >= 6, `frontend should generate at least 6 scenes, got ${sceneCount}`);

    const payload = await session.page.evaluate(() =>
      typeof window.__A1_STORYBOARD_TEST_PAYLOAD__ === "function"
        ? window.__A1_STORYBOARD_TEST_PAYLOAD__()
        : null
    );

    const stageScreens = [];
    const snapshots = [];
    const visualChecks = [];
    const sceneIndexes = [0, Math.max(1, Math.floor(sceneCount / 2)), sceneCount - 1];
    for (const index of [...new Set(sceneIndexes)]) {
      const snapshot = await selectStoryboardScene(session.page, index);
      assertStoryboardStageQuality(snapshot, { failures });
      const visualCheck = await session.page.evaluate(() => {
        const frame = document.querySelector("#storyboardV2Stage .storyboard-v2-frame.active");
        const visibleHiddenTokens = [...(frame?.querySelectorAll(".storyboard-v2-kinetic-token, .storyboard-v2-resolve-token") || [])]
          .map((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return {
              text: node.textContent.trim().replace(/\s+/g, " "),
              hiddenAncestor: Boolean(node.closest("[hidden]")),
              display: style.display,
              visibility: style.visibility,
              opacity: Number(style.opacity || 0),
              width: Number(rect.width.toFixed(2)),
              height: Number(rect.height.toFixed(2)),
            };
          })
          .filter((item) => item.hiddenAncestor && item.display !== "none" && item.visibility !== "hidden" && item.opacity > 0 && item.width > 1 && item.height > 1);
        const resolveTitle = frame?.querySelector(".storyboard-v2-resolve-title")?.textContent.trim().replace(/\s+/g, " ") || "";
        const resolveMemory = frame?.querySelector(".storyboard-v2-resolve-memory")?.textContent.trim().replace(/\s+/g, " ") || "";
        return {
          visibleHiddenTokens,
          resolveTitle,
          resolveMemory,
        };
      });
      assert(visualCheck.visibleHiddenTokens.length === 0, `hidden phrase tokens must not paint in frontend hold frames: ${JSON.stringify(visualCheck.visibleHiddenTokens)}`);
      if (snapshot.dataset.articleRole === "closing" || snapshot.dataset.intent === "closing") {
        assert(Array.from(visualCheck.resolveTitle || "").length <= 18, `resolve title should be a short memory headline, got: ${visualCheck.resolveTitle}`);
        assert(Array.from(visualCheck.resolveMemory || "").length >= 12, `resolve shot should move the full claim into readable memory text, got: ${visualCheck.resolveMemory}`);
      }
      assert(!/(保存版本|决定呈现|安排节奏|再用 lint)\b/u.test(snapshot.text || ""), `frontend film-facing title should not use clipped workflow fragments: ${snapshot.text}`);
      visualChecks.push({ index, ...visualCheck });
      snapshots.push({ index, snapshot });
      stageScreens.push(await captureStoryboardStage(session.page, path.join(artifactDir, `frontend-stage-${index + 1}.png`)));
    }
    const firstDataset = snapshots[0]?.snapshot?.dataset || {};
    assert(firstDataset.timelineRuntimeContract === "A1ArticleFilmTimelineRuntime/v1", `frontend stage should expose article film runtime: ${JSON.stringify(firstDataset)}`);
    const frontendTotalFrames = Number(firstDataset.timelineRuntimeTotalFrames || payload?.articleFilmTimelineRuntime?.totalFrames || 0);
    const frontendFps = Number(payload?.articleFilmTimelineRuntime?.fps || firstDataset.timelineRuntimeFps || 30);
    const minFrontendSeconds = minimumRuntimeSeconds(sourceText);
    assert(frontendTotalFrames / frontendFps >= minFrontendSeconds, `frontend runtime should be at least ${minFrontendSeconds} seconds: ${frontendTotalFrames} frames at ${frontendFps}fps`);
    await captureStoryboardPage(session.page, path.join(artifactDir, "frontend-page.png"));

    const method = await selectStoryboardSceneByIntent(session.page, "workflow").catch(() => null);
    const closing = await selectStoryboardSceneByArticleRole(session.page, "closing").catch(() => null);
    assert(Boolean(method?.snapshot || snapshots.some((item) => item.snapshot.dataset.intent === "workflow")), "frontend should include a workflow/method shot");
    assert(Boolean(closing?.snapshot || snapshots.some((item) => item.snapshot.dataset.articleRole === "closing")), "frontend should include a closing/resolve shot");

    const vectorEntityChecks = await session.page.evaluate(() =>
      [...document.querySelectorAll("#storyboardV2Stage .storyboard-v2-vector-explainer")].map((vector) => {
        const frame = vector.closest(".storyboard-v2-film-shot") || vector.closest(".storyboard-v2-frame");
        const visible = [
          ...vector.querySelectorAll(".storyboard-v2-vector-label, .storyboard-v2-vector-relation-label, .storyboard-v2-vector-readout")
        ].map((node) => node.textContent.trim().replace(/\s+/g, " ")).filter(Boolean).join(" / ");
        const marker = (selector) => Boolean(vector.querySelector(selector));
        return {
          index: Number(frame?.style?.getPropertyValue("--film-index") || frame?.dataset?.storyboardV2Index || -1),
          module: frame?.dataset?.shotModule || "",
          variant: vector.dataset.vectorSemanticVariant || "",
          pipelineVariant: vector.dataset.vectorPipelineVariant || "",
          mode: vector.dataset.vectorEntityMode || "",
          entities: vector.dataset.vectorEntities || "",
          geometryMarkers: {
            sourceShelf: marker(".storyboard-v2-vector-source-shelf"),
            boundaryGate: marker(".storyboard-v2-vector-boundary-gate"),
            prototypeTrack: marker(".storyboard-v2-vector-prototype-track"),
            manifestStack: marker(".storyboard-v2-vector-manifest-stack"),
            inspectPanel: marker(".storyboard-v2-vector-inspect-panel"),
            renderOutput: marker(".storyboard-v2-vector-render-output"),
            rejectPath: marker(".storyboard-v2-vector-reject-path"),
          },
          text: visible,
        };
      })
    );
    if (isDefaultSource) {
      assert(vectorEntityChecks.some((item) => item.variant === "article-entity-pipeline"), `non-NASA article should render an article-entity-pipeline vector shot: ${JSON.stringify(vectorEntityChecks)}`);
      assert(vectorEntityChecks.some((item) => /html-video/i.test(item.text) && /\bA1\b/.test(item.text) && /HyperFrames|Remotion/i.test(item.text)), `article vector shot should expose real article entities, not generic source/reference labels: ${JSON.stringify(vectorEntityChecks)}`);
    } else {
      assert(
        vectorEntityChecks.length > 0 || snapshots.some((item) => ["vector-explainer", "data-map", "quote-claim"].includes(item.snapshot.dataset.shotModule)),
        `custom article should produce at least one structured visual shot: ${JSON.stringify({ vectorEntityChecks, snapshots: snapshots.map((item) => item.snapshot.dataset) })}`
      );
    }
    assert(!vectorEntityChecks.some((item) => item.variant === "article-entity-pipeline" && /\bsource\s*\/\s*reference\b|\bsource\b\s*$|\breference\b\s*$/i.test(item.text)), `article-entity pipeline should not fall back to source/reference placeholders: ${JSON.stringify(vectorEntityChecks)}`);
    assert(!vectorEntityChecks.some((item) => /(保存版本|决定呈现|安排节奏|再用 lint)\b/u.test(item.text)), `article-entity vector labels should not use clipped workflow fragments: ${JSON.stringify(vectorEntityChecks)}`);
    const articlePipelineVariants = [...new Set(vectorEntityChecks
      .filter((item) => item.variant === "article-entity-pipeline")
      .map((item) => item.pipelineVariant)
      .filter(Boolean))];
    if (isDefaultSource) {
      assert(articlePipelineVariants.length >= 3, `article-entity vector shots should vary layout by beat, got: ${JSON.stringify(articlePipelineVariants)} from ${JSON.stringify(vectorEntityChecks)}`);
    }

    const expectedGeometryByPipelineVariant = {
      "reference-only": ["sourceShelf", "boundaryGate", "prototypeTrack", "renderOutput", "rejectPath"],
      "manifest-boundary": ["sourceShelf", "manifestStack", "renderOutput"],
      "prototype-inspect": ["boundaryGate", "prototypeTrack", "inspectPanel"],
      "render-handoff": ["prototypeTrack", "boundaryGate", "renderOutput"],
      "evidence-loop": ["sourceShelf", "inspectPanel", "renderOutput"],
      "pipeline-map": ["sourceShelf", "boundaryGate", "prototypeTrack", "renderOutput"],
    };
    const geometryFailures = vectorEntityChecks
      .filter((item) => item.variant === "article-entity-pipeline")
      .map((item) => {
        const required = expectedGeometryByPipelineVariant[item.pipelineVariant] || [];
        const missing = required.filter((key) => !item.geometryMarkers?.[key]);
        return { ...item, required, missing };
      })
      .filter((item) => item.missing.length);
    assert(geometryFailures.length === 0, `article-entity pipeline variants must use distinct SVG geometry, missing markers: ${JSON.stringify(geometryFailures)}`);

    const variantPriority = ["reference-only", "manifest-boundary", "prototype-inspect", "render-handoff", "evidence-loop", "pipeline-map"];
    const vectorVariantScreens = [];
    for (const variant of variantPriority) {
      if (vectorVariantScreens.length >= 4) break;
      const check = vectorEntityChecks.find((item) =>
        item.variant === "article-entity-pipeline"
          && item.pipelineVariant === variant
          && Number.isFinite(item.index)
          && item.index >= 0
      );
      if (!check) continue;
      const snapshot = await selectStoryboardScene(session.page, check.index);
      assertStoryboardStageQuality(snapshot, { failures });
      const filePath = path.join(artifactDir, `frontend-vector-${safeFileToken(variant)}-stage-${check.index + 1}.png`);
      vectorVariantScreens.push({
        variant,
        index: check.index,
        screenshot: await captureStoryboardStage(session.page, filePath),
        text: check.text,
        geometryMarkers: check.geometryMarkers,
      });
    }
    if (isDefaultSource) {
      assert(vectorVariantScreens.length >= 3, `should capture at least 3 representative article-entity vector variant screenshots, got: ${JSON.stringify(vectorVariantScreens)}`);
    }

    return {
      rootUrl: session.rootUrl,
      sceneCount,
      stageScreens,
      vectorVariantScreens,
      visualChecks,
      vectorEntityChecks,
      snapshots: snapshots.map((item) => ({
        index: item.index,
        text: item.snapshot.text,
        dataset: item.snapshot.dataset,
      })),
      payloadSummary: {
        sceneCount: payload?.scenes?.length || 0,
        totalFrames: frontendTotalFrames,
        shotCount: payload?.articleFilmTimelineRuntime?.shots?.length || 0,
      },
    };
  } finally {
    await session.close();
  }
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });

  const analysis = createStoryboardDirectorPlan({ sourceText, pace: "standard" });
  const props = toStoryboardRenderProps(analysis.payload);
  const webAssetPlan = buildStoryboardWebAssetPlan({ ...props, sourceText, rawSourceText: sourceText });
  const templateMatchPlan = buildStoryboardTemplateMatchPlan({ ...props, webAssetPlan }, { webAssetPlan });
  props.webAssetPlan = webAssetPlan;
  props.templateMatchPlan = templateMatchPlan;

  const renderValidation = validateStoryboardRenderProps(props);
  const runtimeValidation = validateArticleFilmTimelineRuntime(props.articleFilmTimelineRuntime || {});
  const contentValidation = validateStoryboardContentGraph(props.contentGraph || {});
  const shotValidation = validateStoryboardShotGraph(props.shotGraph || {});
  const webAssetValidation = validateStoryboardWebAssetPlan(webAssetPlan);
  const templateValidation = validateStoryboardTemplateMatchPlan(templateMatchPlan);
  assert(renderValidation.ok, `render props invalid: ${renderValidation.failures.join("; ")}`);
  assert(runtimeValidation.ok, `article film runtime invalid: ${runtimeValidation.failures.join("; ")}`);
  assert(contentValidation.ok, `content graph invalid: ${contentValidation.failures.join("; ")}`);
  assert(shotValidation.ok, `shot graph invalid: ${shotValidation.failures.join("; ")}`);
  assert(webAssetValidation.ok, `web asset plan invalid: ${webAssetValidation.failures.join("; ")}`);
  assert(templateValidation.ok, `template match plan invalid: ${templateValidation.failures.join("; ")}`);

  if (isDefaultSource) assert(!/NASA|Landsat|Moon|月球|Earth Observatory/iu.test(sourceText), "second sample must remain non-NASA");
  assert((props.scenes || []).length >= 7, `second sample should produce a complete multi-shot film, got ${props.scenes?.length}`);
  assert(props.articleFilmTimelineRuntime?.contract === "A1ArticleFilmTimelineRuntime/v1", "render props should expose A1ArticleFilmTimelineRuntime/v1");
  const minRuntimeSeconds = minimumRuntimeSeconds(sourceText);
  assert(Number(props.articleFilmTimelineRuntime?.totalFrames || 0) / Number(props.fps || 60) >= minRuntimeSeconds, `runtime should be at least ${minRuntimeSeconds} seconds, got ${props.articleFilmTimelineRuntime?.totalFrames} frames at ${props.fps}fps`);
  assert(props.articleFilmTimelineRuntime?.shots?.length === props.scenes?.length, "runtime shots should align with scenes");
  assertTimelineContiguous(props.articleFilmTimelineRuntime);
  assert(props.articleFilmTimelineRuntime?.transitionBriefCount === props.scenes.length - 1, "runtime should connect every adjacent shot");
  assert(props.articleFilmTimelineRuntime?.shots?.slice(0, -1).every((shot) =>
    shot.transitionBrief?.contract === "A1TransitionBrief/v1"
      && shot.transitionBrief?.cueChain?.contract === "A1TransitionCueChain/v1"
      && shot.transitionBrief?.cueChain?.sourceCueId
      && shot.transitionBrief?.cueChain?.targetCueId
  ), `runtime transition briefs should carry cue chains: ${JSON.stringify(props.articleFilmTimelineRuntime?.shots?.map((shot) => shot.transitionBrief))}`);

  assertSentenceCoverage(importantSentences(sourceText), props.scenes || []);
  assertNoUrlAsBodyText(props);

  const modules = new Set((props.shotGraph?.nodes || [])
    .map((node) => node.recommendedShotModule || node.shotModule || "")
    .filter(Boolean));
  assert(modules.has("kinetic-text"), `second sample should include kinetic text module: ${JSON.stringify([...modules])}`);
  assert(modules.has("vector-explainer"), `second sample should include vector explainer module: ${JSON.stringify([...modules])}`);
  if (isDefaultSource) assert(modules.has("quote-claim"), `second sample should include quote/claim module: ${JSON.stringify([...modules])}`);
  else assert(modules.has("quote-claim") || modules.has("data-map") || modules.has("image-evidence"), `custom sample should include claim/data/evidence structure: ${JSON.stringify([...modules])}`);
  assert(modules.has("resolve"), `second sample should include resolve module: ${JSON.stringify([...modules])}`);
  assert(modules.has("data-map") || (props.scenes || []).some((scene) => ["data-metric", "comparison-table"].includes(scene.layoutPrimitive?.id)), `second sample should include data/comparison structure: ${JSON.stringify([...modules])}`);

  const candidateIds = (webAssetPlan.candidates || []).map((candidate) => candidate.id);
  if (isDefaultSource) {
    assert(candidateIds.includes("repo:nexu-io/html-video"), `asset plan should recognize html-video repo: ${JSON.stringify(candidateIds)}`);
    assert(candidateIds.includes("repo:remotion-dev/remotion"), `asset plan should recognize Remotion repo: ${JSON.stringify(candidateIds)}`);
    assert(candidateIds.some((id) => id.startsWith("webpage:https://hyperframes.heygen.com/")), `asset plan should recognize HyperFrames URL: ${JSON.stringify(candidateIds)}`);
    assert((webAssetPlan.articleVisualAssetStrategy?.promotionRequiredCount || 0) >= 2, `unverified repo/web assets should require promotion: ${JSON.stringify(webAssetPlan.articleVisualAssetStrategy)}`);
    assert((webAssetPlan.articleVisualAssetStrategy?.vectorFallbackCount || 0) >= 2, `unverified repo/web assets should have vector fallbacks: ${JSON.stringify(webAssetPlan.articleVisualAssetStrategy)}`);
  } else if (candidateIds.length) {
    assert((webAssetPlan.articleVisualAssetStrategy?.vectorFallbackCount || 0) >= 1 || (webAssetPlan.articleVisualAssetStrategy?.promotionRequiredCount || 0) >= 1, `custom article asset candidates should route to promotion or vector fallback: ${JSON.stringify(webAssetPlan.articleVisualAssetStrategy)}`);
  }
  assert((webAssetPlan.sceneAssetBriefs || []).every((brief) =>
    !brief.visualAssetStrategy
      || brief.visualAssetStrategy.renderAllowedNow === true
      || brief.visualAssetStrategy.promotionRequired === true
      || brief.visualAssetStrategy.strategyMode === "typography-only"
  ), `asset briefs must not render unverified web assets: ${JSON.stringify(webAssetPlan.sceneAssetBriefs)}`);

  const discovery = await discoverStoryboardWebAssetCandidates(webAssetPlan, {
    maxCandidates: 8,
    maxProbesPerCandidate: 2,
    timeoutMs: 8000,
    generatedAt: new Date().toISOString(),
  });
  const discoveryValidation = validateStoryboardWebAssetDiscovery(discovery);
  assert(discoveryValidation.ok, `web asset discovery invalid: ${discoveryValidation.failures.join("; ")}`);
  assert((discovery.discovered || []).every((candidate) => candidate.renderAllowed === false), "online discovered candidates must stay behind promotion");
  if (isDefaultSource) {
    assert((discovery.discovered || []).some((candidate) => candidate.parentId === "repo:nexu-io/html-video"), "discovery should probe html-video repo evidence");
    assert((discovery.discovered || []).some((candidate) => candidate.parentId === "repo:remotion-dev/remotion"), "discovery should probe Remotion repo evidence");
  } else if (candidateIds.some((id) => /^repo:|^webpage:/u.test(id))) {
    assert((discovery.discovered || []).length > 0 || (discovery.unresolved || []).length > 0, `custom article web/repo candidates should be probed or recorded unresolved: ${JSON.stringify({ candidateIds, discovery })}`);
  }

  const remotionScene = (props.scenes || []).find((scene) => scene.shotGraphNode?.recommendedShotModule === "vector-explainer")
    || (props.scenes || []).find((scene) => scene.layoutPrimitive?.id === "closing-hold")
    || props.scenes?.[Math.max(0, Math.floor((props.scenes?.length || 1) / 2))];
  const remotion = await renderRemotionStill(props, remotionScene, "remotion-second-article.png");
  const frontend = await auditFrontend();

  const report = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    contract: isDefaultSource ? "A1SecondShortArticleDemo/v1" : "A1GenericArticleDemo/v1",
    sourceText,
    sourceFilePath,
    inputMode: isDefaultSource ? "default-second-article" : "custom-source-file",
    artifactDir,
    summary: {
      sceneCount: props.scenes?.length || 0,
      runtimeTotalFrames: props.articleFilmTimelineRuntime?.totalFrames || 0,
      runtimeSeconds: Number(((props.articleFilmTimelineRuntime?.totalFrames || 0) / (props.fps || 30)).toFixed(2)),
      modules: [...modules],
      candidateIds,
      discoveredCount: discovery.discovered?.length || 0,
      frontendSceneCount: frontend.sceneCount,
      remotionStill: remotion.stillPath,
    },
    validations: {
      renderValidation,
      runtimeValidation,
      contentValidation,
      shotValidation,
      webAssetValidation,
      templateValidation,
      discoveryValidation,
    },
    webAssetPlan,
    discovery: {
      contract: discovery.contract,
      evidenceSummary: discovery.evidenceSummary,
      discovered: discovery.discovered,
      unresolved: discovery.unresolved,
      rejectIf: discovery.rejectIf,
    },
    frontend,
    remotion,
    scenes: props.scenes?.map((scene) => ({
      id: scene.id,
      type: scene.type,
      title: (scene.titleLines || []).join(" "),
      body: (scene.bodyLines || []).join(" "),
      articleRole: scene.article?.sectionRole || scene.narrative?.storyRole || "",
      intent: scene.director?.intent || "",
      module: scene.shotGraphNode?.recommendedShotModule || "",
      sourceSentenceIds: scene.director?.sourceSentenceIds || [],
      layoutPrimitive: scene.layoutPrimitive?.id || "",
    })),
    failures,
  };
  await fs.writeFile(path.join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  if (failures.length) {
    console.error(`Second short article demo failed.\nReport: ${path.join(artifactDir, "report.json")}`);
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exit(1);
  }

  console.log("Second short article demo passed.");
  console.log(`Report: ${path.join(artifactDir, "report.json")}`);
  console.log(`Frontend page: ${path.join(artifactDir, "frontend-page.png")}`);
  console.log(`Remotion still: ${remotion.stillPath}`);
}

await main();
