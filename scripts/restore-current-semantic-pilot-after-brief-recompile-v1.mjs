#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseDir = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const reportPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/semantic-pilot-v1/report.json");
const queuePath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/semantic-pilot-v1/queue.json");
const assessmentPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/semantic-pilot-v1/actual-pixel-assessments.json");
const referenceManifestPath = path.join(phaseDir, "../reference-packs/pinterest-retro-pixel-v1/manifest.json");
const expectedWorkspaceSha256 = "214e1fdc5c7902d05e635e929710712bffe173741204efc58e87a71171c89fec";
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const targetShotIds = ["ED-12", "ED-17", "ED-09"];

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const report = readJson(reportPath);
const queue = readJson(queuePath);
const assessments = readJson(assessmentPath);
if (report.status !== "SEMANTIC_PILOT_REVIEW_REQUIRED" || report.candidates?.length !== 3) throw new Error("semantic-pilot-final-report-missing");
if (assessments.contract !== "A1SemanticPilotActualPixelAssessments/v1" || assessments.items?.length !== 3 || assessments.items.some((item) => item.status !== undefined && item.status !== "PASS")) throw new Error("semantic-pilot-pixel-assessment-missing");
for (const candidate of report.candidates) {
  const file = path.join(appRoot, "public", candidate.artifact.publicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(file) || fileSha256(file) !== candidate.artifact.sha256 || candidate.status !== "PASS") throw new Error(`semantic-pilot-artifact-invalid:${candidate.shotId}`);
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error("semantic-pilot-restore-workspace-changed-since-checkpoint");
  const runtime = current.production.shotIntelligence;
  if (runtime.semanticDesignBriefSet?.status !== "READY" || runtime.semanticDesignBriefSet.briefs.filter((brief) => brief.status === "READY").length !== 34) throw new Error("semantic-pilot-restore-requires-34-ready-briefs");

  const styleBriefs = [...(queue.styleBriefs || [])];
  const ed12Brief = runtime.semanticDesignBriefSet.briefs.find((brief) => brief.shotId === "ED-12");
  const ed12Decision = runtime.decisionSet.items.find((item) => item.sourceHash === ed12Brief?.shotSourceHash);
  const ed12Event = current.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds?.includes("ED-12"));
  const ed12Context = (runtime.videoPackagingContexts.items || runtime.videoPackagingContexts).find((item) => item.shotId === "ED-12");
  if (!ed12Brief || !ed12Decision || !ed12Event || !ed12Context) throw new Error("semantic-pilot-restore-ed12-style-inputs-missing");
  const repairedEd12StyleBrief = compileRetroPixelEditorialStyleBrief({
    event: ed12Event,
    appRoot,
    videoContext: ed12Context,
    semanticBrief: ed12Brief,
    referenceExclusions: ["pinterest-retro-pixel-10"],
    variationOverrides: {
      primaryFamily: "icon-atlas-interface-language",
      supportingFamilies: [],
      composition: "five-source-cards-on-one-evidence-rail",
      surfaceLogic: "source-card-atlas-with-quiet-evidence-field",
      dominantActor: "five-verified-model-identity-cards",
      material: "source-bound-card-grid-with-light-paper-grain",
      motionEnergy: "cards-enter-in-order-then-hold-as-evidence",
    },
    now: new Date().toISOString(),
  });
  const repairedStyleBriefs = styleBriefs.map((brief) => brief.sourceBeatIds?.includes("ED-12") ? repairedEd12StyleBrief : brief);
  if (repairedStyleBriefs.some((brief) => brief.sourceBeatIds?.includes("ED-12") && brief.sourceReferences?.some((reference) => reference.id === "pinterest-retro-pixel-10"))) throw new Error("semantic-pilot-restore-ed12-reference-exclusion-missing");

  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  const candidateIds = report.candidates.map((candidate) => candidate.candidateId);
  nextRuntime.status = "SEMANTIC_PILOT_REVIEW_REQUIRED";
  nextRuntime.semanticPilot = {
    contract: "A1SemanticPilotRun/v1",
    status: "SEMANTIC_PILOT_REVIEW_REQUIRED",
    targetPolicy: queue.targetPolicy,
    targetShotIds,
    // Bind the restored pilot to the generation jobs that actually produced
    // each retained PNG; queue plan IDs may refer to an earlier exploratory
    // attempt with a different output hash.
    jobIds: report.candidates.map((candidate) => candidate.generationJobId),
    candidateIds,
    candidates: report.candidates,
    recommendation: null,
    selected: null,
    currentAssembly: [],
    contactSheet: report.contactSheet,
    imageGenerationPerformed: true,
    layerReconstructionPerformed: false,
    criticPerformed: false,
    motionPerformed: false,
    requiresUserAction: true,
    styleBriefs: repairedStyleBriefs,
    aestheticPolicy: queue.aestheticPolicy,
    planSha256: queue.planSha256,
    duplicateAudit: report.duplicateAudit,
    skippedShot: queue.skippedShot,
    restoredAfterSemanticBriefRecompile: true,
    restoreReason: "preserve-existing-reviewed-pilot-candidates-after-ed20-director-recompile",
    updatedAt: new Date().toISOString(),
  };
  nextRuntime.wholeFilmBatchRecommendation = {
    ...(nextRuntime.wholeFilmBatchRecommendation || {}),
    status: "SEMANTIC_REVIEW_REQUIRED",
    explorationOnly: true,
    recommendation: null,
    selected: null,
    currentAssembly: [],
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    updatedAt: nextRuntime.semanticPilot.updatedAt,
  };
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.authority.currentStage = "semantic-pilot-review";
  next.production.authority.nextAction = "semantic-pilot-review-required";
  next.production.authority.nextActionLabel = "请一次查看 3 张语义试验画面";
  next.production.authority.requiresUserAction = true;
  const event = createProductionEvent({workspace: current, action: "semantic-pilot-review-restored-after-ed20-recompile", targetId: report.contactSheet.sha256, payload: {candidateCount: report.candidates.length, artifactSha256: report.candidates.map((candidate) => candidate.artifact.sha256), restoredExistingCandidates: true, imageGenerationPerformed: false, assemblyCreated: false, layerReconstructionPerformed: false, criticPerformed: false, motionPerformed: false, singleWriterTaskId}, now: nextRuntime.semanticPilot.updatedAt});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, nextRuntime.semanticPilot.updatedAt));
  const restoredReport = {...report, status: "SEMANTIC_PILOT_REVIEW_REQUIRED", restoredAfter: "ED20_SEMANTIC_DIRECTOR_RECOMPILE", restoredExistingCandidates: true, imageGenerationPerformed: false, singleWriterTaskId, generatedAt: nextRuntime.semanticPilot.updatedAt};
  persistProjectState(appRoot, recalculated, {event, files: {"semantic-pilot-v1/report.json": restoredReport, "semantic-pilot-v1/actual-pixel-assessments.json": assessments}});
  return {workspace: recalculated, report: restoredReport};
});

console.log(JSON.stringify({status: result.report.status, restoredExistingCandidates: result.report.restoredExistingCandidates, readyBriefCount: result.workspace.production.shotIntelligence.semanticDesignBriefSet.briefs.filter((brief) => brief.status === "READY").length, candidates: result.report.candidates.map((candidate) => ({shotId: candidate.shotId, status: candidate.status, artifactSha256: candidate.artifact.sha256})), recommendation: result.report.recommendation, selected: result.report.selected, currentAssembly: result.report.currentAssembly, workspaceSha256: result.workspace.workspaceSha256, singleWriterTaskId}, null, 2));
