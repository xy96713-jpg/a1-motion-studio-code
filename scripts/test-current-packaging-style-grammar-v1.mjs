#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/current-packaging-style-grammar-v1/manifest.json");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/current-packaging-style-grammar-v1/manifest.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicManifest = read(publicPath);
const artifactManifest = read(artifactPath);
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

assert.deepEqual(publicManifest, artifactManifest, "public-artifact-style-grammar-parity");
assert.equal(publicManifest.contract, "A1CurrentPackagingStyleGrammar/v1");
assert.equal(publicManifest.status, "CURRENT_REVIEW_POLICY");
assert.equal(publicManifest.current, true);
assert.equal(publicManifest.productionAdmission, false);
assert.equal(publicManifest.userVisualApproval, "NOT_APPROVED");
assert.equal(publicManifest.styleId, "dithered-editorial-pixel-screenprint-v1");
assert.equal(publicManifest.sourceAuthority.visualPolicyContract, "A1EditorialVisualGenerationPolicy/v1");
assert.equal(publicManifest.sourceAuthority.visualPolicySha256, "21d94575aac0f628740f3b8125c872d1dc24ef8e681445502a6c45e58cc47bea");
assert.equal(publicManifest.sourceAuthority.preferredCurrentShotId, "ED-16");
assert.equal(publicManifest.sourceAuthority.preferredCurrentArtifactSha256, "43b5d76be5e9a4bd712c219e47559bd1fd4383f36bf8b341d41a1d61da319be2");
assert.equal(hashFile(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/look-masters/ED-16/4f18584d76cf-3efc20b967af-c02.png")), publicManifest.sourceAuthority.preferredCurrentArtifactSha256);

for (const route of ["PRESENTER_LOCAL_MARKER", "SCREEN_EVIDENCE", "EXPLAINER", "VERDICT", "HERO_TYPOGRAPHY", "NO_PACKAGE"]) assert.ok(publicManifest.routes[route], `route-missing:${route}`);
assert.equal(publicManifest.routes.PRESENTER_LOCAL_MARKER.typeRole, "MICRO_CAPTION");
assert.equal(publicManifest.routes.PRESENTER_LOCAL_MARKER.primaryFamily, "pixel-type-actor");
assert.equal(publicManifest.routes.VERDICT.typeRole, "EVA_HEADLINE");
assert.equal(publicManifest.routes.HERO_TYPOGRAPHY.typeRole, "EVA_HEADLINE");
assert.equal(publicManifest.routes.NO_PACKAGE.typeRole, "NO_TYPE");
assert.deepEqual(publicManifest.contentTreatmentToRoute, {
  PIXEL_WINDOW: "PRESENTER_LOCAL_MARKER",
  HERO_TYPOGRAPHY: "HERO_TYPOGRAPHY",
  EDITORIAL_EXPLAINER: "EXPLAINER",
  REAL_EVIDENCE: "SCREEN_EVIDENCE",
  PRESENTER: "PRESENTER_LOCAL_MARKER",
  NO_PACKAGE: "NO_PACKAGE",
});
assert.equal(publicManifest.typographyRoles.MICRO_CAPTION.fontAssetId, "type-pixel-correction");
assert.equal(publicManifest.typographyRoles.MICRO_CAPTION.sizeClass, "SMALL");
assert.equal(publicManifest.typographyRoles.EVA_HEADLINE.treatment, "EVA_TEXTURE_ONLY");
assert.equal(publicManifest.typographyRoles.EVA_HEADLINE.exactCopyRequired, true);
assert.ok(publicManifest.typographyRoles.EVA_HEADLINE.notAllowedFor.includes("PRESENTER_LOCAL_MARKER"));
assert.ok(publicManifest.invariants.some((item) => item.includes("口播画面默认使用像素小字")));
assert.ok(publicManifest.invariants.some((item) => item.includes("EVA 是受控")));
// Absolute ban on the AI-template vertical accent bar next to headlines.
assert.ok(publicManifest.visualGrammar.forbidden.includes("template-vertical-accent-bar"), "vertical-accent-bar-must-be-forbidden");
assert.ok(publicManifest.invariants.some((item) => item.includes("禁止") && item.includes("竖")), "vertical-bar-invariant-required");
assert.ok(!publicManifest.visualGrammar.forbidden.includes("pixel-type-actor"));

console.log(JSON.stringify({
  status: "PASS",
  contract: publicManifest.contract,
  styleId: publicManifest.styleId,
  routes: Object.fromEntries(Object.entries(publicManifest.routes).map(([key, value]) => [key, value.typeRole])),
  microCaptionFont: publicManifest.typographyRoles.MICRO_CAPTION.fontAssetId,
  evaTreatment: publicManifest.typographyRoles.EVA_HEADLINE.treatment,
  productionAdmission: publicManifest.productionAdmission,
}, null, 2));
