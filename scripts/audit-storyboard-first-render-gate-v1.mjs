#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requireApproved = process.argv.includes("--require-approved");

const paths = {
  storyboardManifest: path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json"),
  storyboardProps: path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json"),
  storyboardApproval: path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json"),
  storyboardQualityReport: path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-quality-gate-v1/report.json"),
  storyboardQualityPublicReport: path.join(root, "apps/studio-next/public/generated/system-line/storyboard-quality-gate-v1/report.json"),
  storyboardPage: path.join(root, "apps/studio-next/src/app/storyboard/page.tsx"),
  rendererSourceProps: path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"),
  report: path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-first-render-gate-v1/report.json"),
  publicReport: path.join(root, "apps/studio-next/public/generated/system-line/storyboard-first-render-gate-v1/report.json"),
};

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function existsNonEmpty(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

const failures = [];
const blockers = [];
const warnings = [];
const approvalFailures = [];

function check(id, pass, detail, mode = "blocker") {
  if (pass) return;
  const item = {id, detail};
  failures.push(item);
  if (mode === "warning") warnings.push(item);
  else if (mode === "approval") approvalFailures.push(item);
  else blockers.push(item);
}

const manifest = existsNonEmpty(paths.storyboardManifest) ? readJson(paths.storyboardManifest) : {};
const storyboardProps = existsNonEmpty(paths.storyboardProps) ? readJson(paths.storyboardProps) : {};
const rendererPropsRaw = existsNonEmpty(paths.rendererSourceProps) ? fs.readFileSync(paths.rendererSourceProps, "utf8") : "";
const rendererProps = rendererPropsRaw ? JSON.parse(rendererPropsRaw) : {};
const approval = existsNonEmpty(paths.storyboardApproval) ? readJson(paths.storyboardApproval) : null;
const qualityReport = existsNonEmpty(paths.storyboardQualityReport) ? readJson(paths.storyboardQualityReport) : {};
const pageSource = existsNonEmpty(paths.storyboardPage) ? fs.readFileSync(paths.storyboardPage, "utf8") : "";

const storyboardPropsSha256 = existsNonEmpty(paths.storyboardProps) ? sha256File(paths.storyboardProps) : null;
const rendererSourcePropsSha256 = rendererPropsRaw ? sha256Text(rendererPropsRaw) : null;
const rendererScenes = Array.isArray(rendererProps.scenes) ? rendererProps.scenes : [];
const storyboardScenes = Array.isArray(storyboardProps.scenes) ? storyboardProps.scenes : [];

check("storyboard-manifest-exists", existsNonEmpty(paths.storyboardManifest), rel(paths.storyboardManifest));
check("storyboard-props-exists", existsNonEmpty(paths.storyboardProps), rel(paths.storyboardProps));
check("renderer-source-props-exists", existsNonEmpty(paths.rendererSourceProps), rel(paths.rendererSourceProps));
check("storyboard-manifest-contract", manifest.contract === "A1StoryboardDraftManifest/v1", manifest.contract || "missing");
check("storyboard-is-review-only", manifest.status === "review-only-isolated-draft" && manifest.authority === "storyboard-draft-not-system-line-review", {status: manifest.status, authority: manifest.authority});
check("storyboard-props-sha-bound", storyboardPropsSha256 && manifest.current?.propsSha256 === storyboardPropsSha256, {manifest: manifest.current?.propsSha256 || null, actual: storyboardPropsSha256});
check("storyboard-current-props-bound-to-current-renderer-props", rendererSourcePropsSha256 && storyboardPropsSha256 === rendererSourcePropsSha256, {
  storyboardPropsSha256,
  rendererSource: rendererSourcePropsSha256,
  manifestSource: manifest.source?.sha256 || null,
});
check("storyboard-scene-count-bound", storyboardScenes.length > 0 && storyboardScenes.length === manifest.current?.sceneCount && storyboardScenes.length === rendererScenes.length, {storyboardScenes: storyboardScenes.length, manifestScenes: manifest.current?.sceneCount || null, rendererScenes: rendererScenes.length});
check("storyboard-stills-complete", manifest.assets?.missingStillCount === 0 && manifest.assets?.stillCount >= storyboardScenes.length, {stillCount: manifest.assets?.stillCount ?? null, missingStillCount: manifest.assets?.missingStillCount ?? null, storyboardScenes: storyboardScenes.length});
check("storyboard-quality-report-exists", existsNonEmpty(paths.storyboardQualityReport) && existsNonEmpty(paths.storyboardQualityPublicReport), {artifact: rel(paths.storyboardQualityReport), public: rel(paths.storyboardQualityPublicReport)});
check("storyboard-quality-report-public-parity", existsNonEmpty(paths.storyboardQualityReport) && existsNonEmpty(paths.storyboardQualityPublicReport) && sha256File(paths.storyboardQualityReport) === sha256File(paths.storyboardQualityPublicReport), "quality report artifact/public mismatch");
check("storyboard-quality-cleared-for-current-props", qualityReport.contract === "A1StoryboardQualityGate/v1" && ["PASS", "PASS_WITH_REVIEW_RISKS"].includes(qualityReport.status) && qualityReport.source?.propsSha256 === storyboardPropsSha256 && qualityReport.fullMp4RenderAllowed === false && qualityReport.finalRenderAllowed === false && qualityReport.resolveExportAllowed === false, {
  contract: qualityReport.contract || null,
  status: qualityReport.status || null,
  qualityPropsSha256: qualityReport.source?.propsSha256 || null,
  storyboardPropsSha256,
  summary: qualityReport.summary || null,
});
check("storyboard-page-shows-render-gate", /data-a1-storyboard-first-render-gate/u.test(pageSource) && /data-a1-full-mp4-render-allowed/u.test(pageSource) && /storyboard-approval\.json/u.test(pageSource), rel(paths.storyboardPage));

const approvalMatches = Boolean(
  approval
  && approval.contract === "A1StoryboardApproval/v1"
  && approval.status === "APPROVED_FOR_540P_REVIEW_RENDER"
  && approval.approvalScope === "refresh-next-540p-review-mp4-only"
  && approval.storyboardPropsSha256 === storyboardPropsSha256
  && approval.rendererSourcePropsSha256 === rendererSourcePropsSha256
  && approval.finalRenderAllowed === false
  && approval.resolveExportAllowed === false
);

if (!approvalMatches) {
  check("storyboard-approved-for-next-540p-review-render", false, approval ? {
    contract: approval.contract,
    status: approval.status,
    approvalScope: approval.approvalScope,
    storyboardPropsSha256: approval.storyboardPropsSha256,
    expectedStoryboardPropsSha256: storyboardPropsSha256,
    rendererSourcePropsSha256: approval.rendererSourcePropsSha256,
    expectedRendererSourcePropsSha256: rendererSourcePropsSha256,
  } : "missing storyboard-approval.json", "approval");
}

const structuralBlockers = blockers;
const fullMp4RenderAllowed = structuralBlockers.length === 0 && approvalMatches;
const status = fullMp4RenderAllowed
  ? "PASS_APPROVED_FOR_540P_REVIEW_RENDER"
  : structuralBlockers.length
    ? "BLOCKED_STORYBOARD_NOT_RENDER_READY"
    : "ACTIVE_PENDING_STORYBOARD_APPROVAL";

const report = {
  contract: "A1StoryboardFirstRenderGate/v1",
  status,
  checkedAt: new Date().toISOString(),
  requireApproved,
  policy: {
    storyboardFirst: true,
    noFullMp4RefreshWithoutStoryboardApproval: true,
    fullMp4RenderAllowed,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    approvalFile: rel(paths.storyboardApproval),
    approvalScope: "refresh-next-540p-review-mp4-only",
  },
  storyboard: {
    manifestPath: rel(paths.storyboardManifest),
    propsPath: rel(paths.storyboardProps),
    propsSha256: storyboardPropsSha256,
    sceneCount: storyboardScenes.length,
    stillCount: manifest.assets?.stillCount ?? null,
    missingStillCount: manifest.assets?.missingStillCount ?? null,
  },
  quality: qualityReport.contract ? {
    reportPath: rel(paths.storyboardQualityReport),
    publicReportPath: rel(paths.storyboardQualityPublicReport),
    status: qualityReport.status,
    propsSha256: qualityReport.source?.propsSha256 || null,
    summary: qualityReport.summary || null,
  } : null,
  rendererSource: {
    propsPath: rel(paths.rendererSourceProps),
    propsSha256: rendererSourcePropsSha256,
    sceneCount: rendererScenes.length,
  },
  approval: approval ? {
    contract: approval.contract,
    status: approval.status,
    approvalScope: approval.approvalScope,
    approvedAt: approval.approvedAt,
    storyboardPropsSha256: approval.storyboardPropsSha256,
    rendererSourcePropsSha256: approval.rendererSourcePropsSha256,
  } : null,
  blockers,
  warnings,
  approvalFailures,
  failures,
  nextAction: fullMp4RenderAllowed
    ? "render-next-540p-review-mp4-then-run-automatic-audits"
    : structuralBlockers.length
      ? "refresh-storyboard-draft-and-stills-before-requesting-user-approval"
      : "await-user-storyboard-approval-before-full-mp4-render",
};

for (const outPath of [paths.report, paths.publicReport]) {
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  status: report.status,
  fullMp4RenderAllowed,
  blockers: blockers.map((item) => item.id),
  approvalRequired: !approvalMatches,
  reportPath: rel(paths.report),
  publicReportPath: rel(paths.publicReport),
  nextAction: report.nextAction,
}, null, 2));

if (requireApproved && !fullMp4RenderAllowed) process.exitCode = 2;
