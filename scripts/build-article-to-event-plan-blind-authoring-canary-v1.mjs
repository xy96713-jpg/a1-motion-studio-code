#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {buildDirectorFrameSamplingCandidatePlanV1} from "../apps/studio-next/src/lib/a1-director-frame-sampling-candidate-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskRoot = path.join(repoRoot, "work/article-to-event-plan-blind-authoring-canary-v1");
const resultPath = path.join(taskRoot, "result.json");
const boardPath = path.join(taskRoot, "director-window-candidate-map.png");
const directorPath = path.join(repoRoot, "apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts");
const policyPath = path.join(repoRoot, "apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs");
const candidateModulePath = path.join(repoRoot, "apps/studio-next/src/lib/a1-director-frame-sampling-candidate-v1.mjs");
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const stableValue = (value) => Array.isArray(value) ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stableValue(value));
const objectHash = (value) => sha256(Buffer.from(stableJson(value), "utf8"));

const fixtures = [
  {
    id: "director-candidate-evidence", genre: "evidence-explainer", title: "证据如何改变判断", fps: 25,
    cueTexts: ["先看原始证据", "证据改变之后再做结论"], durations: [4000, 5000], shotCueRanges: [[1, 2]],
  },
  {
    id: "director-candidate-tutorial", genre: "product-tutorial", title: "让一次修改完整落地", fps: 30,
    cueTexts: ["先打开目标页面", "检查结果", "再确认修改已经生效"], durations: [3000, 100, 3000], shotCueRanges: [[1, 1], [2, 2], [3, 3]],
  },
  {
    id: "director-candidate-opinion", genre: "personal-opinion", title: "把判断交还给作者", fps: 60,
    cueTexts: ["工具给出建议", "最后仍由作者决定"], durations: [180, 220], shotCueRanges: [[1, 2]],
  },
];

function buildCues(fixture) {
  let startMs = 0;
  return fixture.cueTexts.map((sourceText, index) => {
    const sourceStartMs = startMs;
    startMs += fixture.durations[index];
    return {cueId: index + 1, sourceStartMs, sourceEndMs: startMs, sourceText};
  });
}

