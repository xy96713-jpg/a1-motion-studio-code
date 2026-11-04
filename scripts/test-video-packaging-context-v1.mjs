import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {assertPackagingAssemblyPresentationCompatibility} from "../apps/studio-next/src/lib/a1-packaging-presentation-modes-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps", "studio-next", "public");
const manifestFile = path.join(publicRoot, "generated", "system-line", "editorial-asset-workbench-v1", "video-packaging-context-v1", "manifest.json");
const workspaceFile = path.join(publicRoot, "generated", "system-line", "editorial-asset-workbench-v1", "workspace.json");
const currentVisualLedgerFile = path.join(publicRoot, "generated", "system-line", "editorial-asset-workbench-v1", "current-visual-decision-ledger-v1", "ledger.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

assert.ok(fs.existsSync(manifestFile), "video packaging context manifest must exist");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const workspace = JSON.parse(fs.readFileSync(workspaceFile, "utf8"));
const currentVisualLedger = fs.existsSync(currentVisualLedgerFile)
  ? JSON.parse(fs.readFileSync(currentVisualLedgerFile, "utf8"))
  : null;
const packageShotIds = workspace.production.canonicalCreatorPackagingSequence.decisions
  .filter((decision) => decision.packageDecision === "PACKAGE")
  .map((decision) => decision.shotId);
const packageCount = packageShotIds.length;
const contextShotIds = manifest.items.map((context) => context.shotId);
assert.equal(manifest.contract, "A1VideoPackagingContextSet/v1");
assert.ok(manifest.items.length >= packageCount, "verified presenter contexts may outlive package demotion as clean-footage carriers");
assert.deepEqual(packageShotIds.filter((shotId) => !contextShotIds.includes(shotId)), []);
assert.equal(manifest.summary.contextCount, manifest.items.length);
assert.equal(manifest.summary.holdFrameBoundCount, manifest.items.length);
assert.equal(manifest.summary.unverifiedCompatibilityCount, 0);
assert.equal(manifest.summary.recommendationAllowedCount, 0);

for (const shotId of ["ED-08", "ED-33"]) {
  assert.ok(!packageShotIds.includes(shotId), `${shotId} must remain demoted from the current package set`);
  if (currentVisualLedger?.current === true) {
    const entry = currentVisualLedger.entries?.find((candidate) => candidate.shotId === shotId);
    assert.equal(entry?.visualRole, "CLEAN_PRESENTER_FRAME", `${shotId} must remain a clean presenter frame in the current visual ledger`);
    assert.equal(entry?.packageDecision, "NO_PACKAGE", `${shotId} must remain un-packaged in the current visual ledger`);
    const file = path.join(publicRoot, entry.selectedFrame.publicUrl.replace(/^\//u, ""));
    assert.ok(fs.existsSync(file), `${shotId} current clean presenter frame must exist`);
    assert.equal(sha256(fs.readFileSync(file)), entry.selectedFrame.sha256);
  } else {
    assert.ok(contextShotIds.includes(shotId), `${shotId} clean presenter carrier must retain its verified hold frame`);
  }
}
for (const shotId of ["ED-10", "ED-17"]) {
  assert.ok(contextShotIds.includes(shotId), `${shotId} package transition must retain its verified hold frame`);
  assert.ok(packageShotIds.includes(shotId), `${shotId} must remain in the current semantic package set`);
}

for (const context of manifest.items) {
  assertVideoPackagingContext(context);
  assert.equal(context.recommendationAllowed, false);
  if (context.frameStatus === "HOLD_FRAME_BOUND") {
    const file = path.join(publicRoot, context.baseFrame.publicUrl.replace(/^\//u, ""));
    assert.ok(fs.existsSync(file), `${context.shotId} hold frame must exist`);
    assert.equal(sha256(fs.readFileSync(file)), context.baseFrame.sha256);
    assert.ok(Array.isArray(context.visualAnchors.dominantPalette));
    assert.ok(context.availableRegions.length > 0);
  } else {
    assert.equal(context.baseFrame, null);
    assert.equal(context.footageCompatibility, "UNVERIFIED");
    assert.equal(context.recommendationBlocker, "base-video-hold-frame-required");
  }
}

const falseRecommendation = structuredClone(manifest.items[0]);
falseRecommendation.footageCompatibility = "UNVERIFIED";
falseRecommendation.recommendationAllowed = true;
assert.throws(() => assertVideoPackagingContext(falseRecommendation), /video-packaging-context-false-recommendation/);

for (const [assemblyMode, presentationMode] of [
  ["TYPOGRAPHY", "FULLSCREEN"],
  ["TYPOGRAPHY", "EXPLAINER"],
  ["EXPLAINER", "SOURCE_EVIDENCE_TAKEOVER"],
  ["OVERLAY", "PRESENTER_INTEGRATED_LOOK_MASTER"],
]) {
  assert.doesNotThrow(() => assertPackagingAssemblyPresentationCompatibility(assemblyMode, presentationMode));
}
assert.throws(
  () => assertPackagingAssemblyPresentationCompatibility("OVERLAY", "FULLSCREEN"),
  /packaging-assembly-presentation-incompatible/,
);
assert.throws(
  () => assertPackagingAssemblyPresentationCompatibility("TYPOGRAPHY", "PRESENTER_INTEGRATED_LOOK_MASTER"),
  /packaging-assembly-presentation-incompatible/,
);

console.log(JSON.stringify({
  status: "PASS",
  contract: manifest.contract,
  contextCount: manifest.items.length,
  holdFrameBoundCount: manifest.summary.holdFrameBoundCount,
  unverifiedCompatibilityCount: manifest.summary.unverifiedCompatibilityCount,
  recommendationAllowedCount: manifest.summary.recommendationAllowedCount,
  assemblyPresentationCompatibility: "PASS",
}, null, 2));
