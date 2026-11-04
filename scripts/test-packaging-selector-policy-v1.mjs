#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {buildPackagingBeatPlan, packagingDispatchDecision, samplePackagingAnchors} from "../apps/studio-next/src/lib/a1-editorial-packaging-boundary-v1.mjs";

const semanticBeats = [
  {beatId: "b01", order: 1, sourceRange: {shotIds: ["b01"]}, sourceText: "普通口播介绍背景", editMode: "presenter-clean", semanticRole: "ordinary-narration", importanceScore: 0},
  {beatId: "b02", order: 2, sourceRange: {shotIds: ["b02"]}, sourceText: "点击按钮完成操作", editMode: "screen-demo", semanticRole: "supporting-explanation", importanceScore: 2},
  {beatId: "b03", order: 5, sourceRange: {shotIds: ["b03"]}, sourceText: "完成度很高最后变成废稿", editMode: "type-only", semanticRole: "decisive-contrast", importanceScore: 7},
  {beatId: "b04", order: 9, sourceRange: {shotIds: ["b04"]}, sourceText: "常见稳妥可复用的表达如何收敛", editMode: "full-package", semanticRole: "core-method", importanceScore: 7},
  {beatId: "b05", order: 14, sourceRange: {shotIds: ["b05"]}, sourceText: "普通口播收束", editMode: "presenter-clean", semanticRole: "ordinary-narration", importanceScore: 0},
];

const first = buildPackagingBeatPlan({projectId: "fixture", sourceHash: "article-sha", semanticBeats, now: "2026-08-04T00:00:00.000Z"});
const repeated = buildPackagingBeatPlan({projectId: "fixture", sourceHash: "article-sha", semanticBeats, now: "2026-08-04T01:00:00.000Z"});
assert.equal(first.selector.contract, "A1PackagingSelectorPolicy/v2");
assert.equal(first.selector.maxPackagingEvents, undefined);
assert.equal(first.selector.policy, "semantic-value-plus-sequence-rhythm");
assert.equal(first.sha256, repeated.sha256, "same content hash must produce the same selection hash");
assert.ok(first.packagingEventCount >= 1 && first.packagingEventCount <= first.semanticBeatCount, "event count is variable, not a fixed three");
assert.ok(first.packagingEvents.every((event) => event.valueAdded > 0 && event.whyPackagingIsBetterThanNoPackage));
assert.equal(first.items.find((item) => item.beatId === "b01")?.itemType, "NO_PACKAGE");
assert.equal(first.items.find((item) => item.beatId === "b02")?.itemType, "NO_PACKAGE");
assert.equal(packagingDispatchDecision(first.items.find((item) => item.beatId === "b01")), false);
assert.ok(first.noPackageCount > first.packagingEventCount);
const anchors = samplePackagingAnchors(first, {maxAnchors: 3, anchorSampleLimit: 3});
assert.ok(anchors.length <= 3);
assert.deepEqual(first.anchorSampling.selectedEventIds, [], "anchor sampler is pure; persistence is explicit");
assert.equal(first.anchorSampling.maxAnchors, 3);
assert.equal(first.anchorSampling.anchorSampleLimit, 3);

const workspacePath = path.resolve("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const proof = workspace.production.packagingAnchorProof;
assert.equal(proof.samplingContract, "A1PackagingAnchorSampling/v1");
assert.ok(proof.eventIds.length <= 3);
assert.ok(proof.anchors.every((anchor) => anchor.formalOutputDebugFree === true));
assert.ok(proof.anchors.every((anchor) => !anchor.editableTextNodes?.some((label) => /debug|safe.?area|overlay|package/iu.test(label))));

const unseenConclusion = buildPackagingBeatPlan({projectId: "fixture", sourceHash: "unseen", semanticBeats: [
  {beatId: "new-conclusion", order: 1, sourceRange: {shotIds: ["new-conclusion"]}, sourceText: "保留已有判断，只对局部段落修正，作者方向不会被推翻。", editMode: "full-package", semanticRole: "conclusion", importanceScore: 5},
  {beatId: "new-mechanism", order: 4, sourceRange: {shotIds: ["new-mechanism"]}, sourceText: "三个候选经过偏好筛选后，只有一条默认轨道继续前进。", editMode: "full-package", semanticRole: "core-method", importanceScore: 5},
  {beatId: "plain", order: 7, sourceRange: {shotIds: ["plain"]}, sourceText: "这里由剪辑者放真实录屏。", editMode: "screen-demo", semanticRole: "supporting-explanation", importanceScore: 0},
]});
assert.ok(unseenConclusion.items.find((item) => item.beatId === "new-conclusion")?.candidateEvaluation?.candidate, "unseen conclusion must be evaluated as a candidate");
assert.ok(unseenConclusion.items.find((item) => item.beatId === "new-mechanism")?.candidateEvaluation?.candidate, "unseen mechanism must be evaluated as a candidate");
assert.equal(unseenConclusion.items.find((item) => item.beatId === "plain")?.itemType, "NO_PACKAGE");
assert.equal(unseenConclusion.packagingEventCount, 2, "director-required full-package beats cannot be removed to preserve a NO_PACKAGE majority");

const denseDirectorSequence = buildPackagingBeatPlan({projectId: "dense", sourceHash: "dense", semanticBeats: Array.from({length: 5}, (_, index) => ({
  beatId: `dense-${index + 1}`,
  order: index + 1,
  sourceRange: {shotIds: [`dense-${index + 1}`]},
  sourceText: index === 4 ? "最后把判断交回作者" : `方法关系 ${index + 1}`,
  editMode: index === 4 ? "type-only" : "full-package",
  semanticRole: index === 4 ? "conclusion" : "core-method",
  importanceScore: 4,
}))});
assert.equal(denseDirectorSequence.packagingEventCount, 5, "full-package/type-only coverage must not be density suppressed");
assert.equal(denseDirectorSequence.noPackageCount, 0, "NO_PACKAGE majority is not a product invariant");

console.log(JSON.stringify({status: "PASS", contract: "A1PackagingSelectorPolicy/v2", eventCount: first.packagingEventCount, noPackageCount: first.noPackageCount, denseDirectorEventCount: denseDirectorSequence.packagingEventCount, anchorSampleCount: anchors.length, sameHash: first.sha256 === repeated.sha256, formalOutputDebugFree: proof.anchors.every((anchor) => anchor.formalOutputDebugFree === true)}, null, 2));
