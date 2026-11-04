#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("typography-primitive-switch-expected-workspace-sha-required");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprint = (direction) => [direction.primaryFamily, direction.aestheticRoute, direction.dominantActor, direction.composition, direction.surface, direction.material, direction.paletteRole, direction.baseVideoRelationship].join("|");

const replacements = {
  "ED-13": [
    {primaryFamily: "contrast-hinge-editorial", dominantActor: "顺滑表达板与未解决问题结点的同屏对照", composition: "two-phrase-plates-hinge-open-in-presenter-negative-space", surface: "object-bound-contrast-plates-with-one-hinge", material: "newsprint-cut-paper-and-cobalt-hinge", paletteRole: "paper-charcoal-cobalt-with-one-vermilion-warn", motionPotential: "smoothness-plate-slides-in-then-unresolved-knot-remains"},
    {primaryFamily: "one-bit-barometer", dominantActor: "表达顺滑度刻度与问题未解的卡点指针", composition: "single-barometer-object-with-a-visible-stuck-pointer", surface: "one-bit-instrument-face-with-two-phrase-actors", material: "screenprint-gauge-and-pixel-registration", paletteRole: "cream-charcoal-cobalt-with-acid-lime-scale", motionPotential: "meter-rises-then-pointer-stops-at-unresolved-knot"},
    {primaryFamily: "redline-correction-object", dominantActor: "一条顺滑句线撞上未解决的红线缺口", composition: "one-phrase-ribbon-breaks-on-one-causal-redline", surface: "large-object-bound-ribbon-with-open-counterfield", material: "ink-ribbon-paper-tear-and-cobalt-pixel-edge", paletteRole: "charcoal-cream-cobalt-with-vermilion-break", motionPotential: "ribbon-smooths-then-redline-opens-the-gap"},
  ],
  "ED-31": [
    {primaryFamily: "workflow-loom-object", dominantActor: "真实不便碎片被作者手工织成可控工作流", composition: "three-problem-scraps-enter-one-loom-and-exit-one-controlled-route", surface: "compact-object-led-loom-in-presenter-negative-space", material: "paper-scrap-loom-and-cobalt-thread", paletteRole: "cream-charcoal-cobalt-with-one-vermilion-lock", motionPotential: "problem-scraps-feed-in-then-one-route-locks"},
    {primaryFamily: "paper-path-lock", dominantActor: "不方便的纸片被折成一条作者可控的路径", composition: "two-cause-paper-folds-become-one-thick-directional-strip", surface: "isometric-folded-paper-object-with-no-window-grid", material: "folded-newsprint-and-hard-pixel-shadow", paletteRole: "paper-charcoal-cobalt-with-acid-lime-control-mark", motionPotential: "loose-folds collapse into one authored path"},
  ],
  "ED-32": [
    {primaryFamily: "triage-stamp-machine", dominantActor: "不通顺、AI味、不说人话三枚问题印章交给人的修改手", composition: "three-problem-stamps-converge-on-one-human-redline-hand", surface: "compact-triage-machine-with-one-clear-human-intervention", material: "rubber-stamp-ink-and-dithered-paper-cutout", paletteRole: "cream-charcoal-cobalt-with-vermilion-warning", motionPotential: "three-stamps-arrive-then-human-redline-cuts-the-sentence"},
    {primaryFamily: "one-bit-redline-surgery", dominantActor: "空心顺句被人的红线重新打开", composition: "hollow-polished-sentence-object-opened-by-one-editorial-cut", surface: "one-bit-surgical-object-with-three-cause-notches", material: "pixel-paper-shell-and-redline-cut", paletteRole: "charcoal-cream-cobalt-with-vermilion-cut", motionPotential: "polished-shell opens and the human cut remains visible"},
  ],
};

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`typography-primitive-switch-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("typography-primitive-switch-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("typography-primitive-switch-assembly-already-created");
  const targetShotIds = Object.keys(replacements);
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const changed = [];
  for (const shotId of targetShotIds) {
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!plan) throw new Error(`typography-primitive-switch-plan-missing:${shotId}`);
    const previousPlanSha256 = plan.planSha256;
    const history = {...structuredClone(plan), status: "HISTORY_READ_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY", supersededAt: now, supersededBy: "typography-exception-primitive-switch-v1"};
    runtime.packageLookMasterPlanHistory = [...(runtime.packageLookMasterPlanHistory || []), history];
    const nextDirections = replacements[shotId].map((replacement, index) => {
      const previous = plan.candidateDirections[index];
      const direction = {...previous, ...replacement, visualPrimitiveSwitchId: "typography-exception-primitive-switch-v1"};
      direction.fingerprint = fingerprint(direction);
      return direction;
    });
    plan.candidateDirections = nextDirections;
    plan.visualPrimitiveSwitch = {status: "APPLIED", id: "typography-exception-primitive-switch-v1", appliedAt: now, previousPlanSha256, reason: "旧候选结构返修失败后切换视觉原语；不重复微调同一构图"};
    plan.planSha256 = sha256(planIdentity(plan));
    assertPackageLookMasterPlan(plan);
    for (const raw of runtime.lookMasterRawReferences.filter((item) => item.shotId === shotId && item.current !== false)) {
      raw.current = false;
      raw.historyReadOnly = true;
      raw.recommendationEligible = false;
      raw.selectionEligible = false;
      raw.assemblyEligible = false;
      raw.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_PRIMITIVE_SWITCH";
      raw.supersededAt = now;
      raw.supersededByPlanSha256 = plan.planSha256;
    }
    for (const job of next.production.generation.jobs || []) {
      if (job.targetKind === "package-look-master" && job.shotId === shotId && [previousPlanSha256, plan.planSha256].includes(job.lookMasterPlanSha256) && ["queued", "running"].includes(job.status)) {
        job.status = "stale";
        job.staleReason = "typography-exception-primitive-switch";
        job.staleAt = now;
      }
    }
    changed.push({shotId, previousPlanSha256, currentPlanSha256: plan.planSha256, directionFingerprints: nextDirections.map((item) => item.fingerprint)});
  }
  runtime.generationRecompile = {...(runtime.generationRecompile || {}), lastPrimitiveSwitchAt: now, targetShotIds, status: "CURRENT_PRIMITIVE_SWITCH_APPLIED"};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const event = createProductionEvent({workspace: current, action: "switch-current-typography-exception-visual-primitives", targetId: targetShotIds.join(","), payload: {contract: "A1TypographyExceptionPrimitiveSwitch/v1", targetShotIds, generatedImageCount: 0, oldRawPreserved: true, assemblyCreated: false, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const report = {contract: "A1TypographyExceptionPrimitiveSwitchReport/v1", status: "PASS", workspaceSha256Before: current.workspaceSha256, targetShotIds, changed, generatedImageCount: 0, oldPngPreserved: true, assemblyCount: 0, downstreamLocked: true, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `typography-exception-primitive-switch-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"typography-exception-primitive-switch-v1/report.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
