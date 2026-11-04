#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/iu.test(String(expectedWorkspaceSha256 || ""))) throw new Error("visual-blocker-primitive-switch-expected-workspace-sha-required");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const directionFingerprint = (direction) => [
  direction.primaryFamily,
  direction.aestheticRoute,
  direction.dominantActor,
  direction.composition,
  direction.surface,
  direction.material,
  direction.paletteRole,
  direction.baseVideoRelationship,
].join("|");

const replacements = {
  "ED-07": [
    {
      primaryFamily: "one-bit-character-object",
      aestheticRoute: "QUESTION_OVERLAY_OBJECT",
      dominantActor: "一位像素作者用手和光标把散开的文字片段装进一个真正可用的写作工作台",
      composition: "single-author-hand-cursor-constructs-workbench-in-largest-left-negative-space",
      surface: "one-bit-character-and-workbench-object-no-window-collage",
      material: "cream-newsprint-cobalt-registration-and-one-vermilion-question-mark",
      paletteRole: "cream-charcoal-cobalt-with-vermilion-question",
      motionPotential: "hand-places-one-workbench-piece-then-question-holds",
    },
    {
      primaryFamily: "isometric-machine-collage",
      aestheticRoute: "QUESTION_OVERLAY_OBJECT",
      dominantActor: "一个紧凑的实体写作工作台机器从作者一侧被组装完成",
      composition: "compact-isometric-workbench-machine-in-left-open-region-with-one-question-notch",
      surface: "single-machine-object-not-generic-retro-ui",
      material: "pixel-cut-paper-machine-cobalt-shadow-and-vermilion-switch",
      paletteRole: "paper-charcoal-cobalt-with-vermilion-switch",
      motionPotential: "machine-panels-lock-into-a-writing-workbench-then-hold",
    },
    {
      primaryFamily: "pixel-type-actor",
      aestheticRoute: "QUESTION_OVERLAY_OBJECT",
      dominantActor: "反问句作为一根可触摸的像素路标，指向作者亲手完成的写作工作台",
      composition: "one-oversized-question-sign-points-to-one-built-workbench-object-in-open-left-field",
      surface: "single-type-actor-and-object-relation-no-ui-windows",
      material: "hard-pixel-type-newsprint-grain-and-cobalt-object-shadow",
      paletteRole: "cream-charcoal-cobalt-with-one-vermilion-pointer",
      motionPotential: "question-sign-pivots-toward-built-workbench-then-freezes",
    },
  ],
  "ED-14": [
    {
      primaryFamily: "convergence-funnel-evidence",
      aestheticRoute: "SOURCE_BOUND_DIVERSITY_CONVERGENCE",
      dominantActor: "真实 ACL 论文证据旁，多种语言形状经过一条可见收窄通道变成更少的表达路径",
      composition: "verified-paper-evidence-anchor-feeds-many-lexical-shapes-into-one-narrowing-funnel",
      surface: "source-bound-editorial-field-with-one-causal-funnel-not-empty-screen",
      material: "exact-paper-pixels-newsprint-funnel-cutout-and-cobalt-registration",
      paletteRole: "cream-charcoal-cobalt-with-vermilion-narrowing-edge",
      motionPotential: "many-distinct-expression-shapes-converge-into-narrower-range-beside-source",
    },
    {
      primaryFamily: "two-lane-lexicon-collapse",
      aestheticRoute: "SOURCE_BOUND_DIVERSITY_CONVERGENCE",
      dominantActor: "真实 ACL 论文标题页与两条由多样到收窄的语言路径形成直接对照",
      composition: "verified-paper-title-anchor-between-wide-diverse-lane-and-narrow-repeated-lane",
      surface: "split-causal-editorial-diagram-with-source-identity-and-no-television-metaphor",
      material: "exact-source-capture-paper-two-tone-pixel-lanes-and-halftone-pressure",
      paletteRole: "paper-charcoal-cobalt-with-vermilion-convergence-mark",
      motionPotential: "wide-language-lane-loses-branches-into-narrower-repeated-lane",
    },
  ],
};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`visual-blocker-primitive-switch-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  const generation = current.production.generation;
  if (generation.summary.queued !== 0 || generation.summary.running !== 0 || generation.workerStatus !== "frozen") throw new Error("visual-blocker-primitive-switch-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("visual-blocker-primitive-switch-assembly-already-created");

  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const oldBoard = runtime.wholeFilmStaticBoard;
  if (oldBoard) {
    runtime.wholeFilmStaticBoardHistory = [...(runtime.wholeFilmStaticBoardHistory || []), {
      ...structuredClone(oldBoard),
      current: false,
      status: "HISTORY_READ_ONLY_SUPERSEDED_BY_VISUAL_BLOCKER_REPAIR",
      supersededAt: now,
      supersededBy: "visual-blocker-primitive-switch-v1",
    }];
  }
  runtime.wholeFilmStaticBoard = null;
  const changed = [];
  for (const [shotId, directions] of Object.entries(replacements)) {
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!plan) throw new Error(`visual-blocker-primitive-switch-plan-missing:${shotId}`);
    const previousPlanSha256 = plan.planSha256;
    runtime.packageLookMasterPlanHistory = [...(runtime.packageLookMasterPlanHistory || []), {
      ...structuredClone(plan),
      current: false,
      status: "HISTORY_READ_ONLY",
      authorityScope: "HISTORY_READ_ONLY",
      supersededAt: now,
      supersededBy: "visual-blocker-primitive-switch-v1",
    }];
    plan.candidateDirections = directions.map((replacement, index) => {
      const previous = plan.candidateDirections[index];
      if (!previous) throw new Error(`visual-blocker-primitive-switch-direction-missing:${shotId}:${index + 1}`);
      const direction = {
        ...previous,
        ...replacement,
        visualPrimitiveSwitchId: "visual-blocker-primitive-switch-v1",
        structuralRevision: "new-visual-primitive-after-pixel-or-causal-failure",
      };
      direction.fingerprint = directionFingerprint(direction);
      return direction;
    });
    plan.visualPrimitiveSwitch = {
      contract: "A1VisualPrimitiveSwitch/v1",
      status: "APPLIED",
      id: "visual-blocker-primitive-switch-v1",
      appliedAt: now,
      previousPlanSha256,
      reason: shotId === "ED-07"
        ? "实际合成遮挡脸/眼且旧平均 alpha 门禁漏检；改为对象/工作台原语并要求全量负空间几何。"
        : "真实来源存在但旧画面没有三秒表达多样性收窄机制；改为来源绑定的多路径到收窄路径原语。",
    };
    plan.planSha256 = sha256(planIdentity(plan));
    plan.status = "SEMANTIC_REVIEW_REQUIRED";
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
    assertPackageLookMasterPlan(plan);
    for (const raw of runtime.lookMasterRawReferences.filter((item) => item.shotId === shotId && item.current === true)) {
      raw.current = false;
      raw.historyReadOnly = true;
      raw.recommendationEligible = false;
      raw.selectionEligible = false;
      raw.assemblyEligible = false;
      raw.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_VISUAL_BLOCKER_PRIMITIVE_SWITCH";
      raw.supersededAt = now;
      raw.supersededByPlanSha256 = plan.planSha256;
    }
    changed.push({shotId, previousPlanSha256, currentPlanSha256: plan.planSha256, candidateCount: directions.length, directionFingerprints: plan.candidateDirections.map((item) => item.fingerprint)});
  }

  runtime.status = "CANDIDATE_SELECTION_PENDING";
  runtime.wholeFilmBatchRecommendation = {
    ...(runtime.wholeFilmBatchRecommendation || {}),
    status: "PARTIAL_WITH_EXCEPTIONS",
    finalizedShotIds: [],
    exceptions: Object.keys(replacements).map((shotId) => ({shotId, code: "LOOK_MASTER_VISUAL_PRIMITIVE_REPAIR_REQUIRED", immediateRegenerationAllowed: true})),
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
  runtime.queuePolicy = {...(runtime.queuePolicy || {}), generationConcurrencyHardMax: 2, automaticDispatchAllowed: false};
  next.production.packagingStyleAuthority = structuredClone(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY);
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  next.production.generationRecompile = {
    ...(next.production.generationRecompile || {}),
    contract: "A1VisualBlockerPrimitiveSwitchRecompile/v1",
    status: "APPLIED",
    targetShotIds: Object.keys(replacements),
    previousWorkspaceSha256: current.workspaceSha256,
    appliedAt: now,
  };
  const event = createProductionEvent({
    workspace: current,
    action: "switch-current-visual-blocker-primitives-v1",
    targetId: Object.keys(replacements).join(","),
    payload: {
      contract: "A1VisualBlockerPrimitiveSwitch/v1",
      targetShotIds: Object.keys(replacements),
      changed,
      generatedImageCount: 0,
      oldPngPreserved: true,
      oldBoardSuperseded: Boolean(oldBoard),
      assemblyCreated: false,
      layerReconstructionStarted: false,
      criticPerformed: false,
      motionPerformed: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (recalculated.production.authority.currentStage !== "film-look-master-exception-repair-required") throw new Error(`visual-blocker-primitive-switch-authority-stage-invalid:${recalculated.production.authority.currentStage}`);
  if (JSON.stringify(recalculated.production.authority.nextAction?.targetShotIds || []) !== JSON.stringify(Object.keys(replacements))) throw new Error("visual-blocker-primitive-switch-authority-targets-invalid");
  if (recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed !== false) throw new Error("visual-blocker-primitive-switch-assembly-gate-invalid");
  const report = {
    contract: "A1VisualBlockerPrimitiveSwitchReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    targetShotIds: Object.keys(replacements),
    changed,
    generatedImageCount: 0,
    oldPngPreserved: true,
    oldBoardSuperseded: Boolean(oldBoard),
    assemblyCount: 0,
    downstreamLocked: true,
    styleAuthority: recalculated.production.packagingStyleAuthority,
    generatedAt: now,
  };
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `visual-blocker-primitive-switch-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"visual-blocker-primitive-switch-v1/report.json": report},
  });
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
