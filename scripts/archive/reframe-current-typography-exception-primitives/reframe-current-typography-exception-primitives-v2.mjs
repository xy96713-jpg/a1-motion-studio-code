#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/iu.test(String(expectedWorkspaceSha256 || ""))) throw new Error("typography-primitive-switch-v2-expected-workspace-sha-required");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprint = (direction) => [direction.primaryFamily, direction.aestheticRoute, direction.dominantActor, direction.composition, direction.surface, direction.material, direction.paletteRole, direction.baseVideoRelationship].join("|");

// A second structural failure must change the visual mechanism again.  These
// are deliberately object-led and compact so the generator has one readable
// actor, one action and one protected left-side region to solve.
const replacements = {
  "ED-13": [
    {primaryFamily: "folded-proof-diptych", dominantActor: "一张顺滑度纸片折到未解缺口前停住", composition: "two-folded-proof-slips-stop-before-one-open-gap", surface: "single-diptych-object-with-one-open-counterfield", material: "folded-newsprint-and-cobalt-registration-pin", paletteRole: "cream-charcoal-cobalt-with-vermilion-gap", motionPotential: "smoothness-slip-folds-forward-then-stops-before-gap"},
    {primaryFamily: "counterweight-scale", dominantActor: "顺滑表达砝码上升而未解问题保持下坠", composition: "one-counterweight-object-with-two-phrase-plates", surface: "editorial-balance-object-no-card-grid", material: "inked-paper-scale-and-hard-pixel-shadow", paletteRole: "paper-charcoal-cobalt-with-vermilion-counterweight", motionPotential: "smoothness-weight-rises-while-unresolved-weight-stays-down"},
    {primaryFamily: "redline-bridge", dominantActor: "更顺的句桥跨到一半却断在问题红线", composition: "one-phrase-bridge-breaks-over-one-redline-gap", surface: "single-bridge-object-with-open-air-around-it", material: "paper-ribbon-cobalt-pin-and-vermilion-cut", paletteRole: "charcoal-cream-cobalt-with-vermilion-break", motionPotential: "phrase-bridge-extends-then-redline-break-remains"},
  ],
  "ED-31": [
    {primaryFamily: "hand-indexed-workflow", dominantActor: "作者的手把三张不便索引压成一条可控路线", composition: "three-index-slips-feed-one-hand-held-route-marker", surface: "one-hand-and-route-object-in-negative-space", material: "paper-index-tabs-and-cobalt-route-thread", paletteRole: "cream-charcoal-cobalt-with-vermilion-lock", motionPotential: "three-problem-tabs-align-then-hand-locks-one-route"},
    {primaryFamily: "folded-route-circuit", dominantActor: "真实不便被折成作者能复查的单一路线", composition: "three-folded-paper-corners-converge-on-one-route-circuit", surface: "isometric-paper-route-without-window-grid", material: "folded-newsprint-cobalt-track-and-acid-lime-check", paletteRole: "paper-charcoal-cobalt-with-acid-lime-control-mark", motionPotential: "loose-paper-corners-fold-into-one-reviewable-route"},
  ],
  "ED-32": [
    {primaryFamily: "human-editing-clamp", dominantActor: "人的修改夹钳同时夹住三种语言缺陷", composition: "three-defect-tabs-enter-one-human-editing-clamp", surface: "single-clamp-object-with-three-cause-tabs", material: "paper-tabs-charcoal-clamp-and-vermilion-pencil", paletteRole: "cream-charcoal-cobalt-with-vermilion-intervention", motionPotential: "three-defect-tabs-arrive-then-human-clamp-releases-revised-line"},
    {primaryFamily: "missing-word-cutout", dominantActor: "空心句面被人挖出三处缺口并重新补写", composition: "one-hollow-sentence-panel-with-three-cutouts-and-pencil", surface: "single-cutout-panel-with-no-card-grid", material: "newsprint-panel-cobalt-edge-and-vermilion-pencil", paletteRole: "charcoal-cream-cobalt-with-vermilion-cut", motionPotential: "three-language-holes-open-then-human-pencil-repairs-panel"},
  ],
};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`typography-primitive-switch-v2-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("typography-primitive-switch-v2-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("typography-primitive-switch-v2-assembly-already-created");

  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const changed = [];
  for (const [shotId, replacementsForShot] of Object.entries(replacements)) {
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!plan) throw new Error(`typography-primitive-switch-v2-plan-missing:${shotId}`);
    const previousPlanSha256 = plan.planSha256;
    runtime.packageLookMasterPlanHistory = [...(runtime.packageLookMasterPlanHistory || []), {
      ...structuredClone(plan),
      status: "HISTORY_READ_ONLY",
      current: false,
      authorityScope: "HISTORY_READ_ONLY",
      supersededAt: now,
      supersededBy: "typography-exception-primitive-switch-v2",
    }];
    plan.candidateDirections = replacementsForShot.map((replacement, index) => {
      const previous = plan.candidateDirections[index];
      const direction = {...previous, ...replacement, visualPrimitiveSwitchId: "typography-exception-primitive-switch-v2"};
      direction.fingerprint = fingerprint(direction);
      return direction;
    });
    plan.visualPrimitiveSwitch = {
      status: "APPLIED",
      id: "typography-exception-primitive-switch-v2",
      appliedAt: now,
      previousPlanSha256,
      reason: "第二次结构失败后切换为全新视觉机制；不对原构图做微调循环",
    };
    plan.planSha256 = sha256(planIdentity(plan));
    assertPackageLookMasterPlan(plan);
    for (const raw of runtime.lookMasterRawReferences.filter((item) => item.shotId === shotId && item.current !== false)) {
      raw.current = false;
      raw.historyReadOnly = true;
      raw.recommendationEligible = false;
      raw.selectionEligible = false;
      raw.assemblyEligible = false;
      raw.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_PRIMITIVE_SWITCH_V2";
      raw.supersededAt = now;
      raw.supersededByPlanSha256 = plan.planSha256;
    }
    for (const job of next.production.generation.jobs || []) {
      if (job.targetKind === "package-look-master" && job.shotId === shotId && [previousPlanSha256, plan.planSha256].includes(job.lookMasterPlanSha256) && ["queued", "running"].includes(job.status)) {
        job.status = "stale";
        job.staleReason = "typography-exception-primitive-switch-v2";
        job.staleAt = now;
      }
    }
    changed.push({shotId, previousPlanSha256, currentPlanSha256: plan.planSha256, directionFingerprints: plan.candidateDirections.map((item) => item.fingerprint)});
  }
  runtime.generationRecompile = {...(runtime.generationRecompile || {}), lastPrimitiveSwitchAt: now, targetShotIds: Object.keys(replacements), status: "CURRENT_PRIMITIVE_SWITCH_V2_APPLIED"};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const event = createProductionEvent({workspace: current, action: "switch-current-typography-exception-visual-primitives-v2", targetId: Object.keys(replacements).join(","), payload: {contract: "A1TypographyExceptionPrimitiveSwitch/v2", targetShotIds: Object.keys(replacements), generatedImageCount: 0, oldRawPreserved: true, assemblyCreated: false, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const report = {contract: "A1TypographyExceptionPrimitiveSwitchReport/v2", status: "PASS", workspaceSha256Before: current.workspaceSha256, targetShotIds: Object.keys(replacements), changed, generatedImageCount: 0, oldPngPreserved: true, assemblyCount: 0, downstreamLocked: true, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `typography-exception-primitive-switch-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"typography-exception-primitive-switch-v2/report.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
