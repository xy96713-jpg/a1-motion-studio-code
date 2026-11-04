#!/usr/bin/env node

import crypto from "node:crypto";
import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const GOLDEN_FILM_MATURITY_WAVE_ACTION = "dispatch-golden-film-visual-system-maturity-wave-v1";
export const GOLDEN_FILM_MATURITY_WAVE_CONTRACT = "A1GoldenFilmVisualSystemMaturityGenerationWave/v1";
export const ED15_OVERLAY_PRIMITIVE_SWITCH_NEXT_ACTION = "DISPATCH_ED15_OVERLAY_PRIMITIVE_SWITCH_WAVE_MAX_2";
export const ED15_OVERLAY_PRIMITIVE_SWITCH_ID = "presenter-aware-dual-gap-offset-wordforms";
export const ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION = "DISPATCH_ED15_OVERLAY_TAXONOMY_REAUTHOR_WAVE_MAX_2";
export const ED15_OVERLAY_TAXONOMY_REAUTHOR_ID = "presenter-aware-dual-gap-type-lockup";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const maturityRelativePath = "golden-film-visual-system-maturity-v1/maturity-run.json";
const waveRelativePath = "golden-film-visual-system-maturity-v1/generation-wave.json";
const workerScript = path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function queuedMaturityRun(run, {now, targetShotIds, jobIds}) {
  const next = structuredClone(run);
  next.generatedAt = now;
  next.phases.PHASE_3 = {
    ...next.phases.PHASE_3,
    status: "QUEUED",
    generationAllowed: true,
    generationDispatched: true,
    targetShotIds,
    queuedJobIds: jobIds,
    newGeneratedShas: [],
    failureReasons: [],
    nextAction: "RUN_EDITORIAL_ASSET_GENERATION_WORKER",
  };
  next.overallStatus = "GENERATION_QUEUED";
  next.nextAction = "RUN_EDITORIAL_ASSET_GENERATION_WORKER";
  next.runtimeFreeze = {...next.runtimeFreeze, queue: jobIds.length, running: 0, workerStatus: "starting", assemblyCount: 0, assemblyCreationAllowed: false};
  next.imageLedger = {...next.imageLedger, generationDispatched: true, newGeneratedShas: [], newGeneratedCount: 0};
  next.maturityRunSha256 = sha256({...next, maturityRunSha256: undefined});
  return next;
}

