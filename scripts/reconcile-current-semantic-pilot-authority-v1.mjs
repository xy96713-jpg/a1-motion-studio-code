#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = "294ffe890915e3869a470105f91a73337ed9ca47846dfef84219ccad3d9a6129";
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const targetShotIds = ["ED-12", "ED-17", "ED-09"];

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error("semantic-pilot-authority-reconcile-workspace-changed-since-checkpoint");
  const runtime = current.production.shotIntelligence;
  const pilot = runtime.semanticPilot;
  if (runtime.status !== "SEMANTIC_PILOT_REVIEW_REQUIRED" || pilot?.contract !== "A1SemanticPilotRun/v1" || pilot.selected !== null || pilot.currentAssembly?.length !== 0) throw new Error("semantic-pilot-authority-reconcile-invalid-pilot-state");
  if (pilot.targetShotIds.join(",") !== targetShotIds.join(",") || pilot.candidates?.length !== 3) throw new Error("semantic-pilot-authority-reconcile-targets-invalid");
  if (runtime.semanticDesignBriefSet?.status !== "READY" || runtime.semanticDesignBriefSet.briefs?.filter((brief) => brief.status === "READY").length !== 34) throw new Error("semantic-pilot-authority-reconcile-briefs-not-ready");

  const next = structuredClone(current);
  const now = new Date().toISOString();
  const event = createProductionEvent({
    workspace: current,
    action: "semantic-pilot-authority-reconciled",
    targetId: pilot.contactSheet?.sha256 || "semantic-pilot",
    payload: {
      targetShotIds,
      restoredExistingCandidates: true,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      layerReconstructionPerformed: false,
      criticPerformed: false,
      motionPerformed: false,
      singleWriterTaskId,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const authority = recalculated.production.authority;
  if (authority.currentStage !== "semantic-pilot-review-required" || authority.nextAction?.id !== "semantic-pilot-review-required" || JSON.stringify(authority.nextAction?.targetShotIds) !== JSON.stringify(targetShotIds)) throw new Error("semantic-pilot-authority-reconcile-did-not-win");
  persistProjectState(appRoot, recalculated, {event});
  return {workspaceSha256: recalculated.workspaceSha256, authority: {currentStage: authority.currentStage, nextAction: authority.nextAction}, eventId: event.eventId};
});

console.log(JSON.stringify({status: "PASS", ...result, singleWriterTaskId}, null, 2));
