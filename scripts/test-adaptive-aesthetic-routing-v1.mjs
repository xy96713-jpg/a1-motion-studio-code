#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildPackageLookMasterPlan, buildPackageLookMasterPrompt} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {assertRetroPixelEditorialStyleBrief, compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {buildVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "workspace.json"), "utf8"));
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const runtime = workspace.production.shotIntelligence;

const expected = {
  "ED-12": {route: "SOURCE_BOUND_EVIDENCE", family: "dithered-editorial-poster"},
  "ED-19": {route: "METHOD_SEQUENCE", family: "icon-atlas-interface-language", candidateFamily: "modular-pixel-infographic"},
  "ED-09": {route: "METHOD_SEQUENCE", family: "modular-pixel-infographic"},
};

const compiled = [];
for (const shotId of Object.keys(expected)) {
  const semanticBrief = runtime.semanticDesignBriefSet.briefs.find((item) => item.shotId === shotId);
  const sourceDecision = runtime.decisionSet.items.find((item) => item.sourceHash === semanticBrief?.shotSourceHash);
  const canonical = workspace.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.shotId === shotId);
  const decision = {
    ...sourceDecision,
    baseVisualCarrier: canonical?.frameOccupation === "OVERLAY" ? "PRESENTER_BASE" : sourceDecision?.baseVisualCarrier,
    semanticIntent: canonical?.presenterPackagingRoute?.narrativeValue || "",
    semanticStructure: canonical?.complexityGate?.semanticComplexity?.semanticStructure || null,
  };
  const event = workspace.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds?.includes(decision?.shotId));
  const videoContexts = runtime.videoPackagingContexts.items || runtime.videoPackagingContexts;
  const sourceVideoContext = videoContexts.find((item) => item.shotId === decision?.shotId);
  const videoContext = sourceVideoContext?.assemblyMode === decision?.assemblyMode && sourceVideoContext?.presentationMode === decision?.presentationMode
    ? sourceVideoContext
    : buildVideoPackagingContext({
        decision,
        demand: workspace.library.assets.find((asset) => asset.shotDemand?.shotId === shotId)?.shotDemand || null,
        holdFrame: sourceVideoContext?.baseFrame || null,
        subjectBounds: sourceVideoContext?.subjectBounds || null,
        safeZones: sourceVideoContext?.safeZones || [],
        visualAnchors: sourceVideoContext?.visualAnchors || null,
        createdAt: "2026-08-05T15:00:00.000Z",
      });
  assert.equal(semanticBrief?.status, "READY");
  assert.equal(decision?.packageDecision, "PACKAGE");
  assert.ok(event && videoContext);
  const styleBrief = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, semanticBrief, now: "2026-08-05T15:00:00.000Z"});
  assertRetroPixelEditorialStyleBrief(styleBrief, {appRoot});
  assert.equal(styleBrief.aestheticApplication.contract, "A1EditorialAestheticRouting/v1");
  assert.equal(styleBrief.aestheticApplication.referenceRole, "AESTHETIC_TRAIT_LIBRARY");
  assert.equal(styleBrief.aestheticApplication.fixedOutputStyle, false);
  assert.equal(styleBrief.aestheticApplication.sameAppearanceAcrossShotsForbidden, true);
  assert.ok(styleBrief.styleProfile.rules.includes("one-controlled-base-plus-one-accent")
    || styleBrief.styleProfile.rules.includes("limited-color-roles-with-clear-tension"));
  assert.ok(!styleBrief.styleProfile.rules.includes("cream-or-charcoal-base-plus-one-accent"));
  assert.equal(styleBrief.derivation.aestheticRoute, expected[shotId].route);
  assert.equal(styleBrief.variation.primaryFamily, expected[shotId].family);

  const previous = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const plan = buildPackageLookMasterPlan(decision, styleBrief, {
    videoContext,
    semanticBrief,
    referenceManifest,
    sourceEvidenceInputs: previous?.sourceEvidenceInputs || [],
    recentDirectionFingerprints: [],
    recentTopologyFingerprints: [],
    now: "2026-08-05T15:00:00.000Z",
  });
  assert.equal(plan.styleBinding.aestheticRoutingVersion, 1);
  assert.equal(plan.styleBinding.aestheticRoute, expected[shotId].route);
  assert.equal(plan.styleBinding.aestheticApplication.fixedOutputStyle, false);
  assert.equal(plan.candidateDirections[0].primaryFamily, expected[shotId].candidateFamily || expected[shotId].family);
  assert.equal(plan.candidateDirections[0].aestheticRoute, expected[shotId].route);
  const prompt = buildPackageLookMasterPrompt(plan, 1);
  assert.match(prompt, /AESTHETIC GRAMMAR ONLY — NOT A FIXED OUTPUT STYLE/u);
  assert.match(prompt, new RegExp(expected[shotId].route));
  assert.match(prompt, /do not coat the frame with a repeated retro-pixel look/u);
  compiled.push({shotId, styleBrief, plan, prompt});
}

