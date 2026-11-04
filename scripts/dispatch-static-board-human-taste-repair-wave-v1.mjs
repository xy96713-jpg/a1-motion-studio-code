#!/usr/bin/env node

import crypto from "node:crypto";
import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {compileQueue} from "./compile-static-board-human-taste-fix-queue-v1.mjs";

export const STATIC_BOARD_HUMAN_TASTE_REPAIR_WAVE_ACTION = "dispatch-static-board-human-taste-repair-wave-v1";
export const STATIC_BOARD_HUMAN_TASTE_REPAIR_WAVE_CONTRACT = "A1StaticBoardHumanTasteRepairGenerationWave/v1";
export const GOLDEN_FILM_MATURITY_WAVE_CONTRACT = "A1GoldenFilmVisualSystemMaturityGenerationWave/v1";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const maturityRelativePath = "golden-film-visual-system-maturity-v1/maturity-run.json";
const waveRelativePath = "golden-film-visual-system-maturity-v1/human-taste-generation-wave.json";
const workerScript = path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs");
const syncScript = path.join(root, "scripts/sync-golden-film-maturity-authority-v1.mjs");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function repairPrompt(item, primitive, {repairAttempt = 1} = {}) {
  const overlay = item.specialMode !== "FULLSCREEN_TYPOGRAPHY";
  const copy = item.protectedPhrases.join("；");
  const geometry = item.current.actualGeometry;
  const geometryClause = overlay
    ? `Measured hold-frame geometry is binding evidence: subject=${JSON.stringify(geometry.subjectBounds)}, face=${JSON.stringify(geometry.faceBounds)}, eyes=${JSON.stringify(geometry.eyesBounds)}, mouth=${JSON.stringify(geometry.mouthBounds)}, microphone=${JSON.stringify(geometry.microphoneExclusion)}, boom=${JSON.stringify(geometry.boomExclusion)}, safeZones=${JSON.stringify(geometry.safeZones)}, availableRegions=${JSON.stringify(geometry.availableRegions)}.`
    : "This is a declared FULLSCREEN editorial title beat; do not add a presenter overlay or a fake source plate.";
  const revisionClause = repairAttempt > 1
    ? `This is the one allowed structural revision for primitive ${primitive.id}. The prior candidate failed actual-pixel geometry. For an OVERLAY, the only non-transparent pixels may occupy the declared available negative-space region ${JSON.stringify(geometry?.availableRegions || [])}; keep all pixels outside the presenter, face, eyes, mouth, microphone, boom and subtitle exclusions. Do not draw a full-canvas field, border, paper slab or background wash. For FULLSCREEN, remove the prior warm/empty field and make the editorial material structural rather than decorative.`
    : "This is the first bounded candidate for this primitive; respect the measured geometry literally.";
  return `TARGETED HUMAN-TASTE REPAIR for ${item.shotId}. Use the actual registered hold frame as a compositional reference. ${geometryClause}

${revisionClause}

Use the genuinely distinct visual primitive ${primitive.id}: ${primitive.topology} Surface direction: ${primitive.surface}. The semantic actor is exactly: ${item.semanticActor}. The only allowed readable Chinese copy is ${JSON.stringify(copy)}; preserve simplified Chinese characters exactly, with no English, debug text, fake source labels, filler, punctuation, UI chrome, chat bubbles, card stacks, window shells, or unrelated glyphs.

Active art direction: minimal-retro-pixel-editorial. Use neutral white, cool gray, charcoal or footage-derived fields; cobalt, magenta or acid green may be one restrained semantic accent. Warm yellow, cream, beige or old-paper dominant fields are forbidden. CRT/pixel grammar is light syntax only. Build one integrated finished Look Master where typography, image/object, print texture and spacing form one visual actor and one reading path. Do not make a small sticker, corner widget or pasted CSS title.

${overlay ? "Presenter-aware OVERLAY is mandatory. Return a true transparent PNG overlay; never bake the hold frame or presenter pixels into the output. Keep every package actor outside the measured face, eyes, mouth, subject, microphone and boom exclusion regions, inside the declared available negative space and outside the protected subtitle safe zones. At whole-film static-board scale the title must be immediately legible without enlarging the tile." : "Use the actual fullscreen typography composition, with the title as a visual actor rather than a subtitle. Keep a clear editorial material structure and one reading path; no generic blank field and no decorative pile."}

This is a bounded replacement candidate, not an approved asset. Preserve the real video/source identity, do not reconstruct layers, do not add motion, and do not create a final film. Prioritize semantic clarity, integrated composition and current aesthetic compliance over decorative detail.`;
}

