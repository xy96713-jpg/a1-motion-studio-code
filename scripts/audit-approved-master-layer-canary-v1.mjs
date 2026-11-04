#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

import {evaluateApprovedMasterLayerCanary, measureApprovedMasterLayerCandidate} from "../apps/studio-next/src/lib/a1-approved-master-layer-canary-gate-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("approved-master-layer-canary-audit-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
const normalizeOcr = (value) => String(value || "").replace(/[\s“”"'‘’。，、：:；;！!？?（）()「」【】<>《》→]/gu, "").replace(/AL/gu, "AI").replace(/入话/gu, "人话");
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const ocr = (file) => {
  const result = spawnSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 4_000_000});
  if (result.status !== 0) return {status: "BLOCKED", text: "", normalized: ""};
  try {
    const parsed = JSON.parse(result.stdout.trim().split("\n").at(-1));
    return {status: parsed.status || "BLOCKED", text: parsed.text || "", normalized: normalizeOcr(parsed.text)};
  } catch {
    return {status: "BLOCKED", text: "", normalized: ""};
  }
};

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-master-layer-canary-audit-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen" || current.production.generation.automaticDispatchAllowed !== false) throw new Error("approved-master-layer-canary-audit-frozen-runtime-required");
  const pilot = current.production.shotIntelligence.approvedMasterLayerPilot;
  if (pilot?.status !== "COMPLETE_PENDING_ACTUAL_PIXEL_AUDIT") throw new Error("approved-master-layer-canary-complete-pending-audit-required");
  const canary = [
    {shotId: "ED-08", layerKind: "TYPOGRAPHY"},
    {shotId: "ED-14", layerKind: "BACKGROUND"},
  ].map((spec) => {
    const job = current.production.generation.jobs.find((entry) => pilot.dispatchJobIds?.includes(entry.id) && entry.shotId === spec.shotId && entry.packageLayerKind === spec.layerKind);
    if (!job) throw new Error(`approved-master-layer-canary-target-missing:${spec.shotId}:${spec.layerKind}`);
    return {...spec, jobId: job.id};
  });
  const items = [];
  for (const spec of canary) {
    const job = current.production.generation.jobs.find((entry) => entry.id === spec.jobId);
    if (!job || job.status !== "complete" || !job.output?.publicUrl || !job.referenceInputs?.[0]?.publicUrl) throw new Error(`approved-master-layer-canary-result-missing:${spec.jobId}`);
    const candidateFile = publicFile(job.output.publicUrl);
    const masterFile = publicFile(job.referenceInputs[0].publicUrl);
    if (!fs.existsSync(candidateFile) || fileSha256(candidateFile) !== job.output.sha256 || !fs.existsSync(masterFile) || fileSha256(masterFile) !== job.referenceInputs[0].sourceSha256) throw new Error(`approved-master-layer-canary-file-sha-invalid:${spec.jobId}`);
    const metrics = await measureApprovedMasterLayerCandidate({candidateFile, masterFile});
    const outputOcr = spec.layerKind === "TYPOGRAPHY" ? ocr(candidateFile) : null;
    const masterOcr = spec.layerKind === "TYPOGRAPHY" ? ocr(masterFile) : null;
    const gate = evaluateApprovedMasterLayerCanary({layerKind: spec.layerKind, metrics, outputOcrNormalized: outputOcr?.normalized || "", masterOcrNormalized: masterOcr?.normalized || ""});
    items.push({jobId: job.id, shotId: job.shotId, layerKind: spec.layerKind, candidate: {publicUrl: job.output.publicUrl, sha256: job.output.sha256}, approvedMaster: {publicUrl: job.referenceInputs[0].publicUrl, sha256: job.referenceInputs[0].sourceSha256}, gate, ocr: spec.layerKind === "TYPOGRAPHY" ? {output: outputOcr, approvedMaster: masterOcr} : null, adoptionStatus: "REJECTED_TECHNICAL_CANARY"});
  }
  const rejected = items.filter((item) => item.gate.status !== "PASS");
  if (rejected.length === 0) throw new Error("approved-master-layer-canary-unexpected-pass-review-required");
  const now = new Date().toISOString();
  const auditBody = {
    contract: "A1ApprovedMasterLayerCanaryAudit/v1",
    status: "FAIL_METHOD_INVALID",
    testedMethod: "IMAGEGEN_EXTRACT_APPROVED_MASTER_PIXELS",
    itemCount: items.length,
    passCount: items.length - rejected.length,
    failCount: rejected.length,
    items,
    decision: "DO_NOT_EXPAND_IMAGEGEN_LAYER_EXTRACTION",
    replacementMethod: "DETERMINISTIC_MASTER_PIXEL_MASK_PARTITION_WITH_ORIGINAL_PRESENTER_RESTORE",
    imagegenRoleAfterDecision: "FULL_LOOK_MASTER_ONLY_AND_EXPLICIT_MASK_BOUND_HOLE_REPAIR",
    generatedAt: now,
  };
  const audit = {...auditBody, auditSha256: sha256({...auditBody, generatedAt: undefined})};
  let next = structuredClone(current);
  for (const item of items) {
    const job = next.production.generation.jobs.find((entry) => entry.id === item.jobId);
    job.output.actualPixelCanaryAudit = {status: item.gate.status, failures: item.gate.failures, auditSha256: audit.auditSha256};
    job.output.adoptionStatus = "REJECTED_TECHNICAL_CANARY";
  }
  const cancelledJobIds = [];
  for (const job of next.production.generation.jobs) {
    if (job.targetKind !== "package-layer" || job.status !== "queued") continue;
    job.status = "cancelled";
    job.error = "IMAGEGEN_PIXEL_EXTRACTION_CANARY_FAILED_USE_DETERMINISTIC_MASK_PARTITION";
    job.cancelledAt = now;
    job.cancelledByAuditSha256 = audit.auditSha256;
    cancelledJobIds.push(job.id);
  }
  next.production.shotIntelligence.approvedMasterLayerCanaryAudit = audit;
  next.production.shotIntelligence.approvedMasterLayerPilot = {
    ...pilot,
    status: "CANARY_FAILED_DETERMINISTIC_RECOMPILE_REQUIRED",
    dispatchJobIds: [],
    rejectedJobIds: items.map((item) => item.jobId),
    rejectedCandidateShas: items.map((item) => item.candidate.sha256),
    canaryAuditSha256: audit.auditSha256,
    cancelledQueuedJobIds: cancelledJobIds,
    wholeFilmExpansionAllowed: false,
    replacementMethod: audit.replacementMethod,
    completedAt: now,
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "reject-approved-master-imagegen-layer-canary", targetId: items.map((item) => item.jobId).join(","), payload: {auditSha256: audit.auditSha256, failCount: rejected.length, cancelledQueuedJobCount: cancelledJobIds.length, replacementMethod: audit.replacementMethod}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `reject-approved-master-layer-canary-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/canary-audit.json": audit}});
  return {status: audit.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, auditSha256: audit.auditSha256, failCount: rejected.length, failures: Object.fromEntries(rejected.map((item) => [item.shotId, item.gate.failures])), cancelledQueuedJobCount: cancelledJobIds.length, workerStatus: next.production.generation.workerStatus, automaticDispatchAllowed: next.production.generation.automaticDispatchAllowed};
});

console.log(JSON.stringify(result, null, 2));
