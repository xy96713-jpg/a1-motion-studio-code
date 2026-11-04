import {spawn} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {approveRecommendedArticleDesignKit, recommendedArticleDesignKitReady} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {automaticallyAdmitProductionReadyShot, begin540pRender, buildRepresentativeMotionPlan, compileAcceptedShotIr, createProductionEvent, createSceneGraphCandidates, queueAssetGeneration, sceneGraphSourceDependencySha256} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {isShotProductionReady, isShotReferenceMature} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {adoptVisualAnchorSuiteAutomatically, adoptVisualTreatmentAutomatically, buildVisualGenerationFreeze, buildVisualTreatmentAudit, queueTreatmentAnchorGeneration, queueVisualGenerationBrief, requeueVisualTreatmentCompositeReview, reviseVisualTreatmentAnchors} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {normalizeShotVisualRepairState, decideShotVisualRepairAction} from "../apps/studio-next/src/lib/a1-visual-repair-policy-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const workerScript = path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs");
const once = process.argv.includes("--once");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tickIntervalMs = Math.max(1_000, Number(process.env.A1_VISUAL_MATURITY_TICK_MS || 2_000));
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const SHOT_REFERENCE_CRITIC_USAGE_LIMITED = "SHOT_REFERENCE_CRITIC_USAGE_LIMITED";
const VISUAL_DIRECTOR_TAKEOVER_STATUSES = new Set(["treatment-review-required", "creative-reviews-complete", "full-film-production"]);

// The legacy loop remains available for workspaces that predate the Visual
// Director. Once the new director has a selected treatment and owns the
// anchor/full-film lifecycle, this daemon must hand off and exit instead of
// reporting a perpetual paused/running state every tick.
function visualDirectorOwnsPipeline(workspace) {
  if (process.env.A1_VISUAL_MATURITY_LEGACY_FORCE === "1") return false;
  const director = workspace.production?.visualDirector;
  return director?.contract === "A1VisualGenerationDirector/v2"
    && VISUAL_DIRECTOR_TAKEOVER_STATUSES.has(director.status);
}

function foundationGenerationPrompt(asset, stageId, revisionPrompt) {
  if (stageId === "element-atlas") {
    return `${asset.purpose}。只生成这一张 4x3 可拆元素图集；12 个元素彼此隔离，保留透明裁切间距。图集是素材容器，不是多方向设计样张。\n\n本轮自动视觉返修：${revisionPrompt}`;
  }
  if (stageId === "key-backgrounds") {
    return `${asset.purpose}。只生成这一张完整 16:9 无字关键背景；一个场景、一个相机视角、一个材料因果，不做网格、联系表或备选方向。\n\n本轮自动视觉返修：${revisionPrompt}`;
  }
  return `用当前文章视觉策略生成“${asset.purpose}”这一张完整 16:9 无字底材。只保留一个材料机制、一个主轮廓和一块可编辑中文字安全区；不得生成多张方案、六宫格、样张板、联系表或重复缩略图。\n\n本轮自动视觉返修：${revisionPrompt}`;
}

function persistMutation(action, targetId, mutate, payload = {}) {
  return withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    let next = structuredClone(current);
    next.production.maturityLoop.userDirectiveAt ||= new Date().toISOString();
    next.production.maturityLoop.startedAt ||= new Date().toISOString();
    next.production.maturityLoop.lastTickAt = new Date().toISOString();
    next = mutate(next);
    next.production.maturityLoop.updatedAt = new Date().toISOString();
    const event = createProductionEvent({workspace: current, action, targetId, payload});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = recalculateEditorialAssetWorkbench(next);
    persistProjectState(appRoot, recalculated, {event});
    return recalculated;
  });
}

function startGenerationWorker() {
  const child = spawn(process.execPath, [workerScript], {cwd: root, detached: true, stdio: "ignore", env: process.env});
  child.unref();
  return child.pid;
}

function automaticArticlePackagingKitReady(workspace) {
  const kit = workspace.production?.articlePackagingKit;
  if (kit?.contract !== "A1ArticlePackagingKit/v1") return {ready: false, blockers: ["article-packaging-kit-required"]};
  const recommendation = recommendedArticleDesignKitReady(workspace, 22);
  if (!recommendation.ready) return recommendation;
  const laneEntries = Object.values(kit.lanes || {}).flat();
  const blockers = [];
  for (const entry of laneEntries) {
    const asset = workspace.library.assets.find((item) => item.id === entry.assetId);
    if (!asset) {
      blockers.push(`${entry.assetId}:asset-missing`);
      continue;
    }
    if (asset.review?.status !== "approved") blockers.push(`${entry.assetId}:objective-asset-qa-pending`);
    if (asset.visualCritic?.hardFailures?.length) blockers.push(`${entry.assetId}:visual-hard-failure`);
    if (["editorial-artwork", "editorial-element"].includes(asset.route)) {
      // Foundation files are ingredients, not finished shots. Their gate is
      // deterministic source/geometry/provenance validity; the 22/24 visual
      // maturity gate belongs to the rendered shot composite.
      if (!asset.assetUri || !asset.sha256) blockers.push(`${entry.assetId}:foundation-ingredient-output-required`);
    }
    if (asset.route === "generated-glyph" && (Number(asset.visualCritic?.totalScore || 0) < 22 || asset.visualCritic?.provisionalAdmission === true || asset.visualCritic?.hardFailures?.length)) blockers.push(`${entry.assetId}:glyph-reference-maturity-required`);
  }
  return {ready: blockers.length === 0, blockers};
}

function autoApproveArticlePackagingKit(workspace) {
  const kit = workspace.production?.articlePackagingKit;
  if (kit?.contract !== "A1ArticlePackagingKit/v1" || (kit.review?.status === "approved" && kit.review.approvedKitSha256 === kit.kitSha256)) return {workspace, status: "not-needed"};
  const readiness = automaticArticlePackagingKitReady(workspace);
  if (!readiness.ready) return {workspace, status: "waiting", blockers: readiness.blockers};
  const updated = withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const currentReadiness = automaticArticlePackagingKitReady(current);
    if (!currentReadiness.ready) return {workspace: current, status: "waiting", blockers: currentReadiness.blockers};
    let next = approveRecommendedArticleDesignKit(current, "系统视觉红队：所有推荐字形逐字核验、22/24 以上且文章素材包通过客观资产 QA，自动采用。", new Date().toISOString(), "system-visual-critic");
    const event = createProductionEvent({workspace: current, action: "article-packaging-kit-automatically-approved", targetId: next.production.articlePackagingKit.kitSha256, payload: {reviewedBy: "system-visual-critic", minimumScore: 22}});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    next = recalculateEditorialAssetWorkbench(next, event.createdAt);
    persistProjectState(appRoot, next, {event});
    return {workspace: next, status: "approved", kitSha256: next.production.articlePackagingKit.kitSha256};
  });
  return updated;
}

async function runChildScript(scriptName, args = []) {
  // Do not inherit the daemon's terminal pipes. Renderers and browser
  // helpers may leave descendants alive after the direct child exits; with
  // inherited stdio Node waits forever for the `close` event and the whole
  // unattended production queue appears frozen. The child writes its own
  // artifacts/reports, so detached stdio is the correct durable mode here.
  const isCritic = /critic/u.test(scriptName);
  const configuredTimeoutMs = isCritic
    ? Math.max(30_000, Number(process.env.A1_VISUAL_CRITIC_TIMEOUT_MS || 180_000))
    : 15 * 60 * 1000;
  const childEnv = {...process.env};
  // The critic script starts its own detached Codex process. Give that inner
  // process a slightly shorter deadline so it can terminate its own group
  // before this supervisor has to intervene.
  if (isCritic) childEnv.A1_VISUAL_MATURITY_CRITIC_TIMEOUT_MS = String(Math.max(30_000, configuredTimeoutMs - 5_000));
  const child = spawn(process.execPath, [path.join(root, "scripts", scriptName), ...args], {cwd: root, detached: true, stdio: "ignore", env: childEnv});
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(Number.isInteger(code) ? code : 1);
    };
    const terminateGroup = () => {
      if (!child.pid) return;
      try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
      setTimeout(() => {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }, 2_000).unref();
    };
    const timeout = setTimeout(() => {
      terminateGroup();
      finish(124);
    }, configuredTimeoutMs);
    child.once("exit", (code) => finish(code));
    child.once("error", () => finish(1));
  });
}

async function runTypographyDirectionTick(workspace) {
  const target = workspace.library.assets.find((asset) => asset.id === "typography-direction-plan");
  if (!target) return {status: "TYPOGRAPHY_DIRECTION_ASSET_MISSING"};
  if (target.review.status === "approved" && target.visualCritic?.totalScore >= 22 && !target.visualCritic?.hardFailures?.length) return {status: "TYPOGRAPHY_DIRECTION_PASS", score: target.visualCritic.totalScore};
  const anchorsPass = workspace.library.assets.filter((asset) => asset.route === "generated-glyph" && asset.requiredForShotComposition).every((asset) => asset.review.status === "approved" && asset.visualCritic?.totalScore >= 22);
  if (!anchorsPass) return {status: "TYPOGRAPHY_DIRECTION_WAITING_ANCHORS"};

  const source = target.typographyDirectionV3;
  const needsBuild = source?.contract !== "A1ArticleTypographyDirectionBoard/v3"
    || target.review.status === "revise"
    || source.round !== Math.max(1, Number(target.visualRevision?.round || 1));
  if (needsBuild) {
    persistMutation("visual-maturity-loop-typography-direction-building", target.id, (next) => {
      next.production.maturityLoop.status = "building-typography-direction";
      next.production.maturityLoop.nextAction = `build-article-typography-direction-v3:round-${Math.max(1, Number(target.visualRevision?.round || 1))}`;
      return next;
    });
    const code = await runChildScript("build-article-typography-direction-v3.mjs");
    return code === 0 ? {status: "TYPOGRAPHY_DIRECTION_BUILT"} : {status: "TYPOGRAPHY_DIRECTION_BUILD_FAILED", exitCode: code};
  }
  if (!target.visualCritic) {
    persistMutation("visual-maturity-loop-typography-direction-critic-dispatched", target.id, (next) => {
      next.production.maturityLoop.status = "critic-running";
      next.production.maturityLoop.nextAction = "criticize-article-typography-direction-v3";
      return next;
    });
    // Image-generation availability and visual-critic availability are
    // separate capabilities. A depleted generation provider must never cap a
    // finished board at the 20/24 local preflight ceiling. Always try the real
    // pixel critic first; the deterministic preflight is diagnostic only.
    const criticCode = await runChildScript("run-typography-direction-critic-v1.mjs");
    if (criticCode === 0) return {status: "TYPOGRAPHY_DIRECTION_CRITIC_COMPLETE"};
    const preflightCode = await runChildScript("run-local-typography-direction-preflight-v1.mjs");
    return preflightCode === 0
      ? {status: "TYPOGRAPHY_DIRECTION_CRITIC_UNAVAILABLE_LOCAL_PREFLIGHT_ONLY", criticExitCode: criticCode}
      : {status: "TYPOGRAPHY_DIRECTION_CRITIC_FAILED", criticExitCode: criticCode, preflightExitCode: preflightCode};
  }
  return {status: "TYPOGRAPHY_DIRECTION_RETRY_PENDING", score: target.visualCritic.totalScore, round: target.typographyDirectionV3?.round};
}

