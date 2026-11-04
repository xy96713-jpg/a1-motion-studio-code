#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {
  A1_ACTUAL_PIXEL_TASTE_SCORECARD_CONTRACT,
  A1_PINTEREST_TASTE_PROFILE,
  A1_PINTEREST_TASTE_AUTHORITY,
  assertActualPixelTasteReviewInput,
  assertPinterestTasteAuthority,
  auditPinterestTasteSequence,
  buildActualPixelTasteReviewInput,
  routePinterestTaste,
} from "../apps/studio-next/src/lib/a1-pinterest-taste-profile-v1.mjs";
import {assertRetroPixelEditorialStyleBrief, compileRetroPixelEditorialStyleBrief, rehashRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const appRoot = path.resolve("apps/studio-next");
assert.equal(A1_PINTEREST_TASTE_PROFILE.contract, "A1PinterestTasteProfile/v1");
assert.equal(A1_PINTEREST_TASTE_PROFILE.characterPolicy.rabbitRequired, false);
assert.equal(A1_PINTEREST_TASTE_PROFILE.characterPolicy.mascotRequired, false);
assert.deepEqual(Object.keys(A1_PINTEREST_TASTE_PROFILE.densityProfiles).sort(), ["editorial-collision", "poster-dense", "quiet-iconic"]);
assert.equal(A1_PINTEREST_TASTE_PROFILE.densityProfiles["poster-dense"].overlayDefaultAllowed, false);
assert.equal(A1_PINTEREST_TASTE_PROFILE.referenceOnly, true);
assert.equal(A1_PINTEREST_TASTE_PROFILE.productionAssetAllowed, false);
assert.equal(A1_PINTEREST_TASTE_PROFILE.copiedIdentityOrCompositionAllowed, false);
assert.doesNotThrow(() => assertPinterestTasteAuthority(A1_PINTEREST_TASTE_AUTHORITY));
assert.throws(() => assertPinterestTasteAuthority({...A1_PINTEREST_TASTE_AUTHORITY, sourceProposalSha256: "b".repeat(64)}), /authority-sha/);
assert.equal(A1_PINTEREST_TASTE_PROFILE.typographyPolicy.generatedFormalTextAllowed, false);
assert.equal(A1_PINTEREST_TASTE_PROFILE.typographyPolicy.exactCopyRequired, true);
assert.deepEqual(A1_PINTEREST_TASTE_PROFILE.elementLanguage.roleFamilies, ["TYPE_ACTOR", "MATERIAL_SURFACE", "SEMANTIC_OBJECT", "MICRO_CAPTION", "ACCENT_MARK"]);
assert.equal(A1_PINTEREST_TASTE_PROFILE.elementLanguage.compositionContract.primaryActorCount, 1);
assert.equal(A1_PINTEREST_TASTE_PROFILE.elementLanguage.compositionContract.semanticActionCount, 1);
assert.equal(A1_PINTEREST_TASTE_PROFILE.elementLanguage.compositionContract.decorativeElementWallForbidden, true);
assert.equal(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.formalFontAssetId, "type-pixel-correction");
assert.equal(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaRole, "EVA_TYPOGRAPHY_ONLY");
assert.deepEqual(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaAllowedDuties, ["font-design", "glyph-packaging", "formal-title-treatment"]);
assert.ok(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaForbiddenSystemAxes.includes("visual-master"));
assert.ok(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaForbiddenSystemAxes.includes("palette"));
assert.ok(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaForbiddenSystemAxes.includes("composition"));
assert.ok(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaForbiddenSystemAxes.includes("material-surface"));
assert.ok(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaForbiddenSystemAxes.includes("density-profile"));
assert.ok(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaForbiddenSystemAxes.includes("shot-routing"));
assert.ok(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaForbiddenSystemAxes.includes("motion-language"));
assert.ok(A1_PINTEREST_TASTE_PROFILE.elementLanguage.typographySeparation.evaForbiddenFor.includes("presenter-local-marker"));

assert.deepEqual(
  [
    routePinterestTaste({semanticJob: "主持人介绍与呼吸", semanticRoute: "PRESENTER_NEGATIVE_SPACE", packageType: "OVERLAY_PACKAGE"}).densityProfile,
    routePinterestTaste({semanticJob: "人物情绪与感受", semanticRoute: "HUMAN_EMOTION", packageType: "FULLSCREEN_PACKAGE"}).densityProfile,
    routePinterestTaste({semanticJob: "流程步骤拆解", semanticRoute: "METHOD_SEQUENCE", packageType: "FULLSCREEN_PACKAGE"}).densityProfile,
  ],
  ["quiet-iconic", "editorial-collision", "poster-dense"],
);
assert.notEqual(routePinterestTaste({semanticJob: "流程步骤拆解", semanticRoute: "METHOD_SEQUENCE", packageType: "OVERLAY_PACKAGE"}).densityProfile, "poster-dense");

const quietSemantic = {briefSha256: "1".repeat(64), narrativeJob: "主持人介绍与呼吸", semanticActor: {identity: "presenter", action: "enter-and-hold"}, presentation: {type: "OVERLAY"}};
const editorialSemantic = {briefSha256: "2".repeat(64), narrativeJob: "人物情绪与感受", semanticActor: {identity: "person", action: "turn-and-reveal"}, presentation: {type: "FULLSCREEN"}};
const posterSemantic = {briefSha256: "3".repeat(64), narrativeJob: "流程步骤拆解", semanticActor: {identity: "process diagram", action: "connect-stages"}, presentation: {type: "FULLSCREEN"}};
const routedQuiet = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "taste-routed-quiet", sourceBeatIds: ["ED-Q"], packagingType: "OVERLAY_PACKAGE"}, semanticBrief: quietSemantic});
const routedEditorial = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "taste-routed-editorial", sourceBeatIds: ["ED-E"], packagingType: "FULLSCREEN_PACKAGE"}, semanticBrief: editorialSemantic});
const routedPoster = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "taste-routed-poster", sourceBeatIds: ["ED-P"], packagingType: "FULLSCREEN_PACKAGE"}, semanticBrief: posterSemantic});
assert.deepEqual([routedQuiet.tasteDimensions.densityProfile, routedEditorial.tasteDimensions.densityProfile, routedPoster.tasteDimensions.densityProfile], ["quiet-iconic", "editorial-collision", "poster-dense"]);
assert.equal(routedPoster.packageType, "FULLSCREEN_PACKAGE");
assert.doesNotThrow(() => assertRetroPixelEditorialStyleBrief(routedPoster, {appRoot}));

