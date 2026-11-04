#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {compileStoryboardPackagingDirectorPlan, assertStoryboardPackagingDirectorPlan} from "../apps/studio-next/src/lib/a1-storyboard-packaging-director-plan-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const videoShotcraftCatalog = JSON.parse(fs.readFileSync(path.join(appRoot, "src/data/video-shotcraft-catalog-v1.json"), "utf8"));
const expected = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expected || ""))) throw new Error("packaging-director-plan-workspace-sha-required");
const result = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expected) throw new Error(`packaging-director-plan-cas:${current.workspaceSha256}`);
  const authority = current.production?.shotIntelligence?.currentStoryboardAuthority;
  const plan = assertStoryboardPackagingDirectorPlan(compileStoryboardPackagingDirectorPlan(authority, {videoShotcraftCatalog}));
  if (plan.status !== "READY" || plan.shotCount !== 34) throw new Error(`packaging-director-plan-incomplete:${plan.readyCount}/${plan.shotCount}`);
  const now = new Date().toISOString();
  const next = structuredClone(current);
  next.production.shotIntelligence.currentStoryboardAuthority.packagingDirectorPlan = {contract: plan.contract, status: plan.status, planSha256: plan.planSha256, shotCount: plan.shotCount, readyCount: plan.readyCount, blockedCount: plan.blockedCount, execution: plan.execution, reportPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/current-storyboard-packaging-director-plan-v1/plan.json", compiledAt: now};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "compile-current-storyboard-packaging-director-plan", targetId: plan.planSha256, payload: {contract: plan.contract, shotCount: plan.shotCount, readyCount: plan.readyCount, blockedCount: plan.blockedCount, userCorrectionLoop: false, renderOnlyAfterPlanPass: true}, now});
  recalculated.production.eventLedger.eventCount += 1; recalculated.production.eventLedger.lastEventId = event.eventId; recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"current-storyboard-packaging-director-plan-v1/plan.json": plan}});
  return {status: "PASS", planSha256: plan.planSha256, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, shotCount: plan.shotCount, readyCount: plan.readyCount, blockedCount: plan.blockedCount, nextAction: recalculated.production.authority.nextAction};
});
console.log(JSON.stringify(result, null, 2));
