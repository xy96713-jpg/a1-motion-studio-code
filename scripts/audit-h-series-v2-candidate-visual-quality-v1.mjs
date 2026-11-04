#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-v2-candidate-visual-quality-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");

const v1RejectionPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-v1-visual-rejection-v1/report.json");
const v1ManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/web-review-manifest.json");
const v2ManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v2-candidate/web-review-manifest.json");
const v2ReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v2-candidate/report.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const rel = (file) => path.relative(root, file);

function fileFromPublicUrl(publicUrl) {
  if (!publicUrl || typeof publicUrl !== "string") return "";
  return path.join(root, "apps/studio-next/public", publicUrl.replace(/^\//u, ""));
}

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const failures = [];
for (const required of [v1RejectionPath, v1ManifestPath, v2ManifestPath, v2ReportPath, rendererPropsPath]) {
  if (!fs.existsSync(required)) failures.push(`required-file-missing:${rel(required)}`);
}

const v1Rejection = fs.existsSync(v1RejectionPath) ? readJson(v1RejectionPath) : {};
const v1Manifest = fs.existsSync(v1ManifestPath) ? readJson(v1ManifestPath) : {};
const v2Manifest = fs.existsSync(v2ManifestPath) ? readJson(v2ManifestPath) : {};
const v2Report = fs.existsSync(v2ReportPath) ? readJson(v2ReportPath) : {};
const currentPhase = fs.existsSync(currentPhasePath) ? readJson(currentPhasePath) : {};

const v1VideoFile = fileFromPublicUrl(v1Manifest.video?.url);
const v1ContactSheetFile = fileFromPublicUrl(v1Manifest.contactSheet?.url);
const v2VideoFile = fileFromPublicUrl(v2Manifest.video?.url);
const v2ContactSheetFile = fileFromPublicUrl(v2Manifest.contactSheet?.url);

const v2SampleStats = Array.isArray(v2Manifest.samples) ? v2Manifest.samples.map((sample) => sample.stats).filter(Boolean) : [];
const average = (values) => values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : 0;
const averageNonPaperFraction = average(v2SampleStats.map((stats) => stats.nonPaperFraction));
const averageEdgeDensity = average(v2SampleStats.map((stats) => stats.edgeDensity));
const averageDarkFraction = average(v2SampleStats.map((stats) => stats.darkFraction));
const maxDarkFraction = v2SampleStats.length ? Math.max(...v2SampleStats.map((stats) => stats.darkFraction)) : 0;
const averageBlueFraction = average(v2SampleStats.map((stats) => stats.blueFraction));
const darkEditorialFrames = v2SampleStats.filter((stats) => stats.darkFraction > .18);

const checks = {
  v1ExplicitlyRejected: v1Rejection.status === "REJECTED_STALE_VISUAL",
  v1Preserved: Boolean(v1VideoFile && fs.existsSync(v1VideoFile) && sha256(v1VideoFile) === v1Manifest.video?.sha256),
  v1ContactSheetPreserved: Boolean(v1ContactSheetFile && fs.existsSync(v1ContactSheetFile) && sha256(v1ContactSheetFile) === v1Manifest.contactSheet?.sha256),
  v2ManifestCandidateReviewable: v2Manifest.contract === "A1SystemLineReviewWebManifest/v2Candidate" && v2Manifest.status === "candidate-reviewable" && v2Manifest.candidateOnly === true,
  v2RenderReportPass: v2Report.contract === "A1HSeries540pReviewMp4V2Candidate/v1" && v2Report.status === "PASS",
  v2DoesNotReplaceV1: v2Manifest.replacesCurrentV1 === false && v2Report.replacesCurrentV1 === false,
  v2FinalLocked: v2Manifest.finalRenderAllowed === false && v2Manifest.resolveExportAllowed === false && v2Report.finalRenderAllowed === false && v2Report.resolveExportAllowed === false,
  v2VideoExists: Boolean(v2VideoFile && fs.existsSync(v2VideoFile) && sha256(v2VideoFile) === v2Manifest.video?.sha256),
  v2ContactSheetExists: Boolean(v2ContactSheetFile && fs.existsSync(v2ContactSheetFile) && sha256(v2ContactSheetFile) === v2Manifest.contactSheet?.sha256),
  v2NotSameAsV1: Boolean(v1Manifest.video?.sha256 && v2Manifest.video?.sha256 && v1Manifest.video.sha256 !== v2Manifest.video.sha256),
  v2UsesCurrentRendererProps: fs.existsSync(rendererPropsPath) && sha256(rendererPropsPath) === v2Manifest.sourceBinding?.propsSha256,
  v2SampleFramesReadable: v2SampleStats.length >= 6 && v2SampleStats.every((stats) => stats.width === 960 && stats.height === 540),
  v2LessBlackWorkbenchRisk: averageDarkFraction <= .12 && maxDarkFraction <= .3,
  v2DarkFramesRetainEditorialSemantics: darkEditorialFrames.every((stats) => stats.blueFraction >= .02 && stats.nonPaperFraction >= .35),
  v2HasEditorialInkAndBlue: averageNonPaperFraction >= .08 && averageBlueFraction >= .008,
  v2BackgroundNoiseNotDominant: averageEdgeDensity <= .04,
};

for (const [id, passed] of Object.entries(checks)) {
  if (!passed) failures.push(id);
}

const currentPreproductionCandidateIsBound = currentPhase.phaseId === "h-series-semantic-directed-v1"
  && currentPhase.preproductionMotionCandidate?.phaseId === "h-series-preproduction-motion-candidate-v1"
  && currentPhase.preproductionMotionCandidate?.reviewOnly === true
  && currentPhase.preproductionMotionCandidate?.finalRenderAllowed === false;
const staleHistoricalBindingOnly = currentPreproductionCandidateIsBound
  && v2Manifest.replacesCurrentV1 === false
  && failures.length === 1
  && failures[0] === "v2UsesCurrentRendererProps";
const status = staleHistoricalBindingOnly
  ? "STALE_HISTORICAL"
  : failures.length
    ? "BLOCKED"
    : "PASS_CANDIDATE_REVIEWABLE";

const report = {
  contract: "A1HSeriesV2CandidateVisualQualityAudit/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  candidateOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
  verdict: failures.length
    ? "v2 candidate is not ready to be the visible review entry."
    : "v2 candidate is the current visible review entry; v1 remains preserved only as a rejected stale artifact.",
  objectiveStatus: {
    v1: {
      status: v1Rejection.status || null,
      videoSha256: v1Manifest.video?.sha256 || null,
      contactSheetSha256: v1Manifest.contactSheet?.sha256 || null,
      role: "prior-rejected-baseline",
    },
    v2: {
      status: v2Manifest.status || null,
      videoSha256: v2Manifest.video?.sha256 || null,
      contactSheetSha256: v2Manifest.contactSheet?.sha256 || null,
      role: staleHistoricalBindingOnly ? "historical-candidate-preserved" : "current-candidate-review-entry",
    },
  },
  historicalClassification: staleHistoricalBindingOnly ? {
    reason: "v2 candidate is superseded by the hash-bound h-series-preproduction-motion-candidate-v1 review line",
    currentPhase: currentPhase.phaseId,
    currentCandidatePhase: currentPhase.preproductionMotionCandidate?.phaseId,
    currentCandidateReviewOnly: currentPhase.preproductionMotionCandidate?.reviewOnly,
    currentCandidateFinalRenderAllowed: currentPhase.preproductionMotionCandidate?.finalRenderAllowed,
  } : null,
  aggregate: {
    sampleCount: v2SampleStats.length,
    averageNonPaperFraction,
    averageEdgeDensity,
    averageDarkFraction,
    averageBlueFraction,
    maxDarkFraction: Number(maxDarkFraction.toFixed(4)),
  },
  checks,
  files: {
    v1RejectionReport: rel(v1RejectionPath),
    v1Manifest: rel(v1ManifestPath),
    v1Video: v1VideoFile ? rel(v1VideoFile) : null,
    v2Manifest: rel(v2ManifestPath),
    v2RenderReport: rel(v2ReportPath),
    v2Video: v2VideoFile ? rel(v2VideoFile) : null,
    v2ContactSheet: v2ContactSheetFile ? rel(v2ContactSheetFile) : null,
    rendererProps: rel(rendererPropsPath),
  },
  failures,
  nextAction: staleHistoricalBindingOnly
    ? "keep-v2-candidate-history-only-and-review-the-current-preproduction-motion-candidate"
    : failures.length
      ? "repair-v2-candidate-before-page-promotion"
      : "show-v2-candidate-on-4311-and-keep-v1-read-only-rejected",
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  status: report.status,
  reportPath: rel(reportPath),
  publicReportPath: rel(publicReportPath),
  failures,
  nextAction: report.nextAction,
}, null, 2));

if (failures.length && !staleHistoricalBindingOnly) process.exitCode = 2;
