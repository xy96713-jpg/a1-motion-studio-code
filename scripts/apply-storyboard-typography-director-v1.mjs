#!/usr/bin/env node
/**
 * Apply a semantic typography director to every storyboard row.
 *
 * This keeps generated imagery text-free while making typography an explicit,
 * editable render contract. It is intentionally deterministic: no random
 * template rotation and no image-baked words.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-typography-director-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const approvalPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json");

const latinByBeat = {
  "H01-B01": "WORKBENCH",
  "H01-B05": "CONTEXT",
  "H03-B04": "MODELS",
  "H05-B02": "SYSTEM",
  "H06-B01": "API",
  "H08-B03": "SAME LOGIC",
  "H10-B02": "WORKFLOW",
};

const latinByKeyword = [
  [/工作台|系统|流程|工作流/u, "WORKFLOW"],
  [/AI 味|不说人话|不通顺/u, "AI TASTE"],
  [/模型|GPT|Claude|Kimi|DeepSeek|智谱/u, "MODELS"],
  [/风格库|喜欢库|讨厌库|历史|版本/u, "ARCHIVE"],
  [/方向|读者|往哪/u, "DIRECTION"],
  [/全文|文章|稿/u, "DRAFT"],
  [/演示模式|口播/u, "PROMPT"],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function compact(value = "") {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function visualText(scene) {
  return compact(scene.storyboard?.visualFocusText || scene.presentation?.primary || (scene.titleLines || []).join("") || scene.screenText);
}

function sourceText(scene) {
  return compact(scene.screenText || scene.storyboard?.semanticFill?.sourceText || "");
}

function latinTextFor(scene, title) {
  if (latinByBeat[scene.beatId]) return latinByBeat[scene.beatId];
  const text = `${title} ${sourceText(scene)}`;
  const matched = latinByKeyword.find(([pattern]) => pattern.test(text));
  return matched ? matched[1] : null;
}

function toneFor(scene, title) {
  const text = `${title} ${sourceText(scene)}`;
  if (/废稿|泛泛|不说人话|不通顺|太枯燥|问题|硬伤/u.test(text)) return "verdict-red";
  if (/方向|风格|喜欢|工作台|工作流|系统/u.test(text)) return "signal-yellow";
  if (/档案|历史|版本|库|保存|收稿/u.test(text)) return "archive-green";
  if (/划|点击|输入|调节|检查|候选|放回/u.test(text)) return "cobalt";
  return "ink";
}

function presetFor(scene, title) {
  const state = scene.presentation?.state || "";
  const family = scene.family || scene.presentation?.visualRole || "";
  const route = scene.storyboard?.semanticFill?.assetRoute || "";
  const text = `${title} ${sourceText(scene)}`;
  const latin = latinTextFor(scene, title);
  const strongJudgement = /废稿|泛泛|不说人话|不通顺|太枯燥|没解决|问题|硬伤|推翻|方向走|自己.*风格/u.test(text);
  if (strongJudgement || ["criteria-write", "decision-branch", "comparison"].includes(state)) return "poster-slam";
  if (latin && (route === "typography-only" || family === "type-statement")) return "cinema-condensed";
  if (/archive|revision|writeback/u.test(`${family} ${state}`)) return "archive-label";
  if (/operation|process|line-select/u.test(`${family} ${state}`)) return "quiet-subtitle";
  return "keyword-mask";
}

function layoutFor(preset, scene) {
  if (preset === "poster-slam") return scene.beatId.endsWith("04") ? "bottom-slam" : "center-slam";
  if (preset === "cinema-condensed") return "left-poster-stack";
  if (preset === "archive-label") return "archive-tag-left";
  if (preset === "quiet-subtitle") return "stage-owned-minimal";
  return "keyword-focus";
}

function motionFor(preset) {
  return ({
    "poster-slam": "slam-in",
    "cinema-condensed": "track-expand",
    "archive-label": "scan-label",
    "quiet-subtitle": "quiet-hold",
    "keyword-mask": "mask-reveal",
  })[preset] || "mask-reveal";
}

function directorFor(scene, index) {
  const title = visualText(scene);
  const preset = presetFor(scene, title);
  const latinText = latinTextFor(scene, title);
  const tone = toneFor(scene, title);
  const semanticStageKind = scene.storyboard?.semanticDecision?.semanticStageKind || scene.storyboard?.semanticFill?.semanticStageKind || null;
  return {
    contract: "A1TypographyDirector/v1",
    phaseId,
    source: "semantic-storyboard-fields",
    order: index + 1,
    preset,
    displayText: title,
    latinText,
    colorRole: tone,
    layoutRole: layoutFor(preset, scene),
    motion: motionFor(preset),
    semanticStageKind,
    editableTextLayer: true,
    imageBakedTextAllowed: false,
    generatedArtworkTextAllowed: false,
    useCase: preset === "poster-slam"
      ? "观点/问题/转折用大字压屏，形成短视频海报感"
      : preset === "cinema-condensed"
        ? "产品词或技术词用窄长英文海报字加中文主标题"
        : preset === "archive-label"
          ? "归档/版本/风格库用标签化、小编号和扫描入场"
          : preset === "quiet-subtitle"
            ? "操作说明让语义组件讲清楚，文字只保留可读焦点"
            : "普通关键词用可编辑大字和遮罩入场",
    rules: [
      "文字必须保持本地可编辑，不进入生图 prompt",
      "优先显示分镜焦点词，不把整句硬塞进画面",
      "字形变化来自语义角色，不做随机模板轮换",
      "信息弱的镜头允许只做文字包装，不强制补图",
    ],
    referenceTaste: {
      condensedPosterLatin: preset === "cinema-condensed",
      massiveCjkImpact: preset === "poster-slam",
      highSaturationAccent: ["poster-slam", "cinema-condensed"].includes(preset),
      abstractSymbolicArtworkOnly: true,
    },
  };
}

function apply(props) {
  const rows = [];
  (props.scenes || []).forEach((scene, index) => {
    const typographyDirector = directorFor(scene, index);
    scene.storyboard = {
      ...(scene.storyboard || {}),
      typographyDirector,
    };
    rows.push({
      beatId: scene.beatId,
      preset: typographyDirector.preset,
      displayText: typographyDirector.displayText,
      latinText: typographyDirector.latinText,
      colorRole: typographyDirector.colorRole,
      motion: typographyDirector.motion,
      layoutRole: typographyDirector.layoutRole,
    });
  });
  props.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (props.scenes || []).map((scene) => [scene.beatId, scene.screenText, scene.storyboard?.semanticFill, scene.storyboard?.typographyDirector]),
  })).digest("hex");
  return rows;
}

if (!fs.existsSync(storyboardPropsPath)) throw new Error(`missing storyboard props: ${rel(storyboardPropsPath)}`);
if (!fs.existsSync(rendererPropsPath)) throw new Error(`missing renderer props: ${rel(rendererPropsPath)}`);

const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};
const storyboardProps = readJson(storyboardPropsPath);
const rows = apply(storyboardProps);
const rendererProps = JSON.parse(JSON.stringify(storyboardProps));

writeJson(storyboardPropsPath, storyboardProps);
writeJson(rendererPropsPath, rendererProps);

const after = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};
const generatedAt = new Date().toISOString();

if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.typographyDirector = {
    phaseId,
    reportPath: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
  };
  manifest.reviewState = {
    ...(manifest.reviewState || {}),
    approvalInvalidatedAt: generatedAt,
    approvalInvalidationReason: "typography-director-applied",
  };
  writeJson(manifestPath, manifest);
}

if (fs.existsSync(approvalPath)) {
  writeJson(approvalPath, {
    contract: "A1StoryboardApproval/v1",
    status: "INVALIDATED_BY_STORYBOARD_CHANGE",
    invalidatedAt: generatedAt,
    reason: "typography-director-applied",
    before,
    after,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  });
}

const byPreset = rows.reduce((acc, row) => {
  acc[row.preset] = (acc[row.preset] || 0) + 1;
  return acc;
}, {});
const report = {
  contract: "A1StoryboardTypographyDirectorApply/v1",
  phaseId,
  status: "APPLIED",
  generatedAt,
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  summary: {
    rowCount: rows.length,
    presetCount: Object.keys(byPreset).length,
    byPreset,
    editableTextLayerCount: rows.length,
    imageBakedTextAllowedCount: 0,
  },
  rows,
  nextAction: "audit-storyboard-typography-director-then-review-stage-preview",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  after: report.after,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
