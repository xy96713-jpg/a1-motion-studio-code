#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {persistGoldenFilmVisualSystemMaturityRun} from "./run-golden-film-visual-system-maturity-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {syncGoldenFilmMaturityAuthority} from "./sync-golden-film-maturity-authority-v1.mjs";

export const ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION = "DISPATCH_ED15_OVERLAY_TAXONOMY_REAUTHOR_WAVE_MAX_2";
export const ED15_OVERLAY_TAXONOMY_REAUTHOR_ID = "presenter-aware-dual-gap-type-lockup";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

export function prepareEd15OverlayTaxonomyReauthor({now = new Date().toISOString()} = {}) {
  const workspace = readProjectWorkspace(appRoot);
  const current = JSON.parse(fs.readFileSync(maturityPath, "utf8"));
  if (current.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_READY" && current.nextAction === ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION) {
    const aligned = current.decisionContract?.nextAction === ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION
      && current.artDirectionContract?.nextAction === ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION
      && current.phases?.PHASE_1?.nextAction === ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION
      && current.phases?.PHASE_2?.nextAction === ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION;
    if (aligned) return {noop: true, maturityRun: current, sync: {noop: true}};
    const next = structuredClone(current);
    next.decisionContract = {...next.decisionContract, nextAction: ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION};
    next.artDirectionContract = {...next.artDirectionContract, nextAction: ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION};
    next.phases.PHASE_1 = {...next.phases.PHASE_1, nextAction: ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION};
    next.phases.PHASE_2 = {...next.phases.PHASE_2, nextAction: ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION};
    next.generatedAt = now;
    next.maturityRunSha256 = sha256({...next, maturityRunSha256: undefined});
    const persisted = persistGoldenFilmVisualSystemMaturityRun(next);
    const sync = syncGoldenFilmMaturityAuthority({now});
    return {noop: false, maturityRun: next, persisted, sync};
  }
  if (current.overallStatus !== "ED15_OVERLAY_PRIMITIVE_SWITCH_EXHAUSTED"
    || current.phases?.PHASE_3?.status !== "ACTUAL_PIXEL_AUDIT_WITH_REJECTIONS"
    || current.nextAction !== "REAUTHOR_ED15_OVERLAY_TAXONOMY_OR_ACCEPT_NO_PACKAGE"
    || !current.phases?.PHASE_3?.visualPrimitiveSwitch?.toPrimitive) {
    throw new Error("ed15-overlay-taxonomy-reauthor-requires-exhausted-primitive-switch");
  }
  if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") throw new Error("ed15-overlay-taxonomy-reauthor-requires-frozen-idle-runtime");
  if ((workspace.production.shotIntelligence.currentAssembly || []).length) throw new Error("ed15-overlay-taxonomy-reauthor-assembly-must-remain-empty");

  const priorGeneratedShas = [...new Set([
    ...(current.imageLedger?.historicalGeneratedShas || []),
    ...(current.imageLedger?.newGeneratedShas || []),
  ])];
  const next = structuredClone(current);
  next.generatedAt = now;
  next.phases.PHASE_3 = {
    ...next.phases.PHASE_3,
    status: "READY",
    generationAllowed: false,
    generationDispatched: false,
    targetShotIds: ["ED-15"],
    queuedJobIds: [],
    newGeneratedShas: [],
    newGeneratedCount: 0,
    failureReasons: [],
    nextAction: ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION,
    repairAttempt: 3,
    taxonomyReauthor: {
      contract: "A1GoldenFilmVisualSystemMaturityTaxonomyReauthor/v1",
      status: "READY",
      shotId: "ED-15",
      fromPrimitive: current.phases.PHASE_3.visualPrimitiveSwitch.toPrimitive,
      toPrimitive: ED15_OVERLAY_TAXONOMY_REAUTHOR_ID,
      canonicalMode: {assemblyMode: "OVERLAY", presentationMode: "OVERLAY", frameOccupation: "OVERLAY", baseVisualCarrier: "PRESENTER_BASE"},
      rationale: "The first primitive switch produced one compact geometry-safe candidate with one OCR glyph error and one exact-copy candidate that ignored the measured region. Reauthor the type actor as a single bounded lockup with two exact phrase strips, keeping the presenter-aware OVERLAY contract and changing topology, scale policy, and glyph-lock instructions together.",
      constraints: ["PRESENTER_AWARE_OVERLAY", "TRUE_TRANSPARENT_PNG", "EXACT_SIMPLIFIED_CHINESE_COPY", "ACTUAL_HOLD_FRAME_COMPOSITE", "CURRENT_AESTHETIC_GATE", "NO_FURTHER_AUTOMATIC_GENERATION_AFTER_THIS_WAVE"],
      previousAttempt: {
        maturityRunSha256: current.maturityRunSha256,
        status: current.overallStatus,
        nextAction: current.nextAction,
        newGeneratedShas: [...(current.phases?.PHASE_3?.newGeneratedShas || [])],
        failureReasons: [...(current.phases?.PHASE_3?.failureReasons || [])],
      },
    },
  };
  next.phases.PHASE_4 = {
    ...next.phases.PHASE_4,
    status: "BLOCKED",
    boardRebuilt: false,
    failureReasons: ["ED15_OVERLAY_TAXONOMY_REAUTHOR_NOT_DISPATCHED", "WHOLE_FILM_STATIC_BOARD_REQUIRES_14_OF_14_PASS"],
    nextAction: ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION,
  };
  next.imageLedger = {
    ...next.imageLedger,
    historicalGeneratedShas: priorGeneratedShas,
    historicalGeneratedCount: priorGeneratedShas.length,
    newGeneratedShas: [],
    newGeneratedCount: 0,
    generationDispatched: false,
    taxonomyReauthorAttempt: 1,
    goodPngShaChanged: false,
  };
  next.overallStatus = "ED15_OVERLAY_TAXONOMY_REAUTHOR_READY";
  next.nextAction = ED15_OVERLAY_TAXONOMY_REAUTHOR_NEXT_ACTION;
  next.runtimeFreeze = {...next.runtimeFreeze, queue: 0, running: 0, workerStatus: "frozen", assemblyCount: 0, assemblyCreationAllowed: false};
  next.maturityRunSha256 = sha256({...next, maturityRunSha256: undefined});
  const persisted = persistGoldenFilmVisualSystemMaturityRun(next);
  const sync = syncGoldenFilmMaturityAuthority({now});
  return {noop: false, maturityRun: next, persisted, sync};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = prepareEd15OverlayTaxonomyReauthor();
  console.log(JSON.stringify({
    status: result.noop ? "NOOP_ALREADY_CURRENT" : "PASS",
    noop: result.noop,
    maturityRunSha256: result.maturityRun.maturityRunSha256,
    maturityStatus: result.maturityRun.overallStatus,
    nextAction: result.maturityRun.nextAction,
    taxonomyReauthor: result.maturityRun.phases.PHASE_3.taxonomyReauthor,
    workspaceSha256: readProjectWorkspace(appRoot).workspaceSha256,
  }, null, 2));
}
