#!/usr/bin/env node
/**
 * Build the current A1 system flow contract.
 *
 * This is the single readout for the SRT -> semantic storyboard -> stills ->
 * review -> material generation/import -> renderer adoption -> review render
 * loop. It refreshes non-destructive gates, records hash alignment, and writes a
 * contract plus a compact markdown report. It does not mutate renderer props.
 */
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "a1-system-flow-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const reportMdPath = path.join(artifactRoot, "report.md");
const publicReportPath = path.join(publicRoot, "report.json");
const publicReportMdPath = path.join(publicRoot, "report.md");

const paths = {
  storyboardProps: path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json"),
  storyboardManifest: path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json"),
  rendererProps: path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"),
  pipelineManifest: path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-pipeline-v1/manifest.json"),
  pipelinePublicManifest: path.join(root, "apps/studio-next/public/generated/system-line/storyboard-pipeline-v1/manifest.json"),
  webGptBridgeManifest: path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-webgpt-artwork-bridge-v1/manifest.json"),
  webGptImportReport: path.join(root, ".codex-artifacts/system-progress-system-line/storyboard-webgpt-artwork-import-v1/report.json"),
  stillsReport: path.join(root, "apps/studio-next/public/generated/system-line/storyboard-current-stills-v1/report.json"),
  semanticAudit: path.join(root, "apps/studio-next/public/generated/system-line/storyboard-semantic-audit-v1/report.json"),
  qualityGate: path.join(root, "apps/studio-next/public/generated/system-line/storyboard-quality-gate-v1/report.json"),
  firstRenderGate: path.join(root, "apps/studio-next/public/generated/system-line/storyboard-first-render-gate-v1/report.json"),
  reviewMp4Report: path.join(root, ".codex-artifacts/system-progress-system-line/h-series-540p-review-mp4-v1/report.json"),
  closedLoop: path.join(root, "apps/studio-next/public/generated/system-line/system-line-closed-loop-v1/report.json"),
  productionSopContract: path.join(root, ".codex-artifacts/system-progress-system-line/h-series-director-candidate-v1/production-sop-contract.json"),
  productionSopPublicContract: path.join(root, "apps/studio-next/public/generated/system-line/h-series-director-candidate-v1/production-sop-contract.json"),
  projectStoryboardContract: path.join(root, "apps/studio-next/public/generated/system-line/project-storyboard-contract-v1/contract.json"),
};

function rel(filePath) {
  return path.relative(root, filePath);
}

function exists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

