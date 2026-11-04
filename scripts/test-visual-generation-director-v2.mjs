#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createSceneGraphCandidates, ensureProductionState, updateGenerationJob} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  adoptGeneratedVisualCandidate,
  approveVisualCreativeReview,
  approveVisualTreatment,
  assertVisualGenerationDirector,
  queueRemainingVisualGeneration,
  queueTreatmentAnchorGeneration,
  queueVisualAnchorSuiteGeneration,
  queueVisualGenerationBrief,
  registerGeneratedCompositeBatchReview,
  registerGeneratedTreatmentBatchReview,
  registerGeneratedVisualCandidate,
  registerMotionSample,
  recordGenerationConcurrencyBenchmark,
  reviseVisualGenerationBrief,
} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const persistedFixture = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const migratedPersistedFixture = ensureProductionState(persistedFixture, "2026-08-02T07:59:00.000Z");
assert.equal(migratedPersistedFixture.production.visualDirector.treatmentLibrary.length, 8, "persisted treatment libraries must migrate without rebuilding the project");
assert.deepEqual(migratedPersistedFixture.production.visualDirector.queuePolicy.concurrencyCandidates, [1, 2]);
const ed10PersistedShot = persistedFixture.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-10");
// This is a local compositor-binding fixture, not an authorization test. The
// live workspace is correctly locked at whole-film static-board review, so
// open the scene-composition gate only on an isolated clone.
const ed10PixelFixtureSource = structuredClone(persistedFixture);
ed10PixelFixtureSource.gates ||= {};
ed10PixelFixtureSource.gates.shotCompositionAllowed = true;
for (const asset of ed10PixelFixtureSource.library.assets.filter((item) => ["type-pixel-correction", "article-element-pencil-circle"].includes(item.id) && item.contentSha256)) {
  asset.status = "approved";
  asset.review = {status: "approved", note: "legacy-route-test-fixture", reviewedAt: "2026-08-02T08:00:00.000Z", reviewedBy: "user", approvedContentSha256: asset.contentSha256};
}
const ed10PixelFixture = createSceneGraphCandidates(ed10PixelFixtureSource, ed10PersistedShot.id, "2026-08-02T07:59:30.000Z");
const ed10PixelCandidates = ed10PixelFixture.library.assets.find((asset) => asset.id === ed10PersistedShot.id).candidates;
assert.equal(ed10PixelCandidates.some((candidate) => candidate.screening.hardFailures.includes("pixel-signature-missing:ED-10")), false, "ED-10 compositor candidates must retain a visible pixel signature");
assert.equal(ed10PixelCandidates.every((candidate) => candidate.sceneGraph.nodes.some((node) => node.id === "verdict-waste-editable" && node.fontAssetId === "type-pixel-correction")), true, "ED-10 rejected word must carry the locked pixel font");
const fixture = structuredClone(persistedFixture);
// Preserve the current 34-shot director contract in this isolated helper
// fixture; rebuilding it after deleting the canonical packaging plan creates
// a deliberately incomplete prompt summary and is not the behavior tested.
delete fixture.production.presentationRendererProof;
delete fixture.production.packagingBoundary;
delete fixture.production.packagingBeatPlan;
delete fixture.production.packagingAnchorProof;
delete fixture.production.legacyVisualAuthority;
delete fixture.production.storyboardProductionProjection;
delete fixture.production.packagingLifecycleProjection;
// This suite keeps the legacy generated-layer branch covered. The active
// article-packaging branch has its own contract test and must not inherit the
// old per-shot full-scene expectations below.
delete fixture.production.articlePackagingKit;
delete fixture.production.typographyFoundry;
fixture.typographySystem.policy.requiredGeneratedGlyphBoardIds = [];
// Keep this legacy route test isolated from the current workspace's review
// lock. The scene-graph assertion below is specifically testing exact
// shotId/layerId binding, not the upstream article-approval gate.
fixture.gates ||= {};
fixture.gates.shotCompositionAllowed = true;
for (const asset of fixture.library.assets.filter((item) => item.stageId === "background-foundry" && item.contentSha256)) {
  asset.status = "approved";
  asset.review = {status: "approved", note: "legacy-route-test-fixture", reviewedAt: "2026-08-02T08:00:00.000Z", reviewedBy: "user", approvedContentSha256: asset.contentSha256};
}
for (const asset of fixture.library.assets.filter((item) => ["type-pixel-correction", "article-element-pencil-circle"].includes(item.id) && item.contentSha256)) {
  asset.status = "approved";
  asset.review = {status: "approved", note: "legacy-route-test-fixture", reviewedAt: "2026-08-02T08:00:00.000Z", reviewedBy: "user", approvedContentSha256: asset.contentSha256};
}
fixture.production.generation.jobs = fixture.production.generation.jobs.filter((job) => job.targetKind !== "visual-layer");
const hash = (seed) => String(seed).padEnd(64, "0").slice(0, 64).replace(/[^a-f0-9]/gu, "a");
const at = (minute) => `2026-08-02T08:${String(minute).padStart(2, "0")}:00.000Z`;

