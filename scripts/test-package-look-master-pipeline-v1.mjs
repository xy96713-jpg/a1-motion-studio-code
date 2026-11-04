#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {buildPackageAssetKitPlan, queuePackageLayerGenerationJobs} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {
  A1_PACKAGE_LOOK_MASTER_STATES,
  advancePackageRuntimeWithLookMasterCandidate,
  auditPackageLookMasterTopologyDiversity,
  assertPackageLookMasterRuntime,
  buildPackageLookMasterCandidate,
  buildPackageLookMasterPlan,
  buildPackageLookMasterPrompt,
  queuePackageLookMasterGenerationJobs,
  reviewPackageLookMaster,
} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {buildPackageLookMasterPixelAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {assertPackageLookMasterServerAssessment, buildPackageLookMasterVisualReviewPrompt, runPackageLookMasterVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";
import {buildVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";

// App modules resolve their native image runtime from the app installation.
// Reuse that exact instance so this integration test does not load a second,
// ABI-distinct libvips from the repository root.
const requireFromStudioApp = createRequire(new URL("../apps/studio-next/package.json", import.meta.url));
const sharp = requireFromStudioApp("sharp");

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const workspace = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const testShotId = workspace.production.shotIntelligence.decisionSet.items.find((item) => item.packageDecision === "PACKAGE"
  && !(item.strongLanguageEvent && item.baseVisualCarrier === "PRESENTER_BASE" && (item.presentationMode || item.assemblyMode) !== "OVERLAY")
  && workspace.production.shotIntelligence.videoPackagingContexts.items.some((context) => context.shotId === item.shotId
    && context.baseFrame
    && (context.presentationMode || context.assemblyMode) === (item.presentationMode || item.assemblyMode))
  && workspace.library.assets.some((asset) => asset.shotDemand?.shotId === item.shotId))?.shotId;
assert.ok(testShotId, "a mode-consistent PACKAGE fixture with an actual hold frame is required");
const decision = workspace.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === testShotId);
const event = workspace.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds.includes(testShotId));
const sourceVideoContext = workspace.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === testShotId);
const shotDemand = workspace.library.assets.find((asset) => asset.shotDemand?.shotId === testShotId)?.shotDemand;
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
assert.ok(decision && event && sourceVideoContext?.baseFrame && shotDemand, `${testShotId} package decision, event and actual hold frame required`);
// The production context intentionally does not invent face bounds.
// This isolated audit fixture declares a test-only presenter region so the
// transparent safe-zone candidate can exercise the positive composite path.
const videoContext = buildVideoPackagingContext({
  decision,
  demand: shotDemand,
  holdFrame: sourceVideoContext.baseFrame,
  subjectBounds: {x: 0.58, y: 0.08, width: 0.34, height: 0.84, semanticRole: "test-presenter-face-and-body", status: "TEST_DECLARED"},
  safeZones: [{id: "test-caption-safe-zone", x: 0.04, y: 0.05, width: 0.3, height: 0.28, semanticRole: "editor-caption-safe-zone"}],
  visualAnchors: sourceVideoContext.visualAnchors,
  createdAt: "2026-08-04T00:00:00.000Z",
});

const briefA = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, now: "2026-08-04T00:00:00.000Z"});
const briefB = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, now: "2026-08-04T00:00:01.000Z"});
assert.equal(briefA.styleBriefSha256, briefB.styleBriefSha256, "style brief identity must ignore generatedAt");

