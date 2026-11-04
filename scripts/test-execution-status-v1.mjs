import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {projectExecutionStatusForClient, readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-execution-status-v1-"));
const appRoot = path.join(root, "apps", "studio-next");
const artifactRoot = path.join(root, ".codex-artifacts", "system-progress-system-line");
const publicDir = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
fs.mkdirSync(path.join(artifactRoot, "system-line-current-authority-v2"), {recursive: true});
fs.mkdirSync(publicDir, {recursive: true});

const workspaceSha256 = "a".repeat(64);
const transitionSha256 = "b".repeat(64);
fs.writeFileSync(path.join(artifactRoot, "current-phase.json"), JSON.stringify({
  contract: "A1SystemLineCurrentPhase/v2",
  generatedAt: "2026-08-12T00:00:00.000Z",
  status: "RUNNING",
  authority: {
    projectId: "test-project",
    currentStage: "shot-review",
    workspaceSha256,
    generationQueueProjection: {queued: 1, running: 1, workerStatus: "running"},
    nextAction: {id: "wait-review", label: "等待审图", targetShotIds: ["ED-01"]},
  },
  reviewDecision: {userVisualApproval: "NOT_APPROVED", finalRenderAllowed: false},
  next: {recommended: {id: "wait-review", label: "等待审图", targetShotIds: ["ED-01"]}},
  transitionSha256,
}));
fs.writeFileSync(path.join(publicDir, "active-run.json"), JSON.stringify({
  contract: "A1ActiveRunIndex/v1",
  workspaceSha256,
  transitionSha256,
  status: "RUNNING",
  currentStage: "shot-review",
  nextAction: "wait-review",
  packageCount: 1,
  layerCount: 4,
  cache: {hit: 3, miss: 1},
  queue: {queued: 1, running: 1, workerStatus: "running"},
  assembly: {status: "NOT_CREATED"},
  motion: {status: "NOT_CREATED"},
  approval: "NOT_APPROVED",
}));
fs.writeFileSync(path.join(publicDir, "transition-receipt.json"), JSON.stringify({
  contract: "A1ProductionTransitionReceipt/v1",
  workspaceSha256,
  transitionSha256,
}));
fs.writeFileSync(path.join(artifactRoot, "system-line-current-authority-v2", "report.json"), "{}");
// Deliberately invalid: the hot status path must never parse workspace.json.
fs.writeFileSync(path.join(publicDir, "workspace.json"), "this is not JSON");

const status = readExecutionStatus(appRoot, {includeWorkspaceStat: true});
const hotStatus = readExecutionStatus(appRoot);
const clientStatus = projectExecutionStatusForClient(hotStatus);
assert.equal(status.contract, "A1ExecutionStatus/v1");
assert.equal(status.revision, transitionSha256);
assert.match(status.statusRevision, /^[a-f0-9]{64}$/u);
assert.equal(status.lifecycleRevision, null);
assert.equal(status.workspaceSha256, workspaceSha256);
assert.equal(status.queue.running, 1);
assert.equal(status.cache.hit, 3);
assert.equal(status.nextAction.id, "wait-review");
assert.equal(status.status, "RUNNING");
assert.equal(status.persistedStatus, "RUNNING");
assert.equal(status.effectiveAuthority.contract, "A1EffectiveReviewAuthority/v1");
assert.equal(status.effectiveAuthority.source.mode, "PERSISTED_BASE_ONLY");
assert.equal(status.effectiveAuthority.nextAction.id, "wait-review");
assert.equal(status.effectiveAuthority.workspaceMutationPerformed, false);
assert.equal(status.parity.inSync, true);
assert.equal(status.fullWorkspaceBytes, 16);
assert.equal(hotStatus.files.workspace, null);
assert.equal(hotStatus.fullWorkspaceBytes, null);
assert.equal(hotStatus.packagingParagraphLifecycle, null);
assert.equal(hotStatus.packagingParagraphAutoReview, null);
assert.equal(hotStatus.storyboardInteropDryRun, null);
assert.equal(clientStatus.contract, "A1ExecutionStatus/v1");
assert.equal(clientStatus.files, undefined);
assert.equal(clientStatus.fullWorkspaceBytes, undefined);
assert.equal(clientStatus.statusRevision, hotStatus.statusRevision);
assert.equal(clientStatus.storyboardInteropDryRun, null);

const storeSource = fs.readFileSync(path.join(process.cwd(), "apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs"), "utf8");
assert.match(storeSource, /stageAppendText/);
assert.match(storeSource, /entry\.mode === "append"/);
assert.match(storeSource, /fs\.truncateSync\(target, entry\.beforeBytes\)/);
assert.match(storeSource, /transition\?\.workspaceFileSha256 \|\| sha256File/);
assert.match(storeSource, /const workspaceBytes = Buffer\.from/);
assert.match(storeSource, /writeMirroredBytes\(\{publicDir, artifactDir\}, "workspace\.json", workspaceBytes\)/);
assert.match(storeSource, /writeMirroredJson\(\{publicDir, artifactDir\}, "client-bootstrap\.json"/);
assert.doesNotMatch(storeSource, /writeJsonAtomic\(publicDir, "workspace\.json", workspace\)/);
const pageSource = fs.readFileSync(path.join(process.cwd(), "apps/studio-next/src/app/system-line-visual-workbench/page.tsx"), "utf8");
// Execute SSR and the real bootstrap route against isolated current/stale fixtures.
await import("./test-workbench-ssr-bootstrap-contract-v1.mjs");
assert.doesNotMatch(pageSource, /workspace\.json/);
const executionRouteSource = fs.readFileSync(path.join(process.cwd(), "apps/studio-next/src/app/api/system-line/execution-status/route.ts"), "utf8");
assert.match(executionRouteSource, /status\.statusRevision/);
assert.match(executionRouteSource, /execution-status-authority-parity-invalid/);
assert.match(executionRouteSource, /A1ArticleAssetProductionAuthority\/v1/);
assert.doesNotMatch(executionRouteSource, /readExecutionStatus|projectExecutionStatusForClient/);
assert.doesNotMatch(executionRouteSource, /status\.revision \? `\\\"\$\{status\.revision\}/);
const snapshotSource = fs.readFileSync(path.join(process.cwd(), "apps/studio-next/src/lib/a1-workbench-client-snapshot-v1.mjs"), "utf8");
assert.match(snapshotSource, /generation\.jobs = clientWorkspace\.production\.generation\.jobs\.filter/);
assert.match(snapshotSource, /lookMasterRawReferences = .*filter/);
assert.match(snapshotSource, /packageLookMasterPlanHistory/);
assert.match(snapshotSource, /staticPackageReview\.history/);
const clientSource = fs.readFileSync(path.join(process.cwd(), "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"), "utf8");
assert.match(clientSource, /setExecutionStatus\(payload\.status\)/);
assert.match(clientSource, /previousRevision.*payload\.status\.revision/su);
assert.doesNotMatch(clientSource, /previousRevision.*payload\.status\.statusRevision.*await refresh/su);
const productionSource = fs.readFileSync(path.join(process.cwd(), "apps/studio-next/src/lib/editorial-production/state.mjs"), "utf8");
assert.match(productionSource, /assetStageId: asset\.stageId/);
const workerSource = fs.readFileSync(path.join(process.cwd(), "scripts/run-editorial-asset-workbench-jobs-v2.mjs"), "utf8");
assert.match(workerSource, /foundationAsset = \["background-foundry", "element-atlas", "key-backgrounds"\]\.includes\(job\.assetStageId\)/);
assert.doesNotMatch(workerSource, /const targetAsset = job\.assetId \? readProjectWorkspace\(appRoot\)/);

fs.rmSync(root, {recursive: true, force: true});
console.log(JSON.stringify({status: "PASS", contract: "A1ExecutionStatus/v1", fullWorkspaceRead: false, appendRecovery: true}));
