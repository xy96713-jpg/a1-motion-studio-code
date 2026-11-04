#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalCreatorPackagingSequence, assertCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {applySemanticTimelineToDecisionSet} from "../apps/studio-next/src/lib/a1-semantic-timeline-decision-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const ED15_NO_PACKAGE_ADJUDICATION_CONTRACT = "A1ED15NoPackageAdjudication/v1";
export const ED15_NO_PACKAGE_ADJUDICATION_ID = "ed15-no-package-after-bounded-overlay-exhaustion-20260809-v1";
export const ED15_NO_PACKAGE_REASON = "ED15_AUTO_NO_PACKAGE_AFTER_BOUNDED_OVERLAY_EXHAUSTION";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;

function sequenceSha(sequence) {
  const identity = structuredClone(sequence);
  delete identity.sequenceSha256;
  delete identity.createdAt;
  delete identity.updatedAt;
  return sha256(identity);
}

function buildAdjudication(before, maturity, now) {
  const previousSequence = before.production.canonicalCreatorPackagingSequence;
  const previousDecision = previousSequence.decisions.find((item) => item.shotId === "ED-15");
  const failedShas = [
    ...(maturity?.imageLedger?.historicalGeneratedShas || []),
    ...(maturity?.imageLedger?.newGeneratedShas || []),
  ];
  const failureReasons = [...new Set(maturity?.phases?.PHASE_3?.failureReasons || [
    "OCR_EXACT_COPY_MISMATCH",
    "visible-overlay-outside-available-region",
    "OVERLAY_ALPHA_REQUIRED",
    "WARM_CREAM_DOMINANT_FIELD",
  ])];
  return {
    contract: ED15_NO_PACKAGE_ADJUDICATION_CONTRACT,
    id: ED15_NO_PACKAGE_ADJUDICATION_ID,
    status: "PASS",
    current: true,
    shotId: "ED-15",
    decision: "NO_PACKAGE",
    route: "PRESENTER_BASE",
    reason: ED15_NO_PACKAGE_REASON,
    semanticRationale: "真实 hold frame 的可用负空间不足以承载完整句；三轮不同 Overlay 原语仍未同时通过严格 OCR、实际几何、透明度与当前审美门禁。该句回到人物口播，由 presenter base 承担，不硬造一个不合格标题图。",
    previousDecision: {
      packageDecision: previousDecision?.packageDecision || null,
      contentTreatment: previousDecision?.contentTreatment || null,
      frameOccupation: previousDecision?.frameOccupation || null,
      assemblyMode: previousDecision?.assemblyMode || null,
      presentationMode: previousDecision?.presentationMode || null,
      decisionSha256: previousDecision?.decisionSha256 || null,
      informationGainScore: previousDecision?.semanticSignals?.informationGainScore ?? null,
    },
    boundedEvidence: {
      candidateCount: failedShas.length,
      candidateShas: [...new Set(failedShas)],
      failureReasons,
      generationWaveClosed: true,
      imageGenerationPerformedByAdjudication: false,
      sourcePngShaChanged: false,
      exactHoldFrameSha256: "ccb19f607bf6de09ad93f2bc2946381785c69f01ee621c16f1730892953d9d15",
      availableRegion: {x: 0.04, y: 0.06, width: 0.29, height: 0.26},
      strictGate: "OCR_EXACT_COPY_AND_ACTUAL_PIXEL_GEOMETRY_REQUIRED",
    },
    nextAction: "RECOMPILE_CURRENT_PLAN_CONTEXT_AND_PALETTE_BINDING",
    adjudicatedAt: now,
  };
}

function updateOverride(overrides, adjudication) {
  const entries = (overrides.entries || []).map((entry) => {
    if (entry.shotId !== "ED-15") return entry;
    const next = {...entry};
    delete next.aestheticSubfamily;
    return {
      ...next,
      packageDecision: "NO_PACKAGE",
      contentTreatment: "PRESENTER",
      frameOccupation: "CLEAN_BASE",
      rhythmRole: "QUESTION",
      reason: ED15_NO_PACKAGE_REASON,
      adjudication,
    };
  });
  return {...overrides, entries};
}

function updateSequence(sequence, adjudication, now) {
  const next = {...sequence, adjudication, updatedAt: now};
  next.sequenceSha256 = sequenceSha(next);
  return assertCanonicalCreatorPackagingSequence(next, {expectedShotCount: 34});
}

