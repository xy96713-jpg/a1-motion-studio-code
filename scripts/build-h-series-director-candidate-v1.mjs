#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createStoryboardDirectorPlan} from "../lib/storyboard-director.js";
import {toStoryboardRenderProps, validateStoryboardRenderProps} from "../lib/storyboard-render-props.js";

const root = process.cwd();
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-director-candidate-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/h-series-director-candidate-v1");
const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const writeJson = (dir, name, value) => fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
const articlePath = path.resolve(root, arg("--article", "article.txt"));
const compact = (value = "") => String(value || "").replace(/\s+/gu, "").toLowerCase();
const hasDataClaim = (value = "") => /(?:\d|百分比|比例|数据|指标|增长|下降|趋势|chart|data|metric)/iu.test(String(value || ""));
const hasOperationalClaim = (value = "") => /(?:划选|点击|输入|保存|双击|调字号|调速度|历史|收稿|喜欢库|讨厌库|工作台|前端|演示模式|ctrl\+s)/iu.test(String(value || ""));
const namedTool = (value = "") => /(?:Codex|DeepSeek|Kimi|OpenAI|ChatGPT|Claude)/iu.test(String(value || ""));
const protectedMixedPhrases = ["vibe coding", "智能写作工作台", "AI 味", "DeepSeek", "Codex"];
const operationActorsFor = (value = "") => {
  const text = String(value || "");
  if (/(划选|喜欢库|讨厌库)/u.test(text)) return ["原句", "选择/标记", "风格库"];
  if (/(点击|双击|输入|补段|候选段落)/u.test(text)) return ["空白段落", "需求输入", "候选补写"];
  if (/(保存|历史|版本)/u.test(text)) return ["当前稿", "保存动作", "版本记录"];
  if (/(收稿|病句|检查|拦下)/u.test(text)) return ["待收稿", "检查规则", "修改提示"];
  if (/(演示模式|口播|字号|速度)/u.test(text)) return ["正文", "演示控制", "口播节奏"];
  if (/(工作台|前端|文档)/u.test(text)) return ["内容", "编辑动作", "可控工作流"];
  return [];
};

if (!fs.existsSync(articlePath)) throw new Error(`article-not-found:${articlePath}`);
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const sourceText = fs.readFileSync(articlePath, "utf8").trim();
const title = String(sourceText.split(/\n+/u).find(Boolean) || "未命名文章").trim();
// H-series is a source-bound review candidate. Preserve sentence-scale coverage
// instead of using the short-form director default (5-8 macro cards).
const director = createStoryboardDirectorPlan({title, sourceText, pace: "standard", desiredCount: 36});
const renderProps = toStoryboardRenderProps({
  title,
  sourceText,
  rawSourceText: sourceText,
  scenes: director.scenes,
});
const validation = validateStoryboardRenderProps(renderProps);

