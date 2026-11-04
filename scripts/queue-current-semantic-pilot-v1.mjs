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
const sourcePlate = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/source-cache/semantic-source-plates-v1/manifest.json"), "utf8"));
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  let current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const briefSet = runtime.semanticDesignBriefSet;
  if (!briefSet || !["SEMANTIC_INPUTS_PARTIAL", "READY"].includes(briefSet.status)) throw new Error("semantic-pilot-brief-set-required");
  if (current.production.generation.summary.queued || current.production.generation.summary.running) throw new Error("semantic-pilot-queue-must-start-idle");
  const ed23 = briefSet.briefs.find((item) => item.shotId === "ED-23");
  if (ed23?.evidenceRoute !== "SCREEN_EVIDENCE" || ed23.packageDecision !== "NO_PACKAGE") throw new Error("semantic-pilot-ed23-must-use-real-screen-evidence");
  const targetShotIds = ["ED-12", "ED-17", "ED-09"];
  const newPlans = [];
  const styleBriefs = [];
  for (const shotId of targetShotIds) {
    const brief = briefSet.briefs.find((item) => item.shotId === shotId);
    const decision = runtime.decisionSet.items.find((item) => item.sourceHash === brief?.shotSourceHash);
    const event = current.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds?.includes(decision?.shotId));
    const videoContext = (runtime.videoPackagingContexts.items || runtime.videoPackagingContexts).find((item) => item.shotId === decision?.shotId);
    if (!brief || brief.status !== "READY" || brief.packageDecision !== "PACKAGE" || !decision || !event || !videoContext) throw new Error(`semantic-pilot-input-not-ready:${shotId}`);
    const styleBrief = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, semanticBrief: brief, now});
    if (styleBrief.aestheticApplication?.referenceRole !== "AESTHETIC_TRAIT_LIBRARY"
      || styleBrief.aestheticApplication?.fixedOutputStyle !== false
      || styleBrief.aestheticApplication?.semanticFamilyRoutingRequired !== true
      || styleBrief.derivation?.mode !== "SEMANTIC_ACTION_AND_FRAME_ANCHORS"
      || !styleBrief.derivation?.aestheticRoute) throw new Error(`semantic-pilot-adaptive-aesthetic-route-required:${shotId}`);
    const sourceEvidenceInputs = shotId === "ED-12" ? [{
      contract: "A1SourceConditioningInput/v1",
      id: "ed12-five-named-models-source-plate",
      sourceKind: "OFFICIAL_NAMED_ENTITY_SOURCE_PLATE",
      sourceUrl: "project://verified-source-atlas/ed12-five-named-models",
      publicUrl: sourcePlate.publicUrl,
      sha256: sourcePlate.sha256,
      role: "REAL_EVIDENCE_INPUT",
      usageClass: "SOURCE_CONDITIONING_ALLOWED",
      preferredAssemblyModes: ["FULLSCREEN", "EXPLAINER"],
      identityPreservationRequired: true,
      verbatimTextPreservationRequired: false,
      exactPixelRebindRequired: true,
      claimExpansionForbidden: true,
    }] : [];
    const plan = buildPackageLookMasterPlan(decision, styleBrief, {videoContext, semanticBrief: brief, referenceManifest, sourceEvidenceInputs, recentDirectionFingerprints: [], recentTopologyFingerprints: [], now});
    newPlans.push(plan);
    styleBriefs.push(styleBrief);
  }
  if (new Set(styleBriefs.map((brief) => brief.derivation.aestheticRoute)).size !== targetShotIds.length
    || new Set(styleBriefs.map((brief) => brief.variation.primaryFamily)).size !== targetShotIds.length) throw new Error("semantic-pilot-representative-aesthetic-routes-must-be-distinct");
  let next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  if (nextRuntime.semanticPilot?.imageGenerationPerformed || (nextRuntime.semanticPilot?.candidates || []).length) {
    nextRuntime.semanticPilotHistory = [
      ...(nextRuntime.semanticPilotHistory || []),
      {...nextRuntime.semanticPilot, status: "EXPLORATION_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY"},
    ];
  }
  nextRuntime.packageLookMasterPlanHistory = [...(nextRuntime.packageLookMasterPlanHistory || []), ...nextRuntime.packageLookMasterPlans.filter((plan) => targetShotIds.includes(plan.shotId)).map((plan) => ({...plan, status: "EXPLORATION_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY"}))];
  nextRuntime.packageLookMasterPlans = [...nextRuntime.packageLookMasterPlans.filter((plan) => !targetShotIds.includes(plan.shotId)), ...newPlans];
  nextRuntime.status = "SEMANTIC_PILOT_INPUTS_READY";
  nextRuntime.semanticPilot = {...nextRuntime.semanticPilot, status: "SEMANTIC_PILOT_INPUTS_READY", targetShotIds, skippedShot: {shotId: "ED-23", route: "SCREEN_EVIDENCE", packageDecision: "NO_PACKAGE"}, aestheticPolicy: {contract: "A1EditorialAestheticRouting/v1", referenceRole: "AESTHETIC_TRAIT_LIBRARY", fixedOutputStyle: false, semanticFamilyRoutingRequired: true, routes: styleBriefs.map((brief) => ({shotId: brief.sourceBeatIds[0], aestheticRoute: brief.derivation.aestheticRoute, primaryFamily: brief.variation.primaryFamily, palette: brief.variation.palette}))}, styleBriefs, planSha256: newPlans.map((plan) => ({shotId: plan.shotId, planSha256: plan.planSha256})), candidates: [], recommendation: null, selected: null, currentAssembly: [], imageGenerationPerformed: false, updatedAt: now};
  const queuedJobIds = [];
  for (const shotId of targetShotIds) {
    const queued = queuePackageLookMasterSemanticPilotGenerationJob(next, shotId, {candidateIndex: 1, now});
    next = queued.workspace;
    if (queued.jobs.length !== 1) throw new Error(`semantic-pilot-single-job-required:${shotId}`);
    queuedJobIds.push(queued.jobs[0].id);
  }
  next.production.shotIntelligence.status = "SEMANTIC_PILOT_GENERATING";
  next.production.shotIntelligence.semanticPilot.status = "SEMANTIC_PILOT_GENERATING";
  next.production.shotIntelligence.semanticPilot.jobIds = queuedJobIds;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.authority.currentStage = "semantic-pilot";
  next.production.authority.nextAction = "run-semantic-pilot-single-images";
  next.production.authority.nextActionLabel = "生成 3 张语义试验画面";
  next.production.authority.requiresUserAction = false;
  const event = createProductionEvent({workspace: current, action: "semantic-pilot-single-images-queued", targetId: next.production.shotIntelligence.semanticDesignBriefSet.briefSetSha256, payload: {targetShotIds, skippedEd23: true, candidateCountPerShot: 1, generationMode: "SEMANTIC_PILOT_SINGLE", criticAllowed: false, layerReconstructionAllowed: false, motionAllowed: false, singleWriterTaskId}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  persistProjectState(appRoot, recalculated, {event, files: {"semantic-pilot-v1/queue.json": recalculated.production.shotIntelligence.semanticPilot}});
  return recalculated;
});

console.log(JSON.stringify({status: result.production.shotIntelligence.semanticPilot.status, targetShotIds: result.production.shotIntelligence.semanticPilot.targetShotIds, skippedShot: result.production.shotIntelligence.semanticPilot.skippedShot, jobs: result.production.shotIntelligence.semanticPilot.jobIds, queue: result.production.generation.summary, concurrency: result.production.generation.concurrency, workspaceSha256: result.workspaceSha256, singleWriterTaskId}, null, 2));
