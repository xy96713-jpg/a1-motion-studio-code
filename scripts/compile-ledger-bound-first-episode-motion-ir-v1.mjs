#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertAntiPptMotionDirection} from "../apps/studio-next/src/lib/a1-anti-ppt-motion-admission-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ledger-motion-ir-workspace-cas-required");
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const direction = assertAntiPptMotionDirection(JSON.parse(fs.readFileSync(path.join(root, "work/first-episode-motion-direction-v1/plan.json"), "utf8")));
const ledger = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/current-visual-decision-ledger-v1/ledger.json"), "utf8"));
const representativeShotIds = ["ED-01", "ED-10", "ED-17", "ED-20", "ED-31"];

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ledger-motion-ir-cas:${current.workspaceSha256}`);
  if (current.production.authority?.nextAction?.id !== "build-package-motion-ir" || current.production.currentVisualDecisionLedger?.userVisualApproval !== "APPROVED") throw new Error("ledger-motion-ir-approved-static-authority-required");
  if (ledger.ledgerSha256 !== current.production.currentVisualDecisionLedger.ledgerSha256 || ledger.entries?.length !== 34) throw new Error("ledger-motion-ir-current-ledger-required");
  const frameByShot = new Map(ledger.entries.map((entry) => [entry.shotId, entry.selectedFrame]));
  const scenes = direction.scenes.map((scene) => ({
    shotId: scene.shotId,
    order: scene.order,
    startMs: scene.timeRange.startMs,
    endMs: scene.timeRange.endMs,
    durationMs: scene.timeRange.durationMs,
    sceneClass: scene.sceneClass,
    carrier: scene.sceneClass === "VERIFIED_SCREEN_OPERATION" ? "VERIFIED_SCREEN_SOURCE" : scene.sceneClass === "PRESENTER_SOURCE_HOLD" ? "VERIFIED_REAL_PRESENTER" : "APPROVED_LEDGER_FRAME",
    motionFamily: scene.motionPrimitive,
    dominantActor: scene.dominantActor,
    semanticAction: scene.semanticAction,
    phases: scene.phases,
    source: frameByShot.get(scene.shotId),
    deterministic: true,
    renderPerformed: false,
  }));
  if (scenes.some((scene) => !scene.source?.sha256)) throw new Error("ledger-motion-ir-source-frame-missing");
  const body = {contract: "A1ApprovedMasterRasterSliceMotionIR/v1", status: "READY_FOR_REPRESENTATIVE_MOTION_CANARY", architecture: "LEDGER_BOUND_SEMANTIC_ACTOR_MOTION", sourceVisualDecisionLedgerSha256: ledger.ledgerSha256, sourceStaticStoryboardReworkReportSha256: current.production.staticStoryboardRework.candidate.reportSha256, sourceApprovalDecisionSha256: current.production.staticStoryboardRework.approvedAt, directionPlanSha256: direction.planSha256, durationMs: Math.max(...scenes.map((scene) => scene.endMs)), sceneCount: scenes.length, representativeShotIds, scenes, boundaries: {planningOnly: true, fullMotionRendered: false, finalRenderAllowed: false, resolveWritePerformed: false, representativeCanaryRequired: true}};
  const plan = {...body, planSha256: sha(body), generatedAt: new Date().toISOString()};
  const relative = "generated/system-line/editorial-asset-workbench-v1/approved-master-raster-slice-motion-ir-v1/plan.json";
  let next = structuredClone(current);
  next.production.motion = {...next.production.motion, status: "motion-ir-ready-for-representative-canary", approvedMasterRasterSliceMotionIr: {contract: plan.contract, status: plan.status, publicUrl: `/${relative}`, planSha256: plan.planSha256, representativeShotIds, sourceVisualDecisionLedgerSha256: ledger.ledgerSha256, fullMotionRendered: false}, updatedAt: plan.generatedAt};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, plan.generatedAt));
  if (next.production.authority?.nextAction?.id !== "build-representative-motion-canary") throw new Error(`ledger-motion-ir-next-authority-invalid:${next.production.authority?.nextAction?.id}`);
  const event = createProductionEvent({workspace: current, action: "compile-ledger-bound-first-episode-motion-ir", targetId: plan.planSha256, payload: {sceneCount: plan.sceneCount, representativeShotIds, ledgerSha256: ledger.ledgerSha256}, now: plan.generatedAt});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"approved-master-raster-slice-motion-ir-v1/plan.json": plan}});
  return {status: plan.status, planSha256: plan.planSha256, sceneCount: plan.sceneCount, representativeShotIds, workspaceSha256After: committed.workspaceSha256};
});

console.log(JSON.stringify(result, null, 2));