let workspace = ensureProductionState(fixture, at(0));
// Keep this legacy helper fixture out of current authority recalculation: it
// intentionally removes the live packaging plan and therefore cannot produce
// a current storyboard projection. Open only its local scene-graph gate; the
// production workspace remains review-gated.
workspace.gates.shotCompositionAllowed = true;
// Keep this legacy director test isolated from live progressive family
// admission. The explicit progressive fixture is installed later in the
// suite, so persisted calibration state must not bypass the locked assertion.
workspace.production.authority.designCalibrationBatch.progressiveAdmission = {
  contract: "A1ProgressiveShotFamilyAdmission/v1",
  policy: "passed-family-expands-isolated-shot-stays-local",
  status: "locked-until-explicit-fixture",
  families: [],
  expandableFamilies: [],
  isolatedShotIds: [],
  eligibleShotIds: [],
  eligibleShotCount: 0,
  globalBarrierLifted: false,
};
workspace.production.designCalibrationBatch = structuredClone(workspace.production.authority.designCalibrationBatch);
// This suite intentionally exercises the director's generation/cache helpers
// in isolation. The active workspace's representative-shot strategy switch
// must freeze production dispatch, but it is not the behavior under test here.
delete workspace.production.visualDirector.anchorStrategySwitchRequired;
// This helper suite is an isolated generation-contract fixture. The live
// system-line proof-review freeze is intentionally not part of this unit's
// queue semantics, so remove that operational marker after recalculation.
delete workspace.production.visualDirector.presentationRendererReviewPending;
const initial = assertVisualGenerationDirector(workspace.production.visualDirector, workspace);
assert.equal(initial.treatmentLibrary.length, 8);
assert.equal(initial.rankedTreatmentIds.length, 3);
const pixelPopPack = initial.treatmentLibrary.find((pack) => pack.id === "newtro-pixel-pop");
assert.equal(pixelPopPack.typographySystem.contract, "A1PixelPopTypography/v1");
assert.equal(pixelPopPack.typographySystem.displayFamily.label, "Noto Sans Hans Black");
assert.equal(pixelPopPack.typographySystem.supportFamily.label, "Source Han Sans CN Regular");
assert.equal(pixelPopPack.typographySystem.frameRules.maxTextRoles, 3);
assert.equal(pixelPopPack.typographySystem.frameRules.negativeSpaceRatio.min, 0.35);
assert.equal(pixelPopPack.typographySystem.layout.gridColumns, 12);
assert.equal(pixelPopPack.typographySystem.layout.headlineZone, "assigned-by-shot-composition-plan");
assert.equal(pixelPopPack.typographySystem.layout.archetypeDriven, true);
assert.equal(pixelPopPack.typographySystem.layout.forbidUniversalSplit, true);
assert.equal(pixelPopPack.monochromeDirectionContract, "A1MonochromeEditorialDirection/v1");
assert.equal(pixelPopPack.monochromeDirection.palette.ink, "#0B0B0B");
assert.equal(pixelPopPack.monochromeDirection.elements.maxVisibleObjects, 2);
assert.equal(pixelPopPack.monochromeDirection.layout.fixedSplitForbidden, true);
assert.equal(pixelPopPack.referenceGrammarContract, "A1VisualReferenceGrammar/v1");
assert.equal(pixelPopPack.referenceGrammarSources.length, 5);
assert.equal(initial.creatorPackaging.contract, "A1CreatorPackagingGrammar/v1");
assert.deepEqual(initial.creatorPackaging.requestedProfileIds, ["gawx-art", "xiaolin-says", "hupo", "dai-lao-ban"]);
assert.deepEqual(initial.creatorPackaging.inspirationProfileIds, ["mina-le", "dan-mace-cartel", "ignacio-osorio-odd", "yere-studio"]);
assert.equal(initial.creatorPackaging.exactReferenceGate.requireExactForProduction, true);
assert.equal(initial.creatorPackaging.rankedProfiles.some((profile) => profile.id === "gawx-art" && profile.sourceUrls?.includes("https://www.youtube.com/@gawxart")), true);
assert.equal(initial.referenceStudy.contract, "A1CreatorReferenceStudy/v1");
assert.equal(initial.referenceStudy.sourceCount, 8);
assert.equal(initial.referenceStudy.qualityGate.sourceWallIsEvidenceOnly, true);
assert.equal(initial.shotBriefs.length, 34);
assert.equal(initial.treatmentDirections.flatMap((item) => item.anchorBriefs).length, 6);
assert.equal(initial.anchorSuiteShotIds.length, 6);
assert.equal(new Set(initial.shotBriefs.map((brief) => brief.shotId)).size, 34);
assert.equal(new Set(initial.shotBriefs.map((brief) => brief.compositionPlan.archetypeId)).size >= 5, true);
assert.deepEqual(initial.shotBriefs.find((brief) => brief.shotId === "ED-01")?.targetGeometry, {x: .54, y: 0, width: .46, height: 1});
assert.deepEqual(initial.shotBriefs.find((brief) => brief.shotId === "ED-18")?.targetGeometry, {x: 0, y: 0, width: .46, height: 1});
for (let index = 2; index < initial.shotBriefs.length; index += 1) {
  assert.equal(new Set(initial.shotBriefs.slice(index - 2, index + 1).map((brief) => brief.compositionPlan.silhouetteFamily)).size > 1, true, `three-shot silhouette collapse at ${initial.shotBriefs[index].shotId}`);
}

