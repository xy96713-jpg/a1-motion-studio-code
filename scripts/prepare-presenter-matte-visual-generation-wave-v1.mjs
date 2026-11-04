#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const CONTRACT = "A1PresenterMatteVisualGenerationWave/v1";
export const MATURITY_WAVE_CONTRACT = "A1GoldenFilmVisualSystemMaturityGenerationWave/v1";
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const relativeDir = "golden-film-visual-system-maturity-v1";
const preflightRelativePath = `${relativeDir}/presenter-matte-generation-preflight.json`;
const maturityRelativePath = `${relativeDir}/maturity-run.json`;
const targetShotIds = ["ED-08", "ED-31", "ED-34"];
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

const routeSpec = {
  "ED-08": {mode: "BEHIND_SUBJECT_MATTE", durationMs: 1800, copy: ["AI 常常不说人话"], primitiveNames: ["DOCUMENT_SIGNAL_COLLISION", "DISTORTED_VOICE_OBJECT"], semantic: "AI 的中文表面完整，却常常不像人说的话。"},
  "ED-31": {mode: "PRESENTER_CUTOUT_COMPOSITE", durationMs: 2200, copy: ["整理", "编排", "读取", "检查"], primitiveNames: ["PROCESS_RAIL_BEHIND_PRESENTER", "FOUR_STAGE_EDITORIAL_PATH"], semantic: "把整理、编排、读取、检查压成一条由作者本人控制的工作路径。"},
  "ED-34": {mode: "SHORT_FULLSCREEN_TAKEOVER", durationMs: 1500, copy: ["往哪个方向走", "自己的风格"], primitiveNames: ["DIRECTION_CHOICE_PATH", "STYLE_LOCK_END_STATE"], semantic: "方向来自自己的偏好，终点是写出自己的风格。"},
};

function holdFrameFor(plan) {
  const hold = plan?.videoContext?.baseFrame;
  if (!hold?.publicUrl || !hold.sha256) throw new Error(`generation-hold-frame-missing:${plan?.shotId || "unknown"}`);
  return hold;
}