const ledger = (renderProps.scenes || []).map((scene, index) => {
  const visualTreatment = scene.visualTreatment || {};
  const assetNeed = visualTreatment.assetNeed || {};
  const assetRequired = assetNeed.role && assetNeed.role !== "none";
  const assignedAssets = Array.isArray(scene.assets) ? scene.assets.filter((asset) => asset?.sourceUrl || asset?.url || asset?.localPath) : [];
  const sourceReady = !assetRequired || assignedAssets.some((asset) => asset.verifiedForRender === true || asset.renderAllowed === true);
  const replacement = scene.styleframeReplacementTask || scene.styleframeReplacementPlan || null;
  const sourceStatus = !assetRequired
    ? "not-required"
    : sourceReady
      ? "verified-and-bound"
      : replacement
        ? "planned-not-backfilled"
        : "missing-plan";
  const visualMedium = visualTreatment.primaryVisualForm || "unresolved";
  const requiresGeneratedArtwork = visualMedium === "editorial-image";
  const sourceClaim = [scene.director?.coverageText, scene.body, scene.headline, scene.article?.claim]
    .filter(Boolean)
    .join(" ");
  const screenText = scene.article?.screenText || scene.titleLines?.join(" ") || "";
  const titleLines = scene.titleLines || [];
  const operationActors = operationActorsFor(`${sourceClaim} ${screenText}`);
  const diagnostics = [];
  if (visualMedium === "data-visual" && !hasDataClaim(`${sourceClaim} ${screenText}`)) {
    diagnostics.push({severity: "blocker", id: "data-visual-without-data-claim", detail: "Data visual requires a sourced or derived data claim."});
  }
  if (hasOperationalClaim(`${sourceClaim} ${screenText}`) && (visualTreatment.recordingReplaceable !== true || operationActors.length < 3)) {
    diagnostics.push({severity: "blocker", id: "operational-scene-without-replaceable-actor-plan", detail: "Operational content needs a recording-replaceable plan with concrete visual actors, not a generic title card."});
  }
  if (namedTool(`${sourceClaim} ${screenText}`) && sourceStatus === "not-required" && visualTreatment.brandRepresentation !== "text-only-attribution-no-logo") {
    diagnostics.push({severity: "blocker", id: "named-tool-without-official-asset-plan", detail: "Named tool/product content needs an official asset plan or an explicit text-only justification."});
  }
  if (screenText && !compact(sourceText).includes(compact(screenText)) && !compact(sourceClaim).includes(compact(screenText))) {
    diagnostics.push({severity: "review-risk", id: "screen-text-not-source-anchored", detail: "Screen text is a paraphrase and needs a preserved semantic-source rationale."});
  }
  const compactLines = titleLines.map(compact);
  const joinedLines = compactLines.join("");
  for (const phrase of protectedMixedPhrases) {
    const phraseCompact = compact(phrase);
    if (joinedLines.includes(phraseCompact) && !compactLines.some((line) => line.includes(phraseCompact))) {
      diagnostics.push({severity: "blocker", id: "protected-phrase-split", detail: `Protected phrase split across title lines: ${phrase}`});
    }
  }
  if (assetRequired === false && !["kinetic-typography", "typographic-resolution", "vector-diagram"].includes(visualMedium)) {
    diagnostics.push({severity: "blocker", id: "non-text-medium-without-material-plan", detail: "A non-text visual medium must carry a source, derived-data, or editorial-artwork material plan."});
  }
  return {
    id: scene.id || `candidate-${index + 1}`,
    order: index + 1,
    source: {
      sectionId: scene.article?.sectionId || null,
      claim: sourceClaim || null,
      screenText: scene.article?.screenText || scene.titleLines?.join(" ") || null,
    },
    judgement: {
      storyRole: scene.narrative?.storyRole || null,
      purpose: scene.beat?.purpose || null,
      transitionReason: scene.narrative?.transitionReason || null,
      connectsFrom: scene.contentGraphNode?.edgeFrom || null,
      connectsTo: scene.contentGraphNode?.edgeTo || null,
    },
    visual: {
      medium: visualMedium,
      rendererRoute: visualTreatment.rendererRoute || null,
      rationale: visualTreatment.visualRoutingDecision?.reason || null,
      templateId: scene.templateId || null,
      templateReason: scene.templateQualityGate?.rationale || null,
    },
    material: {
      requiredRole: assetNeed.role || "none",
      sourcePolicy: visualTreatment.evidencePolicy || null,
      preferredSurface: assetNeed.preferredSurface || null,
      sourceStatus,
      assignedAssets: assignedAssets.map((asset) => ({
        id: asset.id || null,
        sourceUrl: asset.sourceUrl || asset.url || null,
        localPath: asset.localPath || null,
        verifiedForRender: asset.verifiedForRender === true,
      })),
      generatedArtworkAllowed: requiresGeneratedArtwork,
      generatedArtworkStatus: requiresGeneratedArtwork ? (replacement ? "planned-review-only" : "needs-styleframe-plan") : "not-applicable",
    },
    writeback: {
      requiredBeforeRender: sourceStatus === "verified-and-bound" || sourceStatus === "not-required" ? [] : ["bind-verified-asset-or-review-approved-editorial-artwork"],
      replacementTaskPresent: Boolean(replacement),
    },
    layout: {
      primitive: scene.layoutPrimitive?.id || null,
      slots: (scene.layoutPrimitive?.slots || []).length ? scene.layoutPrimitive.slots : operationActors.map((label, actorIndex) => ({id: `operation-${actorIndex + 1}`, label})),
      titleLines,
      actorCount: Math.max(Array.isArray(scene.beat?.actorPlan) ? scene.beat.actorPlan.length : 0, operationActors.length),
      operationActors,
    },
    diagnostics,
  };
});

const unresolvedMaterial = ledger.filter((entry) => !["not-required", "verified-and-bound"].includes(entry.material.sourceStatus));
const missingJudgement = ledger.filter((entry) => !entry.judgement.storyRole || !entry.judgement.purpose || !entry.judgement.transitionReason);
const missingLayout = ledger.filter((entry) => !entry.layout.primitive || !entry.layout.actorCount);
const blockers = ledger.flatMap((entry) => entry.diagnostics.filter((item) => item.severity === "blocker").map((item) => ({sceneId: entry.id, ...item})));
const reviewRisks = ledger.flatMap((entry) => entry.diagnostics.filter((item) => item.severity === "review-risk").map((item) => ({sceneId: entry.id, ...item})));
const report = {
  contract: "A1HSeriesDirectorCandidate/v1",
  status: validation.ok && !missingJudgement.length && !missingLayout.length && !blockers.length ? "READY_FOR_SOURCE_REVIEW" : "BLOCKED",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  input: {
    articlePath: path.relative(root, articlePath),
    articleSha256: sha256(sourceText),
    title,
  },
  contracts: {
    director: director.contract || null,
    renderProps: renderProps.contract || null,
    articleVisualDirector: renderProps.articleVisualDirector?.contract || null,
    motionDirector: renderProps.motionDirectorV2?.contract || null,
  },
  summary: {
    sceneCount: ledger.length,
    unresolvedMaterialCount: unresolvedMaterial.length,
    missingJudgementCount: missingJudgement.length,
    missingLayoutCount: missingLayout.length,
    blockerCount: blockers.length,
    reviewRiskCount: reviewRisks.length,
    validationFailureCount: validation.failures?.length || 0,
  },
  validation,
  blockers,
  reviewRisks,
  nextAction: validation.ok && !blockers.length
    ? "review-director-ledger-then-execute-source-and-artwork-backfill"
    : "repair-semantic-decision-source-writeback-and-layout-blockers",
};

for (const dir of [artifactRoot, publicRoot]) {
  writeJson(dir, "candidate-render-props.json", renderProps);
  writeJson(dir, "decision-ledger.json", ledger);
  writeJson(dir, "report.json", report);
}

console.log(JSON.stringify({
  status: report.status,
  reportPath: path.relative(root, path.join(artifactRoot, "report.json")),
  publicReportPath: path.relative(root, path.join(publicRoot, "report.json")),
  summary: report.summary,
  nextAction: report.nextAction,
}, null, 2));

if (!validation.ok || missingJudgement.length || missingLayout.length) process.exitCode = 2;
