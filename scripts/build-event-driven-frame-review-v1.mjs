#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {compileReferenceFrameReviewPlanV1, resolveSamplingQuestionV1, assessMotionSufficiencyV1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const outputRoot = path.join(repoRoot, "work/event-driven-frame-review-v1");
const planRoot = path.join(outputRoot, "source-plans");
const resultPath = path.join(outputRoot, "result.json");
const visiblePath = path.join(outputRoot, "event-anchor-timeline.png");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
fs.mkdirSync(planRoot, {recursive: true});

const baselinePath = path.join(repoRoot, "work/hupo-69-shot-reconstruction-v1/reference-frame-review-policy-candidate-v1-result.json");
const baselineBytes = fs.readFileSync(baselinePath);
const baseline = JSON.parse(baselineBytes.toString("utf8"));
assert.equal(baseline.status, "PASS");
assert.equal(baseline.integrationStatus, "NOT_INTEGRATED_WITH_LEGACY_FIXED_5FPS_EXTRACTOR");
assert.equal(baseline.claimedReductionPercent, null);
const planInputsPath = path.join(outputRoot, "plan-inputs.json");
const planInputsBytes = fs.readFileSync(planInputsPath);
const planInputs = JSON.parse(planInputsBytes.toString("utf8"));
assert.equal(planInputs.contract, "A1EventDrivenFrameReviewInputs/v1");
const planGroups = planInputs.groups;

const sequencesById = new Map();
const plans = [];
for (const group of planGroups) {
  for (const sequence of group.sequences) {
    assert.equal(sequencesById.has(sequence.sequenceId), false);
    sequencesById.set(sequence.sequenceId, {...sequence, genre: group.genre, sourceVideoSha256: group.sourceVideoSha256, fps: group.fps});
  }
  const plan = compileReferenceFrameReviewPlanV1({sourceVideoSha256: group.sourceVideoSha256, fps: group.fps,
    totalFrames: group.totalFrames, sequences: group.sequences, hardCuts: group.hardCuts});
  const body = {...plan};
  const planSha256 = body.sha256;
  assert.match(planSha256, /^[a-f0-9]{64}$/u);
  const planPath = path.join(planRoot, `${group.id}-plan.json`);
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  plans.push({group, plan, planPath, planFileSha256: sha256(fs.readFileSync(planPath))});
}

const fixed5fpsCount = (sequence) => Math.ceil(((sequence.endFrameExclusive - sequence.startFrame) / sequence.fps) * 5);
const fixtures = [...sequencesById.entries()].map(([id, sequence]) => {
  const owningPlan = plans.find(({group}) => group.sequences.some((item) => item.sequenceId === id));
  const references = owningPlan.plan.references.filter((reference) => reference.sequenceId === id);
  const frames = [...new Set(references.map((reference) => reference.sourceFrame))].sort((a, b) => a - b);
  const seconds = (frame) => Number(((frame - sequence.startFrame) / sequence.fps).toFixed(3));
  return {
    id,
    genre: sequence.genre,
    sourceVideoSha256: sequence.sourceVideoSha256,
    sequenceBounds: {startFrame: sequence.startFrame, endFrameExclusive: sequence.endFrameExclusive, fps: sequence.fps},
    baselineFixed5fpsCount: fixed5fpsCount(sequence),
    selectedReferenceCount: references.length,
    uniqueSelectedFrames: frames.length,
    selectedFrames: frames.map((frame) => ({sourceFrame: frame, seconds: seconds(frame), roles: references.filter((reference) => reference.sourceFrame === frame).map((reference) => reference.role)})),
    planContract: owningPlan.plan.contract,
    planSha256: owningPlan.plan.sha256,
    planFile: path.relative(repoRoot, owningPlan.planPath).split(path.sep).join("/"),
    planFileSha256: owningPlan.planFileSha256,
  };
});

const referenceCount = plans.reduce((sum, {plan}) => sum + plan.summary.referenceCount, 0);
const uniqueSourceFrames = plans.reduce((sum, {plan}) => sum + plan.summary.uniqueSourceFrames, 0);
const reusedReferences = referenceCount - uniqueSourceFrames;
const fixed5fpsBaselineCount = fixtures.reduce((sum, fixture) => sum + fixture.baselineFixed5fpsCount, 0);
const planOnlyReductionPercent = Number(((1 - uniqueSourceFrames / fixed5fpsBaselineCount) * 100).toFixed(1));
assert.equal(fixtures.length, 6);
assert.equal(new Set(fixtures.map((fixture) => fixture.genre)).size, 3);
assert.ok(uniqueSourceFrames < fixed5fpsBaselineCount);
assert.ok(reusedReferences > 0, "shared source-frame identities must de-duplicate across sequence roles");
assert.equal(plans.reduce((sum, {plan}) => sum + plan.summary.extractedImages, 0), 0);