function updateDecisionSet(decisionSet, beats, adjudication, sourceHash, now) {
  const seeded = {
    ...decisionSet,
    items: decisionSet.items.map((item) => item.shotId === "ED-15"
      ? {
          ...item,
          packageDecision: "NO_PACKAGE",
          packageReason: ED15_NO_PACKAGE_REASON,
          whyPackagingBeatsNoPackage: null,
          valueAdded: 0,
          assemblyMode: null,
          presentationMode: null,
          presentationModeReason: null,
          whyPresentationModeBeatsOtherModes: null,
          assemblyModeReason: null,
          whyThisModeBeatsOtherModes: null,
          baseVisualCarrier: "PRESENTER_BASE",
          enhancementPackaging: "NONE",
          strongLanguageEvent: false,
          typographyTreatment: "NONE",
          typographyActor: false,
          protectedPhrases: [],
          typographyPolicy: null,
          semanticRouteOverride: "PRESENTER_BASE",
          ed15Adjudication: adjudication,
          decisionHash: undefined,
        }
      : item),
  };
  return applySemanticTimelineToDecisionSet(seeded, {beats, sourceHash, now});
}

function appendLedger(ledger, adjudication, now) {
  const history = [...(ledger?.history || [])];
  if (!history.some((item) => item.correctionId === adjudication.id)) {
    history.push({
      correctionId: adjudication.id,
      appliedAt: now,
      precedence: "EXPLICIT_CURRENT_SEMANTIC_ADJUDICATION",
      appendOnly: true,
      rationale: adjudication.semanticRationale,
      corrections: [{
        correctionId: adjudication.id,
        shotId: "ED-15",
        precedence: "EXPLICIT_CURRENT_SEMANTIC_ADJUDICATION",
        editMode: "presenter-clean",
        canonicalMedium: "presenter-clean",
        canonicalPackageDecision: "NO_PACKAGE",
        canonicalTypographyVisualRole: "NONE",
        rationale: adjudication.reason,
      }],
    });
  }
  return {
    ...(ledger || {contract: "A1CanonicalAuthorityCorrectionLedger/v1", version: 1, appendOnly: true, precedence: "EXPLICIT_USER_LOCKED_OVERRIDE"}),
    history,
    activeCorrectionId: adjudication.id,
    activeCorrectionSha256: sha256(history.at(-1)),
  };
}

