#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileSemanticGlyphSequence} from "../apps/studio-next/src/lib/a1-semantic-glyph-behavior-router-v1.mjs";
import {compileGlyphMotionMaterialAdapter, sampleGlyphMotionMaterialState} from "../apps/studio-next/src/lib/a1-glyph-motion-material-adapter-v1.mjs";
import {glyphBehaviorCatalog} from "../apps/studio-next/src/lib/a1-glyph-operator-system-v1.mjs";

const inputs = [
  {id: "motion-a", genre: "evidence-explainer", role: "EVIDENCE", narrativeVerb: "verify", carrier: "FULLSCREEN_TYPE", copy: "核验证据来源"},
  {id: "motion-b", genre: "product-tutorial", role: "PROCESS", narrativeVerb: "transform", carrier: "FULLSCREEN_TYPE", copy: "步骤进入流程"},
  {id: "motion-c", genre: "personal-opinion", role: "VERDICT", narrativeVerb: "challenge", carrier: "FULLSCREEN_TYPE", copy: "判断高于速度"},
];
const plans = compileSemanticGlyphSequence(inputs);
const adapters = plans.map((plan) => compileGlyphMotionMaterialAdapter(plan, {durationFrames: 150, fps: 30}));
const allBehaviorAdapters = glyphBehaviorCatalog().map((behavior) => compileGlyphMotionMaterialAdapter({routeSha256: `route-${behavior.id}`, inputId: `all-${behavior.id}`, exactCopy: "字效系统", behaviorId: behavior.id, profileId: behavior.fontProfile, materialProgram: behavior.id.toLowerCase()}, {durationFrames: 150, fps: 30}));

for (const adapter of allBehaviorAdapters) {
  const pre = sampleGlyphMotionMaterialState(adapter, 0);
  const enter = sampleGlyphMotionMaterialState(adapter, 32);
  const peak = sampleGlyphMotionMaterialState(adapter, 60);
  const hold = sampleGlyphMotionMaterialState(adapter, 100);
  const exit = sampleGlyphMotionMaterialState(adapter, 136);
  const post = sampleGlyphMotionMaterialState(adapter, 149);
  assert.equal(JSON.stringify(sampleGlyphMotionMaterialState(adapter, 60)), JSON.stringify(peak));
  assert.equal(pre.phase, "PRE");
  assert.equal(pre.visibility, 0);
  assert.equal(enter.phase, "ENTER");
  assert.equal(peak.phase, "PEAK");
  assert.equal(hold.phase, "HOLD");
  assert.equal(hold.visibility, 1);
  assert.equal(exit.phase, "EXIT");
  assert.equal(post.phase, "POST");
  assert.equal(post.visibility, 0);
  assert.equal(adapter.rendererBoundary.secondRenderAuthority, false);
  assert.equal(adapter.reviewBoundary.productionAdmission, false);
  assert.equal(adapter.typographyOnlyBoundary.effectTarget, "GLYPH_OUTLINES");
  assert.equal(adapter.typographyOnlyBoundary.outputMode, "TRANSPARENT_GLYPH_ASSET");
  assert.equal(adapter.typographyOnlyBoundary.authoredSceneElementsAllowed, false);
}

const source = fs.readFileSync(path.join(import.meta.dirname, "../apps/studio-next/src/lib/a1-glyph-motion-material-adapter-v1.mjs"), "utf8");
for (const banned of ["Math.random", "Date.now", "performance.now", "setTimeout", "setInterval"]) assert(!source.includes(banned), `banned nondeterminism: ${banned}`);

console.log(JSON.stringify({
  contract: "A1GlyphMotionMaterialAdapterTest/v1",
  status: "PASS",
  adapterCount: allBehaviorAdapters.length,
  behaviorIds: allBehaviorAdapters.map((adapter) => adapter.behaviorId),
  durationFrames: adapters[0].durationFrames,
  fps: adapters[0].fps,
  checks: ["frame-addressable", "duplicate-seek-stable", "pre-enter-peak-hold-exit-post", "readable-hold", "no-wall-clock", "no-random", "single-render-authority"],
}, null, 2));
