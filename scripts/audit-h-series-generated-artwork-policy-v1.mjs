#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const phaseId = "h-series-generated-artwork-policy-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-result-manifest-v1/report.json");
const executionPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-execution-plan-v1/report.json");
const publicAssetsRoot = path.join(root, "apps/studio-next/public");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function isCobalt(r, g, b) {
  return b > 115 && b - r > 42 && b - g > 18 && r < 150;
}

function runLengths(values) {
  const runs = [];
  let start = -1;
  for (let index = 0; index <= values.length; index += 1) {
    const active = index < values.length && values[index];
    if (active && start < 0) start = index;
    if (!active && start >= 0) {
      runs.push([start, index - 1]);
      start = -1;
    }
  }
  return runs;
}

function suspiciousLine(values, minimumSpan) {
  const runs = runLengths(values);
  if (runs.length < 6) return null;
  const span = runs[runs.length - 1][1] - runs[0][0] + 1;
  if (span < minimumSpan) return null;
  const lengths = runs.map(([start, end]) => end - start + 1);
  const gaps = runs.slice(1).map((run, index) => run[0] - runs[index][1] - 1);
  const averageLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const averageGap = gaps.reduce((sum, value) => sum + value, 0) / Math.max(1, gaps.length);
  const shortRunRatio = lengths.filter((value) => value <= 8).length / lengths.length;
  if (averageLength > 8 || averageGap < 1.5 || shortRunRatio < 0.75) return null;
  return {
    runCount: runs.length,
    span,
    averageRunLength: Number(averageLength.toFixed(2)),
    averageGap: Number(averageGap.toFixed(2)),
  };
}

function scanImage(data, width, height) {
  const cobalt = Array.from({length: height}, () => Array(width).fill(false));
  let cobaltCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      cobalt[y][x] = isCobalt(data[offset], data[offset + 1], data[offset + 2]);
      if (cobalt[y][x]) cobaltCount += 1;
    }
  }
  const minimumSpan = Math.max(42, Math.round(Math.min(width, height) * 0.28));
  const candidates = [];
  for (let y = 0; y < height; y += 1) {
    const hit = suspiciousLine(cobalt[y], minimumSpan);
    if (hit) candidates.push({orientation: "horizontal", index: y, ...hit});
  }
  for (let x = 0; x < width; x += 1) {
    const hit = suspiciousLine(cobalt.map((row) => row[x]), minimumSpan);
    if (hit) candidates.push({orientation: "vertical", index: x, ...hit});
  }
  const slopes = [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1];
  for (const slope of slopes) {
    for (let intercept = -height; intercept <= height * 2; intercept += 2) {
      const values = [];
      for (let x = 0; x < width; x += 1) {
        const y = Math.round(slope * x + intercept);
        values.push(y >= 0 && y < height ? cobalt[y][x] : false);
      }
      const hit = suspiciousLine(values, minimumSpan);
      if (hit) {
        candidates.push({orientation: "diagonal", slope, intercept, ...hit});
        break;
      }
    }
  }
  return {
    cobaltFraction: Number((cobaltCount / (width * height)).toFixed(4)),
    suspiciousSegmentCount: candidates.length,
    suspiciousSegments: candidates.slice(0, 8),
  };
}

async function inspectAsset(file) {
  const {data, info} = await sharp(file).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  return scanImage(data, info.width, info.height);
}

