#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {assertGoldenLookAnchorRegistry} from "../apps/studio-next/src/lib/a1-golden-look-anchor-registry-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const workspace = readProjectWorkspace(appRoot);
const registry = assertGoldenLookAnchorRegistry(workspace.production.goldenLookAnchorRegistry);
const report = JSON.parse(fs.readFileSync(path.join(artifactDir, "golden-look-anchor-review-v1", "report.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json"), "utf8"));
const phase = JSON.parse(fs.readFileSync(path.resolve(appRoot, "../../.codex-artifacts/system-progress-system-line/current-phase.json"), "utf8"));
const ed20 = manifest.entries.find((entry) => entry.shotId === "ED-20");
const candidateShas = workspace.production.shotIntelligence.lookMasterRawReferences.map((item) => item.artifact?.sha256).filter(Boolean);

assert.equal(registry.status, "GOLDEN_ANCHOR_REVIEW");
assert.equal(registry.entries.length, 4);
assert.deepEqual(registry.entries.map((entry) => entry.shotId), ["ED-07", "ED-08", "ED-13", "ED-34"]);
assert(registry.entries.every((entry) => entry.approvalState === "ANCHOR_CANDIDATE"));
assert.equal(ed20.status, "ANCHOR_REBASE_REQUIRED");
assert.equal(ed20.generationAllowed, false);
assert.equal(ed20.primitiveId, "PIXEL_WINDOW_OVERLAY");
assert.equal(ed20.ed20OverlayPolicy.fullscreenFallbackAllowed, false);
assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256, report.boardSha256Before);
assert.equal(report.boardSha256After, report.boardSha256Before);
assert.equal(report.boardRebuilt, false);
assert.equal(report.candidateShasUnchanged, true);
assert.equal(candidateShas.length, report.candidateShaCountBefore);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
assert.notEqual(workspace.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed, true);
assert.equal(workspace.gates.packagingDeliveryGates?.layerReconstructionAllowed, false);
assert.equal(workspace.gates.packagingDeliveryGates?.criticReviewAllowed, false);
assert.equal(workspace.gates.packagingDeliveryGates?.motionAllowed, false);
assert.equal(phase.status, "GOLDEN_ANCHOR_REVIEW");
assert.equal(phase.reviewDecision.reviewActionDisabled, true);
assert.equal(phase.boardReview.status, "SUPERSEDED_ANCHOR_REBASE_PENDING");
assert.equal(phase.next.recommended.id, "review-golden-look-anchors");

console.log(JSON.stringify({contract: "A1GoldenLookAnchorLiveCheckpointTest/v1", status: "PASS", workspaceSha256: workspace.workspaceSha256, boardSha256: report.boardSha256Before, anchorCount: registry.entries.length, ed20Status: ed20.status, queue: workspace.production.generation.summary, workerStatus: workspace.production.generation.workerStatus, assemblyCount: workspace.production.shotIntelligence.currentAssembly.length}, null, 2));
