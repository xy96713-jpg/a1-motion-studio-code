#!/usr/bin/env node

import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = "c3421d372989c2a920a46f2018d69b51db28f46b9bb0632a773b6ec3156132c7";
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error("semantic-pilot-provenance-workspace-changed-since-checkpoint");
  const runtime = current.production.shotIntelligence;
  const pilot = runtime.semanticPilot;
  if (runtime.status !== "SEMANTIC_PILOT_REVIEW_REQUIRED" || pilot?.candidates?.length !== 3) throw new Error("semantic-pilot-provenance-invalid-pilot");
  const actualJobIds = pilot.candidates.map((candidate) => candidate.generationJobId);
  const matched = pilot.candidates.every((candidate) => {
    const job = current.production.generation.jobs.find((item) => item.id === candidate.generationJobId);
    return job?.status === "complete" && job.output?.sha256 === candidate.artifact?.sha256;
  });
  if (!matched) throw new Error("semantic-pilot-provenance-artifact-job-mismatch");
  if (JSON.stringify(pilot.jobIds) === JSON.stringify(actualJobIds)) return {workspaceSha256: current.workspaceSha256, changed: false, jobIds: actualJobIds};

  const next = structuredClone(current);
  const now = new Date().toISOString();
  next.production.shotIntelligence.semanticPilot.jobIds = actualJobIds;
  const event = createProductionEvent({
    workspace: current,
    action: "semantic-pilot-provenance-reconciled",
    targetId: pilot.contactSheet?.sha256 || "semantic-pilot",
    payload: {jobIds: actualJobIds, candidateArtifactSha256: pilot.candidates.map((candidate) => candidate.artifact.sha256), imageGenerationPerformed: false, singleWriterTaskId},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (JSON.stringify(recalculated.production.shotIntelligence.semanticPilot.jobIds) !== JSON.stringify(actualJobIds)) throw new Error("semantic-pilot-provenance-not-persisted");
  persistProjectState(appRoot, recalculated, {event});
  return {workspaceSha256: recalculated.workspaceSha256, changed: true, jobIds: actualJobIds, eventId: event.eventId};
});

console.log(JSON.stringify({status: "PASS", ...result, singleWriterTaskId}, null, 2));
