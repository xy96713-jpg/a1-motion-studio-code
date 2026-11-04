#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {persistGoldenFilmVisualSystemMaturityRun} from "./run-golden-film-visual-system-maturity-v1.mjs";
import {syncGoldenFilmMaturityAuthority} from "./sync-golden-film-maturity-authority-v1.mjs";

export const ED15_OVERLAY_PRIMITIVE_SWITCH_NEXT_ACTION = "DISPATCH_ED15_OVERLAY_PRIMITIVE_SWITCH_WAVE_MAX_2";
export const ED15_OVERLAY_PRIMITIVE_SWITCH_ID = "presenter-aware-dual-gap-offset-wordforms";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

export function prepareEd15OverlayPrimitiveSwitch({now = new Date().toISOString()} = {}) {
  const workspace = readProjectWorkspace(appRoot);
  const current = JSON.parse(fs.readFileSync(maturityPath, "utf8"));
  if (current.overallStatus === "ED15_OVERLAY_PRIMITIVE_SWITCH_READY" && current.nextAction === ED15_OVERLAY_PRIMITIVE_SWITCH_NEXT_ACTION) {
    return {noop: true, maturityRun: current, sync: {noop: true}};
  }
  if (current.overallStatus !== "GENERATION_COMPLETE_AUDIT_BLOCKED"
    || current.phases?.PHASE_3?.status !== "ACTUAL_PIXEL_AUDIT_WITH_REJECTIONS"
    || current.nextAction !== "DISPATCH_ED15_DUAL_GAP_OVERLAY_REPAIR_WAVE_MAX_2"
    || Number(current.phases?.PHASE_3?.repairAttempt || 0) !== 1) {
    throw new Error("ed15-overlay-primitive-switch-requires-one-completed-structural-repair");
  }
  if (workspace.production.generation.summary.queued !== 0 || workspace.production.generation.summary.running !== 0 || workspace.production.generation.workerStatus !== "frozen") throw new Error("ed15-overlay-primitive-switch-requires-frozen-idle-runtime");
  if ((workspace.production.shotIntelligence.currentAssembly || []).length) throw new Error("ed15-overlay-primitive-switch-assembly-must-remain-empty");

  const priorGeneratedShas = [...new Set([
    ...(current.imageLedger?.historicalGeneratedShas || []),
    ...(current.imageLedger?.newGeneratedShas || []),
  ])];
  const previousAttempt = {
    maturityRunSha256: current.maturityRunSha256,
    status: current.overallStatus,
    nextAction: current.nextAction,
    newGeneratedShas: [...(current.phases?.PHASE_3?.newGeneratedShas || [])],
    failureReasons: [...(current.phases?.PHASE_3?.failureReasons || [])],
  };
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
    nextAction: ED15_OVERLAY_PRIMITIVE_SWITCH_NEXT_ACTION,
    repairAttempt: 2,
    visualPrimitiveSwitch: {
      contract: "A1GoldenFilmVisualSystemMaturityPrimitiveSwitch/v1",
      status: "READY",
      shotId: "ED-15",
      fromPrimitive: "presenter-aware-dual-gap-compact-two-line-actor",
      toPrimitive: ED15_OVERLAY_PRIMITIVE_SWITCH_ID,
      rationale: "The measured top-left region remains viable for two short actors, but the compact stacked typography topology failed exact Chinese OCR after one structural repair. Preserve OVERLAY and switch topology once; do not shrink, cover the presenter, or fall back to an opaque takeover.",
      constraints: ["PRESENTER_AWARE_OVERLAY", "TRUE_TRANSPARENT_PNG", "EXACT_SIMPLIFIED_CHINESE_COPY", "ACTUAL_HOLD_FRAME_COMPOSITE", "CURRENT_AESTHETIC_GATE"],
      previousAttempt,
    },
  };
  next.phases.PHASE_4 = {
    ...next.phases.PHASE_4,
    status: "BLOCKED",
    boardRebuilt: false,
    failureReasons: ["ED15_OVERLAY_PRIMITIVE_SWITCH_NOT_DISPATCHED", "WHOLE_FILM_STATIC_BOARD_REQUIRES_14_OF_14_PASS"],
    nextAction: ED15_OVERLAY_PRIMITIVE_SWITCH_NEXT_ACTION,
  };
  next.imageLedger = {
    ...next.imageLedger,
    historicalGeneratedShas: priorGeneratedShas,
    historicalGeneratedCount: priorGeneratedShas.length,
    newGeneratedShas: [],
    newGeneratedCount: 0,
    generationDispatched: false,
    primitiveSwitchAttempt: 1,
    goodPngShaChanged: false,
  };
  next.overallStatus = "ED15_OVERLAY_PRIMITIVE_SWITCH_READY";
  next.nextAction = ED15_OVERLAY_PRIMITIVE_SWITCH_NEXT_ACTION;
  next.runtimeFreeze = {...next.runtimeFreeze, queue: 0, running: 0, workerStatus: "frozen", assemblyCount: 0, assemblyCreationAllowed: false};
  next.maturityRunSha256 = sha256({...next, maturityRunSha256: undefined});
  const persisted = persistGoldenFilmVisualSystemMaturityRun(next);
  const sync = syncGoldenFilmMaturityAuthority({now});
  return {noop: false, maturityRun: next, persisted, sync};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = prepareEd15OverlayPrimitiveSwitch();
  console.log(JSON.stringify({
    status: result.noop ? "NOOP_ALREADY_CURRENT" : "PASS",
    noop: result.noop,
    maturityRunSha256: result.maturityRun.maturityRunSha256,
    maturityStatus: result.maturityRun.overallStatus,
    nextAction: result.maturityRun.nextAction,
    primitiveSwitch: result.maturityRun.phases.PHASE_3.visualPrimitiveSwitch,
    workspaceSha256: readProjectWorkspace(appRoot).workspaceSha256,
  }, null, 2));
}
