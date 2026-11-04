#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  A1_DIRECTOR_FRAME_SAMPLING_CANDIDATE_V1,
  A1_DIRECTOR_FRAME_SAMPLING_SOURCE_MANIFEST_V1,
  buildDirectorFrameSamplingCandidatePlanV1,
} from "../apps/studio-next/src/lib/a1-director-frame-sampling-candidate-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

const stableJson = (value) => JSON.stringify(stableValue(value));
const hashStableJson = (value) => sha256(Buffer.from(stableJson(value), "utf8"));

function makeFixture({genre, fps = 30, totalFrames = fps, cues, articleText, windows} = {}) {
  const normalizedCues = cues.map((cue) => ({
    cueId: cue.cueId,
    sourceStartMs: cue.sourceStartMs,
    sourceEndMs: cue.sourceEndMs,
    sourceText: cue.sourceText.replace(/\s+/gu, " ").trim(),
  }));
  const timelineSha256 = hashStableJson(normalizedCues);
  const cueIds = normalizedCues.map((cue) => cue.cueId);
  const directorPlan = {
    contract: "A1WholeFilmAiDirectorPlan/v1",
    status: "READY_FOR_USER_EDITORIAL_REVIEW",
    reviewOnly: true,
    aiDirected: true,
    projectId: `synthetic-${genre}`,
    source: {
      title: `Synthetic ${genre}`,
      articleSha256: sha256(Buffer.from(articleText, "utf8")),
      articleAnalysisPath: null,
      articleAnalysisSha256: "a".repeat(64),
      timelineSha256,
      timelineAuthority: "provided-time-cues",
      srtPath: null,
      srtSha256: null,
      cueCount: normalizedCues.length,
      durationMs: normalizedCues.at(-1).sourceEndMs,
      alignment: {
        contract: "A1ArticleCueAlignment/v1",
        status: "PASS",
        articleTokenCoverage: 0.9,
        cueTokenCoverage: 0.9,
        sharedTokenCount: 10,
        rule: "token-overlap-v1",
      },
    },
    coverage: {
      exact: true,
      acceptedCueIds: cueIds,
      assignedCueIds: cueIds,
      missingCueIds: [],
      duplicateCueIds: [],
      editTimelineContinuous: true,
    },
    gates: {
      userEditorialPlanApproval: "PENDING",
      materialExecutionAllowed: false,
      layoutCandidateGenerationAllowed: false,
      acceptedShotIrCompilationAllowed: false,
      shotMotionAllowed: false,
      shotRenderAllowed: false,
      rendererAdoptionAllowed: false,
      h47ExpansionAllowed: false,
      fullMp4RenderAllowed: false,
      finalRenderAllowed: false,
    },
    shots: normalizedCues.map((cue, index) => {
      const cueIdsForShot = [cue.cueId];
      return {
        shotId: `ED-${String(index + 1).padStart(2, "0")}`,
        order: index + 1,
        chapterId: "C01",
        cueIds: cueIdsForShot,
        editMode: "full-package",
        editWindow: {startMs: cue.sourceStartMs, endMs: cue.sourceEndMs, durationMs: cue.sourceEndMs - cue.sourceStartMs},
        sourceWindow: windows?.[index] || {startMs: cue.sourceStartMs, endMs: cue.sourceEndMs},
        sourceText: cue.sourceText,
        narrativeJob: `Synthetic ${genre} shot ${index + 1}`,
        viewerTakeaway: "The sequence has a clear visual role.",
        mediumDecisionReason: "The source window sets a bounded review range.",
      };
    }),
  };
  const sourceManifest = {
    contract: A1_DIRECTOR_FRAME_SAMPLING_SOURCE_MANIFEST_V1,
    sourceVideoSha256: sha256(Buffer.from(`synthetic-video-${genre}`)),
    fps,
    totalFrames,
  };
  return {directorPlan, articleText, cues, sourceManifest};
}