if (!fs.existsSync(manifestPath)) throw new Error(`required-file-missing:${path.relative(root, manifestPath)}`);
const manifest = readJson(manifestPath);
const executionPlan = fs.existsSync(executionPlanPath) ? readJson(executionPlanPath) : null;
const executionJobs = new Map((executionPlan?.jobs || []).map((job) => [job.beatId, job]));
const failures = [];
const items = [];
for (const asset of manifest.assets || []) {
  const file = path.join(publicAssetsRoot, String(asset.publicUrl || "").replace(/^\//u, ""));
  const itemFailures = [];
  const exists = fs.existsSync(file);
  if (!exists) itemFailures.push("file-missing");
  if (exists && sha256File(file) !== asset.sha256) itemFailures.push("hash-mismatch");
  const stats = exists ? await inspectAsset(file) : null;
  if (stats?.suspiciousSegmentCount > 0) itemFailures.push("suspected-decorative-dashed-line");
  const executionJob = executionJobs.get(asset.beatId);
  const promptText = String(executionJob?.promptText || "");
  const promptInstructionText = promptText.split(/\nForbidden:/u, 1)[0];
  if (!executionJob) itemFailures.push("execution-prompt-missing");
  if (/wireframe|grid lines|construction lines|dashed guide lines/iu.test(promptInstructionText)) itemFailures.push("prompt-allows-forbidden-line-primitive");
  if (promptText && !/solid cut-paper geometry/iu.test(promptText)) itemFailures.push("prompt-missing-solid-object-language");
  const promptBound = typeof asset.promptSha256 === "string" && asset.promptSha256.length === 64;
  const reviewLocked = asset.reviewStatus === "pending-visual-review" && asset.renderAllowedBeforeApproval === false && asset.rendererAdoptionAllowed === false;
  if (!promptBound) itemFailures.push("prompt-binding-missing");
  if (!reviewLocked) itemFailures.push("review-lock-invalid");
  items.push({
    beatId: asset.beatId,
    promptRole: asset.promptRole,
    publicUrl: asset.publicUrl,
    sha256: asset.sha256,
    status: itemFailures.length ? "WARN" : "PASS",
    visualRisk: itemFailures.some((failure) => ["suspected-decorative-dashed-line", "prompt-allows-forbidden-line-primitive"].includes(failure))
      ? "forbidden-line-primitive"
      : null,
    stats,
    failures: itemFailures,
  });
  failures.push(...itemFailures.map((failure) => `${failure}:${asset.beatId}`));
}

const riskyItems = items.filter((item) => item.visualRisk);
const policyWarnings = new Set([
  "suspected-decorative-dashed-line",
  "prompt-allows-forbidden-line-primitive",
  "prompt-missing-solid-object-language",
]);
const reportBase = {
  contract: "A1HSeriesGeneratedArtworkPolicyAudit/v1",
  phaseId,
  status: failures.length ? "WARN_PENDING_HUMAN_VISUAL_REVIEW" : "PASS_PENDING_HUMAN_VISUAL_REVIEW",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {manifestPath: path.relative(root, manifestPath), manifestSha256: sha256File(manifestPath)},
  policy: {
    noDecorativeDashedLines: true,
    noFakeEvidence: true,
    hashBound: true,
    humanReviewStillRequired: true,
  },
  summary: {
    assetCount: items.length,
    passCount: items.filter((item) => item.status === "PASS").length,
    warningCount: riskyItems.length,
    failureCount: items.filter((item) => item.failures.some((failure) => !policyWarnings.has(failure))).length,
    adoptionBlockedByPolicyRisk: riskyItems.length > 0,
  },
  items,
  failures,
  nextAction: riskyItems.length
    ? "regenerate-or-reject-flagged-assets-before-adoption"
    : "await-human-visual-approval-before-adoption",
};
// Keep a policy report hash stable when its actual findings are unchanged.
// Downstream repair briefs bind this report; a fresh wall-clock timestamp on
// every audit would otherwise make an unchanged candidate look stale and
// force needless rebuilds of the entire artwork lane.
const previousReport = fs.existsSync(publicReportPath) ? readJson(publicReportPath) : null;
const comparableReport = (value) => {
  if (!value || typeof value !== "object") return null;
  const {generatedAt: _generatedAt, ...rest} = value;
  return stableJson(rest);
};
const generatedAt = previousReport && comparableReport(previousReport) === comparableReport(reportBase)
  ? previousReport.generatedAt
  : new Date().toISOString();
const report = {...reportBase, generatedAt};
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
fs.writeFileSync(reportPath, stableJson(report));
fs.writeFileSync(publicReportPath, stableJson(report));
console.log(JSON.stringify({status: report.status, summary: report.summary, flaggedBeatIds: riskyItems.map((item) => item.beatId), failures, nextAction: report.nextAction}, null, 2));
