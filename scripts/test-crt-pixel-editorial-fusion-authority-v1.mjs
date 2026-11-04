#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertFusionAuthority,
  assertFusionGenerationPreflight,
  assertFusionGenerationReadyForShot,
  buildFusionGenerationPreflight,
  compileFusionAuthority,
} from "../apps/studio-next/src/lib/a1-crt-pixel-editorial-fusion-authority-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";

const workspace = JSON.parse(fs.readFileSync("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json", "utf8"));
const overrides = JSON.parse(fs.readFileSync("apps/studio-next/src/data/system-line-creator-packaging-overrides-v1.json", "utf8"));
const authority = compileFusionAuthority(overrides.wholeFilmCompositionDirective.fusionAuthority);
assert.equal(assertFusionAuthority(authority).evaBoundary, "TYPOGRAPHY_ONLY");

const candidate = structuredClone(workspace);
candidate.production.creatorPackagingProjectOverrides = structuredClone(overrides);
candidate.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective.fusionAuthority = authority;
candidate.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(candidate, {now: "2026-08-20T00:00:00.000Z"});
candidate.production.fusionGenerationPreflight = buildFusionGenerationPreflight(candidate);
assert.equal(assertFusionGenerationPreflight(candidate.production.fusionGenerationPreflight, {workspace: candidate}).status, "PASS");

const ed10 = assertFusionGenerationReadyForShot(candidate, "ED-10");
assert.equal(ed10.route, "crt-title-takeover");
assert.equal(ed10.semanticAction, "reject");
assert.equal(ed10.informationOwner, "typography");
assert.equal(ed10.typography.controlsNonTypographyAxes, false);

const ed19 = assertFusionGenerationReadyForShot(candidate, "ED-19");
assert.equal(ed19.route, "presenter-crt-overlay");
assert.equal(ed19.semanticAction, "sequence");
assert.equal(ed19.informationOwner, "presenter");

const missing = structuredClone(candidate);
delete missing.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective.fusionAuthority;
assert.throws(() => buildFusionGenerationPreflight(missing), /fusion-authority-contract-invalid/u);

const tampered = structuredClone(candidate);
const tamperedEd10 = tampered.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === "ED-10");
tamperedEd10.fusionRouteBinding.typography.controlsNonTypographyAxes = true;
tampered.production.fusionGenerationPreflight = buildFusionGenerationPreflight(tampered);
assert.equal(tampered.production.fusionGenerationPreflight.status, "BLOCKED");
assert.throws(() => assertFusionGenerationPreflight(tampered.production.fusionGenerationPreflight, {workspace: tampered}), /fusion-generation-preflight-blocked/u);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1PixelEditorialTaitCrtFusionAuthorityTest/v1",
  authoritySha256: authority.authoritySha256,
  packageShotCount: candidate.production.fusionGenerationPreflight.packageShotCount,
  ed10: {route: ed10.route, semanticAction: ed10.semanticAction, informationOwner: ed10.informationOwner},
  ed19: {route: ed19.route, semanticAction: ed19.semanticAction, informationOwner: ed19.informationOwner},
  failClosedChecks: ["missing-authority", "tampered-eva-boundary"],
}, null, 2));
