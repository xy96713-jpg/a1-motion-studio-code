#!/usr/bin/env node
/**
 * Build a full-article Stage 2 review candidate without mutating the current
 * renderer props. This is intentionally a local structured judgement pass:
 * it makes every scene's cognitive role, visual route, motion job, and
 * continuity context explicit, then applies four user-reported repairs to a
 * separate candidate props file for representative still review.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildCurrentFilmManifest} from "../lib/current-film-manifest.js";

const root = process.cwd();
const phaseId = "storyboard-stage2-full-review-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");

const anchorBeatIds = [
  "H01-B01", "H02-B02", "H03-B04", "H04-B04", "H05-B03", "H06-B01",
  "H07-B01", "H08-B02", "H09-B03", "H10-B03", "H10-B04", "H11-B01",
];

const targetRepairs = {
  "H03-B04": {
    summary: "把模型名单从伪证据/单一焦点改为可读的因果判断：试过多种模型，问题仍不只是模型。",
    visualFocusText: "五种模型都试过",
    titleLines: ["五种模型都试过"],
    primary: "五种模型都试过",
    route: "deterministic-semantic-stage",
    motionJob: "cause-chain-to-verdict",
    layoutJob: "causal-chain-with-model-roster",
    semanticVisual: {
      contract: "A1SemanticVisualStage/v1",
      kind: "argument",
      titleMode: "stage-owned",
      argument: {
        mode: "causal",
        counterpoints: ["GPT / Claude / Kimi", "DeepSeek / 智谱"],
        cause: "多模型轮换",
        effect: "问题仍在",
        conclusion: "不只是模型问题",
      },
    },
    suppressEntityEvidence: true,
    acceptance: ["五个模型名作为可编辑文本完整出现", "不把用户口述名单误当官方证据", "因果节点和结论可读"],
  },
  "H06-B01": {
    summary: "把 Codex、API、DeepSeek 的关系画成单向调用链，补上缺失的因果中继。",
    visualFocusText: "Codex 调用链",
    titleLines: ["Codex 调用链"],
    primary: "调用链",
    route: "deterministic-semantic-stage",
    motionJob: "step-cards-connect-and-writeback",
    layoutJob: "object-action-result-flow",
    semanticVisual: {
      contract: "A1SemanticVisualStage/v1",
      kind: "operation",
      titleMode: "stage-owned",
      operation: {
        object: "Codex",
        action: "调用 API",
        result: "DeepSeek 写全文",
        badges: ["编排", "接口", "生成"],
      },
    },
    acceptance: ["Codex → API → DeepSeek 顺序不可歧义", "蓝色只标记动作路径", "不伪造 DeepSeek 界面或 logo"],
  },
  "H10-B03": {
    summary: "把溢出/截断风险改为短标题加三步结构，明确从动作到工作流的转化。",
    visualFocusText: "变成可控工作流",
    titleLines: ["变成可控工作流"],
    primary: "变成可控工作流",
    route: "deterministic-semantic-stage",
    motionJob: "step-cards-connect-and-writeback",
    layoutJob: "short-title-with-three-step-flow",
    semanticVisual: {
      contract: "A1SemanticVisualStage/v1",
      kind: "operation",
      titleMode: "stage-owned",
      operation: {
        object: "零散写作动作",
        action: "固定成工作流",
        result: "可控输出",
        badges: ["动作", "规则", "结果"],
      },
    },
    acceptance: ["标题完整显示且不依赖省略号", "动作—规则—结果一眼可读", "不再用泛化对照卡替代语义"],
  },
  "H11-B01": {
    summary: "把重复蓝色流程占位符改成机器输出—人工修改—可用成稿的三段操作链。",
    visualFocusText: "人工修改",
    titleLines: ["人工修改"],
    primary: "人来修改",
    route: "deterministic-semantic-stage",
    motionJob: "step-cards-connect-and-writeback",
    layoutJob: "human-writeback-operation-flow",
    semanticVisual: {
      contract: "A1SemanticVisualStage/v1",
      kind: "operation",
      titleMode: "stage-owned",
      operation: {
        object: "机器初稿",
        action: "人来修改",
        result: "可用成稿",
        badges: ["机器输出", "人工判断", "写回版本"],
      },
    },
    acceptance: ["三段对象关系清楚", "蓝色只落在人工动作节点", "不出现重复空流程占位"],
  },
};

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

function sha256SerializedJson(value) {
  return crypto.createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function compact(value, max = 90) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function cognitiveRole(scene, index, total) {
  const text = `${scene.screenText || ""} ${scene.presentation?.primary || ""}`;
  const semanticKind = scene.semanticVisual?.kind || scene.storyboard?.semanticFill?.semanticStageKind;
  if (index === 0 || scene.storyboard?.visualArchetype?.id === "thesis-statement") return "opening-orientation";
  if (semanticKind === "operation" || scene.family === "process-chain" || scene.presentation?.state === "line-select") return "operation-or-example";
  if (semanticKind === "archive" || scene.family === "archive-stack" || /保存|历史|版本|风格库|归档|存/u.test(text)) return "memory-or-archive";
  if (semanticKind === "argument" || scene.storyboard?.visualArchetype?.id === "contrast-turn" || /因为|所以|导致|问题|但是|不过|不是/u.test(text)) return "cause-effect-judgement";
  if (/[？?]|为什么|怎么|如何|是否/u.test(text)) return "question-or-doubt";
  if (index >= total - 2 || /总之|形成自己的系统|往哪个方向走/u.test(text)) return "closing-synthesis";
  return "supporting-explanation";
}

function routeFor(scene, role) {
  const existing = scene.storyboard?.semanticFill?.assetRoute;
  if (existing) return existing;
  if (role === "operation-or-example" || role === "cause-effect-judgement" || role === "memory-or-archive" || role === "question-or-doubt") return "deterministic-semantic-stage";
  if (/废稿|AI 味|不说人话/u.test(scene.screenText || "")) return "gpt-editorial-artwork";
  return "typography-only";
}

function focusFor(scene) {
  const existing = scene.storyboard?.visualFocusText || scene.presentation?.primary || scene.titleLines?.[0] || scene.screenText;
  return compact(existing, 28).replace(/[.…]+$/u, "");
}

function buildSceneReview(scene, index, scenes, repeatedMotion) {
  const role = cognitiveRole(scene, index, scenes.length);
  const route = routeFor(scene, role);
  const target = targetRepairs[scene.beatId] || null;
  const focus = target?.visualFocusText || focusFor(scene);
  const previous = scenes[index - 1] || null;
  const next = scenes[index + 1] || null;
  const motionJob = target?.motionJob || scene.storyboard?.semanticFill?.motionJob || scene.motionPlan?.primaryAction || "quiet-type-emphasis";
  const layoutJob = target?.layoutJob || scene.storyboard?.semanticFill?.layoutJob || scene.layout?.layoutSignature || "editorial-baseline";
  const currentSignature = `${scene.motionPlan?.motionStyle || ""}|${scene.motionPlan?.primaryCurve || ""}|${scene.presentation?.state || ""}`;
  return {
    beatId: scene.beatId,
    macroId: scene.macroId,
    index,
    sourceText: scene.screenText,
    context: {
      previousBeatId: previous?.beatId || null,
      previousFocus: previous ? focusFor(previous) : null,
      nextBeatId: next?.beatId || null,
      nextFocus: next ? focusFor(next) : null,
    },
    cognitiveRole: role,
    formalHighlight: scene.animationTier === "formal-highlight" || scene.animationTier === "hero" || ["opening-orientation", "cause-effect-judgement", "closing-synthesis"].includes(role),
    recordingReplaceable: Boolean(scene.recordingReplaceable),
    visualFocusText: focus,
    visualRoute: route,
    motionJob,
    layoutJob,
    current: {
      visualArchetype: scene.storyboard?.visualArchetype?.id || null,
      semanticStageKind: scene.semanticVisual?.kind || scene.storyboard?.semanticFill?.semanticStageKind || null,
      motionSignature: currentSignature,
      repeatedMotionRisk: (repeatedMotion.get(currentSignature) || 0) > 4,
      titleLines: scene.titleLines || [],
    },
    proposed: target ? {
      repair: true,
      summary: target.summary,
      semanticVisual: target.semanticVisual,
      titleLines: target.titleLines,
      primary: target.primary,
      visualFocusText: target.visualFocusText,
      suppressEntityEvidence: Boolean(target.suppressEntityEvidence),
      acceptance: target.acceptance,
    } : {
      repair: false,
      summary: "保留当前语义填充，先把认知角色、视觉路线和相邻镜头关系登记到整片 Stage2 账本。",
      semanticVisual: scene.semanticVisual || null,
      titleLines: scene.titleLines || [],
      primary: scene.presentation?.primary || null,
      visualFocusText: focus,
      suppressEntityEvidence: false,
      acceptance: ["标题可读", "路线与句义一致", "与前后镜头保持视觉连续"],
    },
    confidence: target ? 0.96 : role === "supporting-explanation" ? 0.78 : 0.86,
    status: target ? "TARGETED_REPAIR" : "FULL_ARTICLE_REVIEWED",
  };
}

function applyTargetToCandidate(scene, target) {
  if (!target) return;
  scene.titleLines = [...target.titleLines];
  scene.presentation = {
    ...scene.presentation,
    primary: target.primary,
    semanticDelta: `stage2-full-review:${target.visualFocusText}`,
  };
  scene.storyboard = {
    ...Object.fromEntries(Object.entries(scene.storyboard || {}).filter(([key]) => key !== "visualArchetype" && key !== "typographyDirector")),
    stage2SemanticPriority: true,
    visualFocusText: target.visualFocusText,
    semanticFill: {
      ...(scene.storyboard?.semanticFill || {}),
      visibleText: target.visualFocusText,
      intent: target.summary,
      fillWhat: target.summary,
      fillHow: `Stage2 candidate uses ${target.layoutJob}; keep all Chinese text editable and route visual meaning through a deterministic semantic stage.`,
      assetRoute: target.route,
      motionJob: target.motionJob,
      layoutJob: target.layoutJob,
      status: "stage2-review-candidate",
      rendererAdoptionAllowed: false,
    },
  };
  scene.semanticVisual = target.semanticVisual;
  if (target.suppressEntityEvidence) scene.entityEvidence = [];
}

const currentProps = readJson(propsPath);
const currentFilm = buildCurrentFilmManifest(root);
const sourcePropsSha256 = sha256File(propsPath);
const scenes = Array.isArray(currentProps.scenes) ? currentProps.scenes : [];
const repeatedMotion = scenes.reduce((counts, scene) => {
  const signature = `${scene.motionPlan?.motionStyle || ""}|${scene.motionPlan?.primaryCurve || ""}|${scene.presentation?.state || ""}`;
  counts.set(signature, (counts.get(signature) || 0) + 1);
  return counts;
}, new Map());

const candidateProps = JSON.parse(JSON.stringify(currentProps));
for (const scene of candidateProps.scenes || []) applyTargetToCandidate(scene, targetRepairs[scene.beatId]);
const candidatePropsSha256 = sha256SerializedJson(candidateProps);
const reviews = scenes.map((scene, index) => buildSceneReview(scene, index, scenes, repeatedMotion));
const targetBeatIds = Object.keys(targetRepairs);
const missingTargetBeatIds = targetBeatIds.filter((beatId) => !scenes.some((scene) => scene.beatId === beatId));
const selectedAnchors = anchorBeatIds.map((beatId) => reviews.find((item) => item.beatId === beatId)).filter(Boolean);
const blockers = [];
  if (!["NEEDS_REVISION", "ASSET_READY"].includes(currentFilm.state)) blockers.push({id: "current-film-not-reviewable", detail: `Expected NEEDS_REVISION or ASSET_READY, observed ${currentFilm.state}`});
if (!scenes.length) blockers.push({id: "missing-current-scenes", detail: rel(propsPath)});
if (missingTargetBeatIds.length) blockers.push({id: "target-beat-missing", beatIds: missingTargetBeatIds});
if (sourcePropsSha256 !== currentFilm.current.rendererPropsSha256) blockers.push({id: "current-props-sha-mismatch", detail: "Candidate was not built from the current-film manifest binding."});

const report = {
  contract: "A1StoryboardStage2FullReview/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  status: blockers.length ? "BLOCKED" : "REVIEW_CANDIDATE_READY",
  stage2Mode: "codex-local-structured-judgement",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  applyAllowedBeforeExplicitApproval: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  sourceBinding: {
    currentFilmState: currentFilm.state,
    propsPath: rel(propsPath),
    propsSha256: sourcePropsSha256,
    currentFilmBuildId: currentFilm.current.buildId,
    rendererSourceSha256: currentFilm.current.rendererSourceSha256,
    visualMasterId: "july1-retro-print-archive-wireframe-v1",
  },
  candidate: {
    propsPath: rel(path.join(artifactRoot, "candidate-props.json")),
    publicPropsPath: rel(path.join(publicRoot, "candidate-props.json")),
    propsSha256: candidatePropsSha256,
    changedBeatIds: targetBeatIds,
    unchangedCurrentProps: true,
  },
  summary: {
    sceneCount: scenes.length,
    macroCount: new Set(scenes.map((scene) => scene.macroId).filter(Boolean)).size,
    reviewedSceneCount: reviews.length,
    targetedRepairCount: targetBeatIds.length,
    anchorCount: selectedAnchors.length,
    byRole: reviews.reduce((acc, item) => { acc[item.cognitiveRole] = (acc[item.cognitiveRole] || 0) + 1; return acc; }, {}),
    byRoute: reviews.reduce((acc, item) => { acc[item.visualRoute] = (acc[item.visualRoute] || 0) + 1; return acc; }, {}),
    repeatedMotionRiskCount: reviews.filter((item) => item.current.repeatedMotionRisk).length,
  },
  anchorBeatIds,
  targetRepairs: reviews.filter((item) => item.proposed.repair),
  scenes: reviews,
  blockers,
  nextAction: blockers.length ? "repair-stage2-full-review-blockers" : "review-stage2-candidate-contact-sheet-before-adoption",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
writeJson(path.join(artifactRoot, "candidate-props.json"), candidateProps);
writeJson(path.join(publicRoot, "candidate-props.json"), candidateProps);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  targetBeatIds,
  sourcePropsSha256,
  candidatePropsSha256,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
if (report.status !== "REVIEW_CANDIDATE_READY") process.exitCode = 2;
