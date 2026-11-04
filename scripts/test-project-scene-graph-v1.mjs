#!/usr/bin/env node
import assert from "node:assert/strict";
import {buildProjectVisualBiblePack} from "../apps/studio-next/src/lib/a1-project-visual-bible-v1.mjs";
import {buildProjectAssetWorkspace, materializeProjectDiagramOutputs, recalculateProjectAssetWorkspace, reviewProjectAssetOutput} from "../apps/studio-next/src/lib/a1-project-asset-workspace-v1.mjs";
import {approveProjectSceneGraphCandidate, assertProjectSceneGraphWorkspace, buildProjectSceneGraphWorkspace} from "../apps/studio-next/src/lib/a1-project-scene-graph-v1.mjs";
import {assertProjectAcceptedShotIrSet, assertProjectMotionIrSet, compileProjectAcceptedShotIr} from "../apps/studio-next/src/lib/a1-project-accepted-shot-ir-v2.mjs";

const na = {intensity: "not-applicable", keyPhrases: [], spatialAnchor: "not-applicable", faceSafeZone: "not-applicable", occlusionRule: "not-applicable"};
const plan = {contract: "A1WholeFilmAiDirectorPlan/v1", projectId: "scene-fixture", source: {title: "场景测试", articleSha256: "a".repeat(64), timelineSha256: "b".repeat(64), srtSha256: "c".repeat(64), timelineAuthority: "corrected-srt", cueCount: 2, durationMs: 4000}, articleUnderstanding: {thesis: "测试"}, strategy: {visualThesis: "真实对象驱动构图", presenterRole: "人物", screenRole: "屏幕", packageRole: "包装", typeOnlyRule: "终句", rhythmArc: ["动作", "结论"], globalRules: ["禁止假界面"]}, chapters: [{chapterId: "C01", title: "测试章", firstCueId: 1, lastCueId: 2, narrativeArc: "动作到结论"}], coverage: {exact: true, editTimelineContinuous: true}, shots: [
  {shotId: "ED-01", order: 1, chapterId: "C01", editMode: "screen-demo", editWindow: {startMs: 0, endMs: 2000, durationMs: 2000}, sourceText: "真实选择一句", narrativeJob: "证明动作", viewerTakeaway: "操作真实", visualJob: "证明操作", primaryActor: "selected-sentence", materialRoute: "real-screen-capture", topology: "source-action-detail", typographyRole: "source-interface-text-only", keyPhrases: ["选择一句"], layoutConstraints: ["界面可读"], motionPhrase: "选区出现，句子就地改写，结果原位确认", handoffActor: "selected-sentence", structureDirections: ["真实页面局部推近", "选区与上下文双层裁切"], screenActions: ["选中原句", "原位改写并确认"], transitionOut: "选中句进入下一镜", requiredMaterialIds: ["screen-action"], materialRequirements: [{id: "screen-action", duty: "screen-capture", evidenceIds: ["screen-operation"]}], missingMaterialIds: [], materialGate: "READY_FOR_DESIGN_AFTER_PLAN_APPROVAL", fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD", presenterPackage: na},
  {shotId: "ED-02", order: 2, chapterId: "C01", editMode: "type-only", editWindow: {startMs: 2000, endMs: 4000, durationMs: 2000}, sourceText: "由人判断，同时考虑两步核验", narrativeJob: "留下结论", viewerTakeaway: "判断归人", visualJob: "结论", primaryActor: "由人判断", materialRoute: "editable-typography", topology: "typographic-field", typographyRole: "quiet-verdict", keyPhrases: ["由人判断"], layoutConstraints: ["留黑"], motionPhrase: "选中句收束成由人判断并停住", handoffActor: "hard-cut-to-black", structureDirections: ["孤立字形", "边缘窄行"], screenActions: [], transitionOut: "hard-cut-to-black", requiredMaterialIds: ["result-copy", "diagram-support", "article-page", "proof-receipt"], materialRequirements: [{id: "result-copy", duty: "editable-type", evidenceIds: [], exactCopy: "由人判断"}, {id: "diagram-support", duty: "deterministic-diagram", evidenceIds: [], diagramSpec: {contract: "A1DeterministicDiagramSpec/v1", kind: "sequence", nodes: [{id: "claim", label: "由人判断"}, {id: "check", label: "两步核验"}], edges: [{from: "claim", to: "check", relation: "supports"}]}}, {id: "article-page", duty: "verified-source", evidenceIds: []}, {id: "proof-receipt", duty: "provenance-record", evidenceIds: ["article-page"]}], missingMaterialIds: [], materialGate: "READY_FOR_DESIGN_AFTER_PLAN_APPROVAL", fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD", presenterPackage: na},
]};
const pack = buildProjectVisualBiblePack({plan, planSha256: "d".repeat(64), approvedDirectorReviewSha256: "e".repeat(64), compiledAt: "2026-07-30T00:00:00.000Z"});
let assets = buildProjectAssetWorkspace({pack, visualBibleReviewArtifactSha256: "f".repeat(64), createdAt: "2026-07-30T00:00:01.000Z"});
assets.assets = assets.assets.map((asset, index) => ({...asset, binding: {status: "bound", publicUrl: `/fixtures/${asset.id}.${asset.route === "project-font" ? "ttf" : "png"}`, sha256: String((index % 9) + 1).repeat(64), sourceType: asset.materialDuty === "verified-source" ? "user-owned-article-screenshot" : asset.stage === "source-materials" ? "user-owned-real-source" : asset.route === "project-font" ? "project-local-font" : "codex-subscription-generated", rights: "fixture"}, sourceIdentity: asset.materialDuty === "verified-source" ? {originalFileName: "article-page.png", sourceUri: `/fixtures/${asset.id}.png`, slotKind: "article-screenshot"} : asset.sourceIdentity, sourceMetadata: asset.materialDuty === "verified-source" ? {originalFileName: "article-page.png", mimeType: "image/png", extension: ".png", sizeBytes: 128, width: 640, height: 360, probeStatus: "complete"} : asset.sourceMetadata, output: {publicUrl: `/fixtures/${asset.id}.png`, sha256: String((index % 9) + 1).repeat(64), width: 1920, height: 1080, manifestPublicUrl: null, generatedAt: "2026-07-30T00:00:02.000Z"}, briefReview: asset.generationAllowed ? {status: "approved", note: "fixture", reviewedAt: "2026-07-30T00:00:02.000Z", reviewedBy: "user", approvedContentSha256: asset.contentSha256} : asset.briefReview, outputReview: {status: "approved", note: "fixture", reviewedAt: "2026-07-30T00:00:02.000Z", reviewedBy: "user", verifiedText: null}}));
assets = recalculateProjectAssetWorkspace(assets, "2026-07-30T00:00:03.000Z");
const diagramMaterialization = materializeProjectDiagramOutputs(assets, {boundAt: "2026-07-30T00:00:03.500Z"});
assert.equal(Object.keys(diagramMaterialization.binaryFiles).length, 1);
assert.match(diagramMaterialization.binaryFiles[Object.keys(diagramMaterialization.binaryFiles)[0]].toString("utf8"), /^<svg /u);
assets = diagramMaterialization.workspace;
assert.equal(assets.materializationPlan.records.find((record) => record.materialId === "diagram-support").status, "PENDING_DIAGRAM_OUTPUT_REVIEW");
assert.equal("svgMarkup" in assets.materializationPlan.records.find((record) => record.materialId === "diagram-support").payload, false);
assets = reviewProjectAssetOutput(assets, assets.assets.find((asset) => asset.name === "diagram-support").id, {decision: "approved", note: "图中文字、关系和版式通过"}, "2026-07-30T00:00:03.750Z");
assert.equal(assets.gates.sceneGraphCandidateGenerationAllowed, true);
assert.equal(assets.materializationPlan.status, "READY_FOR_SCENE_GRAPH");
assert.equal(assets.materializationPlan.records.find((record) => record.materialId === "result-copy").status, "READY_FOR_SCENE_GRAPH_BINDING");
assert.equal(assets.provenanceIndex.recordCount, 1);
assert.equal(assets.provenanceIndex.factualApprovalCount, 0);
assert.equal(assets.provenanceIndex.records[0].reviewBoundary.factualClaimsApproved, false);
assert.equal(assets.provenanceIndex.records[0].reviewBoundary.rightsApproved, false);
const editableMaterialAsset = assets.assets.find((asset) => asset.name === "result-copy");
assert.equal(editableMaterialAsset.outputReview.status, "deferred-to-scene-graph");
assert.throws(() => reviewProjectAssetOutput(assets, editableMaterialAsset.id, {decision: "approved"}), /deferred-to-scene-graph/u);
let scenes = assertProjectSceneGraphWorkspace(buildProjectSceneGraphWorkspace({pack, assetWorkspace: assets, createdAt: "2026-07-30T00:00:04.000Z"}));
assert.equal(scenes.summary.shotCount, 2);
assert.equal(scenes.summary.candidateCount, 8);
assert.ok(scenes.shots.every((shot) => shot.candidates.length === 4));
assert.ok(scenes.shots.every((shot) => shot.candidates.every((candidate) => candidate.sceneGraph.layoutSolution.contract === "A1ConstraintLayoutSolution/v1" && candidate.sceneGraph.layoutSolution.seed && candidate.sceneGraph.layoutSolution.compositionPrimitive && Number.isFinite(candidate.sceneGraph.layoutSolution.score))));
assert.ok(scenes.shots.every((shot) => new Set(shot.candidates.map((candidate) => candidate.sceneGraph.layoutSolution.compositionPrimitive)).size >= 2));
assert.ok(scenes.shots.every((shot) => new Set(shot.candidates.map((candidate) => JSON.stringify(candidate.sceneGraph.nodes.map((node) => node.geometry)))).size >= 2));
assert.ok(scenes.shots[0].candidates.every((candidate) => candidate.sourceAiVisualContract.primaryActor === "selected-sentence" && candidate.sceneGraph.topology === "source-action-detail" && candidate.sceneGraph.causalScreenActions.length === 2));
assert.ok(scenes.shots[0].candidates.every((candidate) => candidate.sceneGraph.nodes.every((node) => node.type !== "editable-text")));
assert.ok(scenes.shots[1].candidates.every((candidate) => candidate.sceneGraph.nodes.some((node) => node.type === "editable-text" && node.text === "由人判断")));
assert.ok(scenes.shots[1].candidates.every((candidate) => candidate.sceneGraph.nodes.some((node) => node.type === "editable-text" && node.materialRequirementId === "result-copy" && /^[a-f0-9]{64}$/u.test(node.materialBindingSha256 || ""))));
assert.ok(scenes.shots[1].candidates.every((candidate) => candidate.sceneGraph.nodes.some((node) => node.type === "asset-reference" && node.role === "source-bound-deterministic-diagram" && node.materialRequirementId === "diagram-support" && /^[a-f0-9]{64}$/u.test(node.materialBindingSha256 || "") && /^[a-f0-9]{64}$/u.test(node.outputSha256 || ""))));
assert.ok(scenes.shots[1].candidates.every((candidate) => candidate.sceneGraph.sourceProvenanceRecords.some((item) => item.materialId === "proof-receipt" && item.record.claims[0].claimText === "判断归人" && item.record.reviewBoundary.factualClaimsApproved === false && item.record.reviewBoundary.rightsApproved === false)));
for (const shot of scenes.shots) scenes = approveProjectSceneGraphCandidate(scenes, shot.shotId, shot.candidates[0].candidateId, "fixture", "2026-07-30T00:00:05.000Z");
assert.equal(scenes.gates.acceptedShotIrCompilationAllowed, true);
assert.equal(scenes.gates.motionAllowed, false);
const {acceptedSet, motionSet} = compileProjectAcceptedShotIr({pack, assetWorkspace: assets, sceneWorkspace: scenes, compiledAt: "2026-07-30T00:00:06.000Z"});
assertProjectAcceptedShotIrSet(acceptedSet);
assertProjectMotionIrSet(motionSet);
assert.equal(acceptedSet.shotCount, 2);
assert.equal(motionSet.sceneCount, 2);
assert.ok(acceptedSet.scenes.every((scene) => scene.sourceAssetWorkspaceSha256 === assets.sha256 && scene.approval.status === "approved"));
assert.ok(motionSet.scenes.every((scene) => scene.actors.some((actor) => actor.propertyTracks.some((track) => track.property !== "opacity"))));
assert.equal(motionSet.scenes[0].wordActors.length, 0);
assert.equal(motionSet.scenes[0].motionProfile.name, "causal-selection-rewrite");
assert.ok(motionSet.scenes[0].actors.some((actor) => actor.propertyTracks.some((item) => item.property === "selectionProgress")));
assert.equal(motionSet.scenes[1].motionProfile.name, "quiet-verdict");
assert.equal(motionSet.scenes[1].wordActors.length, 1);
assert.equal(motionSet.scenes[1].wordActors[0].kind, "phrase-actor");
assert.equal(motionSet.scenes[1].wordActors[0].text, "由人判断");
assert.ok(motionSet.scenes.every((scene) => scene.phases.contract === "A1SemanticMotionPhases/v1" && scene.phases.stableReadingHold.endFrame === scene.timing.frameDuration - 1));

console.log(JSON.stringify({contract: "A1ProjectSceneGraphAndAcceptedIrTest/v1", status: "PASS", checks: {aiDirectionsExpandedFourToEight: true, constraintSolverProvenanceRecorded: true, approvedAssetsOnly: true, projectMaterializationVerified: true, editableTextMaterialBoundToSceneGraph: true, deterministicDiagramPersistedReviewedAndBound: true, projectProvenanceReceiptBoundWithoutFactualApproval: true, declaredScreenActionChainConsumed: true, typeRemainsEditable: true, noModeIndexTemplateRouter: true, allShotsApprovalGate: true, acceptedIrUsesApprovedHashes: true, semanticMotionProfiles: true, phraseActorsNotMechanicalCharacters: true, stableReadingHold: true, renderStillLocked: true}, syntheticFixtureOnly: true, productionAdmission: false}, null, 2));