export function dispatchGoldenFilmMaturityWave({now = new Date().toISOString()} = {}) {
  const result = withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const runPath = path.join(publicDir, maturityRelativePath);
    const run = readJson(runPath);
    const structuralRepairRecovery = run.overallStatus === "GENERATION_COMPLETE_AUDIT_BLOCKED"
      && run.phases?.PHASE_3?.status === "ACTUAL_PIXEL_AUDIT_WITH_REJECTIONS"
      && run.nextAction === "DISPATCH_ED15_DUAL_GAP_OVERLAY_REPAIR_WAVE_MAX_2";
    const primitiveSwitchRecovery = run.overallStatus === "ED15_OVERLAY_PRIMITIVE_SWITCH_READY"
      && run.phases?.PHASE_3?.status === "READY"
      && run.nextAction === ED15_OVERLAY_PRIMITIVE_SWITCH_NEXT_ACTION;
    const taxonomyReauthorRecovery = run.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_READY"
      && run.phases?.PHASE_3?.status === "READY"
      && run.nextAction === ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION;
    const initialGenerationReady = ["BLOCKED_BEFORE_GENERATION", "ED15_DUAL_GAP_OVERLAY_REPAIR_READY"].includes(run.overallStatus)
      && run.phases?.PHASE_3?.status === "READY";
    if ((!initialGenerationReady && !structuralRepairRecovery && !primitiveSwitchRecovery && !taxonomyReauthorRecovery) || run.phases?.PHASE_0?.status !== "PASS" || run.phases?.PHASE_1?.status !== "PASS" || run.phases?.PHASE_2?.status !== "PASS") throw new Error("golden-film-maturity-phase-2-hard-gate-not-green");
    if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("golden-film-maturity-wave-requires-frozen-idle-runtime");
    if ((before.production.shotIntelligence.currentAssembly || []).length) throw new Error("golden-film-maturity-wave-assembly-must-remain-empty");
    const targetShotIds = [...(run.phases?.PHASE_3?.targetShotIds || [])];
    const repairManifest = readJson(path.join(publicDir, "incremental-repair-executor-v1/repair-manifest.json"));
    const repairReadyShotIds = (repairManifest.entries || []).filter((entry) => entry.status === "READY_FOR_GENERATION").map((entry) => entry.shotId);
    if (!targetShotIds.length || targetShotIds.length > 2 || JSON.stringify(targetShotIds) !== JSON.stringify(repairReadyShotIds)) throw new Error(`golden-film-maturity-wave-target-scope-invalid:${targetShotIds.join(",")}:${repairReadyShotIds.join(",")}`);
    const repairAttempt = taxonomyReauthorRecovery ? 3 : primitiveSwitchRecovery ? 2 : Number(run.phases?.PHASE_3?.repairAttempt || 0);
    if (structuralRepairRecovery && repairAttempt !== 1) throw new Error(`golden-film-maturity-structural-repair-attempt-invalid:${repairAttempt}`);
    if (repairAttempt > 3) throw new Error("golden-film-maturity-visual-taxonomy-reauthor-limit-reached");
    const primitiveId = taxonomyReauthorRecovery ? ED15_OVERLAY_TAXONOMY_REAUTHOR_ID : primitiveSwitchRecovery ? ED15_OVERLAY_PRIMITIVE_SWITCH_ID : null;
    const repairPrompt = taxonomyReauthorRecovery
      ? "FINAL BOUNDED TAXONOMY REAUTHOR: create a complete presenter-aware OVERLAY typography lockup, not a poster and not an opaque title card. Use exactly two short, solid, high-contrast Chinese phrase strips, both inside the measured top-left negative-space rectangle normalized x=0.04..0.33 and y=0.06..0.32 on a 960x540 canvas. Strip 1 is the exact simplified text `讨厌什么句式`; strip 2 is the exact simplified text `带到哪里`. Keep the two strips left-aligned as one compact lockup with a small vertical gap and a subtle baseline offset; do not make one giant phrase, do not scatter the words, and do not use diagonal layout. Glyph-lock requirement: the fourth character of strip 1 is exactly `句` (the box-radical character, not `向`), and the last character is exactly `式`; the first character of strip 2 is exactly `带` (simplified, not `帶`). No punctuation, arrows, lines, brackets, cards, panels, windows, icons, English, logos, labels, or extra readable glyphs. True transparent PNG: all pixels outside that measured rectangle must be fully transparent, never bake the presenter or hold frame, and never use a warm-yellow/cream field. Use neutral charcoal/white with one restrained cobalt accent; typography is the only semantic actor and both strips must read in three seconds while the face, eyes, body, microphone and boom remain untouched. This is the final bounded attempt; prioritize exact characters and containment over decorative detail."
      : primitiveSwitchRecovery
      ? "VISUAL PRIMITIVE SWITCH ATTEMPT 1: the compact stacked two-line overlay failed exact Chinese OCR. Keep presenter-aware OVERLAY and use a genuinely different topology: two separate, asymmetric, compact typographic actors with a deliberate empty gap between them. Place line 1 `讨厌什么句式` in the upper-left of the measured region and line 2 `带到哪里` in the lower-right of the same region; do not stack them as one poster block. Preserve these exact simplified characters, with no traditional `帶`, punctuation, arrows, connectors, paths, cards, panels, borders, icons, labels, English or extra glyphs. Return a true transparent PNG: every nontransparent pixel must stay inside normalized x=0.06..0.31 and y=0.08..0.29 on the 960x540 semantic canvas; all other pixels must be genuinely transparent; never bake the presenter or hold frame into the output. Typography is the only visual actor; use restrained cobalt/white/charcoal contrast, no warm-yellow or cream field, and keep both phrases readable within three seconds."
      : repairAttempt === 1
      ? "STRUCTURAL REPAIR ATTEMPT 1: the previous overlay candidates failed actual pixel geometry and exact Chinese OCR. Rebuild the same presenter-aware OVERLAY as a compact, two-line typographic actor only. At the exact 960x540 output size, every nontransparent pixel must stay inside normalized x=0.06..0.31 and y=0.08..0.29; leave all other pixels genuinely transparent. Render exactly these two simplified-Chinese lines and no other readable glyphs: line 1 `讨厌什么句式`; line 2 `带到哪里`. Preserve these exact simplified characters; do not use traditional `帶`, do not add punctuation, question marks, arrows, paths, cards, windows, labels, objects, or a background plate. Keep each line co-primary and readable in three seconds, with glyph height about 42-54 px and compact line spacing. Typography is the visual actor; no presenter pixels may be baked into the PNG."
      : null;
    let next = structuredClone(before);
    const queuedJobs = [];
    for (const shotId of targetShotIds) {
      const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
      if (!plan || ![2, 3, 4].includes(plan.candidateBudget)) throw new Error(`golden-film-maturity-wave-candidate-budget-invalid:${shotId}`);
      const candidateIndices = Array.from({length: plan.candidateBudget}, (_, index) => index + 1);
      // The current compiled plans intentionally expose two complete,
      // structurally different directions for each target.  Never use FAST
      // discovery for this maturity wave.
      const queued = queuePackageLookMasterGenerationJobs(next, shotId, {now, candidateIndices, generationMode: "LOOK_MASTER_REPLACEMENT", repairAttempt, repairPrompt, primitiveId});
      next = queued.workspace;
      queuedJobs.push(...queued.jobs);
    }
    const expectedJobCount = targetShotIds.reduce((sum, shotId) => sum + next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId).candidateBudget, 0);
    if (queuedJobs.length !== expectedJobCount || new Set(queuedJobs.map((job) => job.generationInputHash)).size !== queuedJobs.length) throw new Error("golden-film-maturity-wave-job-identity-invalid");
    for (const job of queuedJobs) {
      const declared = job.referenceAttachmentManifest;
      const sourceShas = (job.referenceInputs || []).map((item) => item.sourceSha256 || item.sha256);
      if (job.productionMethod !== "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION"
        || job.referencePackagingContract !== "A1UniversalReferenceToImagegenPackaging/v1"
        || declared?.fileCount !== job.referenceInputs?.length
        || declared.fileCount < 1
        || JSON.stringify(declared.sourceSha256s) !== JSON.stringify(sourceShas)) throw new Error(`golden-film-maturity-wave-reference-attachments-invalid:${job.id}`);
    }
    const nextRun = queuedMaturityRun(run, {now, targetShotIds, jobIds: queuedJobs.map((job) => job.id)});
    for (const job of next.production.generation.jobs) {
      if (!queuedJobs.some((item) => item.id === job.id)) continue;
      job.goldenFilmMaturityWave = GOLDEN_FILM_MATURITY_WAVE_CONTRACT;
      job.goldenFilmMaturityRunSha256 = nextRun.maturityRunSha256;
      job.goldenFilmMaturityTargetShotIds = targetShotIds;
      job.generationMode = "LOOK_MASTER_REPLACEMENT";
      job.qualityTier = "draft";
    }
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "starting";
    next.production.generation.concurrency = 2;
    next.production.policy = {...next.production.policy, automaticDispatchAllowed: false, queuedJobCount: queuedJobs.length};
    const event = createProductionEvent({workspace: next, action: GOLDEN_FILM_MATURITY_WAVE_ACTION, targetId: nextRun.maturityRunSha256, payload: {contract: GOLDEN_FILM_MATURITY_WAVE_CONTRACT, targetShotIds, candidateIndices: Object.fromEntries(targetShotIds.map((shotId) => [shotId, next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId).candidateDirections.map((_, index) => index + 1)])), jobIds: queuedJobs.map((job) => job.id), concurrencyHardMax: 2, generationMode: "LOOK_MASTER_REPLACEMENT", noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const waveReport = {
      contract: GOLDEN_FILM_MATURITY_WAVE_CONTRACT,
      status: "QUEUED",
      maturityRunSha256: nextRun.maturityRunSha256,
      workspaceSha256Before: before.workspaceSha256,
      workspaceSha256AfterQueue: recalculated.workspaceSha256,
      targetShotIds,
      jobs: queuedJobs.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, planSha256: job.lookMasterPlanSha256, outputRelativePath: job.outputRelativePath, generationMode: job.generationMode, providerMode: job.providerMode, repairAttempt, primitiveId})),
      concurrencyHardMax: 2,
      imageGenerationProvider: "codex-imagegen-subscription-zero-extra-cost",
      imageGenerationPerformedBeforeDispatch: false,
      assemblyCreated: false,
      workerStarted: false,
      generatedAt: now,
    };
    const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256, files: {[maturityRelativePath]: nextRun, [waveRelativePath]: waveReport}});
    return {workspaceSha256: committed.workspaceSha256, nextRun, waveReport};
  });
  // The authority sync is deliberately outside the project lock so the
  // normal CAS/project-store transaction remains the only workspace writer.
  const sync = spawn(process.execPath, [path.join(root, "scripts/sync-golden-film-maturity-authority-v1.mjs")], {cwd: root, stdio: "inherit"});
  return new Promise((resolve, reject) => {
    sync.once("error", reject);
    sync.once("exit", (code) => {
      if (code !== 0) return reject(new Error(`golden-film-maturity-authority-sync-failed:${code}`));
      const worker = spawn(process.execPath, [workerScript], {cwd: root, detached: true, stdio: "ignore", env: process.env});
      worker.unref();
      resolve({...result, workerPid: worker.pid || null});
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await dispatchGoldenFilmMaturityWave();
  console.log(JSON.stringify({status: "PASS", maturityRunSha256: result.nextRun.maturityRunSha256, workspaceSha256: result.workspaceSha256, targetShotIds: result.waveReport.targetShotIds, jobCount: result.waveReport.jobs.length, workerPid: result.workerPid, queue: result.workspaceSha256 ? "DISPATCHED" : "UNKNOWN"}, null, 2));
}
