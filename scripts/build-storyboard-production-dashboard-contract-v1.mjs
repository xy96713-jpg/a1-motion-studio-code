#!/usr/bin/env node
/**
 * Consolidated storyboard production dashboard contract.
 *
 * This is the simple product-facing status source. It aggregates backend audit
 * reports into a compact state so /storyboard can stay readable.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-production-dashboard-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);

const sources = {
  storyboardProps: "apps/studio-next/public/generated/storyboard/current/storyboard-props.json",
  semanticAudit: "apps/studio-next/public/generated/system-line/storyboard-semantic-fill-row-audit-v1/report.json",
  layoutRisk: "apps/studio-next/public/generated/system-line/storyboard-layout-risk-before-render-v1/report.json",
  artworkPipeline: "apps/studio-next/public/generated/system-line/storyboard-artwork-pipeline-status-v1/report.json",
  stage2Import: "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-judgement-import-v1/report.json",
  stage2PatchPlan: "apps/studio-next/public/generated/system-line/storyboard-stage2-draft-patch-plan-v1/report.json",
  storyArcSegmentation: "apps/studio-next/public/generated/system-line/storyboard-story-arc-segmentation-contract-v1/report.json",
  storyArcRegroupPlan: "apps/studio-next/public/generated/system-line/storyboard-story-arc-regroup-plan-v1/report.json",
  storyArcRegroupDecisions: "apps/studio-next/public/generated/system-line/storyboard-story-arc-regroup-decisions-v1/report.json",
  storyArcRegroupDryRun: "apps/studio-next/public/generated/system-line/storyboard-story-arc-regroup-dry-run-props-v1/report.json",
  typographyDirector: "apps/studio-next/public/generated/system-line/storyboard-typography-director-audit-v1/report.json",
  typographyRenderContract: "apps/studio-next/public/generated/system-line/storyboard-typography-render-contract-v1/report.json",
  typographyMotionSample: "apps/studio-next/public/generated/system-line/storyboard-typography-motion-sample-v1/report.json",
  crossProjectFixtures: "apps/studio-next/public/generated/system-line/storyboard-cross-project-srt-fixtures-v1/report.json",
  crossProjectFixtureVisualQuality: "apps/studio-next/public/generated/system-line/storyboard-cross-project-fixture-visual-quality-v1/report.json",
  motionRepeat: "apps/studio-next/public/generated/system-line/storyboard-motion-repeat-window-plan-v1/report.json",
  motionPatchPlan: "apps/studio-next/public/generated/system-line/storyboard-motion-patch-plan-v1/report.json",
  motionPatchesApplied: "apps/studio-next/public/generated/system-line/storyboard-motion-patches-applied-v1/report.json",
  intelligentDecisionTrace: "apps/studio-next/public/generated/system-line/storyboard-intelligent-decision-trace-v1/report.json",
  uiSimplification: "apps/studio-next/public/generated/system-line/storyboard-ui-simplification-contract-v1/report.json",
  cardStillSource: "apps/studio-next/public/generated/system-line/storyboard-card-still-source-contract-v1/report.json",
  visualQualitySample: "apps/studio-next/public/generated/system-line/storyboard-visual-quality-sample-v1/report.json",
  motionTemporalProof: "apps/studio-next/public/generated/system-line/storyboard-motion-temporal-proof-v1/report.json",
  aestheticV2: "apps/studio-next/public/generated/system-line/storyboard-aesthetic-v2-contract-v1/report.json",
  uiVisualProof: "apps/studio-next/public/generated/system-line/storyboard-ui-visual-proof-v1/report.json",
  webgptQueue: "apps/studio-next/public/generated/system-line/storyboard-webgpt-session-queue-v1/queue.json",
};

function readJsonIfExists(relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function statusTone(status, good = ["PASS", "SYNCED", "VALID_DRAFTS_READY", "READY_FOR_LLM_JUDGEMENT", "PRODUCED", "DRY_RUN_READY", "APPLIED", "APPLIED_SAFE_NO_BOUNDARY_MUTATION", "EMPTY_NO_ACCEPTED_DECISIONS", "EMPTY_NO_ACCEPTED_OPERATIONS"]) {
  if (!status || status === "missing") return "missing";
  if (good.includes(status)) return "ok";
  if (["EMPTY", "WAITING_FOR_ACCEPTANCE", "WAITING_FOR_LLM_OUTPUT", "PLAN_READY", "REVIEW_RISKS"].includes(status)) return "attention";
  if (["BLOCKED", "FAIL", "REJECTED"].includes(status)) return "blocked";
  return "attention";
}

const props = readJsonIfExists(sources.storyboardProps);
const semanticAudit = readJsonIfExists(sources.semanticAudit);
const layoutRisk = readJsonIfExists(sources.layoutRisk);
const artworkPipeline = readJsonIfExists(sources.artworkPipeline);
const stage2Import = readJsonIfExists(sources.stage2Import);
const stage2PatchPlan = readJsonIfExists(sources.stage2PatchPlan);
const storyArcSegmentation = readJsonIfExists(sources.storyArcSegmentation);
const storyArcRegroupPlan = readJsonIfExists(sources.storyArcRegroupPlan);
const storyArcRegroupDecisions = readJsonIfExists(sources.storyArcRegroupDecisions);
const storyArcRegroupDryRun = readJsonIfExists(sources.storyArcRegroupDryRun);
const typographyDirector = readJsonIfExists(sources.typographyDirector);
const typographyRenderContract = readJsonIfExists(sources.typographyRenderContract);
const typographyMotionSample = readJsonIfExists(sources.typographyMotionSample);
const crossProjectFixtures = readJsonIfExists(sources.crossProjectFixtures);
const crossProjectFixtureVisualQuality = readJsonIfExists(sources.crossProjectFixtureVisualQuality);
const motionRepeat = readJsonIfExists(sources.motionRepeat);
const motionPatchPlan = readJsonIfExists(sources.motionPatchPlan);
const motionPatchesApplied = readJsonIfExists(sources.motionPatchesApplied);
const intelligentDecisionTrace = readJsonIfExists(sources.intelligentDecisionTrace);
const uiSimplification = readJsonIfExists(sources.uiSimplification);
const cardStillSource = readJsonIfExists(sources.cardStillSource);
const visualQualitySample = readJsonIfExists(sources.visualQualitySample);
const motionTemporalProof = readJsonIfExists(sources.motionTemporalProof);
const aestheticV2 = readJsonIfExists(sources.aestheticV2);
const uiVisualProof = readJsonIfExists(sources.uiVisualProof);
const webgptQueue = readJsonIfExists(sources.webgptQueue);
const currentPropsSha256 = sha256File(sources.storyboardProps);
const artworkByStatus = artworkPipeline?.summary?.byStatus || {};
const artworkTaskCount = (artworkByStatus["queued-for-generation"] || 0)
  + (artworkByStatus["imported-pending-review"] || 0)
  + (artworkByStatus["needs-queue"] || 0)
  + (artworkByStatus["stale-import-needs-regeneration"] || 0);
const artworkReviewStatuses = new Set([
  "queued-for-generation",
  "imported-pending-review",
  "needs-queue",
  "stale-import-needs-regeneration",
]);
const artworkReviewKeys = new Set((artworkPipeline?.rows || [])
  .filter((row) => artworkReviewStatuses.has(row.status))
  .map((row) => `beat:${row.beatId}`));
const stage2CandidateCount = stage2PatchPlan?.summary?.candidateCount || 0;
const stage2AcceptedCount = stage2PatchPlan?.summary?.acceptedCount || 0;
const stage2RejectedCount = stage2PatchPlan?.summary?.rejectedCount || 0;
const stage2AppliedCount = stage2PatchPlan?.summary?.appliedCount || 0;
const stage2PendingCount = Math.max(0, stage2PatchPlan?.summary?.pendingCount ?? (stage2CandidateCount - stage2AcceptedCount - stage2RejectedCount));
const stage2PendingKeys = new Set((stage2PatchPlan?.candidates || [])
  .filter((candidate) => !candidate.accepted && !candidate.rejected && !candidate.applied && !candidate.resolved)
  .map((candidate) => `beat:${candidate.beatId}`));
const stage2ArtworkOverlapCount = [...stage2PendingKeys].filter((key) => artworkReviewKeys.has(key)).length;
const stage2SafeAutoApplyPendingCount = stage2PatchPlan?.summary?.safeAutoApplyPendingCount || 0;
const stage2ManualReviewPendingCount = stage2PatchPlan?.summary?.manualReviewPendingCount || 0;
const regroupOperationCount = storyArcRegroupPlan?.summary?.operationCount || 0;
const regroupAcceptedCount = storyArcRegroupPlan?.summary?.acceptedCount || 0;
const regroupRejectedCount = storyArcRegroupPlan?.summary?.rejectedCount || 0;
const regroupPendingCount = Math.max(0, storyArcRegroupPlan?.summary?.pendingCount ?? (regroupOperationCount - regroupAcceptedCount - regroupRejectedCount));
const regroupPlanSha256 = sha256File(sources.storyArcRegroupPlan);
const regroupDecisionsPlanCurrent = storyArcRegroupDecisions?.source?.regroupPlanSha256 === regroupPlanSha256;
const regroupAppliedCurrent = regroupDecisionsPlanCurrent
  && regroupAcceptedCount > 0
  && (storyArcRegroupDecisions?.summary?.acceptedOperationCount || 0) === regroupAcceptedCount;
const regroupTaskCount = regroupAppliedCurrent
  ? (storyArcRegroupDecisions?.summary?.unresolvedCount || 0)
  : regroupPendingCount > 0
    ? regroupPendingCount
    : regroupAcceptedCount;
const regroupStatus = regroupAppliedCurrent
  ? storyArcRegroupDecisions?.status
  : storyArcRegroupPlan?.status;
const regroupNextAction = regroupPendingCount > 0
  ? "review and accept or reject story-arc regroup items in storyboard UI"
  : regroupAcceptedCount > 0 && !regroupAppliedCurrent
    ? "build dry-run props and apply accepted story-arc regroup items"
    : (storyArcRegroupDecisions?.nextAction || storyArcRegroupPlan?.nextAction || storyArcSegmentation?.nextAction || "build regroup plan");
const motionPatchCandidateCount = motionPatchPlan?.summary?.candidateCount || 0;
const motionPatchAcceptedCount = motionPatchPlan?.summary?.acceptedCount || 0;
const motionPatchRejectedCount = motionPatchPlan?.summary?.rejectedCount || 0;
const motionPatchPendingCount = Math.max(0, motionPatchPlan?.summary?.pendingCount ?? (motionPatchCandidateCount - motionPatchAcceptedCount - motionPatchRejectedCount));
const motionPatchPlanSha256 = sha256File(sources.motionPatchPlan);
const currentMotionPatchResolutionCount = (props?.scenes || []).filter((scene) => scene.storyboard?.motionPatchResolution
  || scene.storyboard?.semanticFill?.motionPatchResolution
  || scene.motionPlan?.motionPatchResolution).length;
const motionPatchesCurrent = motionPatchesApplied?.source?.patchPlanSha256 === motionPatchPlanSha256
  && motionPatchAcceptedCount > 0
  && (motionPatchesApplied?.summary?.acceptedCount || 0) === motionPatchAcceptedCount;
const motionTaskCount = motionPatchesCurrent
  ? (motionPatchesApplied?.summary?.pendingCount || 0)
  : motionPatchPendingCount > 0
    ? motionPatchPendingCount
    : motionPatchAcceptedCount || motionRepeat?.summary?.operationCount || 0;
const motionCardStatus = motionTaskCount > 0
  ? (motionPatchPlan?.status || motionRepeat?.status)
  : (motionRepeat?.status || motionPatchPlan?.status);
const motionNextAction = motionPatchPendingCount > 0
  ? "review and accept or reject motion patch candidates"
  : motionPatchAcceptedCount > 0 && !motionPatchesCurrent
    ? "apply accepted motion patches"
    : motionRepeat?.nextAction || motionPatchPlan?.nextAction || "build motion repeat plan";
const uniqueReviewKeys = new Set([
  ...artworkReviewKeys,
  ...stage2PendingKeys,
  ...Array.from({length: regroupPendingCount}, (_, index) => `storyArc:${index}`),
  ...Array.from({length: motionPatchPendingCount}, (_, index) => `motion:${index}`),
]);
const reviewTaskCount = uniqueReviewKeys.size;
const acceptedReviewTaskCount = stage2AcceptedCount + regroupAcceptedCount + motionPatchAcceptedCount;

const cards = [
  {
    id: "semantic-fill",
    label: "语义填表",
    status: semanticAudit?.status || "missing",
    tone: statusTone(semanticAudit?.status),
    count: semanticAudit?.summary?.byStatus?.PASS || 0,
    total: semanticAudit?.summary?.rowCount || props?.scenes?.length || 0,
    nextAction: semanticAudit?.nextAction || "run semantic fill audit",
  },
  {
    id: "layout-risk",
    label: "排版风险",
    status: layoutRisk?.status || "missing",
    tone: statusTone(layoutRisk?.status),
    count: layoutRisk?.summary?.byStatus?.PASS || 0,
    total: layoutRisk?.summary?.rowCount || props?.scenes?.length || 0,
    nextAction: layoutRisk?.nextAction || "run layout risk audit",
  },
  {
    id: "artwork-pipeline",
    label: "素材流水",
    status: artworkPipeline?.status || "missing",
    tone: artworkTaskCount > 0 ? "attention" : statusTone(artworkPipeline?.status),
    count: artworkTaskCount,
    total: artworkPipeline?.summary?.rowCount || 0,
    summary: artworkPipeline?.summary?.byStatus || {},
    nextAction: artworkPipeline?.nextAction || "sync artwork pipeline",
  },
  {
    id: "stage2",
    label: "Stage 2 语义重判",
    status: stage2Import?.status || "missing",
    tone: stage2PendingCount > 0 || stage2AcceptedCount > 0 ? "attention" : statusTone(stage2Import?.status),
    count: stage2PendingCount,
    total: stage2CandidateCount,
    nextAction: stage2PatchPlan?.status === "WAITING_FOR_ACCEPTANCE"
      ? "review and accept Stage 2 candidates in storyboard UI"
      : stage2Import?.nextAction || "run Stage 2 judgement import",
  },
  {
    id: "story-arc",
    label: "故事弧切镜",
    status: regroupStatus || storyArcSegmentation?.status || "missing",
    tone: regroupTaskCount === 0 && regroupAppliedCurrent ? "ok" : statusTone(regroupStatus || storyArcSegmentation?.status),
    count: regroupTaskCount,
    total: regroupOperationCount,
    nextAction: regroupNextAction,
  },
  {
    id: "motion-repeat",
    label: "动效重复",
    status: motionCardStatus || "missing",
    tone: motionTaskCount > 0 ? "attention" : statusTone(motionCardStatus),
    count: motionTaskCount,
    total: motionRepeat?.summary?.sceneCount || 0,
    nextAction: motionNextAction,
  },
];

const blockers = cards.filter((card) => card.tone === "blocked" || card.tone === "missing");
const attention = cards.filter((card) => card.tone === "attention");
const hiddenGates = [
  {
    id: "typography-render-contract",
    label: "字体渲染契约",
    status: typographyRenderContract?.status || "missing",
    tone: statusTone(typographyRenderContract?.status),
    nextAction: typographyRenderContract?.nextAction || "run typography render contract audit",
  },
  {
    id: "typography-motion-sample",
    label: "字体动效抽样",
    status: typographyMotionSample?.status || "missing",
    tone: typographyMotionSample ? statusTone(typographyMotionSample.status) : "attention",
    optional: true,
    nextAction: typographyMotionSample?.nextAction || "render typography motion sample when visual motion proof is needed",
  },
  {
    id: "cross-project-fixtures",
    label: "跨项目分镜回归",
    status: crossProjectFixtures?.status || "missing",
    tone: statusTone(crossProjectFixtures?.status, ["PASS"]),
    nextAction: crossProjectFixtures?.nextAction || "run cross-project SRT fixtures",
  },
  {
    id: "cross-project-visual-quality",
    label: "跨项目语义/字体回归",
    status: crossProjectFixtureVisualQuality?.status || "missing",
    tone: statusTone(crossProjectFixtureVisualQuality?.status, ["PASS"]),
    nextAction: crossProjectFixtureVisualQuality?.nextAction || "run cross-project fixture visual quality audit",
  },
  {
    id: "intelligent-decision-trace",
    label: "智能分镜决策链",
    status: intelligentDecisionTrace?.status || "missing",
    tone: statusTone(intelligentDecisionTrace?.status, ["PASS"]),
    nextAction: intelligentDecisionTrace?.nextAction || "build intelligent storyboard decision trace",
  },
  {
    id: "storyboard-ui-simplification",
    label: "分镜表前台文案",
    status: uiSimplification?.status || "missing",
    tone: statusTone(uiSimplification?.status, ["PASS"]),
    nextAction: uiSimplification?.nextAction || "run storyboard UI simplification contract",
  },
  {
    id: "storyboard-card-still-source",
    label: "分镜卡片静帧",
    status: cardStillSource?.status || "missing",
    tone: statusTone(cardStillSource?.status, ["PASS"]),
    nextAction: cardStillSource?.nextAction || "run storyboard card still source contract",
  },
  {
    id: "storyboard-visual-quality-sample",
    label: "分镜视觉抽样",
    status: visualQualitySample?.status || "missing",
    tone: statusTone(visualQualitySample?.status, ["PASS"]),
    nextAction: visualQualitySample?.nextAction || "run storyboard visual quality sample",
  },
  {
    id: "storyboard-motion-temporal-proof",
    label: "分镜动效抽样",
    status: motionTemporalProof?.status || "missing",
    tone: statusTone(motionTemporalProof?.status, ["PASS"]),
    nextAction: motionTemporalProof?.nextAction || "run storyboard motion temporal proof",
  },
  {
    id: "storyboard-aesthetic-v2",
    label: "审美 v2",
    status: aestheticV2?.status || "missing",
    tone: statusTone(aestheticV2?.status, ["PASS"]),
    nextAction: aestheticV2?.nextAction || "run storyboard aesthetic v2 contract",
  },
  {
    id: "storyboard-ui-visual-proof",
    label: "分镜表视觉证明",
    status: uiVisualProof?.status || "missing",
    tone: statusTone(uiVisualProof?.status, ["PASS"]),
    nextAction: uiVisualProof?.nextAction || "capture storyboard UI visual proof",
  },
  {
    id: "story-arc-regroup-dry-run",
    label: "切镜 dry-run",
    status: storyArcRegroupDryRun?.status || "missing",
    tone: storyArcRegroupDryRun ? statusTone(storyArcRegroupDryRun.status) : "attention",
    optional: true,
    nextAction: storyArcRegroupDryRun?.nextAction || "build regroup dry-run props when items are accepted",
  },
];
const requiredHiddenBlockers = hiddenGates.filter((gate) => !gate.optional && (gate.tone === "blocked" || gate.tone === "missing"));
const hiddenAttention = hiddenGates.filter((gate) => gate.tone === "attention");
const primaryNextAction = blockers[0]?.nextAction
  || requiredHiddenBlockers[0]?.nextAction
  || attention.find((card) => card.id === "stage2")?.nextAction
  || attention[0]?.nextAction
  || hiddenAttention.find((gate) => !gate.optional)?.nextAction
  || "storyboard-table-ready-for-user-review";

const report = {
  contract: "A1StoryboardProductionDashboardContract/v1",
  phaseId,
  status: blockers.length || requiredHiddenBlockers.length ? "BLOCKED" : attention.length || hiddenAttention.some((gate) => !gate.optional) ? "READY_WITH_REVIEW_ITEMS" : "READY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: Object.fromEntries(Object.entries(sources).map(([key, relativePath]) => [key, {
    path: relativePath,
    sha256: sha256File(relativePath),
  }])),
  summary: {
    sceneCount: props?.scenes?.length || 0,
    cardCount: cards.length,
    blockerCount: blockers.length + requiredHiddenBlockers.length,
    attentionCount: attention.length + hiddenAttention.filter((gate) => !gate.optional).length,
    webgptJobs: webgptQueue?.summary?.jobCount || 0,
    reviewTaskCount,
    rawReviewTaskCount: artworkTaskCount + stage2PendingCount + regroupPendingCount + motionPatchPendingCount,
    duplicateReviewTaskCount: stage2ArtworkOverlapCount,
    acceptedReviewTaskCount,
    reviewBuckets: {
      artwork: artworkTaskCount,
      stage2: stage2PendingCount,
      storyArc: regroupPendingCount,
      motion: motionPatchPendingCount,
    },
    acceptedReviewBuckets: {
      stage2: stage2AcceptedCount,
      storyArc: regroupAcceptedCount,
      motion: motionPatchAcceptedCount,
    },
    stage2CandidateCount,
    stage2AcceptedCount,
    stage2AppliedCount,
    stage2RejectedCount,
    stage2PendingCount,
    stage2SafeAutoApplyPendingCount,
    stage2ManualReviewPendingCount,
    stage2PendingBySafety: stage2PatchPlan?.summary?.pendingBySafety || {},
    regroupTaskCount,
    regroupOperationCount,
    regroupAcceptedCount,
    regroupRejectedCount,
    regroupPendingCount,
    regroupDryRunStatus: storyArcRegroupDryRun?.status || "missing",
    motionPatchCandidateCount,
    motionPatchAcceptedCount,
    motionPatchRejectedCount,
    motionPatchPendingCount,
    currentMotionPatchResolutionCount,
    motionPatchesAppliedStatus: motionPatchesApplied?.status || "missing",
    intelligentDecisionTraceStatus: intelligentDecisionTrace?.status || "missing",
    intelligentDecisionTracePassCount: intelligentDecisionTrace?.summary?.passCount || 0,
    intelligentDecisionTraceFailCount: intelligentDecisionTrace?.summary?.failCount || 0,
    artworkTaskCount,
    typographyPresetCount: typographyDirector?.summary?.presetCount || 0,
    typographyByPreset: typographyDirector?.summary?.byPreset || {},
    typographyRenderContractStatus: typographyRenderContract?.status || "missing",
    typographyRenderFailCount: typographyRenderContract?.summary?.failCount || 0,
    typographyMotionSampleStatus: typographyMotionSample?.status || "missing",
    crossProjectFixturesStatus: crossProjectFixtures?.status || "missing",
    crossProjectFixtureLaneCount: crossProjectFixtures?.summary?.generatedLaneCount || 0,
    crossProjectNoFixed50: crossProjectFixtures?.summary?.noFixed50 === true,
    crossProjectVisualQualityStatus: crossProjectFixtureVisualQuality?.status || "missing",
    crossProjectVisualQualityIssues: crossProjectFixtureVisualQuality?.summary?.byIssue || {},
    storyboardUISimplificationStatus: uiSimplification?.status || "missing",
    storyboardCardStillSourceStatus: cardStillSource?.status || "missing",
    storyboardVisualQualitySampleStatus: visualQualitySample?.status || "missing",
    storyboardVisualQualitySamplePassCount: visualQualitySample?.summary?.passCount || 0,
    storyboardVisualQualitySampleFailCount: visualQualitySample?.summary?.failCount || 0,
    storyboardMotionTemporalProofStatus: motionTemporalProof?.status || "missing",
    storyboardMotionTemporalProofPassCount: motionTemporalProof?.summary?.passCount || 0,
    storyboardMotionTemporalProofFailCount: motionTemporalProof?.summary?.failCount || 0,
    storyboardAestheticV2Status: aestheticV2?.status || "missing",
    storyboardAestheticV2FailCount: aestheticV2?.summary?.failCount || 0,
    storyboardUIVisualProofStatus: uiVisualProof?.status || "missing",
    storyboardUIVisualProofWhyCount: uiVisualProof?.summary?.lightweightWhyCount || 0,
    storyboardUIVisualProofOpenWhyCount: uiVisualProof?.summary?.lightweightWhyOpenCount || 0,
  },
  cards,
  hiddenGates,
  primaryNextAction,
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  primaryNextAction: report.primaryNextAction,
  reportPath: path.relative(root, path.join(artifactRoot, "report.json")),
  publicReportPath: path.relative(root, path.join(publicRoot, "report.json")),
}, null, 2));
