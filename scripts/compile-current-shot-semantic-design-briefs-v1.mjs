#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {compileShotSemanticDesignBriefSet, auditUniqueArtifactCandidates} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {buildPackageLookMasterPlan} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {alignShotIntelligenceDecisionSetWithCoveragePlan, reconcileSemanticTimelineRevision} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {compileWholeFilmVisualArchitecture} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const upgradedRunPath = path.join(root, ".codex-artifacts/system-progress-system-line/current-project-visual-contract-upgrade-v1/current-article-run.json");
const sourcePlateManifestPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/source-cache/semantic-source-plates-v1/manifest.json");
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const now = new Date().toISOString();
if (!fs.existsSync(upgradedRunPath)) throw new Error("semantic-director-upgrade-run-missing");
const directorRun = JSON.parse(fs.readFileSync(upgradedRunPath, "utf8"));
if (directorRun.status !== "completed" || directorRun.plan.shots.some((shot) => !shot.viewerQuestion || !shot.semanticActor?.identity || !shot.semanticActor?.action)) throw new Error("semantic-director-upgrade-incomplete");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued || current.production.generation.summary.running) throw new Error("semantic-brief-compile-requires-idle-generation-queue");
  const sourceBindingsByShotHash = {};
  if (fs.existsSync(sourcePlateManifestPath)) {
    const plate = JSON.parse(fs.readFileSync(sourcePlateManifestPath, "utf8"));
    if (plate.contract === "A1NamedEntitySourcePlate/v1" && plate.articleSourceHash === current.article.sourceTextSha256) {
      sourceBindingsByShotHash[plate.shotSourceHash] = [{publicUrl: plate.publicUrl, sha256: plate.sha256, sourceKind: "OFFICIAL_NAMED_ENTITY_SOURCE_PLATE", role: "REAL_EVIDENCE_INPUT", usageClass: plate.usageClass, exactPixelRebindRequired: true, identities: plate.sources.map((item) => item.label)}];
    }
  }
  const bindingDirectorRun = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json"), "utf8"));
  const revisionReconciliation = reconcileSemanticTimelineRevision({
    decisionSet: current.production.shotIntelligence.decisionSet,
    beats: current.production.packagingBeatPlan.semanticBeats,
    sourceHash: current.article.sourceTextSha256,
    projectId: current.production.project.projectId,
    now,
  });
  const compileWorkspace = revisionReconciliation.invalidated
    ? {
      ...current,
      production: {
        ...current.production,
        shotIntelligence: {...current.production.shotIntelligence, decisionSet: revisionReconciliation.decisionSet},
      },
    }
    : current;
  const briefSet = compileShotSemanticDesignBriefSet({workspace: compileWorkspace, directorRun, bindingDirectorRun, appRoot, sourceBindingsByShotHash, now});
  const referenceManifest = JSON.parse(fs.readFileSync(referenceManifestPath, "utf8"));
  const styleBriefs = current.production.packagingStyleBriefs || [];
  const decisionsByShotId = new Map((revisionReconciliation.decisionSet.items || []).map((item) => [item.shotId || item.beatId, item]));
  const researchPacketsByShotId = new Map((current.production.shotIntelligence.researchPackets || []).map((item) => [item.shotId, item]));
  const videoContexts = current.production.shotIntelligence.videoPackagingContexts?.items || current.production.shotIntelligence.videoPackagingContexts || [];
  const recompiledPlans = (current.production.shotIntelligence.packageLookMasterPlans || []).filter((previousPlan) => {
    const brief = briefSet.briefs.find((item) => item.shotId === previousPlan.shotId);
    return brief?.packageDecision === "PACKAGE";
  }).map((previousPlan) => {
    const brief = briefSet.briefs.find((item) => item.shotId === previousPlan.shotId);
    const decision = decisionsByShotId.get(previousPlan.shotId);
    const styleBrief = styleBriefs.find((item) => item.sourceBeatIds?.includes(previousPlan.shotId));
    const videoContext = videoContexts.find((item) => item.shotId === previousPlan.shotId && item.sourceHash === brief?.shotSourceHash);
    if (!brief || brief.status !== "READY" || !decision || !styleBrief || !videoContext) throw new Error(`semantic-plan-recompile-input-missing:${previousPlan.shotId}`);
    // Preserve verified ED-14 / ED-12 source conditioning bindings from the
    // current plan. A semantic brief's productionSourceBindings intentionally
    // excludes the presenter hold frame and may be narrower than an existing
    // verified research source plate; dropping these here would silently turn
    // a source-bound shot back into a generated-only shot.
    const sourceEvidenceInputs = structuredClone(previousPlan.sourceEvidenceInputs || []);
    return buildPackageLookMasterPlan(decision, styleBrief, {
      now,
      previousPlan: null,
      semanticBrief: brief,
      referenceManifest,
      researchPacket: researchPacketsByShotId.get(previousPlan.shotId) || null,
      sourceEvidenceInputs,
      videoContext,
    });
  });
  const oldCandidateJobs = (current.production.generation.jobs || []).filter((job) => job.generationMode === "FAST_CANDIDATE_DISCOVERY" && job.createdAt >= "2026-08-05T12:00:00.000Z" && job.output?.sha256);
  const oldCandidates = oldCandidateJobs.map((job) => ({candidateId: job.id, shotId: job.shotId, artifact: job.output}));
  const duplicateAudit = auditUniqueArtifactCandidates(oldCandidates);
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  runtime.decisionSet = revisionReconciliation.decisionSet;
  runtime.semanticDesignBriefSet = briefSet;
  runtime.semanticRouteMap = {contract: "A1ShotSemanticRouteMap/v1", articleSourceHash: briefSet.articleSourceHash, shotCount: briefSet.shotCount, routes: briefSet.routeMap, routeMapSha256: briefSet.briefSetSha256, generatedAt: now};
  // The semantic brief is the beat-level PACKAGE/NO_PACKAGE authority.  A
  // prior run could leave the legacy coverage route and aligned decision set
  // at a different cardinality (notably ED-23: real screen evidence, not a
  // generated Look Master).  Reconcile those derived views in the same
  // transaction before the workbench assertion runs; otherwise a valid
  // semantic recompile is rejected by stale 13-vs-12 parity.
  const semanticWorkspace = structuredClone(next);
  semanticWorkspace.production.shotIntelligence.decisionSet = revisionReconciliation.decisionSet;
  const semanticArchitecture = compileWholeFilmVisualArchitecture(semanticWorkspace, {now});
  runtime.decisionSet = alignShotIntelligenceDecisionSetWithCoveragePlan(runtime.decisionSet, semanticArchitecture.coveragePlan, {now});
  const currentSemanticPackageShotIds = new Set(semanticArchitecture.coveragePlan.shotPlans.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId));
  if (runtime.videoPackagingContexts?.contract === "A1VideoPackagingContextSet/v1") {
    runtime.videoPackagingContexts = buildVideoPackagingContextSet(
      runtime.videoPackagingContexts.items.filter((item) => currentSemanticPackageShotIds.has(item.shotId)),
      {createdAt: runtime.videoPackagingContexts.createdAt || now},
    );
  }
  next.production.shotVisualCoveragePlan = semanticArchitecture.coveragePlan;
  next.production.wholeFilmGenerationReadiness = semanticArchitecture.generationReadiness;
  next.production.visualProductionRun = semanticArchitecture.productionRun;
  runtime.semanticPilot = {contract: "A1SemanticPilotRun/v1", status: "BRIEFS_COMPILED_PILOT_NOT_STARTED", targetPolicy: ["NAMED_ENTITY_REAL_SOURCE", "METHOD_SEQUENCE", "HISTORY_ISOLATION_OR_CONCEPT_REPLACEMENT"], targetShotIds: [], candidateIds: [], recommendation: null, selected: null, currentAssembly: [], contactSheet: null, imageGenerationPerformed: false, layerReconstructionPerformed: false, criticPerformed: false, motionPerformed: false, updatedAt: now};
  runtime.packageLookMasterPlanHistory = [
    ...(runtime.packageLookMasterPlanHistory || []),
    ...(current.production.shotIntelligence.packageLookMasterPlans || [])
      .filter((previousPlan) => !recompiledPlans.some((plan) => plan.shotId === previousPlan.shotId))
      .map((previousPlan) => ({...previousPlan, status: "HISTORY_READ_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY"})),
  ];
  const currentPackageShotIds = new Set(recompiledPlans.map((plan) => plan.shotId));
  const videoContextSet = runtime.videoPackagingContexts;
  if (videoContextSet?.contract === "A1VideoPackagingContextSet/v1") {
    runtime.videoPackagingContextHistory = [
      ...(runtime.videoPackagingContextHistory || []),
      ...videoContextSet.items.filter((item) => !currentPackageShotIds.has(item.shotId)),
    ];
    runtime.videoPackagingContexts = {
      ...videoContextSet,
      items: videoContextSet.items.filter((item) => currentPackageShotIds.has(item.shotId)),
      summary: {...videoContextSet.summary, contextCount: currentPackageShotIds.size},
    };
  }
  runtime.packageLookMasterPlans = recompiledPlans.map((plan) => ({
    ...plan,
    status: "SEMANTIC_REVIEW_REQUIRED",
    candidates: (plan.candidates || []).map((candidate) => ({...candidate, status: "EXPLORATION_ONLY", semanticDisposition: "SEMANTIC_REVIEW_REQUIRED", recommendationEligible: false, current: false})),
    recommendation: null,
    selectedLookMasterId: null,
    selectedLookMasterBinding: null,
    reviewDecision: null,
    currentAssembly: [],
    activeCandidateSet: plan.activeCandidateSet ? {...plan.activeCandidateSet, status: "HISTORY_READ_ONLY", selectedDirectionId: null, recommendationDirectionId: null, current: false} : null,
    explorationDisposition: "OLD_EXPLORATION_IMAGES_DO_NOT_REPRESENT_ARTICLE_PACKAGING_PLAN",
  }));
  runtime.lookMasterRawReferences = (runtime.lookMasterRawReferences || []).map((item) => ({...item, status: "EXPLORATION_ONLY", current: false, recommendationEligible: false}));
  next.production.generation.jobs = next.production.generation.jobs.map((job) => oldCandidateJobs.some((item) => item.id === job.id) ? {...job, semanticDisposition: "EXPLORATION_ONLY_SEMANTIC_REVIEW_REQUIRED", recommendationEligible: false} : job);
  runtime.packageAssemblyRecipes = (runtime.packageAssemblyRecipes || []).map((recipe) => ({...recipe, status: "VISUAL_REJECTED", authorityScope: "HISTORY_READ_ONLY", current: false, selected: false}));
  runtime.packageAssetKitPlans = (runtime.packageAssetKitPlans || []).map((kit) => ({...kit, status: "HISTORY_READ_ONLY", current: false}));
  runtime.currentAssembly = [];
  runtime.status = briefSet.status === "READY" ? "SEMANTIC_BRIEFS_READY" : "SEMANTIC_INPUTS_PARTIAL";
  runtime.wholeFilmBatchRecommendation = {
    ...(runtime.wholeFilmBatchRecommendation || {}),
    status: "SEMANTIC_REVIEW_REQUIRED",
    explorationOnly: true,
    label: "旧探索图不代表文章包装方案",
    recommendation: null,
    selected: null,
    currentAssembly: [],
    duplicateAudit,
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    updatedAt: now,
  };
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.authority.currentStage = "shot-semantic-briefs";
  next.production.authority.nextAction = "semantic-pilot-input-readiness";
  next.production.authority.nextActionLabel = "先验证三种语义路线，不扩展全片生图";
  next.production.authority.requiresUserAction = false;
  const event = createProductionEvent({workspace: current, action: "shot-semantic-design-briefs-compiled", targetId: briefSet.briefSetSha256, payload: {contract: briefSet.contract, shotCount: briefSet.shotCount, status: briefSet.status, blockedShotIds: briefSet.briefs.filter((item) => item.status !== "READY").map((item) => item.shotId), oldExplorationCandidateCount: oldCandidates.length, uniqueOldArtifactCount: duplicateAudit.uniqueArtifactCount, recommendationBlockedByDuplicates: duplicateAudit.status !== "PASS", imageGenerationPerformed: false, singleWriterTaskId}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const report = {contract: "A1ShotSemanticDesignBriefCompilationReport/v1", status: briefSet.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, directorRunSource: path.relative(root, upgradedRunPath), articleSourceHash: briefSet.articleSourceHash, shotCount: briefSet.shotCount, readyCount: briefSet.briefs.filter((item) => item.status === "READY").length, blocked: briefSet.briefs.filter((item) => item.status !== "READY").map((item) => ({shotId: item.shotId, status: item.status, evidenceRoute: item.evidenceRoute})), routes: briefSet.routeMap, recompiledLookMasterPlanCount: recompiledPlans.length, recompiledDataChainVersionCounts: recompiledPlans.reduce((counts, plan) => ({...counts, [plan.dataChainVersion]: (counts[plan.dataChainVersion] || 0) + 1}), {}), oldExplorationCandidateCount: oldCandidates.length, duplicateAudit, semanticTimelineRevision: revisionReconciliation.revision, queue: recalculated.production.generation.summary, singleWriterTaskId, generatedAt: now};
  persistProjectState(appRoot, recalculated, {event, files: {"whole-film-semantic-director-run-v1.json": directorRun, "shot-semantic-design-briefs-v1.json": briefSet, "shot-semantic-route-map-v1.json": runtime.semanticRouteMap, "shot-semantic-design-briefs-v1/report.json": report}});
  return {workspace: recalculated, report};
});

console.log(JSON.stringify({status: result.report.status, shotCount: result.report.shotCount, readyCount: result.report.readyCount, blocked: result.report.blocked, oldExplorationCandidateCount: result.report.oldExplorationCandidateCount, duplicateStatus: result.report.duplicateAudit.status, workspaceSha256: result.workspace.workspaceSha256, queue: result.report.queue, singleWriterTaskId}, null, 2));