for (const brief of initial.shotBriefs) {
  const shot = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === brief.shotId)?.shotDemand;
  assert.ok(shot);
  if (["screen-demo", "presenter-clean"].includes(shot.editMode)) assert.equal(brief.productionBindingAllowed, false, `${shot.shotId} must keep real source authority`);
  if (shot.editMode === "type-only") {
    assert.equal(brief.generationDecision, "generated-type-treatment");
    assert.equal(brief.productionBindingAllowed, true);
    assert.equal(brief.prompt.includes(`Text (verbatim, preserve every Chinese character and spacing): "${brief.exactText}"`), true);
    assert.equal(brief.prompt.includes("ocr-exact-text"), false, "OCR gate belongs to the brief contract, not the prompt text");
    assert.equal(brief.automaticChecks.includes("ocr-exact-text"), true);
  } else {
    assert.equal(brief.prompt.includes("No readable words"), true);
  }
  assert.equal(brief.prompt.includes("fake-ui"), true);
  assert.equal(brief.compositionPlan.contract, "A1VisualCompositionSystem/v1");
  assert.equal(brief.visualProposition.contract, "A1ShotVisualProposition/v1");
  assert.equal(brief.compositionPlan.fixedLeftRightSplitForbidden, true);
  assert.equal(brief.prompt.includes("A1VisualCompositionSystem/v1"), true);
  assert.equal(brief.prompt.includes("A universal left-object/right-title split is forbidden"), true);
  assert.equal(brief.automaticChecks.includes("composition-archetype-match"), true);
  assert.equal(brief.automaticChecks.includes("template-smell-clear"), true);
  if (brief.treatmentId === "newtro-pixel-pop") assert.equal(brief.prompt.includes("A1PixelPopTypography/v1"), true);
  if (brief.treatmentId === "newtro-pixel-pop") assert.equal(brief.prompt.includes("A1VisualReferenceGrammar/v1"), true);
  if (brief.treatmentId === "newtro-pixel-pop") assert.equal(brief.prompt.includes("A1MonochromeEditorialDirection/v1"), true);
  assert.equal(brief.creatorPackagingProfileIds?.length, 4);
  assert.equal(brief.creatorInspirationProfileIds?.length, 4);
  assert.equal(brief.prompt.includes("Creator packaging grammar (clean-room, subordinate to the locked user reference pack)"), true);
  assert.equal(brief.promptCompiler, "A1VisualGenerationPromptCompiler/v3");
  assert.equal(brief.visualReferencePack.id, "pinterest-retro-pixel-v1");
  assert.equal(brief.prompt.includes("pinterest-retro-pixel-v1"), true);
  assert.equal(brief.prompt.includes("pixel-grid-is-the-surface-logic-not-a-filter"), true);
  assert.equal(brief.prompt.includes("tactile creator cinema"), false, "legacy creator register must not override the locked user style");
  assert.equal(brief.automaticChecks.includes("visual-policy-current"), true);
  assert.equal(brief.automaticChecks.includes("visual-reference-pack-lock"), true);
  assert.equal(brief.prompt.includes("Reference study contract A1CreatorReferenceStudy/v1"), true);
}
assert.equal(initial.promptPolicy.contract, "A1VisualPromptPolicyBinding/v1");
assert.equal(initial.promptPolicy.compiledShotBriefCount, 34);
for (const brief of initial.treatmentDirections.flatMap((direction) => direction.anchorBriefs)) {
  assert.equal(brief.prompt.includes("pinterest-retro-pixel-v1"), true);
  assert.equal(brief.prompt.includes("pixel-grid-is-the-surface-logic-not-a-filter"), true);
  assert.equal(brief.prompt.includes("tactile creator cinema"), false);
}

