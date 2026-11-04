#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  A1_OPERATION_ORCHESTRATION_CONTRACT,
  buildInteractionTraceFromBrowserReplay,
  buildInteractionTraceFromVideoEvidence,
  buildOperationOrchestrationState,
  buildScreenPerformanceIrFromTrace,
  assertInteractionTrace,
  assertScreenPerformanceIr,
} from "../apps/studio-next/src/lib/a1-operation-trace-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/operation-traces/ED-02");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };
const now = new Date().toISOString();

function main() {
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const shotAsset = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-02");
  if (!shotAsset) throw new Error("operation-trace-shot-ed02-missing");
  const sourceAsset = workspace.library.assets.find((asset) => asset.id === "source-documentary-selection-action");
  if (!sourceAsset) throw new Error("operation-trace-source-selection-action-missing");
  const sourceReportPath = sourceAsset.sourceUri ? path.resolve(root, sourceAsset.sourceUri) : null;
  const sourceReport = sourceReportPath && fs.existsSync(sourceReportPath) ? JSON.parse(fs.readFileSync(sourceReportPath, "utf8")) : null;
  const replay = sourceReport?.interaction?.replay || null;
  const trace = replay
    ? buildInteractionTraceFromBrowserReplay({projectId: workspace.production.project.projectId, shot: shotAsset.shotDemand, asset: sourceAsset, replay, capturedAt: now})
    : buildInteractionTraceFromVideoEvidence({projectId: workspace.production.project.projectId, shot: shotAsset.shotDemand, asset: sourceAsset, capturedAt: now});
  const performance = buildScreenPerformanceIrFromTrace(trace, {createdAt: now});
  assertInteractionTrace(trace);
  assertScreenPerformanceIr(performance);
  const orchestration = buildOperationOrchestrationState({trace, performance, createdAt: now});

  const tracePublicUrl = "/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02/interaction-trace.json";
  const performancePublicUrl = "/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02/screen-performance-ir.json";
  const orchestrationPublicUrl = "/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02/operation-orchestration.json";
  const manifestPublicUrl = "/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02/manifest.json";
  orchestration.trace.publicUrl = tracePublicUrl;
  orchestration.performance.publicUrl = performancePublicUrl;
  orchestration.sha256 = sha256(orchestration);
  const manifest = {
    contract: "A1OperationTracePackage/v1",
    status: "REVIEW_ONLY_SOURCE_BOUND",
    projectId: workspace.production.project.projectId,
    shotId: "ED-02",
    trace: {contract: trace.contract, publicUrl: tracePublicUrl, sha256: trace.sha256, eventCount: trace.events.length},
    performance: {contract: performance.contract, publicUrl: performancePublicUrl, sha256: performance.sha256, cameraBeatCount: performance.camera.length, emphasisBeatCount: performance.emphasis.length, pointerBeatCount: performance.pointer?.length || 0, typingBeatCount: performance.textInput?.length || 0},
    orchestration: {contract: A1_OPERATION_ORCHESTRATION_CONTRACT, publicUrl: orchestrationPublicUrl, sha256: orchestration.sha256},
    source: {assetId: trace.source.assetId, sourceUri: trace.source.sourceUri, sourceSha256: trace.source.sourceSha256, adapterId: trace.source.adapterId, replayable: trace.source.replayable},
    gates: orchestration.gates,
    createdAt: now,
  };
  const report = {
    contract: "A1OperationTracePackageAudit/v1",
    status: "PASS",
    generatedAt: now,
    projectId: manifest.projectId,
    shotId: manifest.shotId,
    checks: {
      realSourceBound: orchestration.gates.realSourceBound,
      sourceEvidenceBound: orchestration.gates.sourceEvidenceBound,
      eventCount: trace.events.length,
      targetRegionCount: trace.events.filter((event) => event.target.region).length,
      cameraBeatCount: performance.camera.length,
      emphasisBeatCount: performance.emphasis.length,
      pointerBeatCount: performance.pointer?.length || 0,
      typingBeatCount: performance.textInput?.length || 0,
      replayStatus: trace.replayPlan.status,
      acceptedShotIrAllowed: false,
      renderAllowed: false,
    },
    nextAction: orchestration.nextAction,
  };
  for (const [directory, files] of [[publicRoot, {"interaction-trace.json": trace, "screen-performance-ir.json": performance, "operation-orchestration.json": orchestration, "manifest.json": manifest, "audit-report.json": report}], [artifactRoot, {"interaction-trace.json": trace, "screen-performance-ir.json": performance, "operation-orchestration.json": orchestration, "manifest.json": manifest, "audit-report.json": report}]]) {
    fs.mkdirSync(directory, {recursive: true});
    for (const [name, value] of Object.entries(files)) writeJson(path.join(directory, name), value);
  }

  const next = withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const currentShot = current.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-02");
    if (!currentShot) throw new Error("operation-trace-current-shot-ed02-missing");
    const updated = structuredClone(current);
    const updatedShot = updated.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-02");
    updatedShot.shotDemand.operationBrief = trace.operationBrief;
    updatedShot.shotDemand.operationTraceRef = {contract: trace.contract, publicUrl: tracePublicUrl, sha256: trace.sha256};
    updatedShot.shotDemand.screenPerformanceIrRef = {contract: performance.contract, publicUrl: performancePublicUrl, sha256: performance.sha256};
    updated.production.operationOrchestration = {
      ...orchestration,
      trace: {...orchestration.trace, publicUrl: tracePublicUrl},
      performance: {...orchestration.performance, publicUrl: performancePublicUrl},
      manifest: {publicUrl: manifestPublicUrl, sha256: sha256(manifest)},
      report: {publicUrl: `${path.dirname(manifestPublicUrl)}/audit-report.json`, sha256: sha256(report)},
    };
    updated.production.operationOrchestration.status = "review-only";
    updated.production.operationOrchestration.nextAction = "review-operation-packaging-in-4311";
    updated.production.eventLedger.eventCount += 1;
    const event = createProductionEvent({workspace: current, action: "operation-trace-package-built", targetId: "ED-02", payload: {traceSha256: trace.sha256, performanceSha256: performance.sha256, adapterId: trace.source.adapterId, replayable: trace.source.replayable}, now});
    updated.production.eventLedger.lastEventId = event.eventId;
    updated.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = recalculateEditorialAssetWorkbench(updated, now);
    persistProjectState(appRoot, recalculated, {event});
    return recalculated;
  });
  console.log(JSON.stringify({status: report.status, contract: trace.contract, shotId: trace.shotId, eventCount: trace.events.length, traceSha256: trace.sha256, performanceSha256: performance.sha256, workspaceSha256: next.workspaceSha256, replayable: trace.source.replayable, nextAction: orchestration.nextAction}, null, 2));
}

main();
