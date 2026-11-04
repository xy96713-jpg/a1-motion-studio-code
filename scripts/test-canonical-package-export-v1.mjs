#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {readCurrentProductionAuthorizationBinding, assertAuthorizationReceipt, canonicalAuthorizationSha256} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";
import {auditMediaEntrypointAuthorization, assertMediaEntrypointAuthorizationAudit} from "../apps/studio-next/src/lib/a1-media-entrypoint-authorization-v1.mjs";
import {assertApprovedStaticReviewManifest, assertUnboundResolvePackagingHandoff, buildCanonicalPackageExportManifest, buildUnboundResolvePackagingHandoff, writeAtomicWithoutOverwrite} from "../apps/studio-next/src/lib/a1-package-export-contract-v1.mjs";
import {buildPackageExportImplementationBinding} from "../apps/studio-next/src/lib/a1-package-export-implementation-binding-v1.mjs";
import {preflightCanonicalPackageWriter} from "../apps/studio-next/src/lib/a1-canonical-package-writer-preflight-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const reviewRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/static-package-review-v7");
const exportRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/canonical-package-export-v1");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const workspace = readProjectWorkspace(appRoot);
const binding = readCurrentProductionAuthorizationBinding(appRoot);
const reviewBytes = fs.readFileSync(path.join(reviewRoot, "manifest.json"));
const review = assertApprovedStaticReviewManifest(readJson(path.join(reviewRoot, "manifest.json")), sha(reviewBytes));
const implementation = buildPackageExportImplementationBinding(root);
const registry = assertMediaEntrypointAuthorizationAudit(auditMediaEntrypointAuthorization({projectRoot: root}));

const exportRecorded = workspace.production.canonicalPackageExport?.contract === "A1CanonicalPackageExportRecord/v1"
  && workspace.production.canonicalPackageExport?.status === "EXPORTED";
if (exportRecorded) {
  assert.equal(workspace.production.authority.currentStage, "resolve-timeline-binding");
  assert.equal(workspace.production.authority.nextAction.id, "OPEN_RESOLVE_AND_BIND_TIMELINE");
  assert.equal(workspace.production.authority.nextAction.reviewGate, "LIVE_RESOLVE_TIMELINE_REQUIRED");
  assert.equal(workspace.production.packagingAuthorization.receipts.PACKAGE_EXPORT?.status, "CONSUMED");
  assert.equal(workspace.production.canonicalPackageExport.outputCount, 13);
  assert.equal(workspace.production.canonicalPackageExport.resolveInsertAuthorized, false);
  assert.equal(workspace.production.canonicalPackageExport.productionWired, false);
  assert.equal(workspace.production.canonicalPackageExport.finalFilm, false);
} else {
  assert.equal(workspace.production.authority.currentStage, "package-export-authorization");
  assert.equal(workspace.production.authority.nextAction.id, "AUTHORIZE_PACKAGE_EXPORT");
  assert.equal(workspace.production.packagingAuthorization.receipts.PACKAGE_EXPORT, null);
}
assert.equal(workspace.production.authority.nextAction.requiresUser, true);
assert.equal(workspace.production.productionWired, false);
assert.equal(workspace.production.aeLevelProven, false);
assert.equal(registry.status, "STATIC_REVIEW_APPROVED_PACKAGE_EXPORT_IMPLEMENTED");
assert.equal(registry.activeProductionWriterCount, 1);
assert.equal(registry.entries.find((entry) => entry.id === "system-line-canonical-package-export-v1").runtimeGuardRequired, true);
assert.equal(preflightCanonicalPackageWriter({workspace, stage: "PACKAGE_EXPORT", registry, projectRoot: root}).status, "READY_WHEN_PACKAGE_EXPORT_AUTHORIZED");

