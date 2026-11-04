#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildOperationOrchestrationState} from "../apps/studio-next/src/lib/a1-operation-trace-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readPublicJson = (publicUrl) => JSON.parse(fs.readFileSync(path.join(publicRoot, String(publicUrl || "").replace(/^\/+/, "")), "utf8"));

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const existing = current.production?.operationOrchestration;
  if (!existing?.trace?.publicUrl || !existing?.performance?.publicUrl) throw new Error("operation-orchestration-source-refs-missing");
  const trace = readPublicJson(existing.trace.publicUrl);
  const performance = readPublicJson(existing.performance.publicUrl);
  if (trace.sha256 !== existing.trace.sha256 || performance.sha256 !== existing.performance.sha256) throw new Error("operation-orchestration-source-ref-stale");
  const fresh = buildOperationOrchestrationState({trace, performance, createdAt: existing.createdAt || now});
  const mergedWithoutHash = {
    ...fresh,
    status: existing.status || fresh.status,
    trace: {...fresh.trace, publicUrl: existing.trace.publicUrl},
    performance: {...fresh.performance, publicUrl: existing.performance.publicUrl},
    gates: existing.gates || fresh.gates,
    nextAction: existing.nextAction || fresh.nextAction,
    ...(existing.manifest ? {manifest: existing.manifest} : {}),
    ...(existing.report ? {report: existing.report} : {}),
    ...(existing.preview ? {preview: existing.preview} : {}),
    ...(existing.visualReview ? {visualReview: existing.visualReview} : {}),
  };
  delete mergedWithoutHash.sha256;
  const next = structuredClone(current);
  next.production.operationOrchestration = {...mergedWithoutHash, sha256: sha256(mergedWithoutHash)};
  next.production.eventLedger.eventCount += 1;
  const event = createProductionEvent({
    workspace: current,
    action: "operation-trace-evidence-synchronized",
    targetId: trace.shotId,
    payload: {traceSha256: trace.sha256, performanceSha256: performance.sha256, eventEvidenceCount: trace.events.length},
    now,
  });
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return recalculated;
});

console.log(JSON.stringify({
  status: "PASS",
  shotId: updated.production.operationOrchestration.currentShotId,
  eventEvidenceCount: updated.production.operationOrchestration.trace.eventEvidence.length,
  previewPreserved: Boolean(updated.production.operationOrchestration.preview),
  visualReviewPreserved: updated.production.operationOrchestration.visualReview?.verdict || null,
  workspaceSha256: updated.workspaceSha256,
}, null, 2));