function makeDirectorPlan(fixture, cues, articleText) {
  const shots = fixture.shotCueRanges.map(([firstCueId, lastCueId], index) => {
    const shotCues = cues.filter((cue) => cue.cueId >= firstCueId && cue.cueId <= lastCueId);
    const sourceText = shotCues.map((cue) => cue.sourceText).join(" ");
    return {
      shotId: `SHOT-${String(index + 1).padStart(2, "0")}`,
      order: index + 1,
      editMode: "type-only",
      cueIds: shotCues.map((cue) => cue.cueId),
      sourceText,
      sourceWindow: {startMs: shotCues[0].sourceStartMs, endMs: shotCues.at(-1).sourceEndMs},
      editWindow: {startMs: shotCues[0].sourceStartMs, endMs: shotCues.at(-1).sourceEndMs,
        durationMs: shotCues.at(-1).sourceEndMs - shotCues[0].sourceStartMs},
      semanticActor: {identity: sourceText, action: "the source sentence changes state",
        beforeState: "the cue begins", afterState: "the cue ends", target: "the viewer's stated takeaway"},
    };
  });
  const durationMs = cues.at(-1).sourceEndMs;
  const ids = cues.map((cue) => cue.cueId);
  const normalizedCues = cues.map((cue) => ({cueId: cue.cueId, sourceStartMs: cue.sourceStartMs,
    sourceEndMs: cue.sourceEndMs, sourceText: cue.sourceText.replace(/\s+/gu, " ").trim()}));
  const chapter = {chapterId: "C01", title: fixture.title, firstCueId: 1,
    lastCueId: cues.length, narrativeArc: "source window to evidence candidate"};
  const source = {title: fixture.title, articleSha256: sha256(Buffer.from(articleText, "utf8")),
    articleAnalysisPath: null, articleAnalysisSha256: sha256(Buffer.from(`analysis:${fixture.id}`, "utf8")),
    timelineSha256: objectHash(normalizedCues), timelineAuthority: "provided-time-cues",
    srtPath: null, srtSha256: null, cueCount: cues.length, durationMs,
    alignment: {contract: "A1ArticleCueAlignment/v1", status: "PASS", articleTokenCoverage: 1,
      cueTokenCoverage: 1, sharedTokenCount: cues.length, rule: "token-overlap-v1"}};
  return {
    contract: "A1WholeFilmAiDirectorPlan/v1",
    status: "READY_FOR_USER_EDITORIAL_REVIEW",
    reviewOnly: true,
    aiDirected: true,
    projectId: `blind-${fixture.genre}`,
    source,
    articleUnderstanding: {contract: "A1ArticleUnderstanding/v1", analyzerMode: "synthetic-plan-shape",
      thesis: "a source-bound thesis", sentenceCount: cues.length, sectionCount: cues.length, exactCoverage: true},
    strategy: {contract: "A1WholeFilmStrategyOutput/v1", visualThesis: "source-specific thesis",
      presenterRole: "not assigned", screenRole: "not assigned", packageRole: "explains the stated mechanism",
      typeOnlyRule: "none", rhythmArc: ["opening", "resolution"], chapters: [chapter], globalRules: []},
    chapters: [chapter],
    shots,
    coverage: {exact: true, acceptedCueIds: ids, assignedCueIds: ids, missingCueIds: [], duplicateCueIds: [], editTimelineContinuous: true},
    mediumSummary: {},
    mediaInventory: {presenterFootage: {status: "missing"}, screenRecording: {status: "missing"}, boundMaterialIds: []},
    authorship: {decisionSource: "ai-whole-film-director", aiGenerated: true,
      newArticleGeneralizationProven: false, traceCount: 0, truthNote: "synthetic plan-shape fixture; no model-generation claim"},
    traces: [],
    gates: {userEditorialPlanApproval: "PENDING", materialExecutionAllowed: false,
      layoutCandidateGenerationAllowed: false, acceptedShotIrCompilationAllowed: false,
      shotMotionAllowed: false, shotRenderAllowed: false, rendererAdoptionAllowed: false,
      h47ExpansionAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false},
    nextAction: "user-review-whole-film-edit-plan-before-material-or-layout-execution",
  };
}