const lookPlanA = buildPackageLookMasterPlan(decision, briefA, {videoContext, referenceManifest, now: "2026-08-04T00:00:00.000Z"});
const lookPlanB = buildPackageLookMasterPlan(decision, briefA, {videoContext, referenceManifest, now: "2026-08-04T00:00:01.000Z"});
assert.equal(lookPlanA.planSha256, lookPlanB.planSha256, "look-master plan identity must ignore createdAt");
const fallbackLookPlan = buildPackageLookMasterPlan(decision, briefA, {referenceManifest, now: "2026-08-04T00:00:02.000Z"});
assert.equal(fallbackLookPlan.videoContext.presentationMode, fallbackLookPlan.presentationMode);
assert.equal(fallbackLookPlan.presentationMode, decision.presentationMode || decision.assemblyMode);
assert.ok(typeof fallbackLookPlan.videoContext.baseVideoRelationship === "string" && fallbackLookPlan.videoContext.baseVideoRelationship.length > 0);
assert.ok(lookPlanA.candidateBudget >= 2 && lookPlanA.candidateBudget <= 4, "candidate budget must be adaptive within 2-4");
assert.equal(lookPlanA.videoContext.editorOwnsBaseCut, true);
assert.equal(lookPlanA.videoContext.narrativeFunction, decision.semanticRole);
assert.equal(lookPlanA.generationCriteria.mustRemainCompatibleWithBaseVideoCompositionColorAndRhythm, true);
assert.ok(lookPlanA.referenceInputs.every((item) => item.publicUrl && item.sha256 && item.role), "reference inputs must carry URL/SHA/role");
assert.equal(lookPlanA.referenceBindingAudit?.status, "PASS");
assert.equal(lookPlanA.referenceBindingAudit?.selectedSubsetCount, lookPlanA.referenceInputs.length);
assert.equal(lookPlanA.referenceBindingAudit?.manifestSourceCount, referenceManifest.sources.length);
assert.deepEqual(lookPlanA.referenceBindingAudit?.selectedReferenceIds, lookPlanA.referenceInputs.map((item) => item.id));
assert.equal(new Set(lookPlanA.candidateDirections.map((item) => item.fingerprint)).size, lookPlanA.candidateBudget, "each candidate direction must be structurally distinct");
for (const state of ["LOOK_MASTER_PLANS_READY", "LOOK_MASTER_CANDIDATES_READY", "LOOK_MASTER_REVIEW_REQUIRED", "LAYER_RECONSTRUCTION_READY", "LAYER_RECONSTRUCTION_IN_PROGRESS", "ASSEMBLY_PARITY_REVIEW_REQUIRED", "MOTION_READY"]) assert.ok(A1_PACKAGE_LOOK_MASTER_STATES.includes(state));

const prompt = buildPackageLookMasterPrompt(lookPlanA, 1);
assert.match(prompt, /finished, integrated, high-quality main-video visual packaging Look Master/);
assert.match(prompt, /not an independent poster/);
assert.match(prompt, /Video context:/);
assert.doesNotMatch(prompt, /Output ONLY this layer|never a finished poster or cross-layer composition/);

// A current comparative board supersedes the legacy candidateDirections
// catalog. Reviewer prompt compilation must resolve the active direction set
// so direction-04/05 revisions remain reviewable after selector migration.
const activeDirection = {...lookPlanA.candidateDirections[0], directionId: "direction-05", fingerprint: "active-direction-05-fingerprint"};
const activeSelectorPlan = {
  ...structuredClone(lookPlanA),
  candidateDirections: [{...lookPlanA.candidateDirections[0], directionId: "legacy-direction", fingerprint: "legacy-direction-fingerprint"}],
  currentCandidateDirections: [activeDirection],
  activeCandidateSet: {status: "ACTIVE", directionIds: ["direction-05"], selectedDirectionId: "direction-05"},
};
const activeReviewerPrompt = buildPackageLookMasterVisualReviewPrompt({
  plan: activeSelectorPlan,
  rawReference: {directionFingerprint: activeDirection.fingerprint},
  preliminaryAudit: {actualPixelMetrics: {}, footageCompatibility: {status: "PASS"}},
});
assert.match(activeReviewerPrompt, /active-direction-05-fingerprint/);
assert.doesNotMatch(activeReviewerPrompt, /legacy-direction-fingerprint/);

