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
const shotId = "ED-33";
const relativeSource = "generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-33-hold-frame.jpg";
const sourceFile = path.join(appRoot, "public", relativeSource);
const sourceBytes = fs.readFileSync(sourceFile);
const sourceSha256 = crypto.createHash("sha256").update(sourceBytes).digest("hex");
const expectedWorkspaceSha256 = process.argv.find((value) => /^[a-f0-9]{64}$/u.test(value)) || null;

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed33-presenter-bind-cas-failed:${current.workspaceSha256}`);
  assert.equal(current.production.authority.currentStage, "whole-film-static-board-review");
  assert.equal(current.production.generation.summary.queued, 0);
  assert.equal(current.production.generation.summary.running, 0);
  assert.equal(current.production.generation.workerStatus, "frozen");
  assert.equal(current.production.shotIntelligence.currentAssembly.length, 0);

  const coverage = current.production.shotVisualCoveragePlan.shotPlans.find((item) => item.shotId === shotId);
  if (!coverage) throw new Error("ed33-presenter-bind-coverage-missing");
  if (coverage.route !== "PRESENTER_BASE" || coverage.packageDecision !== "NO_PACKAGE") throw new Error("ed33-presenter-bind-route-drift");
  const source = {
    kind: "VERIFIED_PRESENTER_SOURCE",
    publicUrl: `/${relativeSource}`,
    sha256: sourceSha256,
    width: 1920,
    height: 1080,
    provenance: "deterministic-hold-frame-from-registered-editor-owned-video",
    sourceAssetId: "source-presenter-continuous-video",
  };
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const nextCoverage = next.production.shotVisualCoveragePlan.shotPlans.find((item) => item.shotId === shotId);
  nextCoverage.preview = source;
  nextCoverage.sourcePreview = source;
  nextCoverage.sourcePreviewSha256 = sourceSha256;
  nextCoverage.presenterSourceBinding = {
    contract: "A1VerifiedPresenterSourceBinding/v1",
    shotId,
    source,
    boundAt: now,
    productionAdmission: false,
  };
  nextCoverage.actualVisualReady = true;
  nextCoverage.canonicalStaticBoardProjection = "NO_PACKAGE_PRESENTER_SOURCE_BOUND";
  const event = createProductionEvent({
    workspace: current,
    action: "bind-verified-presenter-source-ed33-v1",
    targetId: shotId,
    payload: {contract: "A1VerifiedPresenterSourceBinding/v1", shotId, sourceSha256, sourcePublicUrl: source.publicUrl, imageGenerationPerformed: false, motionPerformed: false, userVisualApproval: "NOT_APPROVED"},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `bind-verified-presenter-source-ed33-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "verified-presenter-source-binding-v1/ED-33.json": {
        contract: "A1VerifiedPresenterSourceBinding/v1",
        status: "PASS",
        shotId,
        source,
        workspaceSha256Before: current.workspaceSha256,
        workspaceSha256After: recalculated.workspaceSha256,
        imageGenerationPerformed: false,
        motionPerformed: false,
        userVisualApproval: "NOT_APPROVED",
        generatedAt: now,
      },
    },
  });
  return {status: "PASS", shotId, source, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: persisted.workspaceSha256, transitionSha256: persisted.transitionSha256};
});

console.log(JSON.stringify(result, null, 2));
