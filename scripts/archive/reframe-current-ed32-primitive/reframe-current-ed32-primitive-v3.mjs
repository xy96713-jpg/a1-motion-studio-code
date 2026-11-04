#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/iu.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed32-primitive-v3-expected-workspace-sha-required");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprint = (direction) => [direction.primaryFamily, direction.aestheticRoute, direction.dominantActor, direction.composition, direction.surface, direction.material, direction.paletteRole, direction.baseVideoRelationship].join("|");
const replacements = [
  {primaryFamily: "sentence-repair-workbench", dominantActor: "一张待修句面在人的红笔下重新获得可读边界", composition: "one-sentence-workbench-with-three-defect-tabs-and-one-human-pencil", surface: "single-editorial-repair-table-no-card-grid", material: "cream-paper-workbench-charcoal-type-and-vermilion-pencil", paletteRole: "cream-charcoal-cobalt-with-vermilion-repair", motionPotential: "three-defect-tabs-arrive-then-one-human-pencil-rewrites-the-line"},
  {primaryFamily: "redline-sieve-object", dominantActor: "人的红线筛掉三种语言缺陷留下可继续修改的句面", composition: "one-redline-sieve-with-three-defect-slots-and-human-hand", surface: "compact-sieve-object-with-one-readable-output-strip", material: "newsprint-sieve-cobalt-frame-and-vermilion-redline", paletteRole: "paper-charcoal-cobalt-with-vermilion-filter", motionPotential: "defect-slots are caught then human hand marks the output strip"},
];

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed32-primitive-v3-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed32-primitive-v3-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("ed32-primitive-v3-assembly-already-created");
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-32");
  if (!plan) throw new Error("ed32-primitive-v3-plan-missing");
  const previousPlanSha256 = plan.planSha256;
  runtime.packageLookMasterPlanHistory = [...(runtime.packageLookMasterPlanHistory || []), {...structuredClone(plan), status: "HISTORY_READ_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY", supersededAt: now, supersededBy: "ed32-primitive-switch-v3"}];
  plan.candidateDirections = replacements.map((replacement, index) => {
    const previous = plan.candidateDirections[index] || plan.candidateDirections[0];
    const direction = {...previous, ...replacement, visualPrimitiveSwitchId: "ed32-primitive-switch-v3"};
    direction.fingerprint = fingerprint(direction);
    return direction;
  });
  plan.visualPrimitiveSwitch = {status: "APPLIED", id: "ed32-primitive-switch-v3", appliedAt: now, previousPlanSha256, reason: "第二组候选逐字 OCR 失败后切换为第三套视觉机制"};
  plan.planSha256 = sha256(planIdentity(plan));
  assertPackageLookMasterPlan(plan);
  for (const raw of runtime.lookMasterRawReferences.filter((item) => item.shotId === "ED-32" && item.current !== false)) {
    raw.current = false;
    raw.historyReadOnly = true;
    raw.recommendationEligible = false;
    raw.selectionEligible = false;
    raw.assemblyEligible = false;
    raw.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_PRIMITIVE_SWITCH_V3";
    raw.supersededAt = now;
    raw.supersededByPlanSha256 = plan.planSha256;
  }
  const event = createProductionEvent({workspace: current, action: "switch-ed32-typography-exception-visual-primitives-v3", targetId: "ED-32", payload: {contract: "A1ED32TypographyExceptionPrimitiveSwitch/v3", targetShotIds: ["ED-32"], generatedImageCount: 0, oldRawPreserved: true, assemblyCreated: false, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const report = {contract: "A1ED32TypographyExceptionPrimitiveSwitchReport/v3", status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, previousPlanSha256, currentPlanSha256: plan.planSha256, generatedImageCount: 0, oldPngPreserved: true, assemblyCount: 0, downstreamLocked: true, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `ed32-primitive-switch-v3-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"typography-exception-primitive-switch-v3/ed32.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
