#!/usr/bin/env node

import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line");
const reportRoot = path.join(artifactRoot, "h-series-current-authority-v1");
const publicReportRoot = path.join(publicRoot, "h-series-current-authority-v1");
const reportPath = path.join(reportRoot, "report.json");
const publicReportPath = path.join(publicReportRoot, "report.json");

const paths = {
  currentPhase: path.join(artifactRoot, "current-phase.json"),
  candidateReport: path.join(artifactRoot, "h-series-preproduction-motion-candidate-v1/report.json"),
  candidateReportPublic: path.join(publicRoot, "h-series-preproduction-motion-candidate-v1/report.json"),
  candidateProps: path.join(artifactRoot, "h-series-preproduction-motion-candidate-v1/candidate-props.json"),
  semanticReport: path.join(artifactRoot, "h-series-semantic-directed-v1/report.json"),
  semanticReportPublic: path.join(publicRoot, "h-series-semantic-directed-v1/report.json"),
  visualFixQueue: path.join(artifactRoot, "h-series-semantic-directed-visual-fix-queue-v1/report.json"),
  visualFixQueuePublic: path.join(publicRoot, "h-series-semantic-directed-visual-fix-queue-v1/report.json"),
  artworkPolicy: path.join(artifactRoot, "h-series-generated-artwork-policy-v1/report.json"),
  artworkPolicyPublic: path.join(publicRoot, "h-series-generated-artwork-policy-v1/report.json"),
  currentArtworkResultManifest: path.join(publicRoot, "h-series-generated-editorial-artwork-result-manifest-v1/report.json"),
  currentCandidateReviewLedger: path.join(publicRoot, "h-series-preproduction-motion-candidate-v1/review-decisions.json"),
  currentArtworkReviewLedger: path.join(publicRoot, "h-series-generated-editorial-artwork-result-manifest-v1/review-decisions.json"),
  oldVisualFixQueue: path.join(artifactRoot, "h-series-targeted-visual-fix-queue-v1/report.json"),
  oldVisualFixQueuePublic: path.join(publicRoot, "h-series-targeted-visual-fix-queue-v1/report.json"),
  oldArtworkDecision: path.join(artifactRoot, "h-series-generated-editorial-artwork-decision-v1/report.json"),
  oldArtworkDecisionPublic: path.join(publicRoot, "h-series-generated-editorial-artwork-decision-v1/report.json"),
  currentFilmManifest: path.join(publicRoot, "current-film/current-film-manifest.json"),
  reviewRoute: path.join(root, "apps/studio-next/src/app/api/system-line/h-series-review/route.ts"),
  reviewPage: path.join(root, "apps/studio-next/src/app/system-line-review/page.tsx"),
};

