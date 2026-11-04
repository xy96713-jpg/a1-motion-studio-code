#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const libRoot = path.join(root, "apps/studio-next/src/lib");
const moduleRoot = path.join(libRoot, "editorial-production");
const shimPath = path.join(libRoot, "a1-editorial-production-v2.mjs");
const testPath = path.resolve(import.meta.filename);
const expectedModules = ["contracts.mjs", "state.mjs", "scene-graph.mjs", "scene-graph-candidate-compiler.mjs", "scene-graph-candidate-layout.mjs", "scene-graph-family-overrides.mjs", "scene-graph", "shot-ir.mjs", "motion-plan.mjs", "index.mjs"];
const expectedSceneGraphModules = ["design-grammar-and-master.mjs", "explicit-visual-primitives.mjs", "foundations.mjs", "lifecycle.mjs", "presenter.mjs", "screen-evidence.mjs"];
const expectedExports = [
  "A1_ACCEPTED_SHOT_IR_CONTRACT",
  "A1_ACCEPTED_SHOT_IR_SET_CONTRACT",
  "A1_ASSET_GENERATION_JOB_CONTRACT",
  "A1_CURRENT_FORMAL_FONT_ASSET_ID",
  "A1_FILM_ASSEMBLY_CONTRACT",
  "A1_FILM_VISUAL_QUALITY_REVIEW_CONTRACT",
  "A1_GENERATION_JOB_STATUSES",
  "A1_PRODUCTION_EVENT_CONTRACT",
  "A1_RENDER_RELEASE_CONTRACT",
  "A1_SCENE_GRAPH_CANDIDATE_CONTRACT",
  "A1_VISUAL_DIRECTOR_PROJECT_CONTRACT",
  "A1_VISUAL_MATURITY_LOOP_CONTRACT",
  "approve540pRelease",
  "approveRepresentativeMotion",
  "approveSceneGraphCandidate",
  "automaticallyAdmitProductionReadyShot",
  "automaticallyAdmitReferenceMatureShot",
  "begin540pRender",
  "bindHandoffActors",
  "buildAcceptedOperationSequence",
  "buildRepresentativeMotionPlan",
  "compileAcceptedShotIr",
  "createFilmVisualQualityReview",
  "createFinalReleaseOnlyAutomationPolicy",
  "createProductionEvent",
  "createProductionState",
  "createSceneGraphCandidates",
  "createVisualMaturityLoopState",
  "ensureProductionState",
  "isFilmVisualQualityPassed",
  "nextProductionAction",
  "prepareDesignCalibrationBatch",
  "queueAssetGeneration",
  "queueCounts",
  "recoverStaleGenerationJobs",
  "register1080pAndDavinciRelease",
  "register540pRenderArtifact",
  "registerFilmVisualQualityReview",
  "registerRepresentativeMotionArtifact",
  "registerRepresentativeMotionCriticPass",
  "request1080pRelease",
  "requestAutomaticFinalRenderAndDavinciRelease",
  "requestFinalRenderAndDavinciRelease",
  "reviewDesignCalibrationBatch",
  "sceneGraphSourceDependencySha256",
  "screenEvidenceMaterialIdForShot",
  "selectScreenEvidenceBeats",
  "updateGenerationJob",
  "updateSceneGraphCandidate",
].sort();

assert.deepEqual(fs.readdirSync(moduleRoot).sort(), expectedModules.sort());
assert.deepEqual(fs.readdirSync(path.join(moduleRoot, "scene-graph")).sort(), expectedSceneGraphModules.sort());
assert.ok(fs.statSync(path.join(moduleRoot, "scene-graph.mjs")).size < 200_000, "scene-graph facade/compiler must stay below 200KB");
for (const moduleName of expectedSceneGraphModules) assert.ok(fs.statSync(path.join(moduleRoot, "scene-graph", moduleName)).size < 60_000, `${moduleName} must stay below 60KB`);
assert.equal(fs.readFileSync(shimPath, "utf8"), 'export * from "./editorial-production/index.mjs";\n');

const indexModule = await import("../apps/studio-next/src/lib/editorial-production/index.mjs");
const shimModule = await import("../apps/studio-next/src/lib/a1-editorial-production-v2.mjs");
assert.deepEqual(Object.keys(indexModule).sort(), expectedExports);
assert.deepEqual(Object.keys(shimModule).sort(), expectedExports);

const sourceRoots = [path.join(root, "apps/studio-next/src"), path.join(root, "scripts")];
const legacyImporters = [];
const visit = (target) => {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (["node_modules", ".next", "generated"].includes(entry)) continue;
      visit(path.join(target, entry));
    }
    return;
  }
  if (!/\.(?:[cm]?js|tsx?)$/u.test(target) || target === shimPath || target === testPath) return;
  if (fs.readFileSync(target, "utf8").includes("a1-editorial-production-v2.mjs")) legacyImporters.push(path.relative(root, target));
};
for (const sourceRoot of sourceRoots) visit(sourceRoot);
assert.deepEqual(legacyImporters, []);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1EditorialProductionModuleSplitTest/v1",
  exportCount: expectedExports.length,
  moduleCount: expectedModules.length + expectedSceneGraphModules.length,
  legacyImporterCount: legacyImporters.length,
}, null, 2));
