import assert from "node:assert/strict";

import {
  A1_VISUAL_STYLE_PROFILE_CONTRACT,
  DEFAULT_VISUAL_STYLE_PROFILE_ID,
  getDefaultVisualStyleProfile,
  listVisualStyleProfiles,
  resolveVisualStyleProfile,
  visualStyleProfileToAdapterTokens,
} from "../lib/storyboard-visual-style-profile.js";

const profile = getDefaultVisualStyleProfile();

assert.equal(A1_VISUAL_STYLE_PROFILE_CONTRACT, "A1VisualStyleProfile/v1");
assert.equal(DEFAULT_VISUAL_STYLE_PROFILE_ID, "paper-editorial");
assert.equal(profile.contract, "A1VisualStyleProfile/v1");
assert.equal(profile.id, "paper-editorial");
assert.equal(profile.role, "visual-skin-only");
assert.deepEqual(profile.decoupling, {
  articleUnderstanding: "external",
  shotTaskRouting: "external",
  templateSelection: "external",
});

assert.match(profile.palette.backgroundWarmPaper, /^#f[0-9a-f]{5}$/iu);
assert.equal(profile.palette.charcoal, "#1f1b17");
assert.equal(profile.palette.editorialRed, "#c3362b");
assert.ok(profile.surface.paperTexture.enabled);
assert.ok(profile.surface.paperTexture.opacity <= 0.1);
assert.ok(profile.surface.lowInterferenceGrid.enabled);
assert.ok(profile.surface.lowInterferenceGrid.opacity <= 0.08);

assert.equal(profile.typography.contract, "A1VisualStyleTypographyRoles/v1");
assert.ok(profile.typography.roles.headline.familyStack.length >= 2);
assert.ok(profile.typography.roles.annotation.maxEmphasisWeight <= 650);

assert.equal(profile.assetSlots.contract, "A1VisualStyleAssetSlots/v1");
assert.equal(profile.assetSlots.collage.requiredProvenance, true);
assert.equal(profile.assetSlots.handDrawn.requiredProvenance, true);
assert.equal(profile.assetSlots.collage.renderPolicy, "licensed-or-user-provided-only");
assert.equal(profile.assetSlots.handDrawn.renderPolicy, "licensed-or-user-provided-only");

assert.equal(profile.transitions.contract, "A1VisualStyleTransitionTexture/v1");
assert.ok(profile.transitions.allowedTextures.includes("paper-cut-wipe"));
assert.ok(profile.transitions.disallowedTextures.includes("fake-browser-card"));
assert.ok(profile.motionAmplitude.globalScale > 0 && profile.motionAmplitude.globalScale <= 0.72);
assert.ok(profile.motionAmplitude.cameraPushPx <= 24);

const tokens = visualStyleProfileToAdapterTokens(profile);
assert.equal(tokens.contract, "A1VisualStyleAdapterTokens/v1");
assert.equal(tokens.profileId, "paper-editorial");
assert.equal(tokens.cssVars["--a1-style-bg"], profile.palette.backgroundWarmPaper);
assert.equal(tokens.cssVars["--a1-style-accent"], profile.palette.editorialRed);
assert.equal(tokens.dataAttributes["data-a1-visual-style-contract"], "A1VisualStyleProfile/v1");
assert.equal(tokens.adapterBoundary, "skin-tokens-only");

assert.equal(resolveVisualStyleProfile("unknown").id, "paper-editorial");
assert.equal(resolveVisualStyleProfile("paper-editorial").id, "paper-editorial");
assert.ok(listVisualStyleProfiles().some((item) => item.id === "paper-editorial"));

console.log(JSON.stringify({ contract: profile.contract, defaultProfile: profile.id, adapterTokens: tokens.contract }, null, 2));
