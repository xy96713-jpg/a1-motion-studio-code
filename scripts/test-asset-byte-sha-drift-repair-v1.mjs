#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const beforeFileSha = crypto.createHash("sha256").update(fs.readFileSync(workspacePath)).digest("hex");
const targets = ["bg-warm-paper-dot", "bg-halftone-cream", "bg-oxblood-revision"];
for (const assetId of targets) {
  const asset = workspace.library.assets.find((item) => item.id === assetId);
  const file = path.join(root, "apps/studio-next/public", asset.assetUri.replace(/^\//u, ""));
  assert.equal(asset.sha256, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
  assert.equal(asset.review.status, "pending");
  assert.equal(asset.review.approvedContentSha256, null);
}
const attempted = spawnSync(process.execPath, [
  "scripts/repair-asset-byte-sha-drift-v1.mjs",
  "--dry-run",
  "--expected-workspace-sha",
  workspace.workspaceSha256,
  "--asset-ids",
  "bg-warm-paper-dot,bg-halftone-cream,bg-oxblood-revision",
], {cwd: root, encoding: "utf8"});
assert.notEqual(attempted.status, 0);
assert.match(attempted.stderr, /asset-byte-sha-repair-no-drift/);
assert.equal(workspace.production.authority.currentStage, "ed10-look-master-replacement-review");
assert.equal(workspace.production.authority.nextAction.id, "confirm-ed10-direction-c-before-eva-rebuild");
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
const afterFileSha = crypto.createHash("sha256").update(fs.readFileSync(workspacePath)).digest("hex");
assert.equal(afterFileSha, beforeFileSha, "dry run must not mutate workspace bytes");
console.log(JSON.stringify({status: "PASS", alignedAssetCount: targets.length, repeatRepairRejected: true, workspaceUnchanged: true}));
