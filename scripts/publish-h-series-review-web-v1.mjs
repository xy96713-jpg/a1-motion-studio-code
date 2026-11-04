#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-540p-review-mp4-v1";
const phaseRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const reportPath = path.join(phaseRoot, "report.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const publicBaseUrl = `/generated/system-line/${phaseId}`;

const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const copyVerified = (source, target, expectedSha256) => {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target);
  const actual = hash(target);
  if (expectedSha256 && actual !== expectedSha256) throw new Error(`published-hash-mismatch:${path.basename(target)}:${actual}:${expectedSha256}`);
  return actual;
};

for (const required of [reportPath, currentPhasePath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

const report = read(reportPath);
const phase = read(currentPhasePath);
if (report.contract !== "A1HSeries540pReviewMp4/v1" || report.status !== "PASS") throw new Error("review-report-not-pass");
const publishablePhaseIds = new Set([
  phaseId,
  "browser-review-h-series-540p-mp4-v1",
  "h-series-mp4-visual-aesthetic-remediation-v1",
  "h-series-entity-motion-frame-proof-v1",
]);
if (!publishablePhaseIds.has(phase.phaseId) || phase.status !== "complete") {
  throw new Error(`current-phase-not-publishable-review-mp4:${phase.phaseId}:${phase.status}`);
}

const reviewVideoSource = path.join(root, report.media.reviewVideo.path);
const contactSheetSource = path.join(root, report.media.contactSheet.path);
for (const required of [reviewVideoSource, contactSheetSource]) {
  if (!fs.existsSync(required)) throw new Error(`review-artifact-missing:${required}`);
}

const reviewVideoFile = "review-960x540-with-source-audio.mp4";
const contactSheetFile = "mp4-sample-contact-sheet.png";
const reportFile = "report.json";
const phaseFile = "current-phase.json";
const reviewVideoSha256 = copyVerified(reviewVideoSource, path.join(publicRoot, reviewVideoFile), report.media.reviewVideo.sha256);
const contactSheetSha256 = copyVerified(contactSheetSource, path.join(publicRoot, contactSheetFile), report.media.contactSheet.sha256);
const reportSha256 = copyVerified(reportPath, path.join(publicRoot, reportFile));
const phaseSha256 = copyVerified(currentPhasePath, path.join(publicRoot, phaseFile));

const manifest = {
  contract: "A1SystemLineReviewWebManifest/v1",
  status: "current-reviewable",
  reviewOnly: true,
  finalRenderAllowed: false,
  generatedAt: new Date().toISOString(),
  phaseId,
  worktree: phase.workspaceIsolation.worktree,
  branch: phase.workspaceIsolation.branch,
  frontendPort: phase.workspaceIsolation.frontendPort,
  visualMasterId: phase.visualMaster.id,
  compositionId: report.compositionId,
  publicBaseUrl,
  video: {
    url: `${publicBaseUrl}/${reviewVideoFile}`,
    sha256: reviewVideoSha256,
    bytes: report.media.reviewVideo.bytes,
    width: report.media.reviewVideo.width,
    height: report.media.reviewVideo.height,
    fps: report.media.reviewVideo.fps,
    durationSec: report.media.reviewVideo.durationSec,
    audioCodec: report.media.reviewVideo.audioCodec,
    audioChannels: report.media.reviewVideo.audioChannels,
  },
  contactSheet: {
    url: `${publicBaseUrl}/${contactSheetFile}`,
    sha256: contactSheetSha256,
    width: report.media.contactSheet.width,
    height: report.media.contactSheet.height,
  },
  sourceAudio: report.media.sourceAudio,
  tailHandling: {
    tailPadSec: report.renderProfile.tailPadSec,
    method: "freeze-frame-tail-pad",
  },
  checks: report.checks,
  sampleDiffs: report.sampleDiffs,
  samples: report.samples,
  sourceBinding: report.sourceBinding,
  publicArtifacts: {
    report: {url: `${publicBaseUrl}/${reportFile}`, sha256: reportSha256},
    currentPhase: {url: `${publicBaseUrl}/${phaseFile}`, sha256: phaseSha256},
  },
  nextAction: "browser-review-h-series-540p-mp4-v1",
};

const manifestPath = path.join(publicRoot, "web-review-manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  manifestPath,
  manifestUrl: `${publicBaseUrl}/web-review-manifest.json`,
  videoUrl: manifest.video.url,
  contactSheetUrl: manifest.contactSheet.url,
  status: manifest.status,
  checks: manifest.checks,
}, null, 2));
