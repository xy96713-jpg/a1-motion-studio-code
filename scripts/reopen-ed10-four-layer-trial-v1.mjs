#!/usr/bin/env node
/** Reopen the quarantined ED-10 trial for one deterministic post-process pass.
 * No generation is dispatched; the seven completed worker outputs are reused.
 */
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {auditPackageLookMasterTopologyDiversity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const appRoot = new URL("../apps/studio-next/", import.meta.url).pathname.replace(/\/$/u, "");
const now = process.env.A1_ED10_TRIAL_RUN_AT || new Date().toISOString();
withProjectLock(appRoot, () => {
  const rawWorkspace = readProjectWorkspace(appRoot);
  if (["CANDIDATES_GENERATING", "RECONSTRUCTING", "LAYER_RECONSTRUCTION_IN_PROGRESS"].includes(rawWorkspace.production?.shotIntelligence?.status)) rawWorkspace.production.shotIntelligence.status = "ASSEMBLY_REVIEW_REQUIRED";
  const workspace = assertEditorialAssetWorkbench(rawWorkspace.production?.shotIntelligence?.crossEventTopologyAudit ? rawWorkspace : (() => {
    rawWorkspace.production.shotIntelligence.crossEventTopologyAudit = auditPackageLookMasterTopologyDiversity(rawWorkspace.production.shotIntelligence.packageLookMasterPlans || []);
    return rawWorkspace;
  })());
  const runtime = workspace.production.shotIntelligence;
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  const trial = runtime.ed10FourLayerTrial;
  if (!kit || !recipe || !trial || !(String(trial.status || "").startsWith("BLOCKED_") || (trial.status === "CANDIDATES_GENERATING" && kit.layers.every((layer) => (layer.candidates || []).length === 0)))) throw new Error("ed10-trial-reopen-requires-quarantined-trial");
  if ((trial.queuedJobIds || []).length !== 7) throw new Error("ed10-trial-reopen-requires-seven-completed-jobs");
  kit.historyOnly = false; delete kit.historyReason; kit.status = "GENERATION_PLAN_ONLY";
  for (const layer of kit.layers || []) { layer.status = "GENERATION_PLAN_ONLY"; layer.candidates = []; layer.selectedCandidateId = null; layer.selectedCandidateSource = "WAITING_FOR_FOUR_LAYER_TRIAL"; }
  recipe.historyOnly = false; delete recipe.historyReason; recipe.status = "LAYER_RECONSTRUCTION_READY"; recipe.layerCandidateIds = {BACKGROUND: null, TYPOGRAPHY: null, ELEMENT_KIT: null, ILLUSTRATION: null}; recipe.assemblyComposite = null; recipe.parityAudit = null; recipe.finalAssemblyReview = null;
  runtime.packageAssetKitPlans = runtime.packageAssetKitPlans.map((item) => item.shotId === "ED-10" ? kit : item);
  runtime.packageAssemblyRecipes = runtime.packageAssemblyRecipes.map((item) => item.shotId === "ED-10" ? recipe : item);
  // Keep the runtime in the already-authorized packaging review envelope while
  // the bounded post-process consumes completed jobs; the trial status is the
  // source of truth for this temporary work, not a new generation state.
  runtime.status = "ASSEMBLY_REVIEW_REQUIRED";
  runtime.ed10FourLayerTrial = {...trial, status: "CANDIDATES_GENERATING", recoveryReopenedAt: now, recoveryReason: "one-postprocess-pass-reuses-seven-completed-worker-outputs", actualLayerCandidateCount: 0, candidateIds: [], candidateAudits: []};
  workspace.production.shotIntelligence = runtime;
  workspace.production.generation.workerStatus = "frozen";
  workspace.production.generation.automaticDispatchAllowed = false;
  const next = recalculateEditorialAssetWorkbench(workspace, now);
  persistProjectState(appRoot, next, {event: createProductionEvent({workspace: next, action: "ed10-four-layer-trial-reopened-for-postprocess", targetId: "ED-10", payload: {jobIds: trial.queuedJobIds, noGeneration: true}})});
  console.log(JSON.stringify({status: next.production.shotIntelligence.ed10FourLayerTrial.status, jobCount: trial.queuedJobIds.length, queue: next.production.generation.summary, worker: next.production.generation.workerStatus, workspaceSha256: next.workspaceSha256}, null, 2));
});
