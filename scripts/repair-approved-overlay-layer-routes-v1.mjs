#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {applyImagegenMasterPreservationPolicy} from "../apps/studio-next/src/lib/a1-imagegen-master-preservation-v1.mjs";
import {
  assertPackageAssemblyRecipe,
  assertPackageAssetKitPlan,
  buildPackageAssemblyRecipe,
  buildPackageAssetKitPlan,
  queuePackageLayerGenerationJobs,
} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
const targetShotIds = ["ED-13", "ED-31"];
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("approved-overlay-route-repair-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-overlay-route-repair-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen" || current.production.generation.automaticDispatchAllowed !== false) throw new Error("approved-overlay-route-repair-frozen-runtime-required");
  const runtime = current.production.shotIntelligence;
  if (runtime.wholeFilmStaticBoard?.status !== "APPROVED" || runtime.wholeFilmStaticBoardDecision?.decision !== "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY") throw new Error("approved-overlay-route-repair-approved-board-required");

  const now = new Date().toISOString();
  let next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  const repaired = [];
  const supersededPlanShas = new Set();

  for (const shotId of targetShotIds) {
    const planIndex = nextRuntime.packageAssetKitPlans.findIndex((plan) => plan.shotId === shotId && plan.current === true && plan.authorityScope === "CURRENT");
    const recipeIndex = nextRuntime.packageAssemblyRecipes.findIndex((recipe) => recipe.shotId === shotId && recipe.current === true && recipe.authorityScope === "CURRENT");
    if (planIndex < 0 || recipeIndex < 0) throw new Error(`approved-overlay-route-repair-current-pair-missing:${shotId}`);
    const oldPlan = nextRuntime.packageAssetKitPlans[planIndex];
    const oldRecipe = nextRuntime.packageAssemblyRecipes[recipeIndex];
    if (oldPlan.assemblyMode !== "OVERLAY" || oldPlan.videoContext?.baseSubjectMustRemainVisible !== true || oldPlan.videoContext?.frameTakeoverAllowed !== false) throw new Error(`approved-overlay-route-repair-overlay-contract-invalid:${shotId}`);
    const forbidden = oldPlan.layers.filter((layer) => ["BACKGROUND", "ILLUSTRATION"].includes(layer.kind) && layer.route !== "NONE");
    if (!forbidden.length) continue;

    const rawDecision = nextRuntime.decisionSet.items.find((item) => item.shotId === shotId);
    const styleBrief = next.production.packagingStyleBriefs.find((brief) => (brief.sourceBeatIds || []).includes(shotId));
    if (!rawDecision || !styleBrief) throw new Error(`approved-overlay-route-repair-input-missing:${shotId}`);
    const decision = {...rawDecision, decisionHash: oldPlan.videoContext.decisionHash, sourceHash: oldPlan.videoContext.sourceHash};
    const referenceManifest = {packId: "pinterest-retro-pixel-v1", sources: oldPlan.styleBinding.referenceManifestReferences};
    const basePlan = buildPackageAssetKitPlan(decision, {
      styleBriefSha256: styleBrief.styleBriefSha256,
      styleBriefBinding: styleBrief,
      referenceManifest,
      existingAssets: next.library.assets,
      artifactAudits: next.production.packageArtifactAuditRegistry || null,
      selectedLookMasterBinding: oldPlan.selectedLookMasterBinding,
      researchPacket: nextRuntime.researchPackets?.find((packet) => packet.shotId === shotId) || null,
      videoContext: oldPlan.videoContext,
      now,
    });
    const newPlan = applyImagegenMasterPreservationPolicy({...basePlan, current: true, authorityScope: "CURRENT", selectedLookMasterBinding: oldPlan.selectedLookMasterBinding}, {selectedLookMasterBinding: oldPlan.selectedLookMasterBinding});
    newPlan.status = "LAYER_RECONSTRUCTION_READY";
    const newRecipe = buildPackageAssemblyRecipe(newPlan, {now});
    newRecipe.userAssemblyDecision = {...oldRecipe.userAssemblyDecision, bindingSha256: newRecipe.approvalBinding.bindingSha256};
    newRecipe.assemblyUserApproved = true;
    newRecipe.approvalBinding = {...newRecipe.approvalBinding, userApproved: true, userAssemblyDecisionSha256: nextRuntime.wholeFilmStaticBoardDecision.decisionSha256};
    newRecipe.current = true;
    newRecipe.authorityScope = "CURRENT";
    assertPackageAssetKitPlan(newPlan);
    assertPackageAssemblyRecipe(newPlan, newRecipe);
    if (newPlan.layers.find((layer) => layer.kind === "BACKGROUND")?.route !== "NONE" || newPlan.layers.find((layer) => layer.kind === "ILLUSTRATION")?.route !== "NONE") throw new Error(`approved-overlay-route-repair-forbidden-route-remains:${shotId}`);

    nextRuntime.packageAssetKitPlans[planIndex] = {...oldPlan, current: false, historyReadOnly: true, authorityScope: "HISTORY_READ_ONLY", supersededAt: now, supersededReason: "overlay-base-subject-preservation-route-correction"};
    nextRuntime.packageAssemblyRecipes[recipeIndex] = {...oldRecipe, current: false, historyReadOnly: true, authorityScope: "HISTORY_READ_ONLY", supersededAt: now, supersededReason: "overlay-base-subject-preservation-route-correction"};
    nextRuntime.packageAssetKitPlans.push(newPlan);
    nextRuntime.packageAssemblyRecipes.push(newRecipe);
    supersededPlanShas.add(oldPlan.planSha256);
    repaired.push({shotId, oldPlanSha256: oldPlan.planSha256, newPlanSha256: newPlan.planSha256, routes: Object.fromEntries(newPlan.layers.map((layer) => [layer.kind, layer.route]))});
  }
  if (repaired.length !== targetShotIds.length) throw new Error(`approved-overlay-route-repair-target-count-invalid:${repaired.length}`);

  const cancelledJobIds = [];
  for (const job of next.production.generation.jobs) {
    if (job.targetKind !== "package-layer" || job.status !== "queued" || !supersededPlanShas.has(job.planSha256)) continue;
    job.status = "cancelled";
    job.error = "SUPERSEDED_BY_OVERLAY_BASE_SUBJECT_PRESERVATION_ROUTE_CORRECTION";
    job.cancelledAt = now;
    cancelledJobIds.push(job.id);
  }
  const queuedJobIds = [];
  for (const shotId of targetShotIds) {
    const queued = queuePackageLayerGenerationJobs(next, shotId, {now});
    next = queued.workspace;
    queuedJobIds.push(...queued.jobs.map((job) => job.id));
  }
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (next.production.generation.summary.queued !== 48) throw new Error(`approved-overlay-route-repair-queue-count-invalid:${next.production.generation.summary.queued}`);

  const reportBody = {
    contract: "A1ApprovedOverlayLayerRouteRepair/v1",
    status: "PASS",
    boardSha256: runtime.wholeFilmStaticBoard.sha256,
    approvalDecisionSha256: runtime.wholeFilmStaticBoardDecision.decisionSha256,
    repaired,
    cancelledJobIds,
    queuedJobIds,
    queue: structuredClone(next.production.generation.summary),
    workerStatus: next.production.generation.workerStatus,
    automaticDispatchAllowed: next.production.generation.automaticDispatchAllowed,
    repairedAt: now,
  };
  const report = {...reportBody, reportSha256: sha256({...reportBody, repairedAt: undefined})};
  const event = createProductionEvent({workspace: current, action: "repair-approved-overlay-layer-routes", targetId: targetShotIds.join(","), payload: report, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `approved-overlay-route-repair-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/overlay-route-repair.json": report}});
  return {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId};
});

console.log(JSON.stringify(result, null, 2));
