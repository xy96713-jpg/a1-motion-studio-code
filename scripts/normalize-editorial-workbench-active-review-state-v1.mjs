#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  isShotCandidateSetReviewable,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const publicPhaseRoot = path.join(appRoot, "public", phaseRelative);
const artifactPhaseRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const now = new Date().toISOString();

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const policySha256 = current.visualBible?.visualGenerationPolicy?.sha256;
if (!policySha256) throw new Error("active-visual-policy-required");

const activeShotAssets = current.library.assets.filter((asset) => asset.route === "shot-composition"
  && asset.shotDemand
  && isShotCandidateSetReviewable(asset)
  && asset.candidates.every((candidate) => candidate.sceneGraph?.visualPolicy?.sha256 === policySha256));
const activeShotIds = new Set(activeShotAssets.map((asset) => asset.shotDemand.shotId));
const shotReports = current.production.maturityLoop?.shotReports || {};
const retainedShotReports = Object.fromEntries(Object.entries(shotReports).filter(([shotId, report]) => {
  const asset = activeShotAssets.find((item) => item.shotDemand.shotId === shotId);
  return Boolean(asset?.visualCritic
    && report.reportSha256 === asset.visualCritic.reportSha256
    && report.sourceRenderSha256 === asset.visualCritic.sourceRenderSha256);
}));
const removedShotReports = Object.fromEntries(Object.entries(shotReports).filter(([shotId]) => !Object.hasOwn(retainedShotReports, shotId)));
const retainedReportHashes = new Set(Object.values(retainedShotReports).map((report) => report.reportSha256));
const operation = current.production?.operationOrchestration || null;
const operationReports = current.production.maturityLoop?.operationReports || {};
const operationShotActive = Boolean(operation?.currentShotId && activeShotIds.has(operation.currentShotId));
const operationReport = operationShotActive ? operationReports[operation.currentShotId] : null;
const operationReportCurrent = Boolean(operationReport
  && operation?.preview?.sha256
  && operation?.visualReview?.sourceProofSha256 === operation.preview.sha256
  && operationReport.sourceProofSha256 === operation.preview.sha256
  && operationReport.reportSha256 === operation.visualReview?.reportSha256);
const retainedOperationReports = operationReportCurrent ? {[operation.currentShotId]: operationReport} : {};
const removedOperationReports = Object.fromEntries(Object.entries(operationReports).filter(([shotId]) => !Object.hasOwn(retainedOperationReports, shotId)));
const rounds = current.production.maturityLoop?.rounds || [];
const retainedRounds = rounds.filter((round) => {
  if (round.targetType === "screen-operation-sequence") {
    const report = retainedOperationReports[round.targetId];
    return Boolean(report && report.reportSha256 === round.reportSha256 && report.sourceProofSha256 === round.sourceProofSha256);
  }
  if (!String(round.targetType || "").startsWith("shot-frame") && round.targetType !== "representative-motion") return true;
  return activeShotIds.has(round.targetId) && retainedReportHashes.has(round.reportSha256);
});
const removedRounds = rounds.filter((round) => !retainedRounds.includes(round));
const previousRepresentativeMotionReport = current.production.maturityLoop?.representativeMotionReport || null;
const previousMediumRhythmRevision = current.production.maturityLoop?.mediumRhythmRevision || null;
const previousAllShotSelectedReview = current.production.maturityLoop?.allShotSelectedReview || null;

const quarantineRoot = path.join(root, ".codex-artifacts/quarantine", `editorial-workbench-active-state-pruned-${current.workspaceSha256.slice(0, 12)}`);
const residueNames = [
  "reference-pixel-parity-v1",
  "article-pixel-typography-imagegen-v1",
  "article-pixel-typography-imagegen-v2",
  "ui-proof-34-shot-demands.png",
  "ui-proof-real-sources.png",
  "ui-proof-visual-bible.png",
];
const existingResidueCount = [["public", publicPhaseRoot], ["artifact", artifactPhaseRoot]]
  .flatMap(([, sourceRoot]) => residueNames.map((name) => path.join(sourceRoot, name)))
  .filter((file) => fs.existsSync(file)).length;
const normalizationRequired = Object.keys(removedShotReports).length > 0
  || Object.keys(removedOperationReports).length > 0
  || Boolean(operation && !operationReportCurrent && operation.status !== "locked-upstream-revision")
  || removedRounds.length > 0
  || Boolean(previousRepresentativeMotionReport)
  || Boolean(previousMediumRhythmRevision)
  || Boolean(previousAllShotSelectedReview)
  || existingResidueCount > 0;
if (!normalizationRequired) {
  console.log(JSON.stringify({
    contract: "A1EditorialWorkbenchActiveReviewNormalization/v1",
    status: "NOOP_ALREADY_NORMALIZED",
    workspaceSha256: current.workspaceSha256,
    policySha256,
    activeShotIds: [...activeShotIds],
  }, null, 2));
  process.exit(0);
}
const movedResidue = [];

