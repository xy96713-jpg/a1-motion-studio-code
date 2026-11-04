#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPixelEditorialTypographyAssignment} from "../apps/studio-next/src/lib/a1-pixel-editorial-typography-policy-v1.mjs";
import {bindPlanToReferenceSequences, restoreFullFrameScreenOperation} from "../apps/studio-next/src/lib/a1-reference-conditioned-director-v2.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const phasePublic = path.join(appRoot, "public", phaseRelative);
const currentRunPath = path.join(appRoot, "public/generated/system-line/current-project-visual-contract-upgrade-v1/current-article-run.json");
const publicDirectorPath = path.join(phasePublic, "whole-film-director-input.json");
const referenceCorpusPath = path.join(appRoot, "public/generated/system-line/reference-sequence-corpus-v2/corpus.json");
const {artifactDir} = projectDirs(appRoot);
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, typeof value === "string" || Buffer.isBuffer(value) ? value : jsonText(value), "utf8");
  fs.renameSync(temporary, file);
}

function mediumSummary(shots) {
  const total = shots.reduce((sum, shot) => sum + Number(shot.editWindow?.durationMs || 0), 0);
  return Object.fromEntries(["presenter-clean", "presenter-overlay", "screen-demo", "full-package", "type-only"].map((mode) => {
    const selected = shots.filter((shot) => shot.editMode === mode);
    const durationMs = selected.reduce((sum, shot) => sum + Number(shot.editWindow?.durationMs || 0), 0);
    return [mode, {shotCount: selected.length, durationMs, durationRatio: total ? Number((durationMs / total).toFixed(4)) : 0}];
  }));
}

const visualFields = [
  "editMode", "materialRoute", "topology", "typographyRole", "keyPhrases", "mediumDecisionReason", "visualJob", "primaryActor", "motionPhrase", "handoffActor", "screenActions", "presenterDirection", "overlayBrief", "presenterPackage", "packageBrief", "requiredMaterialIds", "structureDirections", "layoutConstraints", "supportingMaterialIds", "primaryMaterialId", "missingMaterialIds", "materialGate", "transitionOut",
];

function mergeCurrentShotDemand(shot, demand) {
  if (!demand) return shot;
  const next = {...shot};
  for (const field of visualFields) if (Object.hasOwn(demand, field)) next[field] = structuredClone(demand[field]);
  return next;
}

function chapterCounts(shots, chapterId) {
  return Object.fromEntries(["presenter-clean", "presenter-overlay", "screen-demo", "full-package", "type-only"].map((mode) => [mode, shots.filter((shot) => shot.chapterId === chapterId && shot.editMode === mode).length]));
}

if (!fs.existsSync(referenceCorpusPath)) throw new Error("reference-sequence-corpus-v2-missing");
if (!fs.existsSync(currentRunPath)) throw new Error("whole-film-current-run-missing");
const referenceCorpus = readJson(referenceCorpusPath);
if (referenceCorpus.contract !== "A1ReferenceSequenceCorpus/v2" || referenceCorpus.status !== "REFERENCE_SEQUENCE_CORPUS_V2_OBSERVED" || referenceCorpus.allSourcesObserved !== true) throw new Error("reference-sequence-corpus-v2-not-observed");
const referenceCorpusSha256 = sha256(fs.readFileSync(referenceCorpusPath));
const originalRun = readJson(currentRunPath);
if (originalRun.contract !== "A1WholeFilmAiDirectorRun/v1" || originalRun.status !== "completed" || !Array.isArray(originalRun.plan?.shots)) throw new Error("whole-film-current-run-invalid");

