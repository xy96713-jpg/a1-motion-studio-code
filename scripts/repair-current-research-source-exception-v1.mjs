#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildRequiredResearchExceptions, buildRequiredResearchPacketAudits} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("research-exception-repair-requires-idle-queue");
  if (current.production.shotIntelligence.currentAssembly?.length) throw new Error("research-exception-repair-must-not-touch-assembly");

  const runtime = current.production.shotIntelligence;
  const requiredResearchExceptions = buildRequiredResearchExceptions(runtime);
  if (!requiredResearchExceptions.length) throw new Error("no-blocked-required-research-packet");

  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  const batch = nextRuntime.wholeFilmBatchRecommendation || {};
  const existingKeys = new Set((batch.exceptions || []).map((item) => `${item.shotId}:${item.code}`));
  batch.exceptions = [
    ...(batch.exceptions || []),
    ...requiredResearchExceptions.filter((item) => !existingKeys.has(`${item.shotId}:${item.code}`)),
  ];
  batch.status = "PARTIAL_WITH_EXCEPTIONS";
  batch.recommendation = null;
  batch.selected = null;
  batch.currentAssembly = [];
  batch.autoRecommendationAllowed = false;
  batch.assemblyCreationAllowed = false;
  batch.layerReconstructionAllowed = false;
  batch.criticAllowed = false;
  batch.motionAllowed = false;
  batch.reviewScope = "WHOLE_FILM_STATIC_BOARD";
  batch.nextUserGate = "WHOLE_FILM_STATIC_BOARD";
  batch.researchPacketAudits = buildRequiredResearchPacketAudits(nextRuntime);
  batch.updatedAt = now;
  nextRuntime.wholeFilmBatchRecommendation = batch;

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "required-research-source-exception-repaired",
    targetId: requiredResearchExceptions.map((item) => item.shotId).join(","),
    payload: {
      contract: "A1RequiredResearchSourceExceptionRepair/v1",
      requiredResearchExceptions,
      candidateGenerationChanged: false,
      generatedAssetsChanged: false,
      assemblyCreated: false,
      layerReconstructionStarted: false,
      criticPerformed: false,
      motionPerformed: false,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1RequiredResearchSourceExceptionRepairReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    requiredResearchExceptions,
    researchPacketAudits: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.researchPacketAudits,
    queue: recalculated.production.generation.summary,
    assemblyCreated: false,
    layerReconstructionStarted: false,
    criticPerformed: false,
    motionPerformed: false,
    nextUserGate: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.nextUserGate,
    generatedAt: now,
  };
  persistProjectState(appRoot, recalculated, {event, files: {"required-research-source-exception-repair-v1/report.json": report}});
  return report;
});

console.log(JSON.stringify(result, null, 2));
