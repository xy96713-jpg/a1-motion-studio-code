#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackageLookMasterPrompt} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const targetIds = new Set(["ED-07", "ED-08", "ED-13", "ED-19"]);
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const authority = runtime.canonicalDirectorAuthority;
  const manifest = runtime.canonicalDirectorTargetRepairManifest;
  const next = structuredClone(current);
  const plans = new Map((runtime.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  for (const plan of next.production.shotIntelligence.packageLookMasterPlans || []) {
    if (!targetIds.has(plan.shotId) || !plan.canonicalRepair) continue;
    plan.canonicalRepair.authoritySha256 = authority.authoritySha256;
    plan.canonicalRepair.sourceRevisionHash = authority.sourceRevisionHash;
  }
  const staleJobIds = [];
  for (const job of next.production.generation.jobs || []) {
    if (!targetIds.has(job.shotId) || job.targetKind !== "package-look-master" || job.status !== "queued") continue;
    const plan = plans.get(job.shotId);
    const expectedPrompt = plan ? buildPackageLookMasterPrompt(plan, job.candidateIndex || 1, {generationMode: "LOOK_MASTER_REPAIR"}) : null;
    const expectedPromptSha256 = expectedPrompt ? sha256(expectedPrompt) : null;
    const expectedPrimitiveId = plan?.canonicalRepair?.primitiveId || plan?.visualPrimitiveSwitch?.id || null;
    if (job.lookMasterPlanSha256 !== plan?.planSha256 || job.promptSha256 !== expectedPromptSha256 || job.incrementalRepairBinding?.primitiveId !== expectedPrimitiveId) {
      job.status = "stale";
      job.staleAt = new Date().toISOString();
      job.staleReason = "canonical-title-repair-binding-recompiled";
      staleJobIds.push(job.id);
    }
  }
  next.production.generation.summary = {
    ...next.production.generation.summary,
    queued: next.production.generation.jobs.filter((job) => job.status === "queued").length,
    running: next.production.generation.jobs.filter((job) => job.status === "running").length,
    stale: next.production.generation.jobs.filter((job) => job.status === "stale").length,
    total: next.production.generation.jobs.length,
  };
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  const event = createProductionEvent({workspace: current, action: "canonical-title-repair-queue-normalized", targetId: [...targetIds].join(","), payload: {authoritySha256: authority.authoritySha256, manifestSha256: manifest.manifestSha256, staleJobIds}});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256});
  return {workspace: recalculated, staleJobIds};
});

console.log(JSON.stringify({status: "PASS", staleJobIds: result.staleJobIds, queue: result.workspace.production.generation.summary, workspaceSha256: result.workspace.workspaceSha256}, null, 2));
