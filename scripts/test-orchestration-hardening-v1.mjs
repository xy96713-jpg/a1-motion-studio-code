#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  persistProjectState,
  projectDirs,
  readCheckpointJournal,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  A1_CURRENT_PACKAGING_ROUTE_OWNER,
  A1_DIRECTOR_FINALIZER_ROLE,
  A1_PROJECT_QUALIFICATION_ROLE,
  assertCurrentPackagingRouteOwner,
  assertGatePromotionRole,
  assertGenerationWorkerCompletionBoundary,
} from "../apps/studio-next/src/lib/a1-packaging-orchestration-boundary-v1.mjs";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sourceAppRoot = path.join(root, "apps/studio-next");
const sourceArtifactRoot = path.resolve(sourceAppRoot, "../../.codex-artifacts/system-progress-system-line");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-orchestration-hardening-"));
const tempAppRoot = path.join(tempRoot, "apps/studio-next");
const sourcePublic = path.join(sourceAppRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const sourceArtifact = path.join(sourceArtifactRoot, "editorial-asset-workbench-v1");
fs.mkdirSync(path.dirname(tempAppRoot), {recursive: true});
fs.mkdirSync(path.join(tempAppRoot, "public/generated/system-line"), {recursive: true});
fs.cpSync(sourcePublic, path.join(tempAppRoot, "public/generated/system-line/editorial-asset-workbench-v1"), {recursive: true});
fs.mkdirSync(path.join(tempRoot, ".codex-artifacts/system-progress-system-line"), {recursive: true});
fs.cpSync(sourceArtifact, path.join(tempRoot, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1"), {recursive: true});

const live = readProjectWorkspace(sourceAppRoot);
const tempWorkspace = readProjectWorkspace(tempAppRoot);
assert.equal(tempWorkspace.workspaceSha256, live.workspaceSha256);
assert.throws(
  () => persistProjectState(tempAppRoot, tempWorkspace),
  /persist-project-state-requires-withProjectLock/,
  "persist outside lock must fail",
);
assert.throws(
  () => withProjectLock(tempAppRoot, () => persistProjectState(tempAppRoot, tempWorkspace, {expectedWorkspaceSha256: "stale"})),
  /workspace-cas-mismatch/,
  "stale CAS write must fail",
);

const faultWorkspace = structuredClone(tempWorkspace);
faultWorkspace.production.eventLedger.lastEventId = "fault-injection-no-commit";
const originalSha = tempWorkspace.workspaceSha256;
process.env.A1_CHECKPOINT_FAIL_AFTER_TARGETS = "1";
assert.throws(
  () => withProjectLock(tempAppRoot, () => persistProjectState(tempAppRoot, faultWorkspace, {expectedWorkspaceSha256: originalSha})),
  /checkpoint-fault-injected-after-1-targets/,
  "fault injection must abort the checkpoint",
);
delete process.env.A1_CHECKPOINT_FAIL_AFTER_TARGETS;
const recovered = readProjectWorkspace(tempAppRoot);
assert.equal(recovered.workspaceSha256, originalSha);
assert.equal(recovered.production.eventLedger.lastEventId, tempWorkspace.production.eventLedger.lastEventId);
assert.equal(readCheckpointJournal(tempAppRoot)?.status, "RECOVERED");
assert.equal(fs.existsSync(path.join(projectDirs(tempAppRoot).artifactDir, ".checkpoint-staging")), true);
const committed = withProjectLock(tempAppRoot, () => persistProjectState(tempAppRoot, recovered, {expectedWorkspaceSha256: originalSha}));
assert.equal(committed.journal.status, "COMMITTED");
assert.equal(readCheckpointJournal(tempAppRoot)?.commitId, committed.commitId);
const tempDirs = projectDirs(tempAppRoot);
assert.equal(
  fs.readFileSync(path.join(tempDirs.publicDir, "workspace.json"), "utf8"),
  fs.readFileSync(path.join(tempDirs.artifactDir, "workspace.json"), "utf8"),
  "public and artifact workspace mirrors must remain byte-identical",
);

const workerSource = fs.readFileSync(path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs"), "utf8");
assert.match(workerSource, /assertGenerationWorkerCompletionBoundary/);
assert.doesNotMatch(workerSource, /buildPackageLookMasterPixelAudit|runPackageLookMasterVisualReview|finalizeWholeFilmLookMasterBatch/);
assert.match(workerSource, /Math\.min\(2/);
const blockedPromotion = structuredClone(live);
blockedPromotion.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed = true;
assert.throws(
  () => assertGenerationWorkerCompletionBoundary(live, blockedPromotion),
  /generation-worker-changed-assemblyCreationAllowed/,
);
assert.throws(() => assertCurrentPackagingRouteOwner(live, "legacy-project-autopilot"), /legacy-project-autopilot-not-current-packaging-owner/);
assert.equal(assertCurrentPackagingRouteOwner(live, "system-line-packaging-authority"), A1_CURRENT_PACKAGING_ROUTE_OWNER);
assert.equal(assertCurrentPackagingRouteOwner(live, A1_PROJECT_QUALIFICATION_ROLE), A1_CURRENT_PACKAGING_ROUTE_OWNER);
assert.throws(() => assertCurrentPackagingRouteOwner(live, "unregistered-project-writer"), /system-line-packaging-actor-not-authorized/);
assert.equal(assertGatePromotionRole(A1_DIRECTOR_FINALIZER_ROLE), true);
assert.throws(() => assertGatePromotionRole("imagegen-generation-worker"), /only-packaging-director-finalizer/);

const exceptionFixture = structuredClone(live);
const batch = exceptionFixture.production.shotIntelligence.wholeFilmBatchRecommendation;
const exceptionShotIds = ["ED-01", "ED-14", "ED-16"];
batch.reconciliationRequired = false;
batch.status = "PARTIAL_WITH_EXCEPTIONS";
batch.nextUserGate = "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED";
batch.exceptions = exceptionShotIds.map((shotId) => ({shotId, code: "FIXTURE_EXCEPTION"}));
assert.deepEqual(batch.exceptions.map((item) => item.shotId), exceptionShotIds);
const derived = recalculateEditorialAssetWorkbench(exceptionFixture);
const visualRepairOverridesExceptionStage = live.production.authority?.currentStage === "visual-repair-required";
const canonicalRepairOverridesExceptionStage = ["canonical-title-repair-pending", "canonical-title-repair-generating"].includes(live.production.authority?.currentStage);
assert.equal(derived.production.authority.currentStage, canonicalRepairOverridesExceptionStage ? live.production.authority.currentStage : visualRepairOverridesExceptionStage ? "visual-repair-required" : "film-look-master-exception-repair-required");
assert.equal(derived.production.authority.nextAction.id, canonicalRepairOverridesExceptionStage ? live.production.authority.nextAction.id : visualRepairOverridesExceptionStage ? derived.production.packagingLifecycleProjection.nextActionId : "repair-look-master-exceptions");
assert.deepEqual(derived.production.authority.nextAction.targetShotIds, canonicalRepairOverridesExceptionStage ? live.production.authority.nextAction.targetShotIds : visualRepairOverridesExceptionStage ? derived.production.packagingLifecycleProjection.targetShotIds : exceptionShotIds);
assert.equal(batch.assemblyCreationAllowed, false);
assert.equal(batch.layerReconstructionAllowed, false);
assert.equal(batch.criticAllowed, false);
assert.equal(batch.motionAllowed, false);

console.log(JSON.stringify({
  status: "PASS",
  persistOutsideLock: true,
  staleCasRejected: true,
  faultInjectionRecovered: true,
  committedCheckpoint: committed.commitId,
  workerCannotUnlockDownstream: true,
  legacyAutopilotIsolated: true,
  exceptionStage: derived.production.authority.currentStage,
  exceptionShotIds,
  tempRoot,
}, null, 2));
