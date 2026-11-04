#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertUniversalReferenceAttachmentManifest, A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, UNIVERSAL_REFERENCE_PRODUCTION_METHOD} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const maturityRelativePath = "golden-film-visual-system-maturity-v1/maturity-run.json";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function prepareUniversalReferenceLookMasterWave({now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const maturityPath = path.join(publicDir, maturityRelativePath);
    const maturityRun = readJson(maturityPath);
    const targetShotIds = [...new Set(maturityRun.phases?.PHASE_3?.targetShotIds || [])].sort();
    if (!targetShotIds.length) throw new Error("universal-reference-wave-targets-missing");
    if (maturityRun.phases?.PHASE_0?.status !== "PASS" || maturityRun.phases?.PHASE_1?.status !== "PASS" || maturityRun.phases?.PHASE_2?.status !== "PASS") throw new Error("universal-reference-wave-static-preflight-hard-gate-not-green");
    const preflightByShot = new Map((maturityRun.phases.PHASE_2.generationPreflight || []).map((item) => [item.shotId, item]));
    for (const shotId of targetShotIds) {
      const preflight = preflightByShot.get(shotId);
      const currentPlan = before.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === shotId);
      if (!preflight || preflight.status !== "PASS" || preflight.planSha256 !== currentPlan?.planSha256 || preflight.candidateCount !== currentPlan?.candidateBudget || preflight.candidatePreflights?.some((item) => item.status !== "PASS" || item.attachmentPass !== true || item.fullLookMasterPass !== true || item.aestheticPass !== true)) throw new Error(`universal-reference-wave-static-preflight-invalid:${shotId}`);
    }
    const activeBefore = (before.production.generation.jobs || []).filter((job) => ["queued", "running"].includes(job.status));
    const targetSet = new Set(targetShotIds);
    const incompatibleActiveJobs = activeBefore.filter((job) => job.targetKind !== "package-look-master"
      || !targetSet.has(job.shotId)
      || job.referencePackagingContract !== A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT
      || job.productionMethod !== UNIVERSAL_REFERENCE_PRODUCTION_METHOD);
    if (before.production.generation.summary.running !== 0 || incompatibleActiveJobs.length || (before.production.generation.workerStatus !== "frozen" && !activeBefore.length)) throw new Error("universal-reference-wave-requires-frozen-idle-runtime");
    if (before.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true || (before.production.shotIntelligence.currentAssembly || []).length) throw new Error("universal-reference-wave-assembly-lock-required");
    let next = structuredClone(before);
    const jobs = [];
    for (const shotId of targetShotIds) {
      const queued = queuePackageLookMasterGenerationJobs(next, shotId, {candidateIndices: [1, 2], generationMode: "LOOK_MASTER_REFERENCE_ATTACHED", now});
      // queuePackageLookMasterGenerationJobs is deliberately immutable: it
      // returns a cloned workspace. Keep that returned workspace or the
      // preparation script would only retain the in-memory job list while
      // persisting the pre-queue workspace.
      next = queued.workspace;
      jobs.push(...queued.jobs);
    }
    if (jobs.length !== targetShotIds.length * 2) throw new Error(`universal-reference-wave-candidate-count-invalid:${jobs.length}`);
    for (const job of jobs) {
      if (job.productionMethod !== UNIVERSAL_REFERENCE_PRODUCTION_METHOD || job.referencePackagingContract !== A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT) throw new Error(`universal-reference-wave-job-contract-invalid:${job.id}`);
      assertUniversalReferenceAttachmentManifest(job.referenceAttachmentManifest);
      if (job.referenceInputs.length !== job.referenceAttachmentManifest.fileCount || job.referenceInputs.some((input) => !input.sourcePath || !input.sourceSha256 || !input.sourceType || !input.semanticRole || !input.transformPolicy || !Number.isInteger(input.generationAttachmentIndex))) throw new Error(`universal-reference-wave-job-input-invalid:${job.id}`);
      if (/return a true transparent PNG overlay|generate only an independent layer|make a standalone transparent asset|checkerboard transparency grid/iu.test(job.prompt) || !/complete, integrated.*16:9|complete 16:9/iu.test(job.prompt)) throw new Error(`universal-reference-wave-prompt-is-legacy-layer-route:${job.id}`);
    }
    const queuedRun = structuredClone(maturityRun);
    queuedRun.generatedAt = now;
    queuedRun.overallStatus = "GENERATION_QUEUED";
    queuedRun.nextAction = "RUN_EDITORIAL_ASSET_GENERATION_WORKER";
    queuedRun.phases = {
      ...queuedRun.phases,
      PHASE_3: {
        ...queuedRun.phases.PHASE_3,
        status: "QUEUED",
        generationAllowed: true,
        generationDispatched: true,
        targetShotIds,
        queuedJobIds: jobs.map((job) => job.id),
        currentWaveJobIds: jobs.map((job) => job.id),
        productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
        referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
        imagegenActualAttachmentRequired: true,
        nextAction: "RUN_EDITORIAL_ASSET_GENERATION_WORKER",
      },
      PHASE_4: {...queuedRun.phases.PHASE_4, status: "BLOCKED_UNTIL_TARGETED_REPAIR_COMPLETE", boardRebuilt: false, userApproval: false},
    };
    queuedRun.imageLedger = {
      ...queuedRun.imageLedger,
      generationDispatched: true,
      newGeneratedCount: 0,
      newGeneratedShas: [],
      boundedWave: {targetShotIds, candidateCount: jobs.length, concurrency: 2, productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD, referenceAttachmentContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT},
    };
    queuedRun.runtimeFreeze = {queue: next.production.generation.summary.queued, running: next.production.generation.summary.running, workerStatus: "starting", assemblyCount: (next.production.shotIntelligence.currentAssembly || []).length, assemblyCreationAllowed: false};
    queuedRun.maturityRunSha256 = sha256({...queuedRun, maturityRunSha256: undefined});
    const queuedJobIds = new Set(jobs.map((job) => job.id));
    next.production.generation.jobs = next.production.generation.jobs.map((job) => queuedJobIds.has(job.id)
      ? {...job, goldenFilmMaturityRunSha256: queuedRun.maturityRunSha256}
      : job);
    next.production.goldenFilmVisualSystemMaturity = {
      ...next.production.goldenFilmVisualSystemMaturity,
      current: true,
      status: "GENERATION_QUEUED",
      maturityRunSha256: queuedRun.maturityRunSha256,
      phaseStatuses: Object.fromEntries(Object.entries(queuedRun.phases).map(([phase, value]) => [phase, value?.status || null])),
      nextAction: "RUN_EDITORIAL_ASSET_GENERATION_WORKER",
      targetShotIds,
      currentWaveJobIds: jobs.map((job) => job.id),
      waveDispatchMaturityRunSha256: queuedRun.maturityRunSha256,
      referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      imagegenActualAttachmentRequired: true,
      publicPath: "/generated/system-line/editorial-asset-workbench-v1/golden-film-visual-system-maturity-v1/maturity-run.json",
      updatedAt: now,
    };
    next.production.generation.workerStatus = "starting";
    next.production.generation.automaticDispatchAllowed = false;
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false};
    const event = createProductionEvent({workspace: next, action: "prepare-universal-reference-look-master-wave", targetId: queuedRun.maturityRunSha256, payload: {contract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD, targetShotIds, candidateCount: jobs.length, concurrency: 2, staticPreflightPlanSha256s: Object.fromEntries(targetShotIds.map((shotId) => [shotId, preflightByShot.get(shotId).planSha256])), imageGenerationPerformed: false, assemblyCreated: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256, files: {[maturityRelativePath]: queuedRun}});
    return {workspace: committed, maturityRun: queuedRun, targetShotIds, jobIds: jobs.map((job) => job.id), candidateCount: jobs.length};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = prepareUniversalReferenceLookMasterWave();
  console.log(JSON.stringify({status: "PASS", workspaceSha256: result.workspace.workspaceSha256, targetShotIds: result.targetShotIds, candidateCount: result.candidateCount, jobIds: result.jobIds, maturityRunSha256: result.maturityRun.maturityRunSha256, productionMethod: result.maturityRun.phases.PHASE_3.productionMethod}, null, 2));
}