function buildWaveRun(run, queue, jobs, {now, repairAttempt}) {
  const next = structuredClone(run);
  next.generatedAt = now;
  next.phases.PHASE_3 = {
    ...next.phases.PHASE_3,
    status: "QUEUED",
    generationAllowed: true,
    generationDispatched: true,
    waveContract: STATIC_BOARD_HUMAN_TASTE_REPAIR_WAVE_CONTRACT,
    targetShotIds: queue.items.map((item) => item.shotId),
    queuedJobIds: jobs.map((job) => job.id),
    targetedRepairQueueSha256: queue.queueSha256,
    repairAttempt,
    newGeneratedShas: [],
    failureReasons: [],
    nextAction: "RUN_EDITORIAL_ASSET_GENERATION_WORKER",
  };
  next.phases.PHASE_4 = {
    ...next.phases.PHASE_4,
    status: "BLOCKED_UNTIL_TARGETED_REPAIR_COMPLETE",
    boardRebuilt: false,
    userApproval: false,
    nextAction: "AUDIT_TARGETED_REPAIR_CANDIDATES",
  };
  next.overallStatus = "GENERATION_QUEUED";
  next.nextAction = "RUN_EDITORIAL_ASSET_GENERATION_WORKER";
  next.runtimeFreeze = {...next.runtimeFreeze, queue: jobs.length, running: 0, workerStatus: "starting", assemblyCount: 0, assemblyCreationAllowed: false};
  next.imageLedger = {
    ...next.imageLedger,
    generationDispatched: true,
    targetedRepairQueueSha256: queue.queueSha256,
    targetedRepairShotIds: queue.items.map((item) => item.shotId),
    targetedRepairExpectedCandidateCount: jobs.length,
    targetedRepairAttemptedGeneratedCount: 0,
    targetedRepairAdoptedGeneratedCount: 0,
    targetedRepairRejectedGeneratedCount: 0,
    targetedRepairCandidateShas: [],
    newGeneratedShas: [],
    newGeneratedCount: 0,
  };
  next.maturityRunSha256 = sha256({...next, maturityRunSha256: undefined});
  return next;
}