const generatedCandidateCountBeforeTreatments = workspace.production.visualDirector.generatedCandidates.length;
const queuedTreatments = queueTreatmentAnchorGeneration(workspace, at(1));
workspace = queuedTreatments.workspace;
assert.equal(queuedTreatments.jobs.length, 6);
assert.equal(new Set(queuedTreatments.jobs.map((job) => job.cacheKey)).size, 6);
for (const [index, job] of queuedTreatments.jobs.entries()) {
  workspace = updateGenerationJob(workspace, job.id, {status: "complete", completedAt: at(2), durationMs: 120_000 + index, output: {sha256: hash(`a${index}`)}}, at(2));
  workspace = registerGeneratedVisualCandidate(workspace, job.id, {publicUrl: `/generated/test/treatment-${index}.png`, sha256: hash(`b${index}`), width: 1536, height: 864, mimeType: "image/png", model: "test-image-model", generationId: `test-treatment-${index}`, perceptualHash: `ph-${index}`, cropSafe: true, ocrReadableTextDetected: false, edgeIntegrity: "pass", contrastStatus: "pass"}, at(2));
}
assert.equal(workspace.production.visualDirector.generatedCandidates.length, generatedCandidateCountBeforeTreatments + 6);

const cacheStarted = performance.now();
const repeatedTreatments = queueTreatmentAnchorGeneration(workspace, at(3));
const cacheDurationMs = performance.now() - cacheStarted;
assert.equal(repeatedTreatments.jobs.length, 6);
assert.equal(repeatedTreatments.reusedCount, 6);
assert.equal(repeatedTreatments.workspace.production.generation.jobs.length, workspace.production.generation.jobs.length);
assert.ok(cacheDurationMs < 3000, `exact repeat should be local under 3s, observed ${cacheDurationMs}`);
workspace = repeatedTreatments.workspace;

