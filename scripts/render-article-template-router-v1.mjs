import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "remotion-renderer");
const remotionBin = path.join(rendererDir, "node_modules", ".bin", "remotion");
const outputDir = path.join(root, "public", "generated", "article-template-router-v1");
const reportPath = path.join(root, "public", "template-confirmations", "article-template-router-v1.json");
const previewPath = path.join(root, "public", "article-template-router-v1.html");
const selectionPath = path.join(root, "public", "template-confirmations", "rve-template-selection-classified.json");
const overridePath = path.join(root, "public", "template-confirmations", "article-template-overrides.json");
const sourcePath = path.join(root, "public", "template-confirmations", "article-template-source.json");
const articleManifestPath = path.join(root, "public", "assets", "web-evidence-captures", "www-msn-com-en-us-news-technology-bytedances-new-ai-video-model-can-make-30-seco", "manifest.json");
const multiImageManifestPath = path.join(root, "public", "template-confirmations", "rve-multi-image-news-pack.json");
const fullRender = process.argv.includes("--full");
const incrementalRender = !fullRender;

const clean = (value = "", max = 500) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

const escapeHtml = (value = "") => String(value || "")
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

const slugify = (value = "") => clean(value, 120)
  .toLowerCase()
  .replace(/[^a-z0-9]+/gu, "-")
  .replace(/^-+|-+$/gu, "")
  .slice(0, 80) || "shot";

const fallbackArticleText = [
  "ByteDance is preparing Seedance 2.5, a new AI video model tied to its video-generation push.",
  "The model is reported to make 30-second clips from a single prompt.",
  "That length matters because many AI video tools still focus on much shorter generated shots.",
  "Related AI-video products show the market moving from single generators toward integrated creative workflows.",
  "For viewers, the important change is not the model name, but whether the output becomes useful enough for real production.",
  "The short film should close by connecting model capability, visual evidence, and market pressure.",
].join(" ");

const splitArticleSentences = (text = "") => {
  const normalized = String(text || "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .split(/\n+/u)
    .map((line) => clean(line, 2000))
    .filter(Boolean)
    .join("\n");
  const protectedText = normalized
    .replace(/\b([A-Z])\./gu, "$1<dot>")
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|vs|e\.g|i\.e)\./giu, (match) => match.replace(/\./gu, "<dot>"));
  return protectedText
    .split(/(?<=[.!?。！？；;])\s+|(?<=[。！？；;])|[\n]+/u)
    .map((sentence) => clean(sentence.replace(/<dot>/gu, "."), 360))
    .filter((sentence) => sentence && !/^https?:\/\//iu.test(sentence))
    .filter((sentence, index, list) => list.findIndex((item) => item === sentence) === index)
    .slice(0, 14);
};

const articleTitleFromText = (text = "") => {
  const first = String(text || "")
    .replace(/\r\n?/gu, "\n")
    .split(/\n+/u)
    .map((line) => clean(line, 160))
    .find(Boolean);
  if (!first) return "Article film";
  return first.replace(/[。！？.!?；;]+$/u, "");
};