async function runShotCandidateTick(workspace) {
  const staticShotTargetScore = Math.max(22, Number(workspace.production.maturityLoop.shotStaticTargetScore || 22));
  const allShots = workspace.library.assets.filter((asset) => asset.route === "shot-composition").sort((a, b) => a.shotDemand.order - b.shotDemand.order);
  const treatmentGate = workspace.production.visualDirector?.creativeReviews?.gates?.find((gate) => gate.id === "treatment");
  const anchorGate = workspace.production.visualDirector?.creativeReviews?.gates?.find((gate) => gate.id === "anchor-suite");
  const anchorScopeShotIds = treatmentGate?.status === "approved" && anchorGate?.status === "pending"
    ? workspace.production.visualDirector.anchorSuiteShotIds
    : null;
  const anchorScope = Array.isArray(anchorScopeShotIds) && anchorScopeShotIds.length > 0;
  const progressiveAdmission = workspace.production.authority?.designCalibrationBatch?.progressiveAdmission
    || workspace.production.designCalibrationBatch?.progressiveAdmission;
  const progressiveEligibleIds = new Set(progressiveAdmission?.eligibleShotIds || []);
  const anchorShots = anchorScope ? allShots.filter((shot) => anchorScopeShotIds.includes(shot.shotDemand.shotId)) : [];
  const shots = anchorScope
    ? allShots.filter((shot) => anchorScopeShotIds.includes(shot.shotDemand.shotId) || progressiveEligibleIds.has(shot.shotDemand.shotId))
    : allShots;
  const expectedShotCount = anchorScope ? new Set([...anchorScopeShotIds, ...progressiveEligibleIds]).size : workspace.article.shotCount;
  if (shots.length !== expectedShotCount) return {status: "SHOT_COUNT_MISMATCH", expected: expectedShotCount, actual: shots.length, scope: anchorScope ? "visual-anchor-suite" : "full-film"};
  // Progressive families are deliberately held behind the six-shot anchor
  // gate.  The old scheduler treated the presence of an eligible family as
  // permission to dispatch it while the anchor suite was still pending,
  // which made a “calibration” run silently start ED-07/other shots before
  // the representative visuals were accepted.  Keep the family visible in
  // the authority plan, but never queue it until the anchor gate is approved.
  const progressiveDispatchAllowed = anchorGate?.status === "approved";
  const progressiveGenerationBrief = workspace.production.visualDirector?.shotBriefs?.find((brief) => brief.productionBindingAllowed
    && progressiveDispatchAllowed
    && progressiveAdmission?.expandableFamilies?.includes(brief.shotFamily)
    && !progressiveAdmission.isolatedShotIds.includes(brief.shotId)
    && !anchorScopeShotIds?.includes(brief.shotId)
    && !workspace.production.visualDirector.generatedCandidates?.some((candidate) => candidate.briefId === brief.id)
    && !workspace.production.generation.jobs.some((job) => job.briefId === brief.id && ["queued", "running", "complete"].includes(job.status)));
  if (progressiveGenerationBrief) {
    const queued = persistMutation("visual-maturity-loop-progressive-family-generation-queued", progressiveGenerationBrief.id, (next) => {
      const result = queueVisualGenerationBrief(next, progressiveGenerationBrief.id, {candidateCount: 2});
      next = result.workspace;
      next.production.generation.workerStatus = "starting";
      next.production.generation.automaticDispatchAllowed = true;
      next.production.maturityLoop.status = "generating-progressive-shot-family";
      next.production.maturityLoop.nextAction = `generate-passed-family:${progressiveGenerationBrief.shotFamily}:${progressiveGenerationBrief.shotId}`;
      return next;
    }, {shotId: progressiveGenerationBrief.shotId, shotFamily: progressiveGenerationBrief.shotFamily, policy: progressiveAdmission.policy});
    const workerPid = startGenerationWorker();
    return {status: "PROGRESSIVE_SHOT_FAMILY_GENERATION_QUEUED", shotId: progressiveGenerationBrief.shotId, shotFamily: progressiveGenerationBrief.shotFamily, workerPid, queue: queued.production.generation.summary};
  }
  const stale = shots.find((shot) => shot.candidates?.some((candidate) => {
    if (!candidate.sourceDependencySha256) return candidate.sourceAssetPackSha256 !== workspace.library.assetPackSha256;
    return candidate.sourceDependencySha256 !== sceneGraphSourceDependencySha256(workspace, shot.shotDemand, candidate.sceneGraph);
  }));
  if (stale) {
    const invalidated = persistMutation("visual-maturity-loop-stale-shot-candidates-invalidated", stale.id, (next) => {
      const target = next.library.assets.find((asset) => asset.id === stale.id);
      if (target.candidates?.length || target.candidateBatch) {
        target.revisionHistory ||= [];
        target.revisionHistory.push({
          contract: "A1RejectedShotCandidateRound/v1",
          round: Number(target.visualRevision?.round || 1),
          reason: "shot-local-source-dependency-changed",
          candidates: target.candidates || [],
          candidateBatch: target.candidateBatch ? {...target.candidateBatch, status: "invalidated"} : null,
          candidateRender: target.candidateRender || null,
          visualCritic: target.visualCritic || null,
          archivedAt: new Date().toISOString(),
        });
      }
      target.candidates = [];
      target.candidateRender = null;
      target.selectedCandidateId = null;
      target.candidateBatch = target.candidateBatch ? {...target.candidateBatch, status: "invalidated"} : null;
      target.visualCritic = null;
      target.status = "brief-ready";
      target.review = {status: "pending", note: "该镜头实际依赖已变化，旧逐镜候选自动失效。", reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
      target.automationBlock = null;
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.nextAction = `regenerate-stale-shot:${target.shotDemand.shotId}`;
      return next;
    }, {shotId: stale.shotDemand.shotId, currentAssetPackSha256: workspace.library.assetPackSha256, invalidationScope: "shot-source-dependencies"});
    return {status: "STALE_SHOT_CANDIDATES_INVALIDATED", shotId: stale.shotDemand.shotId, candidateCount: invalidated.library.assets.find((asset) => asset.id === stale.id)?.candidates.length || 0};
  }
  // A dynamic/source-bound critic can admit a shot before its candidate
  // contact sheet exists. Finish that visible evidence first; otherwise the
  // loop can keep advancing through later shots while the calibration batch
  // remains blocked on a mature shot with no renderable preview.
  const matureRenderMissing = shots.find((shot) => {
    if (!isShotReferenceMature(workspace, shot, staticShotTargetScore)) return false;
    const candidates = Array.isArray(shot.candidates) ? shot.candidates : [];
    const previews = Array.isArray(shot.candidateRender?.previews) ? shot.candidateRender.previews : [];
    return candidates.length > 0 && (!shot.candidateRender || previews.length !== candidates.length);
  });
  if (matureRenderMissing) {
    const code = await runChildScript("render-shot-scene-graph-candidates-v1.mjs", [`--shot=${matureRenderMissing.shotDemand.shotId}`]);
    return code === 0
      ? {status: "MATURE_SHOT_VISIBLE_CANDIDATES_RENDERED", shotId: matureRenderMissing.shotDemand.shotId}
      : {status: "MATURE_SHOT_VISIBLE_CANDIDATES_RENDER_FAILED", shotId: matureRenderMissing.shotDemand.shotId, exitCode: code};
  }
  const admissionTarget = shots.find((shot) => shot.review?.status !== "approved"
    && isShotProductionReady(workspace, shot, staticShotTargetScore));
  if (admissionTarget) {
    const admitted = persistMutation("visual-maturity-loop-shot-auto-admitted", admissionTarget.id, (next) => {
      next = automaticallyAdmitProductionReadyShot(next, admissionTarget.id, new Date().toISOString());
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.nextAction = `continue-after-auto-admission:${admissionTarget.shotDemand.shotId}`;
      return next;
    }, {shotId: admissionTarget.shotDemand.shotId, minimumScore: staticShotTargetScore});
    const admittedShot = admitted.library.assets.find((asset) => asset.id === admissionTarget.id);
    return {status: "SHOT_AUTO_ADMITTED", shotId: admissionTarget.shotDemand.shotId, candidateId: admittedShot?.selectedCandidateId || null};
  }
  const isReferenceMature = (shot) => shot.review.status === "approved"
    && Boolean(shot.selectedCandidateId)
    && isShotReferenceMature(workspace, shot, staticShotTargetScore);
  const allProductionReady = allShots.every((shot) => isShotProductionReady(workspace, shot, staticShotTargetScore));
  const anchorProductionReady = anchorScope && anchorShots.every((shot) => isShotProductionReady(workspace, shot, staticShotTargetScore));
  if (anchorProductionReady) {
    const adopted = persistMutation("visual-anchor-suite-automatically-adopted", null, (next) => {
      next = adoptVisualAnchorSuiteAutomatically(next);
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.nextAction = "continue-full-film-after-automatic-anchor-suite-admission";
      return next;
    }, {shotIds: anchorScopeShotIds, minimumScore: staticShotTargetScore});
    return {status: "VISUAL_ANCHOR_SUITE_AUTO_ADOPTED", shotIds: anchorScopeShotIds, minimumScore: staticShotTargetScore, gate: adopted.production.visualDirector.creativeReviews.gates.find((gate) => gate.id === "anchor-suite")};
  }
  if (allProductionReady && !workspace.gates.acceptedShotIrAllowed) {
    const existingAudit = workspace.production.maturityLoop.allShotSelectedReview;
    if (existingAudit?.status === "BLOCK" && existingAudit.hardFailures?.includes("presenter-human-led-motion-source-missing")) {
      return {status: "PRESENTER_VIDEO_REQUIRED", hardFailures: existingAudit.hardFailures};
    }
    const code = await runChildScript("render-all-shot-selected-contact-sheet-v1.mjs", ["--persist"]);
    if (code !== 0) return {status: "GLOBAL_VISUAL_AUDIT_FAILED", exitCode: code};
    workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (!workspace.gates.acceptedShotIrAllowed) {
      return {status: "GLOBAL_VISUAL_AUDIT_BLOCKED", hardFailures: workspace.production.maturityLoop.allShotSelectedReview?.hardFailures || []};
    }
  }
  if (allProductionReady && workspace.gates.acceptedShotIrAllowed) {
    const compiled = withProjectLock(appRoot, () => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      const accepted = compileAcceptedShotIr(current);
      const representative = buildRepresentativeMotionPlan(accepted.workspace, accepted.acceptedSet);
      const next = representative.workspace;
      next.production.maturityLoop.currentStage = "representative-motion";
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.nextAction = "render-18-28s-representative-motion";
      const event = createProductionEvent({workspace: current, action: "autonomous-34-shot-accepted-ir-compiled", targetId: accepted.acceptedSet.sha256, payload: {shotCount: accepted.acceptedSet.shotCount, acceptedShotIrSha256: accepted.acceptedSet.sha256, motionIrSha256: accepted.motionSet.sha256, representativePlanSha256: representative.plan.sha256}});
      next.production.eventLedger.eventCount += 1;
      next.production.eventLedger.lastEventId = event.eventId;
      next.production.eventLedger.lastEventAt = event.createdAt;
      const recalculated = recalculateEditorialAssetWorkbench(next);
      persistProjectState(appRoot, recalculated, {event, files: {"accepted-shot-ir-v2.json": accepted.acceptedSet, "motion-ir-v2.json": accepted.motionSet, "representative-motion-plan-v1.json": representative.plan}});
      return {workspace: recalculated, acceptedSet: accepted.acceptedSet, motionSet: accepted.motionSet, plan: representative.plan};
    });
    return {status: "ACCEPTED_SHOT_IR_COMPILED", shotCount: compiled.acceptedSet.shotCount, representativeDurationMs: compiled.plan.durationMs};
  }

  // A representative proves a shot family, not the whole film. Continue the
  // passed families while keeping failed representatives local; one source
  // or compositor defect must not starve unrelated chapters.
  const calibrationShotIds = new Set((workspace.production.designCalibrationBatch?.items || []).map((item) => item.shotId));
  // Complete the visible calibration slice before spending work on the
  // remaining article. This keeps the line fast and produces real rendered
  // evidence early instead of filling the workspace with 34 unreviewed JSON
  // candidate sets.
  let target = shots.find((shot) => calibrationShotIds.has(shot.shotDemand.shotId)
      && !shot.automationBlock
      && shot.review?.status === "revise"
      && shot.visualCritic
      && !isShotReferenceMature(workspace, shot, staticShotTargetScore))
    // A reviewed calibration failure must be repaired or explicitly blocked
    // before any progressive family is allowed to consume the next tick.
    // Otherwise a low-scoring anchor (for example ED-32) can be skipped while
    // ED-04/ED-07 silently start filling the workspace.
    || shots.find((shot) => calibrationShotIds.has(shot.shotDemand.shotId)
      && !shot.automationBlock
      && shot.candidates?.length
      && shot.candidateRender?.previews?.length === shot.candidates.length
      && !shot.visualCritic)
    // A rendered calibration shot must be critiqued before the scheduler
    // spends time rendering or generating another shot.  Without this
    // ordering the loop filled the workspace with JSON batches while the
    // visible proof stayed unreviewed, which looked like progress but never
    // closed the gate.
    || shots.find((shot) => calibrationShotIds.has(shot.shotDemand.shotId) && !shot.automationBlock && shot.candidates?.length && (!shot.candidateRender || shot.candidateRender.previews?.length !== shot.candidates.length))
    || shots.find((shot) => calibrationShotIds.has(shot.shotDemand.shotId) && !shot.automationBlock && !shot.candidates?.length)
    || shots.find((shot) => !calibrationShotIds.has(shot.shotDemand.shotId) && progressiveEligibleIds.has(shot.shotDemand.shotId) && !shot.automationBlock && !shot.candidates?.length)
    || shots.find((shot) => !calibrationShotIds.has(shot.shotDemand.shotId) && progressiveEligibleIds.has(shot.shotDemand.shotId) && !shot.automationBlock && shot.candidates?.length && (!shot.candidateRender || shot.candidateRender.previews?.length !== shot.candidates.length))
    || shots.find((shot) => !calibrationShotIds.has(shot.shotDemand.shotId) && progressiveEligibleIds.has(shot.shotDemand.shotId) && !shot.automationBlock && shot.candidates?.length && !shot.visualCritic)
    || shots.find((shot) => !shot.automationBlock && !isShotProductionReady(workspace, shot, staticShotTargetScore));
  if (!target) {
    const blockedShot = shots.find((shot) => shot.automationBlock?.status === "BLOCKED_VISUAL_QUALITY");
    if (blockedShot) {
      persistMutation("visual-maturity-loop-shot-production-blocked", blockedShot.id, (next) => {
        next.production.maturityLoop.status = "attention-required-visual-quality";
        next.production.maturityLoop.nextAction = `renderer-fix-required:${blockedShot.shotDemand.shotId}`;
        return next;
      }, {shotId: blockedShot.shotDemand.shotId, reason: blockedShot.automationBlock.reason});
      return {status: "SHOT_CANDIDATE_TARGET_BLOCKED", shotId: blockedShot.shotDemand.shotId};
    }
    return {status: "SHOT_CANDIDATE_TARGET_MISSING"};
  }
  // A local 20/24 preflight is never an admission and must be upgraded by the
  // real visual critic even when image generation itself is usage-limited.
  const maxStrategyCycles = Number(workspace.production.maturityLoop.maxVisualStrategyCycles || 2);
  const currentStrategyCycle = Number(target.visualStrategyCycle || 0);
  const repairState = normalizeShotVisualRepairState({
    reviewStatus: target.review.status,
    hasVisualCritic: Boolean(target.visualCritic),
    referenceMaturity: target.visualCritic?.referenceMaturity,
    revisionRound: target.visualRevision?.round,
    strategyCycle: currentStrategyCycle,
    maxRoundsPerTarget: workspace.production.maturityLoop.maxRoundsPerTarget,
    maxVisualStrategyCycles: maxStrategyCycles,
  });
  if (repairState.normalizationRequired) {
    const normalized = persistMutation("visual-maturity-loop-shot-strategy-cycle-normalized", target.id, (next) => {
      const shot = next.library.assets.find((asset) => asset.id === target.id);
      const previousCycle = Number(shot.visualStrategyCycle || 0);
      shot.visualStrategyCycle = repairState.normalizedStrategyCycle;
      shot.revisionHistory ||= [];
      shot.revisionHistory.push({
        contract: "A1VisualRepairCycleNormalization/v1",
        round: shot.visualRevision?.round || 0,
        strategyCycle: previousCycle,
        reason: repairState.normalizationReason,
        normalizedStrategyCycle: repairState.normalizedStrategyCycle,
        archivedAt: new Date().toISOString(),
      });
      return next;
    }, {
      shotId: target.shotDemand.shotId,
      previousStrategyCycle: repairState.strategyCycle,
      normalizedStrategyCycle: repairState.normalizedStrategyCycle,
      reason: repairState.normalizationReason,
    });
    target = normalized.library.assets.find((asset) => asset.id === target.id);
  }
  const currentStrategyCycleAfterNormalization = Number(target.visualStrategyCycle || 0);
  const repairDecision = decideShotVisualRepairAction({
    reviewStatus: target.review.status,
    hasVisualCritic: Boolean(target.visualCritic),
    referenceMaturity: target.visualCritic?.referenceMaturity,
    revisionRound: target.visualRevision?.round,
    strategyCycle: currentStrategyCycleAfterNormalization,
    maxRoundsPerTarget: workspace.production.maturityLoop.maxRoundsPerTarget,
    maxVisualStrategyCycles: maxStrategyCycles,
    sourceEvidenceCaptureRequired: target.shotDemand.shotId === "ED-32"
      && Boolean(target.visualCritic)
      && !isShotReferenceMature(workspace, target, staticShotTargetScore)
      || (target.shotDemand.editMode === "presenter-clean"
        && /录制并锁定|桌边|双手|真实.*取景|必须真正拉宽/iu.test(`${target.visualCritic?.overallSummary || ""} ${target.visualCritic?.repairPlan?.highestImpact || ""} ${target.visualCritic?.repairPlan?.nextPrompt || ""}`)),
  });
  // Strategy cycles are an independent safety bound.  A reset starts a new
  // revision round, so checking this only after maxRoundsPerTarget could
  // silently reset the same shot forever (the inherited ED-03 state had
  // already reached cycle 21 while its round was still 2).
  if (repairDecision.action === "block-engineering-required") {
    persistMutation("visual-maturity-loop-shot-visual-repair-exhausted", target.id, (next) => {
      const shot = next.library.assets.find((asset) => asset.id === target.id);
      const sourceCaptureRequired = repairDecision.sourceEvidenceCaptureRequired === true;
      shot.automationBlock = {
        contract: "A1AutomaticVisualRepairBlock/v1",
        status: sourceCaptureRequired ? "BLOCKED_SOURCE_MATERIAL" : "BLOCKED_VISUAL_QUALITY",
        reason: sourceCaptureRequired
          ? "当前真实源片只支持无遮挡真人近景；审片要求桌边/双手或可验证三拍，继续换构图原语也无法凭空补出源素材。请补录或提供覆盖该表演的真实片段。"
          : "同一镜头连续视觉策略重建仍未达到审美门槛；系统停止重复循环，不把未通过镜头伪装成可交付。",
        sourceReportSha256: shot.visualCritic?.reportSha256 || null,
        strategyCycles: currentStrategyCycleAfterNormalization,
        maxStrategyCycles,
        blockedAt: new Date().toISOString(),
        ...(sourceCaptureRequired ? {missingEvidenceIds: ["presenter-three-beat-performance", "presenter-desk-and-hands-framing"]} : {}),
      };
      shot.review = {...shot.review, status: "revise", note: sourceCaptureRequired ? "真实源素材覆盖不足；等待补录/补源，不再自动重复构图。" : "自动视觉返修达到上限；需要修改 renderer/构图族，而不是继续重复生成。", reviewedBy: "system-visual-repair-guard"};
      next.production.maturityLoop.status = "attention-required-visual-quality";
      next.production.maturityLoop.nextAction = `renderer-fix-required:${shot.shotDemand.shotId}`;
      next.production.maturityLoop.counters.blocked += 1;
      return next;
    }, {shotId: target.shotDemand.shotId, strategyCycles: currentStrategyCycleAfterNormalization, maxStrategyCycles});
    return {status: "SHOT_VISUAL_REPAIR_EXHAUSTED", shotId: target.shotDemand.shotId, strategyCycles: currentStrategyCycleAfterNormalization, maxStrategyCycles};
  }
  if (repairDecision.action === "switch-visual-primitive") {
    const reset = persistMutation("visual-maturity-loop-shot-strategy-reset", target.id, (next) => {
      const shot = next.library.assets.find((asset) => asset.id === target.id);
      const cycle = Number(shot.visualStrategyCycle || 0) + 1;
      const strategies = [
        "放弃此前布局族，先锁定唯一主视觉，再让标题只与该对象发生一次裁切或遮挡；删除所有卡片、栏板和解释标签。",
        "放弃此前布局族，改用素材全幅与超尺度词级演员的非对称碰撞；至少保留 35% 安静负空间，建立明确交接出口。",
        "放弃此前布局族，改用真实对象的局部扫描、放大和回落形成因果；文字不得悬浮，必须从对象表面或人物手势发生。",
        "放弃此前布局族，改用编辑拼贴的前中后三层空间；每一层绑定来源材料，避免同尺寸矩形和平铺面板。",
      ];
      const strategy = strategies[(cycle - 1) % strategies.length];
      shot.visualStrategyCycle = cycle;
      shot.revisionHistory ||= [];
      shot.revisionHistory.push({round: shot.visualRevision?.round, strategyCycle: cycle - 1, candidates: shot.candidates, candidateBatch: shot.candidateBatch ? {...shot.candidateBatch, status: "invalidated"} : null, visualCritic: shot.visualCritic, archivedAt: new Date().toISOString()});
      shot.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: shot.visualCritic?.reportSha256 || null, prompt: `${strategy}\n上一策略问题：${shot.review.note || "未达参考门槛"}`, createdAt: new Date().toISOString()};
      shot.candidates = [];
      shot.candidateRender = null;
      shot.visualCritic = null;
      shot.candidateBatch = shot.candidateBatch ? {...shot.candidateBatch, status: "invalidated"} : null;
      if (next.production.maturityLoop.shotReports) delete next.production.maturityLoop.shotReports[shot.shotDemand.shotId];
      shot.selectedCandidateId = null;
      shot.automationBlock = null;
      shot.status = "brief-ready";
      shot.review = {status: "pending", note: `逐镜布局策略已自动重置为第 ${cycle} 个视觉原语。`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.nextAction = `regenerate-shot-after-strategy-reset:${shot.shotDemand.shotId}`;
      next.production.maturityLoop.counters.blocked += 1;
      return next;
    });
    target = reset.library.assets.find((asset) => asset.id === target.id);
  }

  const candidateSourceSha256 = target.candidates?.length ? sha256(target.candidates.map((candidate) => candidate.candidateSha256)) : null;
  if (!target.candidates?.length || target.review.status === "revise") {
    try {
      const generated = persistMutation("visual-maturity-loop-shot-candidates-generated", target.id, (next) => {
        next = createSceneGraphCandidates(next, target.id);
        const shot = next.library.assets.find((asset) => asset.id === target.id);
        next.production.maturityLoop.status = "rendering-shot-candidates";
        next.production.maturityLoop.nextAction = `render-shot-candidates:${shot.shotDemand.shotId}`;
        return next;
      });
      const shot = generated.library.assets.find((asset) => asset.id === target.id);
      return {status: "SHOT_CANDIDATES_GENERATED", shotId: shot.shotDemand.shotId, candidates: shot.candidates.length};
    } catch (error) {
      const message = error instanceof Error ? error.message : "shot-candidate-generation-failed";
      const blocked = persistMutation("visual-maturity-loop-shot-candidate-blocked", target.id, (next) => {
        const shot = next.library.assets.find((asset) => asset.id === target.id);
        shot.automationBlock = {contract: "A1AutomaticShotBlock/v1", code: message, createdAt: new Date().toISOString()};
        shot.status = "blocked";
        shot.review = {status: "pending", note: `系统保留显式阻塞：${message}`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
        next.production.maturityLoop.status = "shot-blocked-source-or-policy";
        next.production.maturityLoop.nextAction = `resolve-shot-block:${shot.shotDemand.shotId}`;
        next.production.maturityLoop.counters.blocked += 1;
        return next;
      }, {shotId: target.shotDemand.shotId, error: message});
      return {status: "SHOT_CANDIDATE_BLOCKED", shotId: target.shotDemand.shotId, error: message, blocked: Boolean(blocked)};
    }
  }
  if (!target.candidateRender
    || target.candidateRender.candidateSourceSha256 !== candidateSourceSha256
    || target.candidateRender.previews?.length !== target.candidates.length) {
    const code = await runChildScript("render-shot-scene-graph-candidates-v1.mjs", [`--shot=${target.shotDemand.shotId}`]);
    return code === 0 ? {status: "SHOT_CANDIDATES_RENDERED", shotId: target.shotDemand.shotId} : {status: "SHOT_CANDIDATE_RENDER_FAILED", shotId: target.shotDemand.shotId, exitCode: code};
  }
  if (!target.visualCritic || target.visualCritic.provisionalAdmission === true) {
    const code = await runChildScript("run-shot-candidate-critic-v1.mjs", [`--shot=${target.shotDemand.shotId}`]);
    if (code === 0) return {status: "SHOT_CANDIDATE_CRITIC_COMPLETE", shotId: target.shotDemand.shotId};
    if (workspace.production?.generation?.providerState?.status === "usage-limited") return {status: SHOT_REFERENCE_CRITIC_USAGE_LIMITED, shotId: target.shotDemand.shotId, exitCode: code};
    return {status: "SHOT_CANDIDATE_CRITIC_FAILED", shotId: target.shotDemand.shotId, exitCode: code};
  }
  if (target.review.status !== "approved" && target.selectedCandidateId && target.visualCritic?.provisionalAdmission === true) {
    const code = await runChildScript("run-shot-candidate-critic-v1.mjs", [`--shot=${target.shotDemand.shotId}`]);
    return code === 0 ? {status: "SHOT_PROVISIONAL_APPROVAL_RECONCILED", shotId: target.shotDemand.shotId} : {status: "SHOT_PROVISIONAL_APPROVAL_RECONCILE_FAILED", shotId: target.shotDemand.shotId, exitCode: code};
  }
  return {status: "SHOT_CANDIDATE_RETRY_PENDING", shotId: target.shotDemand.shotId, score: target.visualCritic.totalScore};
}

async function runRepresentativeMotionTick(workspace) {
  const motion = workspace.production.motion;
  if (motion.status === "representative-preview-required" || motion.status === "render-failed") {
    persistMutation("visual-maturity-loop-representative-render-dispatched", motion.representativePlan?.sha256 || null, (next) => {
      next.production.motion.status = "rendering";
      next.production.maturityLoop.status = "rendering-representative-motion";
      next.production.maturityLoop.nextAction = "render-18-28s-representative-motion";
      return next;
    });
    const code = await runChildScript("render-editorial-representative-motion-v2.mjs");
    return code === 0 ? {status: "REPRESENTATIVE_MOTION_RENDERED"} : {status: "REPRESENTATIVE_MOTION_RENDER_FAILED", exitCode: code};
  }
  if (motion.status === "preview-ready-for-review" && motion.previewArtifact) {
    const code = await runChildScript("run-representative-motion-critic-v1.mjs");
    if (code !== 0) return {status: "REPRESENTATIVE_MOTION_CRITIC_FAILED", exitCode: code};
    workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (workspace.production.motion.status === "motion-sample-review-required" && workspace.production.motion.review?.status === "approved-by-system-visual-critic") {
      const score = Number(workspace.production.motion.review.score || 0);
      const admitted = persistMutation("visual-maturity-loop-representative-motion-auto-admitted", workspace.production.motion.representativePlan?.sha256 || null, (next) => {
        const currentMotion = next.production.motion;
        currentMotion.status = "approved-for-full-motion";
        currentMotion.fullMotionAllowed = true;
        currentMotion.review = {...currentMotion.review, status: "approved", approvedBy: "system-visual-critic", approvedAt: new Date().toISOString()};
        next.production.release.review540p.status = "ready-to-render";
        next.production.maturityLoop.status = "running";
        next.production.maturityLoop.nextAction = "prepare-34-shot-540p-film-assembly";
        return next;
      }, {score, minimumScore: 22, reviewedBy: "system-visual-critic"});
      return {status: "REPRESENTATIVE_MOTION_AUTO_ADMITTED", score, motionStatus: admitted.production.motion.status};
    }
    return {status: "REPRESENTATIVE_MOTION_CRITIC_COMPLETE"};
  }
  if (motion.status === "approved-for-full-motion" && motion.fullMotionAllowed) {
    persistMutation("visual-maturity-loop-representative-stage-passed", motion.representativePlan?.sha256 || null, (next) => {
      next.production.maturityLoop.currentStage = "full-film";
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.nextAction = "prepare-34-shot-540p-film-assembly";
      return next;
    });
    return {status: "REPRESENTATIVE_MOTION_STAGE_PASS", score: motion.review.score};
  }
  return {status: "REPRESENTATIVE_MOTION_NO_ACTION", motionStatus: motion.status};
}

async function runFullFilmTick(workspace) {
  const assembly = workspace.production.assembly;
  const missing = [!assembly.presenterMediaBound ? "presenter-video" : null, !assembly.screenMediaBound ? "screen-recording" : null, !assembly.audioBound ? "source-audio" : null, !assembly.subtitleTimelineBound ? "subtitle-timeline" : null].filter(Boolean);
  if (missing.length) {
    if (!assembly.discovery || missing.some((item) => item !== "presenter-video")) {
      const code = await runChildScript("discover-and-bind-film-media-v1.mjs");
      return code === 0 ? {status: "FULL_FILM_MEDIA_DISCOVERY_COMPLETE"} : {status: "FULL_FILM_MEDIA_DISCOVERY_FAILED", exitCode: code};
    }
    const nextAction = `discover-and-bind-real-film-media:${missing.join(",")}`;
    if (workspace.production.maturityLoop.status === "auto-media-discovery" && workspace.production.maturityLoop.nextAction === nextAction) return {status: "FULL_FILM_MEDIA_DISCOVERY_REQUIRED", missing};
    persistMutation("visual-maturity-loop-full-film-media-discovery-required", null, (next) => {
      next.production.maturityLoop.status = "auto-media-discovery";
      next.production.maturityLoop.nextAction = nextAction;
      next.production.assembly.status = "auto-discovery-required";
      return next;
    }, {missing});
    return {status: "FULL_FILM_MEDIA_DISCOVERY_REQUIRED", missing};
  }
  const reviewStatus = workspace.production.release.review540p.status;
  if (["ready-to-render", "render-failed"].includes(reviewStatus)) {
    persistMutation("visual-maturity-loop-540p-render-dispatched", workspace.production.acceptedShotIr?.sha256 || null, (next) => {
      next = begin540pRender(next);
      next.production.maturityLoop.status = "rendering-540p-review-film";
      next.production.maturityLoop.nextAction = "render-complete-540p-review-film";
      return next;
    });
    const code = await runChildScript("render-editorial-full-film-v2.mjs", ["--resolution=540"]);
    return code === 0 ? {status: "FULL_FILM_540P_RENDERED"} : {status: "FULL_FILM_540P_RENDER_FAILED", exitCode: code};
  }
  if (reviewStatus === "rendering") return {status: "FULL_FILM_540P_RENDERING"};
  if (reviewStatus === "ready-for-review") {
    const visualReview = workspace.production.release.visualQualityReview;
    if (visualReview?.status !== "passed") {
      const attempts = Number(workspace.production.maturityLoop.visualRepairAttempts || 0);
      const maxAttempts = Number(workspace.production.maturityLoop.maxVisualRepairAttempts || 3);
      if (attempts < maxAttempts) {
        persistMutation("visual-maturity-loop-film-repair-dispatched", workspace.production.release.review540p.sha256 || null, (next) => {
          next.production.maturityLoop.visualRepairAttempts = attempts + 1;
          next.production.maturityLoop.currentStage = "shot-candidates";
          next.production.maturityLoop.status = "automatic-film-visual-repair";
          next.production.maturityLoop.nextAction = `rebuild-full-film-after-visual-critic:${attempts + 1}/${maxAttempts}`;
          next.production.acceptedShotIr.status = "locked-upstream-visual-repair";
          next.production.acceptedShotIr.fullMotionAllowed = false;
          next.production.motion.status = "locked-upstream-visual-repair";
          next.production.motion.fullMotionAllowed = false;
          return next;
        }, {attempt: attempts + 1, maxAttempts, visualQualityReportPublicUrl: visualReview.reportPublicUrl || null, repairBriefPublicUrl: visualReview.repairBriefPublicUrl || null});
        // Consume the actual full-film critic output. The previous route only
        // re-applied the general reference contract and could regenerate the
        // exact same layouts. Targeted repair preserves real screen sources
        // while invalidating only the shots named by the critic.
        const code = await runChildScript("apply-film-visual-repair-brief-v1.mjs");
        return code === 0
          ? {status: "FULL_FILM_VISUAL_REPAIR_QUEUED", attempt: attempts + 1, maxAttempts}
          : {status: "FULL_FILM_VISUAL_REPAIR_FAILED", attempt: attempts + 1, maxAttempts, exitCode: code};
      }
      persistMutation("visual-maturity-loop-film-visual-repair-exhausted", workspace.production.release.review540p.sha256 || null, (next) => {
        next.production.maturityLoop.status = "attention-required-visual-quality";
        next.production.maturityLoop.nextAction = "system-visual-repair-exhausted-engineering-fix-required";
        next.production.maturityLoop.gates.fullFilmAllowed = false;
        return next;
      }, {attempts, maxAttempts, hardFailures: visualReview.hardFailures || []});
      return {status: "FULL_FILM_VISUAL_REPAIR_EXHAUSTED", attempts, maxAttempts, hardFailures: visualReview.hardFailures || []};
    }
    if (workspace.production.maturityLoop.status !== "final-release-decision-required") {
      persistMutation("visual-maturity-loop-final-release-decision-required", workspace.production.release.review540p.sha256 || null, (next) => {
        next.production.maturityLoop.status = "final-release-decision-required";
        next.production.maturityLoop.nextAction = "decide-final-render-and-davinci";
        return next;
      }, {publicUrl: workspace.production.release.review540p.publicUrl, durationMs: workspace.production.release.review540p.durationMs});
    }
    return {status: "FINAL_RELEASE_DECISION_REQUIRED", publicUrl: workspace.production.release.review540p.publicUrl};
  }
  if (workspace.production.release.final1080p.status === "complete") return {status: "FULL_FILM_DELIVERY_COMPLETE", publicUrl: workspace.production.release.final1080p.publicUrl};
  return {status: "FULL_FILM_WAITING_FOR_AUTOMATIC_540P", reviewStatus};
}

async function runFoundationTick(workspace) {
  const stageIds = ["background-foundry", "element-atlas", "key-backgrounds"];
  for (const stageId of stageIds) {
    const stage = workspace.stages.find((item) => item.id === stageId);
    const previousFoundationReport = workspace.production.maturityLoop.foundationReports?.[stageId];
    const assets = workspace.library.assets.filter((item) => item.stageId === stageId && ["editorial-artwork", "editorial-element"].includes(item.route));
    const ingredientStagePass = previousFoundationReport?.contract === "A1LocalFoundationVisualPreflight/v1"
      && previousFoundationReport?.provisionalAdmission === true
      && assets.length >= Number(stage?.minimumApproved || 0)
      && assets.every((asset) => asset.assetUri && asset.sha256 && asset.review?.status === "approved" && !(asset.visualCritic?.hardFailures || []).length);
    // A valid local ingredient preflight is sufficient to enter composition.
    // Do not dispatch a final-shot critic against the same raw material board
    // on every daemon tick.
    if (ingredientStagePass) continue;
    const provisionalStage = previousFoundationReport?.provisionalAdmission === true || previousFoundationReport?.contract === "A1LocalFoundationVisualPreflight/v1";
    if (stage?.gate.pass && !provisionalStage) continue;
    const missing = assets.find((asset) => !asset.assetUri && asset.review.status !== "approved");
    if (missing) {
      const queued = persistMutation("visual-maturity-loop-foundation-queued", missing.id, (next) => {
        const target = next.library.assets.find((asset) => asset.id === missing.id);
        if (target.status === "brief-ready") target.status = "generation-ready";
        const result = queueAssetGeneration(next, target.id);
        next = result.workspace;
        next.production.generation.automaticDispatchAllowed = true;
        next.production.maturityLoop.status = "generating-foundation";
        next.production.maturityLoop.nextAction = `generate-foundation:${target.id}`;
        next.production.maturityLoop.counters.generated += result.jobs.length;
        return next;
      });
      const workerPid = startGenerationWorker();
      return {status: "FOUNDATION_QUEUED", stageId, assetId: missing.id, workerPid, queue: queued.production.generation.summary};
    }

    const outputs = assets.filter((asset) => asset.assetUri && asset.sha256);
    const sourceAssetSha256 = sha256(outputs.map((asset) => ({id: asset.id, sha256: asset.sha256, prompt: asset.promptBrief})));
    const previous = previousFoundationReport;
    const criticCircuit = workspace.production.maturityLoop?.criticCircuit;
    if (criticCircuit?.status === "BLOCKED_VISUAL_CRITIC_UNAVAILABLE" && criticCircuit.stageId === stageId && criticCircuit.sourceAssetSha256 === sourceAssetSha256) {
      return {status: "BLOCKED_VISUAL_CRITIC_UNAVAILABLE", stageId, sourceAssetSha256, nextAction: `restore-visual-critic:${stageId}`};
    }
    if (previous?.hardFailures?.includes("foundation-output-geometry-invalid") || assets.some((asset) => asset.visualCritic?.hardFailures?.includes("foundation-output-geometry-invalid"))) {
      const code = await runChildScript("normalize-foundation-output-geometry-v1.mjs", [`--stage=${stageId}`]);
      if (code === 0) return {status: "FOUNDATION_OUTPUT_GEOMETRY_NORMALIZED", stageId};
      if (code !== 2) return {status: "FOUNDATION_OUTPUT_GEOMETRY_NORMALIZATION_FAILED", stageId, exitCode: code};
    }
    const provisionalFoundationReview = previous?.provisionalAdmission === true || previous?.contract === "A1LocalFoundationVisualPreflight/v1";
    if (outputs.length >= stage.minimumApproved && (previous?.sourceAssetSha256 !== sourceAssetSha256 || provisionalFoundationReview)) {
      persistMutation("visual-maturity-loop-foundation-critic-dispatched", stageId, (next) => {
        next.production.maturityLoop.status = "critic-running";
        next.production.maturityLoop.nextAction = `foundation-critic:${stageId}`;
        return next;
      });
      const criticCode = await runChildScript("run-foundation-visual-critic-v1.mjs", [`--stage=${stageId}`]);
      if (criticCode === 0) {
        persistMutation("visual-maturity-loop-critic-restored", stageId, (next) => {
          next.production.maturityLoop.criticCircuit = null;
          return next;
        }, {sourceAssetSha256});
        return {status: "FOUNDATION_CRITIC_COMPLETE", stageId};
      }
      const preflightCode = await runChildScript("run-local-foundation-preflight-v1.mjs", [`--stage=${stageId}`]);
      const blocked = persistMutation("visual-maturity-loop-critic-circuit-opened", stageId, (next) => {
        next.production.maturityLoop.criticCircuit = {
          contract: "A1VisualCriticCircuitBreaker/v1",
          status: "BLOCKED_VISUAL_CRITIC_UNAVAILABLE",
          stageId,
          sourceAssetSha256,
          criticExitCode: criticCode,
          preflightExitCode: preflightCode,
          openedAt: new Date().toISOString(),
          nextAction: `restore-visual-critic:${stageId}`,
        };
        next.production.maturityLoop.status = "blocked-visual-critic";
        next.production.maturityLoop.nextAction = `restore-visual-critic:${stageId}`;
        return next;
      }, {sourceAssetSha256, criticExitCode: criticCode, preflightExitCode: preflightCode});
      return {status: "BLOCKED_VISUAL_CRITIC_UNAVAILABLE", stageId, criticExitCode: criticCode, preflightExitCode: preflightCode, sourceAssetSha256: blocked.production.maturityLoop.criticCircuit.sourceAssetSha256};
    }

    workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const revision = workspace.library.assets
      .filter((asset) => asset.stageId === stageId && asset.review.status === "revise" && Number(asset.visualRevision?.round || 0) < workspace.production.maturityLoop.maxRoundsPerTarget)
      .sort((left, right) => Number(left.visualRevision?.round || 0) - Number(right.visualRevision?.round || 0))[0];
    if (revision) {
      const queued = persistMutation("visual-maturity-loop-foundation-revision-queued", revision.id, (next) => {
        const target = next.library.assets.find((asset) => asset.id === revision.id);
        target.revisionHistory ||= [];
        target.revisionHistory.push({round: target.visualRevision?.round || 1, assetUri: target.assetUri, sha256: target.sha256, visualCritic: target.visualCritic, archivedAt: new Date().toISOString()});
        target.promptBrief = foundationGenerationPrompt(target, stageId, target.visualRevision?.prompt || target.review.note);
        target.assetUri = null;
        target.sha256 = null;
        target.preview = null;
        target.visualCritic = null;
        target.status = "generation-ready";
        target.review = {status: "pending", note: `基础资产自动返修第 ${Number(target.visualRevision?.round || 1) + 1} 轮已排队。`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
        target.visualRevision.round = Number(target.visualRevision.round || 1) + 1;
        const result = queueAssetGeneration(next, target.id);
        next = result.workspace;
        next.production.generation.automaticDispatchAllowed = true;
        next.production.maturityLoop.status = "generating-foundation-revision";
        next.production.maturityLoop.nextAction = `generate-foundation-revision:${target.id}`;
        next.production.maturityLoop.counters.generated += result.jobs.length;
        return next;
      });
      const workerPid = startGenerationWorker();
      return {status: "FOUNDATION_REVISION_QUEUED", stageId, assetId: revision.id, workerPid, queue: queued.production.generation.summary};
    }
    const exhausted = workspace.library.assets.find((asset) => asset.stageId === stageId && asset.review.status === "revise" && Number(asset.visualRevision?.round || 0) >= workspace.production.maturityLoop.maxRoundsPerTarget);
    if (exhausted) {
      const strategyReset = persistMutation("visual-maturity-loop-foundation-strategy-reset", exhausted.id, (next) => {
        const target = next.library.assets.find((asset) => asset.id === exhausted.id);
        const strategyCycle = Number(target.visualStrategyCycle || 0) + 1;
        const resetLanguage = stageId === "background-foundry"
          ? "放弃此前通用纹理，重新从本篇文章的编辑、证据、版本和判断语义生成一块无字底材；只保留一个明确材质机制和可排版负空间。"
          : stageId === "element-atlas"
            ? "放弃此前装饰图标，重新生成可独立裁切、带透明间距、可绑定真实对象的编辑痕迹；不得出现 HUD 和无落点箭头。"
            : "放弃此前泛电影感，重新建立真实桌面、纸张、手部和屏幕之间的创作因果；无字、无假界面、无悬浮卡片。";
        target.revisionHistory ||= [];
        target.revisionHistory.push({round: target.visualRevision?.round || workspace.production.maturityLoop.maxRoundsPerTarget, strategyCycle: target.visualStrategyCycle || 0, assetUri: target.assetUri, sha256: target.sha256, visualCritic: target.visualCritic, archivedAt: new Date().toISOString()});
        target.visualStrategyCycle = strategyCycle;
        target.promptBrief = foundationGenerationPrompt(target, stageId, `自动策略重置 ${strategyCycle}：${resetLanguage}`);
        target.assetUri = null;
        target.sha256 = null;
        target.preview = null;
        target.visualCritic = null;
        target.status = "generation-ready";
        target.review = {status: "pending", note: `基础资产原策略连续 ${workspace.production.maturityLoop.maxRoundsPerTarget} 轮未达标，系统已更换生成原语。`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
        target.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: target.visualRevision?.sourceReportSha256 || null, prompt: resetLanguage, createdAt: new Date().toISOString()};
        const queued = queueAssetGeneration(next, target.id);
        next = queued.workspace;
        next.production.generation.automaticDispatchAllowed = true;
        next.production.maturityLoop.status = "generating-foundation-strategy-reset";
        next.production.maturityLoop.nextAction = `generate-foundation-strategy-reset:${target.id}:cycle-${strategyCycle}`;
        next.production.maturityLoop.counters.blocked += 1;
        next.production.maturityLoop.counters.generated += queued.jobs.length;
        return next;
      });
      const workerPid = startGenerationWorker();
      return {status: "FOUNDATION_STRATEGY_RESET_QUEUED", stageId, assetId: exhausted.id, strategyCycle: strategyReset.library.assets.find((asset) => asset.id === exhausted.id)?.visualStrategyCycle, workerPid, queue: strategyReset.production.generation.summary};
    }
    return {status: "FOUNDATION_ATTENTION_REQUIRED", stageId, report: previous || null};
  }

  const typographyGate = workspace.stages.find((item) => item.id === "typography-board")?.gate;
  if (!typographyGate?.pass) {
    return runTypographyDirectionTick(workspace);
  }
  if (!workspace.gates.requiredSourceMaterialsResolved) return {status: "SOURCE_MATERIALS_REQUIRED"};
  const packagingReady = automaticArticlePackagingKitReady(workspace).ready;
  persistMutation("visual-maturity-loop-foundation-stage-passed", null, (next) => {
    next.production.maturityLoop.currentStage = packagingReady ? "shot-candidates" : "article-assets";
    next.production.maturityLoop.status = "running";
    next.production.maturityLoop.nextAction = packagingReady ? "generate-34-shot-scene-graph-candidates" : "automatic-article-packaging-qa";
    return next;
  });
  return packagingReady ? {status: "FOUNDATION_STAGE_PASS"} : {status: "FOUNDATION_STAGE_PASS_WAITING_PACKAGING_QA"};
}

function runVisualTreatmentTick(workspace) {
  const director = workspace.production?.visualDirector;
  if (director?.contract !== "A1VisualGenerationDirector/v2" || director.status !== "treatment-review-required") return null;
  const audit = buildVisualTreatmentAudit(director);
  const treatmentJobsActive = (workspace.production?.generation?.jobs || [])
    .some((job) => job.generationRole === "treatment-anchor" && ["queued", "running"].includes(job.status));
  if (treatmentJobsActive) return {status: "TREATMENT_GENERATION_IN_PROGRESS", audit};
  const treatmentBatchProgress = director.treatmentBatchProgress;
  if (treatmentBatchProgress?.status === "failed") {
    const held = persistMutation("visual-treatment-critic-unavailable-hold", null, (next) => {
      const reason = String(treatmentBatchProgress.error || "treatment-batch-critic-failed").slice(0, 1200);
      const previousReview = next.production.visualDirector.treatmentBatchReview || {};
      next.production.generation.automaticDispatchAllowed = false;
      next.production.maturityLoop.currentStage = "visual-treatment";
      next.production.maturityLoop.status = "visual-critic-unavailable";
      next.production.maturityLoop.nextAction = "restore-visual-critic-and-rerun-treatment-batch";
      next.production.visualDirector.status = "treatment-review-required";
      next.production.visualDirector.treatmentReviewPolicy = {
        ...(next.production.visualDirector.treatmentReviewPolicy || {}),
        status: "BLOCKED_VISUAL_CRITIC_UNAVAILABLE",
        blockedAt: new Date().toISOString(),
        blocker: reason,
      };
      next.production.visualDirector.treatmentBatchReview = {
        ...previousReview,
        status: "UNAVAILABLE",
        modelRequestCount: 0,
        reviewedAt: new Date().toISOString(),
        trace: {
          ...(previousReview.trace || {}),
          criticUnavailable: true,
          criticUnavailableReason: reason,
          modelRequestCount: 0,
          reviewedAt: new Date().toISOString(),
        },
      };
      return next;
    }, {progress: treatmentBatchProgress, auditStatus: audit.status});
    return {status: "TREATMENT_REVIEW_BLOCKED_VISUAL_CRITIC_UNAVAILABLE", audit, blocker: treatmentBatchProgress.error, workspaceSha256: held.workspaceSha256};
  }
  if (audit.nextAction === "wait-treatment-composite-review") return {status: "TREATMENT_COMPOSITE_REVIEW_IN_PROGRESS", audit};
  if (audit.status === "PASS") {
    const adopted = persistMutation("visual-treatment-automatically-adopted", audit.championTreatmentId, (next) => {
      next = adoptVisualTreatmentAutomatically(next);
      next.production.generation.automaticDispatchAllowed = false;
      next.production.maturityLoop.currentStage = "anchor-suite";
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.nextAction = "prepare-six-shot-calibration-automatically";
      return next;
    }, {audit, predicate: "direction 2/2 >=22, zero hard failures, complete composite evidence"});
    return {status: "TREATMENT_AUTO_ADOPTED", treatmentId: adopted.production.visualDirector.selectedTreatmentId, treatmentHash: adopted.production.visualDirector.treatmentHash};
  }
  const freeze = buildVisualGenerationFreeze(director);
  if (freeze.frozen) {
    persistMutation("visual-treatment-generation-frozen", audit.championTreatmentId, (next) => {
      next.production.generation.automaticDispatchAllowed = false;
      next.production.visualDirector.generationFreeze = freeze;
      next.production.maturityLoop.currentStage = "visual-treatment";
      next.production.maturityLoop.status = "compositor-rewrite-required";
      next.production.maturityLoop.nextAction = "visual-treatment-compositor-rewrite-required";
      return next;
    }, {audit, freeze});
    return {status: "TREATMENT_GENERATION_FROZEN", audit, freeze};
  }
  if (audit.nextAction === "recheck-visual-treatment-composites") {
    const rechecked = persistMutation("visual-maturity-loop-treatment-composite-stability-recheck", null, (next) => {
      const result = requeueVisualTreatmentCompositeReview(next);
      next = result.workspace;
      next.production.maturityLoop.currentStage = "visual-treatment";
      next.production.maturityLoop.status = "rechecking-treatment-composites";
      next.production.maturityLoop.nextAction = "recheck-treatment-anchor-composites-for-stability";
      return next;
    }, {audit});
    const workerRoot = path.resolve(appRoot, "../..");
    const child = spawn(process.execPath, [path.join(workerRoot, "scripts/render-generated-visual-composite-v2.mjs")], {cwd: workerRoot, detached: true, stdio: "ignore"});
    child.unref();
    return {status: "TREATMENT_COMPOSITE_STABILITY_RECHECK_QUEUED", rendererPid: child.pid || null, candidateCount: rechecked.production.visualDirector.treatmentReviewPolicy?.requeuedCandidateCount || 0};
  }
  if (!director.treatmentBatchReview && director.treatmentReviewPolicy?.mode !== "treatment-anchor-rubric" && audit.status !== "PASS" && audit.items.some((item) => item.candidateId)) {
    const rechecked = persistMutation("visual-maturity-loop-treatment-composite-rubric-recheck", null, (next) => {
      const result = requeueVisualTreatmentCompositeReview(next);
      next = result.workspace;
      next.production.maturityLoop.currentStage = "visual-treatment";
      next.production.maturityLoop.status = "rechecking-treatment-composites";
      next.production.maturityLoop.nextAction = "recheck-treatment-anchor-composites";
      return next;
    }, {audit});
    const workerRoot = path.resolve(appRoot, "../..");
    const child = spawn(process.execPath, [path.join(workerRoot, "scripts/render-generated-visual-composite-v2.mjs")], {cwd: workerRoot, detached: true, stdio: "ignore"});
    child.unref();
    return {status: "TREATMENT_COMPOSITE_RUBRIC_RECHECK_QUEUED", rendererPid: child.pid || null, candidateCount: rechecked.production.visualDirector.treatmentReviewPolicy?.requeuedCandidateCount || 0};
  }
  if (audit.nextAction === "queue-treatment-anchor-generation") {
    const queued = persistMutation("visual-maturity-loop-treatment-anchors-queued", null, (next) => {
      const result = queueTreatmentAnchorGeneration(next);
      next = result.workspace;
      next.production.generation.workerStatus = "starting";
      next.production.maturityLoop.currentStage = "visual-treatment";
      next.production.maturityLoop.status = "generating-treatment-anchors";
      next.production.maturityLoop.nextAction = "generate-treatment-anchor-direction-set";
      return next;
    }, {briefCount: audit.briefCount, status: audit.status});
    const workerPid = startGenerationWorker();
    return {status: "TREATMENT_ANCHORS_QUEUED", workerPid, audit: buildVisualTreatmentAudit(queued.production.visualDirector)};
  }
  if (audit.nextAction === "revise-visual-treatment-anchors") {
    const revised = persistMutation("visual-maturity-loop-treatment-anchors-revised", null, (next) => {
      const result = reviseVisualTreatmentAnchors(next);
      next = result.workspace;
      next.production.generation.workerStatus = "idle";
      next.production.generation.automaticDispatchAllowed = false;
      next.production.maturityLoop.currentStage = "visual-treatment";
      next.production.maturityLoop.status = "rendering-treatment-compositor-revision";
      next.production.maturityLoop.nextAction = `render-treatment-compositor-revision:${result.audit.maxRevisionRound + 1}`;
      return next;
    }, {audit, imageGenerationDispatched: false});
    const workerRoot = path.resolve(appRoot, "../..");
    const child = spawn(process.execPath, [path.join(workerRoot, "scripts/render-generated-visual-composite-v2.mjs")], {cwd: workerRoot, detached: true, stdio: "ignore"});
    child.unref();
    return {status: "TREATMENT_COMPOSITOR_REVISION_QUEUED", rendererPid: child.pid || null, audit, queuedJobCount: 0, candidateCount: revised.production.visualDirector.treatmentRevision?.requeuedCandidateIds?.length || 0};
  }
  return {status: "TREATMENT_REVIEW_REQUIRED", audit};
}

async function tick() {
  let workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const packagingApproval = autoApproveArticlePackagingKit(workspace);
  if (packagingApproval.status === "approved") workspace = packagingApproval.workspace;
  const treatmentTick = runVisualTreatmentTick(workspace);
  if (treatmentTick) return treatmentTick;
  if (visualDirectorOwnsPipeline(workspace)) {
    return {
      status: "DELEGATED_TO_VISUAL_DIRECTOR",
      owner: workspace.production.visualDirector.contract,
      directorStatus: workspace.production.visualDirector.status,
      nextAction: "run-visual-director-generation-and-composite-review",
    };
  }
  // A previous full-film best-effect board is historical evidence only. It
  // must not pause the current unattended article-packaging and shot-quality
  // loop; the current source dependencies and critic reports decide whether a
  // shot is regenerated or blocked.
  if (!workspace.production.maturityLoop.userDirectiveAt) {
    workspace = persistMutation("visual-maturity-loop-started", null, (next) => {
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.nextAction = "evaluate-anchor-assets";
      return next;
    }, {shotStaticTargetScore: 22, representativeMotionTargetScore: 22, maxRoundsPerTarget: 2, sameStrategyRetryLimit: 1, maxVisualStrategyCycles: 2, approvalPauseDisabledByUser: true});
  }

  const queue = workspace.production.generation.summary;
  if (queue.running || queue.queued) {
    persistMutation("visual-maturity-loop-waiting-generation", null, (next) => {
      next.production.maturityLoop.status = "waiting-generation";
      next.production.maturityLoop.nextAction = `wait-generation:${next.production.generation.summary.running}-running:${next.production.generation.summary.queued}-queued`;
      return next;
    }, queue);
    return {status: "WAITING_GENERATION", queue};
  }

  if (workspace.production.authority?.nextAction?.id === "visual-anchor-strategy-switch-required") {
    persistMutation("visual-maturity-loop-visual-anchor-strategy-switch-required", null, (next) => {
      next.production.maturityLoop.status = "attention-required";
      next.production.maturityLoop.currentStage = "anchor-suite";
      next.production.maturityLoop.nextAction = "visual-anchor-strategy-switch-required";
      return next;
    }, {targetShotIds: workspace.production.authority.nextAction.targetShotIds || []});
    return {status: "VISUAL_ANCHOR_STRATEGY_SWITCH_REQUIRED", targetShotIds: workspace.production.authority.nextAction.targetShotIds || []};
  }

  const currentStage = workspace.production.maturityLoop.currentStage;
  if (["article-assets", "foundation-assets"].includes(currentStage)) return runFoundationTick(workspace);
  // Once the visual treatment is adopted, the authority deliberately stays
  // in `anchor-suite` until the six representative shots pass.  Route that
  // stage through the same bounded candidate/critic loop; otherwise the
  // legacy tick falls through to the typography anchor branch and reports a
  // false no-op instead of repairing ED-10/ED-32 and the other exceptions.
  if (["anchor-suite", "shot-candidates", "design-calibration", "chapter-shot-batches", "accepted-shot-ir"].includes(currentStage)) return runShotCandidateTick(workspace);
  if (currentStage === "representative-motion") return runRepresentativeMotionTick(workspace);
  if (["full-film", "full-film-review"].includes(currentStage)) return runFullFilmTick(workspace);

  const glyphs = workspace.library.assets.filter((asset) => asset.route === "generated-glyph" && asset.requiredForShotComposition);
  const readyForCritic = glyphs.find((asset) => asset.assetUri && (asset.typographySpec?.generatedCandidates?.length || 0) >= (asset.typographySpec?.candidateMinimum || 4) && !asset.visualCritic);
  if (readyForCritic) {
    persistMutation("visual-maturity-loop-critic-dispatched", readyForCritic.id, (next) => {
      next.production.maturityLoop.status = "critic-running";
      next.production.maturityLoop.nextAction = `visual-critic:${readyForCritic.id}`;
      return next;
    });
    const child = spawn(process.execPath, [path.join(root, "scripts/run-visual-maturity-critic-v1.mjs"), "--asset", readyForCritic.id], {cwd: root, stdio: "inherit", env: process.env});
    const code = await new Promise((resolve) => child.on("close", resolve));
    if (code !== 0) {
      persistMutation("visual-maturity-loop-critic-failed", readyForCritic.id, (next) => {
        next.production.maturityLoop.status = "attention-required";
        next.production.maturityLoop.nextAction = `retry-visual-critic:${readyForCritic.id}`;
        next.production.maturityLoop.counters.blocked += 1;
        return next;
      }, {exitCode: code});
      return {status: "CRITIC_FAILED", assetId: readyForCritic.id, exitCode: code};
    }
    return {status: "CRITIC_COMPLETE", assetId: readyForCritic.id};
  }

  workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const ungeneratedBeforeRevision = glyphs.map((glyph) => workspace.library.assets.find((item) => item.id === glyph.id)).find((asset) => !asset?.assetUri && asset?.status !== "approved");
  const revisionTarget = ungeneratedBeforeRevision ? null : glyphs
    .map((glyph) => workspace.library.assets.find((item) => item.id === glyph.id))
    .filter((asset) => asset?.review.status === "revise" && Number(asset.visualRevision?.round || 0) < workspace.production.maturityLoop.maxRoundsPerTarget)
    .sort((left, right) => Number(left.visualRevision?.round || 0) - Number(right.visualRevision?.round || 0))[0];
  if (revisionTarget) {
    const revised = persistMutation("visual-maturity-loop-revision-queued", revisionTarget.id, (next) => {
      const target = next.library.assets.find((asset) => asset.id === revisionTarget.id);
      const repair = target.visualRevision?.prompt || target.review.note || "重做构图原语并消除硬失败。";
      target.revisionHistory ||= [];
      target.revisionHistory.push({round: target.visualRevision?.round || 1, assetUri: target.assetUri, sha256: target.sha256, visualCritic: target.visualCritic, archivedAt: new Date().toISOString()});
      target.promptBrief = `${target.promptBrief}\n\n本轮自动红队返修：${repair}`;
      target.assetUri = null;
      target.sha256 = null;
      target.preview = null;
      target.selectedCandidateId = null;
      target.visualCritic = null;
      target.typographySpec.generatedCandidates = [];
      target.typographySpec.textVerification = {status: "pending", expectedText: target.typographySpec.exactText, observedText: null, reviewedBy: null};
      target.status = "generation-ready";
      target.review = {status: "pending", note: `自动返修第 ${target.visualRevision.round + 1} 轮已排队。`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
      target.visualRevision.round += 1;
      const queued = queueAssetGeneration(next, target.id);
      next = queued.workspace;
      next.production.generation.automaticDispatchAllowed = true;
      next.production.maturityLoop.status = "generating-revision";
      next.production.maturityLoop.nextAction = `generate-revision:${target.id}:round-${target.visualRevision.round}`;
      next.production.maturityLoop.counters.revise += 1;
      next.production.maturityLoop.counters.generated += queued.jobs.length;
      return next;
    }, {previousScore: revisionTarget.visualCritic?.totalScore || null});
    const pid = startGenerationWorker();
    return {status: "REVISION_QUEUED", assetId: revisionTarget.id, workerPid: pid, queue: revised.production.generation.summary};
  }

  const exhausted = glyphs.find((asset) => asset.review.status === "revise" && Number(asset.visualRevision?.round || 0) >= workspace.production.maturityLoop.maxRoundsPerTarget);
  if (exhausted) {
    const strategyLanguages = [
      "放弃此前构图，改用真实纸张受力、撕裂边缘与套色错位，让词组由材料关系而非装饰成立。",
      "放弃此前构图，改用像素字与超尺度裁切形成一个单体轮廓；只保留一个主动作，不做样张网格。",
      "放弃此前构图，改用编辑台证据、局部遮罩与可追踪删改关系；所有标记必须落到具体字词。",
      "放弃此前构图，改用黑白高反差、孤立字形与一处朱红物理碰撞；删除所有说明性标签。",
    ];
    const strategyReset = persistMutation("visual-maturity-loop-generation-strategy-reset", exhausted.id, (next) => {
      const target = next.library.assets.find((asset) => asset.id === exhausted.id);
      const strategyCycle = Number(target.visualStrategyCycle || 0) + 1;
      target.revisionHistory ||= [];
      target.revisionHistory.push({round: target.visualRevision?.round || workspace.production.maturityLoop.maxRoundsPerTarget, strategyCycle: target.visualStrategyCycle || 0, assetUri: target.assetUri, sha256: target.sha256, visualCritic: target.visualCritic, archivedAt: new Date().toISOString()});
      target.visualStrategyCycle = strategyCycle;
      target.promptBrief = `${target.promptBrief}\n\n自动策略重置 ${strategyCycle}：${strategyLanguages[(strategyCycle - 1) % strategyLanguages.length]} 上一策略最高影响问题：${target.visualRevision?.prompt || target.review.note}`;
      target.assetUri = null;
      target.sha256 = null;
      target.preview = null;
      target.selectedCandidateId = null;
      target.visualCritic = null;
      target.typographySpec.generatedCandidates = [];
      target.typographySpec.textVerification = {status: "pending", expectedText: target.typographySpec.exactText, observedText: null, reviewedBy: null};
      target.status = "generation-ready";
      target.review = {status: "pending", note: `原策略连续 ${workspace.production.maturityLoop.maxRoundsPerTarget} 轮未达标，已自动切换视觉语言 ${strategyCycle}。`, reviewedAt: new Date().toISOString(), reviewedBy: "system", approvedContentSha256: null};
      target.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: target.visualRevision?.sourceReportSha256 || null, prompt: strategyLanguages[(strategyCycle - 1) % strategyLanguages.length], createdAt: new Date().toISOString()};
      const queued = queueAssetGeneration(next, target.id);
      next = queued.workspace;
      next.production.generation.automaticDispatchAllowed = true;
      next.production.maturityLoop.status = "generating-strategy-reset";
      next.production.maturityLoop.nextAction = `generate-strategy-reset:${target.id}:cycle-${strategyCycle}`;
      next.production.maturityLoop.counters.blocked += 1;
      next.production.maturityLoop.counters.generated += queued.jobs.length;
      return next;
    }, {maxRounds: workspace.production.maturityLoop.maxRoundsPerTarget});
    const workerPid = startGenerationWorker();
    return {status: "STRATEGY_RESET_QUEUED", assetId: exhausted.id, strategyCycle: strategyReset.library.assets.find((asset) => asset.id === exhausted.id)?.visualStrategyCycle, workerPid, queue: strategyReset.production.generation.summary};
  }

  const ungenerated = glyphs.find((asset) => !asset.assetUri && asset.status !== "approved");
  if (ungenerated) {
    const queued = persistMutation("visual-maturity-loop-anchor-queued", ungenerated.id, (next) => {
      const target = next.library.assets.find((asset) => asset.id === ungenerated.id);
      if (target.status === "brief-ready") target.status = "generation-ready";
      const result = queueAssetGeneration(next, target.id);
      next = result.workspace;
      next.production.generation.automaticDispatchAllowed = true;
      next.production.maturityLoop.status = "generating-anchor";
      next.production.maturityLoop.nextAction = `generate-anchor:${target.id}`;
      next.production.maturityLoop.counters.generated += result.jobs.length;
      return next;
    });
    const pid = startGenerationWorker();
    return {status: "ANCHOR_QUEUED", assetId: ungenerated.id, workerPid: pid, queue: queued.production.generation.summary};
  }

  if (glyphs.every((asset) => asset.review.status === "approved" && asset.visualCritic?.totalScore >= 22)) {
    persistMutation("visual-maturity-loop-anchor-stage-passed", null, (next) => {
      next.production.maturityLoop.status = "running";
      next.production.maturityLoop.currentStage = "foundation-assets";
      next.production.maturityLoop.nextAction = "evaluate-foundation-assets";
      next.production.maturityLoop.counters.passed = glyphs.length;
      return next;
    }, {approvedAnchorCount: glyphs.length});
    return {status: "ANCHOR_STAGE_PASS", count: glyphs.length};
  }

  return {status: "NO_ACTION", stage: workspace.production.maturityLoop.currentStage};
}

do {
  try {
    const result = await tick();
    console.log(JSON.stringify(result));
    if (["VISUAL_ANCHOR_SUITE_AUTO_ADOPTED", "DELEGATED_TO_VISUAL_DIRECTOR", "ARTICLE_PACKAGING_KIT_REVIEW_REQUIRED"].includes(result?.status)) break;
  } catch (error) {
    console.error(error);
  }
  if (once) break;
  await sleep(tickIntervalMs);
} while (true);
