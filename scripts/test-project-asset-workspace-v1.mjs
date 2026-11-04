#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {buildProjectVisualBiblePack} from "../apps/studio-next/src/lib/a1-project-visual-bible-v1.mjs";
import {assertProjectAssetWorkspace, bindProjectAssetOutput, buildProjectAssetWorkspace, queueProjectAssetGeneration, reviewProjectAssetBrief, reviewProjectAssetOutput} from "../apps/studio-next/src/lib/a1-project-asset-workspace-v1.mjs";

const na = {intensity: "not-applicable", keyPhrases: [], spatialAnchor: "not-applicable", faceSafeZone: "not-applicable", occlusionRule: "not-applicable"};
const plan = {contract: "A1WholeFilmAiDirectorPlan/v1", projectId: "asset-fixture", source: {title: "资产测试", articleSha256: "a".repeat(64), timelineSha256: "b".repeat(64), srtSha256: "c".repeat(64), timelineAuthority: "corrected-srt", cueCount: 2, durationMs: 4000}, articleUnderstanding: {thesis: "测试"}, strategy: {visualThesis: "真实素材先行", presenterRole: "人物", screenRole: "屏幕", packageRole: "包装", typeOnlyRule: "终句", rhythmArc: ["动作", "结论"], globalRules: ["禁止假界面"]}, chapters: [{chapterId: "C01", title: "测试章", firstCueId: 1, lastCueId: 2, narrativeArc: "动作到结论"}], coverage: {exact: true, editTimelineContinuous: true}, shots: [
  {shotId: "ED-01", order: 1, chapterId: "C01", editMode: "screen-demo", editWindow: {startMs: 0, endMs: 2000, durationMs: 2000}, sourceText: "真实选择一句", visualJob: "证明操作", primaryActor: "selected-sentence", materialRoute: "real-screen-capture", topology: "source-action-detail", typographyRole: "source-interface-text-only", keyPhrases: ["选择一句"], layoutConstraints: ["界面可读"], motionPhrase: "选区出现并原位确认", handoffActor: "selected-sentence", structureDirections: ["局部推近", "上下文裁切"], requiredMaterialIds: ["screen-action"], missingMaterialIds: ["screen-recording"], materialGate: "BLOCKED_MEDIA_MISSING", fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD", presenterPackage: na},
  {shotId: "ED-02", order: 2, chapterId: "C01", editMode: "type-only", editWindow: {startMs: 2000, endMs: 4000, durationMs: 2000}, sourceText: "由人判断", visualJob: "结论", primaryActor: "由人判断", materialRoute: "editable-typography", topology: "typographic-field", typographyRole: "quiet-verdict", keyPhrases: ["由人判断"], layoutConstraints: ["留黑"], motionPhrase: "词组接入并停住", handoffActor: "hard-cut-to-black", structureDirections: ["孤立字形", "边缘窄行"], requiredMaterialIds: [], missingMaterialIds: [], materialGate: "READY_FOR_DESIGN_AFTER_PLAN_APPROVAL", fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD", presenterPackage: na},
]};
const pack = buildProjectVisualBiblePack({plan, planSha256: "d".repeat(64), approvedDirectorReviewSha256: "e".repeat(64), compiledAt: "2026-07-30T00:00:00.000Z"});
let workspace = assertProjectAssetWorkspace(buildProjectAssetWorkspace({pack, visualBibleReviewArtifactSha256: "f".repeat(64), createdAt: "2026-07-30T00:00:01.000Z"}));
const screenSource = workspace.assets.find((asset) => asset.materialDuty === "screen-capture");
assert.ok(screenSource, "screen-source-material-target-created");
const importedScreenSource = bindProjectAssetOutput(workspace, screenSource.id, {publicUrl: "/projects/asset-fixture/imports/screen-recording/capture.mp4", sha256: "a".repeat(64), sourceType: "user-owned-screen-recording", rights: "user-provided:permission-not-verified", sourceIdentity: {originalFileName: "capture.mp4", sourceUri: "/projects/asset-fixture/imports/screen-recording/capture.mp4", slotKind: "screen-recording"}, sourceMetadata: {originalFileName: "capture.mp4", mimeType: "video/mp4", extension: ".mp4", sizeBytes: 1024, durationMs: 2000, probeStatus: "partial"}});
const importedIdentity = importedScreenSource.assets.find((asset) => asset.id === screenSource.id);
assert.equal(importedIdentity.sourceIdentity.originalFileName, "capture.mp4");
assert.equal(importedIdentity.sourceIdentity.slotKind, "screen-recording");
assert.equal(importedIdentity.sourceMetadata.durationMs, 2000);
assert.notEqual(importedScreenSource.sha256, workspace.sha256);
assert.equal(workspace.queue.concurrency, 2);
assert.equal(workspace.queue.automaticDispatchAllowed, false);
assert.ok(workspace.assets.some((asset) => asset.route === "project-font" && asset.binding.status === "bound"));
const fontAssets = workspace.assets.filter((asset) => asset.route === "project-font");
assert.equal(fontAssets.length, 1);
assert.equal(fontAssets[0].id, "type-pixel-correction");
assert.ok(fontAssets.every((asset) => asset.binding.publicUrl?.startsWith("/a1-editorial-fonts/")));
assert.ok(fontAssets.every((asset) => fs.existsSync(path.join(process.cwd(), "apps/studio-next/public", asset.binding.publicUrl.replace(/^\//u, "")))));
assert.ok(workspace.assets.some((asset) => asset.stage === "source-materials" && asset.binding.status === "missing"));
const generated = workspace.assets.find((asset) => asset.generationAllowed);
assert.throws(() => queueProjectAssetGeneration(workspace, generated.id), /approved-generation-brief-required/u);
workspace = reviewProjectAssetBrief(workspace, generated.id, "approved", "同意生成无字底材", "2026-07-30T00:00:02.000Z");
workspace = queueProjectAssetGeneration(workspace, generated.id, "2026-07-30T00:00:03.000Z");
assert.equal(workspace.queue.summary.queued, 1);
assert.equal(workspace.queue.jobs[0].providerMode, "subscription-zero-extra-cost");
workspace = bindProjectAssetOutput(workspace, generated.id, {publicUrl: "/generated/fixture.png", sha256: "1".repeat(64), sourceType: "codex-subscription-generated", rights: "non-factual-editorial-asset"}, "2026-07-30T00:00:04.000Z");
workspace = reviewProjectAssetOutput(workspace, generated.id, {decision: "approved", note: "通过"}, "2026-07-30T00:00:05.000Z");
assert.equal(workspace.assets.find((asset) => asset.id === generated.id).outputReview.status, "approved");
assert.equal(workspace.gates.sceneGraphCandidateGenerationAllowed, false);

console.log(JSON.stringify({contract: "A1ProjectAssetWorkspaceTest/v1", status: "PASS", checks: {projectScopedAssets: true, localFontsBound: true, localFontFilesExist: true, sourceImportIdentityMetadataBound: true, realSourcesRemainMissing: true, explicitBriefApprovalBeforeQueue: true, subscriptionQueueConcurrencyTwo: true, outputReviewSeparate: true, downstreamStillLocked: true}}, null, 2));
