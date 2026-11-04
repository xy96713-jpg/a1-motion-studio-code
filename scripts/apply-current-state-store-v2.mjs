#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCurrentStateRetentionPlan, rehydrateCurrentStateWorkspace} from "../apps/studio-next/src/lib/a1-current-state-store-v2.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

if (!process.argv.includes("--apply")) throw new Error("current-state-store-apply-flag-required");
const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const preflight = JSON.parse(fs.readFileSync(path.join(root, "work/current-state-store-v2/preflight.json"), "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const stable = (workspace) => ({authority: {stage: workspace.production.authority.currentStage, actionId: workspace.production.authority.nextAction?.id, targetShotIds: workspace.production.authority.nextAction?.targetShotIds || []}, storyboard: {revisionSha256: workspace.production.storyboardProductionProjection?.storyboardRevisionSha256, counts: workspace.production.storyboardProductionProjection?.counts, userVisualApproval: workspace.production.storyboardProductionProjection?.gate?.userVisualApproval}, currentStoryboard: {contract: workspace.production.shotIntelligence.currentStoryboardAuthority?.contract, shotCount: workspace.production.shotIntelligence.currentStoryboardAuthority?.shots?.length}, gates: {acceptedShotIrAllowed: workspace.gates.acceptedShotIrAllowed, motionPrototypeAllowed: workspace.gates.motionPrototypeAllowed, finalRenderAllowed: workspace.gates.finalRenderAllowed}});
const preparedWorkspace = readProjectWorkspace(appRoot);
assertEditorialAssetWorkbench(structuredClone(preparedWorkspace));
const preparedRetention = buildCurrentStateRetentionPlan(preparedWorkspace);
if (preparedWorkspace.workspaceSha256 !== preflight.sourceWorkspaceSha256 || preparedRetention.plan.planSha256 !== preflight.planSha256) throw new Error("current-state-store-preflight-stale-before-lock");

const committed = withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  if (JSON.stringify(current) !== JSON.stringify(preparedWorkspace)) throw new Error("current-state-store-workspace-cas-after-lock");
  const retention = preparedRetention;
  assert.deepEqual(rehydrateCurrentStateWorkspace(retention.compactedWorkspace, retention.plan, retention.chunks), current);
  const now = new Date().toISOString();
  let next = structuredClone(retention.compactedWorkspace);
  next.production.currentStateArchivePointer = {...next.production.currentStateArchivePointer, status: "CURRENT", appliedAt: now, exactJsonRoundTripVerified: true, recoveryRelativePath: `current-state-v2/recovery/source-workspace-${current.workspaceSha256}.json`};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.deepEqual(stable(next), stable(current));
  const event = createProductionEvent({workspace: current, action: "apply-current-state-store-v2", targetId: retention.plan.planSha256, payload: {planSha256: retention.plan.planSha256, archivedRecordCount: retention.plan.archivedRecordCount, exactJsonRoundTripVerified: true, filesDeleted: 0, mediaMoved: 0}, now});
  next.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const receipt = {contract: "A1CurrentStateStoreApplyReceipt/v2", status: "CURRENT", sourceWorkspaceSha256: current.workspaceSha256, workspaceSha256After: next.workspaceSha256, planSha256: retention.plan.planSha256, archivedRecordCount: retention.plan.archivedRecordCount, exactJsonRoundTripVerified: true, filesDeleted: 0, mediaMoved: 0, appliedAt: now};
  const recoveryRelativePath = next.production.currentStateArchivePointer.recoveryRelativePath;
  const files = {"current-state-v2/retention-plan.json": retention.plan, "current-state-v2/apply-receipt.json": receipt, [recoveryRelativePath]: current};
  for (const chunk of retention.chunks) files[chunk.relativePath] = chunk;
  const persisted = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `current-state-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files});
  return {receipt, persisted};
});

const {publicDir, artifactDir} = projectDirs(appRoot);
const publicWorkspace = path.join(publicDir, "workspace.json");
const artifactWorkspace = path.join(artifactDir, "workspace.json");
if (shaFile(publicWorkspace) !== shaFile(artifactWorkspace)) throw new Error("current-state-store-post-mirror-mismatch");
const after = readProjectWorkspace(appRoot);
if (after.production.currentStateArchivePointer?.status !== "CURRENT" || after.workspaceSha256 !== committed.persisted.workspaceSha256) throw new Error("current-state-store-post-read-invalid");
console.log(JSON.stringify({...committed.receipt, persistedWorkspaceSha256: committed.persisted.workspaceSha256, transitionSha256: committed.persisted.transitionSha256, workspaceBytesAfter: fs.statSync(publicWorkspace).size, mirrorsMatch: true}, null, 2));
