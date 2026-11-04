#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(sourceRoot, "whole-film-carrier-rhythm-candidate-v1");
const workspacePath = path.join(sourceRoot, "workspace.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const coveragePath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/shot-visual-coverage-plan-v1.json");
const openingPath = path.join(sourceRoot, "opening-nine-carrier-rhythm-canary-v1/manifest.json");
const midfilmPath = path.join(sourceRoot, "midfilm-eleven-carrier-rhythm-canary-v1/manifest.json");
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const relative = (filePath) => path.relative(root, filePath);
const atomicWriteJson = (filePath, value) => {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
const opening = JSON.parse(fs.readFileSync(openingPath, "utf8"));
const midfilm = JSON.parse(fs.readFileSync(midfilmPath, "utf8"));
const authorityBefore = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
const boardItems = workspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items;
const canaryCarrierByShotId = new Map([...opening.entries, ...midfilm.entries].map((entry) => [entry.shotId, entry.candidateCarrier]));
const explicitCarrier = {
  "ED-10": "PRESENTER_BASE",
  "ED-11": "PRESENTER_BASE",
  "ED-12": "SOURCE_BOUND_EXPLAINER",
  "ED-13": "PRESENTER_JUDGMENT_OVERLAY",
  "ED-14": "FULLSCREEN_SOURCE_EVIDENCE_TAKEOVER",
  "ED-15": "PRESENTER_BASE",
  "ED-16": "MINIMAL_ELEMENT_EXPLAINER",
  "ED-17": "PRESENTER_BASE",
  "ED-18": "PRESENTER_BASE",
  "ED-19": "PRESENTER_PROCESS_ANCHOR",
  "ED-31": "PRESENTER_CONCLUSION_OVERLAY",
  "ED-32": "PRESENTER_BASE",
  "ED-33": "PRESENTER_BASE",
  "ED-34": "FULLSCREEN_TITLE_CONCLUSION",
};
const familyOf = (carrier) => {
  if (carrier.includes("SCREEN_EVIDENCE_CARD")) return "SCREEN_EVIDENCE_CARD";
  if (carrier.includes("PRESENTER_SCREEN") || carrier.includes("SCREEN_PRESENTER")) return "PRESENTER_SCREEN_HYBRID";
  if (carrier.includes("FULLSCREEN_SCREEN")) return "FULLSCREEN_SCREEN";
  if (carrier.includes("EXPLAINER")) return "EXPLAINER";
  if (carrier.includes("TITLE")) return "FULLSCREEN_TITLE";
  if (/(IDENTITY_OVERLAY|JUDGMENT_RESET|JUDGMENT_OVERLAY|PROCESS_ANCHOR|CONCLUSION_OVERLAY)/u.test(carrier)) return "PRESENTER_PACKAGE_ANCHOR";
  if (carrier.includes("PRESENTER")) return "PRESENTER";
  if (carrier.includes("SOURCE_EVIDENCE")) return "SOURCE_EVIDENCE";
  return "OTHER";
};
const plans = boardItems.map((item) => {
  const candidateCarrier = canaryCarrierByShotId.get(item.shotId) || explicitCarrier[item.shotId];
  if (!candidateCarrier) throw new Error(`whole-film-carrier-missing:${item.shotId}`);
  const currentCoverage = coverage.shotPlans.find((shot) => shot.shotId === item.shotId);
  const screenEvidenceRequired = currentCoverage?.route === "SCREEN_EVIDENCE";
  const evidencePreserved = !screenEvidenceRequired || /SCREEN|EVIDENCE/u.test(candidateCarrier);
  return {
    shotId: item.shotId,
    timeRange: item.timeRange,
    sourceText: item.sourceText,
    semanticRoute: currentCoverage?.route || null,
    currentBoardRoute: item.route,
    candidateCarrier,
    carrierFamily: familyOf(candidateCarrier),
    screenEvidenceRequired,
    evidencePreserved,
    presentationPrinciple: screenEvidenceRequired
      ? candidateCarrier.includes("FULLSCREEN_SCREEN")
        ? "THE_OPERATION_ITSELF_IS_PRIMARY"
        : candidateCarrier.includes("CARD")
          ? "THE_RESULT_OR_VERSION_STATE_IS_PRIMARY_BUT_DOES_NOT_REQUIRE_FULL_BLEED"
          : "THE_PRESENTER_CARRIES_THE_JUDGMENT_WHILE_THE_REAL_OPERATION_REMAINS_VISIBLE"
      : "USE_THE_CURRENT_SEMANTIC_PACKAGE_OR_PRESENTER_CARRIER",
  };
});
const runs = [];
for (const plan of plans) {
  const previous = runs.at(-1);
  if (previous?.family === plan.carrierFamily) previous.shotIds.push(plan.shotId);
  else runs.push({family: plan.carrierFamily, shotIds: [plan.shotId]});
}
const longestRun = Math.max(...runs.map((run) => run.shotIds.length));
const screenPlans = plans.filter((plan) => plan.screenEvidenceRequired);
const summary = {
  shotCount: plans.length,
  screenEvidenceShotCount: screenPlans.length,
  fullscreenScreenCount: screenPlans.filter((plan) => plan.carrierFamily === "FULLSCREEN_SCREEN").length,
  presenterScreenHybridCount: screenPlans.filter((plan) => plan.carrierFamily === "PRESENTER_SCREEN_HYBRID").length,
  screenEvidenceCardCount: screenPlans.filter((plan) => plan.carrierFamily === "SCREEN_EVIDENCE_CARD").length,
  fullscreenTitleCount: plans.filter((plan) => plan.carrierFamily === "FULLSCREEN_TITLE").length,
  longestSameCarrierFamilyRun: longestRun,
};
const authorityAfter = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) throw new Error("whole-film-carrier-mutated-authority");
const reportBody = {
  contract: "A1WholeFilmCarrierRhythmCandidate/v1",
  status: "SYSTEM_DIRECTION_PLAN_READY_CANDIDATE_ONLY",
  policy: {
    evidenceRequirementDoesNotImplyFullscreen: true,
    maximumConsecutiveSameCarrierFamily: 2,
    fullscreenScreenWhen: "THE_OPERATION_ITSELF_IS_THE_SEMANTIC_ACTOR",
    presenterScreenWhen: "THE_PRESENTER_EXPLAINS_A_JUDGMENT_ABOUT_A_VISIBLE_OPERATION",
    evidenceCardWhen: "A_RESULT_OR_VERSION_STATE_MUST_REMAIN_VERIFIABLE_WITHOUT_FULL_BLEED",
    backgroundRule: "ONLY_USER_ACCEPTED_TEXTURE_CROPS_WITHOUT_GENERATED_TEXT",
    formalTextRule: "LOCAL_EDITABLE_HASH_BOUND_TYPE_ONLY",
  },
  sourceBindings: {
    workspace: {path: relative(workspacePath), sha256: authorityBefore.workspaceSha256},
    phase: {path: relative(phasePath), sha256: authorityBefore.phaseSha256},
    coverage: {path: relative(coveragePath), sha256: sha256File(coveragePath)},
    openingCanary: {path: relative(openingPath), sha256: sha256File(openingPath), candidateBoardSha256: opening.outputs.candidateBoard.sha256},
    midfilmCanary: {path: relative(midfilmPath), sha256: sha256File(midfilmPath), candidateBoardSha256: midfilm.outputs.candidateBoard.sha256},
  },
  summary,
  runs,
  plans,
  checks: {
    allThirtyFourShotsCovered: plans.length === 34,
    allSixteenScreenEvidenceShotsPreserved: screenPlans.length === 16 && screenPlans.every((plan) => plan.evidencePreserved),
    fullscreenScreenNoLongerDefault: summary.fullscreenScreenCount < summary.screenEvidenceShotCount,
    maximumCarrierRunPass: longestRun <= 2,
    exactlyTwoFullscreenTitleAnchors: summary.fullscreenTitleCount === 2,
    currentAuthorityMutated: false,
  },
  boundary: {candidateOnly: true, canonicalSelectionMutated: false, currentAuthorityMutated: false, motionProduced: false, resolveWritten: false, finalRender: false, userVisualApproval: "NOT_APPROVED"},
};
const report = {...reportBody, reportSha256: sha256Value(reportBody)};
fs.mkdirSync(outputRoot, {recursive: true});
atomicWriteJson(path.join(outputRoot, "plan.json"), report);
console.log(JSON.stringify({status: report.status, summary, outputPath: relative(path.join(outputRoot, "plan.json")), reportSha256: report.reportSha256, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"}, null, 2));
