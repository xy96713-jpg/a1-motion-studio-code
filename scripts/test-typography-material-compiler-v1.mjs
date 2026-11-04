#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";

import {compileTypographyMaterialCandidates} from "./lib/a1-typography-material-compiler-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fontRoot = path.join(root, "apps/studio-next/public/a1-editorial-fonts");
const topologies = ["SUBJECT_CARVED_WALL", "ORBITAL_PHRASE_FIELD", "EDGE_CROP_TAKEOVER"];
const structures = topologies.map((topology, index) => ({
  candidateId: `ED-01-${topology.toLowerCase()}-v3`,
  topology,
  variant: 3,
  exactCopy: "智能写作工具台",
  planSha256: String(index + 1).repeat(64),
  pixelAudit: {status: "PASS"},
  runs: [
    {id: "run-1", text: "智能写作", left: 200, top: 120, size: 360, scaleX: 0.7, scaleY: 1, rotation: -2},
    {id: "run-2", text: "工具台", left: 1100, top: 630, size: 300, scaleX: 0.7, scaleY: 1, rotation: 2},
  ],
  glyphRuns: [
    {id: "run-1", bounds: {left: 200, top: 120, right: 1100, bottom: 420, width: 900, height: 300}},
    {id: "run-2", bounds: {left: 1100, top: 630, right: 1700, bottom: 880, width: 600, height: 250}},
  ],
}));
const fontCatalog = {
  SOURCE_HAN_SERIF_HEAVY: path.join(fontRoot, "SourceHanSerifCN-Heavy.otf"),
  SOURCE_HAN_SANS_HEAVY: path.join(fontRoot, "SourceHanSansCN-Heavy.otf"),
  SMILEY_SANS_OBLIQUE: path.join(fontRoot, "SmileySans-Oblique.otf"),
  MA_SHAN_ZHENG: path.join(fontRoot, "MaShanZheng-Regular.ttf"),
};

const plans = compileTypographyMaterialCandidates({structureCandidates: structures, fontCatalog});
assert.equal(plans.length, 18);
assert.equal(new Set(plans.map((plan) => plan.planSha256)).size, 18);
for (const topology of topologies) {
  const group = plans.filter((plan) => plan.topology === topology);
  assert.equal(group.length, 6);
  assert.equal(new Set(group.map((plan) => plan.materialRecipeId)).size, 6);
}
for (const plan of plans) {
  assert.equal(plan.contract, "A1TypographyMaterialCandidatePlan/v1");
  assert.equal(plan.exactCopy, "智能写作工具台");
  assert.deepEqual(plan.visibleCopy, ["智能写作", "工具台"]);
  assert.equal(plan.productionAdmission, false);
  assert.equal(plan.userVisualApproval, "NOT_APPROVED");
  assert.equal(plan.renderStage, "MATERIAL_CANDIDATE");
  assert.ok(plan.font.sha256.match(/^[a-f0-9]{64}$/u));
  assert.ok(plan.font.glyphIds.every((glyphId) => glyphId > 0));
  assert.ok(plan.material.gradient.stops.length >= 2);
  assert.equal(plan.material.addedDecorativeCopy.length, 0);
  assert.ok(plan.runs.every((run) => run.fitMode === "MATCH_STRUCTURE_INK_BOUNDS"));
  assert.ok(plan.runs.every((run) => run.fitAudit.widthErrorRatio <= 0.01 && run.fitAudit.heightErrorRatio <= 0.01));
}
assert.throws(() => compileTypographyMaterialCandidates({structureCandidates: structures.filter((item) => item.topology !== "EDGE_CROP_TAKEOVER"), fontCatalog}), /missing-structure-survivor:EDGE_CROP_TAKEOVER/u);
assert.throws(() => compileTypographyMaterialCandidates({structureCandidates: structures.map((item) => ({...item, pixelAudit: {status: "FAIL"}})), fontCatalog}), /missing-structure-survivor/u);

console.log("A1 typography material compiler contract PASS");