function readJson(filePath) {
  return exists(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function sha256File(filePath) {
  return exists(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function writeBoth(relativePath, value) {
  for (const base of [artifactRoot, publicRoot]) {
    const filePath = path.join(base, relativePath);
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, value, "utf8");
  }
}

function safeJsonFromStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return null;
  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function runGate(id, commandArgs) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = spawnSync("node", commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    id,
    command: `node ${commandArgs.join(" ")}`,
    exitCode: result.status,
    status: result.status === 0 ? "PASS_OR_REPORT_ONLY" : "NONZERO_REVIEW",
    parsed: safeJsonFromStdout(result.stdout),
    stdoutTail: String(result.stdout || "").slice(-4000),
    stderrTail: String(result.stderr || "").slice(-4000),
    startedAt,
    completedAt: new Date().toISOString(),
    wallClockMs: Date.now() - startedMs,
  };
}

const refreshedGates = [
  runGate("project-storyboard-contract", ["scripts/build-project-storyboard-contract-v1.mjs"]),
  runGate("semantic-audit", ["scripts/audit-storyboard-semantic-v1.mjs"]),
  runGate("quality-gate", ["scripts/audit-storyboard-quality-gate-v1.mjs"]),
  runGate("first-render-gate", ["scripts/audit-storyboard-first-render-gate-v1.mjs"]),
  runGate("pipeline-audit", ["scripts/audit-storyboard-pipeline-v1.mjs"]),
  runGate("webgpt-bridge-audit", ["scripts/audit-storyboard-webgpt-artwork-bridge-v1.mjs"]),
  runGate("closed-loop-audit", ["scripts/audit-system-line-closed-loop-v1.mjs"]),
];

const storyboardProps = readJson(paths.storyboardProps);
const storyboardManifest = readJson(paths.storyboardManifest);
const rendererProps = readJson(paths.rendererProps);
const pipelineManifest = readJson(paths.pipelineManifest);
const pipelinePublicManifest = readJson(paths.pipelinePublicManifest);
const webGptBridgeManifest = readJson(paths.webGptBridgeManifest);
const webGptImportReport = readJson(paths.webGptImportReport);
const stillsReport = readJson(paths.stillsReport);
const semanticAudit = readJson(paths.semanticAudit);
const qualityGate = readJson(paths.qualityGate);
const firstRenderGate = readJson(paths.firstRenderGate);
const reviewMp4Report = readJson(paths.reviewMp4Report);
const closedLoop = readJson(paths.closedLoop);
const productionSopContract = readJson(paths.productionSopContract);
const productionSopPublicContract = readJson(paths.productionSopPublicContract);
const projectStoryboardContract = readJson(paths.projectStoryboardContract);

const storyboardPropsSha256 = sha256File(paths.storyboardProps);
const storyboardManifestSha256 = sha256File(paths.storyboardManifest);
const rendererPropsSha256 = sha256File(paths.rendererProps);
const pipelineManifestSha256 = sha256File(paths.pipelineManifest);
const pipelinePublicManifestSha256 = sha256File(paths.pipelinePublicManifest);
const productionSopContractSha256 = sha256File(paths.productionSopContract);
const productionSopPublicContractSha256 = sha256File(paths.productionSopPublicContract);
const projectStoryboardContractSha256 = sha256File(paths.projectStoryboardContract);

const storyboardScenes = Array.isArray(storyboardProps?.scenes) ? storyboardProps.scenes : [];
const rendererScenes = Array.isArray(rendererProps?.scenes) ? rendererProps.scenes : [];
const storyboardHashMatchesRenderer = storyboardPropsSha256 && storyboardPropsSha256 === rendererPropsSha256;
const storyboardHashMatchesPipeline = storyboardPropsSha256 && storyboardPropsSha256 === pipelineManifest?.outputs?.activePropsSha256;
const storyboardHashMatchesWebGptImport = storyboardPropsSha256 && storyboardPropsSha256 === webGptImportReport?.source?.afterStoryboardPropsSha256;
const productionSopParity = productionSopContractSha256 && productionSopContractSha256 === productionSopPublicContractSha256;

const qualityBlockers = qualityGate?.summary?.blockerSceneCount || 0;
const qualityRisks = qualityGate?.summary?.reviewRiskSceneCount || 0;
const semanticPass = semanticAudit?.status === "PASS";
const stillsPass = stillsReport?.status === "PASS" && Number(stillsReport?.missingCount || 0) === 0;
const qualityPass = ["PASS", "PASS_WITH_REVIEW_RISKS"].includes(qualityGate?.status);
const firstRenderAllowed = firstRenderGate?.policy?.fullMp4RenderAllowed === true;
const firstRenderPendingApproval = firstRenderGate?.status === "ACTIVE_PENDING_STORYBOARD_APPROVAL";
const reviewVideo = reviewMp4Report?.video || reviewMp4Report?.media?.reviewVideo || null;
const reviewContactSheet = reviewMp4Report?.contactSheet || reviewMp4Report?.media?.contactSheet || null;
const reviewMp4Pass = reviewMp4Report?.status === "PASS" && reviewVideo?.sha256;
const closedLoopPass = closedLoop?.status === "PASS";
const pipelinePass = refreshedGates.find((gate) => gate.id === "pipeline-audit")?.parsed?.status === "PASS";
const webGptBridgePass = ["PASS", "PASS_READY_FOR_GENERATION"].includes(refreshedGates.find((gate) => gate.id === "webgpt-bridge-audit")?.parsed?.status);

const shotStatusCounts = {
  total: storyboardScenes.length,
  typeOnly: 0,
  needsGeneratedArtwork: 0,
  generationQueued: 0,
  generated: 0,
  imported: 0,
  adopted: 0,
  rejected: 0,
  unknown: 0,
};
for (const scene of storyboardScenes) {
  const artworkStatus = scene.storyboard?.artworkStatus;
  const hasArtwork = Boolean(scene.storyboard?.artworkFile || scene.storyboard?.sourcedArtworkFile);
  if (artworkStatus === "adopted") shotStatusCounts.adopted += 1;
  else if (artworkStatus === "rejected") shotStatusCounts.rejected += 1;
  else if (artworkStatus === "generated") shotStatusCounts.generated += 1;
  else if (artworkStatus === "imported" || artworkStatus === "pending-visual-review") shotStatusCounts.imported += 1;
  else if (artworkStatus === "generation-queued") shotStatusCounts.generationQueued += 1;
  else if (scene.storyboard?.visualSource === "generate" && !hasArtwork) shotStatusCounts.needsGeneratedArtwork += 1;
  else if (scene.storyboard?.visualSource === "type") shotStatusCounts.typeOnly += 1;
  else shotStatusCounts.unknown += 1;
}

const blockers = [];
const warnings = [];
function blocker(id, detail) {
  blockers.push({id, detail});
}
function warning(id, detail) {
  warnings.push({id, detail});
}

if (!semanticPass) blocker("semantic-audit-not-pass", semanticAudit?.summary || semanticAudit?.status || "missing");
if (!stillsPass) blocker("stills-not-complete", stillsReport || "missing");
if (!qualityPass) blocker("quality-gate-not-pass", qualityGate?.summary || qualityGate?.status || "missing");
if (!storyboardHashMatchesPipeline) blocker("storyboard-current-not-bound-to-pipeline-manifest", {
  storyboardPropsSha256,
  pipelineActivePropsSha256: pipelineManifest?.outputs?.activePropsSha256 || null,
});
if (!storyboardHashMatchesRenderer) blocker("storyboard-current-not-adopted-by-renderer-source-props", {
  storyboardPropsSha256,
  rendererPropsSha256,
  storyboardSceneCount: storyboardScenes.length,
  rendererSceneCount: rendererScenes.length,
});
if (!pipelinePass) blocker("storyboard-pipeline-audit-not-pass", refreshedGates.find((gate) => gate.id === "pipeline-audit")?.parsed?.failures || null);
if (!webGptBridgePass) warning("webgpt-import-not-visible-in-current-storyboard", {
  storyboardPropsSha256,
  webGptImportAfterStoryboardPropsSha256: webGptImportReport?.source?.afterStoryboardPropsSha256 || null,
  importedCount: webGptImportReport?.importedCount || webGptImportReport?.import?.importedCount || null,
});
if (!firstRenderAllowed && !firstRenderPendingApproval) blocker("first-render-gate-not-open", firstRenderGate?.nextAction || firstRenderGate?.status || "missing");
if (!closedLoopPass) {
  const closedLoopFailures = Array.isArray(closedLoop?.failures) ? closedLoop.failures : [];
  const currentReviewLoopOnly = closedLoopFailures.length > 0 && closedLoopFailures.every((item) => {
    if ([
      "v2-candidate-uses-current-source-props",
      "generated-artwork-adoption-applied",
    ].includes(item.id)) return true;
    if (item.id === "inherited-baseline-pass" && item.detail?.status === "PASS") return true;
    if ([
      "video-sha-matches-manifest-and-phase",
      "http-storyboard-first-render-gate-markers",
    ].includes(item.id)) return Boolean((firstRenderAllowed && reviewMp4Pass) || firstRenderPendingApproval);
    return false;
  });
  if (currentReviewLoopOnly) {
    warning("legacy-closed-loop-state-not-current-review-loop", {
      currentReviewMp4: reviewMp4Report ? {
        path: reviewVideo?.path || null,
        sha256: reviewVideo?.sha256 || null,
        durationSec: reviewVideo?.durationSec || null,
      } : null,
      legacyFailures: closedLoopFailures,
    });
  } else {
    blocker("system-line-closed-loop-not-pass", closedLoop?.failures || closedLoop?.status || "missing");
  }
}
if (productionSopContractSha256 && !productionSopParity) warning("production-sop-contract-public-private-mismatch", {
  private: productionSopContractSha256,
  public: productionSopPublicContractSha256,
});
if (!productionSopContractSha256) warning("production-sop-contract-missing", rel(paths.productionSopContract));

const recommendedPrimaryAuthority = storyboardProps?.sourceTimeline?.kind === "srt"
  ? "project-storyboard-contract"
  : "renderer-source-props";

const nextActions = [];
if (qualityBlockers > 0) {
  nextActions.push({
    id: "repair-storyboard-hold-frame-density",
    priority: 1,
    reason: `${qualityBlockers} quality blockers, currently dominated by blank hold frames`,
    commandHint: "repair renderer/still hold frame for blank typographic and operation scenes, then npm run render:storyboard-current-stills -- --props apps/studio-next/public/generated/storyboard/current/storyboard-props.json --force && npm run audit:storyboard-quality-gate",
  });
}
if (qualityRisks > 0) {
  nextActions.push({
    id: "resolve-or-accept-read-time-risks",
    priority: 2,
    reason: `${qualityRisks} scenes have tight read time`,
    commandHint: "split/retime only the flagged scenes or mark them as human-review risks after visual pass",
  });
}
if (!storyboardHashMatchesPipeline) {
  nextActions.push({
    id: "rebuild-storyboard-pipeline-manifest-for-current-srt-storyboard",
    priority: 3,
    reason: "pipeline manifest still points at a different active props hash",
    commandHint: "run or patch pipeline so activePropsSha256 equals current storyboard props hash without mutating renderer props",
  });
}
if (!storyboardHashMatchesWebGptImport && webGptImportReport) {
  nextActions.push({
    id: "rebuild-artwork-queue-against-current-storyboard-hash",
    priority: 4,
    reason: "imported WebGPT assets belong to an older storyboard hash",
    commandHint: "re-run workflow:storyboard-webgpt:prepare/finalize or API image queue only after current storyboard hash is stable",
  });
}
if (firstRenderPendingApproval) {
  nextActions.push({
    id: "await-storyboard-approval-for-540p-review",
    priority: 5,
    reason: "all structural storyboard gates are clear; full MP4 refresh still requires explicit approval bound to current hash",
    commandHint: "npm run approve:storyboard-for-540p-review-render, then render the next 540p review MP4",
  });
}
if (!storyboardHashMatchesRenderer) {
  nextActions.push({
    id: "plan-explicit-renderer-adoption-after-quality-pass",
    priority: 5,
    reason: "current 50-scene SRT storyboard is not the renderer authority yet",
    commandHint: "only after quality PASS and explicit user approval, adopt current storyboard props into renderer source props or teach renderer to read the storyboard-current authority",
  });
}

const reportStatus = blockers.length
  ? "BLOCKED"
  : firstRenderPendingApproval
    ? qualityRisks > 0
      ? "READY_FOR_STORYBOARD_APPROVAL_WITH_REVIEW_RISKS"
      : "READY_FOR_STORYBOARD_APPROVAL"
    : qualityRisks > 0
      ? "PASS_WITH_REVIEW_RISKS"
      : "PASS";

const report = {
  contract: "A1SystemFlowContract/v1",
  status: reportStatus,
  generatedAt: new Date().toISOString(),
  authority: {
    recommendedPrimaryAuthority,
    rendererAdoptionAllowedNow: Boolean(storyboardHashMatchesRenderer && qualityPass && pipelinePass),
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    rationale: firstRenderPendingApproval
      ? "Current SRT storyboard is aligned with renderer and pipeline; only explicit storyboard approval is pending before the next 540p review MP4."
      : blockers.length
        ? "Current SRT storyboard is the best product/source truth, but structural gates are not fully closed."
        : "Current SRT storyboard, renderer props, and review-render loop are aligned; remaining issues are review risks or downstream material/final-delivery refresh tasks.",
  },
  hashes: {
    projectStoryboardContract: {path: rel(paths.projectStoryboardContract), sha256: projectStoryboardContractSha256, shotCount: projectStoryboardContract?.summary?.shotCount || null, fixedShotCount: projectStoryboardContract?.project?.currentInstance?.fixedShotCount ?? null},
    storyboardProps: {path: rel(paths.storyboardProps), sha256: storyboardPropsSha256, sceneCount: storyboardScenes.length},
    storyboardManifest: {path: rel(paths.storyboardManifest), sha256: storyboardManifestSha256},
    rendererProps: {path: rel(paths.rendererProps), sha256: rendererPropsSha256, sceneCount: rendererScenes.length},
    pipelineManifest: {path: rel(paths.pipelineManifest), sha256: pipelineManifestSha256, activePropsSha256: pipelineManifest?.outputs?.activePropsSha256 || null},
    pipelinePublicManifest: {path: rel(paths.pipelinePublicManifest), sha256: pipelinePublicManifestSha256},
    webGptImport: {path: rel(paths.webGptImportReport), afterStoryboardPropsSha256: webGptImportReport?.source?.afterStoryboardPropsSha256 || null},
    reviewMp4: reviewMp4Report ? {path: rel(paths.reviewMp4Report), videoSha256: reviewVideo?.sha256 || null, status: reviewMp4Report.status || null} : null,
    productionSopContract: {path: rel(paths.productionSopContract), sha256: productionSopContractSha256, publicSha256: productionSopPublicContractSha256, parity: Boolean(productionSopParity)},
  },
  alignment: {
    storyboardHashMatchesRenderer,
    storyboardHashMatchesPipeline,
    storyboardHashMatchesWebGptImport,
    pipelinePublicPrivateParity: Boolean(pipelineManifestSha256 && pipelineManifestSha256 === pipelinePublicManifestSha256),
    productionSopPublicPrivateParity: Boolean(productionSopParity),
  },
  gates: {
    projectStoryboardContract: {status: refreshedGates.find((gate) => gate.id === "project-storyboard-contract")?.parsed?.status || null, contract: refreshedGates.find((gate) => gate.id === "project-storyboard-contract")?.parsed?.contract || null},
    semantic: {status: semanticAudit?.status || null, summary: semanticAudit?.summary || null},
    stills: {status: stillsReport?.status || null, sceneCount: stillsReport?.sceneCount || null, renderedCount: stillsReport?.renderedCount || null, missingCount: stillsReport?.missingCount || null},
    quality: {status: qualityGate?.status || null, summary: qualityGate?.summary || null, nextAction: qualityGate?.nextAction || null},
    firstRender: {status: firstRenderGate?.status || null, fullMp4RenderAllowed: firstRenderAllowed, blockers: firstRenderGate?.blockers || null, nextAction: firstRenderGate?.nextAction || null},
    reviewMp4: reviewMp4Report ? {status: reviewMp4Report.status || null, video: reviewVideo, contactSheet: reviewContactSheet, checks: reviewMp4Report.checks || null, failures: reviewMp4Report.failures || []} : null,
    pipeline: {status: refreshedGates.find((gate) => gate.id === "pipeline-audit")?.parsed?.status || null, failures: refreshedGates.find((gate) => gate.id === "pipeline-audit")?.parsed?.failures || []},
    webGptBridge: {status: refreshedGates.find((gate) => gate.id === "webgpt-bridge-audit")?.parsed?.status || null, failures: refreshedGates.find((gate) => gate.id === "webgpt-bridge-audit")?.parsed?.failures || []},
    closedLoop: {status: closedLoop?.status || null, failures: closedLoop?.failures || [], nextAction: closedLoop?.nextAction || null},
  },
  materialLifecycle: {
    shotStatusCounts,
    webGptBridge: webGptBridgeManifest ? {
      jobCount: webGptBridgeManifest.jobCount || webGptBridgeManifest.jobs?.length || null,
      path: rel(paths.webGptBridgeManifest),
    } : null,
    webGptImport: webGptImportReport ? {
      status: webGptImportReport.status || null,
      importedCount: webGptImportReport.importedCount || webGptImportReport.import?.importedCount || null,
      missingCount: webGptImportReport.missingCount || webGptImportReport.import?.missingCount || null,
    } : null,
  },
  refreshedGates,
  blockers,
  warnings,
  nextActions,
};

const md = [
  "# A1 System Flow Contract v1",
  "",
  `Status: ${report.status}`,
  `Generated: ${report.generatedAt}`,
  "",
  "## Authority",
  "",
  `- Recommended primary authority: ${recommendedPrimaryAuthority}`,
  `- Project storyboard contract: ${projectStoryboardContractSha256 || "missing"}`,
  `- Renderer adoption allowed now: ${report.authority.rendererAdoptionAllowedNow}`,
  `- Final render allowed: ${report.authority.finalRenderAllowed}`,
  "",
  "## Hash alignment",
  "",
  `- Storyboard props: ${storyboardPropsSha256} (${storyboardScenes.length} scenes)`,
  `- Renderer props: ${rendererPropsSha256} (${rendererScenes.length} scenes)`,
  `- Pipeline active props: ${pipelineManifest?.outputs?.activePropsSha256 || "missing"}`,
  `- WebGPT import storyboard props: ${webGptImportReport?.source?.afterStoryboardPropsSha256 || "missing"}`,
  "",
  "## Gates",
  "",
  `- Semantic: ${semanticAudit?.status || "missing"}`,
  `- Stills: ${stillsReport?.status || "missing"} (${stillsReport?.renderedCount || 0}/${stillsReport?.sceneCount || 0}, missing ${stillsReport?.missingCount ?? "?"})`,
  `- Quality: ${qualityGate?.status || "missing"} (${qualityBlockers} blockers, ${qualityRisks} review risks)`,
  `- First render: ${firstRenderGate?.status || "missing"} (fullMp4RenderAllowed=${firstRenderAllowed})`,
  `- Review MP4: ${reviewMp4Report?.status || "missing"} (${reviewVideo?.path || "missing"})`,
  `- Pipeline audit: ${report.gates.pipeline.status || "missing"}`,
  `- WebGPT bridge audit: ${report.gates.webGptBridge.status || "missing"}`,
  `- Closed loop: ${closedLoop?.status || "missing"}`,
  "",
  "## Blockers",
  "",
  ...(blockers.length ? blockers.map((item) => `- ${item.id}: ${JSON.stringify(item.detail)}`) : ["- none"]),
  "",
  "## Warnings",
  "",
  ...(warnings.length ? warnings.map((item) => `- ${item.id}: ${JSON.stringify(item.detail)}`) : ["- none"]),
  "",
  "## Next actions",
  "",
  ...(nextActions.length ? nextActions.map((item) => `${item.priority}. ${item.id} - ${item.reason}`) : ["- none"]),
  "",
].join("\n");

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
const json = `${JSON.stringify(report, null, 2)}\n`;
fs.writeFileSync(reportPath, json, "utf8");
fs.writeFileSync(publicReportPath, json, "utf8");
fs.writeFileSync(reportMdPath, md, "utf8");
fs.writeFileSync(publicReportMdPath, md, "utf8");

console.log(JSON.stringify({
  status: report.status,
  authority: report.authority,
  alignment: report.alignment,
  gates: {
    semantic: report.gates.semantic.status,
    stills: report.gates.stills.status,
    quality: report.gates.quality.status,
    firstRender: report.gates.firstRender.status,
    reviewMp4: report.gates.reviewMp4?.status || null,
    pipeline: report.gates.pipeline.status,
    webGptBridge: report.gates.webGptBridge.status,
    closedLoop: report.gates.closedLoop.status,
  },
  blockerCount: blockers.length,
  warningCount: warnings.length,
  nextActions: nextActions.map((item) => item.id),
  reportPath: rel(reportPath),
  publicReportPath: rel(publicReportPath),
  reportMdPath: rel(reportMdPath),
  publicReportMdPath: rel(publicReportMdPath),
}, null, 2));
