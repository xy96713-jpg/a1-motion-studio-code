#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {runCreatorPaletteBoundRepair} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";
import {ED15_HOLD_FRAME_SHA256, ED15_VISIBLE_PHRASES, runGoldenFilmCurrentPlanContextRecompile} from "./recompile-golden-film-current-plan-context-v1.mjs";
import {buildGoldenFilmVisualSystemMaturityRun, persistGoldenFilmVisualSystemMaturityRun} from "./run-golden-film-visual-system-maturity-v1.mjs";
import {syncGoldenFilmMaturityAuthority} from "./sync-golden-film-maturity-authority-v1.mjs";

export const ED15_OVERLAY_TAXONOMY_ADJUDICATION_ACTION = "adjudicate-ed15-overlay-taxonomy-v1";
export const ED15_DUAL_GAP_OVERLAY_NEXT_ACTION = "DISPATCH_ED15_DUAL_GAP_OVERLAY_REPAIR_WAVE_MAX_2";
export const ED15_OVERLAY_TAXONOMY_ADJUDICATION_CONTRACT = "A1ED15OverlayTaxonomyAdjudication/v1";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1", "maturity-run.json");
const repairPath = path.join(publicDir, "incremental-repair-executor-v1", "repair-manifest.json");
const actualPixelAuditPath = path.join(publicDir, "golden-film-visual-system-maturity-v1", "actual-pixel-audit.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function buildAdjudication(workspace, plan, {now = new Date().toISOString()} = {}) {
  const geometry = plan?.videoContext?.holdFrameGeometry;
  if (!plan || plan.shotId !== "ED-15") throw new Error("ed15-overlay-adjudication-plan-missing");
  if (plan.assemblyMode !== "OVERLAY" || plan.presentationMode !== "OVERLAY" || plan.videoContext?.frameOccupation === "FULL_FRAME_TAKEOVER" || plan.videoContext?.frameTakeoverAllowed !== false) throw new Error("ed15-overlay-adjudication-mode-invalid");
  if (geometry?.sourceHoldFrameSha256 !== ED15_HOLD_FRAME_SHA256 || geometry.measurementMethod !== "ACTUAL_HOLD_FRAME_PIXEL_REVIEW" || geometry.noTemplateDefaults !== true) throw new Error("ed15-overlay-adjudication-geometry-not-actual");
  if (plan.typographyVisualContract?.contract !== "A1PresenterAwareDualGapTypographyActor/v1" || JSON.stringify(plan.protectedPhrases || []) !== JSON.stringify(ED15_VISIBLE_PHRASES)) throw new Error("ed15-overlay-adjudication-visual-actor-contract-missing");
  const sourceCopy = plan.exactCopy?.text || plan.sourceText;
  const body = {
    contract: ED15_OVERLAY_TAXONOMY_ADJUDICATION_CONTRACT,
    version: 1,
    status: "PASS",
    current: true,
    shotId: "ED-15",
    decision: "KEEP_PRESENTER_AWARE_OVERLAY",
    lane: "OVERLAY",
    laneCRequired: false,
    canonicalMode: {contentTreatment: "HERO_TYPOGRAPHY", assemblyMode: "OVERLAY", presentationMode: "OVERLAY", frameOccupation: "OVERLAY", baseVisualCarrier: "PRESENTER_BASE", frameTakeoverAllowed: false},
    sourceRevisionHash: workspace.article?.sourceTextSha256 || null,
    sourceCopy,
    visiblePhrases: [...ED15_VISIBLE_PHRASES],
    visualActorContract: structuredClone(plan.typographyVisualContract),
    evidence: {
      holdFrameSha256: ED15_HOLD_FRAME_SHA256,
      geometrySha256: sha256(geometry),
      subjectBounds: structuredClone(geometry.subjectBounds),
      protectedBounds: structuredClone(geometry.protectedBounds),
      microphoneAndBoomExclusion: structuredClone(geometry.microphoneAndBoomExclusion),
      availableRegions: structuredClone(geometry.availableRegions),
      safeZones: structuredClone(geometry.safeZones),
    },
    rationale: [
      "ED-15's semantic job is the dual missing constraint: the model lacks both a disliked-phrase boundary and a reader destination.",
      "The real hold frame has one measured top-left negative-space region; the long spoken sentence cannot remain a readable single overlay actor without shrinking or colliding with the presenter.",
      "Two short co-primary actors preserve both gaps in three seconds while keeping the presenter, face, eyes, body, microphone and boom visible.",
      "FULL_FRAME would sever the presenter/utterance relationship and would be a taxonomy workaround, not a semantic improvement.",
    ],
    generationPolicy: {generationAllowed: false, imageGenerationPerformed: false, dispatchAllowed: false},
    planSha256: plan.planSha256,
    createdAt: now,
  };
  return {...body, decisionSha256: sha256(body)};
}