function buildPrompt({shotId, plan, dryShot, candidateIndex}) {
  const spec = routeSpec[shotId];
  const hold = holdFrameFor(plan);
  const primitive = spec.primitiveNames[candidateIndex - 1];
  const copy = spec.copy.join(" / ");
  const isTakeover = spec.mode === "SHORT_FULLSCREEN_TAKEOVER";
  const matte = dryShot?.matte || null;
  const geometry = matte ? {
    holdFrameSha256: matte.sourceHoldFrame?.sha256 || hold.sha256,
    presenterMatteSha256: matte.presenterMatte?.sha256 || null,
    microphoneMatteSha256: matte.microphoneMatte?.sha256 || null,
    boomMatteSha256: matte.boomMatte?.sha256 || null,
    presenterBounds: matte.presenterMatte?.metrics?.visibleBounds || null,
    microphoneBounds: matte.microphoneMatte?.metrics?.visibleBounds || null,
    boomBounds: matte.boomMatte?.metrics?.visibleBounds || null,
  } : null;
  const route = isTakeover
    ? `FULLSCREEN takeover lasts ${spec.durationMs}ms. The presenter is intentionally absent for this short beat; plan the clean entry from the live shot and the clean return to the live shot.`
    : `Use ${spec.mode}. The output is a true transparent package layer only. The final compositor will use BASE_FRAME -> PACKAGE_LAYER -> REAL_PIXEL_PRESENTER_MATTE -> MICROPHONE_MATTE -> BOOM_MATTE. Do not bake the hold frame, presenter, microphone or boom into the output.`;
  const readable = isTakeover
    ? `Place only these exact Chinese visual actors, verbatim: “${copy}”. No other readable glyphs.`
    : `Place only this exact Chinese visual actor, verbatim: “${copy}”. The readable title must remain entirely outside face, eyes, mouth, microphone and boom masks in the final composite. Non-readable depth paths may pass behind the presenter, but no readable glyph may be occluded.`;
  const geometryClause = isTakeover
    ? "No presenter avoidance is required in the takeover, but the title must be a complete visual actor with one clear reading path."
    : `Measured real-pixel matte evidence is binding: ${JSON.stringify(geometry)}. Keep readable typography in the actual upper-left quiet field approximately x=0.03..0.37, y=0.04..0.28, unless a more open region is visibly available in the hold frame. Never use the old mid-left y=0.285..0.835 region as a foreground-safe zone; it overlaps microphone and boom.`;
  return `A1 BOUNDED PRESENTER MATTE VISUAL REPAIR LOOK MASTER. Shot ${shotId}; candidate ${candidateIndex}; primitive ${primitive}. This is a finished integrated editorial visual actor for the current film, not a poster, subtitle, UI card, source citation, or final video.

Use case: productivity-visual editorial packaging. Asset type: project-bound Look Master candidate. Canonical packaging mode: ${spec.mode}. Active art direction: minimal-retro-pixel-editorial rooted in pinterest-retro-pixel-v1. Use neutral white, cool gray, charcoal, low-saturation blue and footage-derived darks. One restrained cobalt, magenta or acid-green accent is allowed. Warm yellow, cream, beige and old-paper dominant fields are forbidden. CRT and pixel grammar are light local syntax only.

Semantic purpose: ${spec.semantic}
Registered hold frame reference: ${hold.publicUrl} with SHA ${hold.sha256}. Treat it as a compositional reference only and preserve real source identity. ${route}

${readable}
${geometryClause}

Typography is an image-generation visual actor, integrated with the object, material and negative space. Make the title large enough to read at whole-film static-board scale. One main actor, one action, one reading path; no small sticker, speech bubble, generic workflow UI, card stack, fake browser, fake source, fake citation, English filler, debug text, watermark, logo or decorative objects.

${shotId === "ED-08" ? "Show a single decisive mismatch: a clean human-language signal entering an output that visibly loses natural voice. Keep the title intact and dominant; use one broken speech/document actor, not a collage." : ""}
${shotId === "ED-31" ? "Show the four actions as one continuous editorial route behind the presenter: 整理 -> 编排 -> 读取 -> 检查. The presenter remains visually in front in the final composite. Keep every readable word intact and unobscured; only the route material may disappear behind the matte." : ""}
${shotId === "ED-34" ? "Show one directional choice resolving into a personal style lock. This is a brief full-frame conclusion, not a robot sticker, not a generic arrow diagram and not a presenter overlay." : ""}

Do not add any text beyond the exact copy above. Do not invent factual evidence. Do not redraw the video frame. Return a single PNG Look Master candidate suitable for actual-pixel composite audit. The candidate is not approved until decoded-pixel diff, visible-area, matte edge, semantic, OCR, duplicate and aesthetic gates all pass.`;
}

function preflightPrompt(prompt, {shotId, plan, dryShot, candidateIndex}) {
  const spec = routeSpec[shotId];
  const failures = [];
  if (!prompt.includes(`Shot ${shotId}`)) failures.push("SHOT_ID_MISSING");
  if (!prompt.includes(spec.mode)) failures.push("MODE_MISSING");
  for (const phrase of spec.copy) if (!prompt.includes(phrase)) failures.push(`EXACT_COPY_MISSING:${phrase}`);
  if (prompt.includes("EDITOR_SELECTS_OPEN_REGION_AT_INSERTION") || prompt.includes("x=.04–.37") || prompt.includes("y=.285–.835")) failures.push("STALE_OR_DELEGATED_GEOMETRY");
  if (/[奶油黄暖黄米黄]|warm yellow|cream|beige|old-paper dominant/iu.test(prompt) && !prompt.includes("forbidden")) failures.push("WARM_DOMINANT_FIELD_ALLOWED");
  if (!prompt.includes("true transparent package layer") && !prompt.includes("FULLSCREEN takeover")) failures.push("OUTPUT_ROUTE_CONTRACT_MISSING");
  if (!plan?.planSha256 || !dryShot?.holdFrame?.sha256) failures.push("PLAN_OR_HOLD_FRAME_SHA_MISSING");
  return {status: failures.length ? "FAIL" : "PASS", failures, shotId, candidateIndex, mode: spec.mode, copy: spec.copy, promptSha256: sha256(prompt), holdFrameSha256: dryShot.holdFrame.sha256, matteSha256: dryShot.matte?.presenterMatte?.sha256 || null};
}

