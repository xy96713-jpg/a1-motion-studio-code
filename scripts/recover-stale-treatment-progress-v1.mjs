#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date();
const nowIso = now.toISOString();
const {artifactDir} = projectDirs(appRoot);
const workerLock = path.join(artifactDir, ".generated-visual-composite-worker.lock");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const progress = current.production.visualDirector?.treatmentBatchProgress;
  if (!progress || progress.status !== "running") {
    return {status: "NO_RECOVERY_REQUIRED", reason: "treatment-progress-not-running", workspaceSha256: current.workspaceSha256};
  }
  if (fs.existsSync(workerLock)) {
    return {status: "NO_RECOVERY_REQUIRED", reason: "live-compositor-lock-present", workspaceSha256: current.workspaceSha256};
  }

  const heartbeatMs = Date.parse(progress.heartbeatAt || "");
  const timeoutMs = Math.max(30_000, Number(progress.timeoutMs || 120_000));
  const staleMs = Number.isFinite(heartbeatMs) ? Math.max(0, now.getTime() - heartbeatMs) : Infinity;
  if (staleMs <= timeoutMs) {
    return {status: "NO_RECOVERY_REQUIRED", reason: "heartbeat-within-timeout", staleMs, timeoutMs, workspaceSha256: current.workspaceSha256};
  }

  const next = structuredClone(current);
  const nextProgress = next.production.visualDirector.treatmentBatchProgress;
  nextProgress.status = "failed";
  nextProgress.phase = "stale-run-recovered";
  nextProgress.error = "treatment-batch-stale-no-live-worker";
  nextProgress.elapsedMs = Math.max(Number(nextProgress.elapsedMs || 0), staleMs);
  nextProgress.heartbeatAt = nowIso;
  next.production.generation.automaticDispatchAllowed = false;

  const event = createProductionEvent({
    workspace: current,
    action: "visual-treatment-stale-progress-recovered",
    targetId: nextProgress.batchHash || "visual-treatment-batch",
    payload: {
      previousStatus: "running",
      previousPhase: progress.phase,
      staleMs,
      timeoutMs,
      workerLockPresent: false,
      imageGenerationDispatched: false,
      preservesStrategySwitchBlocker: true,
    },
    now: nowIso,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, nowIso);
  persistProjectState(appRoot, recalculated, {event});
  return {
    status: "STALE_TREATMENT_PROGRESS_RECOVERED",
    previousPhase: progress.phase,
    staleMs,
    timeoutMs,
    imageGenerationDispatched: false,
    nextAction: recalculated.production.authority.nextAction,
    workspaceSha256: recalculated.workspaceSha256,
    eventId: event.eventId,
  };
});

console.log(JSON.stringify(result, null, 2));