function addAdjudicationToWorkspace(adjudication, {now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const current = before.production.shotIntelligence?.goldenFilmVisualDecisionAdjudication;
    if (current?.decisionSha256 === adjudication.decisionSha256) return {noop: true, workspace: before, adjudication};
    const next = structuredClone(before);
    next.production.shotIntelligence.goldenFilmVisualDecisionAdjudication = structuredClone(adjudication);
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    const event = createProductionEvent({workspace: next, action: ED15_OVERLAY_TAXONOMY_ADJUDICATION_ACTION, targetId: adjudication.decisionSha256, payload: {contract: ED15_OVERLAY_TAXONOMY_ADJUDICATION_CONTRACT, shotId: "ED-15", laneCRequired: false, imageGenerationPerformed: false, assemblyCreated: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256});
    return {noop: false, workspace: committed, adjudication};
  });
}

function rehashDecisionContract(run, adjudication) {
  const decisionContract = {
    ...run.decisionContract,
    adjudications: [structuredClone(adjudication)],
    nextAction: ED15_DUAL_GAP_OVERLAY_NEXT_ACTION,
  };
  return {...decisionContract, decisionContractSha256: sha256({...decisionContract, decisionContractSha256: undefined})};
}

function historyShasFromLedger(ledger) {
  return [...new Set([
    ...(ledger?.historicalGeneratedShas || []),
    ...(ledger?.newGeneratedShas || []),
    ...(ledger?.priorRunHistoryReadOnly?.historicalGeneratedShas || []),
    ...(ledger?.priorRunHistoryReadOnly?.newGeneratedShas || []),
  ])];
}

function carryPriorGenerationLedger(run, previousRun, historicalAuditShas = []) {
  const priorHistoryShas = historyShasFromLedger(previousRun?.imageLedger || {});
  const historicalShas = [...new Set([...priorHistoryShas, ...historicalAuditShas])];
  if (!previousRun?.maturityRunSha256 && !historicalShas.length) return run;
  const previousLedger = previousRun.imageLedger || {};
  return {
    ...run,
    imageLedger: {
      ...run.imageLedger,
      priorRunHistoryReadOnly: {
        contract: "A1GoldenFilmMaturityImageLedgerHistory/v1",
        status: "HISTORY_READ_ONLY",
        maturityRunSha256: previousRun.maturityRunSha256,
        newGeneratedShas: [...(previousLedger.newGeneratedShas || [])],
        newGeneratedCount: Number(previousLedger.newGeneratedCount || 0),
        goodPngShaChanged: previousLedger.goodPngShaChanged === true,
        generationDispatched: previousLedger.generationDispatched === true,
        historicalGeneratedShas: [...priorHistoryShas],
        historicalGeneratedCount: priorHistoryShas.length,
      },
      historicalGeneratedShas: historicalShas,
      historicalGeneratedCount: historicalShas.length,
    },
  };
}

function buildAdjudicatedMaturityRun(workspace, previousRun, adjudication, {now = new Date().toISOString()} = {}) {
  const historicalAudit = fs.existsSync(actualPixelAuditPath) ? readJson(actualPixelAuditPath) : null;
  const historicalAuditShas = [...new Set((historicalAudit?.audits || []).map((item) => item.artifactSha256).filter(Boolean))];
  let run = buildGoldenFilmVisualSystemMaturityRun(workspace, {now});
  const generationTargets = run.phases.PHASE_0.summary.generationReadyShotIds;
  if (JSON.stringify(generationTargets) !== JSON.stringify(["ED-15"])) throw new Error(`ed15-overlay-adjudication-generation-scope-invalid:${generationTargets.join(",")}`);
  if (run.phases.PHASE_2.status !== "PASS" || run.phases.PHASE_2.planModeConflicts.length !== 0) throw new Error("ed15-overlay-adjudication-phase-2-not-pass");
  run = carryPriorGenerationLedger(run, previousRun, historicalAuditShas);
  run.decisionContract = rehashDecisionContract(run, adjudication);
  run.phases.PHASE_1 = {...run.phases.PHASE_1, decisionContractSha256: run.decisionContract.decisionContractSha256, nextAction: ED15_DUAL_GAP_OVERLAY_NEXT_ACTION};
  run.artDirectionContract = {...run.artDirectionContract, inputHashes: {...run.artDirectionContract.inputHashes, decisionContractSha256: run.decisionContract.decisionContractSha256}, nextAction: ED15_DUAL_GAP_OVERLAY_NEXT_ACTION};
  run.phases.PHASE_2 = {...run.phases.PHASE_2, inputHashes: {...run.phases.PHASE_2.inputHashes, decisionContractSha256: run.decisionContract.decisionContractSha256}, nextAction: ED15_DUAL_GAP_OVERLAY_NEXT_ACTION};
  run.phases.PHASE_3 = {
    ...run.phases.PHASE_3,
    status: "READY",
    generationAllowed: false,
    generationDispatched: false,
    targetShotIds: ["ED-15"],
    nextAction: ED15_DUAL_GAP_OVERLAY_NEXT_ACTION,
    failureReasons: [],
  };
  run.phases.PHASE_4 = {
    ...run.phases.PHASE_4,
    status: "BLOCKED",
    failureReasons: ["ED15_DUAL_GAP_OVERLAY_REPAIR_NOT_DISPATCHED", "WHOLE_FILM_STATIC_BOARD_REQUIRES_14_OF_14_PASS"],
    nextAction: ED15_DUAL_GAP_OVERLAY_NEXT_ACTION,
  };
  run.overallStatus = "ED15_DUAL_GAP_OVERLAY_REPAIR_READY";
  run.nextAction = ED15_DUAL_GAP_OVERLAY_NEXT_ACTION;
  return {...run, maturityRunSha256: sha256({...run, maturityRunSha256: undefined})};
}