function buildMaturityRun(previous, {jobIds, preflightSha256, now}) {
  const next = structuredClone(previous);
  next.generatedAt = now;
  next.overallStatus = "GENERATION_QUEUED";
  next.nextAction = "RUN_EDITORIAL_ASSET_GENERATION_WORKER";
  next.phases.PHASE_3 = {...next.phases.PHASE_3, status: "QUEUED", generationAllowed: true, generationDispatched: true, targetShotIds, queuedJobIds: jobIds, preflightManifestSha256: preflightSha256, waveContract: MATURITY_WAVE_CONTRACT, nextAction: "RUN_EDITORIAL_ASSET_GENERATION_WORKER"};
  next.phases.PHASE_4 = {...next.phases.PHASE_4, status: "BLOCKED_UNTIL_TARGETED_REPAIR_COMPLETE", boardRebuilt: false, userApproval: false, nextAction: "AUDIT_TARGETED_REPAIR_CANDIDATES"};
  next.imageLedger = {...next.imageLedger, generationDispatched: true, targetShotIds, targetedRepairShotIds: targetShotIds, targetedRepairExpectedCandidateCount: jobIds.length, targetedRepairAttemptedGeneratedCount: 0, targetedRepairAdoptedGeneratedCount: 0, targetedRepairRejectedGeneratedCount: 0, targetedRepairCandidateShas: [], newGeneratedShas: [], newGeneratedCount: 0};
  next.maturityRunSha256 = sha256({...next, maturityRunSha256: undefined});
  return next;
}

