#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertDesignGrammarPack, assertDesignGrammar, resolveDesignGrammar, selectDesignGrammarCalibrationShots} from "../apps/studio-next/src/lib/a1-design-grammar-pack-v1.mjs";
import {solveSceneLayouts} from "../apps/studio-next/src/lib/a1-scene-layout-solver-v1.mjs";

const pack = assertDesignGrammarPack();
assert.equal(pack.familyCount, 6);
const fixtures = [
  {shotId: "ED-01", order: 1, editMode: "presenter-overlay", sourceText: "我来讲这个问题", visualJob: "人物建立问题", motionPhrase: "对象锚定文字"},
  {shotId: "ED-02", order: 2, editMode: "screen-demo", topology: "source-action-detail", sourceText: "划选原句并改写", screenActions: ["选中原句", "原位改写并确认"]},
  {shotId: "ED-06", order: 3, editMode: "screen-demo", topology: "source-surface-crop", sourceText: "扫描真实研究证据"},
  {shotId: "ED-17", order: 4, editMode: "full-package", sourceText: "职责、流程和机制关系"},
  {shotId: "ED-10", order: 5, editMode: "type-only", sourceText: "最后留下一个判断"},
  {shotId: "ED-34", order: 6, editMode: "presenter-clean", sourceText: "安静收束并交接"},
];
const families = new Set();
for (const shot of fixtures) {
  const grammar = assertDesignGrammar(resolveDesignGrammar(shot));
  families.add(grammar.grammarFamilyId);
  const solutions = solveSceneLayouts({shot: {...shot, designGrammar: grammar}, direction: "参考语法校准方向", count: 2});
  assert.equal(solutions.length, 2);
  assert.ok(new Set(solutions.map((solution) => solution.layoutRecipe)).size >= 2);
  assert.ok(solutions.every((solution) => solution.designGrammar.grammarFamilyId === grammar.grammarFamilyId));
  assert.ok(solutions.every((solution) => solution.designGrammar.runtimeReferenceAssetsAllowed === false));
}
assert.equal(families.size, 6);
assert.equal(selectDesignGrammarCalibrationShots(fixtures).length, 6);
console.log(JSON.stringify({contract: "A1DesignGrammarPackTest/v1", status: "PASS", familyCount: families.size, calibrationShotCount: 6, referencePixelsAtRuntime: false, distinctLayoutRecipes: true}, null, 2));