const editorialBudget = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "taste-editorial-budget", sourceBeatIds: ["ED-EB"], packagingType: "FULLSCREEN_PACKAGE", densityProfile: "editorial-collision", semanticJob: "人物情绪"}, variationOverrides: {supportingFamilies: ["pixel-type-actor", "dithered-editorial-poster"]}});
const posterBudget = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "taste-poster-budget", sourceBeatIds: ["ED-PB"], packagingType: "FULLSCREEN_PACKAGE", densityProfile: "poster-dense", semanticJob: "流程步骤"}, variationOverrides: {supportingFamilies: ["pixel-type-actor", "icon-atlas-interface-language"]}});
assert.equal(editorialBudget.variation.supportingFamilies.length, 2);
assert.equal(posterBudget.variation.supportingFamilies.length, 2);

const editorial = compileRetroPixelEditorialStyleBrief({
  appRoot,
  event: {eventId: "taste-editorial-collision", sourceBeatIds: ["ED-31"], packagingType: "FULLSCREEN_PACKAGE", semanticRole: "conclusion", densityProfile: "editorial-collision"},
  variationOverrides: {primaryFamily: "dithered-editorial-poster", composition: "type-image-scale-collision-with-oversized-subject-crop", palette: "orange-charcoal-paper-pink", surfaceLogic: "local-halftone-field", material: "controlled-two-color-misregistration"},
});
assert.equal(editorial.tasteProfile.id, A1_PINTEREST_TASTE_PROFILE.id);
assert.equal(editorial.tasteDimensions.densityProfile, "editorial-collision");
assert.equal(editorial.styleProfile.id, "editorial-collision-retro-pixel-v2");
assert.equal(editorial.fingerprint, editorial.tasteDimensions.fingerprint);
assert.doesNotThrow(() => assertRetroPixelEditorialStyleBrief(editorial, {appRoot}));

const posterOverlay = compileRetroPixelEditorialStyleBrief({
  appRoot,
  event: {eventId: "taste-poster-overlay", sourceBeatIds: ["ED-13"], packagingType: "OVERLAY_PACKAGE", semanticRole: "conclusion", densityProfile: "poster-dense"},
});
assert.throws(() => assertRetroPixelEditorialStyleBrief(posterOverlay, {appRoot}), /poster-dense-overlay-forbidden/);

