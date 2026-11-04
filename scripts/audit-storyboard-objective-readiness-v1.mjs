#!/usr/bin/env node
/**
 * Requirement-level readiness audit for the user's storyboard-system objective.
 *
 * This report does not add product UI. It maps the objective into concrete
 * requirements and verifies each one from authoritative generated reports.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-objective-readiness-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);

const sources = {
  dashboard: "apps/studio-next/public/generated/system-line/storyboard-production-dashboard-contract-v1/report.json",
  semanticFill: "apps/studio-next/public/generated/system-line/storyboard-semantic-fill-row-audit-v1/report.json",
  layoutRisk: "apps/studio-next/public/generated/system-line/storyboard-layout-risk-before-render-v1/report.json",
  decisionTrace: "apps/studio-next/public/generated/system-line/storyboard-intelligent-decision-trace-v1/report.json",
  uiSimplification: "apps/studio-next/public/generated/system-line/storyboard-ui-simplification-contract-v1/report.json",
  uiVisualProof: "apps/studio-next/public/generated/system-line/storyboard-ui-visual-proof-v1/report.json",
  cardStillSource: "apps/studio-next/public/generated/system-line/storyboard-card-still-source-contract-v1/report.json",
  visualQualitySample: "apps/studio-next/public/generated/system-line/storyboard-visual-quality-sample-v1/report.json",
  motionTemporalProof: "apps/studio-next/public/generated/system-line/storyboard-motion-temporal-proof-v1/report.json",
  aestheticV2: "apps/studio-next/public/generated/system-line/storyboard-aesthetic-v2-contract-v1/report.json",
  typographyRender: "apps/studio-next/public/generated/system-line/storyboard-typography-render-contract-v1/report.json",
  typographyMotion: "apps/studio-next/public/generated/system-line/storyboard-typography-motion-sample-v1/report.json",
  crossProjectFixtures: "apps/studio-next/public/generated/system-line/storyboard-cross-project-srt-fixtures-v1/report.json",
  crossProjectVisualQuality: "apps/studio-next/public/generated/system-line/storyboard-cross-project-fixture-visual-quality-v1/report.json",
  artworkPipeline: "apps/studio-next/public/generated/system-line/storyboard-artwork-pipeline-status-v1/report.json",
  workflow: "apps/studio-next/public/generated/system-line/storyboard-production-refresh-workflow-v1/report.json",
};

function readJsonIfExists(relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const reports = Object.fromEntries(Object.entries(sources).map(([key, relativePath]) => [key, readJsonIfExists(relativePath)]));
const checks = [];

function addCheck(id, label, pass, evidence, blockerDetail, severity = "required") {
  checks.push({
    id,
    label,
    severity,
    status: pass ? "PASS" : "FAIL",
    evidence,
    blockerDetail: pass ? null : blockerDetail,
  });
}

addCheck(
  "production-dashboard-ready",
  "主分镜表总状态必须 READY，且无待办/阻断",
  reports.dashboard?.status === "READY" && reports.dashboard?.summary?.reviewTaskCount === 0 && reports.dashboard?.summary?.attentionCount === 0 && reports.dashboard?.summary?.blockerCount === 0,
  {
    status: reports.dashboard?.status || "missing",
    reviewTaskCount: reports.dashboard?.summary?.reviewTaskCount ?? null,
    attentionCount: reports.dashboard?.summary?.attentionCount ?? null,
    blockerCount: reports.dashboard?.summary?.blockerCount ?? null,
  },
  "dashboard is not READY or still has review/attention/blocker counts"
);

addCheck(
  "semantic-fill-complete",
  "每个分镜必须有语义填表结果",
  reports.semanticFill?.status === "PASS" && reports.semanticFill?.summary?.rowCount > 0 && reports.semanticFill?.summary?.byStatus?.PASS === reports.semanticFill?.summary?.rowCount,
  reports.semanticFill?.summary || null,
  "semantic fill audit is missing or not all rows pass"
);

addCheck(
  "layout-risk-clear",
  "遮挡/重复/布局风险必须清零",
  reports.layoutRisk?.status === "PASS" && reports.layoutRisk?.summary?.byStatus?.PASS === reports.layoutRisk?.summary?.rowCount,
  reports.layoutRisk?.summary || null,
  "layout risk audit is missing or not all rows pass"
);

addCheck(
  "intelligent-decision-trace-complete",
  "系统必须能解释每镜为何这样分镜",
  reports.decisionTrace?.status === "PASS" && reports.decisionTrace?.summary?.traceCount > 0 && reports.decisionTrace?.summary?.passCount === reports.decisionTrace?.summary?.traceCount,
  {
    status: reports.decisionTrace?.status || "missing",
    sceneCount: reports.decisionTrace?.summary?.sceneCount ?? null,
    traceCount: reports.decisionTrace?.summary?.traceCount ?? null,
    passCount: reports.decisionTrace?.summary?.passCount ?? null,
    failCount: reports.decisionTrace?.summary?.failCount ?? null,
    byStageKind: reports.decisionTrace?.summary?.byStageKind || {},
    byObjectRoute: reports.decisionTrace?.summary?.byObjectRoute || {},
  },
  "decision trace is missing, incomplete, or has failing rows"
);

addCheck(
  "frontend-simple-and-hidden-backend",
  "前台必须简洁，后台信息默认折叠/隐藏",
  reports.uiSimplification?.status === "PASS" && reports.uiVisualProof?.status === "PASS" && reports.uiVisualProof?.summary?.lightweightWhyOpenCount === 0 && reports.uiVisualProof?.summary?.visibleBackendPhraseCount === 0,
  {
    uiSimplificationStatus: reports.uiSimplification?.status || "missing",
    uiVisualProofStatus: reports.uiVisualProof?.status || "missing",
    lightweightWhyCount: reports.uiVisualProof?.summary?.lightweightWhyCount ?? null,
    lightweightWhyOpenCount: reports.uiVisualProof?.summary?.lightweightWhyOpenCount ?? null,
    visibleBackendPhraseCount: reports.uiVisualProof?.summary?.visibleBackendPhraseCount ?? null,
    visiblePrimaryActionCount: reports.uiVisualProof?.summary?.visiblePrimaryActionCount ?? null,
  },
  "front-end simplification or visual proof failed"
);

addCheck(
  "cards-use-final-storyboard-stills",
  "分镜卡片必须显示最终分镜静帧，不是原始素材图",
  reports.cardStillSource?.status === "PASS" && reports.cardStillSource?.summary?.pageUsesStillCount === reports.cardStillSource?.summary?.representativeCount && reports.cardStillSource?.summary?.metaPropsCurrentCount === reports.cardStillSource?.summary?.representativeCount,
  reports.cardStillSource?.summary || null,
  "card still source contract is missing or not all representative cards use current final stills"
);

addCheck(
  "typography-system-covered",
  "字体系统必须有渲染契约和动效抽样证据",
  reports.typographyRender?.status === "PASS" && reports.typographyMotion?.status === "PASS" && (reports.decisionTrace?.summary?.uniqueTypographyPresetCount || 0) >= 5,
  {
    typographyRenderStatus: reports.typographyRender?.status || "missing",
    typographyMotionStatus: reports.typographyMotion?.status || "missing",
    presetCount: reports.decisionTrace?.summary?.uniqueTypographyPresetCount ?? null,
    byPreset: reports.decisionTrace?.summary?.byTypographyPreset || {},
  },
  "typography render/motion proof missing or preset diversity too low"
);

addCheck(
  "motion-system-covered",
  "动效必须有时间变化证明，不只是一张静帧",
  reports.motionTemporalProof?.status === "PASS" && reports.motionTemporalProof?.summary?.passCount === reports.motionTemporalProof?.summary?.sampleCount && reports.motionTemporalProof?.summary?.averageMaxChangedPixelFraction >= 0.08,
  reports.motionTemporalProof?.summary || null,
  "motion temporal proof missing or frame deltas too weak"
);

addCheck(
  "visual-quality-covered",
  "视觉抽样必须证明字体/色彩/画面密度达标",
  reports.visualQualitySample?.status === "PASS" && reports.visualQualitySample?.summary?.passCount === reports.visualQualitySample?.summary?.sampleCount,
  reports.visualQualitySample?.summary || null,
  "visual quality sample missing or failing"
);

addCheck(
  "aesthetic-v2-system-covered",
  "审美升级必须进入统一管线，而不是散改单镜头",
  reports.aestheticV2?.status === "PASS" && reports.aestheticV2?.summary?.failCount === 0,
  {
    status: reports.aestheticV2?.status || "missing",
    thesis: reports.aestheticV2?.aestheticThesis || null,
    summary: reports.aestheticV2?.summary || null,
  },
  "aesthetic v2 contract is missing or failing"
);

addCheck(
  "abstract-symbolic-policy-covered",
  "系统默认抽象符号化，禁止具象人头/人脸策略必须进入审计",
  reports.decisionTrace?.policy?.generatedHumanSubjectsAllowed === false && reports.decisionTrace?.policy?.symbolicAbstractionRequired === true && reports.visualQualitySample?.policy?.defaultGeneratedHumanSubjectsAllowed === false,
  {
    decisionTracePolicy: reports.decisionTrace?.policy || null,
    visualQualityPolicy: reports.visualQualitySample?.policy || null,
  },
  "symbolic/no-human-subject policy is missing from objective evidence"
);

addCheck(
  "cross-project-srt-not-fixed-50",
  "系统不能只服务当前 50 镜，必须有跨项目 SRT 回归证据",
  reports.crossProjectFixtures?.status === "PASS" && reports.crossProjectFixtures?.summary?.noFixed50 === true && reports.crossProjectVisualQuality?.status === "PASS",
  {
    crossProjectFixturesStatus: reports.crossProjectFixtures?.status || "missing",
    generatedLaneCount: reports.crossProjectFixtures?.summary?.generatedLaneCount ?? null,
    noFixed50: reports.crossProjectFixtures?.summary?.noFixed50 ?? null,
    crossProjectVisualQualityStatus: reports.crossProjectVisualQuality?.status || "missing",
    byIssue: reports.crossProjectVisualQuality?.summary?.byIssue || {},
  },
  "cross-project SRT fixture or visual quality regression is missing/failing"
);

addCheck(
  "artwork-pipeline-clear",
  "素材流水不能遗留待生图/待审图任务",
  reports.artworkPipeline?.status === "SYNCED" && Object.entries(reports.artworkPipeline?.summary?.byStatus || {}).every(([status, count]) => !["queued-for-generation", "imported-pending-review", "needs-queue", "stale-import-needs-regeneration"].includes(status) || count === 0),
  {
    status: reports.artworkPipeline?.status || "missing",
    byStatus: reports.artworkPipeline?.summary?.byStatus || {},
  },
  "artwork pipeline still has generation/review tasks"
);

const blockerChecks = checks.filter((check) => check.status !== "PASS" && check.severity === "required");
const report = {
  contract: "A1StoryboardObjectiveReadiness/v1",
  phaseId,
  status: blockerChecks.length ? "BLOCKED" : "REVIEW_EVIDENCE_PASS",
  systemReady: false,
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  objective: "围绕用户需求优化智能分镜系统，包括字体、动效、简洁前台、抽象符号化视觉、统一工作流和客观验证。",
  source: Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, {path: value, exists: Boolean(reports[key])}])),
  summary: {
    requirementCount: checks.length,
    passCount: checks.filter((check) => check.status === "PASS").length,
    failCount: checks.filter((check) => check.status !== "PASS").length,
    blockerCount: blockerChecks.length,
  },
  checks,
  blockers: blockerChecks.map((check) => ({id: check.id, label: check.label, detail: check.blockerDetail, evidence: check.evidence})),
  nextAction: blockerChecks.length
    ? "fix-failing-objective-readiness-checks-before-claiming-mainline-ready"
    : "build-current-film-manifest-and-render-a-current-hash-bound-full-preview",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: path.relative(root, path.join(artifactRoot, "report.json")),
  publicReportPath: path.relative(root, path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
if (blockerChecks.length) process.exitCode = 2;
