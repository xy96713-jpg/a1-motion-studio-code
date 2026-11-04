#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, updateGenerationJob} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const targetShotIds = (process.argv.find((value) => value.startsWith("--shotIds="))?.slice("--shotIds=".length) || "ED-01,ED-14,ED-16")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (!targetShotIds.length || new Set(targetShotIds).size !== targetShotIds.length) throw new Error("targeted-look-master-shot-ids-invalid");
const candidateIndicesArg = process.argv.find((value) => value.startsWith("--candidateIndices="))?.slice("--candidateIndices=".length);
const candidateIndices = candidateIndicesArg
  ? candidateIndicesArg.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value))
  : null;
if (candidateIndicesArg && (!candidateIndices?.length || new Set(candidateIndices).size !== candidateIndices.length)) throw new Error("targeted-look-master-candidate-indices-invalid");
const generationMode = process.argv.find((value) => value.startsWith("--generationMode="))?.slice("--generationMode=".length) || "FAST_CANDIDATE_DISCOVERY";
if (!["FAST_CANDIDATE_DISCOVERY", "PRIMITIVE_SWITCH"].includes(generationMode)) throw new Error("targeted-look-master-generation-mode-invalid");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const summary = current.production.generation.summary;
  const stalePromptInFlight = current.production.generation.jobs.filter((job) => ["queued", "running"].includes(job.status)
    && /for this ED-01 frame|x<=0\.22/u.test(String(job.prompt || "")));
  if (summary.running !== 0 && stalePromptInFlight.length === 0) throw new Error("targeted-look-master-queue-requires-no-running-job");
  const targetSet = new Set(targetShotIds);
  const activeJobs = current.production.generation.jobs.filter((job) => ["queued", "running"].includes(job.status));
  if (activeJobs.some((job) => !targetSet.has(job.shotId) || job.targetKind !== "package-look-master")) throw new Error("targeted-look-master-queue-found-out-of-scope-active-job");

  let next = current;
  const stalePromptJobs = current.production.generation.jobs.filter((job) => targetSet.has(job.shotId)
    && job.targetKind === "package-look-master"
    && ["queued", "running"].includes(job.status)
    && /for this ED-01 frame|x<=0\.22/u.test(String(job.prompt || "")));
  for (const job of stalePromptJobs) {
    next = updateGenerationJob(next, job.id, {
      status: "stale",
      error: "stale-prompt-compiler-overlay-geometry-special-case",
      staleAt: now,
      staleReason: "prompt-compiler-geometry-special-case-removed",
    });
  }
  const activeAfterPromptRepair = next.production.generation.jobs.filter((job) => ["queued", "running"].includes(job.status));
  if (activeAfterPromptRepair.some((job) => !targetSet.has(job.shotId) || job.targetKind !== "package-look-master")) throw new Error("targeted-look-master-queue-found-out-of-scope-active-job");
  const jobs = activeAfterPromptRepair.length
    ? activeAfterPromptRepair
    : targetShotIds.flatMap((shotId) => {
      const result = queuePackageLookMasterGenerationJobs(next, shotId, {
        now,
        candidateIndices,
        generationMode,
      });
      next = result.workspace;
      return result.jobs;
    });
  const queuedTargetJobs = next.production.generation.jobs.filter((job) => job.status === "queued");
  if (queuedTargetJobs.some((job) => !targetSet.has(job.shotId) || job.targetKind !== "package-look-master")) throw new Error("targeted-look-master-queue-created-out-of-scope-job");
  if (new Set(jobs.map((job) => job.generationInputHash)).size !== jobs.length) throw new Error("targeted-look-master-queue-duplicate-input-hash");
  if (next.production.generation.summary.running !== 0 || next.production.generation.summary.queued !== queuedTargetJobs.length) throw new Error("targeted-look-master-queue-summary-invalid");

  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "starting";
  next.policy = {
    ...next.policy,
    automaticDispatchAllowed: false,
    queuedJobCount: next.production.generation.summary.queued,
  };
  const event = createProductionEvent({
    workspace: current,
    action: "queue-targeted-look-master-replacements",
    targetId: targetShotIds.join(","),
    payload: {
      targetShotIds,
      candidateJobCount: jobs.length,
      generationModes: [...new Set(jobs.map((job) => job.generationMode))],
      concurrencyHardMax: 2,
      noLayerReconstruction: true,
      noCritic: true,
      noMotion: true,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  persistProjectState(appRoot, persisted, {event});
  console.log(JSON.stringify({
    status: "PASS",
    workspaceSha256: persisted.workspaceSha256,
    targetShotIds,
    jobs: jobs.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, status: job.status, sourceEvidenceIds: (job.sourceEvidenceInputs || []).map((item) => item.id)})),
    queue: persisted.production.generation.summary,
    worker: persisted.production.generation.workerStatus,
    concurrencyHardMax: 2,
  }, null, 2));
});
