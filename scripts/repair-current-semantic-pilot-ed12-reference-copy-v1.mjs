#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {buildPackageLookMasterPlan, queuePackageLookMasterSemanticPilotGenerationJob} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const pilot = runtime.semanticPilot;
  const oldCandidate = pilot?.candidates?.find((item) => item.shotId === "ED-12");
  if (oldCandidate?.semanticAudit?.checks?.referenceCopyDetected !== true) throw new Error("ed12-reference-copy-repair-requires-pixel-gate-failure");
  if (current.production.generation.summary.queued || current.production.generation.summary.running) throw new Error("ed12-reference-copy-repair-queue-must-start-idle");
  if (pilot.recommendation !== null || pilot.selected !== null || (pilot.currentAssembly || []).length) throw new Error("ed12-reference-copy-repair-no-selection-allowed");

  const brief = runtime.semanticDesignBriefSet.briefs.find((item) => item.shotId === "ED-12");
  const decision = runtime.decisionSet.items.find((item) => item.sourceHash === brief?.shotSourceHash);
  const event = current.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds?.includes(decision?.shotId));
  const videoContext = (runtime.videoPackagingContexts.items || runtime.videoPackagingContexts).find((item) => item.shotId === "ED-12");
  const oldPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-12");
  if (!brief || !decision || !event || !videoContext || !oldPlan) throw new Error("ed12-reference-copy-repair-inputs-missing");

  const styleBrief = compileRetroPixelEditorialStyleBrief({
    event,
    appRoot,
    videoContext,
    semanticBrief: brief,
    referenceExclusions: ["pinterest-retro-pixel-10"],
    variationOverrides: {
      primaryFamily: "icon-atlas-interface-language",
      supportingFamilies: [],
      composition: "five-source-cards-on-one-evidence-rail",
      surfaceLogic: "source-card-atlas-with-quiet-evidence-field",
      dominantActor: "five-verified-model-identity-cards",
      material: "source-bound-card-grid-with-light-paper-grain",
      motionEnergy: "cards-enter-in-order-then-hold-as-evidence",
    },
    now,
  });
  const plan = buildPackageLookMasterPlan(decision, styleBrief, {
    videoContext,
    semanticBrief: brief,
    referenceManifest,
    sourceEvidenceInputs: oldPlan.sourceEvidenceInputs || [],
    recentDirectionFingerprints: [oldPlan.styleBinding?.fingerprint].filter(Boolean),
    recentTopologyFingerprints: [],
    now,
  });
  plan.aestheticRepair = {
    contract: "A1AestheticReferenceCopyRepair/v1",
    reason: "REFERENCE_COPY_DETECTED",
    excludedReferenceIds: ["pinterest-retro-pixel-10"],
    replacedPrimaryFamily: "icon-atlas-interface-language",
    replacedComposition: "five-source-cards-on-one-evidence-rail",
    sourceCandidateId: oldCandidate.candidateId,
    sourceCandidateSha256: oldCandidate.artifact.sha256,
    createdAt: now,
  };

  let next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  nextRuntime.semanticPilotHistory = [...(nextRuntime.semanticPilotHistory || []), {...pilot, status: "EXPLORATION_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY", supersededReason: "ED12_REFERENCE_COPY_DETECTED"}];
  nextRuntime.packageLookMasterPlanHistory = [...(nextRuntime.packageLookMasterPlanHistory || []), {...oldPlan, status: "EXPLORATION_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY", supersededReason: "ED12_REFERENCE_COPY_DETECTED"}];
  nextRuntime.packageLookMasterPlans = nextRuntime.packageLookMasterPlans.map((item) => item.shotId === "ED-12" ? plan : item);
  const styleBriefs = (pilot.styleBriefs || []).map((item) => item.sourceBeatIds?.includes("ED-12") ? styleBrief : item);
  const planSha256 = (pilot.planSha256 || []).map((item) => item.shotId === "ED-12" ? {shotId: "ED-12", planSha256: plan.planSha256} : item);
  nextRuntime.status = "SEMANTIC_PILOT_INPUTS_READY";
  nextRuntime.semanticPilot = {...pilot, status: "SEMANTIC_PILOT_INPUTS_READY", styleBriefs, planSha256, candidates: (pilot.candidates || []).filter((item) => item.shotId !== "ED-12"), recommendation: null, selected: null, currentAssembly: [], imageGenerationPerformed: true, updatedAt: now};
  const queued = queuePackageLookMasterSemanticPilotGenerationJob(next, "ED-12", {candidateIndex: 1, now});
  next = queued.workspace;
  if (queued.jobs.length !== 1) throw new Error("ed12-reference-copy-repair-single-job-required");
  next.production.shotIntelligence.status = "SEMANTIC_PILOT_GENERATING";
  next.production.shotIntelligence.semanticPilot.status = "SEMANTIC_PILOT_GENERATING";
  next.production.shotIntelligence.semanticPilot.jobIds = [queued.jobs[0].id, ...(pilot.jobIds || []).filter((id) => id !== oldCandidate.generationJobId)];
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.authority.currentStage = "semantic-pilot";
  next.production.authority.nextAction = "run-semantic-pilot-ed12-reference-copy-repair";
  next.production.authority.nextActionLabel = "修复 ED-12 参考图照搬后再审 1 张";
  next.production.authority.requiresUserAction = false;
  const eventRecord = createProductionEvent({workspace: current, action: "semantic-pilot-ed12-reference-copy-repair-queued", targetId: plan.planSha256, payload: {shotId: "ED-12", excludedReferenceIds: ["pinterest-retro-pixel-10"], replacementPrimaryFamily: "icon-atlas-interface-language", sourceCandidateSha256: oldCandidate.artifact.sha256, generationMode: "SEMANTIC_PILOT_SINGLE", criticAllowed: false, layerReconstructionAllowed: false, motionAllowed: false, singleWriterTaskId}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = eventRecord.eventId;
  next.production.eventLedger.lastEventAt = eventRecord.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  persistProjectState(appRoot, recalculated, {event: eventRecord, files: {"semantic-pilot-v1/ed12-reference-copy-repair.json": {shotId: "ED-12", status: "QUEUED", excludedReferenceIds: ["pinterest-retro-pixel-10"], planSha256: plan.planSha256, sourceCandidateSha256: oldCandidate.artifact.sha256, jobId: queued.jobs[0].id, singleWriterTaskId}}});
  return recalculated;
});

console.log(JSON.stringify({status: result.production.shotIntelligence.semanticPilot.status, shotId: "ED-12", jobId: result.production.shotIntelligence.semanticPilot.jobIds[0], queue: result.production.generation.summary, workspaceSha256: result.workspaceSha256, singleWriterTaskId}, null, 2));
