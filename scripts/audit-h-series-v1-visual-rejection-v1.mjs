#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-v1-visual-rejection-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const v1ManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/web-review-manifest.json");
const v1VideoPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/review-960x540-with-source-audio.mp4");
const v1ContactSheetPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/mp4-sample-contact-sheet.png");
const postAdoptionPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-text-motion-post-adoption-source-v1/report.json");

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const failures = [];
for (const required of [v1ManifestPath, v1VideoPath, v1ContactSheetPath, postAdoptionPath]) {
  if (!fs.existsSync(required)) failures.push(`required-file-missing:${path.relative(root, required)}`);
}

const manifest = failures.length ? {} : readJson(v1ManifestPath);
const postAdoption = failures.length ? {} : readJson(postAdoptionPath);
if (!failures.length) {
  if (sha256(v1VideoPath) !== manifest.video?.sha256) failures.push("v1-video-sha-mismatch");
  if (postAdoption.status !== "PASS_WITH_TYPOGRAPHY_REVIEW_RISKS") failures.push("post-adoption-source-audit-not-current");
  if (postAdoption.sourcePropsSha256 === manifest.sourceBinding?.propsSha256) failures.push("v1-manifest-already-uses-post-adoption-props");
}

const report = {
  contract: "A1HSeriesV1VisualRejection/v1",
  phaseId,
  status: failures.length ? "FAIL" : "REJECTED_STALE_VISUAL",
  generatedAt: new Date().toISOString(),
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
  v1Artifact: {
    manifestPath: path.relative(root, v1ManifestPath),
    videoPath: path.relative(root, v1VideoPath),
    videoSha256: fs.existsSync(v1VideoPath) ? sha256(v1VideoPath) : null,
    contactSheetPath: path.relative(root, v1ContactSheetPath),
    contactSheetSha256: fs.existsSync(v1ContactSheetPath) ? sha256(v1ContactSheetPath) : null,
    manifestSourcePropsSha256: manifest.sourceBinding?.propsSha256 || null,
  },
  currentSourceTruth: {
    postAdoptionReportPath: path.relative(root, postAdoptionPath),
    postAdoptionStatus: postAdoption.status || null,
    postAdoptionSourcePropsSha256: postAdoption.sourcePropsSha256 || null,
  },
  objectiveVisualProblems: [
    "v1 MP4 was rendered before the current post-adoption source props",
    "v1 sample frames show excessive background registration lines behind the title field",
    "v1 text hierarchy reads like template title cards instead of deliberate H-series editorial compositions",
    "v1 must be retained only as prior artifact and comparison baseline",
  ],
  locks: {
    doNotOverwriteV1: true,
    v1NotFinalVisual: true,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  },
  failures,
  nextAction: failures.length ? "repair-v1-visual-rejection-report" : "render-h-series-540p-v2-candidate-with-current-source-props",
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  status: report.status,
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  failures,
  nextAction: report.nextAction,
}, null, 2));

if (failures.length) process.exitCode = 2;