export function adjudicateEd15NoPackage({now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const currentDecision = before.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === "ED-15");
    const existing = before.production.canonicalCreatorPackagingSequence.adjudication;
    if (currentDecision?.packageDecision === "NO_PACKAGE" && existing?.id === ED15_NO_PACKAGE_ADJUDICATION_ID && existing.status === "PASS") {
      if (before.production.shotIntelligence.canonicalStaticBoardAuthority?.canonicalPackageShotIds?.includes("ED-15")) {
        const next = structuredClone(before);
        next.production.shotIntelligence.canonicalStaticBoardAuthority = buildCanonicalStaticBoardScope(next);
        const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
        const event = createProductionEvent({workspace: before, action: "repair-ed15-canonical-static-board-scope", targetId: existing.id, payload: {contract: ED15_NO_PACKAGE_ADJUDICATION_CONTRACT, reason: "CANONICAL_STATIC_BOARD_SCOPE_REPROJECTED_AFTER_NO_PACKAGE_ADJUDICATION", imageGenerationPerformed: false, assemblyCreated: false}, now});
        recalculated.production.eventLedger.eventCount += 1;
        recalculated.production.eventLedger.lastEventId = event.eventId;
        recalculated.production.eventLedger.lastEventAt = event.createdAt;
        const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256, files: {"golden-film-visual-system-maturity-v1/ed15-no-package-adjudication.json": {contract: `${ED15_NO_PACKAGE_ADJUDICATION_CONTRACT}ScopeRepair`, status: "PASS", adjudicationId: existing.id, workspaceSha256Before: before.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, canonicalStaticBoardAuthority: recalculated.production.shotIntelligence.canonicalStaticBoardAuthority, imageGenerationPerformed: false, generatedAt: now}}});
        const committedWorkspace = readProjectWorkspace(appRoot);
        return {noop: false, scopeRepair: true, workspace: committedWorkspace, adjudication: existing, sequence: committedWorkspace.production.canonicalCreatorPackagingSequence};
      }
      return {noop: true, workspace: before, adjudication: existing, sequence: before.production.canonicalCreatorPackagingSequence};
    }
    if (currentDecision?.packageDecision !== "PACKAGE") throw new Error("ed15-no-package-adjudication-canonical-package-precondition-failed");
    if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("ed15-no-package-adjudication-requires-frozen-idle-runtime");
    if ((before.production.shotIntelligence.currentAssembly || []).length || before.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("ed15-no-package-adjudication-requires-assembly-lock");
    const maturity = readJson(maturityPath);
    if (maturity?.nextAction !== "ACCEPT_ED15_NO_PACKAGE_OR_USER_REWRITE_SOURCE") throw new Error(`ed15-no-package-adjudication-maturity-precondition-failed:${maturity?.nextAction || "MISSING"}`);
    const adjudication = buildAdjudication(before, maturity, now);
    const next = structuredClone(before);
    next.production.creatorPackagingProjectOverrides = updateOverride(next.production.creatorPackagingProjectOverrides, adjudication);
    const sequence = buildCanonicalCreatorPackagingSequence(next, {now});
    next.production.canonicalCreatorPackagingSequence = updateSequence(sequence, adjudication, now);
    next.production.canonicalAuthorityCorrectionLedger = appendLedger(next.production.canonicalAuthorityCorrectionLedger, adjudication, now);
    next.production.shotIntelligence.decisionSet = updateDecisionSet(
      next.production.shotIntelligence.decisionSet,
      next.production.packagingBeatPlan.semanticBeats,
      adjudication,
      next.article.sourceTextSha256,
      now,
    );
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    next.production.shotIntelligence.currentAssembly = [];
    next.production.shotIntelligence.canonicalStaticBoardAuthority = buildCanonicalStaticBoardScope(next);
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {
      ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      nextUserGate: "CURRENT_PLAN_CONTEXT_RECOMPILE",
    };
    const event = createProductionEvent({
      workspace: before,
      action: "adjudicate-ed15-no-package-v1",
      targetId: adjudication.id,
      payload: {
        contract: ED15_NO_PACKAGE_ADJUDICATION_CONTRACT,
        previousDecision: adjudication.previousDecision,
        nextDecision: "NO_PACKAGE",
        route: "PRESENTER_BASE",
        candidateShas: adjudication.boundedEvidence.candidateShas,
        imageGenerationPerformed: false,
        assemblyCreated: false,
        workerStartAllowed: false,
      },
      now,
    });
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const reportBase = {
      contract: `${ED15_NO_PACKAGE_ADJUDICATION_CONTRACT}Report`,
      status: "PASS",
      adjudication,
      workspaceSha256Before: before.workspaceSha256,
      workspaceSha256After: recalculated.workspaceSha256,
      sequenceSha256: recalculated.production.canonicalCreatorPackagingSequence.sequenceSha256,
      packageCountAfter: recalculated.production.canonicalCreatorPackagingSequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length,
      noPackageCountAfter: recalculated.production.canonicalCreatorPackagingSequence.decisions.filter((item) => item.packageDecision === "NO_PACKAGE").length,
      imageGenerationPerformed: false,
      sourcePngShaChanged: false,
      assemblyCreated: false,
      generatedAt: now,
    };
    const report = {...reportBase, reportSha256: sha256(reportBase)};
    const committed = persistProjectState(appRoot, recalculated, {
      event,
      expectedWorkspaceSha256: before.workspaceSha256,
      files: {"golden-film-visual-system-maturity-v1/ed15-no-package-adjudication.json": report},
    });
    const committedWorkspace = readProjectWorkspace(appRoot);
    return {noop: false, workspace: committedWorkspace, adjudication, sequence: committedWorkspace.production.canonicalCreatorPackagingSequence, report};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = adjudicateEd15NoPackage();
  console.log(JSON.stringify({status: result.noop ? "NOOP_ALREADY_CURRENT" : "PASS", noop: result.noop, workspaceSha256: result.workspace.workspaceSha256, sequenceSha256: result.sequence.sequenceSha256, packageCount: result.sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length, noPackageCount: result.sequence.decisions.filter((item) => item.packageDecision === "NO_PACKAGE").length, adjudicationId: result.adjudication.id, imageGenerationPerformed: false, assemblyCreated: false}, null, 2));
}
