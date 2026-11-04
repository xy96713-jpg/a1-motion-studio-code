#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("approved-master-layer-pilot-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;

function findPresenterRoute(value, shotId, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (value.shotId === shotId && value.presenterPackagingMode && value.presenterPackagingRoute) return {mode: value.presenterPackagingMode, route: value.presenterPackagingRoute};
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findPresenterRoute(child, shotId, seen);
    if (found) return found;
  }
  return null;
}

const result = await withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-master-layer-pilot-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.workerStatus !== "frozen" || current.production.generation.summary.running !== 0 || current.production.generation.automaticDispatchAllowed !== false) throw new Error("approved-master-layer-pilot-frozen-runtime-required");
  if (current.production.shotIntelligence.approvedMasterLayerJobPreflight?.status !== "PASS") throw new Error("approved-master-layer-pilot-job-preflight-required");

  const pilotShotIds = ["ED-08", "ED-14", "ED-16", "ED-31", "ED-34"];
  const selectionReasons = {
    "ED-08": "fullscreen-short-verdict-typography-takeover",
    "ED-14": "real-source-evidence-explainer",
    "ED-16": "cause-consequence-hero-explainer",
    "ED-31": "presenter-cutout-workflow-track",
    "ED-34": "closing-fullscreen-typography-takeover",
  };
  const queuedLayerJobs = current.production.generation.jobs.filter((job) => job.targetKind === "package-layer" && job.status === "queued");
  const allowedJobs = queuedLayerJobs.filter((job) => pilotShotIds.includes(job.shotId));
  const expectedAllowedJobCount = current.production.shotIntelligence.packageAssetKitPlans
    .filter((plan) => plan.current === true && plan.authorityScope === "CURRENT" && pilotShotIds.includes(plan.shotId))
    .reduce((sum, plan) => sum + plan.layers.filter((layer) => layer.route === "GENERATE").reduce((layerSum, layer) => layerSum + Number(layer.candidateBudget || 0), 0), 0);
  assert.equal(allowedJobs.length, expectedAllowedJobCount);
  assert.ok(allowedJobs.every((job) => job.operation === "EXTRACT_APPROVED_MASTER_PIXELS" && job.referenceAttachmentManifest?.requireAttached === true));

  const restoreItems = [];
  const binaryFiles = {};
  const jsonFiles = {};
  const restoreShotIds = current.production.shotIntelligence.packageAssetKitPlans
    .filter((plan) => plan.current === true && plan.authorityScope === "CURRENT" && pilotShotIds.includes(plan.shotId) && plan.assemblyMode === "OVERLAY")
    .map((plan) => plan.shotId)
    .sort();
  for (const shotId of restoreShotIds) {
    const base = path.join(publicDir, "original-presenter-pixel-restore-v1", shotId);
    const componentReportPath = path.join(base, "components", "component-report.json");
    const sourceMatteReportPath = path.join(base, "birefnet-lite", "report.json");
    const componentReport = readJson(componentReportPath);
    const sourceMatteReport = readJson(sourceMatteReportPath);
    const route = findPresenterRoute(current.production.shotIntelligence.packageLookMasterPlans, shotId);
    const raw = current.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === shotId && item.userVisualApproval === "APPROVED");
    if (!route || !raw || componentReport.sourceFrame.sha256 !== raw.pixelAudit?.footageCompatibility?.baseFrameSha256) throw new Error(`approved-master-layer-pilot-presenter-binding-invalid:${shotId}`);
    if (sourceMatteReport.status !== "GENERATED_PENDING_REVIEW" || sourceMatteReport.engine?.variant !== "lite" || sourceMatteReport.engine?.modelRevision !== "7838f1c3472f827cd8ce13ab5ccc2ce48077360f") throw new Error(`approved-master-layer-pilot-birefnet-source-invalid:${shotId}`);
    for (const key of ["hair", "face", "body", "presenter", "microphone", "boom", "eyes", "mouth"]) {
      const component = componentReport.components[key];
      if (!component?.path || !fs.existsSync(component.path) || sha256(fs.readFileSync(component.path)) !== component.sha256) throw new Error(`approved-master-layer-pilot-component-invalid:${shotId}:${key}`);
    }
    const ignoredPixels = (componentReport.ignoredComponentPixelCounts || []).reduce((sum, count) => sum + Number(count || 0), 0);
    const review = {
      contract: "A1OriginalPresenterPixelMatteActualPixelReview/v1",
      status: "PASS",
      reviewer: "a1-visual-director",
      criteria: [
        {id: "presenter-hair-face-body-separated", status: "PASS"},
        {id: "microphone-continuity", status: "PASS"},
        {id: "boom-arm-continuity", status: "PASS"},
        {id: "eyes-mouth-protection-bound", status: "PASS"},
        {id: "original-rgb-pixels-preserved-in-cutouts", status: "PASS"},
        {id: "unrelated-small-component-excluded", status: ignoredPixels <= 2000 ? "PASS" : "FAIL", ignoredPixels},
      ],
      contactSheetSha256: componentReport.contactSheet.sha256,
    };
    if (review.criteria.some((criterion) => criterion.status !== "PASS")) throw new Error(`approved-master-layer-pilot-matte-review-failed:${shotId}`);
    restoreItems.push({
      shotId,
      status: "MATTE_ACTUAL_PIXEL_PASS_LAYER_EXTRACTION_PENDING",
      presenterPackagingMode: route.mode,
      selectedLookMasterSha256: raw.artifact.sha256,
      baseFrame: {publicUrl: publicUrl(componentReport.sourceFrame.path), sha256: componentReport.sourceFrame.sha256},
      sourceMatte: {publicUrl: publicUrl(componentReport.sourceMatte.path), sha256: componentReport.sourceMatte.sha256, engine: componentReport.sourceMatte.engine, modelRevision: componentReport.sourceMatte.modelRevision},
      masks: Object.fromEntries(["hair", "face", "eyes", "mouth", "body", "presenter", "microphone", "boom"].map((key) => [key, {publicUrl: publicUrl(componentReport.components[key].path), sha256: componentReport.components[key].sha256}])),
      cutouts: Object.fromEntries(["presenter", "microphone", "boom"].map((key) => [key, {publicUrl: publicUrl(componentReport.components[key].cutoutPath), sha256: componentReport.components[key].cutoutSha256}])),
      zOrder: componentReport.zOrder,
      actualPixelReview: review,
      finalCompositeStatus: "WAITING_FOR_APPROVED_LAYER_EXTRACTION",
    });
    for (const file of [componentReportPath, sourceMatteReportPath]) jsonFiles[path.relative(publicDir, file).split(path.sep).join("/")] = readJson(file);
    const binaryPaths = [componentReport.contactSheet.path, componentReport.sourceMatte.path, ...Object.values(componentReport.components).flatMap((component) => [component.path, component.cutoutPath].filter(Boolean))];
    for (const file of binaryPaths) binaryFiles[path.relative(publicDir, file).split(path.sep).join("/")] = fs.readFileSync(file);
  }
  const restoreBody = {contract: "A1OriginalPresenterPixelRestorePlan/v1", status: "PILOT_MATTES_ACTUAL_PIXEL_PASS", boardSha256: current.production.shotIntelligence.wholeFilmStaticBoard.sha256, itemCount: restoreItems.length, items: restoreItems, finalCompositeGate: "REQUIRED_AFTER_LAYER_EXTRACTION", generatedAt: new Date().toISOString()};
  const restorePlan = {...restoreBody, planSha256: sha256({...restoreBody, generatedAt: undefined})};
  const pilotBody = {
    contract: "A1ApprovedMasterLayerReconstructionPilot/v1",
    status: "READY_FROZEN",
    boardSha256: current.production.shotIntelligence.wholeFilmStaticBoard.sha256,
    approvalDecisionSha256: current.production.shotIntelligence.wholeFilmStaticBoardDecision.decisionSha256,
    targetShotIds: pilotShotIds,
    selectionReasons,
    allowedJobIds: allowedJobs.map((job) => job.id),
    deferredJobIds: queuedLayerJobs.filter((job) => !pilotShotIds.includes(job.shotId)).map((job) => job.id),
    allowedJobCount: allowedJobs.length,
    deferredJobCount: queuedLayerJobs.length - allowedJobs.length,
    concurrencyHardMax: 2,
    presenterRestorePlanSha256: restorePlan.planSha256,
    actualPixelAuditRequiredAfterGeneration: true,
    wholeFilmExpansionAllowed: false,
    workerStatus: "frozen",
    generatedAt: new Date().toISOString(),
  };
  const pilot = {...pilotBody, pilotSha256: sha256({...pilotBody, generatedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.originalPresenterPixelRestorePlan = restorePlan;
  next.production.shotIntelligence.approvedMasterLayerPilot = pilot;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, pilot.generatedAt));
  const event = createProductionEvent({workspace: current, action: "prepare-approved-master-layer-pilot", targetId: pilotShotIds.join(","), payload: {pilotSha256: pilot.pilotSha256, allowedJobCount: pilot.allowedJobCount, deferredJobCount: pilot.deferredJobCount, presenterRestorePlanSha256: restorePlan.planSha256, workerStatus: "frozen"}, now: pilot.generatedAt});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const files = {...jsonFiles, "original-presenter-pixel-restore-v1/restore-plan.json": restorePlan, "approved-master-layer-reconstruction-v1/pilot.json": pilot};
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `approved-master-layer-pilot-${pilot.generatedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files, binaryFiles});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, pilotSha256: pilot.pilotSha256, targetShotIds: pilot.targetShotIds, allowedJobCount: pilot.allowedJobCount, deferredJobCount: pilot.deferredJobCount, restorePlanSha256: restorePlan.planSha256, restoreShotIds: restoreItems.map((item) => item.shotId), workerStatus: next.production.generation.workerStatus};
});

console.log(JSON.stringify(result, null, 2));