const output = [];
const palette = ["#d84a32", "#3169b3", "#198d78"];
for (const [fixtureIndex, fixture] of fixtures.entries()) {
  const cues = buildCues(fixture);
  const articleText = cues.map((cue) => cue.sourceText).join("\n");
  const durationMs = cues.at(-1).sourceEndMs;
  const totalFrames = Math.ceil(durationMs * fixture.fps / 1000);
  const sourceVideoSha256 = sha256(Buffer.from(`metadata-only-source:${fixture.id}`, "utf8"));
  const directorPlan = makeDirectorPlan(fixture, cues, articleText);
  const directorPlanSha256 = objectHash(directorPlan);
  const normalizedCues = cues.map((cue) => ({...cue, sourceText: cue.sourceText.replace(/\s+/gu, " ").trim()}));
  const sourceManifest = {contract: "A1FrameReviewSourceManifest/v1", sourceVideoSha256,
    fps: fixture.fps, totalFrames};
  const candidate = buildDirectorFrameSamplingCandidatePlanV1({directorPlan, articleText, cues: normalizedCues, sourceManifest});
  const repeated = buildDirectorFrameSamplingCandidatePlanV1({directorPlan, articleText, cues: normalizedCues, sourceManifest});
  assert.deepEqual(candidate, repeated, `${fixture.id} candidate plan replay must be stable`);
  assert.equal(candidate.contract, "A1DirectorFrameSamplingCandidatePlan/v1");
  assert.equal(candidate.directorPlanSha256, directorPlanSha256);
  assert.equal(candidate.articleSha256, directorPlan.source.articleSha256);
  assert.equal(candidate.timelineSha256, directorPlan.source.timelineSha256);
  assert.equal(candidate.source.sourceVideoSha256, sourceVideoSha256);
  assert.equal(candidate.sourceCopyAlignmentStatus, "PASS");
  assert.equal(candidate.alignmentReviewRequired, false);
  assert.equal(candidate.proofBoundary.visualEventTimingObserved, false);
  assert.equal(candidate.proofBoundary.sourceVideoRead, false);
  assert.equal(candidate.proofBoundary.extractedImages, 0);
  assert.equal(candidate.policyPlan.summary.visualApproval, false);
  assert.equal(candidate.policyPlan.summary.productionAdmission, false);
  assert.equal(candidate.shotMappings.length, directorPlan.shots.length);

  for (const mapping of candidate.shotMappings) {
    const shot = directorPlan.shots.find((item) => item.shotId === mapping.shotId);
    assert.ok(shot);
    const shotCues = normalizedCues.filter((cue) => shot.cueIds.includes(cue.cueId));
    assert.equal(mapping.sourceText, shotCues.map((cue) => cue.sourceText).join(" "));
    assert.deepEqual(mapping.sourceWindowMs, shot.sourceWindow);
    assert.ok(mapping.frameWindow.startFrame >= 0);
    assert.ok(mapping.frameWindow.endFrameExclusive <= totalFrames);
    assert.ok(mapping.frameWindow.endFrameExclusive > mapping.frameWindow.startFrame);
    assert.equal(mapping.timingEvidence, "UNOBSERVED");
  }
  assert.equal(candidate.policyPlan.summary.referenceCount,
    candidate.policyPlan.references.length);
  assert.equal(candidate.policyPlan.summary.extractedImages, 0);
  const shotMappings = candidate.shotMappings.map((mapping) => ({
    shotId: mapping.shotId,
    order: mapping.order,
    cueIds: mapping.cueIds,
    sourceTextSha256: sha256(Buffer.from(mapping.sourceText, "utf8")),
    sourceWindowMs: mapping.sourceWindowMs,
    frameWindow: mapping.frameWindow,
    samplingMode: mapping.samplingMode,
    timingEvidence: mapping.timingEvidence,
    sampleFrames: candidate.policyPlan.references.filter((reference) => reference.sequenceId === mapping.shotId)
      .map((reference) => reference.sourceFrame),
  }));
  output.push({id: fixture.id, genre: fixture.genre, status: "PASS",
    directorPlanSha256, articleSha256: candidate.articleSha256, timelineSha256: candidate.timelineSha256,
    sourceVideoSha256, fps: fixture.fps, totalFrames, sourceWindowCount: candidate.shotMappings.length,
    sourceCopyAlignmentStatus: candidate.sourceCopyAlignmentStatus,
    alignmentReviewRequired: candidate.alignmentReviewRequired,
    candidateReferenceCount: candidate.policyPlan.summary.referenceCount,
    uniqueFrameCount: candidate.policyPlan.summary.uniqueSourceFrames,
    shotMappings,
    candidatePlanSha256: candidate.sha256, policyPlanSha256: candidate.policyPlan.sha256,
    visualEventTimingObserved: false, outputImages: 0, color: palette[fixtureIndex]});
}

