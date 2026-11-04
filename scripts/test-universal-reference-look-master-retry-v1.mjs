#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {buildPackageLookMasterPrompt, topologyFingerprint} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const workspace = readProjectWorkspace(appRoot);
const report = JSON.parse(fs.readFileSync(path.join(publicDir, "golden-film-visual-system-maturity-v1/universal-reference-retry-recompile.json"), "utf8"));
const maturity = JSON.parse(fs.readFileSync(path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json"), "utf8"));
const targetShotIds = [...report.targetShotIds].sort();

assert.equal(report.contract, "A1UniversalReferenceLookMasterRetryRecompile/v1");
assert.equal(report.status, "PASS");
assert.deepEqual(report.targetShotIds, targetShotIds);
assert.equal(report.productionMethod, "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION");
assert.equal(report.referencePackagingContract, "A1UniversalReferenceToImagegenPackaging/v1");
assert.equal(report.generatedImageCount, 0);
assert.equal(report.existingPngBytesChanged, false);
assert.equal(report.nonTargetPlanShasUnchanged, true);
assert.ok(Object.entries(report.nonTargetPlanShas).every(([shotId, planSha256]) => workspace.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === shotId)?.planSha256 === planSha256));

const allTopologies = [];
const routeFamilies = {
  BEHIND_SUBJECT_MATTE: ["pixel-type-actor", "dithered-editorial-poster"],
  PRESENTER_CUTOUT_COMPOSITE: ["modular-pixel-infographic", "isometric-machine-collage"],
  SHORT_FULLSCREEN_TAKEOVER: ["pixel-type-actor", "dithered-editorial-poster"],
  SHORT_EXPLAINER_TAKEOVER: ["pixel-type-actor", "dithered-editorial-poster"],
  TYPOGRAPHY_TAKEOVER: ["pixel-type-actor", "dithered-editorial-poster"],
  LANGUAGE_VERDICT: ["pixel-type-actor", "dithered-editorial-poster"],
  METHOD_SEQUENCE: ["modular-pixel-infographic", "isometric-machine-collage"],
  SOURCE_BOUND_EVIDENCE: ["dithered-editorial-poster", "icon-atlas-interface-language"],
};
for (const shotId of targetShotIds) {
  const plan = workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const revision = report.revisions.find((item) => item.shotId === shotId);
  assert.ok(plan && revision, `${shotId} current plan and retry revision required`);
  assert.equal(plan.referencePackaging.contract, "A1UniversalReferenceToImagegenPackaging/v1");
  assert.equal(plan.referencePackaging.productionMethod, "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION");
  assert.equal(revision.currentPlanSha256, plan.planSha256);
  assert.equal(revision.directions.length, plan.candidateBudget);
  const styleBrief = workspace.production.packagingStyleBriefs.find((brief) => brief.styleBriefSha256 === plan.styleBriefSha256);
  const failureCodes = plan.fullLookMasterRepairDirective?.failureCodes || [];
  const expectedFamilies = failureCodes.some((code) => /GLYPH_LEGIBILITY|MISSING_PROTECTED_PHRASE|OCR_EXACT_COPY_MISMATCH/iu.test(code))
    ? styleBrief?.derivation?.aestheticRoute === "METHOD_SEQUENCE"
      ? ["modular-pixel-infographic", "isometric-machine-collage"]
      : ["pixel-type-actor", "dithered-editorial-poster"]
    : failureCodes.some((code) => /LOGO|BRAND|PRODUCT_UI/iu.test(code))
    ? ["typographic-name-field", "editorial-tally-system"]
    : failureCodes.some((code) => /FILLER|OCR_AI|CHARACTER_VERIFICATION/iu.test(code))
      ? ["editorial-object-sequence", "kinetic-word-sculpture"]
      : failureCodes.some((code) => /DUPLICATED_HEADLINE|CONTAINED_PHRASE|OCR_CHINESE|EXACT_COPY/iu.test(code))
        ? ["kinetic-word-sculpture", "editorial-object-metaphor"]
        : routeFamilies[plan.presenterPackagingMode] || routeFamilies[styleBrief?.derivation?.aestheticRoute];
  assert.ok(expectedFamilies, `${shotId} must use a mode-aware or semantic-route full Look Master pair`);
  assert.deepEqual(plan.candidateDirections.map((direction) => direction.primaryFamily), expectedFamilies);
  for (let candidateIndex = 1; candidateIndex <= plan.candidateBudget; candidateIndex += 1) {
    const direction = plan.candidateDirections[candidateIndex - 1];
    const prompt = buildPackageLookMasterPrompt(plan, candidateIndex, {generationMode: "LOOK_MASTER_REFERENCE_ATTACHED"});
    assert.match(prompt, /complete, integrated.*16:9|complete 16:9/iu);
    assert.match(prompt, /attached real images are mandatory multimodal inputs/iu);
    assert.match(prompt, /Render only the protected Chinese phrases/iu);
    assert.match(prompt, /never erode, fold, fragment, texture, occlude, crop, or replace any glyph/iu);
    assert.match(prompt, /warm-yellow, cream, beige, sepia, or old-paper dominant background is forbidden/iu);
    assert.doesNotMatch(prompt, /return a true transparent PNG overlay|EDITOR_SELECTS_OPEN_REGION_AT_INSERTION|checkerboard transparency grid/iu);
    assert.doesNotMatch(prompt, /every visible pixel must stay within x=/iu);
    allTopologies.push(topologyFingerprint(direction));
  }
}
assert.equal(report.candidateTopologyCount, allTopologies.length);
assert.equal(report.crossShotUniqueTopologyCount, new Set(allTopologies).size);
assert.equal(report.crossShotDiversityDeferredToActualPixelSelection, true);
assert.ok(targetShotIds.every((shotId) => new Set(workspace.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === shotId).candidateDirections.map((direction) => direction.primaryFamily)).size >= 2));
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);

console.log(JSON.stringify({status: "PASS", targetShotIds, planShas: Object.fromEntries(targetShotIds.map((shotId) => [shotId, workspace.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === shotId).planSha256])), candidateCount: allTopologies.length, uniqueTopologyCount: new Set(allTopologies).size, phase2: maturity.phases.PHASE_2.status, queue: workspace.production.generation.summary.queued, running: workspace.production.generation.summary.running, worker: workspace.production.generation.workerStatus}, null, 2));
