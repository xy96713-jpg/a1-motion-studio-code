#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildA1HSeriesGeneratedArtworkExecutionPlan,
  auditA1HSeriesGeneratedArtworkExecutionPlan,
} from "../apps/studio-next/src/lib/a1-h-series-generated-artwork-execution-plan.mjs";

const root = process.cwd();
const phaseId = "h-series-generated-editorial-artwork-execution-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const decisionPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-decision-v1/report.json");
const repairBriefPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-artwork-repair-brief-v1/report.json");
const reviewLedgerPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/review-decisions.json");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const contactSheetPath = path.join(artifactRoot, "execution-plan-contact-sheet.svg");
const publicContactSheetPath = path.join(publicRoot, "execution-plan-contact-sheet.svg");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const esc = (value = "") => String(value).replace(/[&<>"']/gu, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"})[char]);
const short = (value = "", max = 96) => {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  return Array.from(text).length <= max ? text : `${Array.from(text).slice(0, max - 1).join("")}…`;
};

for (const file of [decisionPath, repairBriefPath]) {
  if (!fs.existsSync(file)) throw new Error(`required-file-missing:${path.relative(root, file)}`);
}
const decision = readJson(decisionPath);
const repairBrief = readJson(repairBriefPath);
const reviewLedger = fs.existsSync(reviewLedgerPath) ? readJson(reviewLedgerPath) : null;
const plan = buildA1HSeriesGeneratedArtworkExecutionPlan({
  decision,
  repairBrief,
  reviewLedger,
  reviewLedgerCandidatePropsSha256: repairBrief.sourceBinding?.candidatePropsSha256 || null,
});
const repairAssetRoot = "apps/studio-next/public/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-repair-v1";
plan.jobs = plan.jobs.map((job) => ({
  ...job,
  output: {
    ...(job.output || {}),
    publicUrl: `/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-repair-v1/${job.beatId}-repair.png`,
    localPath: `${repairAssetRoot}/${job.beatId}-repair.png`,
  },
}));
const audit = auditA1HSeriesGeneratedArtworkExecutionPlan(plan);
const outputProbe = {outputCount: plan.jobs.length, existingOutputCount: 0, existingOutputs: []};
for (const job of plan.jobs) {
  const localPath = job.output?.localPath ? path.join(root, job.output.localPath) : "";
  if (localPath && fs.existsSync(localPath)) {
    outputProbe.existingOutputCount += 1;
    outputProbe.existingOutputs.push(path.relative(root, localPath));
  }
}
const failures = [
  ...audit.failures,
  ...(decision.status === "PASS" ? [] : ["source-decision-not-pass"]),
  ...(repairBrief.status === "READY_FOR_SHOT_REVIEW" ? [] : ["repair-brief-not-ready"]),
  ...(outputProbe.existingOutputCount === 0 ? [] : ["unexpected-existing-generated-output-before-execution"]),
];

function contactSheet() {
  const rows = Math.ceil(plan.jobs.length / 2);
  const width = 1272;
  const height = 180 + rows * 250;
  const tiles = plan.jobs.map((job, index) => {
    const x = 32 + (index % 2) * 620;
    const y = 154 + Math.floor(index / 2) * 250;
    return `<g><rect x="${x}" y="${y}" width="584" height="220" rx="22" fill="#f8f4ea" stroke="#111315" stroke-opacity=".18"/><text x="${x + 20}" y="${y + 34}" class="title">${esc(job.beatId)} · ${esc(job.macroId)} · ${esc(job.promptRole)}</text><text x="${x + 20}" y="${y + 76}" class="main">${esc(job.screenText)}</text><text x="${x + 20}" y="${y + 110}" class="small">repair brief bound · text-free · non-evidence</text><text x="${x + 20}" y="${y + 142}" class="mono">prompt ${esc(job.promptSha256.slice(0, 16))} · review blocked</text><text x="${x + 20}" y="${y + 184}" class="small">no wireframe / no decorative lines / user decision first</text></g>`;
  }).join("\n");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><style>.title{font:850 15px ui-sans-serif,Arial;fill:#111315}.main{font:900 18px ui-sans-serif,Arial;fill:#111315}.small{font:720 12px ui-sans-serif,Arial;fill:#5f5a50}.mono{font:760 11px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#111315}</style><rect width="100%" height="100%" fill="#f3eee2"/><text x="32" y="38" class="title">SYSTEM MATURITY LINE · SHOT-LEVEL ARTWORK EXECUTION PLAN</text><text x="32" y="78" class="main">7 jobs bound to 7 repair briefs — generation still blocked by user review</text><text x="32" y="112" class="mono">jobs ${plan.summary.executionJobCount} · pending ${plan.summary.pendingGenerationCount} · existing outputs ${outputProbe.existingOutputCount} · concurrency ${plan.concurrency}</text>${tiles}</svg>`;
}

fs.mkdirSync(path.join(artifactRoot, "prompts"), {recursive: true});
fs.mkdirSync(path.join(publicRoot, "prompts"), {recursive: true});
for (const job of plan.jobs) {
  const prompt = `${job.promptText}\n`;
  fs.writeFileSync(path.join(root, job.promptArtifactPath), prompt);
  fs.writeFileSync(path.join(publicRoot, "prompts", path.basename(job.promptArtifactPath)), prompt);
}
const svg = contactSheet();
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
fs.writeFileSync(contactSheetPath, svg);
fs.writeFileSync(publicContactSheetPath, svg);
const report = {
  ...plan,
  status: failures.length ? "FAIL" : plan.generationDispatchAllowed ? "READY_FOR_GENERATION" : "WAITING_FOR_USER_VISUAL_DECISIONS",
  source: {
    decisionPath: path.relative(root, decisionPath),
    decisionSha256: sha256File(decisionPath),
    repairBriefPath: path.relative(root, repairBriefPath),
    repairBriefSha256: sha256File(repairBriefPath),
    reviewLedgerPath: fs.existsSync(reviewLedgerPath) ? path.relative(root, reviewLedgerPath) : null,
    reviewLedgerSha256: fs.existsSync(reviewLedgerPath) ? sha256File(reviewLedgerPath) : null,
  },
  outputProbe,
  promptFiles: plan.jobs.map((job) => ({beatId: job.beatId, artifactPath: job.promptArtifactPath, publicPath: job.promptPublicPath, sha256: job.promptSha256})),
  contactSheet: {path: path.relative(root, contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/execution-plan-contact-sheet.svg`, width: 1272, height: 180 + Math.ceil(plan.jobs.length / 2) * 250},
  failures,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, summary: report.summary, selected: report.jobs.map((job) => job.beatId), failures: report.failures, nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 2;
