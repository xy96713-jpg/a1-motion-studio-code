#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertVideoShotcraftCatalog,
  compileVideoShotcraftAdapterRequest,
  searchVideoShotcraftCatalog,
  selectVideoShotcraftRecipes,
} from "../apps/studio-next/src/lib/a1-video-shotcraft-library-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const catalog = assertVideoShotcraftCatalog(JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/video-shotcraft-catalog-v1.json"), "utf8")));
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(catalog.stats.cardCount, 157);
assert.equal(catalog.stats.localCardCount, 157);
assert.equal(catalog.stats.styleCount, 214);
assert.equal(catalog.stats.localStyleCount, 214);
assert.equal(catalog.stats.cardsWithExactDemo, 157);
assert.equal(catalog.stats.missingDemoCount, 0);
assert.equal(catalog.source.commit, "5e71af35a2daee492dd3ea93e5e8903f32dcd13c");
assert.equal(catalog.source.license, "Apache-2.0");
for (const card of catalog.cards) {
  assert.equal(sha(path.join(root, card.sourcePath)), card.sourceSha256);
  assert.ok(card.demoPaths.length >= 1, `${card.id}:demo-required`);
  for (const demoPath of card.demoPaths) assert.equal(sha(path.join(root, demoPath)), card.demoSha256[demoPath]);
  assert.ok(card.styles.length >= 1, `${card.id}:style-required`);
  assert.ok(card.styles.every((style) => style.previewUrl.startsWith("https://vincentwei1021.github.io/video-shotcraft/")));
}

const evidence = {cursorTelemetry: true, clickTelemetry: true, realSurface: true, highDpi: true, beforeAfterStates: true, beatGrid: true, targetGeometry: true, verifiedCutBoundary: true};
const fixtures = [
  {id: "blind-product-tutorial", genre: "product-tutorial", shotFunction: "action", route: "SCREEN_EVIDENCE", needs: ["cursor", "click", "ui"], evidence},
  {id: "blind-evidence-explainer", genre: "evidence-explainer", shotFunction: "comparison", route: "PACKAGE_LOOK_MASTER", needs: ["data", "comparison"], evidence},
  {id: "blind-personal-opinion", genre: "personal-opinion", shotFunction: "title", route: "PACKAGE_LOOK_MASTER", needs: ["text", "title"], evidence},
];
const selections = fixtures.map((fixture) => selectVideoShotcraftRecipes(catalog, fixture));
for (const selection of selections) {
  assert.equal(selection.status, "SELECTED_EXISTING_RECIPE");
  assert.ok(selection.selectedRecipeId);
  assert.equal(selection.policy.selectionMode, "EXISTING_RECIPE_FIRST");
  assert.equal(selection.policy.handAuthoring, "FORBIDDEN_WHILE_EXISTING_RECIPE_FITS");
  assert.equal(selection.policy.directExternalRender, false);
  assert.ok(selection.candidates[0].demoPaths.length >= 1);
}
assert.equal(new Set(selections.map((selection) => selection.selectedRecipeId)).size, 3);

const screenSelection = selections[0];
const compliantBehaviorFidelity = {route:"SCREEN_EVIDENCE",source:{kind:"REAL_PRODUCT_RECORDING",videoSha256:"9".repeat(64),behaviorManifestSha256:"8".repeat(64),eventOrder:["action","result"],nativeActionCount:1,finalStateFirstVisibleMs:1200},edit:{sourceBehaviorManifestSha256:"8".repeat(64),eventOrder:["action","result"],nativeActionCount:1,nativeStateTimingPreserved:true,nativeStateAppearancePreserved:true,nativeLoadingLifecyclePreserved:true,nativeCopyPreserved:true,nativeResultPreserved:true,sourceUiReconstructed:false,syntheticStateCount:0,finalFrameSliceCount:0,finalStateUsedBeforeNativeAppearance:false,cursorOverlayMode:"TELEMETRY_BOUND_TRANSIENT",cursorTelemetrySameCapture:true,cursorHiddenByFinalHold:true,appliedEffects:["SEMANTIC_ZOOM","TELEMETRY_CURSOR_SMOOTH","TRANSIENT_CLICK_EMPHASIS","RESULT_HOLD_EXTENSION"],behaviorTransforms:[],verifiedGeometryBound:true}};
const adapter = compileVideoShotcraftAdapterRequest({
  selection: screenSelection,
  sourceBinding: {versionId: "screen-v1", artifactSha256: "a".repeat(64)},
  slots: {sourceType: "REAL_SCREEN_RECORDING", sourceWidth: 2560, sourceHeight: 1440, cursorTelemetryBound: true, targetGeometryVerified: true, safeCropVerified: true},
  output: {width: 1920, height: 1080},
  requestedScale: 1.6,
  behaviorFidelity: compliantBehaviorFidelity,
});
assert.equal(adapter.status, "READY");
assert.equal(adapter.fitPolicy.resolvedScale, 1.18);
assert.equal(adapter.fitPolicy.scaleWasClamped, true);
assert.equal(adapter.fitPolicy.stretchForbidden, true);
assert.equal(adapter.execution.handAuthoringAllowed, false);
assert.equal(adapter.execution.directExternalRender, false);

