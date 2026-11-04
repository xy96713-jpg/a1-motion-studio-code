#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {projectExecutionStatusForClient, readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const status = readExecutionStatus(appRoot, {includeWorkspaceStat: true});
assert.equal(status.contract, "A1ExecutionStatus/v1");
assert.equal(typeof status.fullWorkspaceBytes, "number");
assert.equal(typeof status.files.workspace?.bytes, "number");
assert.equal(status.packagingParagraphLifecycle, null, "superseded paragraph canary must not remain current when article asset authority is active");
assert.equal(status.packagingParagraphAutoReview, null);
const currentAuthorityStatus = status.status;
const currentNextActionId = status.nextAction?.id;
assert.equal(status.status, currentAuthorityStatus);
assert.equal(status.persistedStatus, currentAuthorityStatus);
assert.equal(typeof currentNextActionId, "string");
assert.equal(status.effectiveAuthority?.contract, "A1EffectiveReviewAuthority/v1");
assert.equal(status.effectiveAuthority?.persistedBaseAuthority?.status, currentAuthorityStatus);
assert.equal(status.effectiveAuthority?.persistedBaseAuthority?.nextAction?.id, currentNextActionId);
assert.equal(status.effectiveAuthority?.boundary?.userVisualApproval, "NOT_APPROVED");
assert.equal(status.lifecycleRevision, null);
assert.equal(status.statusRevision.length, 64);
assert.ok(Buffer.byteLength(JSON.stringify(status)) < 144 * 1024, "internal execution status including validated authorities must remain below 144 KiB");
assert.ok(Buffer.byteLength(JSON.stringify(projectExecutionStatusForClient(status))) < 64 * 1024, "browser execution status must remain below 64 KiB");
const bootstrapPath = path.join(appRoot, "public", "generated", "system-line", "editorial-asset-workbench-v1", "client-bootstrap.json");
const artifactBootstrapPath = path.join(root, ".codex-artifacts", "system-progress-system-line", "editorial-asset-workbench-v1", "client-bootstrap.json");
assert.ok(fs.existsSync(bootstrapPath), "packaging bootstrap must exist");
assert.ok(fs.existsSync(artifactBootstrapPath), "artifact packaging bootstrap must exist");
const bootstrapText = fs.readFileSync(bootstrapPath, "utf8");
assert.ok(Buffer.byteLength(bootstrapText) < 2 * 1024 * 1024, "parked formal-board history bootstrap must remain below 2 MiB");
const bootstrap = JSON.parse(bootstrapText);
assert.equal(bootstrap.contract, "A1EditorialWorkbenchClientBootstrap/v1");
assert.equal(bootstrap.snapshotKind, "PACKAGING_ONLY");
assert.equal(bootstrap.workspaceSha256, status.workspaceSha256);
assert.equal(bootstrap.workspace.production.articleAssetProductionAuthority, undefined);
const bootstrapAuthorityStatus = bootstrap.workspace.production.packagingLifecycleProjection.status;
if (bootstrapAuthorityStatus !== currentAuthorityStatus) {
  assert.equal(currentAuthorityStatus, "ACTIVE_REVIEW_GATED");
  assert.equal(bootstrapAuthorityStatus, "WHOLE_FILM_STATIC_BOARD_READY");
  assert.equal(status.effectiveAuthority.boundary.userVisualApproval, "NOT_APPROVED");
}
assert.deepEqual(bootstrap.workspace.production.packagingLifecycleProjection.blockedShotIds, []);
if (bootstrapAuthorityStatus === "WHOLE_FILM_STATIC_BOARD_READY") {
  assert.equal(
    bootstrap.workspace.production.shotIntelligence.wholeFilmStaticBoard.itemCount,
    bootstrap.workspace.production.packagingLifecycleProjection.candidateAuthorityAudit.itemCount,
  );
  assert.equal(
    bootstrap.workspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.itemCount,
    bootstrap.workspace.production.shotVisualCoveragePlan.counts.shotCount,
  );
} else {
  assert.equal(bootstrap.workspace.production.shotIntelligence.wholeFilmStaticBoard, undefined);
}
assert.equal("library" in bootstrap.workspace, false);
assert.equal("visualBible" in bootstrap.workspace.production, false);
assert.equal("generation" in bootstrap.workspace.production, false);
if (bootstrapAuthorityStatus === "WHOLE_FILM_STATIC_BOARD_READY") {
  assert.equal(bootstrap.workspace.production.wholeFilmPackagingDirection.contract, "A1WholeFilmPackagingDirection/v1");
} else {
  assert.equal(bootstrap.workspace.production.wholeFilmPackagingDirection, undefined);
}
assert.equal("shotIntelligence" in bootstrap.workspace.production, true);
assert.equal("storyboardProductionProjection" in bootstrap.workspace.production, false);
assert.equal("packagingBeatPlan" in bootstrap.workspace.production, false);
assert.equal(fs.readFileSync(artifactBootstrapPath, "utf8"), bootstrapText);

const routeSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/route.ts"), "utf8");
assert.match(routeSource, /searchParams\.get\("mode"\)/);
assert.match(routeSource, /mode === "summary"/);
assert.match(routeSource, /const resolvedMode = mode === "bootstrap" \|\| mode === "client"/);
assert.match(routeSource, /mode !== resolvedMode/);
assert.match(routeSource, /\/api\/system-line\/execution-status/);
assert.doesNotMatch(routeSource, /readExecutionStatus|readProjectWorkspace|readWorkspace\(/);
assert.match(routeSource, /client-bootstrap\.json/);
assert.match(routeSource, /snapshotKind !== "PACKAGING_ONLY"/);
assert.match(routeSource, /bootstrap\.workspaceSha256 !== receipt\.workspaceSha256/);
assert.match(routeSource, /workbench-bootstrap-stale/);
assert.match(routeSource, /modeWasDefaulted: true/);

const auditSource = fs.readFileSync(path.join(root, "scripts/audit-editorial-asset-workbench-v1.mjs"), "utf8");
assert.match(auditSource, /scanMode: "bounded-filesystem-manifest"/);
assert.doesNotMatch(auditSource, /readdirSync\(publicDir, \{recursive: true\}\)/);
const pageSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/page.tsx"), "utf8");
assert.doesNotMatch(pageSource, /workspace\.json/);
assert.match(pageSource, /StoryboardWorkbenchShell/);
assert.match(pageSource, /params\.history==='1'&&params\.view==='shots'/);
assert.match(pageSource, /fetchInitialWorkspace/);
const clientSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"), "utf8");
assert.match(clientSource, /editorial-asset-workbench\?mode=bootstrap/);
assert.match(clientSource, /If-None-Match/);
assert.match(clientSource, /packagingParagraphLifecycle/);
assert.match(clientSource, /setExecutionStatus\(payload\.status\)/);
const executionStatusSource = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-execution-status-v1.mjs"), "utf8");
assert.match(executionStatusSource, /readPackagingParagraphCanaryLifecycle/);
assert.match(executionStatusSource, /readPackagingParagraphEffectiveLifecycle/);
assert.match(executionStatusSource, /buildPackagingParagraphAutoReviewProjection/);
assert.match(executionStatusSource, /lifecycleRevision/);
assert.doesNotMatch(executionStatusSource, /readJsonIfPresent\(paths\.workspace\)/);
assert.doesNotMatch(executionStatusSource, /readFileSync\(paths\.workspace/);
const lifecycleSource = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs"), "utf8");
assert.match(lifecycleSource, /BOUNDED_EXACT_PATH_EVIDENCE_RECONCILIATION_NO_MEDIA_TREE_SCAN/);
assert.doesNotMatch(lifecycleSource, /readdirSync\([^\n]+recursive:\s*true/u);
const snapshotSource = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-workbench-client-snapshot-v1.mjs"), "utf8");
assert.match(snapshotSource, /lifecycleProjection\.status === "WHOLE_FILM_STATIC_BOARD_READY"/);
assert.match(snapshotSource, /wholeFilmStaticBoard: structuredClone\(runtime\.wholeFilmStaticBoard\)/);
assert.match(snapshotSource, /cloneSelectedKeys\(workspace\.production, PACKAGING_PRODUCTION_KEYS/);
assert.doesNotMatch(snapshotSource, /structuredClone\(workspace\.production\)/);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1EditorialAssetWorkbenchSummary/v1-over-A1ExecutionStatus/v1",
  fullWorkspaceRead: false,
  fullWorkspaceBytes: status.fullWorkspaceBytes,
  packagingBootstrapBytes: Buffer.byteLength(bootstrapText),
  executionStatusBytes: Buffer.byteLength(JSON.stringify(status)),
  paragraphLifecycleStatus: status.packagingParagraphLifecycle?.status,
  recursivePublicRootScan: false,
}, null, 2));
