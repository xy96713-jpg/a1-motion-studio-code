#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {selectVideoShotcraftRecipes} from "../apps/studio-next/src/lib/a1-video-shotcraft-library-v1.mjs";
import {VIDEO_SHOTCRAFT_INTENT_PROFILES, inferVideoShotcraftIntent} from "../apps/studio-next/src/lib/a1-video-shotcraft-intent-matrix-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/video-shotcraft-catalog-v1.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/video-shotcraft-semantic-selection-v1.json"), "utf8"));
const fullEvidence = {cursorTelemetry: true, clickTelemetry: true, realSurface: true, highDpi: true, beforeAfterStates: true, beatGrid: true, multipleTargets: true, multiCursorActors: true, audioSource: true};
assert.equal(fixtures.positive.length, 24);
assert.equal(fixtures.blocked.length, 6);
assert.ok(Object.keys(VIDEO_SHOTCRAFT_INTENT_PROFILES).length >= 24);

const positiveResults = fixtures.positive.map((fixture) => {
  const context = {...fixture, evidence: fullEvidence, limit: 8};
  const inferred = inferVideoShotcraftIntent({...context, intentId: undefined});
  const selection = selectVideoShotcraftRecipes(catalog, context);
  assert.equal(selection.status, "SELECTED_EXISTING_RECIPE", `${fixture.id}:status`);
  assert.equal(selection.intent.intentId, fixture.intentId, `${fixture.id}:intent`);
  assert.equal(selection.selectedRecipeId, fixture.expectedRecipeId, `${fixture.id}:top1`);
  assert.equal(selection.candidates[0].recipeId, fixture.expectedRecipeId, `${fixture.id}:candidate-order`);
  assert.equal(selection.candidates[0].intentCompatible, true, `${fixture.id}:intent-compatible`);
  assert.equal(selection.policy.automaticSelectionAllowed, true, `${fixture.id}:automatic-selection`);
  assert.equal(selection.policy.handAuthoring, "FORBIDDEN_WHILE_EXISTING_RECIPE_FITS");
  assert.ok(inferred.intentId === fixture.intentId || fixture.intentId === "logo-lockup" && inferred.intentId === "logo-lockup", `${fixture.id}:inference`);
  return {id: fixture.id, genre: fixture.genre, intentId: fixture.intentId, selectedRecipeId: selection.selectedRecipeId, selectionSha256: selection.selectionSha256};
});

const blockedResults = fixtures.blocked.map((fixture) => {
  const evidence = {...fullEvidence};
  for (const key of fixture.missingEvidence) evidence[key] = false;
  const selection = selectVideoShotcraftRecipes(catalog, {...fixture, evidence, limit: 8});
  assert.equal(selection.status, "BLOCKED_REQUIRED_EVIDENCE", `${fixture.id}:status`);
  assert.equal(selection.selectedRecipeId, null, `${fixture.id}:selected`);
  assert.ok(selection.failures.includes(fixture.expectedFailure), `${fixture.id}:${fixture.expectedFailure}`);
  assert.equal(selection.policy.automaticSelectionAllowed, false);
  return {id: fixture.id, genre: fixture.genre, intentId: fixture.intentId, status: selection.status, failures: selection.failures, selectionSha256: selection.selectionSha256};
});

const unresolved = selectVideoShotcraftRecipes(catalog, {genre: "product-tutorial", shotFunction: "action", route: "SCREEN_EVIDENCE", needs: ["something-unmodeled"], evidence: fullEvidence});
assert.equal(unresolved.status, "BLOCKED_REQUIRED_EVIDENCE");
assert.equal(unresolved.selectedRecipeId, null);
assert.ok(unresolved.failures.includes("SEMANTIC_INTENT_REQUIRED"));

console.log(JSON.stringify({status: "PASS", contract: "A1VideoShotcraftSemanticSelectionTest/v1", positiveCount: positiveResults.length, top1Accuracy: 1, blockedCount: blockedResults.length, blockedAccuracy: 1, genres: [...new Set(positiveResults.map((item) => item.genre))], positiveResults, blockedResults, unresolvedIntentBlocked: true}, null, 2));