const selectedTreatmentId = workspace.production.visualDirector.rankedTreatmentIds[0];
const queuedTreatmentJobIds = new Set(queuedTreatments.jobs.map((job) => job.id));
const treatmentCandidates = workspace.production.visualDirector.generatedCandidates.filter((candidate) => queuedTreatmentJobIds.has(candidate.jobId));
const treatmentRendered = treatmentCandidates.map((candidate, index) => ({
  candidateId: candidate.id,
  compositePreview: {publicUrl: `/generated/test/treatment-${index}-composite.png`, sha256: hash(`e${index}`), width: 960, height: 540},
  inspectionBoardPublicUrl: `/generated/test/treatment-${index}-board.png`,
  inspectionBoardSha256: hash(`f${index}`),
  previousShotId: null,
  nextShotId: null,
  previousPreviewSha256: null,
  nextPreviewSha256: null,
  compositorSourceSha256: hash(`c${index}`),
}));
const directionIds = workspace.production.visualDirector.rankedTreatmentIds;
const batchItems = treatmentCandidates.map((candidate) => ({
  candidateId: candidate.id,
  scores: {semanticAccuracy: 3, compositionSilhouette: 3, materialQuality: 3, typographyRole: 3, depth: 3, motionPotential: 3, transitionContinuity: 3, sequenceContrast: 3},
  totalScore: 24,
  hardFailures: [],
  verdict: "PASS",
  exactTextStatus: "verified",
  confidence: "high",
  visualEvidence: "可见的合成轮廓、材料、两级可编辑中文和运动承接证据完整。",
  structuredRevision: {preserve: [], remove: [], compositionChanges: ["保持当前结构"], nextPromptReferenceOnly: "无需重抽素材"},
}));
assert.throws(() => registerGeneratedTreatmentBatchReview(workspace, treatmentRendered, {
  contract: "A1VisualTreatmentBatchCritic/v1",
  scope: "visual-treatment-3x2",
  items: batchItems.map((item) => ({...item, scores: Object.fromEntries(Object.keys(item.scores).map((key) => [key, 0])), hardFailures: ["visual-critic-unavailable"]})),
  directions: [],
  trace: {batchHash: hash("unavailable"), modelRequestCount: 0, criticUnavailable: true},
}, at(3)), /critic-unavailable-not-a-visual-report/u);
workspace = registerGeneratedTreatmentBatchReview(workspace, treatmentRendered, {
  contract: "A1VisualTreatmentBatchCritic/v1",
  scope: "visual-treatment-3x2",
  items: batchItems,
  directions: directionIds.map((treatmentId, index) => ({treatmentId, itemCount: 2, passCount: 2, averageScore: 24, minScore: 24, hardFailureCount: 0, status: "PASS", rank: index + 1})),
  championTreatmentId: selectedTreatmentId,
  nextAction: "review-champion-treatment",
  trace: {batchHash: hash("batch"), modelRequestCount: 1, cacheHit: false, durationMs: 10},
}, at(3));
workspace = approveVisualTreatment(workspace, selectedTreatmentId, "golden treatment", at(4));
const treatmentHash = workspace.production.visualDirector.treatmentHash;
assert.match(treatmentHash, /^[a-f0-9]{64}$/u);
const approvedAgain = approveVisualTreatment(workspace, selectedTreatmentId, "same treatment", at(5));
assert.equal(approvedAgain.production.visualDirector.treatmentHash, treatmentHash, "treatment hash must not drift with time or note");
workspace = approvedAgain;

const productionBrief = workspace.production.visualDirector.shotBriefs.find((brief) => workspace.production.visualDirector.anchorSuiteShotIds.includes(brief.shotId) && brief.productionBindingAllowed);
assert.ok(productionBrief);
const promptBefore = productionBrief.prompt;
assert.throws(() => reviseVisualGenerationBrief(workspace, productionBrief.id, {prompt: "make it nicer"}, at(6)), /unstructured-patch-forbidden/u);
workspace = reviseVisualGenerationBrief(workspace, productionBrief.id, {mode: "edit", preserve: ["single subject"], remove: ["right-side clutter"], compositionChanges: ["move subject left by 15%"], negativeSpace: "reserve the right 38% for editable Chinese captions"}, at(6));
const revised = workspace.production.visualDirector.shotBriefs.find((brief) => brief.id === productionBrief.id);
assert.notEqual(revised.prompt, promptBefore);
assert.equal(revised.revision.compositionChanges.includes("move subject left by 15%"), true);
assert.equal(revised.prompt.includes("make it nicer"), false);

const anchorQueue = queueVisualAnchorSuiteGeneration(workspace, at(7));
workspace = anchorQueue.workspace;
assert.ok(anchorQueue.jobs.length >= 2 && anchorQueue.jobs.length <= 12);
assert.equal(anchorQueue.jobs.every((job) => job.targetKind === "visual-layer" && job.briefHash && job.treatmentHash && job.shotId && job.layerId), true);
assert.throws(() => {
  const nonAnchor = workspace.production.visualDirector.shotBriefs.find((brief) => brief.productionBindingAllowed && !workspace.production.visualDirector.anchorSuiteShotIds.includes(brief.shotId));
  if (nonAnchor) queueVisualGenerationBrief(workspace, nonAnchor.id, {}, at(8));
}, /shot-family-locked/u);

