#!/usr/bin/env node

import assert from "node:assert/strict";
import {auditTypographyVisualRolePixels, inferTypographyVisualLineCount} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";

const metrics = {visiblePixelRatio: 0.2, visibleBbox: {x: 0.1, y: 0.2, width: 0.5, height: 0.4}, visibleBboxAreaRatio: 0.2};
const plan = (role) => ({typographyActor: role !== "NONE", typographyVisualRole: role});
const passAssessment = (role) => ({
  actualPixelSegmentation: true,
  titleBbox: role === "HERO_TAKEOVER" ? {x: 0.18, y: 0.2, width: 0.64, height: 0.32} : {x: 0.48, y: 0.22, width: 0.34, height: 0.24},
  minGlyphHeightPx: role === "HERO_TAKEOVER" ? 96 : 64,
  headlineSupportHeightRatio: 1.8,
  primaryVisualLayer: role === "SUPPORT_KEYWORD" ? "CO_PRIMARY" : "PRIMARY",
  lineCount: 2,
  threeSecondReadable: true,
  titleRegionPixels: {source: "decoded-candidate-title-bbox-v1", visiblePixelRatio: 0.28, luminanceContrast: 0.24, edgeDensity: 0.08},
});
const smallCornerCard = {
  actualPixelSegmentation: true,
  titleBbox: {x: 0.82, y: 0.84, width: 0.1, height: 0.035},
  minGlyphHeightPx: 18,
  headlineSupportHeightRatio: 0.7,
  primaryVisualLayer: "SUPPORT",
  lineCount: 3,
  threeSecondReadable: false,
  titleRegionPixels: {source: "decoded-candidate-title-bbox-v1", visiblePixelRatio: 0.01, luminanceContrast: 0.01, edgeDensity: 0.001},
};

const failures = {
  "ED-07": auditTypographyVisualRolePixels({plan: plan("PRESENTER_HEADLINE"), metrics, typographyVisual: smallCornerCard}),
  "ED-13": auditTypographyVisualRolePixels({plan: plan("PRESENTER_HEADLINE"), metrics, typographyVisual: smallCornerCard}),
  "ED-19": auditTypographyVisualRolePixels({plan: plan("HERO_TAKEOVER"), metrics, typographyVisual: smallCornerCard}),
  // ED-32's canonical role is NONE; this fixture proves that the legacy
  // corner-toolbar shape cannot pass if a downstream artifact relabels it as
  // a headline.
  "ED-32-legacy-relabel": auditTypographyVisualRolePixels({plan: plan("PRESENTER_HEADLINE"), metrics, typographyVisual: smallCornerCard}),
};
for (const [shotId, result] of Object.entries(failures)) assert.equal(result.status, "FAIL", `${shotId} must fail small-title fixture`);

const passes = {
  ED10: auditTypographyVisualRolePixels({plan: plan("HERO_TAKEOVER"), metrics, typographyVisual: passAssessment("HERO_TAKEOVER")} ),
  ED33: auditTypographyVisualRolePixels({plan: plan("PRESENTER_HEADLINE"), metrics, typographyVisual: passAssessment("PRESENTER_HEADLINE")} ),
};
for (const [shotId, result] of Object.entries(passes)) assert.equal(result.status, "PASS", `${shotId} must pass hero fixture`);
const forgedEmptyBbox = auditTypographyVisualRolePixels({
  plan: plan("HERO_TAKEOVER"),
  metrics,
  typographyVisual: {...passAssessment("HERO_TAKEOVER"), titleRegionPixels: {source: "decoded-candidate-title-bbox-v1", visiblePixelRatio: 0, luminanceContrast: 0, edgeDensity: 0}},
});
assert.equal(forgedEmptyBbox.status, "FAIL", "a declared title bbox over empty pixels must fail");
assert.ok(forgedEmptyBbox.failedChecks.includes("titleRegionVisiblePixels") && forgedEmptyBbox.failedChecks.includes("titleRegionContrast") && forgedEmptyBbox.failedChecks.includes("titleRegionEdgeDensity"));
assert.equal(auditTypographyVisualRolePixels({plan: plan("NONE"), metrics, typographyVisual: null}).status, "NOT_APPLICABLE");
assert.equal(inferTypographyVisualLineCount([
  {boundingBox: {x: 0.11, y: 0.43, width: 0.16, height: 0.12}},
  {boundingBox: {x: 0.42, y: 0.41, width: 0.14, height: 0.11}},
  {boundingBox: {x: 0.64, y: 0.38, width: 0.2, height: 0.1}},
]), 1, "three phrase boxes on one continuous ribbon must count as one visual line");
assert.equal(inferTypographyVisualLineCount([
  {boundingBox: {x: 0.1, y: 0.1, width: 0.3, height: 0.08}},
  {boundingBox: {x: 0.1, y: 0.35, width: 0.3, height: 0.08}},
  {boundingBox: {x: 0.1, y: 0.6, width: 0.3, height: 0.08}},
]), 3, "separated rows must remain three visual lines");

console.log(JSON.stringify({status: "PASS", failedLegacyForms: Object.keys(failures), passedHeroForms: Object.keys(passes), forgedEmptyBboxRejected: true, noneRole: "NOT_APPLICABLE"}, null, 2));