for (const [lane, sourceRoot] of [["public", publicPhaseRoot], ["artifact", artifactPhaseRoot]]) {
  for (const name of residueNames) {
    const source = path.join(sourceRoot, name);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(quarantineRoot, `${lane}-residue`, name);
    if (fs.existsSync(destination)) throw new Error(`active-state-quarantine-destination-exists:${destination}`);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.renameSync(source, destination);
    movedResidue.push({lane, name, source: path.relative(root, source), destination: path.relative(root, destination)});
  }
}

const archive = {
  contract: "A1EditorialWorkbenchPrunedReviewArchive/v1",
  status: "QUARANTINED_RECOVERABLE",
  archivedAt: now,
  sourceWorkspaceSha256: current.workspaceSha256,
  activeVisualPolicySha256: policySha256,
  activeShotIds: [...activeShotIds],
  removedShotReports,
  removedOperationReports,
  previousOperationOrchestration: operationReportCurrent ? null : operation,
  removedRounds,
  previousRepresentativeMotionReport,
  previousMediumRhythmRevision,
  previousAllShotSelectedReview,
  movedResidue,
  deleted: false,
  recoverable: true,
};
fs.mkdirSync(quarantineRoot, {recursive: true});
fs.writeFileSync(path.join(quarantineRoot, "pruned-active-review-state.json"), `${JSON.stringify(archive, null, 2)}\n`, "utf8");

const result = withProjectLock(appRoot, () => {
  const lockedCurrent = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (lockedCurrent.workspaceSha256 !== current.workspaceSha256) throw new Error("workspace-changed-during-active-state-normalization");
  const next = structuredClone(lockedCurrent);
  next.production.maturityLoop.shotReports = retainedShotReports;
  next.production.maturityLoop.operationReports = retainedOperationReports;
  next.production.maturityLoop.rounds = retainedRounds;
  if (next.production.operationOrchestration && !operationReportCurrent) {
    next.production.operationOrchestration = {
      ...next.production.operationOrchestration,
      status: "locked-upstream-revision",
      preview: null,
      visualReview: null,
      gates: {
        ...next.production.operationOrchestration.gates,
        previewAllowed: false,
        acceptedShotIrAllowed: false,
        renderAllowed: false,
      },
      nextAction: "rebuild-operation-proof-after-current-shot-admission",
    };
  }
  next.production.maturityLoop.representativeMotionReport = null;
  next.production.maturityLoop.mediumRhythmRevision = null;
  next.production.maturityLoop.allShotSelectedReview = null;
  next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || []).filter((shotId) => activeShotIds.has(shotId));
  next.production.maturityLoop.status = "visual-revision-required";
  next.production.maturityLoop.currentStage = "shot-candidates";
  const operationShot = activeShotAssets.find((asset) => asset.sceneGraph?.operationTraceBinding || asset.candidates?.some((candidate) => candidate.sceneGraph?.operationTraceBinding));
  next.production.maturityLoop.nextAction = operationShot
    ? `继续审片 ${operationShot.shotDemand.shotId} 的真实操作三态与 causal motion proof；当前候选仍未批准`
    : "返修 ED-01 静态候选至 ≥22/24；当前候选未达到参考成熟度，禁止用户采用与动效";
  next.production.maturityLoop.lastTickAt = now;
  next.production.maturityLoop.updatedAt = now;

  const event = createProductionEvent({
    workspace: lockedCurrent,
    action: "active-review-state-normalized",
    targetId: lockedCurrent.production.project.projectId,
    payload: {
      activeShotIds: [...activeShotIds],
      retainedShotReportCount: Object.keys(retainedShotReports).length,
      removedShotReportCount: Object.keys(removedShotReports).length,
      retainedOperationReportCount: Object.keys(retainedOperationReports).length,
      removedOperationReportCount: Object.keys(removedOperationReports).length,
      retainedRoundCount: retainedRounds.length,
      removedRoundCount: removedRounds.length,
      movedResidueCount: movedResidue.length,
      quarantineRoot: path.relative(root, quarantineRoot),
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const report = {
    contract: "A1EditorialWorkbenchActiveReviewNormalization/v1",
    status: "PASS",
    normalizedAt: now,
    sourceWorkspaceSha256: lockedCurrent.workspaceSha256,
    resultWorkspaceSha256: recalculated.workspaceSha256,
    policySha256,
    activeShotIds: [...activeShotIds],
    retainedShotReportCount: Object.keys(retainedShotReports).length,
    removedShotReportCount: Object.keys(removedShotReports).length,
    retainedOperationReportCount: Object.keys(retainedOperationReports).length,
    removedOperationReportCount: Object.keys(removedOperationReports).length,
    retainedRoundCount: retainedRounds.length,
    removedRoundCount: removedRounds.length,
    movedResidueCount: movedResidue.length,
    quarantineRoot: path.relative(root, quarantineRoot),
    deleted: false,
  };
  persistProjectState(appRoot, recalculated, {event, files: {"active-review-normalization-v1-latest.json": report}});
  return {workspace: recalculated, report};
});

console.log(JSON.stringify(result.report, null, 2));
