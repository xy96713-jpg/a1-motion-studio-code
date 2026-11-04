#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertProductionHotPathState} from "../apps/studio-next/src/lib/a1-production-hot-path-state-v1.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const currentPhasePath = path.join(artifactRoot, "current-phase.json");
const activeRunPath = path.join(artifactRoot, "editorial-asset-workbench-v1/active-run.json");
const transitionPath = path.join(artifactRoot, "editorial-asset-workbench-v1/transition-receipt.json");
const publicHotPath = path.join(publicRoot, "hot-path-state.json");
const artifactHotPath = path.join(artifactRoot, "editorial-asset-workbench-v1/hot-path-state.json");
const handoffPath = path.join(root, "HANDOFF-CURRENT.md");
const projectionTestPath = path.join(root, "scripts/test-storyboard-production-projection-v1.mjs");
const reportRoot = path.join(artifactRoot, "production-mainline-coherence-v1");
const reportPath = path.join(reportRoot, "report.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const workspace = readProjectWorkspace(appRoot);
// The workspace file carries the last persisted projection for history and
// provenance. For convergence, evaluate the live projection from the same
// current workspace so a stale persisted envelope cannot create a false FAIL.
const liveLifecycle = derivePackagingLifecycleProjection(workspace);
const phase = readJson(currentPhasePath);
const activeRun = readJson(activeRunPath);
const transition = readJson(transitionPath);
const publicHot = assertProductionHotPathState(readJson(publicHotPath));
const artifactHot = assertProductionHotPathState(readJson(artifactHotPath));
const decisions = workspace.production?.canonicalCreatorPackagingSequence?.decisions || [];
const packageShotIds = decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
const currentStage = workspace.production?.authority?.currentStage || null;
const nextAction = workspace.production?.authority?.nextAction || null;
// `authority.state` is a stage label on the legacy compact envelope, not a
// lifecycle status. Prefer the live lifecycle projection so status convergence
// compares like-for-like values instead of treating `article-assets` as a
// production status.
const currentStatus = liveLifecycle?.status
  || workspace.production?.authority?.status
  || phase.status
  || null;
const lifecycleStatus = liveLifecycle?.status || null;
const userVisualApproval = workspace.production?.userVisualApprovalGate?.userVisualApproval
  || workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.userVisualApproval
  || "NOT_APPROVED";
const handoff = fs.readFileSync(handoffPath, "utf8");
const expectedPackageMatch = fs.readFileSync(projectionTestPath, "utf8").match(/counts, \{[^}]*package: (\d+), noPackage: (\d+)/u);
const expectedPackageCount = expectedPackageMatch ? Number(expectedPackageMatch[1]) : null;
const expectedNoPackageCount = expectedPackageMatch ? Number(expectedPackageMatch[2]) : null;

const checks = [];
const check = (id, status, detail, evidence = {}) => checks.push({id, status, detail, evidence});
const same = (values) => values.every((value) => value === values[0]);

check("workspace-sha-convergence", same([
  workspace.workspaceSha256,
  phase.authority?.workspaceSha256,
  activeRun.workspaceSha256,
  transition.workspaceSha256,
  publicHot.workspaceSha256,
  artifactHot.workspaceSha256,
]) ? "PASS" : "FAIL", "唯一工作区 SHA 必须贯穿当前阶段、活动运行、过渡回执和热路径状态", {
  workspace: workspace.workspaceSha256,
  currentPhase: phase.authority?.workspaceSha256,
  activeRun: activeRun.workspaceSha256,
  transition: transition.workspaceSha256,
  publicHot: publicHot.workspaceSha256,
  artifactHot: artifactHot.workspaceSha256,
});

check("hot-path-mirror", Buffer.compare(fs.readFileSync(publicHotPath), fs.readFileSync(artifactHotPath)) === 0 ? "PASS" : "FAIL", "公共热路径状态与制品热路径状态必须字节一致", {
  publicBytes: fs.statSync(publicHotPath).size,
  artifactBytes: fs.statSync(artifactHotPath).size,
});

check("stage-convergence", same([
  currentStage,
  phase.authority?.currentStage,
  activeRun.currentStage,
  publicHot.authority?.currentStage,
]) ? "PASS" : "FAIL", "当前阶段只能有一个权威值", {
  workspace: currentStage,
  currentPhase: phase.authority?.currentStage,
  activeRun: activeRun.currentStage,
  hotPath: publicHot.authority?.currentStage,
});

check("next-action-convergence", same([
  nextAction?.id,
  phase.authority?.nextAction?.id,
  activeRun.nextAction,
  publicHot.authority?.nextAction?.id,
  publicHot.hotPathProjection?.nextActionId,
]) ? "PASS" : "FAIL", "当前下一步必须在工作区、阶段、运行索引和热路径中一致", {
  workspace: nextAction?.id,
  currentPhase: phase.authority?.nextAction?.id,
  activeRun: activeRun.nextAction,
  hotPath: publicHot.authority?.nextAction?.id,
});

const phaseStatusCompatible = currentStatus === phase.status
  || (phase.status === "ACTIVE_REVIEW_GATED" && phase.authority?.currentStage === currentStage && lifecycleStatus === liveLifecycle.status);
check("status-convergence", phaseStatusCompatible ? "PASS" : "FAIL", "生产状态、阶段状态和生命周期状态必须能互相解释", {
  workspaceAuthorityState: currentStatus,
  currentPhase: phase.status,
  lifecycle: lifecycleStatus,
});

check("package-count-convergence", publicHot.hotPathProjection?.primaryMetric?.packageShotCount === packageShotIds.length ? "PASS" : "FAIL", "热路径包装镜头数必须来自当前语义决策集", {
  decisionSet: packageShotIds.length,
  hotPath: publicHot.hotPathProjection?.primaryMetric?.packageShotCount,
  packageShotIds,
});

check("eva-style-lock", publicHot.hotPathProjection?.styleLock?.heroTitleStyleMode === "EVA_MECHANISM_CJK" ? "PASS" : "FAIL", "EVA 中文字形必须保留在当前主线", {
  heroTitleStyleMode: publicHot.hotPathProjection?.styleLock?.heroTitleStyleMode,
  referencePackId: publicHot.hotPathProjection?.styleLock?.referencePackId,
});

check("approval-safety-boundary", userVisualApproval !== "APPROVED"
  ? [phase.reviewDecision?.motionPrototypeAllowed, phase.reviewDecision?.finalRenderAllowed, phase.reviewDecision?.resolveExportAllowed].every((value) => value === false) ? "PASS" : "FAIL"
  : "REVIEW", "未获得用户视觉批准时，动效、最终渲染和 Resolve 必须保持锁定", {
  userVisualApproval,
  motionPrototypeAllowed: phase.reviewDecision?.motionPrototypeAllowed,
  finalRenderAllowed: phase.reviewDecision?.finalRenderAllowed,
  resolveExportAllowed: phase.reviewDecision?.resolveExportAllowed,
});

check("worker-freeze-boundary", publicHot.hotPathProjection?.stages?.find((item) => item.id === "generation")?.status === "blocked"
  && workspace.production?.generation?.automaticDispatchAllowed === false
  && Number(workspace.production?.generation?.summary?.queued || 0) === 0
  && Number(workspace.production?.generation?.summary?.running || 0) === 0 ? "PASS" : "FAIL", "冻结生产时不得有自动派发、排队或运行中的视觉任务", {
  automaticDispatchAllowed: workspace.production?.generation?.automaticDispatchAllowed,
  queued: workspace.production?.generation?.summary?.queued,
  running: workspace.production?.generation?.summary?.running,
});

const handoffStagePattern = new RegExp("Stage:\\s*`?" + currentStage + "`?", "u");
const handoffStatusPattern = new RegExp("status:\\s*`?" + phase.status + "`?", "u");
const handoffStale = !handoff.includes(workspace.workspaceSha256)
  || !handoffStagePattern.test(handoff)
  || !handoffStatusPattern.test(handoff)
  || !handoff.includes(nextAction?.id || "__missing_next_action__");
check("handoff-freshness", handoffStale ? "REVIEW" : "PASS", "当前手册必须明确指向 live authority；旧 SHA、旧阶段或旧下一步会误导接管", {
  expectedWorkspaceSha256: workspace.workspaceSha256,
  expectedStage: currentStage,
  expectedStatus: phase.status,
  expectedNextAction: nextAction?.id,
});

check("compatibility-fixture-drift", expectedPackageCount === packageShotIds.length && expectedNoPackageCount === decisions.length - packageShotIds.length ? "PASS" : "REVIEW", "历史 storyboard 测试的固定计数不能悄悄覆盖当前权威数据", {
  currentPackageCount: packageShotIds.length,
  currentNoPackageCount: decisions.length - packageShotIds.length,
  fixturePackageCount: expectedPackageCount,
  fixtureNoPackageCount: expectedNoPackageCount,
});

const findings = checks.filter((item) => item.status !== "PASS");
const report = {
  contract: "A1ProductionMainlineCoherenceAudit/v1",
  generatedAt: new Date().toISOString(),
  status: findings.some((item) => item.status === "FAIL") ? "FAIL" : findings.length ? "REVIEW" : "PASS",
  current: {
    workspaceSha256: workspace.workspaceSha256,
    status: currentStatus,
    lifecycleStatus,
    currentStage,
    nextAction: nextAction?.id || null,
    targetShotIds: nextAction?.targetShotIds || [],
    packageShotCount: packageShotIds.length,
    shotCount: decisions.length,
    userVisualApproval,
    styleProfileId: workspace.production?.packagingStyleAuthority?.styleProfileId || null,
    referencePackId: publicHot.hotPathProjection?.styleLock?.referencePackId || null,
    heroTitleStyleMode: publicHot.hotPathProjection?.styleLock?.heroTitleStyleMode || null,
  },
  checks,
  findings,
  provenance: {
    currentPhaseSha256: sha256(fs.readFileSync(currentPhasePath)),
    publicHotPathSha256: sha256(fs.readFileSync(publicHotPath)),
    handoffPath,
    projectionTestPath,
  },
};
fs.mkdirSync(reportRoot, {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, contract: report.contract, reportPath: path.relative(root, reportPath), findings}, null, 2));
if (report.status === "FAIL") process.exitCode = 1;