const imageWidth = 1_520, imageHeight = 580;
const yStarts = [150, 295, 440];
const cells = [];
for (const [index, fixture] of output.entries()) {
  const top = yStarts[index], color = fixture.color;
  cells.push(`<rect x="24" y="${top - 34}" width="1472" height="110" rx="10" fill="#fffdf7" stroke="#d9d5ca"/>`);
  cells.push(`<rect x="24" y="${top - 34}" width="7" height="110" fill="${color}"/>`);
  cells.push(`<text x="48" y="${top - 10}" class="genre">${fixture.genre} · ${fixture.sourceWindowCount} director windows</text>`);
  cells.push(`<text x="48" y="${top + 14}" class="detail">${fixture.fps} fps · ${fixture.totalFrames} source frames · ${fixture.candidateReferenceCount} candidate probes</text>`);
  cells.push(`<text x="48" y="${top + 38}" class="detail">article ${fixture.articleSha256.slice(0, 14)}… · plan ${fixture.candidatePlanSha256.slice(0, 14)}…</text>`);
  const xStart = 830, cellWidth = 650 / Math.max(1, fixture.shotMappings.length);
  fixture.shotMappings.forEach((mapping, shotIndex) => {
    const x = xStart + shotIndex * cellWidth;
    const modeLabel = mapping.samplingMode === "UNMAPPED_MOTION_FIVE_POINT_PROBE" ? "5-POINT PROBE"
      : mapping.samplingMode === "SHORT_WINDOW_AMBIGUITY_PROBE" ? "SHORT-WINDOW PROBE" : "REVIEW CANDIDATE";
    cells.push(`<rect x="${x + 3}" y="${top - 22}" width="${cellWidth - 7}" height="80" rx="7" fill="#f5f3ed" stroke="#ddd8cd"/>`);
    cells.push(`<text x="${x + 14}" y="${top}" class="mode">shot ${String(shotIndex + 1).padStart(2, "0")} · ${mapping.sourceWindowMs.startMs}–${mapping.sourceWindowMs.endMs}ms</text>`);
    cells.push(`<text x="${x + 14}" y="${top + 17}" class="detail">${modeLabel} · unobserved</text>`);
    cells.push(`<text x="${x + 14}" y="${top + 34}" class="detail">n ${mapping.sampleFrames.join(",")}</text>`);
    cells.push(`<text x="${x + 14}" y="${top + 50}" class="detail">frames [${mapping.frameWindow.startFrame},${mapping.frameWindow.endFrameExclusive})</text>`);
  });
}
const boardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
<rect width="100%" height="100%" fill="#f8f6f0"/>
<style>.title{font:700 24px Arial,sans-serif;fill:#17202b}.sub{font:13px Arial,sans-serif;fill:#606975}.genre{font:700 14px Arial,sans-serif;fill:#202a34}.detail{font:11px Arial,sans-serif;fill:#56616c}.mode{font:700 12px Arial,sans-serif;fill:#303943}.foot{font:12px Arial,sans-serif;fill:#606975}</style>
<text x="24" y="31" class="title">DIRECTOR WINDOW → FRAME CANDIDATE PLAN</text>
<text x="625" y="30" class="sub">3 genres · exact copy/time bound · 0 motion events claimed observed</text>
${cells.join("\n")}
<text x="24" y="558" class="foot">Reuses the existing director's shot windows. Five-point samples are review candidates; short windows are ambiguity probes. No video bytes read or frames extracted.</text>
</svg>`;
const boardBytes = await sharp(Buffer.from(boardSvg, "utf8")).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(boardPath, boardBytes);

const result = {
  contract: "A1ArticleToEventPlanBlindAuthoringCanary/v1",
  status: "PASS",
  phaseId: "article-to-event-plan-blind-authoring-canary-v1",
  createdAt: "2026-09-28",
  upstreamDirectorContract: {contract: "A1WholeFilmAiDirectorPlan/v1", path: "apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts",
    contractShapedPlanFixtures: 3, liveStructuredPassCalls: 0, liveDirectorInvocation: false,
    newArticleGeneralizationProven: false},
  fixtures: output,
  summary: {genreCount: new Set(output.map((item) => item.genre)).size,
    directorWindows: output.reduce((sum, item) => sum + item.sourceWindowCount, 0),
    candidateReferences: output.reduce((sum, item) => sum + item.candidateReferenceCount, 0),
    outputImages: 0, sourceVideoBytesRead: 0, visualEventsObserved: 0,
    sourceCopyAndTimingBound: true, candidatePlanReplayStable: true},
  visibleArtifact: {path: path.relative(repoRoot, boardPath).split(path.sep).join("/"), sha256: sha256(boardBytes),
    bytes: boardBytes.length, width: imageWidth, height: imageHeight},
  proofBoundary: {directorPlanShapeReused: true, sourceWindowsVerifiedAgainstCues: true,
    sourceVideoRead: false, sourceVideoDecoded: false, visualEventsObserved: false, framesExtracted: 0,
    visualApproval: "NOT_GRANTED", productionAdmission: false, formalAuthorityModified: false},
  independentReview: {status: "PENDING", visualApproval: "NOT_GRANTED", productionAdmission: false},
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({...result, resultPath: path.relative(repoRoot, resultPath).split(path.sep).join("/")}, null, 2));