const kitPlan = buildPackageAssetKitPlan(decision, {styleBriefSha256: briefA.styleBriefSha256, styleBriefBinding: briefA, referenceManifest, existingAssets: workspace.library.assets, now: "2026-08-04T00:00:00.000Z"});
assert.equal(kitPlan.status, "WAITING_FOR_LOOK_MASTER");
assert.equal(kitPlan.selectedLookMasterBinding, null);
const {activePackagingPolicy: _activePackagingPolicy, ...legacyRuntimeBase} = structuredClone(workspace.production.shotIntelligence);
const runtime = {
  ...legacyRuntimeBase,
  canonicalStaticBoardAuthority: null,
  canonicalStaticBoardInputReadiness: null,
  status: "LOOK_MASTER_PLANS_READY",
  stateMachine: A1_PACKAGE_LOOK_MASTER_STATES,
  packageLookMasterPlans: [lookPlanA],
  crossEventTopologyAudit: auditPackageLookMasterTopologyDiversity([lookPlanA]),
  videoPackagingContexts: {...workspace.production.shotIntelligence.videoPackagingContexts, items: [videoContext], summary: {contextCount: 1, holdFrameBoundCount: 1, unverifiedCompatibilityCount: 0, recommendationAllowedCount: 0}},
  lookMasterRawReferences: [],
  packageAssetKitPlans: [kitPlan],
  packageAssemblyRecipes: [],
  decisionSet: {...structuredClone(workspace.production.shotIntelligence.decisionSet), items: [decision], summary: {...workspace.production.shotIntelligence.decisionSet.summary, packageCount: 1, noPackageCount: 0}},
};
const testWorkspace = structuredClone(workspace);
testWorkspace.production.shotIntelligence = runtime;
testWorkspace.production.generation.jobs = [];
testWorkspace.production.generation.summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: 0};
testWorkspace.production.generation.workerStatus = "frozen";
assertPackageLookMasterRuntime(runtime);
assert.throws(() => queuePackageLayerGenerationJobs(testWorkspace, testShotId), /look-master-approval-required/);

const queued = queuePackageLookMasterGenerationJobs(testWorkspace, testShotId, {now: "2026-08-04T00:00:02.000Z"});
assert.equal(queued.jobs.length, lookPlanA.candidateBudget);
assert.ok(queued.jobs.every((job) => job.targetKind === "package-look-master" && job.capabilitySnapshot.finishedCompositionAllowed === true && job.capabilitySnapshot.crossLayerCompositeAllowed === true));
assert.ok(queued.jobs.every((job) => !/Output ONLY this layer|never a finished poster or cross-layer composition/.test(job.prompt)));
assert.equal(new Set(queued.jobs.map((job) => job.candidateDirection.fingerprint)).size, queued.jobs.length, "jobs must bind distinct direction fingerprints");
const queuedAgain = queuePackageLookMasterGenerationJobs(queued.workspace, testShotId, {now: "2026-08-04T00:00:03.000Z"});
assert.deepEqual(queuedAgain.jobs.map((job) => job.id), queued.jobs.map((job) => job.id), "generationInputHash cache must be idempotent");

