#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildVideoPackagingContext, buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed07-safe-region-revision-expected-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const directionFingerprint = (direction) => [direction.primaryFamily, direction.aestheticRoute, direction.dominantActor, direction.composition, direction.surface, direction.material, direction.paletteRole, direction.baseVideoRelationship].join("|");

const revisedDirections = [
  {
    primaryFamily: "one-bit-character-object",
    aestheticRoute: "QUESTION_OVERLAY_OBJECT_STRUCTURAL_REVISION",
    dominantActor: "像素作者把带有AI全文输出痕迹的纸条重新装进人工写作工作台",
    composition: "large-two-object-question-and-workbench-in-expanded-left-field",
    surface: "one-bit-character-plus-old-window-workbench-and-newsprint-dot-rows",
    material: "cream-newsprint-cobalt-registration-with-one-vermilion-question-pointer",
    paletteRole: "cream-charcoal-cobalt-with-vermilion-question",
    motionPotential: "ai-output-paper-enters-human-workbench-then-question-holds",
  },
  {
    primaryFamily: "isometric-machine-collage",
    aestheticRoute: "QUESTION_OVERLAY_OBJECT_STRUCTURAL_REVISION",
    dominantActor: "AI自动全文纸卷与人工写作工作台形成可读的两对象对照",
    composition: "large-isometric-human-workbench-next-to-ai-output-scroll-in-expanded-left-field",
    surface: "two-object-machine-relation-with-old-window-frame-and-no-generic-ui",
    material: "pixel-cut-paper-machine-cobalt-shadow-vermilion-switch-and-print-dots",
    paletteRole: "paper-charcoal-cobalt-with-vermilion-switch",
    motionPotential: "ai-output-scroll-arrives-then-human-workbench-reopens-the-question",
  },
  {
    primaryFamily: "pixel-type-actor",
    aestheticRoute: "QUESTION_OVERLAY_OBJECT_STRUCTURAL_REVISION",
    dominantActor: "放大的反问牌连接AI直写输出与作者亲手完成的写作工作台",
    composition: "oversized-question-sign-links-ai-output-window-to-built-workbench-in-expanded-left-field",
    surface: "hard-pixel-type-actor-plus-old-window-and-process-dot-rhythm",
    material: "hard-pixel-newsprint-grain-cobalt-object-shadow-and-one-vermilion-pointer",
    paletteRole: "cream-charcoal-cobalt-with-one-vermilion-pointer",
    motionPotential: "question-sign-points-from-ai-output-to-human-workbench-then-freezes",
  },
];

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed07-safe-region-revision-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed07-safe-region-revision-requires-idle-frozen-worker");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("ed07-safe-region-revision-assembly-already-created");

  const now = new Date().toISOString();
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-07");
  const existingContext = runtime.videoPackagingContexts.items.find((item) => item.shotId === "ED-07");
  const decision = runtime.decisionSet.items.find((item) => item.shotId === "ED-07");
  if (!plan || !existingContext || !decision) throw new Error("ed07-safe-region-revision-input-missing");
  const previousPlanSha256 = plan.planSha256;
  const previousContextSha256 = existingContext.contextSha256;

  runtime.packageLookMasterPlanHistory = [...(runtime.packageLookMasterPlanHistory || []), {...structuredClone(plan), current: false, status: "HISTORY_READ_ONLY", supersededAt: now, supersededBy: "ed07-safe-region-structural-revision-v1"}];
  runtime.videoPackagingContextHistory = [...(runtime.videoPackagingContextHistory || []), {...structuredClone(existingContext), current: false, status: "HISTORY_READ_ONLY", supersededAt: now, supersededBy: "ed07-safe-region-structural-revision-v1"}];

  const rebuiltContext = buildVideoPackagingContext({
    decision: {...decision, packageDecision: "PACKAGE"},
    demand: {editWindow: existingContext.timelineRange},
    holdFrame: existingContext.baseFrame,
    subjectBounds: existingContext.subjectBounds,
    safeZones: existingContext.safeZones,
    visualAnchors: existingContext.visualAnchors,
    createdAt: now,
  });
  const contextSet = buildVideoPackagingContextSet(runtime.videoPackagingContexts.items.map((item) => item.shotId === "ED-07" ? rebuiltContext : item), {createdAt: now});
  runtime.videoPackagingContexts = contextSet;

  plan.videoContext = structuredClone(rebuiltContext);
  plan.candidateDirections = revisedDirections.map((direction, index) => {
    const previous = plan.candidateDirections[index];
    if (!previous) throw new Error(`ed07-safe-region-revision-direction-missing:${index + 1}`);
    const nextDirection = {...previous, ...direction, visualPrimitiveSwitchId: "ed07-safe-region-structural-revision-v1", structuralRevision: "one-bounded-structural-revision-after-actual-visual-review"};
    nextDirection.fingerprint = directionFingerprint(nextDirection);
    return nextDirection;
  });
  plan.planRevision = "ed07-safe-region-structural-revision-v1";
  plan.visualPrimitiveSwitch = {
    contract: "A1VisualPrimitiveSwitch/v1",
    status: "APPLIED",
    id: "ed07-safe-region-structural-revision-v1",
    appliedAt: now,
    previousPlanSha256,
    reason: "实际脸/眼几何已通过，但原可用负空间过窄导致完整反问与工作台在三秒内过小；扩展到真实主体左侧空场并加入AI输出→人工工作台双对象因果。",
  };
  plan.planSha256 = sha256(planIdentity(plan));
  plan.status = "SEMANTIC_REVIEW_REQUIRED";
  delete plan.wholeFilmBoardRecommendation;
  delete plan.provisionalWholeFilmBoardSelection;
  assertPackageLookMasterPlan(plan);

  for (const raw of runtime.lookMasterRawReferences.filter((item) => item.shotId === "ED-07" && item.current === true)) {
    raw.current = false;
    raw.historyReadOnly = true;
    raw.recommendationEligible = false;
    raw.selectionEligible = false;
    raw.assemblyEligible = false;
    raw.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_SAFE_REGION_RECOMPILE";
    raw.supersededAt = now;
    raw.supersededByPlanSha256 = plan.planSha256;
  }

  runtime.status = "CANDIDATE_SELECTION_PENDING";
  runtime.wholeFilmBatchRecommendation = {
    ...(runtime.wholeFilmBatchRecommendation || {}),
    status: "PARTIAL_WITH_EXCEPTIONS",
    finalizedShotIds: [],
    exceptions: [{shotId: "ED-07", code: "LOOK_MASTER_VISUAL_PRIMITIVE_REPAIR_REQUIRED", immediateRegenerationAllowed: true}],
    explorationOnly: true,
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    reconciliationRequired: false,
    nextUserGate: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    staticBoard: null,
    updatedAt: now,
  };
  next.production.authority.nextAction = {
    ...(next.production.authority.nextAction || {}),
    id: "repair-look-master-exceptions",
    label: "只修复 ED-07 当前候选硬门禁；ED-14 已通过，不重生已 PASS 原图、不进入 Assembly",
    requiresUser: false,
    targetShotIds: ["ED-07"],
    reviewGate: null,
  };
  next.production.packagingStyleAuthority = structuredClone(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY);
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  next.production.generationRecompile = {
    ...(next.production.generationRecompile || {}),
    contract: "A1ED07SafeRegionStructuralRecompile/v1",
    status: "APPLIED",
    targetShotIds: ["ED-07"],
    previousWorkspaceSha256: current.workspaceSha256,
    previousPlanSha256,
    previousContextSha256,
    currentPlanSha256: plan.planSha256,
    currentContextSha256: rebuiltContext.contextSha256,
    appliedAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "recompile-ed07-safe-region-structural-revision-v1", targetId: "ED-07", payload: {contract: "A1ED07SafeRegionStructuralRevision/v1", previousPlanSha256, currentPlanSha256: plan.planSha256, previousContextSha256, currentContextSha256: rebuiltContext.contextSha256, expandedRegion: rebuiltContext.availableRegions.find((item) => item.id === "expanded-left") || null, generatedImageCount: 0, oldPngPreserved: true, assemblyCreated: false, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.deepEqual(recalculated.production.authority.nextAction.targetShotIds, ["ED-07"]);
  const report = {contract: "A1ED07SafeRegionStructuralRevisionReport/v1", status: "PASS", workspaceSha256Before: current.workspaceSha256, previousPlanSha256, currentPlanSha256: plan.planSha256, previousContextSha256, currentContextSha256: rebuiltContext.contextSha256, expandedRegion: rebuiltContext.availableRegions.find((item) => item.id === "expanded-left") || null, generatedImageCount: 0, oldPngPreserved: true, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length, downstreamLocked: true, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `ed07-safe-region-structural-revision-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"ed07-safe-region-structural-revision-v1/latest.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