const aspectBlocked = compileVideoShotcraftAdapterRequest({
  selection: screenSelection,
  sourceBinding: {versionId: "screen-v2", artifactSha256: "b".repeat(64)},
  slots: {sourceType: "REAL_SCREEN_RECORDING", sourceWidth: 1080, sourceHeight: 1920, cursorTelemetryBound: true, targetGeometryVerified: true},
  output: {width: 1920, height: 1080},
  behaviorFidelity: compliantBehaviorFidelity,
});
assert.equal(aspectBlocked.status, "BLOCKED");
assert.ok(aspectBlocked.failures.includes("SAFE_CROP_VERIFICATION_REQUIRED_FOR_ASPECT_MISMATCH"));
const behaviorBlocked=compileVideoShotcraftAdapterRequest({selection:screenSelection,sourceBinding:{versionId:"screen-v3",artifactSha256:"c".repeat(64)},slots:{sourceType:"REAL_SCREEN_RECORDING",sourceWidth:2560,sourceHeight:1440,cursorTelemetryBound:true,targetGeometryVerified:true,safeCropVerified:true},behaviorFidelity:{...compliantBehaviorFidelity,edit:{...compliantBehaviorFidelity.edit,nativeStateAppearancePreserved:false,syntheticStateCount:3,finalFrameSliceCount:3,behaviorTransforms:["FINAL_FRAME_RESEQUENCING"]}}});
assert.equal(behaviorBlocked.status,"BLOCKED");
assert.ok(behaviorBlocked.failures.some((failure)=>failure.includes("SOURCE_BEHAVIOR_FIDELITY:SYNTHETIC_PRODUCT_STATE_FORBIDDEN")));
const routeSpoofBlocked=compileVideoShotcraftAdapterRequest({selection:screenSelection,sourceBinding:{versionId:"screen-v4",artifactSha256:"d".repeat(64)},slots:{sourceType:"REAL_SCREEN_RECORDING",sourceWidth:2560,sourceHeight:1440,cursorTelemetryBound:true,targetGeometryVerified:true,safeCropVerified:true},behaviorFidelity:{route:"PACKAGE_LOOK_MASTER",source:{kind:"NON_SCREEN"},edit:{}}});
assert.equal(routeSpoofBlocked.status,"BLOCKED");
assert.ok(routeSpoofBlocked.failures.includes("SOURCE_BEHAVIOR_FIDELITY:SOURCE_VIDEO_SHA_REQUIRED"));

assert.ok(searchVideoShotcraftCatalog(catalog, {query: "cursor", limit: 100}).length >= 2);
assert.ok(searchVideoShotcraftCatalog(catalog, {category: "typography", limit: 100}).every((card) => card.category === "typography"));
console.log(JSON.stringify({status: "PASS", contract: "A1VideoShotcraftLibraryTest/v1", cards: 157, styles: 214, exactDemoCoverage: 157, fixtures: selections.map((selection, index) => ({id: fixtures[index].id, selectedRecipeId: selection.selectedRecipeId, selectionSha256: selection.selectionSha256})), scaleClampedTo: adapter.fitPolicy.resolvedScale, arbitraryAspectBlocked: true, sourceBehaviorMutationBlocked:true, routeSpoofBlocked:true, customMotionBlockedWhenRecipeFits: true}, null, 2));