export function dispatchStaticBoardHumanTasteRepairWave({now = new Date().toISOString(), startWorker = true} = {}) {
  const result = withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const queue = compileQueue(before, {now});
    if (queue.items.some((item) => item.status !== "READY_FOR_TARGETED_REPAIR")) throw new Error("human-taste-repair-queue-preflight-not-green");
    if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("human-taste-repair-wave-requires-frozen-idle-runtime");
    if ((before.production.shotIntelligence.currentAssembly || []).length) throw new Error("human-taste-repair-wave-assembly-must-remain-empty");
    if (before.production.creatorPaletteShotBindingManifest?.status !== "PASS") throw new Error("human-taste-repair-wave-binding-must-pass");
    if (before.production.incrementalRepairManifestAuthority?.packageCount !== 13 || before.production.incrementalRepairManifestAuthority?.noPackageCount !== 21 || before.production.incrementalRepairManifestAuthority?.readyForGenerationCount !== 0) throw new Error("human-taste-repair-wave-current-13-21-authority-required");
    const runPath = path.join(publicDir, maturityRelativePath);
    const run = readJson(runPath);
    const repairAttempt = run.overallStatus === "HUMAN_TASTE_REPAIR_AUDIT_BLOCKED"
      ? Number(run.phases?.PHASE_3?.repairAttempt || 1) + 1
      : 1;
    if (repairAttempt > 2) throw new Error("human-taste-repair-structural-revision-limit-exhausted");
    const phase012Green = run.phases?.PHASE_0?.status === "PASS" && run.phases?.PHASE_1?.status === "PASS" && run.phases?.PHASE_2?.status === "PASS";
    const boundedRevisionRecovery = run.overallStatus === "HUMAN_TASTE_REPAIR_AUDIT_BLOCKED" && repairAttempt === 2;
    if ((!(["READY_FOR_STATIC_BOARD_BUILD"].includes(run.overallStatus) || boundedRevisionRecovery)) || !phase012Green) throw new Error("human-taste-repair-wave-maturity-hard-gate-not-green");
    const queueItems = queue.items;
    let next = structuredClone(before);
    const queuedJobs = [];
    for (const item of queueItems) {
      const plan = next.production.shotIntelligence.packageLookMasterPlans.find((candidate) => candidate.shotId === item.shotId);
      if (!plan || plan.candidateBudget < 2) throw new Error(`human-taste-repair-wave-two-primitive-budget-invalid:${item.shotId}`);
      for (const [index, primitive] of item.primitives.slice(0, 2).entries()) {
        const queued = queuePackageLookMasterGenerationJobs(next, item.shotId, {
          now,
          candidateIndices: [index + 1],
          generationMode: "LOOK_MASTER_REPLACEMENT",
          repairAttempt,
          primitiveId: `human-taste-${item.shotId.toLowerCase()}-${primitive.id}`,
          repairPrompt: repairPrompt(item, primitive, {repairAttempt}),
        });
        next = queued.workspace;
        queuedJobs.push(...queued.jobs);
      }
    }
    if (queuedJobs.length !== queueItems.length * 2) throw new Error(`human-taste-repair-wave-job-count-invalid:${queuedJobs.length}`);
    if (new Set(queuedJobs.map((job) => job.generationInputHash)).size !== queuedJobs.length) throw new Error("human-taste-repair-wave-job-identity-invalid");
    const nextRun = buildWaveRun(run, queue, queuedJobs, {now, repairAttempt});
    for (const job of next.production.generation.jobs) {
      if (!queuedJobs.some((item) => item.id === job.id)) continue;
      job.goldenFilmMaturityWave = GOLDEN_FILM_MATURITY_WAVE_CONTRACT;
      job.goldenFilmMaturityRunSha256 = nextRun.maturityRunSha256;
      job.goldenFilmMaturityTargetShotIds = queueItems.map((item) => item.shotId);
      job.goldenFilmMaturityWaveContract = STATIC_BOARD_HUMAN_TASTE_REPAIR_WAVE_CONTRACT;
      job.generationMode = "LOOK_MASTER_REPLACEMENT";
      job.qualityTier = "draft";
    }
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "starting";
    next.production.generation.concurrency = 2;
    next.production.policy = {...next.production.policy, automaticDispatchAllowed: false, queuedJobCount: queuedJobs.length};
    const event = createProductionEvent({workspace: next, action: STATIC_BOARD_HUMAN_TASTE_REPAIR_WAVE_ACTION, targetId: nextRun.maturityRunSha256, payload: {contract: STATIC_BOARD_HUMAN_TASTE_REPAIR_WAVE_CONTRACT, targetShotIds: queueItems.map((item) => item.shotId), primitiveCountPerShot: 2, repairAttempt, jobIds: queuedJobs.map((job) => job.id), concurrencyHardMax: 2, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const waveReport = {
      contract: STATIC_BOARD_HUMAN_TASTE_REPAIR_WAVE_CONTRACT,
      status: "QUEUED",
      queueSha256: queue.queueSha256,
      maturityRunSha256: nextRun.maturityRunSha256,
      workspaceSha256Before: before.workspaceSha256,
      workspaceSha256AfterQueue: recalculated.workspaceSha256,
      targetShotIds: queueItems.map((item) => item.shotId),
      primitiveCountPerShot: 2,
      repairAttempt,
      jobs: queuedJobs.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, primitiveId: job.canonicalPrimitiveId, generationInputHash: job.generationInputHash, planSha256: job.lookMasterPlanSha256, outputRelativePath: job.outputRelativePath})),
      concurrencyHardMax: 2,
      imageGenerationProvider: "codex-imagegen-subscription-zero-extra-cost",
      imageGenerationPerformedBeforeDispatch: false,
      assemblyCreated: false,
      workerStarted: false,
      generatedAt: now,
    };
    waveReport.waveSha256 = sha256({...waveReport, waveSha256: undefined});
    const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256, files: {[maturityRelativePath]: nextRun, [waveRelativePath]: waveReport}});
    return {committed, nextRun, waveReport};
  });
  const sync = spawn(process.execPath, [syncScript], {cwd: root, stdio: "inherit"});
  return new Promise((resolve, reject) => {
    sync.once("error", reject);
    sync.once("exit", (code) => {
      if (code !== 0) return reject(new Error(`human-taste-authority-sync-failed:${code}`));
      if (!startWorker) return resolve({...result, workerPid: null});
      const worker = spawn(process.execPath, [workerScript], {cwd: root, detached: true, stdio: "ignore", env: process.env});
      worker.unref();
      resolve({...result, workerPid: worker.pid || null});
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await dispatchStaticBoardHumanTasteRepairWave();
  console.log(JSON.stringify({status: "PASS", queueSha256: result.waveReport.queueSha256, waveSha256: result.waveReport.waveSha256, maturityRunSha256: result.nextRun.maturityRunSha256, targetShotIds: result.waveReport.targetShotIds, jobCount: result.waveReport.jobs.length, workerPid: result.workerPid}, null, 2));
}