const update = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentDemandById = new Map(current.library.assets.filter((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId).map((asset) => [asset.shotDemand.shotId, asset.shotDemand]));
  const reconciledShots = originalRun.plan.shots.map((shot) => mergeCurrentShotDemand(shot, currentDemandById.get(shot.shotId)));
  const restoredShots = reconciledShots.map(restoreFullFrameScreenOperation);
  const changedModes = restoredShots.filter((shot, index) => shot.editMode !== originalRun.plan.shots[index]?.editMode).map((shot) => ({shotId: shot.shotId, from: originalRun.plan.shots.find((item) => item.shotId === shot.shotId)?.editMode || null, to: shot.editMode}));
  const changedWorkspaceModes = restoredShots.filter((shot) => currentDemandById.get(shot.shotId)?.editMode !== shot.editMode).map((shot) => shot.shotId);
  const chapterDirectives = current.visualBible.chapterDirectives.map((chapter) => ({...chapter, mediumCounts: chapterCounts(restoredShots, chapter.chapterId)}));
  const revisedPlan = bindPlanToReferenceSequences({...originalRun.plan, shots: restoredShots, mediumSummary: mediumSummary(restoredShots)}, {referenceCorpusSha256, chapterDirectives});
  if (!revisedPlan.referenceConditioning.audit.pass) throw new Error(`reference-conditioned-director-audit-failed:${revisedPlan.referenceConditioning.audit.hardFailures.join(",")}`);
  const revisedRun = {...originalRun, plan: revisedPlan};
  const next = structuredClone(current);
  next.visualBible.chapterDirectives = chapterDirectives;
  next.visualBible.status = "REFERENCE_CONDITIONED_PLAN_REVIEWED";
  next.candidateAdmission.referenceSequenceCorpus = {
    contract: "A1ReferenceSequenceCorpus/v2",
    sha256: referenceCorpusSha256,
    publicUrl: "/generated/system-line/reference-sequence-corpus-v2/corpus.json",
    referenceWallPublicUrl: referenceCorpus.referenceWall.publicUrl,
    sourceIds: ["hupo"],
    excludedSourceIds: ["covacut"],
    exclusionReason: "USER_EXCLUDED_INACCURATE_REFERENCE",
    runtimeAssetAllowed: false,
    reviewUnit: "continuous-sequence",
  };
  const revisedShotById = new Map(revisedPlan.shots.map((shot) => [shot.shotId, shot]));
  for (const asset of next.library.assets.filter((item) => item.route === "shot-composition" && item.shotDemand?.shotId)) {
    const revisedShot = revisedShotById.get(asset.shotDemand.shotId);
    if (!revisedShot) continue;
    const visualModeChanged = changedWorkspaceModes.includes(revisedShot.shotId);
    const candidateCountBefore = (asset.candidates || []).length;
    const previousTypographyAssignment = asset.shotDemand.typographyAssignment || {};
    asset.shotDemand = {...asset.shotDemand, ...revisedShot, contract: "A1ShotDesignDemand/v1", candidateGenerationAllowed: true};
    const typographyAssignment = buildPixelEditorialTypographyAssignment({
      shot: revisedShot,
      headlineText: revisedShot.editMode === "screen-demo" ? null : previousTypographyAssignment.headlineText,
      generatedGlyphAssetId: previousTypographyAssignment.generatedGlyphAssetIds?.[0] || null,
    });
    asset.shotDemand.typographyAssignment = typographyAssignment;
    const systemTypographyAssignment = next.typographySystem.shotAssignments.find((item) => item.shotId === revisedShot.shotId);
    if (systemTypographyAssignment) Object.assign(systemTypographyAssignment, typographyAssignment, {shotId: revisedShot.shotId});
    if (visualModeChanged) {
      if (candidateCountBefore || asset.selectedCandidateId || asset.candidateRender) {
        asset.revisionHistory ||= [];
        asset.revisionHistory.push({
          contract: "A1RejectedShotCandidateRound/v1",
          round: Number(asset.visualRevision?.round || 1),
          reason: "reference-conditioned-medium-restoration",
          candidates: asset.candidates || [],
          selectedCandidateId: asset.selectedCandidateId || null,
          candidateRender: asset.candidateRender || null,
          visualCritic: asset.visualCritic || null,
          archivedAt: now,
        });
      }
      asset.candidates = [];
      asset.selectedCandidateId = null;
      delete asset.candidateRender;
      delete asset.visualCritic;
      asset.status = "brief-ready";
      asset.review = {status: "pending", note: "恢复为全屏真实操作；原人物＋截图小窗候选已失效。", reviewedAt: now, reviewedBy: "system-visual-critic", approvedContentSha256: null};
      asset.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: Number(asset.visualRevision?.round || 1) + 1, sourceReportSha256: referenceCorpusSha256, prompt: revisedShot.mediumDecisionReason, createdAt: now};
    }
    const graphDemand = next.assetRequirementGraph.shotDemands.find((item) => item.shotId === revisedShot.shotId);
    if (graphDemand) Object.assign(graphDemand, {
      editMode: revisedShot.editMode,
      requiredMaterialIds: revisedShot.requiredMaterialIds || [],
      candidateAssetIds: [...new Set([...(graphDemand.candidateAssetIds || []), ...(revisedShot.supportingMaterialIds || [])])],
      materialGate: revisedShot.materialGate,
      referenceConditioning: revisedShot.referenceConditioning,
    });
  }

  const openingAnchor = next.candidateAdmission.anchorConstraints.find((item) => item.shotId === "ED-01");
  if (openingAnchor) Object.assign(openingAnchor, {
    family: "presenter-overlay",
    materialStatus: "REAL_DAVINCI_SOURCE_FRAME_BOUND",
    finalStatus: "READY_FOR_REFERENCE_CONDITIONED_REBUILD",
    candidateRule: "real presenter remains full-frame; bilingual pixel typography binds to real negative space or physical objects; protect face; no floating logo, screenshot inset, HUD or generic title card",
  });

  const invalidated = new Set(changedWorkspaceModes);
  const persistedChangedModes = changedModes.length ? changedModes : current.production.referenceConditioning?.changedModes || [];
  const persistedInvalidatedShotIds = changedWorkspaceModes.length ? changedWorkspaceModes : current.production.referenceConditioning?.invalidatedShotIds || [];
  next.production.maturityLoop.shotReports = Object.fromEntries(Object.entries(next.production.maturityLoop.shotReports || {}).filter(([shotId]) => !invalidated.has(shotId)));
  next.production.maturityLoop.rounds = (next.production.maturityLoop.rounds || []).filter((round) => !invalidated.has(round.targetId) && round.targetType !== "representative-motion");
  next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || []).filter((shotId) => !invalidated.has(shotId));
  delete next.production.maturityLoop.representativeMotionReport;
  delete next.production.maturityLoop.allShotSelectedReview;
  next.production.maturityLoop.status = "paused-for-reference-conditioned-shot-rebuild";
  next.production.maturityLoop.nextAction = `rebuild-full-frame-screen-shots-${changedWorkspaceModes.join("-")}`;
  next.production.referenceConditioning = {
    ...revisedPlan.referenceConditioning,
    boundShotCount: revisedPlan.referenceConditioning.audit.boundShotCount,
    status: "BOUND_VISUAL_REVIEW_PENDING",
    reportPublicUrl: `/${phaseRelative}/reference-conditioned-director-v2/report.json`,
    referenceWallPublicUrl: referenceCorpus.referenceWall.publicUrl,
    changedModes: persistedChangedModes,
    invalidatedShotIds: persistedInvalidatedShotIds,
    appliedAt: now,
  };
  next.production.acceptedShotIr = {contract: "A1AcceptedShotIRSet/v2", status: "locked-upstream-reference-conditioning", sourceWorkspaceSha256: null, shotCount: 0, sha256: null, publicUrl: null, compiledAt: null};
  next.production.motion = {contract: "A1RepresentativeMotionGate/v1", status: "locked-upstream-reference-conditioning", representativePlan: null, previewArtifact: null, review: {status: "pending", score: null, maxScore: 24, hardFailures: [], reviewedAt: null}, fullMotionAllowed: false};
  next.production.assembly.status = "reference-conditioned-shot-rebuild-pending";
  next.production.release.review540p = {status: "locked-upstream-reference-conditioning", publicUrl: null, sha256: null, renderedAt: null, durationMs: null, width: 960, height: 540, approvedAt: null};
  next.production.release.final1080p = {status: "locked", publicUrl: null, sha256: null, requestedAt: null};
  next.production.release.davinciPackage = {status: "locked", publicUrl: null, sha256: null};
  next.production.release.visualQualityReview = {contract: "A1FilmVisualQualityReview/v1", status: "blocked", scope: "reference-conditioned-shot-rebuild", verdict: "BLOCK", totalScore: null, maxScore: 24, hardFailures: ["upstream-reference-conditioned-candidates-required"], sourceArtifactSha256: null, reportPublicUrl: null, reportSha256: null, repairBriefPublicUrl: null, repairBriefSha256: null, reviewedAt: null, nextAction: "rebuild-reference-conditioned-shot-candidates", updatedAt: now};
  const runText = jsonText(revisedRun);
  next.directorInput.sha256 = sha256(runText);
  const report = {
    contract: "A1ReferenceConditionedDirectorApplied/v2",
    status: "BOUND_VISUAL_REVIEW_PENDING",
    projectId: revisedPlan.projectId,
    sourceRunSha256: sha256(jsonText(originalRun)),
    revisedRunSha256: sha256(runText),
    referenceCorpusSha256,
    referenceWallPublicUrl: referenceCorpus.referenceWall.publicUrl,
    changedModes,
    invalidatedShotIds: changedWorkspaceModes,
    mediumSummary: revisedPlan.mediumSummary,
    audit: revisedPlan.referenceConditioning.audit,
    gates: {acceptedShotIrAllowed: false, motionAllowed: false, fullRenderAllowed: false},
    nextAction: "rebuild-invalidated-screen-shots-then-run-continuous-opening-sequence-review",
    createdAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "reference-conditioned-director-v2-applied", payload: {referenceCorpusSha256, changedModes, invalidatedShotIds: changedWorkspaceModes, reportPublicUrl: `/${phaseRelative}/reference-conditioned-director-v2/report.json`}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {"whole-film-director-input.json": revisedRun, "reference-conditioned-director-v2/report.json": report}});
  return {workspace: recalculated, revisedRun, report};
});

writeAtomic(currentRunPath, update.revisedRun);
writeAtomic(publicDirectorPath, update.revisedRun);
writeAtomic(path.join(phasePublic, "reference-conditioned-director-v2/report.json"), update.report);
writeAtomic(path.join(artifactDir, "reference-conditioned-director-v2/report.json"), update.report);
console.log(jsonText({status: update.report.status, changedModes: update.report.changedModes, invalidatedShotIds: update.report.invalidatedShotIds, mediumSummary: update.report.mediumSummary, audit: update.report.audit, workspaceStatus: update.workspace.status, nextAction: update.workspace.production.nextAction, reportPublicUrl: `/${phaseRelative}/reference-conditioned-director-v2/report.json`}));
