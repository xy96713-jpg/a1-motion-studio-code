#!/usr/bin/env node

import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertProductionHotPathState} from "../apps/studio-next/src/lib/a1-production-hot-path-state-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const lockPath = path.join(artifactDir, ".generation-supervisor.lock");
const reportPath = path.join(artifactDir, "generation-supervisor-v1", "report.json");
const workerPath = path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs");
const hotPathStatePath = path.join(artifactDir, "hot-path-state.json");

fs.mkdirSync(path.dirname(reportPath), {recursive: true});
let lockHandle;
try {
  lockHandle = fs.openSync(lockPath, "wx");
} catch {
  console.log(JSON.stringify({contract: "A1GenerationSupervisor/v1", status: "SKIPPED", reason: "supervisor-already-running"}));
  process.exit(0);
}

const writeReport = (report) => {
  const temp = `${reportPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.renameSync(temp, reportPath);
};

try {
  let hotPathState = null;
  try {
    hotPathState = assertProductionHotPathState(JSON.parse(fs.readFileSync(hotPathStatePath, "utf8")));
  } catch {
    hotPathState = null;
  }
  const workspace = hotPathState ? null : assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const generation = hotPathState
    ? {
      ...hotPathState.generation,
      summary: hotPathState.generation.summary,
    }
    : workspace.production.generation;
  const queued = Number(generation.summary?.queued || 0);
  const running = Number(generation.summary?.running || 0);
  const workerLockPath = path.join(artifactDir, ".generation-worker.lock");
  const workerAlreadyRunning = fs.existsSync(workerLockPath) || running > 0;
  const dispatchAllowed = generation.automaticDispatchAllowed === true
    && queued > 0
    && generation.workerStatus !== "frozen"
    && !workerAlreadyRunning;
  const now = new Date().toISOString();
  let workerPid = null;
  let status = "WAITING";
  let reason = "queue-empty-or-current-authority-freeze";
  if (workerAlreadyRunning) {
    status = "RUNNING";
    reason = "existing-worker-lease-or-running-jobs";
  } else if (dispatchAllowed) {
    const child = spawn(process.execPath, [workerPath], {cwd: root, detached: true, stdio: "ignore"});
    child.unref();
    workerPid = child.pid || null;
    status = "DISPATCHED";
    reason = "queued-jobs-dispatched-through-single-worker-entrypoint";
  }
  const report = {
    contract: "A1GenerationSupervisor/v1",
    status,
    reason,
    stateSource: hotPathState ? "hot-path-state" : "workspace",
    generatedAt: now,
    workspaceSha256: hotPathState?.workspaceSha256 || workspace.workspaceSha256,
    authorityStage: hotPathState?.authority?.currentStage || workspace.production.authority?.currentStage || null,
    nextAction: hotPathState?.authority?.nextAction?.id || workspace.production.authority?.nextAction?.id || null,
    automaticDispatchAllowed: generation.automaticDispatchAllowed === true,
    workerStatus: generation.workerStatus,
    queue: {queued, running, complete: Number(generation.summary?.complete || 0), stale: Number(generation.summary?.stale || 0), failed: Number(generation.summary?.failed || 0)},
    workerPid,
    workerLeaseDetected: workerAlreadyRunning,
    safety: {historyPreserved: true, maxConcurrency: Number(generation.concurrency || 2), noGenerationWhenFrozen: true},
  };
  writeReport(report);
  console.log(JSON.stringify({...report, reportPath: path.relative(root, reportPath)}, null, 2));
} finally {
  if (lockHandle != null) fs.closeSync(lockHandle);
  fs.rmSync(lockPath, {force: true});
}
