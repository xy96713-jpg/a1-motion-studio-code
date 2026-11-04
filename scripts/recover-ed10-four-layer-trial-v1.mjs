#!/usr/bin/env node
/** Transactional recovery for an interrupted ED-10 four-layer trial. */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, projectDirs, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {auditPackageLookMasterTopologyDiversity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const artifactDir = projectDirs(appRoot).artifactDir;
const now = process.env.A1_ED10_TRIAL_RUN_AT || new Date().toISOString();
const shotId = "ED-10";

withProjectLock(appRoot, () => {
  const rawWorkspace = readProjectWorkspace(appRoot);
  const rawRuntime = rawWorkspace.production?.shotIntelligence;
  if (["CANDIDATES_GENERATING", "RECONSTRUCTING", "LAYER_RECONSTRUCTION_IN_PROGRESS"].includes(rawRuntime?.status)) {
    rawRuntime.status = "ASSEMBLY_REVIEW_REQUIRED";
  }
  if (!rawRuntime?.crossEventTopologyAudit) {
    rawRuntime.crossEventTopologyAudit = auditPackageLookMasterTopologyDiversity(rawRuntime.packageLookMasterPlans || []);
  }
  const rawKit = rawRuntime?.packageAssetKitPlans?.find((item) => item.shotId === shotId);
  const rawRecipe = rawRuntime?.packageAssemblyRecipes?.find((item) => item.shotId === shotId);
  if (rawKit) {
    rawKit.status = "GENERATION_PLAN_ONLY";
    rawKit.historyOnly = false;
    for (const layer of rawKit.layers || []) {
      layer.status = "GENERATION_PLAN_ONLY";
      layer.candidates = [];
      layer.selectedCandidateId = null;
      layer.autoSelectedCandidateId = null;
    }
  }
  if (rawRecipe) {
    rawRecipe.status = "LAYER_RECONSTRUCTION_READY";
    rawRecipe.historyOnly = false;
    rawRecipe.layerCandidateIds = {BACKGROUND: null, TYPOGRAPHY: null, ELEMENT_KIT: null, ILLUSTRATION: null};
    rawRecipe.assemblyComposite = null;
    rawRecipe.parityAudit = null;
    rawRecipe.finalAssemblyReview = null;
  }
  const workspace = assertEditorialAssetWorkbench(rawWorkspace);
  const runtime = workspace.production.shotIntelligence;
  const plan = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
  const trial = runtime.ed10FourLayerTrial || {};
  const failureReason = process.env.A1_ED10_FAILURE_REASON || "Typography OCR failed: worker material did not preserve exact Chinese copy";
  const blockedStatus = /ocr/u.test(failureReason) ? "BLOCKED_OCR" : /diversity|variant|topology/u.test(failureReason) ? "BLOCKED_VARIANT_DIVERSITY" : "BLOCKED_POSTPROCESS";
  const trialJobIds = new Set(trial.queuedJobIds || []);
  for (const job of workspace.production.generation.jobs || []) {
    if ((trialJobIds.has(job.id) || (job.targetKind === "package-layer" && job.shotId === shotId && job.planSha256 === plan?.planSha256)) && ["queued", "running"].includes(job.status)) {
      job.status = "cancelled";
      job.error = "ed10-four-layer-trial-blocked-during-postprocess";
      job.cancelledAt = now;
    }
  }
  workspace.production.generation.summary = {queued: 0, running: 0, complete: workspace.production.generation.jobs.filter((job) => job.status === "complete").length, failed: workspace.production.generation.jobs.filter((job) => job.status === "failed").length, stale: workspace.production.generation.jobs.filter((job) => job.status === "stale").length, cancelled: workspace.production.generation.jobs.filter((job) => job.status === "cancelled").length, total: workspace.production.generation.jobs.length};
  workspace.production.generation.workerStatus = "frozen";
  const rawRefs = (runtime.rawLayerReferences || []).filter((item) => item.planSha256 === plan?.planSha256);
  for (const reference of rawRefs) {
    reference.status = "HISTORY_READ_ONLY";
    reference.historyReason = "ed10-four-layer-trial-blocked-during-postprocess";
  }
  const tempRoot = "/generated/system-line/editorial-asset-workbench-v1/package-layers/ed-10/four-layer-trial";
  const historyPath = trial.historyPath || "ed10-four-layer-trial-v1/previous-assembly-eb7ba34c743afe81.json";
  if (plan) {
    plan.status = "HISTORY_READ_ONLY";
    plan.historyOnly = true;
    plan.historyReason = "ed10-four-layer-trial-blocked-during-postprocess";
  }
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  const existingCandidateIds = new Set((plan?.layers || []).flatMap((layer) => (layer.candidates || []).map((candidate) => candidate.candidateId)));
  for (const layer of plan?.layers || []) {
    layer.status = "GENERATION_PLAN_ONLY";
    for (const candidate of layer.candidates || []) {
      candidate.status = "HISTORY_READ_ONLY";
      candidate.current = false;
      candidate.advisoryOnly = true;
      candidate.historyReason = "ed10-four-layer-trial-blocked-during-postprocess";
    }
    layer.candidates = [];
    layer.selectedCandidateId = null;
    layer.autoSelectedCandidateId = null;
  }
  for (const record of Object.values(workspace.production.packageLayerAdmissionRegistry || {})) {
    if (existingCandidateIds.has(record.candidateId)) {
      record.status = "HISTORY_READ_ONLY";
      record.advisoryOnly = true;
      record.historyReason = "ed10-four-layer-trial-blocked-during-postprocess";
    }
  }
  if (recipe) {
    recipe.status = "HISTORY_READ_ONLY";
    recipe.historyOnly = true;
    recipe.historyReason = "ed10-four-layer-trial-blocked-during-postprocess";
    recipe.assemblyComposite = workspace.production.shotIntelligence.finalAssemblyReview?.assemblyPreview || recipe.assemblyComposite || null;
  }
  runtime.status = "ASSEMBLY_REVIEW_REQUIRED";
  runtime.ed10FourLayerTrial = {...trial, status: blockedStatus, failureReason, partialRawReferenceCount: rawRefs.length, rawReferenceIds: rawRefs.map((item) => item.referenceId), currentAssemblyPreserved: true, actualLayerCandidateCount: 0, candidateIds: [], candidateAudits: [], preservedAssembly: {status: "HISTORY_READ_ONLY", historyPath, assemblyComposite: workspace.production.shotIntelligence.finalAssemblyReview?.assemblyPreview || null}, temporaryOutputs: {status: "HISTORY_READ_ONLY", publicRoot: tempRoot, reason: "no candidate was admitted"}};
  workspace.production.shotIntelligence = runtime;
  const next = recalculateEditorialAssetWorkbench(workspace, now);
  const event = createProductionEvent({workspace: next, action: "ed10-four-layer-trial-blocked", targetId: shotId, payload: {failureReason, partialRawReferenceCount: rawRefs.length, historyPath, temporaryOutputRoot: tempRoot}});
  persistProjectState(appRoot, next, {event});
  console.log(JSON.stringify({status: blockedStatus, failureReason, partialRawReferenceCount: rawRefs.length, queue: next.production.generation.summary, worker: next.production.generation.workerStatus, workspaceSha256: next.workspaceSha256, preservedAssembly: runtime.ed10FourLayerTrial.preservedAssembly}, null, 2));
});