for (const output of review.outputs) {
  const file = path.join(appRoot, "public", output.outputPath.replace(/^\/+/, ""));
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, output.bytes, `review-bytes:${output.shotId}`);
  assert.equal(sha(bytes), output.sha256, `review-sha:${output.shotId}`);
  assert.equal(output.containsBaseFootage, false);
  assert.equal(output.containsPresenterPixels, false);
  assert.equal(output.containsMicrophonePixels, false);
  assert.equal(output.containsBoomPixels, false);
  assert.equal(output.containsAudio, false);
  assert.equal(output.containsCaptions, false);
  assert.ok(output.nodePixelProofs.every((proof) => Number.isInteger(proof.nonzeroPixelCount) && proof.nonzeroPixelCount > 0), `node-pixel-proof:${output.shotId}`);
}

const syntheticOutputs = review.outputs.map((output) => ({
  shotId: output.shotId,
  route: output.route,
  format: output.route === "OVERLAY_ALPHA" ? "RGBA" : "OPAQUE",
  outputPath: `/generated/system-line/editorial-asset-workbench-v1/canonical-package-export-v1/${output.shotId}.png`,
  sha256: output.sha256,
  bytes: output.bytes,
  routeDecisionReason: output.routeDecisionReason || ["approved-static-review-route"],
  visibleTextNodes: output.visibleTextNodes,
  nodePixelProofs: output.nodePixelProofs,
  bitmapSha256: output.bitmapSha256 || output.sha256,
  containsBaseFootage: false,
  containsPresenterPixels: false,
  containsMicrophonePixels: false,
  containsBoomPixels: false,
  containsAudio: false,
  containsCaptions: false,
  resolveInsertEligible: true,
}));
const exportManifest = buildCanonicalPackageExportManifest({reviewManifestSha256: sha(reviewBytes), contactSheetSha256: review.contactSheet.sha256, implementationSha256: implementation.implementationSha256, workspaceSha256: binding.workspaceSha256, workspaceFileSha256: binding.workspaceFileSha256, transitionSha256: binding.transitionSha256, outputs: syntheticOutputs, exportedAt: "2026-08-11T00:00:00.000Z"});
assert.equal(exportManifest.outputCount, 13);
assert.equal(exportManifest.productionArtifact, true);
assert.equal(exportManifest.packagingDeliverable, true);
assert.equal(exportManifest.resolveInsertEligible, true);
assert.equal(exportManifest.resolveInsertAuthorized, false);
assert.equal(exportManifest.finalFilm, false);
const handoff = buildUnboundResolvePackagingHandoff({exportManifest, exportedAt: exportManifest.exportedAt});
assert.equal(handoff.status, "UNBOUND_TIMELINE_PLAN");
assert.equal(handoff.timelineBindingStatus, "UNBOUND_TIMELINE_PLAN");
assert.equal(handoff.events.length, 13);
assert.ok(handoff.events.every((event) => event.startFrame === null && event.endFrame === null && event.duration === null && event.fps === null));
assert.ok(handoff.events.every((event) => event.assetPixelSources.every((source) => source.sourceKind === "CANONICAL_INDEPENDENT_PACKAGE_PNG")));
assert.ok(handoff.events.every((event) => !event.forbiddenPixelSources.includes("CANONICAL_INDEPENDENT_PACKAGE_PNG")));
assert.ok(handoff.events.every((event) => event.timelineAssetEditableText === false && event.textDeliveryMode === "BAKED_FUSION_PIXEL_GLYPH_OUTLINES" && event.editableTextSpec?.required === false));
assertUnboundResolvePackagingHandoff(handoff);
const fakeRange = structuredClone(handoff); fakeRange.events[0].startFrame = 100;
assert.throws(() => assertUnboundResolvePackagingHandoff(fakeRange), /fake-range/u);

