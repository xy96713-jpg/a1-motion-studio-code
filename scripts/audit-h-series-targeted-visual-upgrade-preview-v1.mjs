#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-targeted-visual-upgrade-preview-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const renderReportPath = path.join(artifactRoot, "report.json");
const renderReportPublicPath = path.join(publicRoot, "report.json");
const manifestPath = path.join(publicRoot, "web-review-manifest.json");
const auditRoot = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-targeted-visual-upgrade-preview-audit-v1");
const auditPublicRoot = path.join(root, "apps/studio-next/public/generated/system-line/h-series-targeted-visual-upgrade-preview-audit-v1");
const auditPath = path.join(auditRoot, "report.json");
const auditPublicPath = path.join(auditPublicRoot, "report.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const v2ManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v2-candidate/web-review-manifest.json");

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const rel = (file) => path.relative(root, file);

fs.mkdirSync(auditRoot, {recursive: true});
fs.mkdirSync(auditPublicRoot, {recursive: true});

const failures = [];
for (const required of [renderReportPath, renderReportPublicPath, manifestPath, propsPath, v2ManifestPath]) {
  if (!fs.existsSync(required)) failures.push(`required-file-missing:${rel(required)}`);
}

const report = fs.existsSync(renderReportPath) ? readJson(renderReportPath) : {};
const publicReport = fs.existsSync(renderReportPublicPath) ? readJson(renderReportPublicPath) : {};
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
const props = fs.existsSync(propsPath) ? readJson(propsPath) : {};
const v2Manifest = fs.existsSync(v2ManifestPath) ? readJson(v2ManifestPath) : {};

const videoFile = report.media?.video?.publicUrl ? path.join(root, "apps/studio-next/public", report.media.video.publicUrl.replace(/^\//u, "")) : "";
const contactSheetFile = report.media?.contactSheet?.publicUrl ? path.join(root, "apps/studio-next/public", report.media.contactSheet.publicUrl.replace(/^\//u, "")) : "";
const v2VideoFile = v2Manifest.video?.url ? path.join(root, "apps/studio-next/public", v2Manifest.video.url.replace(/^\//u, "")) : "";
const targetIds = ["H03-B02", "H03-B03", "H05-B03", "H10-B04", "H11-B03"];
const propsText = fs.existsSync(propsPath) ? fs.readFileSync(propsPath, "utf8") : "";
const generatedAssetNames = Array.isArray(report.targetReports) ? report.targetReports.map((target) => path.basename(target.remotionPublicPath || "")) : [];
const propsContainsGeneratedAssets = generatedAssetNames.filter(Boolean).some((name) => propsText.includes(name));

const checks = {
  renderReportPass: report.contract === "A1HSeriesTargetedVisualUpgradePreview/v1" && report.status === "PASS_REVIEWABLE",
  publicReportIdentical: fs.existsSync(renderReportPath) && fs.existsSync(renderReportPublicPath) && sha256(renderReportPath) === sha256(renderReportPublicPath),
  manifestMatchesReport: manifest.contract === "A1HSeriesTargetedVisualUpgradePreviewWebManifest/v1" && manifest.status === report.status && manifest.video?.sha256 === report.media?.video?.sha256,
  fiveTargetsSelected: JSON.stringify(report.targetBeatIds || []) === JSON.stringify(targetIds),
  propsContainTargetScenes: Array.isArray(props.scenes) && targetIds.every((id) => props.scenes.some((scene) => scene.beatId === id)),
  generatedArtworkCopiedIntoPreview: Array.isArray(report.targetReports) && report.targetReports.length === 5 && report.targetReports.every((target) => target.adoptedIntoPreview === true && target.adoptedIntoMainFilm === false && target.sourceSha256 === target.copiedSha256),
  generatedArtworkNotMutatedIntoMainProps: propsContainsGeneratedAssets === false,
  videoExistsAndMatches: Boolean(videoFile && fs.existsSync(videoFile) && sha256(videoFile) === report.media?.video?.sha256 && report.media.video.width === 960 && report.media.video.height === 540 && Math.abs(report.media.video.durationSec - 30) <= .35),
  contactSheetExistsAndMatches: Boolean(contactSheetFile && fs.existsSync(contactSheetFile) && sha256(contactSheetFile) === report.media?.contactSheet?.sha256),
  samplesCoverFiveTargets: Array.isArray(report.samples) && report.samples.length === 5 && targetIds.every((id) => report.samples.some((sample) => sample.beatId === id)),
  visualVariationPresent: Array.isArray(report.sampleDiffs) && report.sampleDiffs.length === 4 && Math.min(...report.sampleDiffs) >= 2.5,
  v2MainFilmPreserved: Boolean(v2VideoFile && fs.existsSync(v2VideoFile) && sha256(v2VideoFile) === v2Manifest.video?.sha256),
  locksRemainClosed: report.finalRenderAllowed === false && report.resolveExportAllowed === false && report.rendererAdoptionAllowed === false && manifest.finalRenderAllowed === false && manifest.resolveExportAllowed === false,
};

for (const [id, passed] of Object.entries(checks)) {
  if (passed !== true) failures.push(id);
}

const audit = {
  contract: "A1HSeriesTargetedVisualUpgradePreviewAudit/v1",
  phaseId: "h-series-targeted-visual-upgrade-preview-audit-v1",
  status: failures.length ? "BLOCKED" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  previewOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  rendererAdoptionAllowed: false,
  targetBeatIds: targetIds,
  proof: {
    selectedFiveShots: checks.fiveTargetsSelected,
    generatedArtworkIntegratedIntoPreview: checks.generatedArtworkCopiedIntoPreview,
    generatedArtworkNotMutatedIntoMainProps: checks.generatedArtworkNotMutatedIntoMainProps,
    premiumTextMotionImplementedInPreview: report.fiveStepCoverage?.premiumTextMotionImplementedInPreview === true,
    beforeAfterClipRendered: checks.videoExistsAndMatches,
    auditAndPublicationReady: failures.length === 0,
  },
  media: {
    video: report.media?.video || null,
    contactSheet: report.media?.contactSheet || null,
  },
  checks,
  failures,
  nextAction: failures.length ? "repair-targeted-visual-upgrade-preview" : "publish-targeted-visual-upgrade-preview-card-on-4311",
};

fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
fs.writeFileSync(auditPublicPath, `${JSON.stringify(audit, null, 2)}\n`);

console.log(JSON.stringify({
  status: audit.status,
  failures,
  reportPath: rel(auditPath),
  publicReportPath: rel(auditPublicPath),
  nextAction: audit.nextAction,
}, null, 2));

if (failures.length) process.exitCode = 2;
