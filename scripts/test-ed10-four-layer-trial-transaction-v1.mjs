#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(path.join(root, "apps/studio-next")));
const runtime = workspace.production.shotIntelligence;
const plan = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
if (runtime.ed10FourLayerTrial?.status === "ASSEMBLY_REVIEW_REQUIRED" && recipe?.status === "ASSEMBLY_REVIEW_REQUIRED") {
  const actualLayerCandidateCount = plan.layers.reduce((sum, layer) => sum + (layer.candidates || []).filter((candidate) => candidate.status === "READY").length, 0);
  if (runtime.ed10FourLayerTrial.actualLayerCandidateCount !== actualLayerCandidateCount) throw new Error("ed10-trial-deterministic-review-candidate-count-mismatch");
  if (runtime.ed10FourLayerTrial.currentAssemblyAvailableForApproval !== true) throw new Error("ed10-trial-assembly-preview-must-be-reviewable");
  if (runtime.ed10FourLayerTrial.result?.status !== "ASSEMBLY_REVIEW_REQUIRED" || runtime.ed10FourLayerTrial.result?.parityStatus !== "REVIEW_REQUIRED") throw new Error("ed10-trial-result-must-match-review-state");
  if (/BLOCKED_|parityStatus["']?:["']BLOCK/u.test(JSON.stringify(runtime.ed10FourLayerTrial.result))) throw new Error("ed10-trial-result-must-not-retain-blocked-parity");
  if (recipe.parityAudit?.status !== "REVIEW_REQUIRED" || recipe.deterministicParity?.status !== "REVIEW_REQUIRED") throw new Error("ed10-trial-deterministic-parity-review-required");
  if (recipe.finalAssemblyReview !== null || recipe.assemblyPreviewAvailable !== true || recipe.assemblyReadyForUserReview !== true || recipe.assemblyUserApproved !== false) throw new Error("ed10-trial-review-only-state-invalid");
  const activeCandidates = plan.layers.flatMap((layer) => layer.candidates || []).filter((candidate) => candidate.status === "READY");
  const registry = workspace.production.packageLayerAdmissionRegistry || {};
  if (activeCandidates.length !== actualLayerCandidateCount || Object.values(registry).filter((entry) => entry?.status !== "HISTORY_READ_ONLY" && entry?.current !== false).length !== activeCandidates.length) throw new Error("ed10-trial-server-admission-registry-count-invalid");
  for (const candidate of activeCandidates) {
    const admissionId = candidate.provenance?.serverAuditId || candidate.serverAuditId || candidate.admission?.admissionId;
    if (!admissionId || !registry[admissionId] || registry[admissionId].artifactSha256 !== candidate.artifact?.sha256) throw new Error(`ed10-trial-server-admission-missing:${candidate.candidateId}`);
  }
  for (const audit of [...(runtime.ed10FourLayerTrial.candidateAudits || []), ...(runtime.ed10FourLayerTrial.result?.candidateAudits || [])]) {
    if (String(audit.variantId || "").startsWith("typography-") && (audit.textFree !== false || audit.containsOnlyExpectedTypography !== true)) {
      throw new Error("ed10-trial-typography-audit-must-be-text-bearing-expected-copy-only");
    }
  }
  if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") throw new Error("ed10-trial-review-queue-must-be-idle-and-frozen");
  if (runtime.ed10FourLayerTrial.serverVisualReview !== "SKIPPED_BY_BOUNDED_TRIAL") throw new Error("ed10-trial-must-not-run-critic");
  const currentWorkbenchReport = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/report.json"), "utf8"));
  if (currentWorkbenchReport.summary?.assemblyPreviewAvailable !== true || currentWorkbenchReport.summary?.assemblyReadyForUserReview !== true || currentWorkbenchReport.summary?.currentAssemblyAvailableForApproval !== true) throw new Error("ed10-trial-reviewable-report-missing");
  console.log(JSON.stringify({status: "PASS", trial: runtime.ed10FourLayerTrial.status, actualLayerCandidateCount: activeCandidates.length, rawHistoryCount: runtime.ed10FourLayerTrial.partialRawReferenceCount || 0, serverVisualReview: runtime.ed10FourLayerTrial.serverVisualReview, queue: workspace.production.generation.summary}, null, 2));
  process.exit(0);
}
if (!String(runtime.ed10FourLayerTrial?.status || "").startsWith("BLOCKED_")) throw new Error("ed10-trial-failure-must-be-persisted-as-blocked");
if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") throw new Error("ed10-trial-blocked-queue-must-be-idle-and-frozen");
if (!runtime.ed10FourLayerTrial.failureReason || !runtime.ed10FourLayerTrial.currentAssemblyPreserved) throw new Error("ed10-trial-blocker-or-preserved-assembly-missing");
if (workspace.production.authority?.nextAction?.id !== "rebuild-ed10-four-layer-trial-after-ocr-block") throw new Error("blocked-ed10-trial-must-not-recommend-history-assembly");
if (workspace.production.packagingAutomation?.status !== "FROZEN" || !String(workspace.production.packagingAutomation?.reason || "").includes(`ed10-four-layer-trial-${String(runtime.ed10FourLayerTrial.status).toLowerCase()}`)) throw new Error("blocked-ed10-trial-automation-state-must-be-frozen-for-rebuild");
const rawRefs = (runtime.rawLayerReferences || []).filter((item) => item.planSha256 === plan?.planSha256);
if (rawRefs.some((item) => item.status !== "HISTORY_READ_ONLY")) throw new Error("ed10-trial-partial-raw-must-be-history-only");
if ((plan?.layers || []).some((layer) => (layer.candidates || []).length > 0)) throw new Error("blocked-ed10-trial-must-not-admit-partial-candidates");
if (Object.keys(workspace.production.packageLayerAdmissionRegistry || {}).some((id) => rawRefs.some((item) => item.referenceId === id))) throw new Error("blocked-ed10-trial-must-not-persist-unadmitted-registry-record");
const currentAuthorityReport = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/system-line-current-authority-v2/report.json"), "utf8"));
for (const [key, expected] of [["currentAssemblyStatus", "HISTORY_READ_ONLY"], ["fourLayerTrialRawReferenceCount", 7], ["trialCandidateCount", 0]]) {
  if (currentAuthorityReport.productionState?.[key] !== expected) throw new Error(`current-authority-trial-field-missing:${key}`);
}
if (currentAuthorityReport.productionState?.fourLayerTrialStatus !== runtime.ed10FourLayerTrial.status) throw new Error("current-authority-trial-status-mismatch");
const currentWorkbenchReport = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/report.json"), "utf8"));
for (const [key, expected] of [["currentAssemblyStatus", "HISTORY_READ_ONLY"], ["fourLayerTrialRawReferenceCount", 7], ["trialCandidateCount", 0]]) {
  if (currentWorkbenchReport.summary?.[key] !== expected) throw new Error(`workbench-report-trial-field-missing:${key}`);
}
if (currentWorkbenchReport.summary?.fourLayerTrialStatus !== runtime.ed10FourLayerTrial.status) throw new Error("workbench-report-trial-status-mismatch");
const source = fs.readFileSync(path.join(root, "scripts/execute-ed10-four-layer-trial-v1.mjs"), "utf8");
for (const marker of ["process.on(\"uncaughtException\"", "kit: structuredClone(kit)", "recipe: structuredClone(recipe)", "assertServerOwnedLayerAdmission", "packageLayerAdmissionRegistry[item.admissionRecord.admissionId]", "ed10-four-layer-trial-blocked"]) {
  if (!source.includes(marker)) throw new Error(`ed10-trial-transaction-marker-missing:${marker}`);
}
const continuationSource = fs.readFileSync(path.join(root, "scripts/continue-ed10-four-layer-trial-v1.mjs"), "utf8");
if (!continuationSource.includes("recover-ed10-four-layer-trial-v1.mjs") || !continuationSource.includes("A1_ED10_FAILURE_REASON")) throw new Error("ed10-trial-continuation-recovery-marker-missing");
console.log(JSON.stringify({status: "PASS", trial: runtime.ed10FourLayerTrial.status, queue: workspace.production.generation.summary, rawHistoryCount: rawRefs.length, preservedAssembly: runtime.ed10FourLayerTrial.preservedAssembly}, null, 2));