const expansionPath = {
  firstUnresolvedCheck: resolveSamplingQuestionV1({status: "UNRESOLVED", expansionCount: 0, decisionImpact: true}),
  afterOneNarrowExpansion: resolveSamplingQuestionV1({status: "UNRESOLVED", expansionCount: 1, decisionImpact: true}),
  resolvedQuestion: resolveSamplingQuestionV1({status: "RESOLVED", expansionCount: 0, decisionImpact: true}),
};
assert.equal(expansionPath.firstUnresolvedCheck.expansionAllowed, true);
assert.equal(expansionPath.afterOneNarrowExpansion.expansionAllowed, false);
assert.equal(expansionPath.afterOneNarrowExpansion.next, "STOP_AND_KEEP_BLOCKER");

const motionSufficiency = [
  {id: "required-roles-focus-handoff-readable", result: assessMotionSufficiencyV1({
    requiredRoles: ["CLICK", "RESULT_HOLD"], observations: [{role: "CLICK", status: "VISIBLE"}, {role: "RESULT_HOLD", status: "VISIBLE"}],
    focusPath: "CLEAR", handoff: "CLEAR", readability: "PASS", motionAfterLastUsefulInformation: "NONE"})},
  {id: "redundant-motion-after-result", result: assessMotionSufficiencyV1({
    requiredRoles: ["GESTURE_ENTER", "GESTURE_HOLD"], observations: [{role: "GESTURE_ENTER", status: "VISIBLE"}, {role: "GESTURE_HOLD", status: "VISIBLE"}],
    focusPath: "CLEAR", handoff: "CLEAR", readability: "PASS", motionAfterLastUsefulInformation: "REDUNDANT"})},
  {id: "new-information-after-result", result: assessMotionSufficiencyV1({
    requiredRoles: ["PRE", "RESULT"], observations: [{role: "PRE", status: "VISIBLE"}, {role: "RESULT", status: "VISIBLE"}],
    focusPath: "CLEAR", handoff: "CLEAR", readability: "PASS", motionAfterLastUsefulInformation: "NEW_INFORMATION"})},
];
assert.equal(motionSufficiency[0].result.status, "SUFFICIENT");
assert.equal(motionSufficiency[1].result.status, "SIMPLIFY_MOTION");
assert.equal(motionSufficiency[2].result.status, "ADD_SEMANTIC_STATE_AND_REVIEW");

const baselineHash = sha256(baselineBytes);
const chartWidth = 1800, chartHeight = 960;
const x0 = 430, plotWidth = 1080, rowTop = 195, rowHeight = 112, displaySeconds = 10;
const colors = {stable: "#55c2a4", semantic: "#66aaff", cut: "#efd166", fallback: "#f3a25f", question: "#ff77b7"};
const roleColor = (roles) => roles.some((role) => role.startsWith("CUT_")) ? colors.cut
  : (roles[0] || "").startsWith("QUESTION_") ? colors.question
    : roles.some((role) => ["START", "QUARTER", "MIDPOINT", "THREE_QUARTER", "END"].includes(role)) ? colors.fallback
      : roles.includes("REPRESENTATIVE_HOLD") ? colors.stable : colors.semantic;
const shortRole = (role) => role === "REPRESENTATIVE_HOLD" ? "HOLD"
  : role === "AFTER_CUT_HOLD" ? "POST_CUT"
    : role.startsWith("CUT_BEFORE") ? "CUT_PRE"
      : role.startsWith("CUT_AFTER") ? "CUT_POST" : role;