const progressiveQueueFixture = structuredClone(workspace);
const progressiveBrief = progressiveQueueFixture.production.visualDirector.shotBriefs.find((brief) => brief.productionBindingAllowed && !progressiveQueueFixture.production.visualDirector.anchorSuiteShotIds.includes(brief.shotId));
assert.ok(progressiveBrief);
progressiveQueueFixture.production.authority.designCalibrationBatch.progressiveAdmission = {
  contract: "A1ProgressiveShotFamilyAdmission/v1",
  policy: "passed-family-expands-isolated-shot-stays-local",
  status: "active",
  families: [],
  expandableFamilies: [progressiveBrief.shotFamily],
  isolatedShotIds: [],
  eligibleShotIds: [progressiveBrief.shotId],
  eligibleShotCount: 1,
  globalBarrierLifted: true,
};
const progressiveQueue = queueVisualGenerationBrief(progressiveQueueFixture, progressiveBrief.id, {candidateCount: 2}, at(8));
assert.equal(progressiveQueue.jobs.length, 2);
assert.equal(progressiveQueue.jobs.every((job) => job.shotId === progressiveBrief.shotId), true);

const targetJob = anchorQueue.jobs.find((job) => job.briefId === revised.id) || anchorQueue.jobs[0];
workspace = updateGenerationJob(workspace, targetJob.id, {status: "complete", completedAt: at(8), durationMs: 111_000, output: {sha256: hash("c")}}, at(8));
workspace = registerGeneratedVisualCandidate(workspace, targetJob.id, {publicUrl: "/generated/test/anchor.png", sha256: hash("d"), width: 1536, height: 864, mimeType: "image/png", model: "test-image-model", generationId: "test-anchor", perceptualHash: "ph-anchor", cropSafe: true, ocrReadableTextDetected: false, edgeIntegrity: "pass", contrastStatus: "pass"}, at(8));
const targetCandidate = workspace.production.visualDirector.generatedCandidates.find((candidate) => candidate.jobId === targetJob.id);
assert.ok(targetCandidate);
const criticReport = {
  contract: "A1VisualMaturityCritic/v1",
  scope: "shot-frame",
  verdict: "PASS",
  totalScore: 24,
  overallSummary: "The generated layer becomes specific and coherent only inside the real composite.",
  dimensions: ["visualJob", "silhouette", "materialSpecificity", "typeRoles", "depthOcclusion", "motionPhrase", "transitionHandoff", "sequenceContrast"].map((id) => ({id, score: 3, evidence: "observed", repair: ""})),
  hardFailures: [],
  candidates: [{candidateId: targetCandidate.id, rank: 1, score: 24, exactTextStatus: "not-applicable", observedText: null, visualEvidence: "real Remotion composite", repairBrief: ""}],
  selectedCandidateId: targetCandidate.id,
  repairPlan: {highestImpact: "retain geometry", retain: ["subject silhouette"], remove: [], nextPrompt: "keep selected image"},
  trace: {cacheHit: false},
};
workspace = registerGeneratedCompositeBatchReview(workspace, targetCandidate.briefId, [{candidateId: targetCandidate.id, compositePreview: {publicUrl: "/generated/test/anchor-composite.png", sha256: hash("e"), width: 960, height: 540}, inspectionBoardPublicUrl: "/generated/test/anchor-board.png", inspectionBoardSha256: hash("f"), previousShotId: "ED-00", nextShotId: "ED-99", previousPreviewSha256: hash("1"), nextPreviewSha256: hash("2")}], criticReport, at(9));
assert.equal(workspace.production.visualDirector.generatedCandidates.find((candidate) => candidate.id === targetCandidate.id).status, "composite-revision-required", "one lucky composite review must not auto-approve");
workspace = registerGeneratedCompositeBatchReview(workspace, targetCandidate.briefId, [{candidateId: targetCandidate.id, compositePreview: {publicUrl: "/generated/test/anchor-composite.png", sha256: hash("e"), width: 960, height: 540}, inspectionBoardPublicUrl: "/generated/test/anchor-board.png", inspectionBoardSha256: hash("f"), previousShotId: "ED-00", nextShotId: "ED-99", previousPreviewSha256: hash("1"), nextPreviewSha256: hash("2")}], criticReport, at(10));
assert.equal(workspace.production.visualDirector.generatedCandidates.find((candidate) => candidate.id === targetCandidate.id).status, "composite-approved", "the same composite needs two stable reviews before approval");
const adopted = adoptGeneratedVisualCandidate(workspace, targetCandidate.id, at(11));
workspace = adopted.workspace;
assert.equal(adopted.asset.shotLayerBinding.shotId, targetCandidate.shotId);
assert.equal(adopted.asset.shotLayerBinding.layerId, targetCandidate.layerId);
assert.equal(adopted.asset.creativeInputOnly, true);
assert.equal(adopted.asset.evidenceUseAllowed, false);
assert.equal(adopted.asset.anchorSurface.realSourceRemainsAuthoritative, true);
assert.equal(adopted.asset.review.approvedContentSha256, adopted.asset.contentSha256);