const conciseTitleForSentence = (sentence = "", fallback = "Article beat") => {
  const text = clean(sentence, 180).replace(/^[-*•\d.、\s]+/u, "");
  if (!text) return fallback;
  const stop = text.match(/^(.{6,34}?)(?:[，,。.!?！？；;]|$)/u)?.[1];
  return clean(stop || text, 54);
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const readJsonOptional = async (filePath, fallback = null) => {
  try {
    return await readJson(filePath);
  } catch {
    return fallback;
  }
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const renderSignature = (value) => crypto
  .createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex")
  .slice(0, 16);

const runRemotion = (args) => new Promise((resolve) => {
  const child = spawn(remotionBin, args, { cwd: rendererDir, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("close", (code) => resolve({ code, output }));
});

const imageToDataUrl = async (localPath, contentType = "image/jpeg") => {
  const buffer = await fs.readFile(localPath);
  return `data:${contentType};base64,${buffer.toString("base64")}`;
};

const templateComposition = {
  "image-zoom-reveal": "RVEImageZoomReveal",
  "lower-third": "RVELowerThird",
  "split-screen": "RVESplitScreen",
  "polaroid-frame": "RVEPolaroidFrame",
  "photo-stack": "RVEPhotoStack",
  "image-carousel": "RVEImageCarousel",
  "gallery-grid": "RVEGalleryGrid",
  "masonry-gallery": "RVEMasonryGallery",
  "stat-counter": "RVEStatCounter",
  "comparison-chart": "RVEComparisonChart",
  "progress-bars": "RVEProgressBars",
  "quote-card": "RVEQuoteCard",
  "end-card": "RVEEndCard",
  "title-split": "RVETitleSplit",
  "cross-dissolve": "RVECrossDissolve",
  "push-transition": "RVEPushTransition",
  "slide-wipe": "RVESlideWipe",
};

const adapterReady = new Set([
  "image-zoom-reveal",
  "lower-third",
  "split-screen",
  "polaroid-frame",
  "photo-stack",
  "image-carousel",
  "gallery-grid",
  "masonry-gallery",
  "stat-counter",
  "comparison-chart",
  "progress-bars",
  "quote-card",
  "end-card",
  "title-split",
  "cross-dissolve",
  "push-transition",
  "slide-wipe",
]);

const transitionSlugs = ["cross-dissolve", "push-transition", "slide-wipe"];

const selectedFirst = (candidates = [], allowedSlugs = new Set()) => candidates.find((slug) => allowedSlugs.has(slug)) || "";

const sentenceSignals = (sentence = "") => {
  const text = clean(sentence, 1000);
  const hasNumber = /\d|percent|%|second|seconds|clip|clips|week|month|year|version|2\.5|30|秒|分钟|小时|天|周|月|年|版本|倍|%|百分/iu.test(text);
  const hasComparison = /because|while|still|more|less|before|after|compare|versus|than|instead|but|过去|现在|之前|之后|而是|不是|相比|对比|变化|难点|真正/iu.test(text);
  const hasMarket = /market moving|related .*products|products show|competitors|platforms|industry|workflows|市场|产品|平台|行业|工作流|生产|生产流程/iu.test(text);
  const hasProcess = /先|再|然后|根据|自动|拆句|找素材|切节奏|加字幕|放进|生成|选择|匹配|路由|流程|步骤|系统|模板/iu.test(text);
  const hasList = /、|，.*，|素材|文字|转场|结尾|字幕|节奏|模板/iu.test(text);
  const isClaim = /matters|means|not .* but|whether|should|change|pressure|useful|关键|核心|重点|难点|不是|而是|真正|应该|意味着|取决于/iu.test(text);
  const isClosing = /close|finally|in short|therefore|the short film|conclusion|最后|结尾|收束|总结|因此|所以|真正的难点/iu.test(text);
  return { hasNumber, hasComparison, hasMarket, hasProcess, hasList, isClaim, isClosing };
};

function routeSentence(sentence, index, total, allowedSlugs) {
  const signals = sentenceSignals(sentence);
  let routeGroup = "primary-evidence-media";
  let candidateSlugs = ["image-zoom-reveal", "split-screen", "polaroid-frame", "photo-stack"];
  let reason = "真实文章配图可用，优先走图片证据模板。";

  if (index === 0) {
    routeGroup = "primary-evidence-media";
    candidateSlugs = ["image-zoom-reveal", "split-screen"];
    reason = "开场句需要先建立文章主视觉。";
  } else if (signals.isClosing || index === total - 1) {
    routeGroup = "claim-and-caption";
    candidateSlugs = ["end-card", "quote-card", "title-split"];
    reason = "结尾句用文章来源绑定的 End Card 安静收束。";
  } else if (signals.hasMarket) {
    routeGroup = "multi-image-evidence";
    candidateSlugs = ["image-carousel", "gallery-grid", "masonry-gallery", "photo-stack"];
    reason = "句子讲市场/相关产品，适合多图证据。";
  } else if (signals.hasProcess || signals.hasList) {
    routeGroup = "process-or-evidence-sequence";
    candidateSlugs = ["split-screen", "image-carousel", "lower-third", "gallery-grid"];
    reason = "句子包含流程/动作/并列材料，应该拆成有节奏的模板镜头。";
  } else if (signals.hasNumber && signals.hasComparison) {
    routeGroup = "data-proof";
    candidateSlugs = ["comparison-chart", "progress-bars", "stat-counter"];
    reason = "句子同时有数字和对比，应该进入数据证明模板。";
  } else if (signals.hasNumber) {
    routeGroup = "data-proof";
    candidateSlugs = ["stat-counter", "progress-bars", "comparison-chart"];
    reason = "句子有数字/时长/版本，应该进入数据模板。";
  } else if (signals.hasComparison) {
    routeGroup = "primary-evidence-media";
    candidateSlugs = ["split-screen", "lower-third", "polaroid-frame"];
    reason = "解释/对比句先用分屏，把文字和真实证据放在同一镜头。";
  } else if (signals.isClaim) {
    routeGroup = "claim-and-caption";
    candidateSlugs = ["quote-card", "title-split", "lower-third"];
    reason = "观点句优先走正式文字观点模板。";
  }

  const selectedSlug = selectedFirst(candidateSlugs, allowedSlugs);
  return {
    routeGroup,
    candidateSlugs,
    selectedSlug,
    compositionId: templateComposition[selectedSlug] || "",
    renderStatus: adapterReady.has(selectedSlug) ? "renderable-adapter-ready" : "needs-adapter",
    reason,
    signals,
  };
}

const selection = await readJson(selectionPath);
const articleManifest = await readJson(articleManifestPath);
const multiImageManifest = await readJson(multiImageManifestPath);
const articleSource = await readJsonOptional(sourcePath, {
  contract: "A1ArticleTemplateSource/v1",
  title: "Seedance 2.5 pushes longer AI video",
  sourceText: fallbackArticleText,
  sourceUrl: "",
  source: "fallback-sample",
});
const previousReport = await readJsonOptional(reportPath, { playbackItems: [] });
const previousById = new Map((previousReport?.playbackItems || []).map((item) => [item.id, item]));
const overridePayload = await readJsonOptional(overridePath, { contract: "A1ArticleTemplateOverride/v1", overrides: {} });
const overrides = overridePayload?.contract === "A1ArticleTemplateOverride/v1" && overridePayload.overrides && typeof overridePayload.overrides === "object"
  ? overridePayload.overrides
  : {};

const allowedSlugs = new Set((selection.groups || []).flatMap((group) => group.templates || []).map((template) => template.slug));
const rawArticleText = clean(articleSource.sourceText || articleSource.articleText || fallbackArticleText, 24000) || fallbackArticleText;
const articleText = rawArticleText;
const articleTitle = clean(articleSource.title || articleTitleFromText(articleText), 180);
const sentences = splitArticleSentences(articleText);
if (!sentences.length) {
  sentences.push(...splitArticleSentences(fallbackArticleText));
}

const mainImageUrl = await imageToDataUrl(articleManifest.localPath, articleManifest.selectedMedia?.contentType || "image/jpeg");
const multiImageUrls = await Promise.all((multiImageManifest.selectedImages || []).slice(0, 6).map((image) => imageToDataUrl(image.localPath, image.contentType)));
const sourceUrlForHost = clean(articleSource.sourceUrl || articleSource.url || "", 900);
const temporaryImageSourceUrl = clean(articleManifest.sourceUrl || "", 900);
let sourceHost = clean(articleSource.source || "", 80) || "article";
try {
  if (sourceUrlForHost) sourceHost = new URL(sourceUrlForHost).hostname.replace(/^www\./u, "");
} catch {
  sourceHost = clean(articleSource.source || "article", 80);
}

const editablePropKeys = new Set([
  "title",
  "subtitle",
  "source",
  "duration",
  "scale",
  "translateX",
  "translateY",
  "imageUrl",
  "fromTitle",
  "toTitle",
  "value",
  "label",
  "suffix",
  "trend",
  "period",
  "beforeValue",
  "afterValue",
  "beforeLabel",
  "afterLabel",
  "quote",
  "attribution",
  "topText",
  "bottomText",
]);

function overrideParamsFor(id = "") {
  const record = overrides[id];
  return record && record.params && typeof record.params === "object" ? record.params : {};
}

function applyTemplateOverride(id, props) {
  const params = overrideParamsFor(id);
  const next = { ...props };
  for (const [key, value] of Object.entries(params)) {
    if (!editablePropKeys.has(key)) continue;
    if (["duration", "scale", "translateX", "translateY", "value", "beforeValue", "afterValue"].includes(key)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) next[key] = numeric;
    } else if (typeof value === "string" && value.trim()) {
      next[key] = value.trim();
    }
  }
  return next;
}

function overridePlaybackFor(id, fallbackDuration) {
  const params = overrideParamsFor(id);
  const durationSec = Number(params.durationSec ?? params.duration ?? fallbackDuration);
  const playbackRate = Number(params.playbackRate ?? 1);
  return {
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : fallbackDuration,
    playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
  };
}

if (fullRender) {
  await fs.rm(outputDir, { recursive: true, force: true });
}
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(reportPath), { recursive: true });

const reusedItemIds = [];
const rerenderedItemIds = [];

async function reusePreviousRenderIfValid(item, signature) {
  if (!incrementalRender) return false;
  const previous = previousById.get(item.id);
  if (!previous || previous.renderSignature !== signature || !previous.output || !previous.poster) return false;
  const outputOk = await fileExists(path.join(root, "public", previous.output));
  const posterOk = await fileExists(path.join(root, "public", previous.poster));
  if (!outputOk || !posterOk) return false;
  item.output = previous.output;
  item.poster = previous.poster;
  item.renderStatus = previous.renderStatus;
  item.reusedRender = true;
  item.renderSignature = signature;
  reusedItemIds.push(item.id);
  return true;
}

const shots = [];
for (const [index, sentence] of sentences.entries()) {
  const route = routeSentence(sentence, index, sentences.length, allowedSlugs);
  const shotId = `shot-${String(index + 1).padStart(2, "0")}-${slugify(route.selectedSlug || route.routeGroup)}`;
  const title = index === 0 ? conciseTitleForSentence(articleTitle || sentence, "Opening beat") : conciseTitleForSentence(sentence, `Shot ${index + 1}`);
  const subtitle = index === 0 ? conciseTitleForSentence(sentence, "") : "";
  const firstNumber = Number(clean(sentence).match(/(?:\d+(?:\.\d+)?)/u)?.[0] || "");
  const dataProps = route.selectedSlug === "stat-counter"
    ? {
        value: Number.isFinite(firstNumber) ? firstNumber : index + 1,
        label: conciseTitleForSentence(sentence, "Article number"),
        suffix: /%|percent/iu.test(sentence) ? "%" : "",
        trend: "article signal",
        period: `sentence ${index + 1}`,
      }
    : route.selectedSlug === "comparison-chart"
      ? {
          beforeValue: Math.max(1, Number.isFinite(firstNumber) ? Math.round(firstNumber / 2) : index + 1),
          afterValue: Number.isFinite(firstNumber) ? firstNumber : (index + 2) * 10,
          beforeLabel: "before",
          afterLabel: "after",
          suffix: /%|percent/iu.test(sentence) ? "%" : "",
        }
      : route.selectedSlug === "progress-bars"
        ? {
            items: [
              { label: "claim", value: 82 },
              { label: "evidence", value: route.signals.hasNumber ? 76 : 58 },
              { label: "context", value: route.signals.hasComparison ? 72 : 48 },
            ],
          }
        : {};
  const textProps = route.selectedSlug === "quote-card"
    ? {
        quote: sentence,
        attribution: "Article claim",
      }
    : route.selectedSlug === "title-split"
      ? {
          topText: index === sentences.length - 1 ? "Evidence" : "",
          bottomText: index === sentences.length - 1 ? "Pressure" : "",
        }
      : {};
  const props = {
    imageUrl: mainImageUrl,
    imageUrls: route.routeGroup === "multi-image-evidence" ? multiImageUrls : [mainImageUrl, ...multiImageUrls.slice(0, 2)],
    title,
    subtitle,
    source: sourceHost,
    duration: 4.2,
    scale: 1.14,
    translateX: 0,
    translateY: 0,
    ...dataProps,
    ...textProps,
  };
  const overriddenProps = applyTemplateOverride(shotId, props);
  const playback = overridePlaybackFor(shotId, Number(overriddenProps.duration || 4.2));
  overriddenProps.duration = playback.durationSec;
  const shot = {
    id: shotId,
    index,
    sentence,
    startSec: Number((index * playback.durationSec).toFixed(2)),
    durationSec: playback.durationSec,
    playbackRate: playback.playbackRate,
    ...route,
    props: {
      ...overriddenProps,
      imageUrl: "<article-image-data-url>",
      imageUrls: overriddenProps.imageUrls.map((_, imageIndex) => `<image-${imageIndex + 1}-data-url>`),
    },
    output: null,
    poster: null,
    error: "",
  };
  shot.renderSignature = renderSignature({
    compositionId: route.compositionId,
    selectedSlug: route.selectedSlug,
    durationSec: shot.durationSec,
    playbackRate: shot.playbackRate,
    props: overriddenProps,
  });

  if (route.renderStatus === "renderable-adapter-ready" && !(await reusePreviousRenderIfValid(shot, shot.renderSignature))) {
    const outputRel = `../public/generated/article-template-router-v1/${shotId}.mp4`;
    const posterRel = `generated/article-template-router-v1/${shotId}.png`;
    rerenderedItemIds.push(shot.id);
    const render = await runRemotion([
      "render",
      "src/index.ts",
      route.compositionId,
      outputRel,
      "--props",
      JSON.stringify(overriddenProps),
      "--overwrite",
      "--codec=h264",
      "--log=warn",
    ]);
    if (render.code === 0) {
      const still = await runRemotion([
        "still",
        "src/index.ts",
        route.compositionId,
        `../public/${posterRel}`,
        "--frame=45",
        "--props",
        JSON.stringify(overriddenProps),
        "--overwrite",
        "--log=warn",
      ]);
      if (still.code === 0) {
        shot.output = `generated/article-template-router-v1/${shotId}.mp4`;
        shot.poster = posterRel;
      } else {
        shot.renderStatus = "render-failed";
        shot.error = still.output.slice(-1400);
      }
    } else {
      shot.renderStatus = "render-failed";
      shot.error = render.output.slice(-1400);
    }
  }
  shots.push(shot);
}

const transitions = [];
for (let index = 0; index < Math.max(0, shots.length - 1); index += 1) {
  const fromShot = shots[index];
  const toShot = shots[index + 1];
  const selectedSlug = transitionSlugs[index % transitionSlugs.length];
  const transitionId = `transition-${String(index + 1).padStart(2, "0")}-${selectedSlug}`;
  const props = {
    fromTitle: fromShot.sentence,
    toTitle: toShot.sentence,
    source: sourceHost,
  };
  const overriddenProps = applyTemplateOverride(transitionId, props);
  const playback = overridePlaybackFor(transitionId, 3);
  const transition = {
    id: transitionId,
    type: "transition",
    index,
    fromShotId: fromShot.id,
    toShotId: toShot.id,
    sentence: `从第 ${index + 1} 句转到第 ${index + 2} 句`,
    startSec: 0,
    durationSec: playback.durationSec,
    playbackRate: playback.playbackRate,
    routeGroup: "section-transition",
    candidateSlugs: transitionSlugs,
    selectedSlug,
    compositionId: templateComposition[selectedSlug],
    renderStatus: adapterReady.has(selectedSlug) ? "renderable-adapter-ready" : "needs-adapter",
    reason: "段落/句子之间插入官方 RVE 转场模板，避免只靠播放器硬切。",
    signals: { transitionBetweenShots: true },
    props: overriddenProps,
    output: null,
    poster: null,
    error: "",
  };
  transition.renderSignature = renderSignature({
    compositionId: transition.compositionId,
    selectedSlug,
    durationSec: transition.durationSec,
    playbackRate: transition.playbackRate,
    props: overriddenProps,
  });

  if (transition.renderStatus === "renderable-adapter-ready" && !(await reusePreviousRenderIfValid(transition, transition.renderSignature))) {
    const outputRel = `../public/generated/article-template-router-v1/${transitionId}.mp4`;
    const posterRel = `generated/article-template-router-v1/${transitionId}.png`;
    rerenderedItemIds.push(transition.id);
    const render = await runRemotion([
      "render",
      "src/index.ts",
      transition.compositionId,
      outputRel,
      "--props",
      JSON.stringify(overriddenProps),
      "--overwrite",
      "--codec=h264",
      "--log=warn",
    ]);
    if (render.code === 0) {
      const still = await runRemotion([
        "still",
        "src/index.ts",
        transition.compositionId,
        `../public/${posterRel}`,
        "--frame=45",
        "--props",
        JSON.stringify(overriddenProps),
        "--overwrite",
        "--log=warn",
      ]);
      if (still.code === 0) {
        transition.output = `generated/article-template-router-v1/${transitionId}.mp4`;
        transition.poster = posterRel;
      } else {
        transition.renderStatus = "render-failed";
        transition.error = still.output.slice(-1400);
      }
    } else {
      transition.renderStatus = "render-failed";
      transition.error = render.output.slice(-1400);
    }
  }

  transitions.push(transition);
}

const playbackItems = [];
for (const [index, shot] of shots.entries()) {
  playbackItems.push({ ...shot, type: "shot" });
  if (transitions[index]) playbackItems.push(transitions[index]);
}

let cursorSec = 0;
for (const item of playbackItems) {
  item.startSec = Number(cursorSec.toFixed(2));
  cursorSec += Number(item.durationSec || 0);
}

function editableParamsForItem(item) {
  const props = item.props || {};
  const fields = [
    { key: "durationSec", label: "时长", type: "number", value: Number(item.durationSec || props.duration || 3), min: 0.6, max: 12, step: 0.1 },
    { key: "playbackRate", label: "播放速度", type: "number", value: Number(item.playbackRate || 1), min: 0.4, max: 2.4, step: 0.05 },
    { key: "source", label: "来源", type: "text", value: props.source || sourceHost },
  ];
  if (item.type === "transition") {
    fields.unshift(
      { key: "fromTitle", label: "转场前文字", type: "text", value: props.fromTitle || "" },
      { key: "toTitle", label: "转场后文字", type: "text", value: props.toTitle || "" },
    );
  } else {
    fields.unshift(
      { key: "title", label: "主标题", type: "text", value: props.title || item.sentence || "" },
      { key: "subtitle", label: "副标题", type: "text", value: props.subtitle || "" },
    );
  }
  if (["image-zoom-reveal", "split-screen", "polaroid-frame", "photo-stack", "image-carousel", "gallery-grid", "masonry-gallery"].includes(item.selectedSlug)) {
    fields.push(
      { key: "imageUrl", label: "图片 URL", type: "text", value: props.imageUrl || "" },
      { key: "scale", label: "推拉强度", type: "number", value: Number(props.scale || 1), min: 1, max: 1.8, step: 0.01 },
      { key: "translateX", label: "水平裁切", type: "number", value: Number(props.translateX || 0), min: -40, max: 40, step: 1 },
      { key: "translateY", label: "垂直裁切", type: "number", value: Number(props.translateY || 0), min: -40, max: 40, step: 1 },
    );
  }
  if (["stat-counter", "comparison-chart", "progress-bars"].includes(item.selectedSlug)) {
    fields.push(
      { key: "value", label: "数值", type: "number", value: Number(props.value || props.afterValue || 30), min: 0, max: 10000, step: 1 },
      { key: "label", label: "数值标签", type: "text", value: props.label || props.afterLabel || "" },
      { key: "suffix", label: "后缀", type: "text", value: props.suffix || "" },
    );
  }
  return {
    contract: "A1TemplateDiyParamProfile/v1",
    itemId: item.id,
    selectedSlug: item.selectedSlug,
    routeGroup: item.routeGroup,
    rerenderRequired: true,
    immediatePreviewFields: ["playbackRate"],
    fields,
  };
}

const report = {
  contract: "A1ArticleTemplateRouter/v1",
  generatedAt: new Date().toISOString(),
  firstPrinciple: "Every article sentence must route to a user-kept official template. Transitions must also be official templates. Adapter gaps are explicit; no self-made placeholder visuals are promoted.",
  engineIntegration: {
    contract: "A1RemotionHyperFramesIntegratedRoute/v1",
    remotionRole: "Stable parameterized render/export source of truth.",
    hyperframesRole: "HTML/GSAP sidecar source for fast visual inspection and frame-seekable prototype checks.",
    overrideSource: path.relative(root, overridePath),
  },
  sourceArticle: {
    contract: articleSource.contract || "A1ArticleTemplateSource/v1",
    title: articleTitle,
    sourceUrl: sourceUrlForHost,
    source: sourceHost,
    sourcePath: path.relative(root, sourcePath),
    inputHash: renderSignature({ articleText }),
    temporaryImageSourceUrl,
    cachedImageUrl: articleManifest.cachedImageUrl,
  },
  selection: {
    source: path.relative(root, selectionPath),
    rejectedCount: selection.rejectedCount,
    previewNeedsRepairCount: selection.previewNeedsRepairCount,
    selectableCount: selection.selectableCount,
  },
  articleText,
  sentenceCount: sentences.length,
  transitionCount: transitions.length,
  playbackItemCount: playbackItems.length,
  totalDurationSec: Number(cursorSec.toFixed(2)),
  renderMode: incrementalRender ? "incremental" : "full",
  reusedItemCount: reusedItemIds.length,
  rerenderedItemCount: rerenderedItemIds.length,
  reusedItemIds,
  rerenderedItemIds,
  renderableCount: shots.filter((shot) => shot.renderStatus === "renderable-adapter-ready" && shot.output).length,
  renderedItemCount: playbackItems.filter((item) => item.renderStatus === "renderable-adapter-ready" && item.output).length,
  needsAdapterCount: playbackItems.filter((item) => item.renderStatus === "needs-adapter").length,
  shots,
  transitions,
  playbackItems,
  overrideAppliedCount: playbackItems.filter((item) => Object.keys(overrideParamsFor(item.id)).length > 0).length,
  nextAdapterBacklog: [...new Set(playbackItems.filter((item) => item.renderStatus === "needs-adapter").map((item) => item.selectedSlug))],
  rejectIf: ["missingSentenceRoute", "rejectedTemplateSelected", "previewNeedsRepairSelected", "selfMadeFallbackVisual", "silentSentenceDrop"],
};

await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const playerItems = playbackItems.map((item, sequenceIndex) => ({
  id: item.id,
  type: item.type,
  sequenceIndex,
  sentence: item.sentence,
  routeGroup: item.routeGroup,
  selectedSlug: item.selectedSlug,
  compositionId: item.compositionId,
  renderStatus: item.renderStatus,
  reason: item.reason,
  output: item.output,
  poster: item.poster,
  durationSec: item.durationSec,
  playbackRate: item.playbackRate,
  editableParams: editableParamsForItem(item),
}));
const playerData = JSON.stringify(playerItems).replace(/</gu, "\\u003c");

const shotRows = playerItems.map((item) => `
  <button class="shotRow" data-index="${item.sequenceIndex}" data-status="${escapeHtml(item.renderStatus)}" data-type="${escapeHtml(item.type)}">
    <span>${String(item.sequenceIndex + 1).padStart(2, "0")} ${escapeHtml(item.type === "transition" ? "TRANSITION" : "SHOT")}</span>
    <strong>${escapeHtml(item.selectedSlug || "needs-template")}</strong>
    <small>${escapeHtml(item.renderStatus)} / ${escapeHtml(item.routeGroup)}</small>
  </button>
`).join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Article Template Router v1</title>
  <style>
    :root { color-scheme: dark; --bg:#050605; --panel:#10140d; --line:rgba(231,255,205,.18); --ink:#f6f5e8; --muted:rgba(246,245,232,.64); --accent:#d7ff2f; --warn:#ffcc66; --bad:#ff6b6b; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:"Avenir Next","Helvetica Neue",Arial,"PingFang SC",sans-serif; }
    header { padding:28px 34px 20px; border-bottom:1px solid var(--line); display:grid; grid-template-columns:minmax(420px,1fr) auto; gap:28px; align-items:end; }
    h1 { margin:0; font-size:clamp(42px,5vw,80px); line-height:.88; letter-spacing:0; }
    .lead { max-width:820px; margin:12px 0 0; color:var(--muted); font-size:17px; line-height:1.42; font-weight:760; }
    .stats { display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
    .pill { border:1px solid var(--line); background:#11140e; border-radius:999px; padding:9px 12px; font:900 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .pill strong { color:var(--accent); }
    main { display:grid; grid-template-columns:minmax(680px,1fr) 390px; min-height:calc(100vh - 160px); }
    .stage { padding:28px 34px 36px; border-right:1px solid var(--line); }
    .screen { position:relative; aspect-ratio:16/9; background:#000; border:1px solid rgba(215,255,47,.32); overflow:hidden; }
    video { width:100%; height:100%; display:block; object-fit:cover; background:#000; }
    .needs { position:absolute; inset:0; display:none; place-items:center; background:linear-gradient(135deg,#090b08,#171d12); padding:54px; }
    .needsInner { max-width:720px; }
    .needs b { color:var(--warn); font:950 16px/1 ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; }
    .needs h2 { margin:16px 0 0; font-size:46px; line-height:1; }
    .needs p { color:var(--muted); font-size:20px; line-height:1.35; font-weight:760; }
    .caption { margin-top:18px; display:grid; grid-template-columns:1fr auto; gap:20px; align-items:start; }
    .caption h2 { margin:0; font-size:34px; line-height:1.05; }
    .caption p { margin:8px 0 0; color:var(--muted); font-size:16px; line-height:1.42; font-weight:740; }
    .tag { color:#050605; background:var(--accent); border-radius:999px; padding:8px 10px; font:950 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:nowrap; }
    .side { padding:24px; display:grid; gap:10px; align-content:start; }
    .editor { border:1px solid rgba(215,255,47,.34); background:#10140d; padding:14px; display:grid; gap:10px; }
    .editor h2 { margin:0; font-size:22px; line-height:1; }
    .editor p { margin:0; color:var(--muted); font-size:12px; line-height:1.35; font-weight:760; }
    .field { display:grid; gap:5px; }
    .field label { color:var(--accent); font:950 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; }
    .field input { width:100%; border:1px solid var(--line); background:#050605; color:var(--ink); border-radius:4px; padding:9px 10px; font:800 13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .field input[type="range"] { padding:0; accent-color:var(--accent); }
    textarea.override { width:100%; min-height:126px; resize:vertical; border:1px solid var(--line); background:#050605; color:var(--muted); padding:10px; font:760 11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .renderStatus { min-height:18px; color:var(--muted); font:850 12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .shotRow { width:100%; text-align:left; border:1px solid var(--line); background:#0d100b; color:var(--ink); padding:13px 14px; display:grid; gap:5px; cursor:pointer; }
    .shotRow.active { border-color:var(--accent); background:#171d12; }
    .shotRow[data-status="needs-adapter"] { border-color:rgba(255,204,102,.34); }
    .shotRow span { color:var(--accent); font:950 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .shotRow strong { font-size:20px; line-height:1; }
    .shotRow small { color:var(--muted); font:850 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .controls { margin-top:16px; display:flex; gap:10px; }
    .control { border:1px solid rgba(215,255,47,.35); background:rgba(215,255,47,.08); color:var(--accent); border-radius:6px; padding:10px 13px; font-weight:900; cursor:pointer; }
    @media (max-width:1100px) { header { grid-template-columns:1fr; } .stats { justify-content:flex-start; } main { grid-template-columns:1fr; } .stage { border-right:0; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Article Template<br />Router v1</h1>
      <p class="lead">这不是模板目录页，而是文章句子进入模板路由后的结果。正文镜头和句间转场都必须来自官方模板；还没 adapter 的模板会明确停在待接入，不再用低级自造画面顶替。</p>
    </div>
    <div class="stats">
      <div class="pill">句子 <strong>${report.sentenceCount}</strong></div>
      <div class="pill">转场 <strong>${report.transitionCount}</strong></div>
      <div class="pill">连续段落 <strong>${report.playbackItemCount}</strong></div>
      <div class="pill">已渲染 <strong>${report.renderedItemCount}</strong></div>
      <div class="pill">待 adapter <strong>${report.needsAdapterCount}</strong></div>
      <div class="pill">可选模板池 <strong>${selection.selectableCount}</strong></div>
    </div>
  </header>
  <main>
    <section class="stage">
      <div class="screen">
        <video id="player" muted autoplay playsinline controls></video>
        <div class="needs" id="needs"><div class="needsInner"><b id="needsSlug"></b><h2>这个句子命中模板，但还没 adapter</h2><p id="needsText"></p></div></div>
      </div>
      <div class="caption">
        <div>
          <h2 id="captionTitle"></h2>
          <p id="captionText"></p>
        </div>
        <div class="tag" id="captionTag"></div>
      </div>
      <div class="controls">
        <button class="control" id="prev">上一句</button>
        <button class="control" id="next">下一句</button>
        <button class="control" id="restart">从头播放</button>
      </div>
    </section>
    <aside class="side">
      <section class="editor">
        <h2>Template DIY</h2>
        <p>这里显示当前官方模板已经暴露出来的可调参数。应用后会写入 override，后端只重渲染变化片段，再生成 HyperFrames sidecar 和 Remotion MP4。</p>
        <div id="editorFields"></div>
        <button class="control" id="applyDiy" type="button">应用到预览</button>
        <button class="control" id="rerenderDiy" type="button">应用并重渲染</button>
        <div class="renderStatus" id="rerenderStatus"></div>
        <textarea class="override" id="overrideJson" spellcheck="false"></textarea>
      </section>
      ${shotRows}
    </aside>
  </main>
  <script>
    const shots = ${playerData};
    const player = document.getElementById("player");
    const needs = document.getElementById("needs");
    const rows = [...document.querySelectorAll(".shotRow")];
    const editorFields = document.getElementById("editorFields");
    const overrideJson = document.getElementById("overrideJson");
    const rerenderStatus = document.getElementById("rerenderStatus");
    const storageKey = "a1:article-template-router-overrides:v1";
    let current = 0;
    function loadOverrides() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }
    function saveOverrides(overrides) {
      localStorage.setItem(storageKey, JSON.stringify(overrides));
    }
    function fieldValue(item, field) {
      const overrides = loadOverrides();
      const itemOverride = overrides[item.id]?.params || {};
      return Object.prototype.hasOwnProperty.call(itemOverride, field.key) ? itemOverride[field.key] : field.value;
    }
    function renderEditor(shot) {
      const profile = shot.editableParams || { fields: [] };
      editorFields.innerHTML = profile.fields.map((field) => {
        const value = fieldValue(shot, field);
        const attrs = [
          'data-key="' + field.key + '"',
          'type="' + (field.type === "number" ? "number" : "text") + '"',
          'value="' + String(value ?? "").replace(/"/g, "&quot;") + '"',
        ];
        if (field.type === "number") {
          attrs.push('min="' + field.min + '"', 'max="' + field.max + '"', 'step="' + field.step + '"');
        }
        return '<div class="field"><label>' + field.label + '</label><input ' + attrs.join(" ") + ' /></div>';
      }).join("");
      syncOverrideText(shot);
    }
    function collectEditorParams() {
      const params = {};
      editorFields.querySelectorAll("input").forEach((input) => {
        params[input.dataset.key] = input.type === "number" ? Number(input.value) : input.value;
      });
      return params;
    }
    function syncOverrideText(shot) {
      const overrides = loadOverrides();
      const payload = {
        contract: "A1ArticleTemplateOverride/v1",
        note: "Feed this JSON back into the renderer to regenerate official template segments. Browser preview only applies playbackRate immediately.",
        currentItemId: shot.id,
        overrides,
      };
      overrideJson.value = JSON.stringify(payload, null, 2);
    }
    function applyDiyToCurrent() {
      const shot = shots[current];
      const overrides = loadOverrides();
      overrides[shot.id] = {
        selectedSlug: shot.selectedSlug,
        updatedAt: new Date().toISOString(),
        params: collectEditorParams(),
      };
      saveOverrides(overrides);
      const playbackRate = Number(overrides[shot.id].params.playbackRate || 1);
      player.playbackRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
      syncOverrideText(shot);
      return overrides;
    }
    async function rerenderDiyToBackend() {
      const overrides = applyDiyToCurrent();
      const payload = {
        contract: "A1ArticleTemplateOverride/v1",
        updatedAt: new Date().toISOString(),
        currentItemId: shots[current].id,
        overrides,
      };
      rerenderStatus.textContent = "rerendering changed official template clips...";
      const endpoints = ["/api/article-template-router/rerender", "http://127.0.0.1:4288/api/article-template-router/rerender"];
      let lastError = "";
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.error || "rerender failed");
          rerenderStatus.textContent = "done: rerendered " + result.router.rerenderedItemCount + ", reused " + result.router.reusedItemCount + ", mp4 " + result.export.totalDurationSec + "s";
          window.setTimeout(() => window.location.reload(), 900);
          return;
        } catch (error) {
          lastError = error.message;
        }
      }
      rerenderStatus.textContent = "failed: " + lastError;
    }
    function activate(index) {
      current = (index + shots.length) % shots.length;
      const shot = shots[current];
      rows.forEach((row, rowIndex) => row.classList.toggle("active", rowIndex === current));
      renderEditor(shot);
      document.getElementById("captionTitle").textContent = shot.selectedSlug || "needs-template";
      document.getElementById("captionText").textContent = shot.sentence + " " + shot.reason;
      document.getElementById("captionTag").textContent = shot.type + " / " + shot.renderStatus + " / " + shot.routeGroup;
      if (shot.output) {
        needs.style.display = "none";
        player.style.display = "block";
        player.poster = shot.poster || "";
        player.src = shot.output;
        player.playbackRate = Number(loadOverrides()[shot.id]?.params?.playbackRate || 1);
        player.currentTime = 0;
        player.play().catch(() => {});
      } else {
        player.pause();
        player.removeAttribute("src");
        player.load();
        player.style.display = "none";
        needs.style.display = "grid";
        document.getElementById("needsSlug").textContent = shot.selectedSlug || "needs-template";
        document.getElementById("needsText").textContent = shot.sentence;
        window.clearTimeout(window.__a1RouterTimer);
        window.__a1RouterTimer = window.setTimeout(() => activate(current + 1), Math.max(1800, shot.durationSec * 1000));
      }
    }
    player.addEventListener("ended", () => activate(current + 1));
    document.getElementById("prev").addEventListener("click", () => activate(current - 1));
    document.getElementById("next").addEventListener("click", () => activate(current + 1));
    document.getElementById("restart").addEventListener("click", () => activate(0));
    document.getElementById("applyDiy").addEventListener("click", applyDiyToCurrent);
    document.getElementById("rerenderDiy").addEventListener("click", () => rerenderDiyToBackend());
    rows.forEach((row) => row.addEventListener("click", () => activate(Number(row.dataset.index))));
    activate(0);
  </script>
</body>
</html>`;

await fs.writeFile(previewPath, html);

const failed = shots.filter((shot) => shot.renderStatus === "render-failed");
const failedTransitions = transitions.filter((transition) => transition.renderStatus === "render-failed");
if (failed.length || failedTransitions.length) {
  console.error(JSON.stringify({ failed, failedTransitions }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  contract: report.contract,
  sentenceCount: report.sentenceCount,
  transitionCount: report.transitionCount,
  playbackItemCount: report.playbackItemCount,
  renderableCount: report.renderableCount,
  renderedItemCount: report.renderedItemCount,
  reusedItemCount: report.reusedItemCount,
  rerenderedItemCount: report.rerenderedItemCount,
  needsAdapterCount: report.needsAdapterCount,
  nextAdapterBacklog: report.nextAdapterBacklog,
  reportPath,
  previewPath,
  url: "http://127.0.0.1:4301/article-template-router-v1.html",
}, null, 2));
