import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, isOperationSequenceCandidateSet, recalculateEditorialAssetWorkbench, selectedShotCandidateSetSha256, updateEditorialAsset} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {approve540pRelease, approveRepresentativeMotion, approveSceneGraphCandidate, automaticallyAdmitReferenceMatureShot, begin540pRender, buildRepresentativeMotionPlan, compileAcceptedShotIr, createSceneGraphCandidates, queueAssetGeneration, recoverStaleGenerationJobs, register1080pAndDavinciRelease, register540pRenderArtifact, registerFilmVisualQualityReview, registerRepresentativeMotionArtifact, registerRepresentativeMotionCriticPass, request1080pRelease, requestFinalRenderAndDavinciRelease, screenEvidenceMaterialIdForShot, selectScreenEvidenceBeats, updateGenerationJob} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildDesignCalibrationBatch} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {createProjectIntake, parseSrtTimeline} from "../apps/studio-next/src/lib/a1-project-intake-v1.mjs";
import {reviewTypographyPhrase} from "../apps/studio-next/src/lib/a1-typography-foundry-v1.mjs";
import {approveRecommendedArticleDesignKit} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const liveSource = assertEditorialAssetWorkbench(JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8")));

// Tests must remain repeatable after the live project starts producing assets.
// Derive a pristine review/queue fixture without mutating or discarding real outputs.
const pristineDraft = structuredClone(liveSource);
const usesLegacyTypographyFixture = pristineDraft.typographySystem?.policy?.requiredGeneratedGlyphBoardIds?.length === 0;
if (usesLegacyTypographyFixture) {
  pristineDraft.typographySystem.policy = {
    ...pristineDraft.typographySystem.policy,
    singleFontAssetId: null,
    singleFontFamily: null,
    requiredGeneratedGlyphBoardIds: pristineDraft.library.assets
      .filter((asset) => asset.route === "generated-glyph")
      .map((asset) => asset.id),
  };
}
pristineDraft.production.generation.jobs = [];
pristineDraft.production.generation.workerStatus = "idle";
pristineDraft.production.resolveLayoutHandoffs = {};
pristineDraft.production.acceptedShotIr = {contract: "A1AcceptedShotIRSet/v2", status: "locked", sourceWorkspaceSha256: null, shotCount: 0, sha256: null, publicUrl: null, compiledAt: null};
pristineDraft.production.motion = {contract: "A1RepresentativeMotionGate/v1", status: "locked", representativePlan: null, previewArtifact: null, review: {status: "pending", score: null, maxScore: 24, hardFailures: [], reviewedAt: null}, fullMotionAllowed: false};
pristineDraft.production.release.crossArticleProof = {status: "pending", projectId: null, reportSha256: null};
pristineDraft.production.release.maturityStatus = "NOT_MATURE";
for (const asset of pristineDraft.library.assets) {
  asset.review = {
    status: "pending",
    note: null,
    reviewedAt: null,
    approvedContentSha256: null,
  };
  if (["approved", "revise"].includes(asset.status)) asset.status = "ready-for-review";
  if (asset.route === "shot-composition") {
    asset.candidates = [];
    asset.selectedCandidateId = null;
    asset.candidateRender = null;
    asset.visualCritic = null;
    asset.visualRevision = null;
    asset.revisionHistory = [];
    asset.visualStrategyCycle = 0;
    asset.status = "planned";
  }
  if (asset.route === "generated-glyph") {
    asset.assetUri = null;
    asset.sha256 = null;
    asset.status = "brief-ready";
    asset.preview = null;
    // Keep the foundry contract valid while making the fixture independent of
    // whatever live glyph outputs happen to exist in the workspace. These are
    // reviewable candidate records only; the actual asset output is still
    // absent until attachReviewableOutput() below.
    asset.typographySpec.generatedCandidates = asset.typographySpec.candidateDirections.map((direction, index) => ({
      id: `pristine-glyph-${index + 1}`,
      direction,
      publicUrl: `/fixtures/${asset.id}/candidate-${index + 1}.png`,
      sha256: "b".repeat(64),
      width: 960,
      height: 540,
      promptSha256: "c".repeat(64),
      cutoutPublicUrl: `/fixtures/${asset.id}/candidate-${index + 1}-cutout.png`,
      cutoutSha256: "d".repeat(64),
      textVerification: {status: "verified", expectedText: asset.typographySpec.exactText, observedText: asset.typographySpec.exactText, reviewedBy: "test-fixture"},
    }));
    asset.typographySpec.textVerification = {status: "pending", expectedText: asset.typographySpec.exactText, observedText: null, reviewedBy: null};
    asset.provenance = {sourceType: "generated-editorial-candidate", sourceUri: null, license: "project-generation-required", reviewed: false};
  }
}
if (usesLegacyTypographyFixture) {
  const legacyFonts = pristineDraft.library.assets
    .filter((asset) => asset.route === "project-font" && asset.id !== "type-pixel-correction")
    .slice(0, 3);
  for (const font of legacyFonts) {
    font.current = true;
    font.requiredForShotComposition = true;
    font.status = "ready-for-review";
  }
}
const pristineAtlas = pristineDraft.library.assets.find((asset) => asset.id === "atlas-editor-marks");
pristineAtlas.assetUri = null;
pristineAtlas.sha256 = null;
pristineAtlas.status = "brief-ready";
pristineAtlas.preview = null;
pristineAtlas.provenance = {
  sourceType: "generated-editorial-candidate",
  sourceUri: null,
  license: "project-generation-required",
  reviewed: false,
};
const source = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(pristineDraft, "2026-07-30T00:00:00.000Z"));
const results = [];
const check = (id, pass) => results.push({id, status: pass ? "PASS" : "FAIL"});
const expectError = (id, run, expected) => {
  let message = "";
  try { run(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
  check(id, message === expected);
};

const liveOperationTrace = liveSource.production.operationOrchestration?.trace;
check("operation-orchestration-persists-source-bound-event-evidence", liveOperationTrace?.eventEvidence?.length === liveOperationTrace?.eventCount
  && liveOperationTrace.eventEvidence.every((event) => event.evidence?.beat && event.target?.region && event.replay?.performance?.action));

const unsupportedPreferenceClaim = selectScreenEvidenceBeats(
  {sourceText: "下次再出现类似句子，Codex 会拦下并提醒修改", visualJob: "证明拦截", keyPhrases: []},
  {actionId: "preference", evidenceFrames: [
    {beat: "preference-1"}, {beat: "preference-2"}, {beat: "preference-3"}, {beat: "preference-4"},
  ]},
);
check("screen-evidence-semantic-gap-fails-closed", unsupportedPreferenceClaim.coverageStatus === "partial" && unsupportedPreferenceClaim.coverageGap.includes("intercepted sentence"));

const exactSemanticEvidenceClaims = [
  ["historyIsolation", "历史主题按文章分开存，每个主题保留近五次修改。"],
  ["preferenceIntercept", "下次再出现类似句子，系统会拦下并提醒修改。"],
  ["preferenceGeneration", "喜欢库会进入下一次改写并约束生成。"],
];
for (const [actionId, sourceText] of exactSemanticEvidenceClaims) {
  const selection = selectScreenEvidenceBeats(
    {sourceText, visualJob: "证明真实因果", keyPhrases: []},
    {actionId, evidenceFrames: [{beat: `${actionId}-1`}, {beat: `${actionId}-2`}, {beat: `${actionId}-3`}]},
  );
  check(`screen-evidence-${actionId}-is-exact`, selection.coverageStatus === "exact" && selection.coverageGap === null && selection.selectedBeatIds.length === 3);
}
check("screen-route-open-and-inline-edit-uses-real-save-history-action", screenEvidenceMaterialIdForShot({sourceText: "打开页面后像普通文档一样添加或修改", visualJob: "正文可编辑", keyPhrases: []}) === "source-documentary-save-history-action");
check("screen-route-negative-style-record-uses-exact-causal-action", screenEvidenceMaterialIdForShot({sourceText: "AI 正在改变内容生产，句子太空、没动作、太枯燥，记入风格库", visualJob: "负面判断入库", keyPhrases: []}) === "source-documentary-negative-preference-record-action");

const unseenArticle = "这是一篇没有进入当前工程的新文章。它需要先经过全文理解，再根据真实字幕切分镜头，区分人物、录屏、包装和纯字体。系统不能为省事回落成统一标题卡，也不能把生成图当成事实界面。所有素材、字体、审批和渲染都要保存来源与哈希。";
const unseenSrt = `1\n00:00:00,000 --> 00:00:03,200\n这是一篇没有进入当前工程的新文章。\n\n2\n00:00:03,200 --> 00:00:07,600\n它需要先经过全文理解，再根据真实字幕切分镜头。\n\n3\n00:00:07,700 --> 00:00:12,000\n系统不能回落成统一标题卡，也不能把生成图当成事实界面。`;
const parsedTimeline = parseSrtTimeline(unseenSrt);
const unseenIntake = createProjectIntake({title: "未见真实文章测试", articleText: unseenArticle, srtText: unseenSrt, now: "2026-07-30T00:00:00.000Z"});
check("project-intake-validates-article-and-srt-without-code-template", unseenIntake.intake.contract === "A1ProjectIntake/v1" && unseenIntake.intake.status === "READY_FOR_AI_DIRECTOR" && parsedTimeline.cueCount === 3 && parsedTimeline.durationMs === 12_000 && parsedTimeline.continuity.overlapCount === 0 && unseenIntake.intake.sha256.length === 64);
expectError("project-intake-blocks-overlapping-srt", () => parseSrtTimeline(`1\n00:00:00,000 --> 00:00:03,000\n第一句\n\n2\n00:00:02,000 --> 00:00:04,000\n第二句`), "srt-timeline-overlap-or-order-invalid");

expectError("editorial-artwork-cannot-approve-without-output", () => updateEditorialAsset(source, "atlas-editor-marks", {action: "approve"}), "asset-output-or-source-review-required");
expectError("revise-requires-note", () => updateEditorialAsset(source, "bg-warm-paper-dot", {action: "revise", note: ""}), "revise-note-required");
expectError("brief-has-minimum-specificity", () => updateEditorialAsset(source, "atlas-editor-marks", {action: "save-brief", promptBrief: "太短"}), "brief-too-short");

const generationReady = updateEditorialAsset(source, "atlas-editor-marks", {action: "mark-generation-ready"}, "2026-07-30T00:00:01.000Z");
check("prepare-generation-does-not-dispatch", generationReady.summary.queuedJobCount === 0 && generationReady.policy.generationAllowed === false && generationReady.library.assets.find((asset) => asset.id === "atlas-editor-marks")?.status === "generation-ready");
check("generation-ready-still-locks-shots", generationReady.gates.shotCompositionAllowed === false && generationReady.gates.acceptedShotIrAllowed === false);
expectError("generation-queue-requires-visual-bible-approval", () => queueAssetGeneration(generationReady, "atlas-editor-marks"), "visual-bible-approval-required-before-generation");
const glyphGenerationReady = updateEditorialAsset(source, "glyph-board-polished-waste", {action: "mark-generation-ready"}, "2026-07-30T00:00:01.500Z");
check("title-glyph-task-prepares-without-dispatch", glyphGenerationReady.summary.queuedJobCount === 0 && glyphGenerationReady.library.assets.find((asset) => asset.id === "glyph-board-polished-waste")?.status === "generation-ready");

let reviewed = structuredClone(source);
const readyFoundation = reviewed.library.assets.filter((asset) => ["article-understanding", "background-foundry", "typography-board", "source-materials"].includes(asset.stageId) && asset.requiredForShotComposition && asset.status === "ready-for-review");
for (const item of readyFoundation) reviewed = updateEditorialAsset(reviewed, item.id, {action: "approve"}, "2026-07-30T00:00:02.000Z");

let queueFixture = updateEditorialAsset(reviewed, "atlas-editor-marks", {action: "mark-generation-ready"}, "2026-07-30T00:00:02.100Z");
const queuedFixture = queueAssetGeneration(queueFixture, "atlas-editor-marks", "2026-07-30T00:00:02.200Z");
queueFixture = queuedFixture.workspace;
check("generation-job-v2-is-persistent-and-hash-bound", queueFixture.production.generation.jobs.length === 1 && queuedFixture.job.contract === "A1AssetGenerationJob/v2" && queuedFixture.job.providerMode === "subscription-zero-extra-cost" && queuedFixture.job.cacheKey.length === 64 && queueFixture.production.generation.concurrency === 2);
expectError("generation-queue-deduplicates-active-job", () => queueAssetGeneration(queueFixture, "atlas-editor-marks"), "generation-job-already-active");
const runningFixture = updateGenerationJob(queueFixture, queuedFixture.job.id, {status: "running", startedAt: "2026-07-30T00:00:02.300Z"}, "2026-07-30T00:00:02.300Z");
const recoveredFixture = recoverStaleGenerationJobs(runningFixture, "2026-07-30T00:00:02.400Z");
check("process-restart-recovers-running-job", recoveredFixture.recovered === 1 && recoveredFixture.workspace.production.generation.jobs[0].status === "queued" && recoveredFixture.workspace.production.generation.jobs[0].error === "recovered-after-worker-restart");
const failedFixture = updateGenerationJob(recoveredFixture.workspace, queuedFixture.job.id, {status: "failed", error: "fixture-failure"}, "2026-07-30T00:00:02.500Z");
const retriedFixture = queueAssetGeneration(failedFixture, "atlas-editor-marks", "2026-07-30T00:00:02.600Z");
check("failed-job-retries-in-place-without-duplicate", retriedFixture.workspace.production.generation.jobs.length === 1 && retriedFixture.job.status === "queued" && retriedFixture.job.error === null && retriedFixture.job.requeuedAt === "2026-07-30T00:00:02.600Z");

function attachReviewableOutput(workspace, assetId) {
  const next = structuredClone(workspace);
  const item = next.library.assets.find((asset) => asset.id === assetId);
  item.assetUri = `/fixtures/${assetId}.png`;
  item.sha256 = "a".repeat(64);
  item.status = "ready-for-review";
  item.provenance = {sourceType: "generated-editorial-candidate", sourceUri: `fixture://${assetId}`, license: "test-fixture", reviewed: true};
  item.preview = {kind: "source-image", publicUrl: item.assetUri};
  if (item.typographySpec) {
    item.typographySpec.generatedCandidates = item.typographySpec.candidateDirections.map((direction, index) => ({id: `fixture-${index + 1}`, direction, publicUrl: item.assetUri, sha256: item.sha256, width: 960, height: 540, promptSha256: "b".repeat(64), cutoutPublicUrl: `${item.assetUri}.cutout.png`, cutoutSha256: "c".repeat(64), textVerification: {status: "verified", expectedText: item.typographySpec.exactText, observedText: item.typographySpec.exactText, reviewedBy: "test"}}));
    item.selectedCandidateId = item.typographySpec.generatedCandidates[0].id;
    item.typographySpec.textVerification = {status: "verified", expectedText: item.typographySpec.exactText, observedText: item.typographySpec.exactText, reviewedBy: "test"};
  }
  return next;
}

reviewed = attachReviewableOutput(reviewed, "atlas-editor-marks");
reviewed = updateEditorialAsset(reviewed, "atlas-editor-marks", {action: "approve"}, "2026-07-30T00:00:03.000Z");
for (const id of ["key-bg-desk-question", "key-bg-model-material-table"]) {
  reviewed = attachReviewableOutput(reviewed, id);
  reviewed = updateEditorialAsset(reviewed, id, {action: "approve"}, "2026-07-30T00:00:04.000Z");
}
for (const id of source.typographySystem.policy.requiredGeneratedGlyphBoardIds) {
  reviewed = attachReviewableOutput(reviewed, id);
  reviewed = updateEditorialAsset(reviewed, id, {action: "approve"}, "2026-07-30T00:00:04.250Z");
}
const typographyPhraseAssetIds = (reviewed.production.typographyFoundry?.phrases || []).map((phrase) => phrase.assetId);
for (const assetId of typographyPhraseAssetIds) {
  reviewed = recalculateEditorialAssetWorkbench(reviewed, "2026-07-30T00:00:04.350Z");
  const phrase = reviewed.production.typographyFoundry.phrases.find((item) => item.assetId === assetId);
  const candidate = phrase.candidates[0];
  reviewed = reviewTypographyPhrase(reviewed, assetId, candidate.candidateId, "approved", "test fixture approval", "2026-07-30T00:00:04.400Z");
  reviewed = recalculateEditorialAssetWorkbench(reviewed, "2026-07-30T00:00:04.450Z");
}
reviewed = attachReviewableOutput(reviewed, "source-network-zhipu-official-mark");
reviewed = updateEditorialAsset(reviewed, "source-network-zhipu-official-mark", {action: "approve"}, "2026-07-30T00:00:04.500Z");
reviewed = recalculateEditorialAssetWorkbench(approveRecommendedArticleDesignKit(reviewed, "test fixture design-kit approval", "2026-07-30T00:00:04.550Z"), "2026-07-30T00:00:04.600Z");
// Full-package shots are not allowed to synthesize a primary material. Bind
// every fixture shot's declared primary source to a reviewable test output.
const fixturePrimaryMaterialIds = new Set(reviewed.library.assets
  .filter((asset) => asset.stageId === "shot-composition")
  .map((asset) => {
    // The live article intentionally contains a few media-missing full-package
    // demands. This happy-path fixture supplies an already approved paper
    // surface explicitly; production itself still BLOCKs those demands. Bind
    // it to the shot's own packaging assignment so the fixture also preserves
    // the article-level material provenance boundary.
    if (asset.shotDemand?.editMode === "full-package" && !asset.shotDemand.primaryMaterialId) {
      const assignment = reviewed.production.articlePackagingKit?.shotAssignments?.find((item) => item.shotId === asset.shotDemand.shotId);
      asset.shotDemand.primaryMaterialId = assignment?.backgroundAssetId || "key-bg-model-material-table";
    }
    return asset.shotDemand?.primaryMaterialId;
  })
  .filter(Boolean));
for (const assetId of fixturePrimaryMaterialIds) {
  const existing = reviewed.library.assets.find((asset) => asset.id === assetId);
  if (!existing || existing.review?.status === "approved") continue;
  reviewed = attachReviewableOutput(reviewed, assetId);
  reviewed = updateEditorialAsset(reviewed, assetId, {action: "approve"}, "2026-07-30T00:00:04.650Z");
}
// Supply the five real entity marks required by the ED-12 comparison demand.
// The live assignment currently carries only three, so this test fixture
// expands that one assignment without changing the production no-fallback
// rule or the global packaging library.
const modelEntityIds = ["source-entity-openai", "source-entity-claude", "source-entity-kimi", "source-entity-deepseek", "source-network-zhipu-official-mark"];
for (const assetId of modelEntityIds) {
  let existing = reviewed.library.assets.find((asset) => asset.id === assetId);
  if (existing?.review?.status !== "approved") {
    reviewed = attachReviewableOutput(reviewed, assetId);
    reviewed = updateEditorialAsset(reviewed, assetId, {action: "approve"}, "2026-07-30T00:00:04.700Z");
    existing = reviewed.library.assets.find((asset) => asset.id === assetId);
  }
  existing.usedByShotIds = [...new Set([...(existing.usedByShotIds || []), "ED-12"])];
}
reviewed.production.presentationDecisions.status = "compiled-layout-preflight-passed";
reviewed.production.visualDirector.treatmentHash = "test-treatment-approval-hash";
reviewed.production.visualDirector.creativeReviews.gates = reviewed.production.visualDirector.creativeReviews.gates.map((gate) => gate.id === "treatment"
  ? {...gate, status: "approved", approvedAt: "2026-07-30T00:00:04.725Z", approvedBy: "test-fixture", note: "synthetic treatment approval for downstream integration test", evidenceHash: "test-treatment-evidence"}
  : gate);
reviewed = recalculateEditorialAssetWorkbench(reviewed, "2026-07-30T00:00:04.750Z");
const foundationGateSnapshot = structuredClone(reviewed.gates);
check("foundation-approval-unlocks-shot-composition", reviewed.gates.shotCompositionAllowed === true && reviewed.library.assets.filter((asset) => asset.stageId === "shot-composition").every((asset) => (asset.candidates?.length || 0) === 0 && asset.review.status === "pending"));
if (!reviewed.gates.shotCompositionAllowed) {
  throw new Error(`fixture-shot-composition-gate-locked:${JSON.stringify({
    blockers: reviewed.gates.blockers,
    articlePackagingKitApproved: reviewed.gates.articlePackagingKitApproved,
    exactAssetBindingsComplete: reviewed.gates.exactAssetBindingsComplete,
    typographyFoundryApproved: reviewed.gates.typographyFoundryApproved,
    foundation: {
      articleUnderstandingApproved: reviewed.gates.articleUnderstandingApproved,
      backgroundFoundryApproved: reviewed.gates.backgroundFoundryApproved,
      elementAtlasApproved: reviewed.gates.elementAtlasApproved,
      typographyBoardApproved: reviewed.gates.typographyBoardApproved,
      keyBackgroundsApproved: reviewed.gates.keyBackgroundsApproved,
      requiredSourceMaterialsResolved: reviewed.gates.requiredSourceMaterialsResolved,
    },
    presentationDecisionComplete: reviewed.gates.presentationDecisionComplete,
    materialManifestV2Ready: reviewed.gates.materialManifestV2Ready,
    visualTreatment: reviewed.production.visualDirector?.creativeReviews?.gates?.find((gate) => gate.id === "treatment"),
    bindingSummary: reviewed.production.articlePackagingKit?.bindingSummary,
    incompleteShots: reviewed.production.articlePackagingKit?.shotAssignments
      ?.filter((assignment) => !assignment.layerPlan?.complete)
      .map((assignment) => assignment.shotId),
    missingRequirements: reviewed.production.articlePackagingKit?.requirementBindings
      ?.filter((binding) => !binding.exactOutputBound)
      .map((binding) => binding.materialId),
  })}`);
}
check("shot-unlock-does-not-create-accepted-ir", reviewed.gates.acceptedShotIrAllowed === false && reviewed.gates.motionPrototypeAllowed === false);

// The remainder of this test exercises the downstream happy path. Narrow the
// three article-specific claims to exactly what the captured fixture proves so
// the intentional gap gate above does not block unrelated release checks.
const supportedScreenFixtureText = new Map([
  ["ED-23", "保存当前文章并打开已经存在的版本记录。"],
  ["ED-25", "划选这句并把它记入讨厌库。"],
  ["ED-26", "划选这句并把它记入喜欢库。"],
]);
for (const asset of reviewed.library.assets) if (supportedScreenFixtureText.has(asset.shotDemand?.shotId)) {
  asset.shotDemand.sourceText = supportedScreenFixtureText.get(asset.shotDemand.shotId);
  asset.shotDemand.visualJob = "证明当前真实操作已经在同一界面完成。";
  asset.shotDemand.keyPhrases = [];
}

for (const shot of reviewed.library.assets.filter((asset) => asset.stageId === "shot-composition")) {
  // ED-34 is intentionally blocked by the external aesthetic master until
  // real choice-trace material is supplied.  The production compiler must
  // fail closed here; this fixture records that explicit boundary instead of
  // treating a synthetic presenter/evidence fallback as a passing candidate.
  if (shot.shotDemand.shotId === "ED-34") {
    let blocked = false;
    try {
      createSceneGraphCandidates(reviewed, shot.id, "2026-07-30T00:00:05.000Z");
    } catch (error) {
      blocked = error instanceof Error && error.message === "aesthetic-master-material-blocked:ED-34";
    }
    check("ED-34-master-material-block-is-explicit", blocked);
    continue;
  }
  if (shot.shotDemand.shotId === "ED-12") {
    const assignment = reviewed.production.articlePackagingKit?.shotAssignments?.find((item) => item.shotId === "ED-12");
    if (assignment) assignment.sourceMediaAssetIds = modelEntityIds;
  }
  reviewed = createSceneGraphCandidates(reviewed, shot.id, "2026-07-30T00:00:05.000Z");
  const candidateShot = reviewed.library.assets.find((asset) => asset.id === shot.id);
  const operationSequence = isOperationSequenceCandidateSet(candidateShot);
  const candidateTopologyMatchesDemand = (candidate) => candidate.sceneGraph.topology === shot.shotDemand.topology
    || candidate.sceneGraph.topology === shot.shotDemand.visualPrimitiveId
    || (candidate.sceneGraph.aestheticMasterAnchor?.effectiveEditMode === "presenter-clean" && candidate.sceneGraph.topology === "presenter-clean-frame");
  check(`shot-local-candidate-batch-${shot.shotDemand.shotId}`, candidateShot.candidateBatch?.contract === "A1ShotCandidateBatch/v1"
    && candidateShot.candidateBatch.scope === "single-shot"
    && candidateShot.candidateBatch.shotId === shot.shotDemand.shotId
    && candidateShot.candidateBatch.candidateCount === candidateShot.candidates.length
    && candidateShot.candidateBatch.candidateIds.join("|") === candidateShot.candidates.map((candidate) => candidate.candidateId).join("|"));
  check(`four-to-eight-ai-contract-candidates-${shot.shotDemand.shotId}`, (operationSequence ? candidateShot.candidates.length >= 2 && candidateShot.candidates.length <= 5 : candidateShot.candidates.length >= 4 && candidateShot.candidates.length <= 8) && candidateShot.candidates.every((candidate) => candidate.contract === "A1SceneGraphCandidate/v1" && candidate.sceneGraph.contract === "A1EditableShotSceneGraph/v1" && candidateTopologyMatchesDemand(candidate) && candidate.sceneGraph.layoutSolution?.contract === "A1ConstraintLayoutSolution/v1" && candidate.sceneGraph.layoutSolution?.seed && candidate.rasterOnly === false));
  check(`every-editable-text-actor-has-finite-geometry-${shot.shotDemand.shotId}`, candidateShot.candidates.every((candidate) => candidate.sceneGraph.nodes
    .filter((node) => node.type === "editable-text")
    .every((node) => node.geometry
      && ["x", "y", "width", "height"].every((key) => Number.isFinite(node.geometry[key]))
      && node.geometry.width > 0
      && node.geometry.height > 0)));
  if (shot.shotDemand.editMode === "full-package") {
    check(`full-package-never-consumes-presenter-or-unsafe-photorealistic-composite-${shot.shotDemand.shotId}`, candidateShot.candidates.every((candidate) => {
      const primaryAsset = reviewed.library.assets.find((asset) => asset.id === candidate.sceneGraph.primaryMaterialId);
      const sourceType = String(primaryAsset?.provenance?.sourceType || "");
      const boundary = primaryAsset?.mediaBoundary || null;
      const hasPresenter = String(candidate.sceneGraph.primaryMaterialId || "").startsWith("source-presenter-")
        || primaryAsset?.presenterEvidence
        || boundary?.containsPresenter === true;
      const unsafeComposite = sourceType.includes("composite") && !(boundary?.photorealistic === false && boundary?.containsPresenter === false && boundary?.containsScreen === false);
      return !hasPresenter && !unsafeComposite;
    }));
  }
  const nativeScreenCandidates = shot.shotDemand.editMode === "screen-demo"
    ? candidateShot.candidates.filter((candidate) => candidate.sceneGraph.sourceEvidence?.realCausalRecording === true)
    : [];
  if (nativeScreenCandidates.length) {
    const beats = new Set(nativeScreenCandidates.map((candidate) => candidate.sceneGraph.nodes.find((node) => node.id === "primary")?.evidenceBeat || candidate.sceneGraph.sourceEvidence.presentation?.evidenceBeat).filter(Boolean));
    const views = new Set(nativeScreenCandidates.map((candidate) => candidate.sceneGraph.sourceEvidence.presentation?.view).filter(Boolean));
    check(`real-screen-candidates-cover-causal-beats-and-view-scales-${shot.shotDemand.shotId}`, (operationSequence ? ["selected", "candidates", "candidate-picked", "applied"].filter((beat) => candidateShot.candidates[0].sceneGraph.candidateSetPolicy.states.includes(beat)).every((beat) => beats.has(beat)) : beats.size >= 2 && views.has("context") && views.has("action-close")) && nativeScreenCandidates.every((candidate) => candidate.sceneGraph.nodes.find((node) => node.id === "primary")?.sourceFramePublicUrl));
    if (shot.shotDemand.sourceEvidenceSupportMaterialIds?.length) {
      const finalPrimary = nativeScreenCandidates.at(-1)?.sceneGraph.nodes.find((node) => node.id === "primary");
      const earlierPrimaryNodes = nativeScreenCandidates.slice(0, -1).map((candidate) => candidate.sceneGraph.nodes.find((node) => node.id === "primary"));
      check(`screen-supporting-evidence-is-a-visible-separate-fullframe-state-${shot.shotDemand.shotId}`, finalPrimary
        && shot.shotDemand.sourceEvidenceSupportMaterialIds.includes(finalPrimary.assetId)
        && finalPrimary.sourceFramePublicUrl
        && finalPrimary.evidenceFocusRegion
        && finalPrimary.geometry.width * finalPrimary.geometry.height >= .65
        && String(finalPrimary.objectBinding || "").startsWith("separate-real-capture:")
        && earlierPrimaryNodes.every((node) => node && !shot.shotDemand.sourceEvidenceSupportMaterialIds.includes(node.assetId)));
    }
    if (shot.shotDemand.shotId === "ED-04") {
      const pointerCandidate = nativeScreenCandidates.find((candidate) => candidate.sceneGraph.nodes.some((node) => node.type === "source-bound-pointer"));
      const appliedCandidate = nativeScreenCandidates.find((candidate) => candidate.sceneGraph.nodes.find((node) => node.id === "primary")?.evidenceBeat === "applied");
      const pointerNode = pointerCandidate?.sceneGraph.nodes.find((node) => node.type === "source-bound-pointer");
      const appliedEvidence = appliedCandidate?.sceneGraph.nodes.find((node) => node.id === "primary")?.operationEvidence;
      check("paragraph-operation-captures-real-pointer-and-exact-applied-text", pointerNode?.interaction?.source === "playwright-real-dom-event"
        && pointerNode?.interaction?.target === "real-candidate-accept-button"
        && pointerNode?.objectBinding === "real-source-target:real-candidate-accept-button"
        && appliedEvidence?.textMatches === true
        && appliedEvidence?.caretAtEnd === true);
    }
  }
  if (shot.shotDemand.editMode === "presenter-overlay" && shot.shotDemand.supportingMaterialIds?.length) {
    check(`presenter-evidence-is-source-bound-surface-not-floating-ui-card-${shot.shotDemand.shotId}`, candidateShot.candidates.every((candidate) => {
      const edgeStrip = candidate.sceneGraph.nodes.find((item) => item.id === "evidence-band");
      const preferenceSurface = candidate.sceneGraph.nodes.find((item) => ["source-bound-preference-surface", "source-bound-presenter-operation-surface"].includes(item.type));
      const validEdgeStrip = Boolean(edgeStrip?.evidenceFocusRegion && edgeStrip.evidenceEdge && edgeStrip.geometry.width <= .4 && edgeStrip.geometry.height <= .82);
      const validPreferenceSurface = Boolean(preferenceSurface
        && preferenceSurface.geometry.x === 0
        && preferenceSurface.geometry.height === 1
        && preferenceSurface.geometry.width >= .3
        && preferenceSurface.geometry.width <= .4
        && candidate.sceneGraph.sourceEvidence?.realCausalRecording === true
        && candidate.sceneGraph.sourceEvidence?.presentation?.actionChain?.length >= (preferenceSurface?.type === "source-bound-preference-surface" ? 4 : 2));
      return validEdgeStrip || validPreferenceSurface;
    }));
  }
  const identityCandidates = candidateShot.candidates.filter((candidate) => candidate.sceneGraph.presenterPackagingArchetype === "pixel-identity-lock");
  if (identityCandidates.length) {
    check(`presenter-hero-has-four-distinct-object-led-compositions-${shot.shotDemand.shotId}`, identityCandidates.length === 4 && new Set(identityCandidates.map((candidate) => candidate.sceneGraph.presenterCompositionVariant)).size === 4);
    check(`presenter-hero-resolve-manual-mask-contract-${shot.shotDemand.shotId}`, identityCandidates.every((candidate) => {
      const finishing = candidate.sceneGraph.resolveFinishing;
      return finishing?.contract === "A1ResolveManualMaskPlan/v1"
        && finishing.executionAuthority === "davinci-resolve"
        && finishing.simulatedOcclusionAllowedForPreview === true
        && finishing.simulatedOcclusionAllowedForDelivery === false;
    }));
    check(`presenter-hero-has-front-and-behind-alpha-roles-${shot.shotDemand.shotId}`, identityCandidates.every((candidate) => {
      const roles = new Set(candidate.sceneGraph.nodes
        .filter((node) => node.type === "editable-text" && node.visualMode !== "editable-shadow")
        .map((node) => node.resolveDepthRole));
      return roles.size < 3
        ? roles.has("front-overlay")
        : roles.has("behind-foreground") && roles.has("front-overlay");
    }));
    check(`presenter-preview-occluder-never-enters-delivery-${shot.shotDemand.shotId}`, identityCandidates.every((candidate) => candidate.sceneGraph.nodes
      .filter((node) => node.type === "source-bound-foreground-occluder")
      .every((node) => node.resolveDepthRole === "guide-only" && node.deliveryUsage === "preview-only")));
    check(`presenter-hero-uses-semantic-pixel-word-actors-${shot.shotDemand.shotId}`, identityCandidates.every((candidate) => {
      const actors = candidate.sceneGraph.nodes.filter((node) => /^presenter-word-/u.test(String(node.id || "")) && node.visualMode !== "editable-shadow");
      return actors.length >= 2
        && actors.every((node) => node.fontAssetId === "type-pixel-correction")
        && actors.every((node) => [node.geometry?.x, node.geometry?.y, node.geometry?.width, node.geometry?.height].every(Number.isFinite))
        && actors.some((node) => String(node.objectBinding || "").startsWith("real-footage-object:"))
        && actors.every((node) => !["acid-strip", "cobalt-pixel", "paper-stamp"].includes(node.surfaceTreatment));
    }));
    if (shot.shotDemand.shotId === "ED-01") check("presenter-hero-protects-smart-writing-phrase-ED-01", identityCandidates.every((candidate) => {
      const actorTexts = candidate.sceneGraph.nodes.filter((node) => /^presenter-word-/u.test(String(node.id || ""))).map((node) => node.text);
      return actorTexts.some((text) => ["智能写作", "智能写作工作台"].includes(text)) && !actorTexts.includes("智能") && !actorTexts.includes("写作");
    }));
    if (shot.shotDemand.shotId === "ED-01") {
      let revisionFixture = structuredClone(reviewed);
      const revisionShot = revisionFixture.library.assets.find((asset) => asset.id === shot.id);
      revisionShot.visualRevision = {
        contract: "A1VisualRevisionBrief/v1",
        round: 2,
        sourceReportSha256: "d".repeat(64),
        prompt: "让智能写作从真实麦克风臂后方进入，沿桌缘落点，再让工作台触发真实显示器并交接到下一镜选中文字。",
        createdAt: "2026-07-30T00:00:05.250Z",
      };
      revisionFixture = createSceneGraphCandidates(revisionFixture, shot.id, "2026-07-30T00:00:05.300Z");
      const revisedCandidates = revisionFixture.library.assets.find((asset) => asset.id === shot.id).candidates;
      const baseGeometrySignature = JSON.stringify(identityCandidates.map((candidate) => candidate.sceneGraph.nodes.filter((node) => /^presenter-word-/u.test(node.id)).map((node) => node.geometry)));
      const revisedGeometrySignature = JSON.stringify(revisedCandidates.map((candidate) => candidate.sceneGraph.nodes.filter((node) => /^presenter-word-/u.test(node.id)).map((node) => node.geometry)));
      // An explicit anchor revision may intentionally collapse to one mature
      // direction. The contract is not "always fan out"; it is that the
      // revision changes the object-bound geometry and keeps the causal lock.
      const revisionGeometryChanged = revisedGeometrySignature !== baseGeometrySignature;
      const revisionHasDistinctLayouts = new Set(revisedCandidates.map((candidate) => JSON.stringify(candidate.sceneGraph.nodes.filter((node) => /^presenter-word-/u.test(node.id)).map((node) => node.geometry)))).size > 1;
      check("presenter-visual-revision-compiles-to-new-object-causal-layouts", (revisionHasDistinctLayouts || (revisedCandidates.length === 1 && revisionGeometryChanged))
        && revisedCandidates.every((candidate) => candidate.sceneGraph.presenterRevisionPrimitive?.id === "desk-screen-causal-lock")
        && revisedCandidates.every((candidate) => {
          const actors = candidate.sceneGraph.nodes.filter((node) => /^presenter-word-/u.test(node.id));
          const bindings = new Set(actors.map((node) => node.objectBinding));
          const required = new Set(candidate.sceneGraph.presenterRevisionPrimitive?.requiredObjects || []);
          return actors.length >= 2
            && [...required].length >= 3
            && [...bindings].some((binding) => String(binding).includes("microphone-arm"))
            && [...bindings].some((binding) => String(binding).includes("left-desk-edge"));
        }));
    }
  }
  if (shot.shotDemand.shotId === "ED-10") {
      let correctionFixture = structuredClone(reviewed);
      const correctionShot = correctionFixture.library.assets.find((asset) => asset.id === shot.id);
      const correctionGlyph = correctionFixture.library.assets.find((asset) => asset.id === "glyph-board-polished-waste");
      correctionGlyph.typographySpec.generatedCandidates = correctionGlyph.typographySpec.generatedCandidates.map((candidate, index) => ({
        ...candidate,
        direction: index === 3 ? "纸面裁切冲突" : candidate.direction,
        cutoutPublicUrl: candidate.publicUrl,
        cutoutSha256: candidate.sha256,
        visualCritic: {score: index === 3 ? 22 : 20},
      }));
      correctionShot.visualRevision = {
        contract: "A1VisualRevisionBrief/v1",
        round: 2,
        sourceReportSha256: "f".repeat(64),
        // Deliberately omit the old keyword soup. A revised type-only shot
        // must stay on its mature route because of its shot semantics and
        // revision state, not because a prompt happened to contain a phrase.
        prompt: "重建这条判断句：保持准确可读，先建立完整排版秩序，再让结论词发生一次有因果的否决。",
        createdAt: "2026-07-30T00:00:05.350Z",
      };
      correctionFixture = createSceneGraphCandidates(correctionFixture, shot.id, "2026-07-30T00:00:05.400Z");
      const corrected = correctionFixture.library.assets.find((asset) => asset.id === shot.id);
      const correctedNodes = corrected.candidates[0].sceneGraph.nodes;
      check("type-verdict-critic-revision-keeps-editable-source-bound-type", corrected.candidates.length >= 1
        && corrected.candidates.every((candidate) => candidate.sceneGraph.visualFamily === "master-type-contradiction-proofing-repair")
        && corrected.candidates.every((candidate) => candidate.sceneGraph.nodes.some((node) => node.type === "editable-text" && node.visualMode !== "editable-shadow"))
        && corrected.candidates.every((candidate) => !candidate.screening.hardFailures.includes("pixel-signature-missing:ED-10"))
        && corrected.candidates.every((candidate) => candidate.sceneGraph.nodes.some((node) => node.id === "verdict-waste-editable" && node.fontAssetId === "type-pixel-correction"))
        && correctedNodes.find((node) => node.id === "background")
        && !correctedNodes.some((node) => node.id === "evidence-window"));
  }
  const policyCleanCandidate = candidateShot.candidates.find((candidate) => candidate.screening.hardFailures.length === 0);
  check(`visual-policy-leaves-an-approvable-candidate-${shot.shotDemand.shotId}`, Boolean(policyCleanCandidate));
  if (!policyCleanCandidate) {
    throw new Error(`fixture-has-no-policy-clean-candidate:${shot.shotDemand.shotId}:${JSON.stringify(candidateShot.candidates.map((candidate) => candidate.screening.hardFailures))}`);
  }
  reviewed = approveSceneGraphCandidate(reviewed, shot.id, policyCleanCandidate.candidateId, "test approval", "2026-07-30T00:00:05.500Z");
  reviewed = recalculateEditorialAssetWorkbench(reviewed, "2026-07-30T00:00:05.750Z");
}
// The live master deliberately blocks ED-34.  Continue the downstream
// compiler happy-path checks with an explicit in-memory fixture that supplies
// the missing choice-trace material; this never changes the live workspace or
// weakens the production BLOCK.
reviewed.candidateAdmission.aestheticMaster.sourcePath = null;
reviewed.candidateAdmission.anchorConstraints = (reviewed.candidateAdmission.anchorConstraints || []).map((anchor) => anchor.shotId === "ED-01"
  ? {...anchor, family: "presenter-clean", finalStatus: "READY_FOR_USER_DIRECTION_REVIEW"}
  : anchor.shotId === "ED-34"
    ? {...anchor, finalStatus: "READY_FOR_USER_DIRECTION_REVIEW", materialStatus: "REAL_CHOICE_TRACE_FIXTURE_BOUND"}
    : anchor);
for (const shotId of ["ED-01", "ED-10"]) {
  const fixtureShot = reviewed.library.assets.find((asset) => asset.shotDemand?.shotId === shotId);
  reviewed = createSceneGraphCandidates(reviewed, fixtureShot.id, "2026-07-30T00:00:05.080Z");
  const fixtureCandidate = reviewed.library.assets.find((asset) => asset.id === fixtureShot.id).candidates.find((candidate) => candidate.screening.hardFailures.length === 0);
  reviewed = approveSceneGraphCandidate(reviewed, fixtureShot.id, fixtureCandidate.candidateId, "fixture master anchor", "2026-07-30T00:00:05.090Z");
  reviewed = recalculateEditorialAssetWorkbench(reviewed, "2026-07-30T00:00:05.095Z");
}
const ed34Fixture = reviewed.library.assets.find((asset) => asset.shotDemand?.shotId === "ED-34");
reviewed = createSceneGraphCandidates(reviewed, ed34Fixture.id, "2026-07-30T00:00:05.100Z");
const ed34Candidate = reviewed.library.assets.find((asset) => asset.id === ed34Fixture.id).candidates.find((candidate) => candidate.screening.hardFailures.length === 0);
check("ED-34-fixture-material-unblocks-only-downstream-test", Boolean(ed34Candidate));
reviewed = approveSceneGraphCandidate(reviewed, ed34Fixture.id, ed34Candidate.candidateId, "fixture choice-trace material", "2026-07-30T00:00:05.200Z");
reviewed = recalculateEditorialAssetWorkbench(reviewed, "2026-07-30T00:00:05.250Z");
check("thirty-four-provisional-approvals-keep-accepted-ir-locked", reviewed.gates.acceptedShotIrAllowed === false && reviewed.library.assets.filter((asset) => asset.stageId === "shot-composition").length === 34);
const operationAuthorityFixture = structuredClone(reviewed);
const operationShot = operationAuthorityFixture.library.assets.find((asset) => asset.shotDemand?.shotId === "ED-02");
operationShot.selectedCandidateId = null;
operationShot.review = {status: "pending", note: null, reviewedAt: null, approvedContentSha256: null};
operationShot.visualCritic = {contract: "A1VisualMaturityCritic/v1", verdict: "REVISE", totalScore: 20, maxScore: 24, hardFailures: [], selectedCandidateId: null, reportPublicUrl: "/fixtures/static-screen-critic.json", reportSha256: "a".repeat(64), reviewedAt: "2026-07-30T00:00:05.780Z", exactTextPass: true, provisionalAdmission: false, referenceMaturity: false};
operationAuthorityFixture.production.operationOrchestration = {
  contract: "A1OperationOrchestration/v1",
  status: "review-only",
  currentShotId: "ED-02",
  adapterRegistry: ["browser-replay"],
  trace: {contract: "A1InteractionTrace/v1", publicUrl: "/fixtures/trace.json", sourceAssetId: "source-documentary-selection-action", sha256: "b".repeat(64), replayable: true, eventCount: 5},
  performance: {contract: "A1ScreenPerformanceIR/v1", publicUrl: "/fixtures/performance.json", sha256: "c".repeat(64), cameraBeatCount: 5, emphasisBeatCount: 5, pointerBeatCount: 5, typingBeatCount: 1},
  preview: {contract: "A1OperationPackagingProofArtifact/v1", status: "review-only", shotId: "ED-02", renderer: "remotion", sourceTraceSha256: "b".repeat(64), sourcePerformanceSha256: "c".repeat(64), publicUrl: "/fixtures/operation.mp4", sha256: "d".repeat(64), contactSheetPublicUrl: "/fixtures/operation-contact.png", contactSheetSha256: "e".repeat(64), reviewFrames: [{eventType: "result-commit", targetId: "ED-02-applied", frame: 120, publicUrl: "/fixtures/operation-applied.png", sha256: "f".repeat(64)}], width: 1920, height: 1080, fps: 30, durationInFrames: 150, reviewOnly: true, acceptedShotIrAllowed: false, renderAllowed: false, renderedAt: "2026-07-30T00:00:05.781Z"},
  visualReview: {contract: "A1OperationPackagingVisualReview/v1", verdict: "PASS", totalScore: 23, maxScore: 24, hardFailures: [], referenceMaturity: true, sourceProofSha256: "d".repeat(64), reportPublicUrl: "/fixtures/operation-critic.json", reportSha256: "1".repeat(64), reviewedAt: "2026-07-30T00:00:05.782Z"},
  gates: {realSourceBound: true, sourceEvidenceBound: true, operationTraceValid: true, previewAllowed: true, acceptedShotIrAllowed: false, renderAllowed: false},
  nextAction: "user-review-operation-packaging-in-4311",
  sha256: "2".repeat(64),
  createdAt: "2026-07-30T00:00:05.780Z",
};
const operationAuthorityItem = buildDesignCalibrationBatch(operationAuthorityFixture).items.find((item) => item.shotId === "ED-02");
check("screen-operation-dynamic-critic-overrides-static-screen-score-only-when-proof-hash-matches", operationAuthorityItem?.score === 23 && operationAuthorityItem.referenceMature === true && operationAuthorityItem.visualEvidenceKind === "operation-dynamic-sequence" && operationAuthorityItem.exceptions.some((item) => item.code === "automatic-admission-pending"));
const autoAdmittedOperation = automaticallyAdmitReferenceMatureShot(operationAuthorityFixture, operationShot.id, "2026-07-30T00:00:05.783Z");
const autoAdmittedOperationShot = autoAdmittedOperation.library.assets.find((asset) => asset.id === operationShot.id);
check("reference-mature-operation-shot-is-auto-admitted-without-user-approval", autoAdmittedOperationShot?.review.status === "approved" && autoAdmittedOperationShot.review.reviewedBy === "system-visual-critic" && Boolean(autoAdmittedOperationShot.selectedCandidateId));
operationAuthorityFixture.production.operationOrchestration.preview.sha256 = "9".repeat(64);
const staleOperationAuthorityItem = buildDesignCalibrationBatch(operationAuthorityFixture).items.find((item) => item.shotId === "ED-02");
check("stale-screen-operation-review-cannot-override-static-critic", staleOperationAuthorityItem?.score === 20 && staleOperationAuthorityItem.referenceMature === false && staleOperationAuthorityItem.visualEvidenceKind === "shot-static-candidates");
for (const shot of reviewed.library.assets.filter((asset) => asset.stageId === "shot-composition")) {
  shot.visualCritic = {contract: "A1VisualMaturityCritic/v1", verdict: "PASS", totalScore: 22, maxScore: 24, hardFailures: [], selectedCandidateId: shot.selectedCandidateId, reportPublicUrl: "/fixtures/critic.json", reportSha256: "e".repeat(64), reviewedAt: "2026-07-30T00:00:05.800Z", exactTextPass: true, provisionalAdmission: false, referenceMaturity: true};
  shot.candidateRender = {
    contact: {publicUrl: `/fixtures/${shot.shotDemand.shotId}-contact.png`, sha256: "c".repeat(64)},
    previews: shot.candidates.map((candidate) => ({candidateId: candidate.candidateId, publicUrl: `/fixtures/${candidate.candidateId}.png`, sha256: "d".repeat(64)})),
  };
  shot.review.approvedContentSha256 = editorialAssetContentSha256(shot);
}
reviewed.production.maturityLoop.allShotSelectedReview = {contract: "A1AllShotSelectedVisualAudit/v1", status: "PASS", hardFailures: [], selectedCandidateSetSha256: selectedShotCandidateSetSha256(reviewed)};
reviewed = recalculateEditorialAssetWorkbench(reviewed, "2026-07-30T00:00:05.850Z");
// Re-apply the ED-12 comparison expansion after the final workbench
// recalculation; candidate approvals intentionally rebuild the kit from its
// persisted assignment source.
const finalModelAssignment = reviewed.production.articlePackagingKit?.shotAssignments?.find((item) => item.shotId === "ED-12");
if (finalModelAssignment) finalModelAssignment.sourceMediaAssetIds = modelEntityIds;
check("thirty-four-reference-mature-shots-and-fresh-global-audit-open-accepted-ir-gate", reviewed.gates.acceptedShotIrAllowed === true);
const changedAssetPackFixture = structuredClone(reviewed);
const changedFoundation = changedAssetPackFixture.library.assets.find((asset) => asset.stageId === "background-foundry");
const dependentShotIds = new Set(changedAssetPackFixture.library.assets
  .filter((asset) => asset.route === "shot-composition" && asset.candidates.some((candidate) => candidate.sceneGraph.approvedMaterialIds.includes(changedFoundation.id)))
  .map((asset) => asset.shotDemand.shotId));
changedFoundation.promptBrief = `${changedFoundation.promptBrief} 上游材料版本变化。`;
const invalidatedByAssetPackChange = recalculateEditorialAssetWorkbench(changedAssetPackFixture, "2026-07-30T00:00:05.875Z");
const dependencyScopedShots = invalidatedByAssetPackChange.library.assets.filter((asset) => asset.route === "shot-composition");
check("upstream-asset-change-invalidates-only-dependent-shot-candidates", dependentShotIds.size > 0
  && dependentShotIds.size < dependencyScopedShots.length
  && dependencyScopedShots.filter((asset) => dependentShotIds.has(asset.shotDemand.shotId)).every((asset) => asset.candidates.length === 0 && asset.selectedCandidateId === null && asset.visualCritic === null && asset.review.status === "pending")
  && dependencyScopedShots.filter((asset) => !dependentShotIds.has(asset.shotDemand.shotId)).every((asset) => asset.candidates.length > 0 && asset.selectedCandidateId)
  && invalidatedByAssetPackChange.gates.acceptedShotIrAllowed === false);
check("accepted-ir-gate-never-opens-motion-h47-final", reviewed.gates.motionPrototypeAllowed === false && reviewed.gates.h47ExpansionAllowed === false && reviewed.gates.finalRenderAllowed === false);
const compiled = compileAcceptedShotIr(reviewed, "2026-07-30T00:00:05.900Z");
const compiledWorkspace = recalculateEditorialAssetWorkbench(compiled.workspace, "2026-07-30T00:00:05.950Z");
check("accepted-shot-ir-v2-has-all-thirty-four-scenes", compiled.acceptedSet.contract === "A1AcceptedShotIRSet/v2" && compiled.acceptedSet.shotCount === 34 && compiled.motionSet.contract === "A1MotionIRSet/v2" && compiled.motionSet.sceneCount === 34);
const acceptedParagraphOperation = compiled.acceptedSet.scenes.find((scene) => scene.shotId === "ED-04")?.operationSequence;
const paragraphMotion = compiled.motionSet.scenes.find((scene) => scene.sceneId === "ED-04")?.operationSequence;
check("accepted-shot-ir-retains-all-five-real-paragraph-operation-states", acceptedParagraphOperation?.contract === "A1AcceptedOperationSequence/v1"
  && acceptedParagraphOperation.states.map((state) => state.state).join(",") === "selected,typing-progress,candidates,candidate-picked,applied"
  && acceptedParagraphOperation.states.find((state) => state.state === "candidate-picked")?.pointer?.interaction?.source === "playwright-real-dom-event"
  && acceptedParagraphOperation.states.find((state) => state.state === "applied")?.operationEvidence?.textMatches === true
  && acceptedParagraphOperation.states.find((state) => state.state === "applied")?.operationEvidence?.caretAtEnd === true);
check("motion-ir-carries-semantic-operation-timing-pointer-typing-and-confirmation", paragraphMotion?.contract === "A1CausalOperationMotionPlan/v1"
  && paragraphMotion.states.length === 5
  && paragraphMotion.states.every((state, index, states) => state.startFrame < state.endFrame && (index === 0 || state.startFrame > states[index - 1].startFrame))
  && paragraphMotion.actors.pointer?.source === "playwright-real-dom-event"
  && paragraphMotion.actors.typing?.actorId === "operation-typing"
  && paragraphMotion.actors.confirmation?.actorId === "operation-confirmation");
const acceptedDirectOperation = compiled.acceptedSet.scenes.find((scene) => scene.shotId === "ED-02")?.operationSequence;
check("operation-without-approved-playback-proof-does-not-fabricate-direct-recording", acceptedDirectOperation?.directPlayback === null
  && acceptedDirectOperation?.states?.length > 1
  && acceptedDirectOperation.sameSourceSpaceRequired === true);
check("full-package-visible-text-has-composite-material-tone", compiled.acceptedSet.scenes.filter((scene) => scene.sceneGraph.editMode === "full-package").every((scene) => scene.sceneGraph.nodes.filter((node) => node.type === "editable-text" && node.visualMode !== "editable-shadow").every((node) => ["light", "dark"].includes(node.tone))));
const modelComparisonScene = compiled.acceptedSet.scenes.find((scene) => scene.shotId === "ED-12");
check("model-comparison-shot-renders-all-five-named-official-entities", new Set(modelComparisonScene?.sceneGraph.nodes.filter((node) => node.type === "source-bound-entity-imprint").map((node) => node.assetId)).size === 5 && modelComparisonScene.sceneGraph.nodes.some((node) => node.assetId === "source-network-zhipu-official-mark"));
check("motion-ir-uses-ai-motion-phrases-not-opacity-only", compiled.motionSet.scenes.every((scene) => scene.prohibitedFallbacks.includes("opacity-only") && scene.actors.some((actor) => actor.propertyTracks.some((track) => track.property !== "opacity"))));
check("motion-ir-uses-semantic-profiles-stable-holds-and-phrase-actors", new Set(compiled.motionSet.scenes.map((scene) => scene.motionProfile.name)).size >= 4 && compiled.motionSet.scenes.every((scene) => scene.motionProfile.contract === "A1SemanticMotionProfile/v1" && scene.phases.stableReadingHold.endFrame === scene.timing.frameDuration - 1 && scene.wordActors.every((actor) => actor.kind === "phrase-actor")));
check("full-package-primary-material-is-visible-from-frame-zero", compiled.motionSet.scenes.filter((scene) => scene.layout.nodes.some((node) => node.id === "primary") && compiled.acceptedSet.scenes.find((accepted) => accepted.shotId === scene.sceneId)?.sceneGraph.editMode === "full-package").every((scene) => !scene.actors.find((actor) => actor.id === "primary")?.propertyTracks.some((track) => ["maskReveal", "clipPathInset"].includes(track.property))));
check("screen-motion-is-causal-selection-rewrite-confirmation", compiled.motionSet.scenes.filter((scene) => scene.motionProfile.name.startsWith("causal-")).every((scene) => ["selectionProgress", "rewriteProgress", "confirmationPulse"].every((property) => scene.actors.some((actor) => actor.propertyTracks.some((item) => item.property === property)))));
check("screen-and-presenter-motion-are-split-into-semantic-families", new Set(compiled.motionSet.scenes.filter((scene) => scene.motionProfile.name.startsWith("causal-")).map((scene) => scene.motionProfile.name)).size >= 1
  && new Set(compiled.motionSet.scenes.filter((scene) => scene.motionProfile.name.startsWith("presenter-") && scene.motionProfile.name !== "presenter-address").map((scene) => scene.motionProfile.name)).size >= 1
  && compiled.motionSet.scenes.some((scene) => scene.motionProfile.name === "causal-selection-rewrite")
  && compiled.motionSet.scenes.some((scene) => scene.motionProfile.name === "presenter-object-lock"));
check("every-visible-text-node-has-a-motion-ir-actor-and-track", compiled.motionSet.scenes.every((scene) => scene.layout.nodes.filter((node) => node.type === "editable-text" && node.visualMode !== "editable-shadow").every((node) => scene.actors.some((actor) => actor.id === node.id && actor.propertyTracks.length > 0))));
const semanticallyStaggeredScene = compiled.motionSet.scenes.find((scene) => {
  const wordActorStarts = scene.actors
    .filter((actor) => /^(?:word-actor|presenter-word)-\d+$/u.test(actor.id) && actor.propertyTracks.length)
    .map((actor) => Math.min(...actor.propertyTracks.map((track) => track.startFrame)));
  return wordActorStarts.length >= 2 && new Set(wordActorStarts).size === wordActorStarts.length;
});
check("word-actor-stagger-is-semantic-and-not-node-index-driven", Boolean(semanticallyStaggeredScene));
const presenterMotionScene = compiled.motionSet.scenes.find((scene) => scene.motionProfile.name.startsWith("presenter-") && scene.motionProfile.name !== "presenter-address" && scene.actors.filter((actor) => /^presenter-word-\d+$/u.test(actor.id)).length >= 2);
const presenterPhraseStarts = presenterMotionScene?.actors
  .filter((actor) => /^presenter-word-\d+$/u.test(actor.id) && actor.propertyTracks.length)
  .map((actor) => Math.min(...actor.propertyTracks.map((track) => track.startFrame))) || [];
check("presenter-overlay-has-semantic-phrase-stagger-not-simultaneous-title-reveal", Boolean(presenterMotionScene) && presenterPhraseStarts.length >= 2 && new Set(presenterPhraseStarts).size === presenterPhraseStarts.length);
check("presenter-phrase-actors-remain-hidden-until-their-own-semantic-beat", Boolean(presenterMotionScene) && presenterMotionScene.actors.filter((actor) => /^presenter-word-\d+$/u.test(actor.id)).every((actor) => actor.propertyTracks.some((track) => ["maskReveal", "clipPathInset"].includes(track.property) && track.from === 0 || track.property === "clipPathInset" && track.from === 100)));
check("verdict-and-collision-text-remain-hidden-until-their-semantic-beat", compiled.motionSet.scenes.filter((scene) => ["quiet-verdict", "collision-lock"].includes(scene.motionProfile.name)).every((scene) => scene.layout.nodes.filter((node) => node.type === "editable-text" && node.visualMode !== "editable-shadow").every((node) => scene.actors.find((actor) => actor.id === node.id)?.propertyTracks.some((track) => track.property === "clipPathInset" && track.from === 100))));
check("compiled-accepted-ir-opens-only-motion-prototype", compiledWorkspace.gates.motionPrototypeAllowed === true && compiledWorkspace.gates.h47ExpansionAllowed === false && compiledWorkspace.gates.finalRenderAllowed === false);
const representative = buildRepresentativeMotionPlan(compiledWorkspace, compiled.acceptedSet, "2026-07-30T00:00:05.970Z");
check("representative-plan-covers-four-modes-two-grounded-handoffs-and-window", representative.plan.durationMs >= 18_000 && representative.plan.durationMs <= 28_000 && ["presenter-overlay", "screen-demo", "full-package", "type-only"].every((mode) => representative.plan.modes.includes(mode)) && representative.plan.handoffs.length >= 2 && representative.plan.handoffs.every((handoff) => handoff.semanticActor && handoff.fromActorId && handoff.toActorId && handoff.handoffType));
const representativeModeByShot = new Map(representative.plan.shotIds.map((shotId, index) => [shotId, representative.plan.modes[index]]));
check("screen-handoff-carries-source-bound-action-region-not-whole-ui", representative.plan.handoffs.filter((handoff) => representativeModeByShot.get(handoff.from) === "screen-demo").every((handoff) => handoff.fromActorId === "primary" && handoff.sourceRegion && handoff.sourceRegion.width < 1 && handoff.sourceRegion.height < 1));
expectError("representative-approval-requires-rendered-artifact", () => approveRepresentativeMotion(representative.workspace, 24, []), "representative-motion-user-review-required");
expectError("representative-artifact-is-plan-hash-bound", () => registerRepresentativeMotionArtifact(representative.workspace, {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/representative-motion/test.mp4", sha256: "b".repeat(64), planSha256: "c".repeat(64)}), "representative-motion-plan-sha-mismatch");
const registeredRepresentative = registerRepresentativeMotionArtifact(representative.workspace, {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/representative-motion/test.mp4", sha256: "b".repeat(64), planSha256: representative.plan.sha256, durationMs: representative.plan.durationMs, width: 960, height: 540}, "2026-07-30T00:00:05.980Z");
expectError("representative-score-below-22-blocked", () => registerRepresentativeMotionCriticPass(registeredRepresentative, 21, [], {reportPublicUrl: "/generated/system-line/test/representative-motion-critic.json", reportSha256: "e".repeat(64)}), "representative-motion-quality-gate-failed");
const motionCriticPassed = registerRepresentativeMotionCriticPass(registeredRepresentative, 22, [], {reportPublicUrl: "/generated/system-line/test/representative-motion-critic.json", reportSha256: "e".repeat(64)}, "2026-07-30T00:00:05.985Z");
check("representative-critic-pass-automatically-opens-full-motion", motionCriticPassed.production.motion.status === "approved-for-full-motion" && motionCriticPassed.production.motion.fullMotionAllowed === true && motionCriticPassed.production.release.review540p.status === "ready-to-render");
const motionApproved = motionCriticPassed;
check("representative-22-opens-only-full-motion", motionApproved.production.motion.fullMotionAllowed === true && motionApproved.production.release.review540p.status === "ready-to-render" && motionApproved.production.release.final1080p.status === "locked");
const missingAssemblyMedia = structuredClone(motionApproved);
missingAssemblyMedia.production.assembly.presenterMediaBound = false;
missingAssemblyMedia.production.assembly.screenMediaBound = false;
missingAssemblyMedia.production.assembly.audioBound = false;
expectError("540p-requires-real-presenter-screen-audio-subtitles", () => approve540pRelease(missingAssemblyMedia, {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/full-film/review-540p.mp4", sha256: "d".repeat(64)}), "film-assembly-real-media-audio-subtitles-required");
const assemblyReady = structuredClone(motionApproved);
assemblyReady.production.assembly.presenterMediaBound = true;
assemblyReady.production.assembly.screenMediaBound = true;
assemblyReady.production.assembly.audioBound = true;
assemblyReady.production.assembly.subtitleTimelineBound = true;
const rendering540p = begin540pRender(assemblyReady);
const review540pReady = register540pRenderArtifact(rendering540p, {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/full-film/review-540p.mp4", sha256: "d".repeat(64), durationMs: 218_400, width: 960, height: 540}, "2026-07-30T00:00:06.000Z");
const visuallyPassed540p = registerFilmVisualQualityReview(review540pReady, {contract: "A1FilmVisualQualityReview/v1", status: "passed", scope: "sequence-contact-sheet", verdict: "PASS", totalScore: 22, maxScore: 24, hardFailures: [], sourceArtifactSha256: "d".repeat(64), reportPublicUrl: "/generated/system-line/test/visual-quality-review.json", reportSha256: "g".repeat(64), repairBriefPublicUrl: null, repairBriefSha256: null, reviewedAt: "2026-07-30T00:00:06.050Z"}, "2026-07-30T00:00:06.050Z");
const approved540p = approve540pRelease(visuallyPassed540p, undefined, "2026-07-30T00:00:06.100Z");
check("540p-render-and-quality-gate-unlocks-only-explicit-1080-request", approved540p.production.release.review540p.status === "approved" && approved540p.production.release.final1080p.status === "ready-for-explicit-request" && approved540p.production.release.davinciPackage.status === "locked");
const requested1080p = request1080pRelease(approved540p, "2026-07-30T00:00:06.200Z");
const finalReleaseDecision = requestFinalRenderAndDavinciRelease(visuallyPassed540p, "2026-07-30T00:00:06.150Z");
check("one-final-decision-approves-540p-and-queues-1080p-davinci-together", finalReleaseDecision.production.release.review540p.status === "approved" && finalReleaseDecision.production.release.final1080p.status === "queued-explicit-user-request" && finalReleaseDecision.production.release.finalDecision?.action === "render-1080p-and-generate-davinci-package");
const delivered = register1080pAndDavinciRelease(requested1080p, {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/full-film/master-1080p.mp4", sha256: "e".repeat(64), durationMs: 218_400, width: 1920, height: 1080}, {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/davinci-delivery/package.zip", sha256: "f".repeat(64)}, "2026-07-30T00:00:06.300Z");
const deliveredRecalculated = recalculateEditorialAssetWorkbench(delivered, "2026-07-30T00:00:06.350Z");
check("1080p-and-davinci-completion-still-needs-cross-article-proof", deliveredRecalculated.production.release.final1080p.status === "complete" && deliveredRecalculated.production.release.davinciPackage.status === "complete" && deliveredRecalculated.production.release.maturityStatus === "NOT_MATURE");
const crossArticleProven = structuredClone(deliveredRecalculated);
crossArticleProven.production.release.crossArticleProof = {status: "pass", projectId: "unseen-real-article-fixture", reportSha256: "9".repeat(64), pipeline: {contract: "A1CrossArticlePipelineQualification/v1", route: "A1VisualDirectorProject/v1", requiredRoute: "A1VisualDirectorProject/v1", qualifiesForMaturity: true, reason: "fixture"}};
const mature = recalculateEditorialAssetWorkbench(crossArticleProven, "2026-07-30T00:00:06.400Z");
check("maturity-requires-current-film-recovery-cross-article-and-explicit-delivery", mature.production.release.maturityStatus === "MATURE_FOR_PRODUCTION");

const approvedBackground = updateEditorialAsset(source, "bg-warm-paper-dot", {action: "approve"}, "2026-07-30T00:00:06.000Z");
const changedBackground = updateEditorialAsset(approvedBackground, "bg-warm-paper-dot", {action: "save-brief", promptBrief: "改变后的底材简报必须让旧审批自动失效，并重新进行人工审核。"}, "2026-07-30T00:00:07.000Z");
const changedAsset = changedBackground.library.assets.find((asset) => asset.id === "bg-warm-paper-dot");
check("content-change-invalidates-approval", changedAsset?.review.status === "pending" && changedAsset?.review.approvedContentSha256 === null && changedAsset?.status === "ready-for-review");

const failures = results.filter((item) => item.status === "FAIL");
console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", results, failures: failures.map((item) => item.id), debug: failures.length ? {foundationGateSnapshot, finalGates: reviewed.gates} : undefined}, null, 2));
if (failures.length) process.exitCode = 1;