const receiptBody = {contract:"A1PackagingAuthorization/v5",version:5,status:"AUTHORIZED",stage:"PACKAGE_EXPORT",authorizationId:"test-only-not-persisted",authorized:true,issuedBy:"focused-test",intent:"test-only",entrypointId:"system-line-canonical-package-export-v1",targetId:"CURRENT_SYSTEM_LINE_CANONICAL_PACKAGE_EXPORT",outputRoute:"ROUTE_DECISION_REQUIRED",workspaceSha256:binding.workspaceSha256,workspaceFileSha256:binding.workspaceFileSha256,transitionSha256:binding.transitionSha256,issuedAt:"2026-08-11T00:00:00.000Z",implementationSha256:implementation.implementationSha256};
const receipt = {...receiptBody, receiptSha256: canonicalAuthorizationSha256(receiptBody)};
assertAuthorizationReceipt(receipt, {...receiptBody, receiptSha256: undefined});
for (const [key, value] of [["stage", "RESOLVE_INSERT"], ["targetId", "WRONG_TARGET"], ["outputRoute", "OVERLAY_ALPHA"], ["workspaceSha256", "0".repeat(64)], ["transitionSha256", "f".repeat(64)], ["implementationSha256", "e".repeat(64)]]) {
  assert.throws(() => assertAuthorizationReceipt(receipt, {...receiptBody, [key]: value, receiptSha256: undefined}), /authorization|binding-mismatch|required/u);
}

const snapshotTree = (directory) => fs.existsSync(directory) ? fs.readdirSync(directory, {recursive: true, withFileTypes: true}).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath || entry.path, entry.name)).sort().map((file) => [path.relative(directory, file), sha(fs.readFileSync(file))]) : [];
const beforeExportRoot = snapshotTree(exportRoot);
const child = spawnSync(process.execPath, [path.join(root, "scripts/export-canonical-package-assets-v1.mjs")], {cwd: root, env: {...process.env, A1_EXECUTE_MEDIA_WRITER: "", A1_PACKAGE_EXPORT_AUTH_RECEIPT: path.join(root, ".codex-artifacts/system-progress-system-line/nonexistent-package-export-receipt.json")}, encoding: "utf8"});
assert.notEqual(child.status, 0);
assert.match(`${child.stdout}\n${child.stderr}`, /package-export-authorization|explicit-package_export-authorization|authorization-required/u);
assert.deepEqual(snapshotTree(exportRoot), beforeExportRoot);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "a1-package-export-test-"));
try {
  const receiptPath = path.join(temporary, "receipt.json");
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
  const missingIntent = spawnSync(process.execPath, [path.join(root, "scripts/export-canonical-package-assets-v1.mjs")], {cwd: root, env: {...process.env, A1_EXECUTE_MEDIA_WRITER: "", A1_PACKAGE_EXPORT_AUTH_RECEIPT: receiptPath}, encoding: "utf8"});
  assert.notEqual(missingIntent.status, 0);
  assert.match(`${missingIntent.stdout}\n${missingIntent.stderr}`, /canonical-package-export-writer-execution-intent-required/u);
  assert.deepEqual(snapshotTree(exportRoot), beforeExportRoot);

  const exactFile = path.join(temporary, "exact.bin");
  assert.equal(writeAtomicWithoutOverwrite(exactFile, Buffer.from("approved")), "CREATED");
  assert.equal(writeAtomicWithoutOverwrite(exactFile, Buffer.from("approved")), "REUSED_IDENTICAL");
  assert.throws(() => writeAtomicWithoutOverwrite(exactFile, Buffer.from("changed")), /refuses-overwrite/u);
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}

console.log(JSON.stringify({status:"PASS", contract:"A1CanonicalPackageExportFocusedTest/v1", reviewManifestSha256:sha(reviewBytes), implementationSha256:implementation.implementationSha256, outputCount:review.outputs.length, visibleNodeCount:review.actualPixelQa.visibleTextNodeCount, handoffStatus:handoff.status, writerExecuted:false, exportRecorded, resolveProjectMutationPerformed:false}, null, 2));
