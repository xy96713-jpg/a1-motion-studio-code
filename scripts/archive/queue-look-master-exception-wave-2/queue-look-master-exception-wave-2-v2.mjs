#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, planIdentity, queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("wave-2-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`wave-2-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("wave-2-generation-not-idle");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("wave-2-worker-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("wave-2-assembly-already-created");
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const ed01 = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-01");
  const ed16 = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-16");
  if (!ed01 || !ed16) throw new Error("wave-2-plan-missing");
  const previousEd01PlanSha256 = ed01.planSha256;
  const oldDirection = ed01.candidateDirections.find((item) => item.directionId === "direction-01");
  if (!oldDirection) throw new Error("wave-2-ed01-direction-01-missing");
  ed01.candidateDirections = ed01.candidateDirections.map((item) => item.directionId === "direction-01" ? {
    ...item,
    primaryFamily: "object-led-transformation",
    dominantActor: "workbench-object-transforming-from-vibe-coding-material-in-the-authors-negative-space",
    composition: "single-workbench-object-unfolds-from-authors-hand-on-left-with-presenter-protected-right",
    surface: "layered-paper-object-with-dithered-cutout-and-transparent-edge",
    material: "cobalt-paper-machining-marks-and-pixel-cutout-with-typography-as-object-label",
    paletteRole: "cream-charcoal-cobalt",
    motionPotential: "flat-vibe-coding-material-folds-into-one-usable-workbench-object",
    fingerprint: null,
  } : item);
  const changed = ed01.candidateDirections.find((item) => item.directionId === "direction-01");
  changed.fingerprint = [changed.primaryFamily, changed.aestheticRoute, changed.dominantActor, changed.composition, changed.surface, changed.material, changed.paletteRole, changed.baseVideoRelationship].join("|");
  ed01.planSha256 = sha256(planIdentity(ed01));
  assertPackageLookMasterPlan(ed01);
  runtime.sha256 = sha256({...runtime, sha256: undefined});
  const wave = [];
  for (const [shotId, candidateIndices] of [["ED-01", [1]], ["ED-16", [1]]]) {
    const queued = queuePackageLookMasterGenerationJobs(next, shotId, {now: new Date().toISOString(), candidateIndices, generationMode: "LOOK_MASTER_REPLACEMENT"});
    Object.assign(next, queued.workspace);
    wave.push(...queued.jobs);
  }
  if (wave.length !== 2 || new Set(wave.map((job) => job.generationInputHash)).size !== 2) throw new Error("wave-2-job-count-invalid");
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "starting";
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: next.production.generation.summary.queued};
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace: current, action: "queue-look-master-exception-repair-wave-2", targetId: "ED-01,ED-16", payload: {contract: "A1LookMasterExceptionRepairWave/v2", replacementCount: 2, targetShotIds: ["ED-01", "ED-16"], candidateIndices: {"ED-01": [1], "ED-16": [1]}, ed01VisualPrimitiveSwitch: {from: oldDirection.primaryFamily, to: changed.primaryFamily, reason: "overlay-alpha-required-failed-on-prior-primitive"}, previousEd01PlanSha256, newEd01PlanSha256: ed01.planSha256, concurrencyHardMax: 2, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const files = {"look-master-exception-repair-v2/wave-2.json": {contract: "A1LookMasterExceptionRepairWaveReport/v2", status: "WAVE_2_QUEUED", workspaceSha256Before: current.workspaceSha256, targetShotIds: ["ED-01", "ED-16"], jobs: wave.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, outputRelativePath: job.outputRelativePath})), ed01VisualPrimitiveSwitch: {from: oldDirection.primaryFamily, to: changed.primaryFamily, reason: "overlay-alpha-required-failed-on-prior-primitive"}, previousEd01PlanSha256, newEd01PlanSha256: ed01.planSha256, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true, generatedAt: now}};
  const committed = persistProjectState(appRoot, persisted, {event, files, expectedWorkspaceSha256: current.workspaceSha256, commitId: `look-master-exception-repair-wave-2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, jobs: wave.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, outputRelativePath: job.outputRelativePath})), queue: persisted.production.generation.summary, worker: persisted.production.generation.workerStatus, assembly: persisted.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
