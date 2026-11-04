import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const artifactRoot = path.join(projectRoot, ".codex-artifacts", "system-progress-system-line");
const workspacePath = path.join(artifactRoot, "editorial-asset-workbench-v1", "workspace.json");
const authorityPath = path.join(artifactRoot, "system-line-current-authority-v2", "report.json");
const publicRoot = path.join(projectRoot, "apps", "studio-next", "public", "generated", "system-line", "editorial-asset-workbench-v1");
const executionStatusRoutePath = path.join(projectRoot, "apps", "studio-next", "src", "app", "api", "system-line", "execution-status", "route.ts");
const executionStatusLibraryPath = path.join(projectRoot, "apps", "studio-next", "src", "lib", "a1-execution-status-v1.mjs");
const executionStatusClientPath = path.join(projectRoot, "apps", "studio-next", "src", "app", "system-line-visual-workbench", "VisualAssetWorkbenchClient.tsx");
const workbenchRoutePath = path.join(projectRoot, "apps", "studio-next", "src", "app", "api", "system-line", "editorial-asset-workbench", "route.ts");
const workbenchPagePath = path.join(projectRoot, "apps", "studio-next", "src", "app", "system-line-visual-workbench", "page.tsx");
const criticDir = path.join(artifactRoot, "editorial-asset-workbench-v1", "generated-visual-composite-critic-cache-v2");
const generationWorkerPath = path.join(projectRoot, "scripts/run-editorial-asset-workbench-jobs-v2.mjs");
const runtimeSidecarPath = path.join(artifactRoot, "editorial-asset-workbench-v1/generation-runtime-sidecar.json");
const hotPathStatePath = path.join(publicRoot, "hot-path-state.json");
const outputDir = path.join(artifactRoot, "performance-audit-v1");
const outputPath = path.join(outputDir, "report.json");

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};
const readText = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};
const fileBytes = (filePath) => {
  try { return fs.statSync(filePath).size; } catch { return null; }
};

const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const mean = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const sorted = (values) => [...values].sort((left, right) => left - right);
const percentile = (values, ratio) => {
  const ordered = sorted(values);
  if (!ordered.length) return null;
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * ratio))];
};
const stats = (values) => ({
  count: values.length,
  min: values.length ? Math.min(...values) : null,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: values.length ? Math.max(...values) : null,
  mean: mean(values),
});

const workspace = readJson(workspacePath);
const authority = readJson(authorityPath);
const executionStatusRouteSource = readText(executionStatusRoutePath);
const executionStatusLibrarySource = readText(executionStatusLibraryPath);
const executionStatusClientSource = readText(executionStatusClientPath);
const workbenchRouteSource = readText(workbenchRoutePath);
const workbenchPageSource = readText(workbenchPagePath);
const controlPlaneFiles = {
  currentPhase: path.join(artifactRoot, "current-phase.json"),
  activeRun: path.join(publicRoot, "active-run.json"),
  transitionReceipt: path.join(publicRoot, "transition-receipt.json"),
  hotPathState: hotPathStatePath,
  authorityReport: authorityPath,
};
const workspaceBytes = fileBytes(workspacePath);
const controlPlaneBytes = Object.values(controlPlaneFiles).map(fileBytes).filter((value) => value != null).reduce((sum, value) => sum + value, 0);
const jobs = workspace?.production?.generation?.jobs || [];
const completedJobs = jobs.filter((job) => job.status === "complete" && numeric(job.durationMs) != null);
const generationDurations = completedJobs.map((job) => Number(job.durationMs));
const criticReports = fs.existsSync(criticDir)
  ? fs.readdirSync(criticDir).filter((file) => file.endsWith(".json")).map((file) => readJson(path.join(criticDir, file))).filter(Boolean)
  : [];
const criticDurations = criticReports.map((report) => numeric(report.trace?.durationMs)).filter((value) => value != null);
// Older critic receipts predate the explicit batchHash field but already
// carried the same content-addressed identity as contextHash. Treat that
// legacy field as a valid cache identity instead of flagging historical runs
// as new duplicate-review work.
const criticBatchHashes = criticReports.map((report) => report.trace?.batchHash || report.trace?.contextHash).filter(Boolean);
const distinctCriticBatches = new Set(criticBatchHashes);
const repeatedCriticBatches = criticBatchHashes.length - distinctCriticBatches.size;
const unhashedCriticCount = criticReports.filter((report) => !(report.trace?.batchHash || report.trace?.contextHash)).length;
const automaticPolicy = workspace?.production?.automationPolicy || {};
const packagingReview = workspace?.production?.packagingReview || null;
const autopilot = workspace?.production?.autopilot || {};
const authorityAudit = authority?.productionState || authority?.authority?.productionState || {};
const visualTreatmentAudit = workspace?.production?.authority?.visualTreatmentAudit || {};
const generationWorkerSource = readText(generationWorkerPath);
const runtimeSidecar = readJson(runtimeSidecarPath);
const generationTimeoutPolicyPresent = typeof generationWorkerSource === "string"
  && generationWorkerSource.includes("A1_IMAGE_GENERATION_TIMEOUT_MS")
  && generationWorkerSource.includes("process.kill(-child.pid")
  && generationWorkerSource.includes("detached: true");