const esc = (value) => String(value).replace(/[&<>"']/gu, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"}[char]));
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">`,
  `<rect width="100%" height="100%" fill="#0b1421"/>`,
  `<text x="44" y="54" fill="#f3f0e7" font-family="Arial,sans-serif" font-size="30" font-weight="700">Event anchors vs fixed 5fps plan</text>`,
  `<text x="44" y="86" fill="#aebacc" font-family="Arial,sans-serif" font-size="16">Synthetic planning fixtures only · no video frames extracted or human image reviews counted</text>`,
  `<text x="44" y="121" fill="#f3f0e7" font-family="Arial,sans-serif" font-size="17">Fixed 5fps: ${fixed5fpsBaselineCount} planned · Event plan: ${uniqueSourceFrames} unique · Plan-only difference: ${planOnlyReductionPercent}%</text>`,
  `<text x="44" y="149" fill="#8d9bae" font-family="Arial,sans-serif" font-size="14">gray ticks = baseline samples   colored circles = kept semantic/state anchors</text>`,
  `<text x="${x0}" y="174" fill="#9aabc0" font-family="Arial,sans-serif" font-size="12">0s</text>`,
  `<text x="${x0 + plotWidth / 2}" y="174" text-anchor="middle" fill="#9aabc0" font-family="Arial,sans-serif" font-size="12">5s</text>`,
  `<text x="${x0 + plotWidth}" y="174" text-anchor="end" fill="#9aabc0" font-family="Arial,sans-serif" font-size="12">10s</text>`];

fixtures.forEach((fixture, index) => {
  const y = rowTop + index * rowHeight;
  const centerY = y + 57;
  svg.push(`<rect x="24" y="${y}" width="1752" height="96" rx="9" fill="${index % 2 ? "#111d2d" : "#0e1928"}"/>`);
  svg.push(`<text x="44" y="${y + 27}" fill="#e4e8ef" font-family="Arial,sans-serif" font-size="15" font-weight="600">${esc(fixture.id)}</text>`);
  svg.push(`<text x="44" y="${y + 51}" fill="#91a2b8" font-family="Arial,sans-serif" font-size="13">${esc(fixture.genre)}</text>`);
  svg.push(`<text x="44" y="${y + 75}" fill="#8796a8" font-family="Arial,sans-serif" font-size="12">5fps ${fixture.baselineFixed5fpsCount}  ·  plan ${fixture.uniqueSelectedFrames}</text>`);
  svg.push(`<line x1="${x0}" y1="${centerY}" x2="${x0 + plotWidth}" y2="${centerY}" stroke="#314154" stroke-width="1"/>`);
  const duration = (fixture.sequenceBounds.endFrameExclusive - fixture.sequenceBounds.startFrame) / fixture.sequenceBounds.fps;
  const baselinePoints = fixed5fpsCount(sequencesById.get(fixture.id));
  for (let point = 0; point < baselinePoints; point += 1) {
    const t = point / 5;
    const x = x0 + (t / displaySeconds) * plotWidth;
    svg.push(`<line x1="${x.toFixed(1)}" y1="${centerY - 5}" x2="${x.toFixed(1)}" y2="${centerY + 5}" stroke="#526175" stroke-width="2" opacity="0.72"/>`);
  }
  const placedMarkers = [];
  fixture.selectedFrames.forEach((frame, markerIndex) => {
    const t = frame.seconds;
    const x = x0 + (t / displaySeconds) * plotWidth;
    const color = roleColor(frame.roles);
    const nearby = placedMarkers.filter((marker) => Math.abs(marker.x - x) < 22);
    const offsets = [0, -24, 24, -48, 48, -72, 72, -84, 84];
    const offset = offsets.find((candidate) => nearby.every((marker) => Math.abs(marker.y - (centerY + candidate)) >= 19)) ?? 80;
    const markerY = centerY + offset;
    placedMarkers.push({x, y: markerY});
    if (offset !== 0) svg.push(`<line x1="${x.toFixed(1)}" y1="${centerY}" x2="${x.toFixed(1)}" y2="${markerY}" stroke="${color}" stroke-width="1.5" opacity="0.8"/>`);
    svg.push(`<circle cx="${x.toFixed(1)}" cy="${markerY}" r="8" fill="${color}" stroke="#09111b" stroke-width="2"/>`);
    const roleLabel = frame.roles.map(shortRole).join("+").slice(0, 24);
    const labelY = offset < 0 ? markerY - 12 : offset > 0 ? markerY + 14 : centerY + (markerIndex % 2 ? 24 : -15);
    svg.push(`<text x="${x.toFixed(1)}" y="${labelY}" text-anchor="middle" fill="${color}" font-family="Arial,sans-serif" font-size="10">${esc(roleLabel)}</text>`);
  });
  svg.push(`<text x="${x0 + plotWidth + 22}" y="${centerY + 5}" fill="#b3c0cf" font-family="Arial,sans-serif" font-size="12">${duration.toFixed(1)}s</text>`);
});

