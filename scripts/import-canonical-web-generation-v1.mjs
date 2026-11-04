#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {projectDirs, persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {updateRepairManifestSidecar} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {buildCanonicalWebImportRecord as buildImportRecord, CANONICAL_GENERATION_PROVIDERS, validateCanonicalWebCurrentBinding, validateCanonicalWebReturn} from "../apps/studio-next/src/lib/a1-canonical-web-generation-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const args = process.argv.slice(2);
const argValue = (name, fallback = null) => {
  const inline = args.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const queuePath = path.resolve(root, argValue("--queue", path.join(artifactDir, "canonical-web-generation-v1/queue.json")));
const inputPath = path.resolve(root, argValue("--input"));
const shotId = argValue("--shotId");
if (!fs.existsSync(queuePath) || !inputPath || !fs.existsSync(inputPath) || !shotId) throw new Error("canonical-web-import-queue-input-shot-required");

const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const queueJob = (queue.jobs || []).find((job) => job.shotId === shotId);
if (!queueJob) throw new Error(`canonical-web-import-job-missing:${shotId}`);
const provider = argValue("--provider", queue.provider || CANONICAL_GENERATION_PROVIDERS.WEB_CONVERSATION);
const primaryProvider = queue.provider || CANONICAL_GENERATION_PROVIDERS.WEB_CONVERSATION;
const fallbackProvider = queue.providerPolicy?.fallbackProvider || CANONICAL_GENERATION_PROVIDERS.BUILT_IN_IMAGEGEN;
const providerFlagPresent = args.includes("--provider") || args.some((item) => item.startsWith("--provider="));
const providerIsExplicitFallback = provider === fallbackProvider && providerFlagPresent;
if (provider !== primaryProvider && !providerIsExplicitFallback) throw new Error(`canonical-web-provider-selection-invalid:${provider}`);
const providerMode = provider === CANONICAL_GENERATION_PROVIDERS.BUILT_IN_IMAGEGEN ? "built-in-imagegen-tool" : (queue.providerMode || "chrome-browser-automation");
const metadata = await sharp(inputPath).metadata();
const artifactSha256 = sha256File(inputPath);
const width = Number(metadata.width || 0);
const height = Number(metadata.height || 0);
const publicFileName = `${shotId.toLowerCase()}-${artifactSha256.slice(0, 16)}.png`;
const relativeAssetPath = path.join("canonical-web-generation-v1", shotId.toLowerCase(), publicFileName);
const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/${relativeAssetPath.replaceAll(path.sep, "/")}`;
const manifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const validation = validateCanonicalWebReturn({queue, job: queueJob, artifactSha256, width, height, publicUrl});
if (validation.status !== "PASS") {
  if (!args.includes("--record-rejection")) throw new Error(`canonical-web-import-return-invalid:${validation.failures.join(",")}`);
  const rejection = withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (current.production.generation.providerRouting?.webConversation?.importAllowed === false) throw new Error("canonical-web-import-retired-history-only");
    const runtime = current.production.shotIntelligence;
    const authority = runtime.canonicalDirectorAuthority;
    const canonical = runtime.canonicalDirectorTargetRepairManifest;
    if (authority?.authoritySha256 !== queue.authoritySha256 || canonical?.manifestSha256 !== queue.manifestSha256 || canonical?.sourceRevisionHash !== queue.sourceRevisionHash) throw new Error("canonical-web-rejection-current-authority-drift");
    const currentBinding = validateCanonicalWebCurrentBinding({workspace: current, job: queueJob});
    if (currentBinding.status !== "PASS") throw new Error(`canonical-web-rejection-current-hold-frame-drift:${currentBinding.failures.join(",")}`);
    if (current.production.generation.summary.queued || current.production.generation.summary.running) throw new Error("canonical-web-rejection-requires-idle-queue");
    if (runtime.currentAssembly?.length) throw new Error("canonical-web-rejection-assembly-locked");
    const report = {
      contract: "A1CanonicalWebGenerationRejectionReport/v1",
      status: "REJECTED_BEFORE_IMPORT",
      shotId,
      jobId: queueJob.jobId,
      attempt: queueJob.attempt,
      primitiveId: queueJob.primitiveId,
      artifactSha256,
      width,
      height,
      failures: validation.failures,
      authoritySha256: queue.authoritySha256,
      manifestSha256: queue.manifestSha256,
      sourceRevisionHash: queue.sourceRevisionHash,
      planSha256: queueJob.planSha256,
      promptSha256: queueJob.promptSha256,
      provider,
      providerMode,
      sourceQueueProvider: primaryProvider,
      imported: false,
      boardRebuilt: false,
      assemblyStarted: false,
    };
    const next = structuredClone(current);
    const event = createProductionEvent({workspace: current, action: "canonical-web-generation-rejected", targetId: shotId, payload: {jobId: queueJob.jobId, attempt: queueJob.attempt, artifactSha256, failures: validation.failures, authoritySha256: queue.authoritySha256, manifestSha256: queue.manifestSha256}});
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
    recalculated.production.eventLedger.eventCount += 1;
    recalculated.production.eventLedger.lastEventId = event.eventId;
    recalculated.production.eventLedger.lastEventAt = event.createdAt;
    const saved = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {[`canonical-web-generation-v1/rejection-${shotId.toLowerCase()}-${artifactSha256.slice(0, 16)}.json`]: report}});
    return {saved, report};
  });
  await updateRepairManifestSidecar({manifestPath, update: (sidecar) => {
    const next = structuredClone(sidecar);
    const entry = (next.entries || []).find((item) => item.shotId === shotId);
    if (!entry) throw new Error(`canonical-web-rejection-sidecar-shot-missing:${shotId}`);
    const currentPrimitive = queueJob.primitiveId || entry.primitiveId;
    const history = (Array.isArray(entry.retryHistory) ? entry.retryHistory : []).map((item, index, items) => (
      index === items.length - 1 && entry.status === "RETRY_SAME_PRIMITIVE_PENDING"
        ? {...item, primitiveId: currentPrimitive}
        : item
    ));
    const samePrimitiveRetry = history.some((item) => item.primitiveId === currentPrimitive);
    const triedPrimitives = new Set([currentPrimitive, ...history.map((item) => item.primitiveId).filter(Boolean)]);
    const nextPrimitiveId = samePrimitiveRetry
      ? (entry.primitiveCandidates || []).find((candidate) => candidate && !triedPrimitives.has(candidate)) || null
      : currentPrimitive;
    const action = samePrimitiveRetry ? "SWITCH_PRIMITIVE" : "RETRY_SAME_PRIMITIVE_ONCE";
    entry.rejectedReturns = [...(entry.rejectedReturns || []), rejection.report];
    entry.retryHistory = [...history, {kind: "WEB_RETURN_REJECTED", primitiveId: currentPrimitive, attempt: queueJob.attempt, at: new Date().toISOString(), auditStatus: "NOT_RUN", nextAction: action, reasonCodes: validation.failures}];
    entry.attempt = Math.max(Number(entry.attempt || 0), Number(queueJob.attempt || 0)) + 1;
    entry.primitiveId = nextPrimitiveId || currentPrimitive;
    entry.lastAuditFailures = [...validation.failures];
    entry.status = samePrimitiveRetry && !nextPrimitiveId ? "REPAIR_BLOCKED" : samePrimitiveRetry ? "SWITCH_PRIMITIVE_PENDING" : "RETRY_SAME_PRIMITIVE_PENDING";
    entry.generationState = samePrimitiveRetry && !nextPrimitiveId ? "BLOCKED" : "READY";
    entry.auditStatus = "NOT_RUN";
    entry.auditSha = null;
    entry.auditVersion = null;
    entry.nextAction = samePrimitiveRetry && !nextPrimitiveId
      ? {action: "BLOCKED_PROVIDER_OR_PRIMITIVE_EXHAUSTED", samePrimitiveStructuralRetries: history.length, nextPrimitiveId: null, retryHistory: []}
      : {action, samePrimitiveStructuralRetries: history.filter((item) => item.primitiveId === currentPrimitive).length + 1, nextPrimitiveId: entry.primitiveId, retryHistory: []};
    return next;
  }});
  console.log(JSON.stringify({status: rejection.report.status, ...rejection.report, workspaceSha256: rejection.saved.workspaceSha256, nextAction: rejection.report.failures.includes("image-dimensions-invalid") ? "SWITCH_PRIMITIVE" : "RETRY_SAME_PRIMITIVE_ONCE", imageGenCalledByImporter: false}, null, 2));
  process.exit(0);
}
const bytes = fs.readFileSync(inputPath);
let committed;
let importedRecord;
committed = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.providerRouting?.webConversation?.importAllowed === false) throw new Error("canonical-web-import-retired-history-only");
  const runtime = current.production.shotIntelligence;
  const authority = runtime.canonicalDirectorAuthority;
  const canonical = runtime.canonicalDirectorTargetRepairManifest;
  if (authority?.authoritySha256 !== queue.authoritySha256 || canonical?.manifestSha256 !== queue.manifestSha256 || canonical?.sourceRevisionHash !== queue.sourceRevisionHash) throw new Error("canonical-web-import-current-authority-drift");
  const currentBinding = validateCanonicalWebCurrentBinding({workspace: current, job: queueJob});
  if (currentBinding.status !== "PASS") throw new Error(`canonical-web-import-current-hold-frame-drift:${currentBinding.failures.join(",")}`);
  if (current.production.generation.summary.queued || current.production.generation.summary.running) throw new Error("canonical-web-import-requires-idle-queue");
  if (runtime.currentAssembly?.length) throw new Error("canonical-web-import-assembly-locked");
  importedRecord = buildImportRecord({queue, job: queueJob, artifactSha256, publicUrl, width, height, provider, providerMode});
  const next = structuredClone(current);
  const references = Array.isArray(next.production.shotIntelligence.lookMasterRawReferences) ? next.production.shotIntelligence.lookMasterRawReferences : [];
  next.production.shotIntelligence.lookMasterRawReferences = references.map((reference) => reference.shotId === shotId && reference.planSha256 === queueJob.planSha256
    ? {...reference, current: false, recommendationEligible: false, selectionEligible: false, supersededBy: importedRecord.referenceId}
    : reference);
  next.production.shotIntelligence.lookMasterRawReferences.push(importedRecord);
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  const event = createProductionEvent({workspace: current, action: "canonical-web-generation-import", targetId: shotId, payload: {referenceId: importedRecord.referenceId, artifactSha256, authoritySha256: queue.authoritySha256, manifestSha256: queue.manifestSha256, planSha256: queueJob.planSha256, promptSha256: queueJob.promptSha256, auditRequired: true}});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1CanonicalWebGenerationImportReport/v1", status: "IMPORTED_PENDING_ACTUAL_PIXEL_AUDIT", shotId, referenceId: importedRecord.referenceId, artifactSha256, publicUrl, width, height, authoritySha256: queue.authoritySha256, manifestSha256: queue.manifestSha256, planSha256: queueJob.planSha256, promptSha256: queueJob.promptSha256, provider, providerMode, sourceQueueProvider: primaryProvider, recommendationEligible: false, selectionEligible: false, assemblyEligible: false, boardRebuilt: false, assemblyStarted: false};
  const saved = persistProjectState(appRoot, recalculated, {event, binaryFiles: {[relativeAssetPath]: bytes}, files: {"canonical-web-generation-v1/import-report.json": report}, expectedWorkspaceSha256: current.workspaceSha256});
  return {saved, report};
});

await updateRepairManifestSidecar({manifestPath, update: (sidecar) => {
  const next = structuredClone(sidecar);
  const entry = (next.entries || []).find((item) => item.shotId === shotId);
  if (!entry) throw new Error(`canonical-web-import-sidecar-shot-missing:${shotId}`);
  const sidecarPlanSha256 = entry.currentPlanSha256 || entry.planSha256 || null;
  if (sidecarPlanSha256 !== queueJob.planSha256 || entry.authoritySha256 && entry.authoritySha256 !== queue.authoritySha256 || entry.manifestSha256 && entry.manifestSha256 !== queue.manifestSha256) throw new Error("canonical-web-import-sidecar-binding-drift");
  entry.candidateSha = artifactSha256;
  entry.auditSha = null;
  entry.auditStatus = "NOT_RUN";
  entry.status = "AUDIT_DELTA_REQUIRED";
  entry.generationState = "COMPLETED";
  entry.nextAction = {action: "AUDIT_DELTA", provider: "chatgpt-web-conversation", artifactSha256, auditRequired: true};
  return next;
}});
console.log(JSON.stringify({status: committed.report.status, ...committed.report, workspaceSha256: committed.saved.workspaceSha256, nextAction: "run-audit-canonical-title-repair-actual-pixels-v1", imageGenCalledByImporter: false}, null, 2));
