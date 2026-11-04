#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const lanePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-screen-demo-lane-v1/manifest.json");
const userDirective = "没看到分镜啊 而且不是早批准做录屏了 你在干嘛呢";
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const lane = JSON.parse(fs.readFileSync(lanePath, "utf8"));
  assert.equal(current.production.authority.currentStage, "whole-film-static-board-review");
  assert.equal(current.production.generation.summary.queued, 0);
  assert.equal(current.production.generation.summary.running, 0);
  assert.equal(current.production.generation.workerStatus, "frozen");
  const eligible = (current.production.shotVisualCoveragePlan.shotPlans || [])
    .filter((shot) => shot.route === "SCREEN_EVIDENCE")
    .map((shot) => shot.shotId)
    .filter((shotId) => shotId !== "ED-20");
  assert.equal(eligible.length, 15);
  const now = new Date().toISOString();
  const next = structuredClone(current);
  next.production.screenCaptureAuthorization = {
    contract: "A1ScreenCaptureAuthorization/v1",
    status: "AUTHORIZED_BY_EXPLICIT_USER_DIRECTIVE",
    current: true,
    scope: "SCREEN_EVIDENCE_ONLY",
    userDirective,
    userDirectiveSha256: crypto.createHash("sha256").update(userDirective).digest("hex"),
    workspaceSha256: current.workspaceSha256,
    laneManifestPath: ".codex-artifacts/system-progress-system-line/current-screen-demo-lane-v1/manifest.json",
    laneManifestSha256: sha256File(lanePath),
    laneSha256: lane.sha256,
    targetShotIds: eligible,
    excludedShotIds: [{shotId: "ED-20", reason: "SOURCE_EVIDENCE_COVERAGE_PARTIAL:codexMaterialToWorkbench:review"}],
    productionAdmission: false,
    assemblyAllowed: false,
    motionAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    authorizedAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "authorize-screen-capture-from-explicit-user-directive-v1", targetId: lane.sha256, payload: {contract: "A1ScreenCaptureAuthorization/v1", targetShotIds: eligible, excludedShotIds: ["ED-20"], productionAdmission: false, motionAllowed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `authorize-screen-capture-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"screen-capture-authorization-v1/receipt.json": next.production.screenCaptureAuthorization}});
  return {status: "PASS", targetShotIds: eligible, excludedShotIds: ["ED-20"], laneSha256: lane.sha256, workspaceSha256: persisted.workspaceSha256, transitionSha256: persisted.transitionSha256};
});
console.log(JSON.stringify(result, null, 2));