export function runEd15OverlayTaxonomyAdjudication({now = new Date().toISOString()} = {}) {
  const previousRun = fs.existsSync(maturityPath) ? readJson(maturityPath) : null;
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const existing = before.production.shotIntelligence?.goldenFilmVisualDecisionAdjudication;
  const ed15Plan = before.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-15");
  const repairManifestState = fs.existsSync(repairPath) ? readJson(repairPath) : null;
  const ed15Repair = repairManifestState?.entries?.find((entry) => entry.shotId === "ED-15");
  const historicalAudit = fs.existsSync(actualPixelAuditPath) ? readJson(actualPixelAuditPath) : null;
  const historicalAuditCount = new Set((historicalAudit?.audits || []).map((item) => item.artifactSha256).filter(Boolean)).size;
  if (existing?.decision === "KEEP_PRESENTER_AWARE_OVERLAY"
    && existing?.visiblePhrases?.join("|") === ED15_VISIBLE_PHRASES.join("|")
    && ed15Plan?.typographyVisualContract?.contract === "A1PresenterAwareDualGapTypographyActor/v1"
    && ed15Repair?.planSha256 === ed15Plan.planSha256
    && Number(before.production.shotIntelligence.goldenFilmVisualSystemMaturity?.historicalGeneratedCount || previousRun?.imageLedger?.historicalGeneratedCount || 0) >= historicalAuditCount
    && ((previousRun?.overallStatus === "ED15_DUAL_GAP_OVERLAY_REPAIR_READY"
      && previousRun?.nextAction === ED15_DUAL_GAP_OVERLAY_NEXT_ACTION)
      || (previousRun?.overallStatus === "ED15_OVERLAY_PRIMITIVE_SWITCH_EXHAUSTED"
        && previousRun?.nextAction === "REAUTHOR_ED15_OVERLAY_TAXONOMY_OR_ACCEPT_NO_PACKAGE")
      || (previousRun?.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_READY"
        && previousRun?.nextAction === "DISPATCH_ED15_OVERLAY_TAXONOMY_REAUTHOR_WAVE_MAX_2")
      || (previousRun?.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_EXHAUSTED"
        && previousRun?.nextAction === "ACCEPT_ED15_NO_PACKAGE_OR_USER_REWRITE_SOURCE"))) {
    return {noop: true, workspace: before, adjudication: existing, maturityRun: previousRun, recompile: {noop: true}, repair: {noop: true}, sync: {noop: true}};
  }
  const recompile = runGoldenFilmCurrentPlanContextRecompile({now});
  const repair = runCreatorPaletteBoundRepair({now});
  const afterRepair = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const plan = afterRepair.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-15");
  const adjudication = buildAdjudication(afterRepair, plan, {now});
  const workspaceCommit = addAdjudicationToWorkspace(adjudication, {now});
  const currentWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const maturityRun = buildAdjudicatedMaturityRun(currentWorkspace, previousRun, adjudication, {now});
  const persistedMaturity = persistGoldenFilmVisualSystemMaturityRun(maturityRun);
  const sync = syncGoldenFilmMaturityAuthority({now});
  const finalWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  return {noop: false, recompile, repair, workspaceCommit, adjudication, maturityRun, persistedMaturity, sync, workspace: finalWorkspace};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runEd15OverlayTaxonomyAdjudication();
  console.log(JSON.stringify({
    status: result.noop ? "NOOP_ALREADY_CURRENT" : "PASS",
    noop: result.noop,
    decision: result.adjudication.decision,
    lane: result.adjudication.lane,
    laneCRequired: result.adjudication.laneCRequired,
    visiblePhrases: result.adjudication.visiblePhrases,
    maturityStatus: result.maturityRun.overallStatus,
    nextAction: result.maturityRun.nextAction,
    maturityRunSha256: result.maturityRun.maturityRunSha256,
    workspaceSha256: result.workspace.workspaceSha256,
    queue: result.workspace.production.generation.summary,
    workerStatus: result.workspace.production.generation.workerStatus,
    assemblyCount: (result.workspace.production.shotIntelligence.currentAssembly || []).length,
    imageGenerationPerformed: false,
  }, null, 2));
}
