#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const runtime = workspace.production.shotIntelligence;
const plans = runtime.packageLookMasterPlans.filter((plan) => plan.dataChainVersion >= 3 && plan.styleBriefSha256);
assert.ok(plans.length >= 5, "current PACKAGE look-plan style bindings must remain readable");
assert.ok(workspace.production.packagingStyleBriefAudit.briefCount >= 3);
assert.ok(workspace.production.packagingStyleBriefAudit.results.length >= 3);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);

for (const plan of plans) {
  assertPackageLookMasterPlan(plan);
  const style = plan.styleBinding;
  assert.equal(style.contract, "A1ActiveEditorialStyleBinding/v1");
  assert.equal(style.styleSkillId, "a1-retro-pixel-editorial-style");
  assert.equal(style.styleSkillContractVersion, "a1-retro-pixel-editorial-style@v1");
  assert.equal(style.referencePackId, "pinterest-retro-pixel-v1");
  assert.ok(style.fingerprint);
  assert.deepEqual(style.referenceIds, plan.referenceInputs.map((reference) => reference.id));
  assert.deepEqual(style.referenceSha256, plan.referenceInputs.map((reference) => ({id: reference.id, sha256: reference.sha256})));
  assert.equal(style.referenceManifestSha256, plan.referenceManifestSha256);
  assert.ok(style.referenceManifestReferences.length >= style.referenceIds.length);
  for (const historicalReference of style.referenceManifestReferences) {
    const currentReference = referenceManifest.sources.find((reference) => reference.id === historicalReference.id);
    assert.ok(currentReference && currentReference.sha256 === historicalReference.sha256, `historical manifest reference drift: ${historicalReference.id}`);
  }
  for (const reference of style.referenceSources) {
    const file = path.join(appRoot, "public", reference.publicUrl.replace(/^\//u, ""));
    assert.ok(fs.existsSync(file), `reference file missing: ${reference.id}`);
    assert.ok(reference.publicUrl.startsWith("/generated/system-line/reference-packs/pinterest-retro-pixel-v1/"));
  }
  assert.equal(plan.referenceBindingAudit.status, "PASS");
  assert.ok(plan.referenceBindingAudit.current === undefined || plan.referenceBindingAudit.current === true);
  assert.equal(plan.referenceBindingAudit.manifestSourceCount, style.referenceManifestReferences.length);
  assert.deepEqual(plan.referenceBindingAudit.selectedReferences, style.referenceSources);
  assert.deepEqual(plan.referenceBindingAudit.manifestReferences, style.referenceManifestReferences);
  assert.equal(plan.referenceBindingAudit.fingerprint, style.fingerprint);
  assert.equal(plan.planSha256, requirePlanHash(plan));

  if (plan.legacyStyleBinding) assert.equal(plan.legacyStyleBinding.status, "HISTORY_READ_ONLY");
  if (plan.legacyReferenceBindingAudit) assert.equal(plan.legacyReferenceBindingAudit.status, "HISTORY_READ_ONLY");
}

const stale = structuredClone(plans[0]);
delete stale.styleBinding;
assert.throws(() => assertPackageLookMasterPlan(stale), /style-binding/);
console.log(JSON.stringify({status: "PASS", contract: "A1ActiveEditorialStyleBinding/v1", packageLookPlans: plans.length, stylePack: "pinterest-retro-pixel-v1", currentManifestSourceCount: referenceManifest.sources.length, historicalBindingsRemainValid: true, queue: workspace.production.generation.summary, workspaceSha256: workspace.workspaceSha256}, null, 2));

function requirePlanHash(plan) {
  // Keep the regression independent from the migration implementation while
  // using the same canonical identity exported by the production module.
  return crypto.createHash("sha256").update(JSON.stringify(planIdentity(plan))).digest("hex");
}