function sha256(file) {
  return fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

const checks = [];
function check(id, pass, detail, severity = "blocker") {
  checks.push({id, status: pass ? "PASS" : "FAIL", severity, detail});
}

const currentPhase = readJson(paths.currentPhase) || {};
const candidateReport = readJson(paths.candidateReport) || {};
const candidateReportPublic = readJson(paths.candidateReportPublic) || {};
const semanticReport = readJson(paths.semanticReport) || {};
const semanticReportPublic = readJson(paths.semanticReportPublic) || {};
const visualFixQueue = readJson(paths.visualFixQueue) || {};
const visualFixQueuePublic = readJson(paths.visualFixQueuePublic) || {};
const artworkPolicy = readJson(paths.artworkPolicy) || {};
const artworkPolicyPublic = readJson(paths.artworkPolicyPublic) || {};
const currentCandidateReviewLedger = readJson(paths.currentCandidateReviewLedger) || {};
const currentArtworkReviewLedger = readJson(paths.currentArtworkReviewLedger) || {};
const currentArtworkResultManifest = readJson(paths.currentArtworkResultManifest) || {};
const oldVisualFixQueue = readJson(paths.oldVisualFixQueue) || {};
const oldArtworkDecision = readJson(paths.oldArtworkDecision) || {};
const currentFilmManifest = readJson(paths.currentFilmManifest) || {};
const reviewRouteSource = fs.existsSync(paths.reviewRoute) ? fs.readFileSync(paths.reviewRoute, "utf8") : "";
const reviewPageSource = fs.existsSync(paths.reviewPage) ? fs.readFileSync(paths.reviewPage, "utf8") : "";

const candidateReportSha256 = sha256(paths.candidateReport);
const candidatePropsSha256 = sha256(paths.candidateProps);
const semanticReportSha256 = sha256(paths.semanticReport);
const visualFixQueueSha256 = sha256(paths.visualFixQueue);
const artworkPolicySha256 = sha256(paths.artworkPolicy);
const currentArtworkResultManifestSha256 = sha256(paths.currentArtworkResultManifest);
const sourcePropsPath = candidateReport.sourceBinding?.sourceProps?.path
  ? path.resolve(root, candidateReport.sourceBinding.sourceProps.path)
  : path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const sourcePropsSha256 = sha256(sourcePropsPath);
const generatedArtworkManifestSha256 = candidateReport.sourceBinding?.generatedArtworkManifestSha256 || null;

check("current-phase-contract", currentPhase.contract === "A1SystemLineCurrentPhase/v1" && currentPhase.phaseId === "h-series-semantic-directed-v1", {contract: currentPhase.contract || null, phaseId: currentPhase.phaseId || null});
check("current-phase-authority-state", currentPhase.authority?.state === "DIRECTED_REVIEW_READY" && currentPhase.reviewDecision?.finalRenderAllowed === false, currentPhase.authority || null);
check("candidate-report-artifact-public-parity", candidateReportSha256 !== null && candidateReportSha256 === sha256(paths.candidateReportPublic), {artifact: candidateReportSha256, public: sha256(paths.candidateReportPublic)});
check("candidate-props-bound-to-current-phase", candidatePropsSha256 !== null && currentPhase.preproductionMotionCandidate?.candidatePropsSha256 === candidatePropsSha256, {actual: candidatePropsSha256, phase: currentPhase.preproductionMotionCandidate?.candidatePropsSha256 || null});
check("candidate-report-bound-to-current-phase", candidateReportSha256 !== null && currentPhase.preproductionMotionCandidate?.reportSha256 === candidateReportSha256, {actual: candidateReportSha256, phase: currentPhase.preproductionMotionCandidate?.reportSha256 || null});
check("candidate-report-source-props-current", candidateReport.sourceBinding?.sourceProps?.sha256 === sourcePropsSha256, {report: candidateReport.sourceBinding?.sourceProps?.sha256 || null, actual: sourcePropsSha256, path: rel(sourcePropsPath)});
check("candidate-report-candidate-props-current", candidateReport.sourceBinding?.candidateProps?.sha256 === candidatePropsSha256, {report: candidateReport.sourceBinding?.candidateProps?.sha256 || null, actual: candidatePropsSha256});
check("candidate-is-review-only", candidateReport.reviewOnly === true && candidateReport.proofOnly === true && candidateReport.rendererAdoptionAllowed === false && candidateReport.finalRenderAllowed === false, {reviewOnly: candidateReport.reviewOnly, proofOnly: candidateReport.proofOnly, rendererAdoptionAllowed: candidateReport.rendererAdoptionAllowed, finalRenderAllowed: candidateReport.finalRenderAllowed});
check("semantic-report-artifact-public-parity", semanticReportSha256 !== null && semanticReportSha256 === sha256(paths.semanticReportPublic), {artifact: semanticReportSha256, public: sha256(paths.semanticReportPublic)});
check("visual-fix-queue-artifact-public-parity", visualFixQueueSha256 !== null && visualFixQueueSha256 === sha256(paths.visualFixQueuePublic), {artifact: visualFixQueueSha256, public: sha256(paths.visualFixQueuePublic)});
check("visual-fix-queue-is-current", visualFixQueue.contract === "A1HSeriesSemanticDirectedVisualFixQueue/v1" && visualFixQueue.status === "PASS" && visualFixQueue.reviewOnly === true && visualFixQueue.finalRenderAllowed === false && visualFixQueue.source?.propsSha256 === sourcePropsSha256 && visualFixQueue.source?.semanticReportSha256 === semanticReportSha256, {contract: visualFixQueue.contract || null, status: visualFixQueue.status || null, source: visualFixQueue.source || null, actualSourcePropsSha256: sourcePropsSha256, actualSemanticReportSha256: semanticReportSha256});
check("artwork-policy-artifact-public-parity", artworkPolicySha256 !== null && artworkPolicySha256 === sha256(paths.artworkPolicyPublic), {artifact: artworkPolicySha256, public: sha256(paths.artworkPolicyPublic)});
check("artwork-policy-is-current", artworkPolicy.contract === "A1HSeriesGeneratedArtworkPolicyAudit/v1" && artworkPolicy.reviewOnly === true && artworkPolicy.finalRenderAllowed === false && artworkPolicy.source?.manifestSha256 === currentArtworkResultManifestSha256, {contract: artworkPolicy.contract || null, status: artworkPolicy.status || null, sourceManifestSha256: artworkPolicy.source?.manifestSha256 || null, currentManifestSha256: currentArtworkResultManifestSha256, candidateSnapshotManifestSha256: generatedArtworkManifestSha256});
check("current-candidate-review-ledger-bound", currentCandidateReviewLedger.contract === "A1HSeriesVisualReviewDecisionLedger/v1" && currentCandidateReviewLedger.candidatePropsSha256 === candidatePropsSha256 && currentCandidateReviewLedger.candidateReportSha256 === candidateReportSha256 && Number(currentCandidateReviewLedger.summary?.pendingCount || 0) + Number(currentCandidateReviewLedger.summary?.reviewedCount || 0) === 47, {status: currentCandidateReviewLedger.status || null, summary: currentCandidateReviewLedger.summary || null, candidatePropsSha256: currentCandidateReviewLedger.candidatePropsSha256 || null, candidateReportSha256: currentCandidateReviewLedger.candidateReportSha256 || null});
check("current-generated-artwork-review-ledger-bound", currentArtworkReviewLedger.contract === "A1HSeriesGeneratedArtworkReviewLedger/v1" && currentArtworkReviewLedger.resultManifestSha256 === currentArtworkResultManifestSha256 && currentArtworkReviewLedger.executionPlanSha256 === currentArtworkResultManifest.source?.executionPlanSha256 && Number(currentArtworkReviewLedger.summary?.pendingCount || 0) + Number(currentArtworkReviewLedger.summary?.reviewedCount || 0) === Number(currentArtworkResultManifest.summary?.expectedCount || 0), {status: currentArtworkReviewLedger.status || null, summary: currentArtworkReviewLedger.summary || null, resultManifestSha256: currentArtworkReviewLedger.resultManifestSha256 || null, currentManifestSha256: currentArtworkResultManifestSha256});
check("review-api-uses-current-queue", reviewRouteSource.includes("h-series-semantic-directed-visual-fix-queue-v1/report.json") && !reviewRouteSource.includes("h-series-targeted-visual-fix-queue-v1/report.json"), {path: rel(paths.reviewRoute), currentQueue: reviewRouteSource.includes("h-series-semantic-directed-visual-fix-queue-v1/report.json"), legacyQueue: reviewRouteSource.includes("h-series-targeted-visual-fix-queue-v1/report.json")});
check("review-page-uses-current-queue", reviewPageSource.includes("h-series-semantic-directed-visual-fix-queue-v1/report.json") && !reviewPageSource.includes("h-series-targeted-visual-fix-queue-v1/report.json"), {path: rel(paths.reviewPage), currentQueue: reviewPageSource.includes("h-series-semantic-directed-visual-fix-queue-v1/report.json"), legacyQueue: reviewPageSource.includes("h-series-targeted-visual-fix-queue-v1/report.json")});

const legacy = [
  {id: "legacy-16-item-visual-fix-queue", artifact: paths.oldVisualFixQueue, public: paths.oldVisualFixQueuePublic, sourcePropsSha256: oldVisualFixQueue.source?.propsSha256 || null, reason: "旧 16 项队列；不属于 current-phase 的 H-series 当前审片链"},
  {id: "legacy-generated-artwork-decision", artifact: paths.oldArtworkDecision, public: paths.oldArtworkDecisionPublic, sourcePropsSha256: oldArtworkDecision.source?.propsSha256 || null, reason: "旧生成图决策；只保留作历史证据，不得驱动当前页面/API"},
  {id: "subordinate-current-film-manifest", artifact: paths.currentFilmManifest, public: paths.currentFilmManifest, sourcePropsSha256: currentFilmManifest.current?.storyboardPropsSha256 || null, reason: "底层 current-film 状态；不作为当前 H-series 逐镜审片权威"},
];
for (const item of legacy) {
  const present = fs.existsSync(item.artifact);
  const distinct = !item.sourcePropsSha256 || item.sourcePropsSha256 !== sourcePropsSha256;
  check(`${item.id}-explicitly-excluded`, present ? distinct || item.id === "subordinate-current-film-manifest" : true, {present, sourcePropsSha256: item.sourcePropsSha256, currentSourcePropsSha256: sourcePropsSha256, excludedReason: item.reason}, "warning");
}

const failures = checks.filter((item) => item.status === "FAIL" && item.severity === "blocker");
const warnings = checks.filter((item) => item.status === "FAIL" && item.severity === "warning");
const report = {
  contract: "A1HSeriesCurrentAuthority/v1",
  phaseId: "h-series-current-authority-v1",
  status: failures.length ? "BLOCKED" : warnings.length ? "PASS_WITH_EXCLUDED_LEGACY" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  finalRenderAllowed: false,
  authority: {
    currentPhase: rel(paths.currentPhase),
    phaseId: currentPhase.phaseId || null,
    candidateReport: rel(paths.candidateReport),
    candidateReportSha256,
    candidateProps: rel(paths.candidateProps),
    candidatePropsSha256,
    sourceProps: rel(sourcePropsPath),
    sourcePropsSha256,
    semanticReviewReport: rel(paths.semanticReport),
    semanticReviewReportSha256: semanticReportSha256,
    visualFixQueue: rel(paths.visualFixQueue),
    visualFixQueueSha256,
    artworkPolicy: rel(paths.artworkPolicy),
    artworkPolicySha256,
    currentArtworkResultManifest: rel(paths.currentArtworkResultManifest),
    currentArtworkResultManifestSha256,
    currentCandidateReviewLedger: rel(paths.currentCandidateReviewLedger),
    currentArtworkReviewLedger: rel(paths.currentArtworkReviewLedger),
  },
  excludedLegacy: legacy.map((item) => ({id: item.id, artifact: rel(item.artifact), public: rel(item.public), sourcePropsSha256: item.sourcePropsSha256, reason: item.reason})),
  summary: {
    candidateSceneCount: candidateReport.summary?.candidateSceneCount || 0,
    candidateSnapshotPendingVisualReviewCount: candidateReport.summary?.pendingVisualReviewCount || 0,
    pendingVisualReviewCount: (currentCandidateReviewLedger.summary?.pendingCount ?? candidateReport.summary?.pendingVisualReviewCount) || 0,
    reviewedVisualReviewCount: currentCandidateReviewLedger.summary?.reviewedCount || 0,
    approvedVisualReviewCount: currentCandidateReviewLedger.summary?.approvedCount || 0,
    reviseVisualReviewCount: currentCandidateReviewLedger.summary?.reviseCount || 0,
    visualFixTargetCount: visualFixQueue.summary?.targetItemCount || 0,
    candidateSnapshotGeneratedArtworkPendingVisualReviewCount: candidateReport.summary?.generatedArtworkPendingVisualReviewCount || 0,
    generatedArtworkPendingVisualReviewCount: (currentArtworkReviewLedger.summary?.pendingCount ?? candidateReport.summary?.generatedArtworkPendingVisualReviewCount) || 0,
    generatedArtworkReviewedCount: currentArtworkReviewLedger.summary?.reviewedCount || 0,
    generatedArtworkApprovedCount: currentArtworkReviewLedger.summary?.approvedCount || 0,
    generatedArtworkReviseCount: currentArtworkReviewLedger.summary?.reviseCount || 0,
    policyWarningCount: artworkPolicy.summary?.warningCount || 0,
    excludedLegacyCount: legacy.filter((item) => fs.existsSync(item.artifact)).length,
  },
  checks,
  failures,
  warnings,
  nextAction: failures.length
    ? "repair-current-authority-bindings-before-review"
    : warnings.length
      ? "use-only-current-authority-and-keep-legacy-artifacts-out-of-current-review"
      : "start-47-shot-review-from-system-line-review",
};

fs.mkdirSync(reportRoot, {recursive: true});
fs.mkdirSync(publicReportRoot, {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, reportPath: rel(reportPath), publicReportPath: rel(publicReportPath), failures: failures.map((item) => item.id), warnings: warnings.map((item) => item.id), current: report.authority, excludedLegacy: report.summary.excludedLegacyCount}, null, 2));
if (failures.length) process.exitCode = 1;