assert.ok(new Set(compiled.map((item) => item.styleBrief.derivation.aestheticRoute)).size >= 2);
assert.equal(new Set(compiled.map((item) => item.styleBrief.variation.primaryFamily)).size, 3);
assert.equal(new Set(compiled.map((item) => item.styleBrief.variation.palette)).size, 3);
assert.equal(new Set(compiled.map((item) => item.plan.candidateDirections[0].fingerprint)).size, 3);
const ed12Compiled = compiled.find((item) => item.shotId === "ED-12");
assert.ok(!ed12Compiled?.prompt.includes("RESEARCH/EVIDENCE BEAT BLOCKED"));
assert.ok(ed12Compiled?.prompt.includes("Use the actual hold frame only for transition"));
assert.ok(!ed12Compiled?.prompt.includes("REAL WEB SOURCE CONDITIONING"));
assert.ok(compiled.find((item) => item.shotId === "ED-19")?.prompt.includes("Codex"));
assert.ok(compiled.find((item) => item.shotId === "ED-09")?.prompt.includes("抓不住"));

const ed12 = compiled.find((item) => item.shotId === "ED-12");
const sourceRepairStyleBrief = compileRetroPixelEditorialStyleBrief({
  event: workspace.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds?.includes("ED-12")),
  appRoot,
  videoContext: (runtime.videoPackagingContexts.items || runtime.videoPackagingContexts).find((item) => item.shotId === "ED-12"),
  semanticBrief: runtime.semanticDesignBriefSet.briefs.find((item) => item.shotId === "ED-12"),
  referenceExclusions: ["pinterest-retro-pixel-10"],
  variationOverrides: {primaryFamily: "icon-atlas-interface-language", composition: "five-source-cards-on-one-evidence-rail", surfaceLogic: "source-card-atlas-with-quiet-evidence-field"},
  now: "2026-08-05T15:30:00.000Z",
});
assertRetroPixelEditorialStyleBrief(sourceRepairStyleBrief, {appRoot});
assert.ok(!sourceRepairStyleBrief.sourceReferences.some((item) => item.id === "pinterest-retro-pixel-10"));
assert.equal(sourceRepairStyleBrief.variation.primaryFamily, "icon-atlas-interface-language");
assert.notEqual(sourceRepairStyleBrief.fingerprint, ed12?.styleBrief.fingerprint);

console.log(JSON.stringify({
  contract: "A1AdaptiveAestheticRoutingTest/v1",
  status: "PASS",
  referencePackRole: "AESTHETIC_TRAIT_LIBRARY",
  fixedOutputStyle: false,
  routes: compiled.map((item) => ({
    shotId: item.shotId,
    route: item.styleBrief.derivation.aestheticRoute,
    family: item.styleBrief.variation.primaryFamily,
    palette: item.styleBrief.variation.palette,
  })),
  workspaceMutated: false,
  generationPerformed: false,
  sourceReferenceExclusionRepair: "PASS",
}, null, 2));
