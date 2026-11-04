#!/usr/bin/env node

import crypto from "node:crypto";
import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {persistGoldenFilmVisualSystemMaturityRun} from "./run-golden-film-visual-system-maturity-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const runPath = path.join(publicDir, "golden-film-visual-system-maturity-v1", "maturity-run.json");
const wavePath = path.join(publicDir, "golden-film-visual-system-maturity-v1", "generation-wave.json");
const workerScript = path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const result = withProjectLock(appRoot, () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const run = readJson(runPath);
  if (run.overallStatus !== "GENERATION_COMPLETE_REJECTED" || run.nextAction !== "DISPATCH_ONE_BOUNDED_PROMPT_REPAIR_WAVE_MAX_2") throw new Error("golden-film-prompt-repair-wave-prerequisite-invalid");
  if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("golden-film-prompt-repair-wave-requires-frozen-idle-runtime");
  if ((before.production.shotIntelligence.currentAssembly || []).length || before.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("golden-film-prompt-repair-wave-assembly-must-remain-empty");
  const targetShotIds = ["ED-15", "ED-16"];
  let next = structuredClone(before);
  const queuedJobs = [];
  for (const shotId of targetShotIds) {
    const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
    if (!plan || plan.candidateBudget !== 2) throw new Error(`golden-film-prompt-repair-candidate-budget-invalid:${shotId}`);
    const queued = queuePackageLookMasterGenerationJobs(next, shotId, {
      now: new Date().toISOString(),
      candidateIndices: [1, 2],
      generationMode: "LOOK_MASTER_REPAIR",
      repairAttempt: 1,
    });
    next = queued.workspace;
    queuedJobs.push(...queued.jobs);
  }
  if (queuedJobs.length !== 4 || new Set(queuedJobs.map((job) => job.generationInputHash)).size !== 4) throw new Error("golden-film-prompt-repair-job-identity-invalid");
  const nextRun = structuredClone(run);
  nextRun.generatedAt = new Date().toISOString();
  nextRun.phases.PHASE_3 = {
    ...nextRun.phases.PHASE_3,
    status: "REPAIR_QUEUED",
    generationAllowed: true,
    generationDispatched: true,
    targetShotIds,
    queuedJobIds: queuedJobs.map((job) => job.id),
    repairAttempt: 1,
    newGeneratedShas: [],
    newGeneratedCount: 0,
    failureReasons: [],
    nextAction: "RUN_EDITORIAL_ASSET_GENERATION_WORKER",
  };
  nextRun.overallStatus = "GENERATION_QUEUED";
  nextRun.nextAction = "RUN_EDITORIAL_ASSET_GENERATION_WORKER";
  nextRun.runtimeFreeze = {...nextRun.runtimeFreeze, queue: queuedJobs.length, running: 0, workerStatus: "starting", assemblyCount: 0, assemblyCreationAllowed: false};
  nextRun.imageLedger = {...nextRun.imageLedger, generationDispatched: true, newGeneratedShas: [], newGeneratedCount: 0, goodPngShaChanged: false};
  nextRun.maturityRunSha256 = sha256({...nextRun, maturityRunSha256: undefined});
  for (const job of next.production.generation.jobs) {
    if (!queuedJobs.some((item) => item.id === job.id)) continue;
    job.goldenFilmMaturityWave = "A1GoldenFilmVisualSystemMaturityGenerationWave/v1";
    job.goldenFilmMaturityRunSha256 = nextRun.maturityRunSha256;
    job.goldenFilmMaturityTargetShotIds = targetShotIds;
    job.generationMode = "LOOK_MASTER_REPAIR";
    job.canonicalRepairAttempt = 1;
    job.qualityTier = "draft";
  }
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "starting";
  next.production.generation.concurrency = 2;
  next.production.policy = {...next.production.policy, automaticDispatchAllowed: false, queuedJobCount: queuedJobs.length};
  const event = createProductionEvent({workspace: next, action: "dispatch-golden-film-prompt-repair-wave-v1", targetId: nextRun.maturityRunSha256, payload: {contract: "A1GoldenFilmPromptRepairWave/v1", targetShotIds, candidateIndices: {"ED-15": [1, 2], "ED-16": [1, 2]}, repairAttempt: 1, jobIds: queuedJobs.map((job) => job.id), concurrencyHardMax: 2, noAssembly: true, noCritic: true, noMotion: true}, now: nextRun.generatedAt});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, nextRun.generatedAt));
  const waveReport = {
    contract: "A1GoldenFilmPromptRepairWave/v1",
    status: "QUEUED",
    maturityRunSha256: nextRun.maturityRunSha256,
    repairAttempt: 1,
    workspaceSha256Before: before.workspaceSha256,
    workspaceSha256AfterQueue: recalculated.workspaceSha256,
    targetShotIds,
    jobs: queuedJobs.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, planSha256: job.lookMasterPlanSha256, outputRelativePath: job.outputRelativePath, generationMode: job.generationMode, providerMode: job.providerMode})),
    concurrencyHardMax: 2,
    imageGenerationProvider: "codex-imagegen-subscription-zero-extra-cost",
    assemblyCreated: false,
    workerStarted: false,
    generatedAt: nextRun.generatedAt,
  };
  const committed = persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: before.workspaceSha256, files: {[runPath.replace(`${publicDir}${path.sep}`, "")]: nextRun, [wavePath.replace(`${publicDir}${path.sep}`, "")]: waveReport}});
  // The direct run persistence is intentionally after the project transaction's
  // CAS; the same files are also mirrored by the authority sync below.
  persistGoldenFilmVisualSystemMaturityRun(nextRun);
  return {workspaceSha256: committed.workspaceSha256, nextRun, waveReport};
});

const sync = spawn(process.execPath, [path.join(root, "scripts/sync-golden-film-maturity-authority-v1.mjs")], {cwd: root, stdio: "inherit"});
await new Promise((resolve, reject) => { sync.once("error", reject); sync.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`golden-film-prompt-repair-authority-sync-failed:${code}`))); });
const worker = spawn(process.execPath, [workerScript], {cwd: root, detached: true, stdio: "ignore", env: process.env});
worker.unref();
console.log(JSON.stringify({status: "PASS", maturityRunSha256: result.nextRun.maturityRunSha256, workspaceSha256: result.workspaceSha256, targetShotIds: result.waveReport.targetShotIds, jobCount: result.waveReport.jobs.length, workerPid: worker.pid || null, repairAttempt: 1}, null, 2));