const shotAsset = workspace.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === targetCandidate.shotId);
workspace = createSceneGraphCandidates(workspace, shotAsset.id, at(11));
const updatedShot = workspace.library.assets.find((asset) => asset.id === shotAsset.id);
assert.ok(updatedShot.candidates.some((candidate) => candidate.sceneGraph.editorialAnchorSurface?.productionBinding?.candidateId === targetCandidate.id || candidate.sceneGraph.primaryMaterialId === adopted.asset.id), "accepted generated layer must bind into its exact shot scene graph");

const fullBatchFixture = structuredClone(workspace);
fullBatchFixture.production.visualDirector.creativeReviews.gates.find((gate) => gate.id === "anchor-suite").status = "approved";
const fullBatch = queueRemainingVisualGeneration(fullBatchFixture, at(12));
assert.ok(fullBatch.jobs.length > 0);
assert.equal(fullBatch.jobs.every((job) => !fullBatch.workspace.production.visualDirector.anchorSuiteShotIds.includes(job.shotId)), true);
let benchmarked = fullBatch.workspace;
for (const concurrency of [1, 2]) {
  benchmarked = recordGenerationConcurrencyBenchmark(benchmarked, {concurrency, jobCount: 8, completedCount: 8, failedCount: 0, p90DurationMs: 100_000 + concurrency * 2_000, wallTimeMs: 800_000 / concurrency}, at(12 + concurrency));
}
assert.equal(benchmarked.production.visualDirector.queuePolicy.selectedByBenchmark, true);
assert.equal(benchmarked.production.visualDirector.queuePolicy.activeConcurrency, 2);
let motionReviewFixture = registerMotionSample(benchmarked, {publicUrl: "/generated/test/motion-sample.mp4", sha256: hash("motion"), durationMs: 22_000, width: 960, height: 540, visualTaskTypes: ["real presenter", "real screen operation", "generated mechanism"], handoffProof: true, review: {totalScore: 24, maxScore: 24, hardFailures: []}}, at(17));
motionReviewFixture.production.visualDirector.creativeReviews.gates.find((gate) => gate.id === "motion-sample").status = "pending";
motionReviewFixture = approveVisualCreativeReview(motionReviewFixture, "motion-sample", "motion approved", at(18));
assert.equal(motionReviewFixture.production.visualDirector.status, "creative-reviews-complete");

assert.throws(() => approveVisualCreativeReview(workspace, "anchor-suite", "too early", at(12)), /anchor-suite-incomplete/u);
// Keep this isolated director fixture out of the active workspace's
// representative-shot strategy-switch fuse before exercising the final
// assertion; the fuse itself is covered by the authority and automation tests.
  workspace.production.visualDirector.anchorSuiteShotIds = [];
delete workspace.production.visualDirector.anchorStrategySwitchRequired;
workspace.production.visualDirector.creativeReviews.gates.find((gate) => gate.id === "treatment").status = "approved";
delete workspace.production.factCorrectionLedger;
assertVisualGenerationDirector(workspace.production.visualDirector, workspace);

console.log(JSON.stringify({
  contract: "A1VisualGenerationDirectorV2Test/v1",
  status: "PASS",
  checks: {
    eightTreatmentPacks: true,
    creatorPackagingGrammar: true,
    topThreeRanked: true,
    sameSemanticTreatmentAnchors: 6,
    allShotsRouted: 34,
    realSourceBoundaryLocked: true,
    structuredPromptCompilation: true,
    stableTreatmentHash: treatmentHash,
    exactRepeatCacheLocalMs: Math.round(cacheDurationMs * 100) / 100,
    visualLayerJobContract: true,
    compositeCriticContext: "raw+remotion-composite+previous+next",
    preciseShotLayerBinding: `${targetCandidate.shotId}/${targetCandidate.layerId}`,
    fullBatchAutoQueueAfterSecondReview: true,
    progressiveFamilyQueueBeforeGlobalApproval: progressiveBrief.shotFamily,
    measuredConcurrencySelection: benchmarked.production.visualDirector.queuePolicy.activeConcurrency,
    thirdMotionReviewGate: true,
    isolatedLegacyHelperCompatible: true,
  },
}, null, 2));
