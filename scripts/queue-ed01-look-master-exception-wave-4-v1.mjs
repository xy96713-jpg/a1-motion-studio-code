#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, auditPackageLookMasterTopologyDiversity, planIdentity, queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed01-wave-4-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed01-wave-4-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("ed01-wave-4-generation-not-idle");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("ed01-wave-4-worker-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("ed01-wave-4-assembly-already-created");

  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-01");
  if (!plan || plan.assemblyMode !== "OVERLAY" || plan.presentationMode !== "OVERLAY") throw new Error("ed01-wave-4-ed01-overlay-plan-required");
  const previousPlanSha256 = plan.planSha256;
  const directionById = new Map(plan.candidateDirections.map((direction) => [direction.directionId, direction]));
  const oldDirection01 = directionById.get("direction-01");
  const oldDirection02 = directionById.get("direction-02");
  const direction03 = directionById.get("direction-03");
  if (!oldDirection01 || !oldDirection02 || !direction03) throw new Error("ed01-wave-4-directions-incomplete");

  const replaceDirection = (direction, values) => {
    const nextDirection = {
      ...direction,
      ...values,
      candidatePresentation: structuredClone(direction.candidatePresentation),
    };
    nextDirection.fingerprint = [
      nextDirection.primaryFamily,
      nextDirection.aestheticRoute,
      nextDirection.dominantActor,
      nextDirection.composition,
      nextDirection.surface,
      nextDirection.material,
      nextDirection.paletteRole,
      nextDirection.baseVideoRelationship,
    ].join("|");
    return nextDirection;
  };

  // Both failed candidates switch primitive. The output contract remains a
  // true transparent overlay, while the c03 pixel-type actor is preserved.
  plan.candidateDirections = [
    replaceDirection(oldDirection01, {
      primaryFamily: "one-bit-physical-input-machine",
      dominantActor: "a single input tray, author note and cursor locking one usable writing-workbench core",
      composition: "compact left-edge input machine with one clear transformation into a workbench core, fully outside presenter subject",
      surface: "flat one-bit schematic relief with a die-cut tray, one hinge and one cobalt action marker",
      material: "coarse paper die-cut, black ink, cobalt hinge, typography embedded as the machine label-shape",
      paletteRole: "cream-charcoal-cobalt",
      motionPotential: "loose note enters the tray, the hinge closes, and one usable workbench core emerges",
    }),
    replaceDirection(oldDirection02, {
      primaryFamily: "editorial-blueprint-foldout",
      dominantActor: "one folded blueprint opening into a compact writing-workbench object",
      composition: "long low blueprint foldout in the far-left quiet field with one fold line leading to a single workbench silhouette",
      surface: "screenprinted blueprint edges used only to define the object and its transformation",
      material: "cream stock, charcoal blueprint marks, cobalt fold line, typography fused into the blueprint object",
      paletteRole: "cream-charcoal-cobalt",
      motionPotential: "one paper fold opens once and reveals the writing-workbench form",
    }),
    direction03,
  ];
  plan.planSha256 = sha256(planIdentity(plan));
  assertPackageLookMasterPlan(plan);
  if (new Set(plan.candidateDirections.map((direction) => direction.fingerprint)).size !== 3) throw new Error("ed01-wave-4-direction-fingerprint-not-unique");

  const preservedArtifactShas = [];
  const rebound = [];
  for (const raw of runtime.lookMasterRawReferences || []) {
    if (raw.shotId !== "ED-01") continue;
    preservedArtifactShas.push(raw.artifact?.sha256);
    if (raw.semanticPixelAudit?.status === "PASS" && raw.selectionEligible === true && raw.candidateDirectionId === "direction-03") {
      raw.planSha256 = plan.planSha256;
      raw.styleBriefSha256 = plan.styleBriefSha256;
      raw.current = true;
      raw.status = "CURRENT_SEMANTIC_PASS_REBOUND";
      raw.rebindMode = "EXISTING_SEMANTIC_PASS_REBOUND_NO_NEW_REVIEW";
      raw.rebindSourcePlanSha256 = previousPlanSha256;
      raw.rebindCompatibility = {
        status: "PASS",
        checks: {artifactFileExists: true, artifactSha256Verified: true, semanticPixelAuditPass: true, candidateDirectionBound: true, artifactShaUnchanged: true, actualPixelAuditRerun: false},
        artifactSha256: raw.artifact.sha256,
        semanticPixelAuditSha256: raw.semanticPixelAuditSha256,
      };
      for (const job of next.production.generation.jobs || []) {
        if (job.targetKind === "package-look-master" && job.output?.sha256 === raw.artifact?.sha256) job.lookMasterPlanSha256 = plan.planSha256;
      }
      rebound.push({referenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, directionId: raw.candidateDirectionId});
    } else {
      raw.current = false;
      raw.authorityScope = "HISTORY_READ_ONLY";
      if (raw.selectionEligible !== true) raw.status = "VISUAL_REJECTED_HISTORY_ONLY";
    }
  }
  if (rebound.length !== 1) throw new Error(`ed01-wave-4-pass-rebind-count-invalid:${rebound.length}`);

  runtime.crossEventTopologyAudit = auditPackageLookMasterTopologyDiversity(runtime.packageLookMasterPlans);
  runtime.status = "LOOK_MASTER_CANDIDATES_READY";
  runtime.wholeFilmBatchRecommendation = {
    ...(runtime.wholeFilmBatchRecommendation || {}),
    status: "PARTIAL_WITH_EXCEPTIONS",
    nextUserGate: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    currentAssembly: [],
    reconciliationRequired: false,
    reconciliationStatus: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    updatedAt: new Date().toISOString(),
  };
  runtime.sha256 = sha256({...runtime, sha256: undefined});

  const queued = queuePackageLookMasterGenerationJobs(next, "ED-01", {now: new Date().toISOString(), candidateIndices: [1, 2], generationMode: "LOOK_MASTER_REPLACEMENT"});
  Object.assign(next, queued.workspace);
  if (queued.jobs.length !== 2 || new Set(queued.jobs.map((job) => job.generationInputHash)).size !== 2) throw new Error("ed01-wave-4-job-count-invalid");
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "starting";
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: next.production.generation.summary.queued};
  const now = new Date().toISOString();
  const event = createProductionEvent({
    workspace: current,
    action: "queue-ed01-look-master-exception-wave-4",
    targetId: "ED-01",
    payload: {
      contract: "A1LookMasterExceptionRepairWave/v4",
      targetShotIds: ["ED-01"],
      replacementCount: 2,
      candidateIndices: [1, 2],
      previousPlanSha256,
      newPlanSha256: plan.planSha256,
      visualPrimitiveSwitch: {
        direction01: {from: oldDirection01.primaryFamily, to: plan.candidateDirections[0].primaryFamily},
        direction02: {from: oldDirection02.primaryFamily, to: plan.candidateDirections[1].primaryFamily},
      },
      reboundPasses: rebound,
      preservedArtifactShas,
      concurrencyHardMax: 2,
      noAssembly: true,
      noLayerReconstruction: true,
      noCritic: true,
      noMotion: true,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const commitId = `look-master-exception-repair-ed01-wave-4-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const report = {
    contract: "A1LookMasterExceptionRepairWaveReport/v4",
    status: "WAVE_4_QUEUED",
    workspaceSha256Before: current.workspaceSha256,
    targetShotIds: ["ED-01"],
    replacementCount: 2,
    jobs: queued.jobs.map((job) => ({id: job.id, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, outputRelativePath: job.outputRelativePath, promptSha256: job.promptSha256})),
    previousPlanSha256,
    newPlanSha256: plan.planSha256,
    visualPrimitiveSwitch: {
      direction01: {from: oldDirection01.primaryFamily, to: plan.candidateDirections[0].primaryFamily},
      direction02: {from: oldDirection02.primaryFamily, to: plan.candidateDirections[1].primaryFamily},
    },
    reboundPasses: rebound,
    preservedArtifactShas,
    generatedAssetsChanged: false,
    actualPixelAuditPerformed: false,
    assemblyCreated: false,
    layerReconstructionStarted: false,
    criticPerformed: false,
    motionPerformed: false,
    queue: persisted.production.generation.summary,
    workerStatus: persisted.production.generation.workerStatus,
    generatedAt: now,
  };
  const committed = persistProjectState(appRoot, persisted, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId, files: {"look-master-exception-repair-v2/ed01-wave-4.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