const clientSnapshotRoutePresent = workbenchRouteSource.includes('mode !== "bootstrap" && mode !== "client"')
  && workbenchRouteSource.includes("client-bootstrap.json")
  && workbenchRouteSource.includes("snapshotKind");
const serverPageDefersFullWorkspace = workbenchPageSource.includes("initialWorkspace={null}") && !workbenchPageSource.includes("workspace.json");
const summary = workspace?.summary || {};
const findings = [];
const recommendations = [];

if (workspaceBytes != null && workspaceBytes >= 20 * 1024 * 1024 && controlPlaneBytes > 0) {
  recommendations.push("keep execution-status polling on phase/active-run/transition pointers; never parse the full workspace on the heartbeat path");
}

if (completedJobs.length > 0 && Math.max(...generationDurations) > 600_000) {
  findings.push({code: "generation-outlier", severity: generationTimeoutPolicyPresent ? "review" : "block", message: generationTimeoutPolicyPresent ? "历史记录中有超过 10 分钟的生图任务；当前 worker 已具备可配置硬超时、进程组取消和缓存复用。" : "至少一个生图任务超过 10 分钟，必须有硬超时、取消和缓存回收。"});
  recommendations.push(generationTimeoutPolicyPresent ? "keep the bounded timeout policy and quarantine historical outliers from new dispatch metrics" : "generation jobs use a bounded timeout and never retry unchanged prompts automatically");
}
if (criticReports.length > 12 && criticBatchHashes.length > 0 && repeatedCriticBatches > 0) {
  findings.push({code: "critic-duplicate-loop", severity: "block", message: "critic 记录中存在大量重复批次，评审次数没有转化成新的视觉输入。"});
  recommendations.push("one batch critic triage, then one champion recheck; no per-candidate stability loop");
}
if (unhashedCriticCount > 0) {
  findings.push({code: "critic-trace-hash-missing", severity: "review", message: "部分历史 critic 没有 batchHash，无法证明同一输入是否命中缓存。"});
  recommendations.push("persist batchHash, promptHash and image fingerprints for every critic report");
}
if (Number(summary.approvedCount || 0) > Number(summary.shotSlotCount || 0) * 2 && workspace?.gates?.shotCompositionAllowed === false) {
  findings.push({code: "asset-overproduction-before-composition", severity: "review", message: "资产批准数远高于镜头需求，但构图门仍未打开，说明系统在错误阶段消耗时间。"});
  recommendations.push("freeze asset generation while compositorRewriteRequired or visual-treatment average is below 18/24");
}
if (automaticPolicy.automaticCandidateAdmission === true && autopilot.critic?.automaticApprovalAllowed === false) {
  findings.push({code: "automatic-admission-contradiction", severity: "block", message: "候选准入标为自动，但 critic 仍禁止自动批准。"});
  recommendations.push("make one authority predicate own automatic admission: score >= 22, zero hard failures, complete material proof");
}
if (automaticPolicy.intermediateUserApprovalRequired === true || automaticPolicy.calibrationUserApprovalRequired === true) {
  findings.push({code: "intermediate-confirmation-enabled", severity: "review", message: "当前仍要求中间人工确认，与用户要求的高质量自动化不一致。"});
  recommendations.push("keep only final release approval; do not expose per-shot or calibration confirmation when the quality gate passes");
}
if (visualTreatmentAudit.compositorRewriteRequired === true || authority?.nextAction?.id === "visual-treatment-compositor-rewrite-required") {
  findings.push({code: "compositor-is-bottleneck", severity: "block", message: "权威状态已经判定 compositor 是瓶颈，继续生图不会提高视觉质量。"});
  recommendations.push("rewrite treatment compositor topology before dispatching any new image-generation jobs");
}
if (visualTreatmentAudit.status === "UNAVAILABLE"
  || Number(visualTreatmentAudit.unavailableCount || 0) > 0
  || authority?.nextAction?.id === "restore-visual-treatment-critic") {
  findings.push({code: "visual-critic-unavailable", severity: "block", message: "六镜合成已完成，但视觉审片器未返回有效结果；该状态没有视觉分，也不能选冠军或继续生产。"});
  recommendations.push("restore the critic and review the same content-addressed six-board batch; do not regenerate assets");
}

