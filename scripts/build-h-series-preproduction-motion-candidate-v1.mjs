#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-preproduction-motion-candidate-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const sourcePropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const materialManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesMaterialManifest.json");
const continuityManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesContinuityManifest.json");
const preproductionReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/report.json");
const preproductionPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/director-plan.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const candidatePropsPath = path.join(artifactRoot, "candidate-props.json");
const publicCandidatePropsPath = path.join(publicRoot, "candidate-props.json");
const visualMasterId = "july1-retro-print-archive-wireframe-v1";
const reviewBeatIds = [
  // Six adjacent pairs make the moving proof test continuity and every
  // renderer-facing transition family, not only isolated hero frames. The
  // remaining 35 shots stay in the all-hold-frame review.
  "H01-B01", "H01-B02", // opening-establish + carry-forward
  "H02-B01", "H02-B02", // paper-turn + carry-forward
  "H03-B02", "H03-B03", // generated artwork handoff
  "H04-B01", "H04-B02", // evidence-cut + evidence roster carry
  "H06-B01", "H06-B02", // selection-return + process carry
  "H10-B04", "H10-B05", // generated artwork + paper continuity
];

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Json = (value) => crypto.createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
const localAsset = (asset) => {
  if (!asset) return null;
  const normalized = asset.replace(/^remotion-renderer\/public\//u, "").replace(/^public\//u, "");
  return fs.existsSync(path.join(root, "remotion-renderer/public", normalized)) ? normalized : null;
};

for (const file of [sourcePropsPath, materialManifestPath, continuityManifestPath, preproductionReportPath, preproductionPlanPath]) {
  if (!fs.existsSync(file)) throw new Error(`required-file-missing:${file}`);
}
if (!fs.existsSync(currentPhasePath)) throw new Error(`required-file-missing:${currentPhasePath}`);

const sourceProps = readJson(sourcePropsPath);
const materialManifest = readJson(materialManifestPath);
const continuityManifest = readJson(continuityManifestPath);
const preproductionReport = readJson(preproductionReportPath);
const preproductionPlan = readJson(preproductionPlanPath);
const sourceScenes = Array.isArray(sourceProps.scenes) ? sourceProps.scenes : [];
const directedScenes = Array.isArray(preproductionPlan.scenes) ? preproductionPlan.scenes : [];
const sourceByBeatId = new Map(sourceScenes.map((scene) => [scene.beatId, scene]));
const directionByBeatId = new Map(directedScenes.map((scene) => [scene.beatId, scene]));
const materialByBeatId = new Map((materialManifest.items || []).map((item) => [item.beatId, item]));
const continuityByBeatId = new Map((continuityManifest.items || []).map((item) => [item.beatId, item]));

const backgroundModeFor = (mode) => {
  const value = String(mode || "").toLowerCase();
  if (/(?:blueprint|procedure|method|probability|branch|candidate|request|writeback|relay|direction|path|funnel|controlled|insertion|process|workflow)/u.test(value)) return "blueprint-process";
  if (/(?:archive|preference|version|folder|memory|orchestration|separated|revision|current)/u.test(value)) return "archive-desk";
  if (/(?:residue|hollow|tangled|friction|crushed|tension)/u.test(value)) return "ink-reversal";
  if (/(?:human|hard-check|boundary)/u.test(value)) return "manuscript-grid";
  if (/(?:knot)/u.test(value)) return "xerox-poster";
  if (/(?:evidence|roster|comparison)/u.test(value)) return "archive-desk";
  if (/(?:selection|manuscript|proofreading|reading|context|sentence|question|open|gap|document|inspection)/u.test(value)) return "manuscript-grid";
  return "open-paper";
};

const compositionModeFor = (mode) => {
  const value = String(mode || "").toLowerCase();
  if (/(?:artwork|tension)/u.test(value)) return "artwork";
  if (/(?:closing|quiet)/u.test(value)) return "closing";
  if (/(?:evidence|source|roster)/u.test(value)) return "evidence";
  if (/(?:question|negative-space)/u.test(value)) return "question";
  if (/(?:control|reading-output|type-scale)/u.test(value)) return "controls";
  if (/(?:inspection|check|hard|document-verdict)/u.test(value)) return "inspection";
  if (/(?:gap|insertion|request|paragraph)/u.test(value)) return "gap";
  if (/(?:process|sequence|workflow|relay|hierarchy|path)/u.test(value)) return "process";
  if (/(?:comparison|contrast|before-after)/u.test(value)) return "comparison";
  if (/(?:convergence|many-to-one|empty-roster)/u.test(value)) return "convergence";
  if (/(?:sort|archive-sort)/u.test(value)) return "sort";
  if (/(?:verdict|machine-vs-human|split-verdict)/u.test(value)) return "verdict";
  if (/(?:selection|action|persistent)/u.test(value)) return "selection";
  if (/(?:archive|version|revision|stack)/u.test(value)) return "archive";
  return "manifesto";
};

const stableVariant = (beatId, mode) => {
  if (mode === "closing") return 0;
  if (mode === "evidence") return beatId.endsWith("B02") ? 1 : 0;
  if (mode === "artwork") return beatId.endsWith("B03") ? 1 : 0;
  return Number.parseInt(crypto.createHash("sha1").update(beatId).digest("hex").slice(0, 2), 16) % 3;
};

const officialHostFor = (name) => {
  const value = String(name).toLowerCase();
  if (value.includes("claude")) return "www.anthropic.com";
  if (value.includes("deepseek")) return "www.deepseek.com";
  if (value.includes("kimi")) return "moonshotai.github.io";
  return "openai.com";
};
const sourceUrlFor = (host) => host === "openai.com" ? "https://openai.com/" : `https://${host}/`;

const sourceAssetFor = (item) => localAsset(item?.asset || item?.path);
const sourceHashFor = (item) => item?.assetSha256 || item?.sha256 || null;

const statusFor = (material, {selectedAsset, evidenceSource}) => {
  if (material.status === "approved-current") return "approved-current";
  const materialRequired = material.route === "real-evidence" || material.route === "editorial-artwork";
  if (!materialRequired) return "not-required";
  const hasBoundMaterial = Boolean(selectedAsset) || evidenceSource.some((item) => sourceAssetFor(item) && sourceHashFor(item));
  if (hasBoundMaterial) return "bound";
  return "missing-source";
};

// The static director plan's semanticJob is an instruction for the director,
// not copy that should appear inside the film. Keep the instruction in the
// audit/rationale fields and derive a short, source-bound display label for
// the editable visual element. This prevents the renderer from turning
// phrases such as “保留前文语义” into generic AI-looking helper cards.
const displayLabelByKind = {
  manuscript: "稿件", selection: "选区", rewrite: "改写结果", sentence: "句子", "preference-mark": "偏好判断", archive: "风格档案",
  paragraph: "上下文", "selected-sentence": "选中句", document: "全文稿", verdict: "判断", "proof-mark": "红笔标记", "proof-marks": "红笔标记", "margin-note": "页边批注",
  "reading-copy": "阅读文本", "type-scale": "字号", "pace-mark": "阅读节拍", "pace-cadence": "阅读节拍", question: "核心问题", "outlined-phrase": "质疑对象",
  "editorial-artwork": "概念图", "surface-copy": "表面通顺", knot: "语言打结", "surface-change": "表面变化", "completion-mark": "完成度", "red-pencil-verdict": "内容判断",
  "trial-note": "试验记录", "language-sample": "中文变化", "relative-shift": "相对改善", residue: "共同残余", "faded-roster": "试验名册", "problem-core": "未解核心",
  "phrase-paths": "可能表达", "selection-pressure": "收敛压力", "common-phrase": "默认句式", "missing-slot": "偏好空位", "human-mark": "人工判断",
  branch: "分叉路径", repetition: "内部循环", "source-pile": "材料", "angle-choice": "角度", draft: "动笔", "three-step-sequence": "三步顺序", "repeat-frame": "重复执行", "system-state": "稳定流程",
  "source-notes": "材料标记", outline: "主线", "hold-state": "暂不交稿", brief: "材料包", "api-call": "调用交接", "writer-slot": "写作入口", "full-draft": "全文",
  title: "标题", body: "正文", margin: "留白", "active-draft": "当前稿", "previous-version": "旧版", "resume-mark": "继续位置", "article-archive": "文章档案", "active-tab": "当前文章",
  "version-1": "V1", "version-deltas": "修改差异", "current-version": "当前版本", "context-line": "上下文", "selection-fill": "选区", "red-pencil-note": "红笔批注",
  "original-sentence": "原句", "rewrite-candidate": "改写候选", "human-choice": "人的选择", "upper-paragraph": "前文", "content-gap": "内容缺口", "lower-paragraph": "后文",
  "article-body": "文章正文", "cursor-mark": "光标位置", "paragraph-context": "前后文", "request-note": "补充要求", "gap-boundary": "缺口边界", "article-context": "文章上下文",
  "candidate-paragraph": "候选补段", "fit-mark": "衔接判断", "change-mark": "修改位置", "accepted-candidate": "已选候选", "updated-article": "写回正文",
  "writing-friction": "写作摩擦", "paper-workbench": "稿纸", "fixed-action": "固定动作", "source-friction": "材料摩擦", "decision-friction": "判断摩擦", "rewrite-friction": "改写摩擦",
  source: "材料", writeback: "写回", "machine-draft": "机器初稿", "red-pencil": "红笔", "human-rewrite": "人工改写", "revision-loop": "反复往返", "recorded-choice": "已记录选择",
  "previous-draft": "旧稿", "revision-mark": "改动痕迹", "current-draft": "当前稿", "author-mark": "作者判断", "open-space": "开放空间",
};

const displayLabelFor = ({kind, semanticJob, index, direction, scene, material, evidenceSource}) => {
  const value = String(kind || "").toLowerCase();
  const job = String(semanticJob || "");
  const headline = direction.source.lockedHeadlineLines.join(" ");
  const emphasis = direction.typography.emphasis || headline;
  const support = direction.source.support || scene.presentation?.secondary || "";
  const evidenceNames = (evidenceSource || material.officialEvidence || []).map((item) => item.name).filter(Boolean);
  const tokens = Array.isArray(scene.supportTokens) ? scene.supportTokens.filter(Boolean) : [];
  if (/(?:official-mark|actor-name|brand|entity)/u.test(value)) return evidenceNames[index] || tokens[index] || "来源";
  if (value === "paragraph-a" || value === "upper-paragraph") return "前文";
  if (value === "paragraph-b" || value === "lower-paragraph") return "后文";
  if (value === "candidate-a" || value === "candidate-b" || value === "candidate-c") return `候选 ${value.slice(-1).toUpperCase()}`;
  if (value === "article-archive") return /第一篇|第一份|第一/u.test(job) ? "文章 01" : /第二篇|第二份|第二/u.test(job) ? "文章 02" : `文章 ${String(index + 1).padStart(2, "0")}`;
  if (value === "red-pencil-note") return /太空/u.test(job) ? "太空" : /动作|节奏/u.test(job) ? "没动作·太枯燥" : `批注 ${index + 1}`;
  if (value === "paragraph") return index === 0 ? "前文" : "后文";
  if (displayLabelByKind[value]) return displayLabelByKind[value];
  if (/(?:manuscript|document|article-body|context-line|surface-copy|reading-copy|original-sentence|article-context|paper-workbench)/u.test(value)) return "文章上下文";
  if (/(?:selection|selected-sentence|selection-fill|cursor-mark|active-draft|line-select)/u.test(value)) return emphasis;
  if (/(?:rewrite|candidate|accepted-candidate|human-rewrite|writeback|draft|result|fixed-action)/u.test(value)) return support ? `改写：${support}` : `改写：${emphasis}`;
  if (/(?:proof|red-pencil|margin|annotation|problem-core|residue|human-mark|author-mark|fit-mark|change-mark|friction)/u.test(value)) return `批注：${emphasis}`;
  if (/(?:preference|verdict|completion-mark|hold-state|trial-note)/u.test(value)) return index === 0 ? "保留" : "不保留";
  if (/(?:archive|version|current-version|previous-version|revision|stack|folder|resume|recorded-choice|active-tab)/u.test(value)) return index === 0 ? "当前稿" : `V${index + 1}`;
  if (/(?:path|branch|direction|angle|process|sequence|source-pile|three-step|relay|api-call|gap|missing-slot|content-gap|semantic-gap|request-note|selection-pressure)/u.test(value)) return index === 0 ? "默认路径" : index === 1 ? emphasis : "人的方向";
  if (/(?:type-scale|pace-mark|pace-cadence)/u.test(value)) return index === 0 ? headline : "阅读节拍";
  if (value === "knot" || value === "surface-change" || value === "open-space") return emphasis;
  return support || emphasis || headline;
};

const candidateProps = JSON.parse(JSON.stringify(sourceProps));
const parity = [];
for (const scene of candidateProps.scenes || []) {
  const direction = directionByBeatId.get(scene.beatId);
  if (!direction) continue;
  const compositionMode = compositionModeFor(direction.composition.mode);
  const backgroundMode = backgroundModeFor(direction.background.mode);
  const variant = stableVariant(scene.beatId, compositionMode);
  const material = direction.material;
  const materialManifestItem = materialByBeatId.get(scene.beatId);
  const continuity = continuityByBeatId.get(scene.beatId);
  const inheritedSources = materialManifestItem?.sources || [];
  // `reuse-source-evidence` means the static director intentionally carries
  // forward already-verified marks. The material manifest is the renderer
  // authority for that carry-forward, so it wins over stale plan fallbacks
  // (notably the old OpenAI mark on H07-B01, which is now Codex-specific).
  const reuseManifestSources = material.status === "reuse-source-evidence" && inheritedSources.length > 0;
  const evidenceSource = reuseManifestSources
    ? inheritedSources
    : (material.officialEvidence || []).length
      ? material.officialEvidence
      : material.route === "real-evidence" ? inheritedSources : [];
  const manifestRendererAsset = reuseManifestSources
    ? localAsset(materialManifestItem?.rendererBinding?.assetPath || inheritedSources[0]?.asset || inheritedSources[0]?.path)
    : null;
  const selectedAsset = manifestRendererAsset || localAsset(material.selectedAsset);
  const assetStatus = statusFor(material, {selectedAsset, evidenceSource});
  const entityEvidence = evidenceSource.map((item) => ({
    id: `${scene.beatId}-${item.name}`,
    name: item.name,
    sourceUrl: item.sourceUrl || sourceUrlFor(item.officialHost),
    officialHost: item.officialHost || (item.sourceUrl ? new URL(item.sourceUrl).host : "unknown-source"),
    asset: localAsset(item.asset || item.path),
    assetSha256: item.assetSha256 || item.sha256 || null,
    reviewOnly: true,
  }));
  const foreground = scene.layers?.find((layer) => layer.kind === "foreground-subject");
  if (selectedAsset && foreground) {
    foreground.asset = selectedAsset;
    foreground.assetSha256 = sha256File(path.join(root, "remotion-renderer/public", selectedAsset));
  }
  const shotDirector = {
    contract: "A1HSeriesShotDirectorPlan/v1",
    beatId: scene.beatId,
    status: "REVIEW_CANDIDATE",
    narrativeRole: direction.semantic.visualJob,
    text: {
      headlineLines: [...direction.source.lockedHeadlineLines],
      supportLine: direction.source.support || null,
      emphasis: direction.typography.emphasis,
      editable: true,
      lineBreakLocked: true,
    },
    typography: {
      family: direction.typography.family,
      layout: direction.typography.layout,
      emphasisStyle: direction.typography.emphasisStyle,
      lineScale: [...direction.typography.lineScale],
      lineIndent: [...direction.typography.lineIndent],
      supportStyle: direction.typography.supportStyle,
      motion: direction.typography.motion,
    },
    // Keep the original per-shot background decision alongside the renderer
    // family. The six stable families are implementation primitives; this
    // variant is the semantic source that prevents 47 authored backgrounds
    // from collapsing into one generic card treatment.
    background: {mode: backgroundMode, variant: direction.background.mode, material: "retro-print-paper-ink-cobalt", rationale: direction.background.rationale},
    composition: {mode: compositionMode, variant, focalPoint: direction.typography.emphasis, rationale: direction.composition.rationale},
    elements: direction.elements.map((element, index) => ({kind: element.kind, label: displayLabelFor({kind: element.kind, semanticJob: element.semanticJob, index, direction, scene, material, evidenceSource}), role: element.kind, highlighted: index === 0 || element.semanticJob.includes(direction.typography.emphasis)})),
    asset: {route: material.route, status: assetStatus, rationale: material.rationale, fakeEvidenceAllowed: false},
    // Transition fields are renderer-facing enums. Keep the human-readable
    // semantic handoff in `continuity`; do not put prose into the enum slot or
    // the renderer will silently fall back to an invisible transition.
    motion: {primary: direction.typography.motion, transitionIn: continuity?.transitionIn || "carry-forward", transitionOut: continuity?.transitionOut || "paper-match"},
    continuity: {carryIn: direction.continuity.carryIn, carryOut: direction.continuity.carryOut, transitionLogic: direction.continuity.reason},
    acceptance: [
      `标题必须完整显示：${direction.source.lockedHeadlineLines.join(" / ")}`,
      `背景必须服务于：${direction.background.rationale}`,
      `元素必须完成：${direction.semantic.visualJob}`,
      `素材路线保持：${material.route}，不得制造假证据。`,
    ],
  };
  const priorStoryboard = scene.storyboard || {};
  scene.titleLines = [...direction.source.lockedHeadlineLines];
  // Keep the legacy layout envelope in lockstep with the stage-3 shot director.
  // The renderer's semantic stage owns the visible headline, but downstream
  // layout, carryover and audit consumers still read layout.typography.lines.
  // Leaving the old scaffold copy here creates two text authorities in one
  // candidate and makes a later renderer fallback silently show stale copy.
  const syncedTitleLines = [...direction.source.lockedHeadlineLines];
  scene.layout.titleBox.maxLines = syncedTitleLines.length;
  scene.layout.typography.lines = syncedTitleLines;
  scene.layout.typography.lineWidths = syncedTitleLines.map((line) => Math.max(1, Array.from(line).length * scene.layout.typography.fontSize * 0.9));
  scene.layout.typography.blockWidth = Math.max(...scene.layout.typography.lineWidths);
  scene.layout.typography.blockHeight = syncedTitleLines.length * scene.layout.typography.fontSize * scene.layout.typography.lineHeight;
  scene.layout.typography.audit = {...scene.layout.typography.audit, semanticLines: true, blockers: []};
  scene.presentation = {...scene.presentation, primary: direction.source.lockedHeadlineLines.join(""), secondary: direction.source.support || "", semanticDelta: `preproduction-motion-candidate:${direction.composition.mode}:${direction.typography.emphasis}`};
  scene.entityEvidence = entityEvidence;
  scene.backgroundState = backgroundMode === "ink-reversal" ? "ink-conflict" : backgroundMode === "archive-desk" ? "archive-density" : backgroundMode === "manuscript-grid" ? "paper-field" : "wireframe-space";
  scene.compositionVariant = variant;
  scene.route = material.route;
  scene.storyboard = {
    ...priorStoryboard,
    stage2SemanticPriority: false,
    stage3DirectorPriority: true,
    visualFocusText: direction.typography.emphasis,
    shotDirector,
    semanticFill: {
      ...(priorStoryboard.semanticFill || {}),
      visibleText: direction.source.lockedHeadlineLines.join(" / "),
      intent: direction.semantic.visualJob,
      fillWhat: direction.composition.rationale,
      fillHow: `${direction.background.rationale}; ${material.rationale}`,
      assetRoute: material.route,
      motionJob: direction.typography.motion,
      layoutJob: `${compositionMode}:variant-${variant}`,
      status: "h-series-preproduction-motion-candidate",
      rendererAdoptionAllowed: false,
    },
  };
  delete scene.semanticVisual;
  parity.push({beatId: scene.beatId, staticHeadlineLines: direction.source.lockedHeadlineLines, candidateHeadlineLines: scene.titleLines, layoutHeadlineLines: scene.layout.typography.lines, staticBackground: direction.background.mode, candidateBackground: backgroundMode, staticComposition: direction.composition.mode, candidateComposition: compositionMode, staticRoute: material.route, candidateRoute: scene.route, status: "bound"});
}

candidateProps.reviewBeatIds = reviewBeatIds;
candidateProps.contentHash = sha256Json(candidateProps.scenes);
const missing = sourceScenes.map((scene) => scene.beatId).filter((beatId) => !directionByBeatId.has(beatId));
const stale = directedScenes.map((scene) => scene.beatId).filter((beatId) => !sourceByBeatId.has(beatId));
const blockers = [];
if (sourceScenes.length !== 47) blockers.push({id: "source-scene-count", expected: 47, observed: sourceScenes.length});
if (directedScenes.length !== 47) blockers.push({id: "static-director-count", expected: 47, observed: directedScenes.length});
if (missing.length) blockers.push({id: "missing-static-director-beats", beatIds: missing});
if (stale.length) blockers.push({id: "stale-static-director-beats", beatIds: stale});
if (preproductionReport.summary?.materialGapCount !== 0) blockers.push({id: "material-gaps", observed: preproductionReport.summary?.materialGapCount});
if (candidateProps.scenes.filter((scene) => scene.storyboard?.stage3DirectorPriority === true).length !== 47) blockers.push({id: "candidate-not-fully-bound"});
if (!candidateProps.scenes.every((scene) => scene.titleLines.join("|") === directionByBeatId.get(scene.beatId)?.source.lockedHeadlineLines.join("|"))) blockers.push({id: "headline-parity-failed"});
if (!candidateProps.scenes.every((scene) => {
  const directorLines = scene.storyboard?.shotDirector?.text?.headlineLines || [];
  const layoutLines = scene.layout?.typography?.lines || [];
  return scene.titleLines.join("|") === directorLines.join("|") && scene.titleLines.join("|") === layoutLines.join("|");
})) blockers.push({id: "headline-layout-authority-parity-failed"});
if (!candidateProps.scenes.every((scene) => {
  const expected = continuityByBeatId.get(scene.beatId);
  const motion = scene.storyboard?.shotDirector?.motion;
  return expected && motion?.transitionIn === expected.transitionIn && motion?.transitionOut === expected.transitionOut;
})) blockers.push({id: "continuity-transition-enum-parity-failed"});
const unboundRealEvidence = candidateProps.scenes.filter((scene) => scene.route === "real-evidence" && !(scene.entityEvidence || []).some((item) => item.asset && item.assetSha256)).map((scene) => scene.beatId);
if (unboundRealEvidence.length) blockers.push({id: "real-evidence-not-renderer-bound", beatIds: unboundRealEvidence});
const missingSourceScenes = candidateProps.scenes.filter((scene) => scene.storyboard?.shotDirector?.asset?.status === "missing-source").map((scene) => scene.beatId);
if (missingSourceScenes.length) blockers.push({id: "candidate-material-status-missing-source", beatIds: missingSourceScenes});

const report = {
  contract: "A1HSeriesPreproductionMotionCandidate/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  status: blockers.length ? "BLOCKED" : "READY_FOR_MOTION_REVIEW",
  reviewOnly: true,
  proofOnly: true,
  currentAuthorityMutated: false,
  rendererAdoptionAllowed: false,
  applyAllowedBeforeExplicitApproval: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  userApprovalStatus: "not-approved",
  visualMasterId,
  sourceBinding: {
    sourcePropsPath: path.relative(root, sourcePropsPath),
    sourcePropsSha256: sha256File(sourcePropsPath),
    preproductionReportPath: path.relative(root, preproductionReportPath),
    preproductionReportSha256: sha256File(preproductionReportPath),
    preproductionPlanPath: path.relative(root, preproductionPlanPath),
    preproductionPlanSha256: sha256File(preproductionPlanPath),
    materialManifestPath: path.relative(root, materialManifestPath),
    materialManifestSha256: sha256File(materialManifestPath),
  },
  candidate: {
    propsPath: path.relative(root, candidatePropsPath),
    publicPropsPath: path.relative(root, publicCandidatePropsPath),
    propsSha256: sha256Json(candidateProps),
    sceneCount: candidateProps.scenes.length,
    reviewBeatIds,
    changedSceneCount: parity.length,
    currentPropsUnchanged: true,
  },
  summary: {
    staticSceneCount: directedScenes.length,
    candidateSceneCount: candidateProps.scenes.length,
    parityCount: parity.length,
    motionPreviewSceneCount: reviewBeatIds.length,
    compositionModeCount: new Set(parity.map((item) => item.candidateComposition)).size,
    backgroundModeCount: new Set(parity.map((item) => item.candidateBackground)).size,
    backgroundVariantCount: new Set(candidateProps.scenes.map((scene) => scene.storyboard?.shotDirector?.background?.variant).filter(Boolean)).size,
    routeCounts: Object.fromEntries(parity.reduce((map, item) => map.set(item.candidateRoute, (map.get(item.candidateRoute) || 0) + 1), new Map())),
    headlineLayoutParityCount: parity.filter((item) => item.candidateHeadlineLines.join("|") === item.layoutHeadlineLines.join("|")).length,
    transitionInCounts: Object.fromEntries(candidateProps.scenes.reduce((map, scene) => { const mode = scene.storyboard?.shotDirector?.motion?.transitionIn || "missing"; map.set(mode, (map.get(mode) || 0) + 1); return map; }, new Map())),
    transitionOutCounts: Object.fromEntries(candidateProps.scenes.reduce((map, scene) => { const mode = scene.storyboard?.shotDirector?.motion?.transitionOut || "missing"; map.set(mode, (map.get(mode) || 0) + 1); return map; }, new Map())),
    materialGapCount: preproductionReport.summary?.materialGapCount ?? null,
    unboundRealEvidenceCount: unboundRealEvidence.length,
    missingSourceCount: missingSourceScenes.length,
  },
  parity,
  blockers,
  nextAction: blockers.length ? "repair-preproduction-motion-binding" : "render-47-motion-hold-frames-and-12-shot-moving-preview",
};

writeJson(candidatePropsPath, candidateProps);
writeJson(publicCandidatePropsPath, candidateProps);
writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
const currentPhase = readJson(currentPhasePath);
if (currentPhase.contract !== "A1SystemLineCurrentPhase/v1" || currentPhase.phaseId !== "h-series-semantic-directed-v1") {
  throw new Error(`unexpected-current-phase:${currentPhase.contract || "missing"}:${currentPhase.phaseId || "missing"}`);
}
currentPhase.generatedAt = new Date().toISOString();
currentPhase.preproductionMotionCandidate = {
  phaseId,
  status: report.status,
  reportPath: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
  reportSha256: sha256File(path.join(publicRoot, "report.json")),
  candidatePropsPath: path.relative(root, candidatePropsPath),
  candidatePropsSha256: report.candidate.propsSha256,
  sceneCount: report.summary.candidateSceneCount,
  selectedSceneCount: report.summary.motionPreviewSceneCount,
  reviewOnly: true,
  userApprovalStatus: "not-approved",
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
};
currentPhase.next = {
  recommended: {
    id: "review-static-boards-and-motion-candidate-before-source-adoption",
    reason: "Review all 47 static boards together with the 12-shot moving proof before any source adoption or full-film render is allowed.",
    requiresExplicitApproval: false,
    riskTags: ["preproduction-only", "47-shot-current-intersection", "all-47-static-shots", "candidate-version-bound", "no-full-mp4", "stale-50-shot-plan-excluded"],
  },
};
writeJson(currentPhasePath, currentPhase);
console.log(JSON.stringify({status: report.status, summary: report.summary, candidatePropsSha256: report.candidate.propsSha256, nextAction: report.nextAction}, null, 2));
if (report.status !== "READY_FOR_MOTION_REVIEW") process.exitCode = 2;
