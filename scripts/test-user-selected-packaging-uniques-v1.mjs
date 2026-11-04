#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const authorityPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/canonical-user-selected-packaging-v1/manifest.json");
const reviewPath = path.join(root, ".codex-artifacts/system-progress-system-line/current-packaging-review-v1/manifest.json");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const authority = readJson(authorityPath);
const workspace = readJson(workspacePath);
const review = readJson(reviewPath);
const currentPhase = readJson(currentPhasePath);
const authorityIsCurrent = authority.workspaceSha256 === workspace.workspaceSha256
  && currentPhase.authority?.workspaceSha256 === authority.workspaceSha256;

assert.equal(authority.contract, "A1UserSelectedPackagingAuthority/v1");
assert.equal(authority.status, "CURRENT_UNIQUE_USER_SELECTION");
assert.equal(authority.productionAdmission, false);
assert.equal(authority.userVisualApproval, "NOT_APPROVED");
assert.equal(authority.uniqueness.pass, true);
assert.equal(authority.uniqueness.selectedShotCount, authority.uniqueness.uniqueShotCount);
assert.equal(new Set(authority.shotSelections.map((item) => item.shotId)).size, authority.shotSelections.length);
assert.equal(authority.preferredBoard.packageShotIds.length, 11);
assert.equal(authority.preferredBoard.exactPixelsMatched, true);
assert.equal(authority.sourceAttachments.every((item) => item.pixelMatch === true), true);

for (const item of authority.shotSelections) {
  const file = publicFile(item.publicUrl);
  assert.equal(fs.existsSync(file), true, `selected file missing: ${item.shotId}`);
  assert.equal(sha256File(file), item.artifactSha256, `selected SHA mismatch: ${item.shotId}`);
  assert.equal(item.current, true, `selected pointer not current: ${item.shotId}`);
}

const ed16 = authority.shotSelections.find((item) => item.shotId === "ED-16");
assert.equal(ed16.selectionRole, "PREFERRED_SHOT_OVERRIDE");
assert.equal(ed16.publicUrl.endsWith("look-masters/ED-16/4f18584d76cf-3efc20b967af-c02.png"), true);
assert.equal(review.selectionAuthorityUsed, "A1UserSelectedPackagingAuthority/v1");
assert.deepEqual(review.packageItems.map((item) => item.shotId), authority.preferredBoard.packageShotIds);
assert.equal(review.counts.blockedPackageCount, 0);
assert.equal(authority.quarantinePlan.status, "PLAN_ONLY_NO_FILES_MOVED");
assert.equal(authority.quarantinePlan.deleted, false);
assert.equal(authority.filesMoved, false);
assert.equal(authority.workspaceMutationPerformed, false);

if (authorityIsCurrent) {
  assert.equal(authority.workspaceSha256, workspace.workspaceSha256);
} else {
  const currentAuthorityText = JSON.stringify({
    phase: currentPhase.authority,
    production: workspace.production?.authority,
    packagingReview: workspace.production?.packagingReview,
  });
  assert.doesNotMatch(currentAuthorityText, /A1UserSelectedPackagingAuthority|canonical-user-selected-packaging-v1/u);
  assert.notEqual(authority.workspaceSha256, workspace.workspaceSha256);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: authority.contract,
  authorityState: authorityIsCurrent ? "CURRENT" : "SUPERSEDED_HISTORY_ONLY",
  uniqueShotCount: authority.uniqueness.uniqueShotCount,
  reviewSelectionAuthority: review.selectionAuthorityUsed,
  blockedPackageCount: review.counts.blockedPackageCount,
  filesMoved: authority.filesMoved,
  deleted: authority.deleted,
}, null, 2));