const legendY = rowTop + fixtures.length * rowHeight + 12;
[["stable hold", colors.stable], ["semantic event", colors.semantic], ["hard cut", colors.cut], ["fallback", colors.fallback], ["question probe", colors.question]].forEach(([label, color], index) => {
  const x = 44 + index * 230;
  svg.push(`<circle cx="${x}" cy="${legendY}" r="6" fill="${color}"/><text x="${x + 13}" y="${legendY + 5}" fill="#aebacc" font-family="Arial,sans-serif" font-size="13">${label}</text>`);
});
svg.push(`<text x="44" y="${chartHeight - 24}" fill="#8190a3" font-family="Arial,sans-serif" font-size="12">A frame plan is evidence selection, not proof of extraction savings. Apply to real video only after a bounded playback audit.</text></svg>`);
const chartBytes = await sharp(Buffer.from(svg.join("\n"), "utf8")).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(visiblePath, chartBytes);

const result = {
  contract: "A1EventDrivenFrameReviewSystemTest/v1",
  status: "PASS",
  phaseId: "event-driven-frame-review-v1",
  createdAt: "2026-09-28",
  baselinePolicyCandidate: {path: path.relative(repoRoot, baselinePath).split(path.sep).join("/"), sha256: baselineHash,
    priorPolicySha256: baseline.policySha256, priorIntegrationStatus: baseline.integrationStatus, priorClaimedReductionPercent: baseline.claimedReductionPercent},
  fixtureInput: {path: path.relative(repoRoot, planInputsPath).split(path.sep).join("/"), sha256: sha256(planInputsBytes)},
  policy: {contract: plans[0].plan.contract, modulePath: "apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs",
    moduleSha256: sha256(fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs")))} ,
  fixtures,
  summary: {genreCount: new Set(fixtures.map((fixture) => fixture.genre)).size, sequenceCount: fixtures.length,
    fixed5fpsBaselineCount, plannedReferenceCount: referenceCount, plannedUniqueSourceFrames: uniqueSourceFrames,
    reusedReferences: reusedReferences, planOnlyReductionPercent, extractedImages: 0, humanImageReviews: 0},
  questionExpansion: expansionPath,
  motionSufficiency,
  visibleArtifact: {path: path.relative(repoRoot, visiblePath).split(path.sep).join("/"), sha256: sha256(chartBytes), width: chartWidth, height: chartHeight},
  measurementBoundary: "PLAN_ONLY_SYNTHETIC_FIXTURES. The percentage compares selected unique frame indices with a hypothetical fixed-5fps plan for these same six synthetic 5-to-10-second sequences. No source video was extracted, decoded, or viewed; no real extraction or human-review savings are claimed.",
  proofBoundary: {visualApproval: "NOT_GRANTED", productionAdmission: false, formalAuthorityModified: false, legacyExtractorChanged: false},
};
const visualReviewPath = path.join(outputRoot, "visual-review-v1.json");
try {
  const review = JSON.parse(fs.readFileSync(visualReviewPath, "utf8"));
  const matchesCurrentFrames = Array.isArray(review.fixtures) && review.fixtures.length === fixtures.length
    && fixtures.every((fixture) => review.fixtures.some((row) => row.id === fixture.id && row.planSha256 === fixture.planSha256
      && row.planFileSha256 === fixture.planFileSha256));
  if (review.status === "PASS_TIMELINE_AND_PLAN_MAPPING_ONLY"
    && review.visibleArtifact?.sha256 === result.visibleArtifact.sha256 && matchesCurrentFrames) {
    result.visualReview = {status: review.status,
      evidencePath: path.relative(repoRoot, visualReviewPath).split(path.sep).join("/"),
      evidenceSha256: sha256(fs.readFileSync(visualReviewPath)),
      reviewedArtifactSha256: result.visibleArtifact.sha256,
      reviewedFixtureCount: fixtures.length,
      visualApproval: "NOT_GRANTED",
      productionAdmission: false};
  }
} catch {
  // No valid current review receipt: the chart remains a candidate awaiting review.
}
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({...result, resultPath: path.relative(repoRoot, resultPath).split(path.sep).join("/")}, null, 2));
