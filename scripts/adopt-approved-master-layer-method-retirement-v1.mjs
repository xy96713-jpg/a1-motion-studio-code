#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (publicUrl) => path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("approved-master-method-retirement-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-master-method-retirement-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen" || current.production.generation.automaticDispatchAllowed !== false) throw new Error("approved-master-method-retirement-frozen-runtime-required");
  const runtime = current.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  const decision = runtime.wholeFilmStaticBoardDecision;
  const pilot = runtime.approvedMasterLayerPilot;
  const preflight = runtime.approvedMasterLayerJobPreflight;
  const historical = runtime.approvedMasterLayerCanaryAudit;
  if (board?.status !== "APPROVED" || decision?.decision !== "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY") throw new Error("approved-master-method-retirement-approved-board-required");
  if (pilot?.status !== "READY_FROZEN" || pilot.boardSha256 !== board.sha256 || pilot.approvalDecisionSha256 !== decision.decisionSha256) throw new Error("approved-master-method-retirement-current-pilot-required");
  if (preflight?.status !== "PASS" || preflight.queuedJobCount !== current.production.generation.summary.queued) throw new Error("approved-master-method-retirement-current-preflight-required");
  if (historical?.contract !== "A1ApprovedMasterLayerCanaryAudit/v1" || historical.status !== "HISTORY_READ_ONLY_SUPERSEDED" || historical.previousStatus !== "FAIL_METHOD_INVALID" || historical.testedMethod !== "IMAGEGEN_EXTRACT_APPROVED_MASTER_PIXELS" || historical.failCount !== 2 || historical.items?.length !== 2 || historical.items.some((item) => item.gate?.status !== "FAIL")) throw new Error("approved-master-method-retirement-historical-method-proof-invalid");
  for (const item of historical.items) {
    for (const artifact of [item.candidate, item.approvedMaster]) {
      const file = publicFile(artifact?.publicUrl);
      if (!String(artifact?.publicUrl || "").startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(file) || sha256(fs.readFileSync(file)) !== artifact.sha256) throw new Error(`approved-master-method-retirement-evidence-file-invalid:${item.shotId}`);
    }
  }

  const now = new Date().toISOString();
  const auditBody = {
    contract: "A1ApprovedMasterLayerCanaryAudit/v1",
    status: "FAIL_METHOD_INVALID",
    current: true,
    authorityScope: "CURRENT",
    testedMethod: "IMAGEGEN_EXTRACT_APPROVED_MASTER_PIXELS",
    operationScope: "EXACT_APPROVED_MASTER_PIXEL_EXTRACTION_WITH_REAL_ALPHA",
    providerScope: "codex-imagegen-current",
    decision: "DO_NOT_REPEAT_INVALID_IMAGEGEN_LAYER_EXTRACTION_ON_NEW_MASTER_HASHES",
    replacementMethod: "DETERMINISTIC_MASTER_PIXEL_MASK_PARTITION_WITH_ORIGINAL_PRESENTER_RESTORE",
    imagegenRoleAfterDecision: "FULL_LOOK_MASTER_ONLY_AND_EXPLICIT_MASK_BOUND_HOLE_REPAIR",
    sourceHistoricalAuditSha256: historical.auditSha256,
    sourceHistoricalEvidence: historical.items.map((item) => ({shotId: item.shotId, layerKind: item.layerKind, candidateSha256: item.candidate.sha256, approvedMasterSha256: item.approvedMaster.sha256, failures: item.gate.failures})),
    sourceCurrentBoardSha256: board.sha256,
    sourceCurrentApprovalDecisionSha256: decision.decisionSha256,
    sourceCurrentPreflightManifestSha256: preflight.manifestSha256,
    sourceCurrentPilotSha256: pilot.pilotSha256,
    evidenceReuseClass: "METHOD_LEVEL_NEGATIVE_CAPABILITY_EVIDENCE",
    currentMasterOutputsClaimed: false,
    currentGenerationExecuted: false,
    generatedAt: now,
  };
  const audit = {...auditBody, auditSha256: sha256({...auditBody, generatedAt: undefined})};
  let next = structuredClone(current);
  const cancelledJobIds = [];
  for (const job of next.production.generation.jobs) {
    if (job.targetKind !== "package-layer" || job.status !== "queued") continue;
    job.status = "cancelled";
    job.error = "IMAGEGEN_PIXEL_EXTRACTION_METHOD_RETIRED_USE_DETERMINISTIC_MASK_PARTITION";
    job.cancelledAt = now;
    job.cancelledByAuditSha256 = audit.auditSha256;
    cancelledJobIds.push(job.id);
  }
  next.production.shotIntelligence.approvedMasterLayerCanaryAudit = audit;
  next.production.shotIntelligence.approvedMasterLayerPilot = {
    ...pilot,
    status: "CANARY_METHOD_RETIREMENT_REUSED_DETERMINISTIC_RECOMPILE_REQUIRED",
    dispatchJobIds: [],
    canaryExecutionSkipped: true,
    currentGenerationExecuted: false,
    methodRetirementEvidenceReused: true,
    canaryAuditSha256: audit.auditSha256,
    cancelledQueuedJobIds: cancelledJobIds,
    wholeFilmExpansionAllowed: false,
    replacementMethod: audit.replacementMethod,
    completedAt: now,
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (next.production.generation.summary.queued !== 0 || next.production.generation.summary.running !== 0) throw new Error("approved-master-method-retirement-queue-not-drained");

  const report = {
    contract: "A1ApprovedMasterLayerMethodRetirementAdoption/v1",
    status: "PASS",
    auditSha256: audit.auditSha256,
    historicalAuditSha256: historical.auditSha256,
    boardSha256: board.sha256,
    approvalDecisionSha256: decision.decisionSha256,
    pilotSha256: pilot.pilotSha256,
    currentGenerationExecuted: false,
    cancelledQueuedJobCount: cancelledJobIds.length,
    cancelledQueuedJobIds: cancelledJobIds,
    replacementMethod: audit.replacementMethod,
    workerStatus: next.production.generation.workerStatus,
    queue: structuredClone(next.production.generation.summary),
    adoptedAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "adopt-approved-master-layer-method-retirement", targetId: board.sha256, payload: report, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `approved-master-method-retirement-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/current-method-retirement.json": audit, "approved-master-layer-reconstruction-v1/current-method-retirement-adoption.json": report}});
  return {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId};
});

console.log(JSON.stringify(result, null, 2));