export function preparePresenterMatteVisualGenerationWave({now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const production = before.production;
    if (production.generation.summary.queued !== 0 || production.generation.summary.running !== 0 || production.generation.workerStatus !== "frozen") throw new Error("presenter-matte-generation-wave-requires-frozen-idle-worker");
    if ((production.shotIntelligence.currentAssembly || []).length || production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("presenter-matte-generation-wave-assembly-must-remain-locked");
    const sequence = production.canonicalCreatorPackagingSequence;
    if (sequence.decisions.length !== 34 || sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length !== 13 || sequence.decisions.filter((item) => item.packageDecision !== "PACKAGE").length !== 21) throw new Error("presenter-matte-generation-wave-current-13-21-required");
    const binding = production.creatorPaletteShotBindingManifest;
    if (binding?.status !== "BLOCKED" || JSON.stringify(binding.blockedShotIds?.slice().sort()) !== JSON.stringify(targetShotIds.slice().sort())) throw new Error("presenter-matte-generation-wave-targeted-binding-blocker-required");
    if (production.incrementalRepairManifestAuthority?.readyForGenerationCount !== 3) throw new Error("presenter-matte-generation-wave-three-ready-targets-required");
    const dryRun = readJson(path.join(publicDir, relativeDir, "overlay-geometry-dry-run/geometry-capacity-dry-run.json"));
    const plans = new Map(production.shotIntelligence.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
    const preflightEntries = [];
    let next = structuredClone(before);
    for (const shotId of targetShotIds) {
      const plan = plans.get(shotId);
      const dryShot = dryRun.shots.find((item) => item.shotId === shotId);
      if (!plan || !dryShot) throw new Error(`presenter-matte-generation-wave-input-missing:${shotId}`);
      for (const candidateIndex of [1, 2]) {
        const prompt = buildPrompt({shotId, plan, dryShot, candidateIndex});
        const entry = preflightPrompt(prompt, {shotId, plan, dryShot, candidateIndex});
        preflightEntries.push({...entry, primitive: routeSpec[shotId].primitiveNames[candidateIndex - 1], prompt});
      }
    }
    const failed = preflightEntries.filter((entry) => entry.status !== "PASS");
    if (failed.length) throw new Error(`presenter-matte-generation-wave-prompt-preflight-failed:${JSON.stringify(failed.map((item) => ({shotId: item.shotId, candidateIndex: item.candidateIndex, failures: item.failures})))}`);
    const canonicalRepairBinding = {contract: "A1PresenterMatteVisualRepairBinding/v1", maturityRunSha256: production.goldenFilmVisualSystemMaturity?.maturityRunSha256 || null, bindingManifestSha256: binding.manifestSha256, targetShotIds, packageCount: 13, noPackageCount: 21};
    const queuedJobs = [];
    for (const entry of preflightEntries) {
      const queued = queuePackageLookMasterGenerationJobs(next, entry.shotId, {now, candidateIndices: [entry.candidateIndex], generationMode: "LOOK_MASTER_REPAIR", canonicalRepairBinding, primitiveId: `presenter-matte-${entry.shotId.toLowerCase()}-${entry.candidateIndex}`, repairAttempt: 1, promptOverride: entry.prompt});
      next = queued.workspace;
      queuedJobs.push(...queued.jobs);
    }
    if (queuedJobs.length !== 6 || new Set(queuedJobs.map((job) => job.generationInputHash)).size !== 6) throw new Error("presenter-matte-generation-wave-job-identity-invalid");
    const preflight = {contract: CONTRACT, version: 1, current: true, status: "PASS_READY_TO_DISPATCH", sourceWorkspaceSha256: before.workspaceSha256, sequenceSha256: sequence.sequenceSha256, bindingManifestSha256: binding.manifestSha256, packageCount: 13, noPackageCount: 21, targetShotIds, maxConcurrency: 2, entries: preflightEntries.map((entry) => ({shotId: entry.shotId, candidateIndex: entry.candidateIndex, primitive: entry.primitive, mode: entry.mode, copy: entry.copy, promptSha256: entry.promptSha256, holdFrameSha256: entry.holdFrameSha256, matteSha256: entry.matteSha256, status: entry.status})), jobIds: queuedJobs.map((job) => job.id), noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true, workerStartAllowed: true, generatedAt: now};
    preflight.manifestSha256 = sha256({...preflight, manifestSha256: undefined});
    const previousRun = readJson(path.join(publicDir, maturityRelativePath));
    let nextRun = buildMaturityRun(previousRun, {jobIds: queuedJobs.map((job) => job.id), preflightSha256: preflight.manifestSha256, now});
    for (const job of next.production.generation.jobs) {
      if (!queuedJobs.some((item) => item.id === job.id)) continue;
      job.goldenFilmMaturityWave = MATURITY_WAVE_CONTRACT;
      job.goldenFilmMaturityRunSha256 = nextRun.maturityRunSha256;
      job.goldenFilmMaturityTargetShotIds = targetShotIds;
      job.goldenFilmMaturityWaveContract = CONTRACT;
      job.qualityTier = "high";
      job.generationMode = "LOOK_MASTER_REPAIR";
    }
    next.production.generation.workerStatus = "starting";
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.concurrency = 2;
    next.production.policy = {...next.production.policy, automaticDispatchAllowed: false, queuedJobCount: 6};
    next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, current: true, status: "GENERATION_QUEUED", maturityRunSha256: nextRun.maturityRunSha256, nextAction: "RUN_EDITORIAL_ASSET_GENERATION_WORKER", targetShotIds, presenterMatteVisualRepairGenerationRequiredShotIds: targetShotIds, generationPreflightManifestSha256: preflight.manifestSha256};
    next.production.authority = {...next.production.authority, nextAction: {id: "RUN_EDITORIAL_ASSET_GENERATION_WORKER", label: "RUN_EDITORIAL_ASSET_GENERATION_WORKER", requiresUser: false, targetShotIds, reviewGate: "GOLDEN_FILM_VISUAL_SYSTEM_MATURITY_V1"}};
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, status: "GENERATION_QUEUED", assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
    const event = createProductionEvent({workspace: next, action: "prepare-presenter-matte-visual-generation-wave-v1", targetId: nextRun.maturityRunSha256, payload: {contract: CONTRACT, targetShotIds, jobIds: queuedJobs.map((job) => job.id), maxConcurrency: 2, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const committed = persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: before.workspaceSha256, event, files: {[preflightRelativePath]: preflight, [maturityRelativePath]: nextRun}});
    return {workspace: committed, preflight, maturityRun: nextRun, jobs: queuedJobs};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = preparePresenterMatteVisualGenerationWave();
  console.log(JSON.stringify({status: result.preflight.status, preflightSha256: result.preflight.manifestSha256, maturityRunSha256: result.maturityRun.maturityRunSha256, targetShotIds, jobIds: result.jobs.map((job) => job.id), queue: result.workspace.production.generation.summary, workerStatus: result.workspace.production.generation.workerStatus}, null, 2));
}
