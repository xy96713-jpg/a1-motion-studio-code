#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

import {inferPresenterMarkerGrammar, PRESENTER_MARKER_GRAMMARS} from "../apps/studio-next/src/lib/a1-editorial-shot-director-v1.mjs";
import {
  assertPresenterSemanticMarkerLayout,
  compilePresenterSemanticMarkerLayout,
} from "../apps/studio-next/src/lib/a1-presenter-semantic-marker-layout-v1.mjs";

const frame = {width: 1920, height: 1080};
const leftRegion = {id: "LEFT_NEGATIVE_SPACE", x: 0.04, y: 0.065, width: 0.34, height: 0.29, busyness: 0.08};
const rightRegion = {id: "RIGHT_NEGATIVE_SPACE", x: 0.64, y: 0.08, width: 0.33, height: 0.30, busyness: 0.08};
const rightProtected = [
  {id: "SUBJECT", x: 0.44, y: 0.23, width: 0.31, height: 0.76},
  {id: "MICROPHONE", x: 0.23, y: 0.42, width: 0.26, height: 0.22},
];
const leftProtected = [
  {id: "SUBJECT", x: 0.18, y: 0.2, width: 0.36, height: 0.78},
  {id: "MICROPHONE", x: 0.48, y: 0.43, width: 0.24, height: 0.2},
];

const holdouts = [
  {
    sourceText: "我最近做了一个个人财务研究工具。",
    expectedGrammar: PRESENTER_MARKER_GRAMMARS.IDENTITY_LOCKUP,
    copyPlan: {eyebrow: "PERSONAL TOOL", primary: ["财务研究", "工具"]},
  },
  {
    sourceText: "有人会问，为什么不用 AI 一键生成整份报告？",
    expectedGrammar: PRESENTER_MARKER_GRAMMARS.QUESTION_ECHO,
    copyPlan: {eyebrow: "既然已经有 AI", primary: ["为什么不", "一键生成报告"], questionMark: "？"},
  },
  {
    sourceText: "速度确实快了一些，但判断问题仍未解决。",
    expectedGrammar: PRESENTER_MARKER_GRAMMARS.CONTRAST_CORRECTION,
    copyPlan: {eyebrow: "速度快了", primary: ["判断还在"]},
  },
  {
    sourceText: "系统负责收集资料、提炼假设、检查证据，最后输出结论。",
    expectedGrammar: PRESENTER_MARKER_GRAMMARS.PROCESS_CLUSTER,
    copyPlan: {eyebrow: "RESEARCH FLOW", steps: ["收集资料", "提炼假设", "检查证据"]},
  },
  {
    sourceText: "我把原来不方便的手工记录变成了一套可控的研究工作流。",
    expectedGrammar: PRESENTER_MARKER_GRAMMARS.PROBLEM_TO_CONTROL,
    copyPlan: {eyebrow: "手工记录不方便", primary: ["可控", "研究工作流"]},
  },
];

const layouts = holdouts.map((fixture) => {
  const grammar = inferPresenterMarkerGrammar({sourceText: fixture.sourceText});
  assert.equal(grammar, fixture.expectedGrammar);
  return assertPresenterSemanticMarkerLayout(compilePresenterSemanticMarkerLayout({
    grammar,
    copyPlan: fixture.copyPlan,
    frame,
    availableRegions: [leftRegion],
    protectedRegions: rightProtected,
  }));
});
for (const layout of layouts) {
  assert.equal(layout.classifierBasis, "SOURCE_TEXT_SEMANTICS_NOT_SHOT_ID");
  assert.equal(layout.layoutBasis, "AVAILABLE_REGION_AND_PROTECTED_GEOMETRY");
  assert.equal(layout.selectedRegion.id, "LEFT_NEGATIVE_SPACE");
  assert.equal(layout.regionCandidates[0].protectedOverlapArea, 0);
  assert.ok(layout.occupiedRatio > 0 && layout.occupiedRatio <= 0.35);
}

const mirrored = assertPresenterSemanticMarkerLayout(compilePresenterSemanticMarkerLayout({
  grammar: PRESENTER_MARKER_GRAMMARS.QUESTION_ECHO,
  copyPlan: holdouts[1].copyPlan,
  frame,
  availableRegions: [rightRegion],
  protectedRegions: leftProtected,
}));
assert.equal(mirrored.selectedRegion.id, "RIGHT_NEGATIVE_SPACE");
assert.ok(mirrored.bounds.x > frame.width * 0.6);

const blocked = compilePresenterSemanticMarkerLayout({
  grammar: PRESENTER_MARKER_GRAMMARS.IDENTITY_LOCKUP,
  copyPlan: holdouts[0].copyPlan,
  frame,
  availableRegions: [{id: "UNSAFE", x: 0.45, y: 0.24, width: 0.3, height: 0.25}],
  protectedRegions: rightProtected,
});
assert.equal(blocked.status, "BLOCKED");
assert.ok(blocked.failures.includes("NO_SAFE_REGION_FITS_LAYOUT"));

const equipmentCrossingGeometry = [
  {id: "SUBJECT", x: 0.62, y: 0.18, width: 0.32, height: 0.8},
  {id: "MICROPHONE", x: 0.04, y: 0.065, width: 0.34, height: 0.29},
];
const ordinaryEquipmentProtected = compilePresenterSemanticMarkerLayout({
  grammar: PRESENTER_MARKER_GRAMMARS.IDENTITY_LOCKUP,
  copyPlan: holdouts[0].copyPlan,
  frame,
  availableRegions: [leftRegion],
  protectedRegions: equipmentCrossingGeometry,
});
assert.equal(ordinaryEquipmentProtected.status, "BLOCKED");
const heroEquipmentCrossing = assertPresenterSemanticMarkerLayout(compilePresenterSemanticMarkerLayout({
  grammar: PRESENTER_MARKER_GRAMMARS.IDENTITY_LOCKUP,
  copyPlan: holdouts[0].copyPlan,
  frame,
  availableRegions: [leftRegion],
  protectedRegions: equipmentCrossingGeometry,
  protectionScope: "PRESENTER_FACE_AND_BODY_ONLY",
}));
assert.equal(heroEquipmentCrossing.constraints.microphoneOverlapAllowed, true);
assert.equal(heroEquipmentCrossing.constraints.boomAndStandOverlapAllowed, true);
assert.deepEqual(heroEquipmentCrossing.protectedRegions.map((item) => item.id), ["SUBJECT"]);

const source = fs.readFileSync(new URL("../apps/studio-next/src/lib/a1-presenter-semantic-marker-layout-v1.mjs", import.meta.url), "utf8");
assert.equal(/ED-\d+/u.test(source), false);
assert.equal(/智能写作工作台|读取风格库|完成度很高的废稿/u.test(source), false);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1PresenterSemanticMarkerLayoutTest/v1",
  holdoutArticleCount: holdouts.length,
  grammarCount: new Set(layouts.map((layout) => layout.grammar)).size,
  alternateSafeRegion: mirrored.selectedRegion.id,
  unsafePlacementBlocked: blocked.status === "BLOCKED",
  ordinaryEquipmentProtected: ordinaryEquipmentProtected.status === "BLOCKED",
  heroEquipmentCrossingAllowed: heroEquipmentCrossing.status === "READY_FOR_STATIC_RENDER",
  hardcodedCurrentArticleTokensFound: false,
}, null, 2));
