#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  applyCanonicalStaticBoardInput,
  canonicalStaticBoardInputIsReady,
  compileCanonicalStaticBoardInput,
} from "../apps/studio-next/src/lib/a1-canonical-static-board-input-v1.mjs";
import {canonicalTitleRepairUnboundShotIds, derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const workspace = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const historicalContext = workspace.production.shotIntelligence.videoPackagingContextHistory.filter((item) => item.shotId === "ED-20").at(-1);
const framePath = path.join(appRoot, "public", historicalContext.baseFrame.publicUrl.replace(/^\/+/, ""));
const actualFrameSha256 = crypto.createHash("sha256").update(fs.readFileSync(framePath)).digest("hex");
assert.equal(actualFrameSha256, historicalContext.baseFrame.sha256);

const compiled = compileCanonicalStaticBoardInput({
  workspace,
  appRoot,
  referenceManifest,
  holdFrame: historicalContext.baseFrame,
  now: "2026-08-08T00:00:00.000Z",
});
assert.equal(compiled.preflight.status, "PASS");
assert.equal(compiled.plan.shotId, "ED-20");
assert.equal(compiled.plan.typographyVisualRole, "HERO_TAKEOVER");
assert.equal(compiled.plan.assemblyMode, "FULLSCREEN");
assert.equal(compiled.plan.videoContext.baseFrame.sha256, actualFrameSha256);
assert.deepEqual(compiled.plan.protectedPhrases, ["整理材料", "明确约束", "继续编辑", "收稿"]);
const styleReferenceIds = compiled.styleBrief.sourceReferences.map((item) => item.id);
const registeredStyleReferenceIds = new Set(referenceManifest.sources.map((item) => item.id));
assert.equal(styleReferenceIds.length, 2);
assert.equal(new Set(styleReferenceIds).size, 2, "the two compiled directions must use distinct style references");
assert.ok(styleReferenceIds.every((id) => registeredStyleReferenceIds.has(id)), "every compiled style reference must exist in the current reference manifest");
assert.doesNotMatch(JSON.stringify(compiled.styleBrief), /cream|cobalt|奶油|钴蓝/iu);
assert.match(compiled.prompt, /Render only the protected Chinese phrases/u);
assert.match(compiled.prompt, /not a corner card, generic window, HUD/iu);
assert.match(compiled.prompt, /不做 checklist、卡片、窗口、HUD 或 dashboard/u);

const beforePlanShas = new Map(workspace.production.shotIntelligence.packageLookMasterPlans.map((item) => [item.shotId, item.planSha256]));
const beforePlanIds = workspace.production.shotIntelligence.packageLookMasterPlans.map((item) => item.shotId);
const beforeStyleIds = workspace.production.packagingStyleBriefs.map((item) => item.sourceBeatIds[0]);
const beforeContextIds = workspace.production.shotIntelligence.videoPackagingContexts.items.map((item) => item.shotId);
const expectedSlotCount = (ids) => ids.length + (ids.includes("ED-20") ? 0 : 1) - (ids.includes("ED-32") ? 1 : 0);
const beforeBoardSha = workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256;
const beforeCandidateShas = workspace.production.shotIntelligence.wholeFilmStaticBoard.items.map((item) => item.artifactSha256).sort();
const prepared = applyCanonicalStaticBoardInput(workspace, compiled, {now: "2026-08-08T00:00:00.000Z"});
const planIds = prepared.production.shotIntelligence.packageLookMasterPlans.map((item) => item.shotId);
const styleIds = prepared.production.packagingStyleBriefs.map((item) => item.sourceBeatIds[0]);
const contextIds = prepared.production.shotIntelligence.videoPackagingContexts.items.map((item) => item.shotId);
assert.equal(planIds.length, expectedSlotCount(beforePlanIds));
assert.equal(styleIds.length, expectedSlotCount(beforeStyleIds));
assert.equal(contextIds.length, expectedSlotCount(beforeContextIds));
for (const ids of [planIds, styleIds, contextIds]) {
  assert.ok(ids.includes("ED-20"));
  assert.ok(!ids.includes("ED-32"));
}
for (const plan of prepared.production.shotIntelligence.packageLookMasterPlans.filter((item) => item.shotId !== "ED-20")) assert.equal(plan.planSha256, beforePlanShas.get(plan.shotId));
assert.ok(prepared.production.shotIntelligence.packageLookMasterPlanHistory.some((item) => item.shotId === "ED-32" && item.status === "HISTORY_READ_ONLY_SUPERSEDED_BY_CANONICAL_NO_PACKAGE"));
assert.equal(canonicalStaticBoardInputIsReady(prepared), true);
assert.equal(prepared.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === "ED-20").packageDecision, workspace.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === "ED-20").packageDecision);
assert.equal(prepared.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === "ED-32").packageDecision, workspace.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === "ED-32").packageDecision);
const lifecycle = derivePackagingLifecycleProjection(prepared);
if (workspace.production.goldenFilmVisualSystemMaturity?.status === "WHOLE_FILM_STATIC_BOARD") {
  assert.equal(lifecycle.status, "WHOLE_FILM_STATIC_BOARD_READY", "a lower-authority historical input preflight cannot supersede the current mature static-board authority");
  assert.equal(lifecycle.nextActionId, "CONFIRM_WHOLE_FILM_STATIC_BOARD");
  assert.deepEqual(lifecycle.targetShotIds, []);
} else {
  if (lifecycle.status === "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED") {
    assert.equal(lifecycle.nextActionId, "compile-creator-packaging-palette-bound-repair");
    assert.deepEqual([...lifecycle.targetShotIds].sort(), ["ED-13", "ED-19"]);
  } else if (lifecycle.status === "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED") {
    assert.equal(lifecycle.nextActionId, "bind-canonical-title-repair-candidates");
    assert.deepEqual([...lifecycle.targetShotIds].sort(), [...canonicalTitleRepairUnboundShotIds(prepared)].sort());
  } else {
  // A higher-priority canonical title-repair checkpoint remains authoritative;
  // this lower-authority ED-20 input preflight must not supersede it.
  if (lifecycle.status === "CANONICAL_TITLE_REPAIR_PENDING") {
    assert.equal(lifecycle.nextActionId, "dispatch-canonical-title-repair");
    assert.deepEqual(lifecycle.targetShotIds, ["ED-08", "ED-13", "ED-19"]);
  } else {
    assert.equal(lifecycle.status, "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS");
    assert.equal(lifecycle.inputReadinessStatus, "PASS");
    assert.equal(lifecycle.nextActionId, "dispatch-canonical-static-board-input-repair");
    assert.deepEqual(lifecycle.targetShotIds, ["ED-20"]);
  }
  }
}
assert.equal(prepared.production.shotIntelligence.wholeFilmStaticBoard.sha256, beforeBoardSha);
assert.deepEqual(prepared.production.shotIntelligence.wholeFilmStaticBoard.items.map((item) => item.artifactSha256).sort(), beforeCandidateShas);
assert.equal(prepared.production.generation.summary.queued, 0);
assert.equal(prepared.production.generation.summary.running, 0);
assert.equal(prepared.production.generation.workerStatus, "frozen");
assert.equal(prepared.production.generation.automaticDispatchAllowed, false);
assert.equal(prepared.production.shotIntelligence.currentAssembly.length, 0);

console.log(JSON.stringify({
  status: "PASS",
  shotId: "ED-20",
  planSha256: compiled.plan.planSha256,
  styleBriefSha256: compiled.styleBrief.styleBriefSha256,
  videoContextSha256: compiled.context.contextSha256,
  holdFrameSha256: actualFrameSha256,
  preflight: compiled.preflight.status,
  currentSlotCount: planIds.length,
  unchangedPlanCount: planIds.length - 1,
  nextAction: lifecycle.nextActionId,
  imageGenCalled: false,
  boardRebuilt: false,
}, null, 2));
