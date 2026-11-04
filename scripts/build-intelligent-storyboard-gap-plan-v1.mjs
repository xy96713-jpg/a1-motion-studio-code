#!/usr/bin/env node
/**
 * Current gap plan for turning the storyboard surface into a real intelligent
 * storyboard system instead of a mechanical renderer/router.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "intelligent-storyboard-gap-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const semanticFillPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-semantic-fill-table-v1/report.json");
const semanticRowAuditPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-semantic-fill-row-audit-v1/report.json");
const layoutRiskPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-layout-risk-before-render-v1/report.json");
const artworkPipelinePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-artwork-pipeline-status-v1/report.json");
const staleArtworkReconcilePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stale-artwork-reconcile-v1/report.json");
const rowDecisionPatchPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-row-decision-patch-plan-v1/report.json");
const rowDecisionPatchAppliedPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-row-decision-patches-applied-v1/report.json");
const manualReviewRewriteQueuePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-manual-review-rewrite-queue-v1/report.json");
const stage2SemanticRewriteDraftsPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-semantic-rewrite-drafts-v1/report.json");
const stage2DraftPatchPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-draft-patch-plan-v1/report.json");
const stage2DraftPatchAppliedPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-draft-patches-applied-v1/report.json");
const stage2LlmQueuePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-contract-v1/queue.json");
const stage2LlmProducerPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-judgement-producer-v1/report.json");
const stage2LlmImportPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-judgement-import-v1/report.json");
const storyArcSegmentationPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-story-arc-segmentation-contract-v1/report.json");
const storyArcRegroupPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-story-arc-regroup-plan-v1/report.json");
const storyArcRegroupDryRunPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-story-arc-regroup-dry-run-props-v1/report.json");
const storyArcRegroupDecisionsPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-story-arc-regroup-decisions-v1/report.json");
const motionRepeatWindowPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-motion-repeat-window-plan-v1/report.json");
const motionPatchPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-motion-patch-plan-v1/report.json");
const motionPatchesAppliedPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-motion-patches-applied-v1/report.json");
const productionDashboardPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-production-dashboard-contract-v1/report.json");
const crossProjectFixturesPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-cross-project-srt-fixtures-v1/report.json");
const crossProjectFixtureVisualQualityPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-cross-project-fixture-visual-quality-v1/report.json");
const productionRefreshWorkflowPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-production-refresh-workflow-v1/report.json");
const visualFixPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-visual-error-fix-queue-v1/report.json");
const srtStoryboardGeneratorPath = path.join(root, "scripts/generate-storyboard-from-srt-v1.mjs");
const webgptQueuePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-webgpt-session-queue-v1/queue.json");

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function sha256File(filePath) {
  return fs.existsSync(filePath)
    ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
    : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function fileContains(filePath, pattern) {
  return fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8").includes(pattern);
}

function writeBoth(name, value) {
  for (const base of [artifactRoot, publicRoot]) {
    fs.mkdirSync(base, {recursive: true});
    fs.writeFileSync(path.join(base, name), value, "utf8");
  }
}

const props = readJson(propsPath);
const semanticFill = readJson(semanticFillPath);
const semanticRowAudit = readJson(semanticRowAuditPath);
const layoutRisk = readJson(layoutRiskPath);
const artworkPipeline = readJson(artworkPipelinePath);
const staleArtworkReconcile = readJson(staleArtworkReconcilePath);
const rowDecisionPatchPlan = readJson(rowDecisionPatchPlanPath);
const rowDecisionPatchApplied = readJson(rowDecisionPatchAppliedPath);
const manualReviewRewriteQueue = readJson(manualReviewRewriteQueuePath);
const stage2SemanticRewriteDrafts = readJson(stage2SemanticRewriteDraftsPath);
const stage2DraftPatchPlan = readJson(stage2DraftPatchPlanPath);
const stage2DraftPatchApplied = readJson(stage2DraftPatchAppliedPath);
const stage2LlmQueue = readJson(stage2LlmQueuePath);
const stage2LlmProducer = readJson(stage2LlmProducerPath);
const stage2LlmImport = readJson(stage2LlmImportPath);
const storyArcSegmentation = readJson(storyArcSegmentationPath);
const storyArcRegroupPlan = readJson(storyArcRegroupPlanPath);
const storyArcRegroupDryRun = readJson(storyArcRegroupDryRunPath);
const storyArcRegroupDecisions = readJson(storyArcRegroupDecisionsPath);
const motionRepeatWindow = readJson(motionRepeatWindowPath);
const motionPatchPlan = readJson(motionPatchPlanPath);
const motionPatchesApplied = readJson(motionPatchesAppliedPath);
const productionDashboard = readJson(productionDashboardPath);
const crossProjectFixtures = readJson(crossProjectFixturesPath);
const crossProjectFixtureVisualQuality = readJson(crossProjectFixtureVisualQualityPath);
const productionRefreshWorkflow = readJson(productionRefreshWorkflowPath);
const visualFix = readJson(visualFixPath);
const webgptQueue = readJson(webgptQueuePath);
const scenes = Array.isArray(props?.scenes) ? props.scenes : [];

const currentMetrics = {
  sceneCount: scenes.length,
  semanticFillRows: semanticFill?.summary?.rowCount || 0,
  filledDeterministic: semanticFill?.summary?.byStatus?.["filled-deterministic"] || 0,
  needsSourceOrFallback: semanticFill?.summary?.byStatus?.["needs-source-check-or-text-fallback"] || 0,
  semanticFillOriginalNeedsArtworkGeneration: semanticFill?.summary?.byStatus?.["needs-artwork-generation"] || 0,
  activeGptEditorialArtworkRows: scenes.filter((scene) => scene.storyboard?.semanticFill?.assetRoute === "gpt-editorial-artwork").length,
  semanticRowAuditStatus: semanticRowAudit?.status || "missing",
  semanticRowsPassingAudit: semanticRowAudit?.summary?.passingRows || semanticRowAudit?.summary?.byStatus?.PASS || 0,
  layoutRiskStatus: layoutRisk?.status || "missing",
  layoutRowsPassingAudit: layoutRisk?.summary?.passingRows || layoutRisk?.summary?.byStatus?.PASS || 0,
  artworkPipelineStatus: artworkPipeline?.status || "missing",
  artworkPipelineByStatus: artworkPipeline?.summary?.byStatus || {},
  artworkQueuedForGeneration: artworkPipeline?.summary?.byStatus?.["queued-for-generation"] || 0,
  artworkPendingVisualReview: artworkPipeline?.summary?.byStatus?.["imported-pending-review"] || 0,
  staleArtworkReusedPendingReview: staleArtworkReconcile?.summary?.reusedPendingReviewCount || 0,
  staleArtworkRegenerate: staleArtworkReconcile?.summary?.regenerateCount || 0,
  rowDecisionPatchPlanStatus: rowDecisionPatchPlan?.status || "missing",
  rowDecisionPatchOperationCount: rowDecisionPatchPlan?.summary?.operationCount || 0,
  rowDecisionPatchApplyAllowed: rowDecisionPatchPlan?.applyAllowed === true,
  rowDecisionPatchAppliedStatus: rowDecisionPatchApplied?.status || "missing",
  rowDecisionPatchAppliedCount: rowDecisionPatchApplied?.summary?.appliedOperationCount || 0,
  rowDecisionPatchSkippedManualReviewCount: rowDecisionPatchApplied?.summary?.skippedManualReviewCount || 0,
  manualReviewRewriteQueueStatus: manualReviewRewriteQueue?.status || "missing",
  manualReviewRewriteTaskCount: manualReviewRewriteQueue?.summary?.taskCount || 0,
  stage2SemanticRewriteDraftStatus: stage2SemanticRewriteDrafts?.status || "missing",
  stage2SemanticRewriteDraftCount: stage2SemanticRewriteDrafts?.summary?.draftCount || 0,
  stage2DraftPatchPlanStatus: stage2DraftPatchPlan?.status || "missing",
  stage2DraftPatchCandidateCount: stage2DraftPatchPlan?.summary?.candidateCount || 0,
  stage2DraftPatchAcceptedCount: stage2DraftPatchPlan?.summary?.acceptedCount || 0,
  stage2DraftPatchRejectedCount: stage2DraftPatchPlan?.summary?.rejectedCount || 0,
  stage2DraftPatchPendingCount: stage2DraftPatchPlan?.summary?.pendingCount || 0,
  stage2DraftPatchSourceKind: stage2DraftPatchPlan?.source?.draftSourceKind || "missing",
  stage2DraftPatchAppliedStatus: stage2DraftPatchApplied?.status || "missing",
  stage2DraftPatchAppliedCount: stage2DraftPatchApplied?.summary?.appliedOperationCount || 0,
  stage2LlmQueueStatus: stage2LlmQueue?.status || "missing",
  stage2LlmJobCount: stage2LlmQueue?.summary?.jobCount || 0,
  stage2LlmProducerStatus: stage2LlmProducer?.status || "missing",
  stage2LlmProducedCount: stage2LlmProducer?.summary?.producedCount || 0,
  stage2LlmImportStatus: stage2LlmImport?.status || "missing",
  stage2LlmValidDraftCount: stage2LlmImport?.summary?.validDraftCount || 0,
  storyArcSegmentationStatus: storyArcSegmentation?.status || "missing",
  storyArcSegmentationIssueRows: storyArcSegmentation?.summary?.issueRowCount || 0,
  storyArcSegmentationGeneratorWired: fileContains(srtStoryboardGeneratorPath, "A1StoryboardStoryArcSegmentationPolicy/v1"),
  storyArcRegroupPlanStatus: storyArcRegroupPlan?.status || "missing",
  storyArcRegroupOperationCount: storyArcRegroupPlan?.summary?.operationCount || 0,
  storyArcRegroupAcceptedCount: storyArcRegroupPlan?.summary?.acceptedCount || 0,
  storyArcRegroupRejectedCount: storyArcRegroupPlan?.summary?.rejectedCount || 0,
  storyArcRegroupPendingCount: storyArcRegroupPlan?.summary?.pendingCount || 0,
  storyArcRegroupDryRunStatus: storyArcRegroupDryRun?.status || "missing",
  storyArcRegroupDryRunPreviewedCount: storyArcRegroupDryRun?.summary?.previewedCount || 0,
  storyArcRegroupDecisionsStatus: storyArcRegroupDecisions?.status || "missing",
  storyArcRegroupAppliedCount: storyArcRegroupDecisions?.summary?.appliedCount || 0,
  motionRepeatWindowStatus: motionRepeatWindow?.status || "missing",
  motionRepeatRunCount: motionRepeatWindow?.summary?.repeatRunCount || 0,
  motionRepeatOperationCount: motionRepeatWindow?.summary?.operationCount || 0,
  motionPatchPlanStatus: motionPatchPlan?.status || "missing",
  motionPatchCandidateCount: motionPatchPlan?.summary?.candidateCount || 0,
  motionPatchAcceptedCount: motionPatchPlan?.summary?.acceptedCount || 0,
  motionPatchRejectedCount: motionPatchPlan?.summary?.rejectedCount || 0,
  motionPatchPendingCount: motionPatchPlan?.summary?.pendingCount || 0,
  motionPatchesAppliedStatus: motionPatchesApplied?.status || "missing",
  motionPatchesAppliedCount: motionPatchesApplied?.summary?.appliedCount || 0,
  productionDashboardStatus: productionDashboard?.status || "missing",
  productionDashboardAttentionCount: productionDashboard?.summary?.attentionCount || 0,
  productionDashboardReviewTaskCount: productionDashboard?.summary?.reviewTaskCount || 0,
  crossProjectFixturesStatus: crossProjectFixtures?.status || "missing",
  crossProjectFixtureLaneCount: crossProjectFixtures?.summary?.generatedLaneCount || 0,
  crossProjectFixturesStoryArcCoverage: crossProjectFixtures?.summary?.allHaveStoryArc === true,
  crossProjectFixtureVisualQualityStatus: crossProjectFixtureVisualQuality?.status || "missing",
  productionRefreshWorkflowStatus: productionRefreshWorkflow?.status || "missing",
  productionRefreshCompletedSteps: productionRefreshWorkflow?.summary?.completedStepCount || 0,
  visualFixItems: visualFix?.summary?.itemCount || 0,
  webgptJobs: webgptQueue?.summary?.jobCount || 0,
};

const coreUserNeeds = [
  {
    id: "storyboard-table-first",
    need: "核心产品表面必须是分镜表，不是先渲染整片再挑错。",
    implementedNow: "已把 semanticFill、行级审计、布局风险、素材状态、行级决策、改稿 patch 计划、显式 apply gate 和人工重写队列回填到生产流程。",
    stillMissing: "人工重写队列还需要编辑 UI 和 Stage 2 语义重写器。",
  },
  {
    id: "semantic-decision-per-shot",
    need: "每一镜都要说明为什么这样切、填什么、怎么填、用什么素材路线。",
    implementedNow: "每行已有 intent/fillWhat/fillHow/assetRoute/motionJob/layoutJob/acceptance，并新增 Stage 2 草案、接受 UI、候选 patch plan、apply gate、LLM contract/queue、local judgement producer、LLM 输出导入校验，以及 LLM import 优先进入 patch plan。",
    stillMissing: "当前 producer 是 Codex/local structured judgement，不是外部 LLM 调用；仍需后续替换为真实模型 worker。",
  },
  {
    id: "simple-visible-ui",
    need: "用户默认只看可决策的信息，后台审计、hash、执行步骤折叠或隐藏。",
    implementedNow: "表格和卡片默认显示原句、屏幕字、画面说明、素材路线和一个简洁状态，并新增 production dashboard contract、页面顶部状态和一键生产状态刷新 workflow。",
    stillMissing: "dashboard 已接入页面，但审片采用/驳回仍需要用户决策。",
  },
  {
    id: "route-by-meaning",
    need: "系统要按语义决定文字包装、确定性图形、语义组件、真实证据、GPT 无字插画。",
    implementedNow: "已有 semanticFill.assetRoute 和审计，错误路线已被重写到 50/50 PASS。",
    stillMissing: "缺少可解释的模型理由、置信度和跨项目回归，不能只靠当前项目通过。",
  },
  {
    id: "pre-render-risk-control",
    need: "遮挡、重复、拥挤、旧图错配要在分镜表阶段发现，不靠反复出片。",
    implementedNow: "布局风险审计已进入分镜表，旧图复用/重生成正在接入素材状态机。",
    stillMissing: "动效重复和节奏风险还没有像布局一样形成强约束。",
  },
  {
    id: "asset-closed-loop",
    need: "生图必须有入队、生成、下载、导入、待审、采用、重做的闭环。",
    implementedNow: "WebGPT 队列、导入报告和 artworkPipeline 已能回填行状态。",
    stillMissing: "网页 GPT 自动化下载和视觉验收还不是完全无阻的后台流水线。",
  },
  {
    id: "new-project-generalization",
    need: "未来遇到新项目要从 SRT/文章理解出分镜，不固定 50 镜或 H01-H11。",
    implementedNow: "当前报告已明确把 50 镜标为当前项目实例，并新增五类 SRT fixture 和结构视觉质量门，用真实 generator 证明不固定 50 镜/H01-H11，且输出 story-arc 元数据。",
    stillMissing: "跨项目 fixture 目前验证结构视觉质量，不验证渲染后的真实画面审美。",
  },
];

const unresolvedMisalignments = [
  {
    id: "llm-stage2-not-real-authority-yet",
    impact: "系统现在能产生、校验并把有效结构化 Stage 2 judgement 接入 patch plan，但生产源仍是本地 Codex 规则化判断。",
    fix: "把 producer 替换为真正 Codex/ChatGPT structured worker，同时保留下游 import/audit/accept/apply 不变。",
  },
  {
    id: "segmentation-is-not-story-arc-driven",
    impact: "切镜可能跟字幕时间对齐，但不一定跟观众认知节奏对齐。",
    fix: "为 split/merge 保存认知单元理由，并审计一句拆两镜、两句合一镜的必要性。",
  },
  {
    id: "review-ui-is-not-editorial-workbench-yet",
    impact: "现在能看表、记录确认/重写/改路线/重做等决策，生成 patch 计划，只应用安全项，并把人工项转成重写任务。",
    fix: "为 manual-review rewrite queue 增加编辑 UI 和 Stage 2 重写器。",
  },
  {
    id: "motion-grammar-still-shallow",
    impact: "画面能填，运动仍可能套模板，导致成片重复和机械。",
    fix: "建立 motion grammar planner，按语义动作选择进入/强调/转场，并惩罚连续重复。",
  },
  {
    id: "asset-generation-loop-not-fully-autonomous",
    impact: "待生成、旧图、待审已能标记，但网页 GPT 批量生成和下载还没有完全稳定闭环。",
    fix: "继续把固定会话、短 prompt、返回监听、下载、导入、验收写成可重复 npm workflow。",
  },
  {
    id: "single-source-of-truth-fragmented",
    impact: "报告很多，用户看到的是分散技术状态，不是一个简单生产状态。",
    fix: "建立 storyboard production dashboard contract，聚合语义、布局、素材、运动、审核五类状态。",
  },
];

const gaps = [
  {
    id: "semantic-understanding-is-still-rule-first",
    severity: "core-gap",
    currentState: "分镜语义目前由关键词正则、覆盖表、Stage 2 本地草案、LLM queue contract、local structured producer 和 LLM import audit 组成。",
    targetState: "每镜有结构化 LLM/模型判断：句子功能、上下文承接、观众认知任务、画面任务、可替代素材路线。",
    codeAction: "convert valid imported Stage 2 judgements into acceptance-visible draft candidates, then replace local producer with real model worker.",
    gate: "LLM import audit must reject outputs lacking intent/fillWhat/fillHow/reason/confidence or violating route constraints.",
  },
  {
    id: "shot-cutting-needs-story-arc-not-only-punctuation",
    severity: "core-gap",
    currentState: "切镜已有 story-arc segmentation contract、protected regroup plan、采用/驳回状态、dry-run props 和 accepted-only apply；当前版本先让用户判断 split/merge/soften，不静默重切镜头。",
    targetState: "切镜要按认知单元：开场、问题、演示、反证、标准、结论；必要时一句拆两镜或两句合一镜。",
    codeAction: "下一步在 storyboard UI 审 5 个 regroup 候选；只有已采用项才进入 dry-run 和 safe metadata apply。",
    gate: "audit detects punctuation-only segmentation and flags shots whose visible task conflicts with source arc; generator must emit storyArcSegmentation metadata.",
  },
  {
    id: "fill-table-needs-human-readable-decision-first",
    severity: "product-gap",
    currentState: "已新增 semanticFill、表格视图、row-decisions、row-decision patch plan、explicit apply gate 和 manual-review rewrite queue。",
    targetState: "分镜表像真实分镜稿：原句、屏幕字、画面说明、素材路线、运动说明、状态、备注一屏横向可扫，并能直接编辑人工重写任务。",
    codeAction: "新增 manual-review rewrite editor UI and Stage 2 rewrite runner.",
    gate: "manual-review-required operations can be rewritten, previewed, and converted into safe patches.",
  },
  {
    id: "layout-conflict-is-after-the-fact",
    severity: "core-gap",
    currentState: "遮挡/拥挤已开始前置到 layout risk audit，但还不是完整排版约束求解。",
    targetState: "填表时就知道标题区、主体区、语义组件密度，先规划再出图。",
    codeAction: "semanticFill should include titleSafeArea, stageDensity, occlusionRisk, fallbackLayout.",
    gate: "any dense semantic stage with long visible text must either simplify or pick alternate layout before PASS.",
  },
  {
    id: "artwork-generation-is-not-yet-closed-loop",
    severity: "execution-gap",
    currentState: "WebGPT queue 已绑定当前 hash，生成/导入状态已回填；旧图复用和重生成仍需继续收口。",
    targetState: "每个待生图镜头显示 prompt、下载状态、导入状态、人工验收、回填状态。",
    codeAction: "connect WebGPT queue/import report back to semanticFill.status and storyboard filters.",
    gate: "needs-artwork count reaches 0 only after imported asset has hash, dimensions, no-text review, and disposition.",
  },
  {
    id: "motion-choice-is-too-template-like",
    severity: "quality-gap",
    currentState: "已新增 motion repeat-window planner 和全局过度使用 motion patch plan；候选可采用/驳回，apply 只写入已采用项。",
    targetState: "根据语义动作选择运动：选择、写回、堆叠、分叉、反证、收束，而不是相邻镜头套同一动效。",
    codeAction: "下一步在 storyboard UI 审 motion patch candidates；通过后运行 accepted-only apply，并用布局/字体渲染契约复核。",
    gate: "no three-shot run may share same semantic stage + motion job unless explicitly justified.",
  },
  {
    id: "cross-project-generalization-not-proven",
    severity: "system-gap",
    currentState: "当前已跑五类 SRT fixture 和结构视觉质量门，证明 generator 能输出不同项目实例、story-arc 元数据、语义/背景/动效多样性；渲染视觉质量门还未覆盖五类。",
    targetState: "任意新 SRT 都能生成项目实例，不固定 50 镜、H01-H11 或当前产品词。",
    codeAction: "next add rendered fixture still/contact-sheet proof only when visual generalization becomes the target.",
    gate: "no fixed shot count, fixed macro count, or project-specific phrase can appear in generic planner logic.",
  },
];

const nextExecutionOrder = [
  "review-stage2-candidates-and-regroup-items-in-storyboard-ui",
  "apply-accepted-stage2-and-regroup-patches",
  "review-and-apply-accepted-motion-patch-candidates",
  "add-rendered-cross-project-fixture-proof-when-approved",
  "harden-webgpt-artwork-download-and-import-automation",
];

const report = {
  contract: "A1IntelligentStoryboardGapPlan/v1",
  phaseId,
  status: "PLAN_READY",
  generatedAt: new Date().toISOString(),
  currentAuthority: {
    propsPath: rel(propsPath),
    propsSha256: sha256File(propsPath),
    semanticFillPath: rel(semanticFillPath),
    semanticRowAuditPath: rel(semanticRowAuditPath),
    layoutRiskPath: rel(layoutRiskPath),
    artworkPipelinePath: rel(artworkPipelinePath),
    staleArtworkReconcilePath: rel(staleArtworkReconcilePath),
    visualFixPath: rel(visualFixPath),
    webgptQueuePath: rel(webgptQueuePath),
    storyArcRegroupDryRunPath: rel(storyArcRegroupDryRunPath),
    storyArcRegroupDecisionsPath: rel(storyArcRegroupDecisionsPath),
    motionPatchPlanPath: rel(motionPatchPlanPath),
    motionPatchesAppliedPath: rel(motionPatchesAppliedPath),
  },
  currentMetrics,
  verdict: "The system is now storyboard-table-first with row-level semantic/layout/artwork status, Stage 2 review candidates, accepted-only story-arc regroup flow, and accepted-only motion patch flow. It is still not fully intelligent because user review, true external model authority, WebGPT automation, and rendered cross-project proof remain unfinished.",
  coreUserNeeds,
  unresolvedMisalignments,
  gaps,
  nextExecutionOrder,
};

const md = [
  "# Intelligent Storyboard Gap Plan v1",
  "",
  `Status: ${report.status}`,
  "",
  `Verdict: ${report.verdict}`,
  "",
  "## Current metrics",
  "",
  ...Object.entries(currentMetrics).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## Core user needs",
  "",
  ...coreUserNeeds.map((item) => [
    `### ${item.id}`,
    "",
    `- need: ${item.need}`,
    `- implemented now: ${item.implementedNow}`,
    `- still missing: ${item.stillMissing}`,
    "",
  ].join("\n")),
  "## Unresolved misalignments",
  "",
  ...unresolvedMisalignments.map((item) => [
    `### ${item.id}`,
    "",
    `- impact: ${item.impact}`,
    `- fix: ${item.fix}`,
    "",
  ].join("\n")),
  "## Gaps",
  "",
  ...gaps.map((gap) => [
    `### ${gap.id}`,
    "",
    `- severity: ${gap.severity}`,
    `- current: ${gap.currentState}`,
    `- target: ${gap.targetState}`,
    `- code action: ${gap.codeAction}`,
    `- gate: ${gap.gate}`,
    "",
  ].join("\n")),
  "## Next execution order",
  "",
  ...nextExecutionOrder.map((item, index) => `${index + 1}. ${item}`),
  "",
].join("\n");

writeBoth("report.json", `${JSON.stringify(report, null, 2)}\n`);
writeBoth("report.md", md);

console.log(JSON.stringify({
  status: report.status,
  currentMetrics,
  gapCount: gaps.length,
  nextExecutionOrder,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
}, null, 2));
