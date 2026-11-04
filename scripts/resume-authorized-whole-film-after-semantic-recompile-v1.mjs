#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {queueWholeFilmLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = "7f396f351213025e93d68583953903f393a0fdddc87608bfb3b451efa1558760";
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error("authorized-resume-workspace-sha-changed");
  const runtime = current.production.shotIntelligence;
  const approvedHistory = [...(runtime.semanticPilotHistory || [])].reverse().find((item) => item.status === "SEMANTIC_PILOT_APPROVED" && item.approvedBy === "user");
  if (!approvedHistory || runtime.semanticPilotDecision?.decision !== "APPROVE_DIRECTION_AND_EXPAND_FULL_FILM") throw new Error("authorized-resume-user-direction-approval-missing");
  if (runtime.semanticDesignBriefSet?.status !== "READY" || runtime.semanticDesignBriefSet.briefs?.length !== 34 || runtime.semanticDesignBriefSet.briefs.some((brief) => brief.status !== "READY")) throw new Error("authorized-resume-semantic-brief-set-not-ready");
  const plans = runtime.packageLookMasterPlans || [];
  if (!plans.length || plans.some((plan) => plan.dataChainVersion !== 3 || !plan.semanticDesignBrief || plan.semanticDesignBrief.briefSha256 !== plan.semanticDesignBriefSha256)) throw new Error("authorized-resume-v3-look-master-plan-required");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("authorized-resume-queue-not-idle");

  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  nextRuntime.semanticPilot = {
    ...structuredClone(approvedHistory),
    status: "SEMANTIC_PILOT_APPROVED",
    current: false,
    authorityScope: "HISTORY_READ_ONLY",
    resumedAfterSemanticRecompile: true,
    resumedAt: now,
  };
  nextRuntime.status = "LOOK_MASTER_PLANS_READY";
  nextRuntime.wholeFilmBatchRecommendation = {
    ...(nextRuntime.wholeFilmBatchRecommendation || {}),
    status: "FULL_FILM_GENERATION_AUTHORIZED",
    explorationOnly: false,
    semanticPilotApproved: true,
    recommendation: null,
    selected: null,
    currentAssembly: [],
    exceptions: [],
    autoRecommendationAllowed: true,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    resumedAfterSemanticRecompile: true,
    updatedAt: now,
  };
  const queued = queueWholeFilmLookMasterGenerationJobs(next, next.production.shotVisualCoveragePlan, {now});
  queued.workspace.production.generation.workerStatus = "starting";
  const event = createProductionEvent({
    workspace: current,
    action: "resume-authorized-whole-film-generation-after-semantic-recompile",
    targetId: queued.readiness.sha256,
    payload: {
      approvedBy: "user",
      approvalReusedFrom: approvedHistory.approvedAt,
      recompiledBriefSetSha256: nextRuntime.semanticDesignBriefSet.briefSetSha256,
      queuedJobCount: queued.jobs.length,
      shotIds: queued.shotIds,
      dataChainVersion: 3,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      layerReconstructionPerformed: false,
      criticPerformed: false,
      motionPerformed: false,
      singleWriterTaskId,
    },
    now,
  });
  queued.workspace.production.eventLedger.eventCount += 1;
  queued.workspace.production.eventLedger.lastEventId = event.eventId;
  queued.workspace.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(queued.workspace, now));
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "current-project-visual-contract-upgrade-v1/authorized-resume-after-semantic-recompile.json": {
        contract: "A1AuthorizedWholeFilmResumeAfterSemanticRecompile/v1",
        workspaceSha256Before: current.workspaceSha256,
        workspaceSha256After: recalculated.workspaceSha256,
        approvalReusedFrom: approvedHistory.approvedAt,
        recompiledBriefSetSha256: nextRuntime.semanticDesignBriefSet.briefSetSha256,
        queuedJobCount: queued.jobs.length,
        shotIds: queued.shotIds,
        dataChainVersion: 3,
        singleWriterTaskId,
        generatedAt: now,
      },
    },
  });
  return {workspaceSha256: recalculated.workspaceSha256, queuedJobCount: queued.jobs.length, shotIds: queued.shotIds, readiness: recalculated.production.wholeFilmGenerationReadiness};
});

console.log(JSON.stringify({status: "AUTHORIZED_WHOLE_FILM_GENERATION_RESUMED", ...result, singleWriterTaskId}, null, 2));