const reviewInput = buildActualPixelTasteReviewInput({artifactSha256: "a".repeat(64), styleBriefSha256: editorial.styleBriefSha256, fingerprint: editorial.fingerprint, visibleMechanisms: ["one-decisive-primary-actor", "type-image-scale-collision"]});
assert.equal(reviewInput.contract, A1_ACTUAL_PIXEL_TASTE_SCORECARD_CONTRACT);
assert.equal(reviewInput.humanVerdict, "READY_FOR_REVIEW");
assert.equal(reviewInput.machineApproval, false);
assert.doesNotThrow(() => assertActualPixelTasteReviewInput(reviewInput));
assert.throws(() => assertActualPixelTasteReviewInput({...reviewInput, machineApproval: true}), /machine-approval/);
assert.throws(() => assertActualPixelTasteReviewInput({...reviewInput, humanVerdict: "VISUAL_APPROVED"}), /human-reviewer-required/);

const sequence = [
  ["pixel-type-actor", "type-image-scale-collision", "black-white-one-alert", "coarse-halftone", "typography", false],
  ["one-bit-character-object", "sparse-object-stage", "orange-charcoal-paper-pink", "one-bit-dither", "one-bit-narrative-scene", false],
  ["isometric-machine-collage", "perspective-mesh-or-diagram-field", "cyan-charcoal-white", "xerox-grain", "machine-or-tool", true],
  ["dithered-editorial-poster", "photo-mask-editorial-collage", "olive-pink-soft-yellow", "two-color-misregistration", "photographic-object", false],
  ["modular-pixel-infographic", "one-continuous-story-screen", "cobalt-white-soft-green-event", "dot-matrix", "diagram-or-process", true],
  ["retro-computer-window", "unequal-window-cluster", "source-sampled-neutral-one-graphic-accent", "ascii-or-contour-field", "machine-or-tool", false],
].map(([primaryFamily, compositionFamily, paletteRecipe, surfaceFamily, actorKind, crtFusion], index) => ({
  primaryFamily,
  compositionFamily,
  paletteRecipe,
  surfaceFamily,
  actorKind,
  crtFusion,
  semanticAction: crtFusion ? "perform-scan-action" : "",
  fingerprint: `sequence-${index}`,
}));
assert.equal(auditPinterestTasteSequence(sequence).status, "PASS");
assert.equal(auditPinterestTasteSequence([{primaryFamily: "same", fingerprint: "same"}, {primaryFamily: "same", fingerprint: "same"}, {primaryFamily: "same", fingerprint: "same"}]).status, "FAIL");
assert.equal(auditPinterestTasteSequence([
  {primaryFamily: "same", fingerprint: "a"},
  {primaryFamily: "same", fingerprint: "b"},
  {primaryFamily: "same", fingerprint: "c"},
  {primaryFamily: "other-1", fingerprint: "d"},
  {primaryFamily: "other-2", fingerprint: "e"},
  {primaryFamily: "other-3", fingerprint: "f"},
]).failures.includes("same-primary-family-consecutive-limit"), true);
assert.equal(auditPinterestTasteSequence([
  {primaryFamily: "a", speciesOrSilhouetteId: "same-silhouette", fingerprint: "a"},
  {primaryFamily: "b", speciesOrSilhouetteId: "same-silhouette", fingerprint: "b"},
]).failures.includes("same-species-or-silhouette-consecutive"), true);
const crtBrief = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "taste-crt-action", sourceBeatIds: ["ED-CRT"], packagingType: "FULLSCREEN_PACKAGE", semanticJob: "scanline action"}, variationOverrides: {primaryFamily: "scanline-crt-signal"}});
assert.doesNotThrow(() => assertRetroPixelEditorialStyleBrief(crtBrief, {appRoot}));
const invalidCrt = rehashRetroPixelEditorialStyleBrief({...crtBrief, semanticJob: "", semanticAction: "", tasteDimensions: {...crtBrief.tasteDimensions, semanticJob: "", semanticAction: ""}});
assert.throws(() => assertRetroPixelEditorialStyleBrief(invalidCrt, {appRoot}), /crt-semantic-action-required/);
const oldBrief = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "taste-legacy-brief", sourceBeatIds: ["ED-OLD"], packagingType: "FULLSCREEN_PACKAGE"}});
delete oldBrief.tasteDimensions;
oldBrief.fingerprint = [oldBrief.variation.primaryFamily, oldBrief.variation.surfaceLogic, oldBrief.variation.dominantActor, oldBrief.variation.composition, oldBrief.variation.palette].join("|");
assert.doesNotThrow(() => assertRetroPixelEditorialStyleBrief(rehashRetroPixelEditorialStyleBrief(oldBrief), {appRoot}));

console.log(JSON.stringify({status: "PASS", contract: A1_PINTEREST_TASTE_PROFILE.contract, densityProfiles: Object.keys(A1_PINTEREST_TASTE_PROFILE.densityProfiles), machinePassCannotApprove: true, sequenceWindow: 6}, null, 2));
