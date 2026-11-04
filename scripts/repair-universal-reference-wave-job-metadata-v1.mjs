#!/usr/bin/env node

import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const wave = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(publicDir, "golden-film-visual-system-maturity-v1/universal-reference-generation-wave-v1/manifest.json"), "utf8"));
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const byId = new Map(wave.jobs.map((job) => [job.jobId, job]));
  const next = structuredClone(current);
  let repaired = 0;
  next.production.generation.jobs = next.production.generation.jobs.map((job) => {
    const waveJob = byId.get(job.id);
    if (!waveJob) return job;
    repaired += 1;
    return {...job, shotId: waveJob.shotId, candidateIndex: waveJob.candidateIndex, targetKind: "package-look-master"};
  });
  if (repaired !== wave.jobs.length) throw new Error(`universal-reference-wave-job-metadata-count:${repaired}/${wave.jobs.length}`);
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: current.workspaceSha256, event: {contract: "A1ProductionEvent/v1", action: "repair-universal-reference-wave-job-metadata", targetId: wave.manifestSha256, createdAt: now, payload: {contract: "A1UniversalReferenceWaveJobMetadataRepair/v1", repairedJobCount: repaired}}});
  return {status: "PASS", repairedJobCount: repaired, workspaceSha256: committed.workspaceSha256};
});

console.log(JSON.stringify(result, null, 2));