const report = {
  contract: "A1SystemLinePerformanceAudit/v1",
  generatedAt: new Date().toISOString(),
  projectRoot,
  source: {
    workspacePath,
    authorityPath,
      criticDir,
      generationWorkerPath,
    workspaceUpdatedAt: workspace?.updatedAt || null,
    authorityGeneratedAt: authority?.generatedAt || null,
  },
  observed: {
    controlPlane: {
      contract: "A1ExecutionStatus/v1",
      workspaceBytes,
      lightweightStateBytes: controlPlaneBytes,
      workspaceToLightweightRatio: workspaceBytes != null && controlPlaneBytes > 0 ? Number((workspaceBytes / controlPlaneBytes).toFixed(2)) : null,
      executionStatusRoutePresent: executionStatusRouteSource.includes("readCurrentStatus") && executionStatusRouteSource.includes("status: 304") && executionStatusLibrarySource.includes("A1ExecutionStatus/v1"),
      lightweightPollingPresent: executionStatusClientSource.includes("/api/system-line/execution-status") && executionStatusClientSource.includes("pollingRequired"),
      fullWorkspaceRefreshDeferredUntilRevisionChange: executionStatusClientSource.includes("executionRevisionRef") && executionStatusClientSource.includes("refresh();"),
      hotPathStatePresent: fileBytes(hotPathStatePath) != null && fileBytes(hotPathStatePath) < 100 * 1024,
      clientSnapshotRoutePresent,
      serverPageDefersFullWorkspace,
      files: controlPlaneFiles,
    },
    generation: {
      totalJobs: jobs.length,
      completedJobs: completedJobs.length,
      failedJobs: jobs.filter((job) => job.status === "failed").length,
      durationsMs: stats(generationDurations),
    },
    critic: {
      reportCount: criticReports.length,
      distinctBatchCount: distinctCriticBatches.size,
      repeatedBatchCount: repeatedCriticBatches,
      legacyContextHashCount: criticReports.filter((report) => !report.trace?.batchHash && report.trace?.contextHash).length,
      unhashedReportCount: unhashedCriticCount,
      durationsMs: stats(criticDurations),
    },
    production: {
      eventCount: numeric(workspace?.production?.eventLedger?.eventCount),
      workerStatus: workspace?.production?.generation?.workerStatus || null,
      queuedJobs: numeric(summary.queuedJobCount),
      runningJobs: numeric(summary.runningJobCount),
      approvedAssets: numeric(summary.approvedCount),
      assetCount: numeric(summary.assetCount),
      shotSlots: numeric(summary.shotSlotCount),
      shotCompositionAllowed: workspace?.gates?.shotCompositionAllowed ?? null,
      nextAction: workspace?.production?.nextAction || authority?.nextAction?.label || null,
      visualTreatmentAverageScore: numeric(visualTreatmentAudit.averageScore ?? authority?.authority?.visualTreatmentAudit?.averageScore),
      generationTimeoutPolicyPresent,
      runtimeSidecar: runtimeSidecar ? {contract: runtimeSidecar.contract, phase: runtimeSidecar.phase, status: runtimeSidecar.status, wallClockMs: runtimeSidecar.wallClockMs, cacheHits: runtimeSidecar.cacheHits} : null,
      packagingReview: packagingReview ? {contract: packagingReview.contract, mode: packagingReview.mode, status: packagingReview.status, intermediateApprovalRequired: packagingReview.intermediateApprovalRequired, requiresExplicitApproval: packagingReview.requiresExplicitApproval} : null,
    },
    automation: {
      automaticCandidateAdmission: automaticPolicy.automaticCandidateAdmission ?? null,
      criticAutomaticCandidateAdmissionAllowed: autopilot.critic?.automaticApprovalAllowed ?? null,
      candidateAdmissionIsNotVisualApproval: true,
      userVisualApproval: workspace?.production?.storyboardProductionProjection?.gate?.userVisualApproval ?? workspace?.production?.staticPackageReview?.userVisualApproval ?? null,
      machinePassCannotApprove: workspace?.production?.storyboardProductionProjection?.gate?.machinePassCannotApprove ?? true,
      temporalActualArtifactReviewStatus: workspace?.production?.storyboardProductionProjection?.gate?.temporalActualArtifactReviewStatus ?? null,
      motionAllowed: workspace?.production?.storyboardProductionProjection?.gate?.motionAllowed ?? null,
      finalRenderAllowed: workspace?.production?.storyboardProductionProjection?.gate?.finalRenderAllowed ?? null,
      intermediateUserApprovalRequired: automaticPolicy.intermediateUserApprovalRequired ?? null,
      calibrationUserApprovalRequired: automaticPolicy.calibrationUserApprovalRequired ?? null,
      automaticDispatchAllowed: workspace?.production?.generation?.automaticDispatchAllowed ?? null,
    },
  },
  status: findings.some((finding) => finding.severity === "block") ? "BLOCK" : findings.length ? "REVIEW" : "PASS",
  findings,
  recommendations: [...new Set(recommendations)],
  nextAction: visualTreatmentAudit.status === "UNAVAILABLE"
    ? "restore-critic-and-reuse-the-same-six-board-batch"
    : "freeze-generation-and-rewrite-compositor-before-expanding-shot-count",
};

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, reportPath: outputPath, findings: report.findings, observed: report.observed}, null, 2));
