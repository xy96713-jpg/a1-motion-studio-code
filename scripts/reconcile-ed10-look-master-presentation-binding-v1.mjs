#!/usr/bin/env node
/**
 * Rebind ED-10's active Look Master/kit/recipe presentation contract.
 *
 * This is a metadata-only, idempotent migration. It never queues imagegen,
 * critic, layer reconstruction, motion, or render work. The rejected Assembly
 * and the four current Look Master exploration files are left untouched.
 */
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const hashWithout = (value, key) => {
  const copy = structuredClone(value);
  delete copy[key];
  return sha256(copy);
};
const hashContext = (context) => {
  const copy = structuredClone(context);
  delete copy.contextSha256;
  delete copy.createdAt;
  return sha256(copy);
};

withProjectLock(appRoot, () => {
  // This migration is also the recovery path for the exact drift it repairs;
  // read the raw workspace first because the normal assertion rejects a
  // stale plan.videoContextSha256 before we can normalize it.
  const current = readProjectWorkspace(appRoot);
  const next = structuredClone(current);
  const runtime = next.production?.shotIntelligence;
  const plan = runtime?.packageLookMasterPlans?.find((item) => item.shotId === "ED-10");
  const kit = runtime?.packageAssetKitPlans?.find((item) => item.shotId === "ED-10");
  const recipe = runtime?.packageAssemblyRecipes?.find((item) => item.shotId === "ED-10");
  if (!plan || !kit || !recipe) throw new Error("ed10-presentation-binding-records-missing");

  const presentationMode = plan.presentationMode || kit.presentationMode || recipe.presentationMode || "OVERLAY";
  const presentationModeReason = plan.presentationModeReason || kit.presentationModeReason || recipe.presentationModeReason || "文字是 TYPOGRAPHY 视觉 actor，但以透明 alpha overlay 与真实正片共存；不短暂接管整帧。";
  const whyPresentationModeBeatsOtherModes = plan.whyPresentationModeBeatsOtherModes || kit.whyPresentationModeBeatsOtherModes || recipe.whyPresentationModeBeatsOtherModes || "OVERLAY 保留正片主体与节奏，并让文字动作落在实际画面安全区。";
  const contextSource = plan.videoContext || kit.videoContext || recipe.videoContext;
  if (!contextSource?.contract) throw new Error("ed10-presentation-binding-context-missing");

  const context = structuredClone(contextSource);
  context.presentationMode = presentationMode;
  context.contextSha256 = undefined;
  context.contextSha256 = hashContext(context);
  const contextSha256 = context.contextSha256;

  for (const item of [plan, kit, recipe]) {
    item.presentationMode = presentationMode;
    item.presentationModeReason = presentationModeReason;
    item.whyPresentationModeBeatsOtherModes = whyPresentationModeBeatsOtherModes;
    item.videoContext = structuredClone(context);
    item.videoContextSha256 = contextSha256;
  }
  recipe.insertionMode = presentationMode;
  const contextSetItem = runtime.videoPackagingContexts?.items?.find((item) => item.shotId === "ED-10");
  if (contextSetItem) Object.assign(contextSetItem, structuredClone(context));
  if (runtime.videoPackagingContexts) {
    runtime.videoPackagingContexts.sha256 = undefined;
    runtime.videoPackagingContexts.sha256 = sha256({
      contract: runtime.videoPackagingContexts.contract,
      version: runtime.videoPackagingContexts.version,
      status: runtime.videoPackagingContexts.status,
      items: runtime.videoPackagingContexts.items,
      summary: runtime.videoPackagingContexts.summary,
    });
  }

  // planIdentity intentionally preserves an existing history-only context
  // snapshot for already-finalized plans. In the current LOOK_MASTER_REVIEW
  // lane this keeps the four raw candidates bound to their existing plan SHA;
  // the active context SHA is still explicit and checked below.
  const expectedPlanSha256 = sha256(planIdentity(plan));
  if (plan.planSha256 !== expectedPlanSha256) plan.planSha256 = expectedPlanSha256;

  // Kit and recipe identities include their active context binding. Rehash in
  // dependency order and update any persisted candidate bindings if present.
  kit.planSha256 = hashWithout(kit, "planSha256");
  for (const layer of kit.layers || []) {
    for (const candidate of layer.candidates || []) {
      candidate.planSha256 = kit.planSha256;
      candidate.candidateSha256 = undefined;
      candidate.candidateSha256 = hashWithout(candidate, "candidateSha256");
    }
  }
  recipe.planSha256 = kit.planSha256;
  recipe.approvalBinding = recipe.approvalBinding
    ? {...recipe.approvalBinding, planSha256: recipe.planSha256}
    : recipe.approvalBinding;
  recipe.recipeSha256 = undefined;
  recipe.recipeSha256 = hashWithout(recipe, "recipeSha256");

  const recalculated = recalculateEditorialAssetWorkbench(next, new Date().toISOString());
  const finalRuntime = recalculated.production.shotIntelligence;
  const finalPlan = finalRuntime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const finalKit = finalRuntime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const finalRecipe = finalRuntime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (finalPlan.presentationMode !== finalKit.presentationMode || finalKit.presentationMode !== finalRecipe.presentationMode) throw new Error("ed10-presentation-mode-not-unified");
  if (finalPlan.videoContext.presentationMode !== finalPlan.presentationMode || finalKit.videoContext.presentationMode !== finalKit.presentationMode || finalRecipe.videoContext.presentationMode !== finalRecipe.presentationMode) throw new Error("ed10-presentation-context-mode-not-unified");
  if (new Set([finalPlan.videoContextSha256, finalKit.videoContextSha256, finalRecipe.videoContextSha256]).size !== 1) throw new Error("ed10-video-context-sha-not-unified");

  const event = createProductionEvent({
    workspace: current,
    action: "ed10-presentation-binding-reconciled",
    targetId: "ED-10",
    payload: {
      presentationMode: finalPlan.presentationMode,
      videoContextSha256: finalPlan.videoContextSha256,
      planSha256: finalPlan.planSha256,
      kitPlanSha256: finalKit.planSha256,
      recipeSha256: finalRecipe.recipeSha256,
      imagegenDispatched: false,
      criticDispatched: false,
    },
    now: new Date().toISOString(),
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {event, files: {"ed10-presentation-binding-reconciled-v1.json": {status: "PASS", presentationMode: finalPlan.presentationMode, videoContextSha256: finalPlan.videoContextSha256, planSha256: finalPlan.planSha256, kitPlanSha256: finalKit.planSha256, recipeSha256: finalRecipe.recipeSha256}}});
  const persisted = readProjectWorkspace(appRoot);
  console.log(JSON.stringify({status: "PASS", workspaceSha256: persisted.workspaceSha256, presentationMode: finalPlan.presentationMode, videoContextSha256: finalPlan.videoContextSha256, planSha256: finalPlan.planSha256, kitPlanSha256: finalKit.planSha256, recipeSha256: finalRecipe.recipeSha256, runtimeStatus: finalRuntime.status, queue: persisted.production.generation.summary, imagegenDispatched: false}, null, 2));
});
