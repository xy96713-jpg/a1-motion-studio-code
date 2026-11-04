#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildPackageLayerContentCacheIdentity, buildPackageLayerCandidateCacheKey} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";

const workspacePath = path.resolve("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const runtime = workspace.production.shotIntelligence;
const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const look = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
assert.ok(kit && look, "ED-10 cache fixture required");
if (runtime.ed10FourLayerTrial?.status === "BLOCKED_OCR") {
  const raw = (runtime.rawLayerReferences || []).filter((item) => item.planSha256 === kit.planSha256);
  assert.ok(raw.length > 0 && raw.every((item) => item.status === "HISTORY_READ_ONLY"), "blocked trial raw outputs must be isolated as history");
  assert.equal((kit.layers || []).reduce((count, layer) => count + (layer.candidates || []).length, 0), 0, "blocked trial must not expose partial layer candidates");
  console.log(JSON.stringify({status: "PASS", blockedTrial: true, reason: runtime.ed10FourLayerTrial.failureReason, rawHistoryCount: raw.length, cacheAdmission: "not-run-before-OCR"}, null, 2));
  process.exit(0);
}
const selectedMasterSha256 = look.selectedLookMasterBinding.artifactSha256;
const elementMap = kit.layers.find((layer) => layer.kind === "ELEMENT_KIT").reason.match(/reconstructionMap=([^；]+)/u)?.[1] || "selected-master-pixel-signal-reconstruction";
const base = {layerKind: "ELEMENT_KIT", route: "GENERATE", sourceMasterSha256: selectedMasterSha256, reconstructionMapValue: elementMap, extractionVersion: "direction-05-icon-signal-verdict-microrepair-v1", copySpec: null, editableTextSpecSha256: null, fontSha256: null};
const elementBefore = buildPackageLayerContentCacheIdentity(base);
const elementAfterTypographyCopyRepair = buildPackageLayerContentCacheIdentity({...base, copySpec: {screenCopy: "完成度很高的废稿", protectedBreaks: ["完成度很高", "的", "废稿"]}});
assert.equal(elementBefore, elementAfterTypographyCopyRepair, "Typography copy repair must not invalidate unchanged ELEMENT_KIT content identity");
const typographyBefore = buildPackageLayerContentCacheIdentity({...base, layerKind: "TYPOGRAPHY", copySpec: {screenCopy: "完成度很高 废稿"}, editableTextSpecSha256: "old-spec", fontSha256: "font"});
const typographyAfter = buildPackageLayerContentCacheIdentity({...base, layerKind: "TYPOGRAPHY", copySpec: {screenCopy: "完成度很高的废稿"}, editableTextSpecSha256: "new-spec", fontSha256: "font"});
assert.notEqual(typographyBefore, typographyAfter, "Typography copy repair must invalidate only TYPOGRAPHY");
const elementCandidate = kit.layers.find((layer) => layer.kind === "ELEMENT_KIT").candidates[0];
assert.ok(elementCandidate?.artifact?.publicUrl && elementCandidate.provenance?.deterministicBuild?.sourceMasterSha256 === selectedMasterSha256, "existing ELEMENT_KIT candidate must be source-master bound");
assert.equal(typeof elementCandidate.cache?.hit, "boolean", "ELEMENT_KIT cache state must be explicit");
assert.equal(elementCandidate.provenance?.deterministicBuild?.layerContentHash, elementBefore, "ELEMENT_KIT candidate must bind the current structural content identity");
const elementFile = path.resolve("apps/studio-next/public", elementCandidate.artifact.publicUrl.replace(/^\//u, ""));
assert.ok(fs.existsSync(elementFile), "existing ELEMENT_KIT artifact must remain reusable");
const actualSha = crypto.createHash("sha256").update(fs.readFileSync(elementFile)).digest("hex");
assert.equal(actualSha, elementCandidate.artifact.sha256, "reused ELEMENT_KIT artifact SHA must be stable");
assert.equal(elementCandidate.cache.key, buildPackageLayerCandidateCacheKey({planSha256: kit.planSha256, layerKind: "ELEMENT_KIT", route: "GENERATE", contentSha256: elementCandidate.artifact.sha256, variantNonce: elementCandidate.cache.variantNonce || null}));
console.log(JSON.stringify({status: "PASS", elementContentIdentity: elementBefore, elementArtifactSha256: actualSha, typographyIdentityChanged: typographyBefore !== typographyAfter, cacheKeyBoundToCurrentPlan: true, structuralRevisionCacheHit: elementCandidate.cache.hit, structuralRevisionRequiresFreshArtifact: elementCandidate.cache.hit === false}, null, 2));