const holdFrameFile = path.join(appRoot, "public", videoContext.baseFrame.publicUrl.replace(/^\//u, ""));
const opaqueRaw = {
  contract: "A1PackageLookMasterRaw/v1",
  referenceId: "look-master-raw-opaque-test",
  shotId: testShotId,
  eventId: lookPlanA.eventId,
  planSha256: lookPlanA.planSha256,
  styleBriefSha256: lookPlanA.styleBriefSha256,
  candidateDirectionId: lookPlanA.candidateDirections[0].directionId,
  directionFingerprint: lookPlanA.candidateDirections[0].fingerprint,
  artifact: {publicUrl: videoContext.baseFrame.publicUrl, sha256: crypto.createHash("sha256").update(fs.readFileSync(holdFrameFile)).digest("hex"), width: 960, height: 540, workspaceImported: true},
};
const automaticAudit = await buildPackageLookMasterPixelAudit({plan: lookPlanA, rawReference: opaqueRaw, publicRoot: path.join(appRoot, "public"), outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/test-look-master-audits", now: "2026-08-04T00:00:03.500Z"});
assert.notEqual(automaticAudit.status, "PASS", "opaque overlay without trusted semantic review must not auto-pass");
if (decision.presentationMode === "OVERLAY") assert.equal(automaticAudit.footageCompatibility.status, "FAIL");
else assert.ok(["PASS", "FAIL"].includes(automaticAudit.footageCompatibility.status));
const clientForgedPass = buildPackageLookMasterCandidate(lookPlanA, {
  classification: "INTEGRATED_PACKAGE_CONCEPT",
  artifact: opaqueRaw.artifact,
  provenance: {generationJobContract: "A1AssetGenerationJob/v2", generationJobId: "forged-client-job"},
  aestheticAudit: {status: "PASS", score: 99},
  policyAudit: {status: "PASS"},
  styleAudit: {status: "PASS", styleBriefSha256: briefA.styleBriefSha256},
});
assert.equal(clientForgedPass.admission.status, "FAIL", "client-submitted PASS fields must never admit a look master");

const reviewCandidatePublicUrl = "/generated/system-line/editorial-asset-workbench-v1/test-look-master-audits/ed-01-transparent-candidate.png";
const reviewCandidateFile = path.join(appRoot, "public", reviewCandidatePublicUrl.replace(/^\//u, ""));
fs.mkdirSync(path.dirname(reviewCandidateFile), {recursive: true});
const actorPixels = Buffer.alloc(220 * 120 * 4);
for (let index = 0; index < actorPixels.length; index += 4) {
  const pixel = index / 4;
  const value = ((pixel * 73) ^ (pixel >> 3)) % 255;
  actorPixels[index] = value;
  actorPixels[index + 1] = 70 + (value % 150);
  actorPixels[index + 2] = 255 - value;
  actorPixels[index + 3] = 255;
}
const titlePixels = Buffer.alloc(560 * 88 * 4);
for (let y = 0; y < 88; y += 1) {
  for (let x = 0; x < 560; x += 1) {
    // Blocky test-only glyph rows: actual decoded edges live inside the
    // reported title bbox, so the audit cannot pass on metadata alone.
    const inGlyph = (y >= 8 && y <= 78)
      && ((x % 54 >= 4 && x % 54 <= 15) || (y % 28 >= 4 && y % 28 <= 12 && x % 54 <= 42));
    if (!inGlyph) continue;
    const index = (y * 560 + x) * 4;
    titlePixels[index] = 245;
    titlePixels[index + 1] = 248;
    titlePixels[index + 2] = 255;
    titlePixels[index + 3] = 255;
  }
}
await sharp({create: {width: 960, height: 540, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([
  {input: titlePixels, raw: {width: 560, height: 88, channels: 4}, left: 78, top: 66},
  {input: actorPixels, raw: {width: 220, height: 120, channels: 4}, left: 48, top: 230},
]).png().toFile(reviewCandidateFile);
const reviewCandidateSha = crypto.createHash("sha256").update(fs.readFileSync(reviewCandidateFile)).digest("hex");
const reviewRaw = {
  ...opaqueRaw,
  referenceId: "look-master-raw-server-review-test",
  artifact: {publicUrl: reviewCandidatePublicUrl, sha256: reviewCandidateSha, width: 960, height: 540, workspaceImported: true, perceptualHash: "server-review-phash"},
};
const preliminaryReviewAudit = await buildPackageLookMasterPixelAudit({plan: lookPlanA, rawReference: reviewRaw, publicRoot: path.join(appRoot, "public"), outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/test-look-master-audits", now: "2026-08-04T00:00:03.600Z"});
assert.equal(preliminaryReviewAudit.footageCompatibility.status, "PASS", `transparent safe-zone candidate must produce a real base-frame composite: ${JSON.stringify(preliminaryReviewAudit.footageCompatibility)}`);
assert.equal(preliminaryReviewAudit.status, "REVIEW_REQUIRED", "pixel preflight alone cannot visually approve a candidate");
let reviewerImageCount = 0;
const serverAssessment = await runPackageLookMasterVisualReview({
  plan: lookPlanA,
  rawReference: reviewRaw,
  preliminaryAudit: preliminaryReviewAudit,
  candidateImage: reviewCandidateFile,
  baseFrameImage: holdFrameFile,
  compositeImage: path.join(appRoot, "public", preliminaryReviewAudit.compositePreview.publicUrl.replace(/^\//u, "")),
  referenceImages: lookPlanA.referenceInputs.map((item) => ({id: item.id, path: path.join(appRoot, "public", item.publicUrl.replace(/^\//u, "")), sha256: item.sha256})),
  cacheDir: path.join(root, ".codex-artifacts", "test-package-look-master-reviewer-v1", String(process.pid)),
  runner: async ({images, prompt: reviewerPrompt}) => {
    reviewerImageCount = images.length;
    assert.match(reviewerPrompt, /真实正片 hold frame/);
    assert.ok(lookPlanA.referenceInputs.every((item) => reviewerPrompt.includes(item.id)));
    return {
      contract: "A1PackageLookMasterVisualReview/v1",
      verdict: "PASS",
      totalScore: 23,
      semanticThreeSecond: {status: "PASS", evidence: "单一工作台对象群能在三秒内建立身份。"},
      dominantActor: {status: "PASS", evidence: "紧凑工作台对象是唯一主角。"},
      referenceTraitVisibility: {status: "FAIL", visibleReferenceIds: lookPlanA.referenceInputs.slice(0, 2).map((item) => item.id), evidence: "两张绑定参考的窗口构图与 1-bit 物件可见；第三张未采用。"},
      duplicateFingerprint: {status: "PASS", evidence: "拓扑与近期候选不同。"},
      policyAudit: {status: "PASS", failures: []},
      styleAudit: {status: "PASS", evidence: "采用参考语法但未复制第三方内容。"},
      typographyVisual: {
        status: lookPlanA.typographyActor ? "PASS" : "NOT_APPLICABLE",
        actualPixelSegmentation: lookPlanA.typographyActor === true,
        titleBbox: lookPlanA.typographyActor ? {x: 0.08, y: 0.12, width: 0.62, height: 0.18} : null,
        minGlyphHeightPx: lookPlanA.typographyActor ? 88 : null,
        headlineSupportHeightRatio: lookPlanA.typographyActor ? 2 : null,
        supportActorPresent: lookPlanA.typographyActor === true,
        primaryVisualLayer: lookPlanA.typographyActor ? "PRIMARY" : "NONE",
        lineCount: lookPlanA.typographyActor ? 1 : 0,
        threeSecondReadable: lookPlanA.typographyActor === true,
        evidence: lookPlanA.typographyActor ? "测试候选中的标题字块按实际像素边界记录。" : "本镜无字体主角。",
      },
      hardFailures: [],
      structuredRevision: {preserve: ["紧凑对象群"], change: [], nextDirection: "保持当前结构。"},
    };
  },
  now: "2026-08-04T00:00:03.700Z",
});
assert.equal(reviewerImageCount, 3 + lookPlanA.referenceInputs.length, "reviewer must receive candidate, actual base frame, actual composite and every bound reference image");
assert.equal(serverAssessment.status, "PASS");
assert.equal(serverAssessment.reviewerPolicyVersion, 2);
assert.equal(serverAssessment.referenceTraitVisibility.status, "PASS", "two visibly adopted bound references satisfy the style gate; an unused third reference is not a failure");
const typographyReviewApplicable = lookPlanA.typographyActor === true
  && (lookPlanA.typographyVisualRole || lookPlanA.typographyPolicy?.typographyVisualRole || "NONE") !== "NONE";
if (typographyReviewApplicable) {
  assert.equal(serverAssessment.typographyVisual.actualPixelSegmentation, true);
  assert.deepEqual(serverAssessment.typographyVisual.titleBbox, {x: 0.08, y: 0.12, width: 0.62, height: 0.18});
} else {
  assert.equal(serverAssessment.typographyVisual.status, "NOT_APPLICABLE");
  assert.equal(serverAssessment.typographyVisual.actualPixelSegmentation, false);
}
assertPackageLookMasterServerAssessment(serverAssessment);
assert.throws(() => assertPackageLookMasterServerAssessment({...serverAssessment, artifactSha256: "0".repeat(64)}), /assessment-sha-invalid/);
const serverReviewedAudit = await buildPackageLookMasterPixelAudit({plan: lookPlanA, rawReference: reviewRaw, publicRoot: path.join(appRoot, "public"), outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/test-look-master-audits", trustedAssessment: serverAssessment, now: "2026-08-04T00:00:03.800Z"});
assert.equal(serverReviewedAudit.status, "PASS", "only the hash-bound server visual assessment may unlock admission");
assert.equal(serverReviewedAudit.serverVisualAssessmentSha256, serverAssessment.assessmentSha256);

let advancedRuntime = runtime;
for (let index = 1; index <= 2; index += 1) {
  const candidatePublicUrl = `/generated/system-line/editorial-asset-workbench-v1/test-look-master-audits/${testShotId.toLowerCase()}-approved-fixture-${index}.png`;
  const candidateFile = path.join(appRoot, "public", candidatePublicUrl.replace(/^\//u, ""));
  fs.mkdirSync(path.dirname(candidateFile), {recursive: true});
  await sharp({
    create: {
      width: 960,
      height: 540,
      channels: 4,
      background: {r: 34 + index * 20, g: 48, b: 76 + index * 12, alpha: 1},
    },
  }).png().toFile(candidateFile);
  const contentSha = crypto.createHash("sha256").update(fs.readFileSync(candidateFile)).digest("hex");
  const direction = lookPlanA.candidateDirections[index - 1];
  const audit = {
    contract: "A1PackageLookMasterPixelAudit/v1",
    version: 1,
    serverGenerated: true,
    status: "PASS",
    shotId: lookPlanA.shotId,
    eventId: lookPlanA.eventId,
    planSha256: lookPlanA.planSha256,
    styleBriefSha256: briefA.styleBriefSha256,
    rawReferenceId: `raw-${index}`,
    artifactSha256: contentSha,
    artifactPublicUrl: candidatePublicUrl,
    directionFingerprint: direction.fingerprint,
    actualPixelMetrics: {width: 1920, height: 1080, hasAlpha: true},
    compositePreview: {kind: "ACTUAL_BASE_FRAME_COMPOSITE", publicUrl: `/generated/system-line/editorial-asset-workbench-v1/look-master-audits/ED-01/c${index}.png`, sha256: crypto.createHash("sha256").update(`composite-${index}`).digest("hex"), width: 960, height: 540},
    footageCompatibility: {status: "PASS", baseFrameSha256: videoContext.baseFrame.sha256, subjectOcclusion: {status: "PASS", alphaCoverage: 0.05}},
    semanticThreeSecond: {status: "PASS", score: 90 - index},
    dominantActor: {status: "PASS"},
    referenceTraitVisibility: {status: "PASS", visibleReferenceIds: lookPlanA.referenceInputs.map((item) => item.id)},
    duplicateFingerprint: {status: "PASS"},
    policyAudit: {status: "PASS"},
    styleAudit: {status: "PASS", styleBriefSha256: briefA.styleBriefSha256},
    serverVisualAssessmentSha256: crypto.createHash("sha256").update(`server-assessment-${index}`).digest("hex"),
    totalScore: 90 - index,
    admissionAllowed: true,
    generatedAt: `2026-08-04T00:00:0${3 + index}.000Z`,
  };
  const auditHashInput = {...audit};
  delete auditHashInput.generatedAt;
  audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(auditHashInput)).digest("hex");
  const candidate = buildPackageLookMasterCandidate(lookPlanA, {
    candidateId: `ed-01-look-master-${index}`,
    classification: "INTEGRATED_PACKAGE_CONCEPT",
    artifact: {publicUrl: candidatePublicUrl, sha256: contentSha, width: 960, height: 540, workspaceImported: true},
    provenance: {generationJobContract: "A1AssetGenerationJob/v2", generationJobId: `look-master-job-${index}`},
    auditArtifact: audit,
  }, {now: `2026-08-04T00:00:0${3 + index}.000Z`});
  assert.equal(candidate.admission.status, "PASS");
  advancedRuntime = advancePackageRuntimeWithLookMasterCandidate(advancedRuntime, candidate).runtime;
}
assert.equal(advancedRuntime.status, "LOOK_MASTER_REVIEW_REQUIRED");
const advancedLookPlan = advancedRuntime.packageLookMasterPlans[0];
assert.equal(advancedLookPlan.recommendation.requiresUserConfirmation, true);
const approved = reviewPackageLookMaster(advancedRuntime, {shotId: testShotId, candidateId: advancedLookPlan.recommendation.candidateId, decision: "approved", now: "2026-08-04T00:00:09.000Z"});
assert.equal(approved.runtime.status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(approved.runtime.packageAssetKitPlans[0].status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(approved.runtime.packageAssetKitPlans[0].selectedLookMasterBinding.status, "VISUAL_APPROVED");
assert.equal(approved.runtime.packageAssetKitPlans[0].masterPreservationPolicy.localSecondDesignForbidden, true);
assert.ok(approved.runtime.packageAssetKitPlans[0].layers.every((layer) => layer.route === "NONE" || layer.candidateBudget === 1));
const directRecipe = approved.runtime.packageAssemblyRecipes.find((item) => item.shotId === testShotId);
assert.equal(directRecipe.assemblySource.mode, "IMAGEGEN_APPROVED_LOOK_MASTER");
assert.equal(directRecipe.assemblySource.localLayerRecompositionPerformed, false);
assert.equal(directRecipe.assemblyComposite.sha256, approved.runtime.packageAssetKitPlans[0].selectedLookMasterBinding.artifactSha256);
assert.equal(directRecipe.deterministicParity.normalizedPixelDelta, 0);

const reconstructionWorkspace = structuredClone(testWorkspace);
reconstructionWorkspace.production.shotIntelligence = approved.runtime;
assert.throws(() => queuePackageLayerGenerationJobs(reconstructionWorkspace, testShotId, {now: "2026-08-04T00:00:10.000Z"}), /blocked-until-imagegen-master-assembly-approved/);
reconstructionWorkspace.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === testShotId).userAssemblyDecision = {decision: "approved", decidedAt: "2026-08-04T00:00:09.500Z"};
assert.throws(
  () => queuePackageLayerGenerationJobs(reconstructionWorkspace, testShotId, {now: "2026-08-04T00:00:10.000Z"}),
  /package-layer-imagegen-extraction-retired-use-deterministic-master-mask-partition/,
  "approved master must use deterministic mask partition; legacy ImageGen extraction stays retired",
);

console.log(JSON.stringify({
  status: "PASS",
  lookMasterPlanSha256: lookPlanA.planSha256,
  candidateBudget: lookPlanA.candidateBudget,
  queuedLookMasterJobs: queued.jobs.length,
  recommendedCandidateId: advancedLookPlan.recommendation.candidateId,
  approvedState: approved.runtime.status,
  reconstructionJobs: 0,
  deterministicMasterMaskPartitionRequired: true,
  editorOwnsBaseCut: lookPlanA.videoContext.editorOwnsBaseCut,
}, null, 2));
