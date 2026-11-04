#!/usr/bin/env node
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-visual-redirection-v1";
const artifactReportPath = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId, "report.json");
const publicReportPath = path.join(root, "apps/studio-next/public/generated/system-line", phaseId, "report.json");
const currentFilmPath = path.join(root, "apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const componentPath = path.join(root, "remotion-renderer/proof-only/HSeriesVisualRedirectionPreview.tsx");
const publicRoot = path.join(root, "apps/studio-next/public");
const expectedCorrections = ["H03-B04", "H06-B01", "H10-B03", "H11-B01"];

const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const run = (command, args) => {
  try {
    return execFileSync(command, args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024}).trim();
  } catch {
    return "";
  }
};

const report = fs.existsSync(artifactReportPath) ? readJson(artifactReportPath) : null;
const currentFilm = fs.existsSync(currentFilmPath) ? readJson(currentFilmPath) : null;
const currentPropsSha256 = fs.existsSync(propsPath) ? hash(propsPath) : null;
const videoPath = report?.media?.video?.publicUrl ? path.join(publicRoot, report.media.video.publicUrl.replace(/^\//u, "")) : null;
const contactSheetPath = report?.media?.contactSheet?.publicUrl ? path.join(publicRoot, report.media.contactSheet.publicUrl.replace(/^\//u, "")) : null;
const pageHtml = run("curl", ["-fsS", "--max-time", "8", "http://127.0.0.1:4311/system-line-review"]);

const checks = {
  reportExists: Boolean(report),
  artifactPublicParity: Boolean(report && fs.existsSync(publicReportPath) && hash(artifactReportPath) === hash(publicReportPath)),
  contract: report?.contract === "A1HSeriesVisualRedirectionPreview/v1",
  reviewableStatus: report?.status === "PASS_REVIEWABLE" && report?.previewOnly === true && report?.reviewOnly === true,
  outputLocks: report?.rendererAdoptionAllowed === false && report?.fullMp4RenderAllowed === false && report?.finalRenderAllowed === false && report?.resolveExportAllowed === false,
  threeAnchors: report?.anchorStrategy?.count === 3 && report?.anchorStrategy?.anchors?.length === 3,
  twelveKeyStates: report?.anchorStrategy?.keyStateCount === 12 && report?.frameReports?.length === 12,
  fourCorrections: expectedCorrections.every((beatId) => report?.correctedBeatIds?.includes(beatId)) && report?.correctedBeatIds?.length === 4,
  videoExistsAndMatches: Boolean(videoPath && fs.existsSync(videoPath) && hash(videoPath) === report?.media?.video?.sha256),
  contactSheetExistsAndMatches: Boolean(contactSheetPath && fs.existsSync(contactSheetPath) && hash(contactSheetPath) === report?.media?.contactSheet?.sha256),
  mediaContract: report?.media?.video?.width === 960 && report?.media?.video?.height === 540 && Math.abs(Number(report?.media?.video?.durationSec) - 30) <= .08 && Boolean(report?.media?.video?.audioCodec),
  propsStillCurrent: Boolean(report && fs.existsSync(propsPath) && hash(propsPath) === report.sourceBinding?.propsSha256 && currentFilm?.current?.rendererPropsSha256 === report.sourceBinding?.propsSha256),
  componentStillCurrent: Boolean(report && fs.existsSync(componentPath) && hash(componentPath) === report.sourceBinding?.componentSha256),
  currentFilmStillLocked: currentFilm?.state === "CURRENT_PREVIEW_READY" && currentFilm?.finalRenderAllowed === false && currentFilm?.resolveExportAllowed === false && currentFilm?.current?.buildId === report?.sourceBinding?.currentFilmBuildId && currentFilm?.activePreview?.video?.sha256 === report?.sourceBinding?.currentFilmVideoSha256,
  visualDiffObserved: report?.frameReports?.every((item) => item.currentProposedMeanAbsDiff >= 5) === true,
  pageMarkers: Boolean(pageHtml) && [
    "data-a1-visual-redirection-preview=\"pass\"",
    "data-a1-visual-redirection-anchors=\"3\"",
    "data-a1-visual-redirection-key-states=\"12\"",
    "data-a1-visual-redirection-video=\"30s-source-audio\"",
    "data-a1-visual-redirection-contact-sheet=\"12-current-vs-redirected\"",
    "30 秒带原声视觉重定向样片",
  ].every((marker) => pageHtml.includes(marker)),
  pageMediaReachable: Boolean(videoPath && contactSheetPath && run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:4311${report.media.video.publicUrl}`]).includes("200") && run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:4311${report.media.contactSheet.publicUrl}`]).includes("200")),
};

const failures = Object.entries(checks).filter(([, pass]) => pass !== true).map(([id]) => id);
const historicalSourceDetected = Boolean(report?.sourceBinding?.propsSha256 && currentPropsSha256 && report.sourceBinding.propsSha256 !== currentPropsSha256);
const historicalBoundary = Boolean(pageHtml) && pageHtml.includes("历史：三锚点视觉重定向样片，未采用") && pageHtml.includes('data-a1-candidate-adoption="not-adopted"') && pageHtml.includes('data-a1-visual-redirection-preview="pass"');
const staleHistorical = historicalSourceDetected && historicalBoundary;
const audit = {
  contract: "A1HSeriesVisualRedirectionAudit/v1",
  status: staleHistorical ? "STALE_HISTORICAL" : failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  phaseId,
  checks,
  failures: staleHistorical ? [] : failures,
  historicalClassification: {
    sourcePropsMismatch: historicalSourceDetected,
    currentPropsSha256,
    previewSourcePropsSha256: report?.sourceBinding?.propsSha256 || null,
    pageBoundary: historicalBoundary,
    currentFilmMismatch: checks.currentFilmStillLocked !== true,
    reviewOnly: true,
    rendererAdoptionAllowed: false,
    finalRenderAllowed: false,
  },
  sourceReportSha256: report ? hash(artifactReportPath) : null,
  nextAction: staleHistorical ? "keep-out-of-current-review-line" : failures.length ? "repair-visual-redirection-preview" : "await-human-review-before-renderer-adoption",
};
const outputs = [
  path.join(root, ".codex-artifacts/system-progress-system-line/h-series-visual-redirection-audit-v1/report.json"),
  path.join(root, "apps/studio-next/public/generated/system-line/h-series-visual-redirection-audit-v1/report.json"),
];
for (const output of outputs) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(audit, null, 2));
if (failures.length && !staleHistorical) process.exitCode = 2;
