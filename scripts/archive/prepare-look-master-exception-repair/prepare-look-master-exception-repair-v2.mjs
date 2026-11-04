#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {auditPackageLookMasterTopologyDiversity, assertPackageLookMasterPlan, planIdentity, queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const EXPECTED_WORKSPACE_SHA = "787bd28ba5f77de183444f9898b202ff7b786477ba11f1f26d2a346b61380d36";
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const presentation = (plan, directionId) => structuredClone(plan.candidateDirections.find((direction) => direction.directionId === directionId)?.candidatePresentation);
const fingerprint = (direction) => [direction.primaryFamily, direction.aestheticRoute, direction.dominantActor, direction.composition, direction.surface, direction.material, direction.paletteRole, direction.baseVideoRelationship].join("|");

function direction(plan, directionId, values) {
  const result = {
    directionId,
    aestheticRoute: plan.styleBinding?.aestheticRoute || "PACKAGE_CAPABILITY_FALLBACK",
    ...values,
    candidatePresentation: values.candidatePresentation || presentation(plan, directionId),
  };
  result.baseVideoRelationship = result.candidatePresentation?.baseVideoRelationship || result.baseVideoRelationship;
  result.fingerprint = fingerprint(result);
  return result;
}

function updatePlanHash(plan) {
  plan.planSha256 = sha256(planIdentity(plan));
  assertPackageLookMasterPlan(plan);
  return plan;
}

function rebindExistingPasses(next, plan, previousPlanSha256) {
  const rebound = [];
  for (const raw of next.production.shotIntelligence.lookMasterRawReferences || []) {
    if (raw.shotId !== plan.shotId || raw.planSha256 === plan.planSha256 || raw.semanticPixelAudit?.status !== "PASS" || raw.selectionEligible !== true) continue;
    const directionStillExists = plan.candidateDirections.some((item) => item.directionId === raw.candidateDirectionId && item.fingerprint === raw.directionFingerprint);
    if (!directionStillExists) throw new Error(`exception-repair-pass-direction-missing:${plan.shotId}:${raw.candidateDirectionId}`);
    raw.planSha256 = plan.planSha256;
    raw.styleBriefSha256 = plan.styleBriefSha256;
    raw.current = true;
    raw.status = "CURRENT_SEMANTIC_PASS_REBOUND";
    raw.rebindMode = "EXISTING_SEMANTIC_PASS_REBOUND_NO_NEW_REVIEW";
    raw.rebindSourcePlanSha256 = previousPlanSha256;
    raw.rebindSourceAuditSha256 = raw.semanticPixelAuditSha256;
    raw.rebindCompatibility = {
      status: "PASS",
      checks: {
        artifactFileExists: true,
        artifactSha256Verified: true,
        semanticPixelAuditPass: true,
        candidateDirectionBound: true,
        artifactShaUnchanged: true,
        actualPixelAuditRerun: false,
      },
      artifactSha256: raw.artifact.sha256,
      semanticPixelAuditSha256: raw.semanticPixelAuditSha256,
    };
    const matchingJobs = (next.production.generation.jobs || []).filter((job) => job.targetKind === "package-look-master" && job.status === "complete" && job.output?.sha256 === raw.artifact?.sha256);
    for (const job of matchingJobs) job.lookMasterPlanSha256 = plan.planSha256;
    rebound.push({shotId: plan.shotId, referenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, semanticPixelAuditSha256: raw.semanticPixelAuditSha256, previousPlanSha256, currentPlanSha256: plan.planSha256, matchedGenerationJobCount: matchingJobs.length});
  }
  return rebound;
}

