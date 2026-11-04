#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertPackageLookMasterPlan,
  planIdentity,
} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const TARGET_SHOT_IDS = ["ED-09", "ED-16"];
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const creatorByShot = new Map((next.production.canonicalCreatorPackagingSequence?.decisions || []).map((item) => [item.shotId, item]));
  const replacements = [];
  for (const shotId of TARGET_SHOT_IDS) {
    const decision = creatorByShot.get(shotId);
    const previous = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!decision || !previous) throw new Error(`creator-plan-reconcile-input-missing:${shotId}`);
    if (decision.packageDecision !== "PACKAGE" || decision.contentTreatment !== "EDITORIAL_EXPLAINER" || decision.frameOccupation !== "SPLIT" || decision.assemblyMode !== "EXPLAINER" || decision.presentationMode !== "EXPLAINER") {
      throw new Error(`creator-plan-reconcile-route-unexpected:${shotId}`);
    }
    const plan = structuredClone(previous);
    plan.canonicalCreatorDecision = structuredClone(decision);
    plan.contentTreatment = decision.contentTreatment;
    plan.frameOccupation = decision.frameOccupation;
    plan.assemblyMode = decision.assemblyMode;
    plan.presentationMode = decision.presentationMode;
    plan.assemblyModeReason = "EDITORIAL_EXPLAINER 由机制承担信息主位，保留 canonical SPLIT occupation。";
    plan.presentationModeReason = "EXPLAINER 只呈现一个可读机制，不把解释错标成 Hero Typography。";
    plan.whyThisModeBeatsOtherModes = "机制需要独立阅读路径；HERO_TYPOGRAPHY 会把解释压扁成标题。";
    plan.whyPresentationModeBeatsOtherModes = "EXPLAINER 保留结构关系和阅读证据，优于纯标题或人物叠加。";
    plan.typographyTreatment = "EXPLAINER_LABEL";
    plan.videoContext = {
      ...plan.videoContext,
      assemblyMode: "EXPLAINER",
      presentationMode: "EXPLAINER",
      contentTreatment: "EDITORIAL_EXPLAINER",
      frameOccupation: "SPLIT",
      baseVisualCarrier: "NONE_OR_TAKEOVER",
      enhancementPackaging: "GENERATED_EDITORIAL_PACKAGE",
      strongLanguageEvent: true,
      typographyTreatment: "EXPLAINER_LABEL",
      baseVideoRelationship: "TEMPORARY_EXPLAINER_OR_EDITOR_CHOSEN_SPLIT",
      baseSubjectMustRemainVisible: false,
      frameTakeoverAllowed: true,
      safeZonePolicy: "NAMED_MECHANISM_MUST_REMAIN_TITLE_SAFE",
    };
    plan.videoContext.contextSha256 = sha256({...plan.videoContext, contextSha256: undefined});
    plan.planSha256 = sha256(planIdentity(plan));
    plan.status = "LOOK_MASTER_PLANS_READY";
    assertPackageLookMasterPlan(plan);
    replacements.push({shotId, oldPlanSha256: previous.planSha256, planSha256: plan.planSha256});
    runtime.packageLookMasterPlanHistory = [...(runtime.packageLookMasterPlanHistory || []), {...previous, current: false, status: "HISTORY_READ_ONLY_SUPERSEDED_BY_CREATOR_ROUTE_RECONCILIATION", authorityScope: "HISTORY_READ_ONLY"}];
    runtime.packageLookMasterPlans = runtime.packageLookMasterPlans.map((item) => item.shotId === shotId ? plan : item);
    next.production.shotIntelligence.videoPackagingContexts.items = (next.production.shotIntelligence.videoPackagingContexts.items || []).map((item) => item.shotId === shotId ? structuredClone(plan.videoContext) : item);
  }
  const refreshedBinding = buildCreatorPaletteShotBindingManifest(next, {now: new Date().toISOString()});
  next.production.creatorPaletteShotBindingManifest = refreshedBinding;
  const event = createProductionEvent({workspace: current, action: "creator-plan-route-reconciled", targetId: TARGET_SHOT_IDS.join(","), payload: {replacements}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const finalWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  persistProjectState(appRoot, finalWorkspace, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {"creator-packaging-palette-binding-v1/manifest.json": refreshedBinding},
  });
  return {workspaceSha256: finalWorkspace.workspaceSha256, replacements, bindingScopeStatus: refreshedBinding.scopeStatus, conflictShotIds: refreshedBinding.conflictShotIds || []};
});

console.log(JSON.stringify({status: "PASS", ...result}, null, 2));