function testThreeGenresAndFpsConversion() {
  const fixtures = [
    {genre: "evidence-explainer", fps: 25, totalFrames: 25},
    {genre: "product-tutorial", fps: 30, totalFrames: 30},
    {genre: "personal-opinion", fps: 60, totalFrames: 60},
  ];
  const expected = [
    [{startFrame: 0, endFrameExclusive: 5}, {startFrame: 5, endFrameExclusive: 25}],
    [{startFrame: 0, endFrameExclusive: 6}, {startFrame: 6, endFrameExclusive: 30}],
    [{startFrame: 0, endFrameExclusive: 12}, {startFrame: 12, endFrameExclusive: 60}],
  ];
  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = makeFixture({
      ...fixtures[index],
      cues: [
        {cueId: 1, sourceStartMs: 0, sourceEndMs: 200, sourceText: `Synthetic ${fixtures[index].genre} opening.`},
        {cueId: 2, sourceStartMs: 200, sourceEndMs: 1000, sourceText: `Synthetic ${fixtures[index].genre} conclusion.`},
      ],
      articleText: `Synthetic ${fixtures[index].genre} article.`,
    });
    const candidate = buildDirectorFrameSamplingCandidatePlanV1(fixture);
    assert.equal(Object.hasOwn(fixture.directorPlan.gates, "resolveExportAllowed"), false,
      "the validated director contract does not define resolveExportAllowed");
    assert.equal(candidate.contract, A1_DIRECTOR_FRAME_SAMPLING_CANDIDATE_V1);
    assert.equal(candidate.policyPlan.contract, "A1ReferenceFrameReviewPolicy/v1");
    assert.equal(candidate.sourceCopyAlignmentStatus, "PASS");
    assert.equal(candidate.alignmentReviewRequired, false);
    assert.equal(candidate.sourceCopyDirectReuseAllowed, true);
    assert.deepEqual(candidate.shotMappings.map((shot) => shot.frameWindow), expected[index]);
    assert.ok(candidate.shotMappings.every((shot) => shot.samplingMode === "UNMAPPED_MOTION_FIVE_POINT_PROBE"));
    assert.ok(candidate.shotMappings.every((shot) => shot.timingEvidence === "UNOBSERVED"));
    assert.ok(candidate.policyPlan.references.every((reference) => ["START", "QUARTER", "MIDPOINT", "THREE_QUARTER", "END"].includes(reference.role)));
    assert.equal(candidate.policyPlan.summary.visualApproval, false);
    assert.equal(candidate.policyPlan.summary.productionAdmission, false);
    assert.equal(candidate.policyPlan.summary.extractedImages, 0);
  }
}

function testShortWindowsUseOnlyAmbiguityProbes() {
  const fixture = makeFixture({
    genre: "short-window",
    fps: 25,
    totalFrames: 25,
    cues: [
      {cueId: 1, sourceStartMs: 0, sourceEndMs: 160, sourceText: "Short sequence."},
      {cueId: 2, sourceStartMs: 160, sourceEndMs: 1000, sourceText: "Longer sequence."},
    ],
    articleText: "A short-window synthetic article.",
  });
  const candidate = buildDirectorFrameSamplingCandidatePlanV1(fixture);
  const [shortShot, longShot] = candidate.shotMappings;
  assert.deepEqual(shortShot.frameWindow, {startFrame: 0, endFrameExclusive: 4});
  assert.equal(shortShot.samplingMode, "SHORT_WINDOW_AMBIGUITY_PROBE");
  assert.deepEqual(shortShot.probeFrames, [0, 2, 3]);
  assert.ok(shortShot.question.includes("Visual event timing is unobserved"));
  assert.equal(longShot.samplingMode, "UNMAPPED_MOTION_FIVE_POINT_PROBE");
  assert.ok(longShot.reason.includes("Visual event timing unobserved"));
  assert.equal(candidate.policyPlan.references.some((reference) => reference.role === "REPRESENTATIVE_HOLD"), false,
    "an unobserved source window must never be promoted to a stable hold");

  const lowFpsFixture = makeFixture({
    genre: "low-fps-short-window",
    fps: 0.1,
    totalFrames: 4,
    cues: [{cueId: 1, sourceStartMs: 0, sourceEndMs: 40_000, sourceText: "Sparse synthetic source."}],
    articleText: "A sparse short-window synthetic article.",
  });
  const lowFpsCandidate = buildDirectorFrameSamplingCandidatePlanV1(lowFpsFixture);
  assert.deepEqual(lowFpsCandidate.shotMappings[0].probeFrames, [0],
    "ambiguity probes stay inside the shared two-second narrow-window bound even at very low frame rates");
}

function testSourceWindowEndClampsAtAvailableFrameCount() {
  const fixture = makeFixture({
    genre: "frame-end-clamp",
    fps: 25,
    totalFrames: 24,
    cues: [{cueId: 1, sourceStartMs: 0, sourceEndMs: 1000, sourceText: "The declared timeline ends after the available source frames."}],
    articleText: "A source-window boundary test.",
  });
  const candidate = buildDirectorFrameSamplingCandidatePlanV1(fixture);
  assert.deepEqual(candidate.shotMappings[0].frameWindow, {startFrame: 0, endFrameExclusive: 24});
  assert.equal(candidate.policyPlan.assets.at(-1).sourceFrame, 23);
  assert.ok(candidate.policyPlan.assets.every((asset) => asset.sourceFrame < fixture.sourceManifest.totalFrames));
}