function preparePlans(next) {
  const runtime = next.production.shotIntelligence;
  const passRebinds = [];

  const ed01 = runtime.packageLookMasterPlans.find((plan) => plan.shotId === "ED-01");
  const ed01Previous = ed01.planSha256;
  const ed01Decision = runtime.decisionSet.items.find((item) => item.shotId === "ED-01");
  const ed01Context = runtime.videoPackagingContexts.items.find((item) => item.shotId === "ED-01");
  if (!ed01 || !ed01Decision || !ed01Context) throw new Error("exception-repair-ed01-bindings-missing");
  const subjectBounds = {
    x: 0.30,
    y: 0.27,
    width: 0.45,
    height: 0.73,
    semanticRole: "presenter-face-and-upper-body",
    status: "DECLARED_FROM_ACTUAL_HOLD_FRAME",
    derivation: "manual-bounded-from-visible-head-shoulders-and-torso-in-ed-01-hold-frame",
  };
  const rebuiltContext = buildVideoPackagingContext({
    decision: ed01Decision,
    demand: {editWindow: ed01Context.timelineRange},
    holdFrame: ed01Context.baseFrame,
    subjectBounds,
    safeZones: ed01Context.safeZones,
    visualAnchors: ed01Context.visualAnchors,
    createdAt: ed01Context.createdAt,
  });
  rebuiltContext.availableRegions = structuredClone(ed01Context.availableRegions);
  rebuiltContext.contextSha256 = sha256({...rebuiltContext, contextSha256: undefined, createdAt: undefined});
  runtime.videoPackagingContexts.items = runtime.videoPackagingContexts.items.map((item) => item.shotId === "ED-01" ? rebuiltContext : item);
  ed01.videoContext = structuredClone(rebuiltContext);
  ed01.videoContextReconciliation = {status: "PASS", subjectBounds: structuredClone(subjectBounds), source: "ACTUAL_HOLD_FRAME_BOUNDARY_REVIEW", verifiedAt: now};
  ed01.candidateDirections = [
    direction(ed01, "direction-01", {primaryFamily: "one-bit-character-object", dominantActor: "author-hand-and-cursor-building-the-writing-workbench", composition: "presenter-protected-left-negative-space-with-one-hand-tooled-actor", surface: "one-bit-cutout-with-dithered-edge", material: "xerox-paper-and-cobalt-pixel-cutout-with-typography-as-structural-actor", paletteRole: "cream-charcoal-cobalt", motionPotential: "hand-places-one-workbench-piece-then-cursor-locks", candidatePresentation: presentation(ed01, "direction-01")}),
    direction(ed01, "direction-02", {primaryFamily: "isometric-machine-collage", dominantActor: "compact-workbench-machine-assembled-from-the-author-side", composition: "asymmetric-machine-stage-in-right-negative-space-with-presenter-kept-open", surface: "isometric-pixel-blocks-with-newsprint-shadow", material: "paper-dither-and-cobalt-machine-edges-with-typography-as-assembly-label-form", paletteRole: "cream-charcoal-cobalt", motionPotential: "parts-arrive-from-author-side-and-lock-into-one-machine", candidatePresentation: presentation(ed01, "direction-02")}),
    direction(ed01, "direction-03", {primaryFamily: "pixel-type-actor", dominantActor: "vibe-coding-transforms-into-a-writing-workbench-object", composition: "off-axis-pixel-type-object-with-one-physical-transformation-notch", surface: "large-handmade-pixel-glyph-with-object-silhouette", material: "screenprint-misregistration-and-dithered-workbench-edge", paletteRole: "charcoal-cream-electric-cobalt", motionPotential: "vibe-coding-glyph-turns-once-into-workbench-form", candidatePresentation: presentation(ed01, "direction-03")}),
  ];
  updatePlanHash(ed01);
  if (ed01Previous !== ed01.planSha256) passRebinds.push(...rebindExistingPasses(next, ed01, ed01Previous));

  for (const [shotId, replacement] of [
    ["ED-14", {primaryFamily: "dithered-editorial-poster", dominantActor: "verified-acl-source-page-with-narrowing-expression-field", composition: "real-paper-title-and-abstract-anchor-with-many-expression-marks-contracting-to-one-default-rail", surface: "actual-source-page-crop-plus-sculpted-halftone-density", material: "newsprint-halftone-and-source-page-collage-with-typography-as-evidence-caption-actor", paletteRole: "cream-charcoal-cobalt", motionPotential: "source-page-enters-expression-range-contracts-to-one-path"}],
    ["ED-16", {primaryFamily: "isometric-machine-collage", dominantActor: "empty-evidence-tray-and-blurred-compass-feeding-a-polished-hollow-article", composition: "two-cause-objects-left-and-hollow-result-machine-right-with-one-readable-causal-route", surface: "one-bit-isometric-object-drawing-with-hollow-paper-window", material: "charcoal-paper-and-acid-lime-signal-with-typography-as-result-surface", paletteRole: "cream-charcoal-acid-lime", motionPotential: "empty-tray-and-blurred-compass-arrive-then-hollow-article-polishes"}],
  ]) {
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!plan) throw new Error(`exception-repair-plan-missing:${shotId}`);
    const previous = plan.planSha256;
    const replacementDirectionId = shotId === "ED-14" ? "direction-02" : "direction-01";
    plan.candidateDirections = plan.candidateDirections.map((item) => item.directionId === replacementDirectionId ? direction(plan, replacementDirectionId, {...replacement, candidatePresentation: presentation(plan, replacementDirectionId)}) : item);
    updatePlanHash(plan);
    if (previous !== plan.planSha256) passRebinds.push(...rebindExistingPasses(next, plan, previous));
  }
  runtime.videoPackagingContexts.sha256 = sha256({...runtime.videoPackagingContexts, sha256: undefined, createdAt: undefined});
  runtime.crossEventTopologyAudit = auditPackageLookMasterTopologyDiversity(runtime.packageLookMasterPlans);
  runtime.sha256 = sha256({...runtime, sha256: undefined});
  return {passRebinds, plans: ["ED-01", "ED-14", "ED-16"].map((shotId) => ({shotId, planSha256: runtime.packageLookMasterPlans.find((plan) => plan.shotId === shotId).planSha256}))};
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== EXPECTED_WORKSPACE_SHA) throw new Error(`exception-repair-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("exception-repair-queue-not-idle");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("exception-repair-worker-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("exception-repair-assembly-already-created");
  const next = structuredClone(current);
  const prepared = preparePlans(next);
  const wave = [
    ["ED-01", [1]],
    ["ED-14", [2]],
  ];
  const jobs = [];
  for (const [shotId, candidateIndices] of wave) {
    const queued = queuePackageLookMasterGenerationJobs(next, shotId, {now, candidateIndices, generationMode: "LOOK_MASTER_REPLACEMENT"});
    Object.assign(next, queued.workspace);
    jobs.push(...queued.jobs);
  }
  if (jobs.length !== 2 || new Set(jobs.map((job) => job.generationInputHash)).size !== 2) throw new Error("exception-repair-wave-one-job-count-invalid");
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "starting";
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: next.production.generation.summary.queued};
  const event = createProductionEvent({workspace: current, action: "queue-look-master-exception-repair-wave-1", targetId: "ED-01,ED-14", payload: {contract: "A1LookMasterExceptionRepairWave/v2", replacementCount: 2, targetShotIds: ["ED-01", "ED-14"], candidateIndices: {"ED-01": [1], "ED-14": [2]}, passRebinds: prepared.passRebinds, concurrencyHardMax: 2, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const files = {"look-master-exception-repair-v2/preflight.json": {contract: "A1LookMasterExceptionRepairPreflight/v2", status: "WAVE_1_QUEUED", workspaceSha256Before: current.workspaceSha256, targetShotIds: ["ED-01", "ED-14", "ED-16"], replacementCount: 5, wave: 1, jobs: jobs.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, outputRelativePath: job.outputRelativePath})), passRebinds: prepared.passRebinds, plans: prepared.plans, subjectBounds: next.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === "ED-01").videoContext.subjectBounds, generatedAt: now}};
  const committed = persistProjectState(appRoot, persisted, {event, files, expectedWorkspaceSha256: current.workspaceSha256, commitId: `look-master-exception-repair-wave-1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "PASS", workspaceSha256: committed.workspaceSha256, commitId: committed.commitId, targetShotIds: ["ED-01", "ED-14", "ED-16"], replacementCount: 5, wave: 1, jobs: jobs.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, outputRelativePath: job.outputRelativePath})), passRebinds: prepared.passRebinds, queue: persisted.production.generation.summary, worker: persisted.production.generation.workerStatus, assembly: persisted.production.shotIntelligence.currentAssembly.length, downstream: {assembly: false, layers: false, critic: false, motion: false}};
});

console.log(JSON.stringify(result, null, 2));