function testCopyTimelineAndInputHashesFailClosed() {
  const fixture = makeFixture({
    genre: "mismatch",
    fps: 30,
    totalFrames: 30,
    cues: [
      {cueId: 1, sourceStartMs: 0, sourceEndMs: 400, sourceText: "Original line one."},
      {cueId: 2, sourceStartMs: 400, sourceEndMs: 1000, sourceText: "Original line two."},
    ],
    articleText: "Original article text.",
  });
  const articleMismatch = {...fixture, articleText: "Changed article text."};
  assert.throws(() => buildDirectorFrameSamplingCandidatePlanV1(articleMismatch), /article-sha-mismatch/u);

  const sourceTextMismatch = structuredClone(fixture);
  sourceTextMismatch.directorPlan.shots[0].sourceText = "Invented copy.";
  assert.throws(() => buildDirectorFrameSamplingCandidatePlanV1(sourceTextMismatch), /source-text-mismatch/u);

  const windowMismatch = structuredClone(fixture);
  windowMismatch.directorPlan.shots[0].sourceWindow.endMs += 1;
  assert.throws(() => buildDirectorFrameSamplingCandidatePlanV1(windowMismatch), /source-window-mismatch/u);

  const cueMismatch = structuredClone(fixture);
  cueMismatch.cues[0].sourceText += " changed";
  assert.throws(() => buildDirectorFrameSamplingCandidatePlanV1(cueMismatch), /timeline-sha-mismatch/u);

  const wrongTimeline = structuredClone(fixture);
  wrongTimeline.directorPlan.source.timelineSha256 = "0".repeat(64);
  assert.throws(() => buildDirectorFrameSamplingCandidatePlanV1(wrongTimeline), /timeline-sha-mismatch/u);

  const blockedAlignment = structuredClone(fixture);
  blockedAlignment.directorPlan.source.alignment.status = "BLOCK";
  assert.throws(() => buildDirectorFrameSamplingCandidatePlanV1(blockedAlignment), /source-copy-alignment-blocked/u);
  const missingAlignment = structuredClone(fixture);
  delete missingAlignment.directorPlan.source.alignment;
  assert.throws(() => buildDirectorFrameSamplingCandidatePlanV1(missingAlignment), /source-copy-alignment-required/u);
}

function testReviewAlignmentRemainsCandidateButNotReusable() {
  const fixture = makeFixture({
    genre: "alignment-review",
    fps: 30,
    totalFrames: 30,
    cues: [{cueId: 1, sourceStartMs: 0, sourceEndMs: 1000, sourceText: "Alignment review remains pending."}],
    articleText: "A source-copy alignment review fixture.",
  });
  fixture.directorPlan.source.alignment.status = "REVIEW";
  const candidate = buildDirectorFrameSamplingCandidatePlanV1(fixture);
  assert.equal(candidate.sourceCopyAlignmentStatus, "REVIEW");
  assert.equal(candidate.alignmentReviewRequired, true);
  assert.equal(candidate.sourceCopyDirectReuseAllowed, false);
  assert.equal(candidate.policyPlan.contract, "A1ReferenceFrameReviewPolicy/v1",
    "a REVIEW alignment still yields a candidate for follow-up review");
  assert.equal(candidate.proofBoundary.visualApproval, false);
  assert.equal(candidate.proofBoundary.productionAdmission, false);
}

function testStableShaAndBoundaryProof() {
  const fixture = makeFixture({
    genre: "determinism",
    fps: 30,
    totalFrames: 30,
    cues: [
      {cueId: 1, sourceStartMs: 0, sourceEndMs: 1000, sourceText: "One stable synthetic shot."},
    ],
    articleText: "A deterministic candidate.",
  });
  const first = buildDirectorFrameSamplingCandidatePlanV1(fixture);
  const repeated = buildDirectorFrameSamplingCandidatePlanV1(fixture);
  assert.deepEqual(repeated, first);
  assert.equal(first.directorPlanSha256, hashStableJson(fixture.directorPlan));
  assert.equal(first.articleSha256, sha256(Buffer.from(fixture.articleText, "utf8")));
  assert.equal(first.timelineSha256, fixture.directorPlan.source.timelineSha256);
  assert.equal(first.sourceManifestSha256, hashStableJson(fixture.sourceManifest));
  const {sha256: candidateSha256, ...candidateBody} = first;
  assert.equal(candidateSha256, hashStableJson(candidateBody));
  assert.equal(first.proofBoundary.sourceVideoRead, false);
  assert.equal(first.proofBoundary.frameExtractionPerformed, false);
  assert.equal(first.proofBoundary.extractedImages, 0);
  assert.equal(first.proofBoundary.visualApproval, false);
  assert.equal(first.proofBoundary.productionAdmission, false);
}

testThreeGenresAndFpsConversion();
testShortWindowsUseOnlyAmbiguityProbes();
testSourceWindowEndClampsAtAvailableFrameCount();
testCopyTimelineAndInputHashesFailClosed();
testReviewAlignmentRemainsCandidateButNotReusable();
testStableShaAndBoundaryProof();
console.log("PASS a1-director-frame-sampling-candidate-v1: three synthetic genres, fps mapping, short-window probes, end clamp, copy/timeline/source binding, PASS/REVIEW alignment policy, deterministic SHA, and unobserved-review boundary");
