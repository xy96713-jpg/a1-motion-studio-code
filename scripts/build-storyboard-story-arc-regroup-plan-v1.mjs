#!/usr/bin/env node
/**
 * Build a protected regroup plan from story-arc segmentation risks.
 *
 * This is review-only. It never mutates current storyboard props because split
 * and merge decisions change the authored storyboard structure.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-story-arc-regroup-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const segmentationPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-story-arc-segmentation-contract-v1/report.json");
const acceptancePath = path.join(root, "apps/studio-next/public/generated/storyboard/current/story-arc-regroup-acceptance.json");

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, value, "utf8");
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function sceneIndexByBeatId(scenes) {
  return new Map((scenes || []).map((scene, index) => [scene.beatId, index]));
}

function compact(value, max = 180) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
}

function operationIdFor(row) {
  const seed = [row.beatId, row.recommendedSegmentationAction, row.issue].filter(Boolean).join("-");
  return `regroup-${seed}`.replace(/[^A-Za-z0-9_.-]+/gu, "-").replace(/-+/gu, "-").slice(0, 120);
}

function operationFor(row, scenes, indexByBeatId) {
  const index = indexByBeatId.get(row.beatId);
  const previous = typeof index === "number" && index > 0 ? scenes[index - 1] : null;
  const current = typeof index === "number" ? scenes[index] : null;
  const next = typeof index === "number" && index < scenes.length - 1 ? scenes[index + 1] : null;
  const base = {
    operationId: operationIdFor(row),
    beatId: row.beatId,
    macroId: row.macroId,
    sourceText: row.sourceText,
    cognitiveRole: row.cognitiveRole,
    segmentationAction: row.recommendedSegmentationAction,
    issue: row.issue,
    reason: row.reason,
    timeRangeMs: row.timeRangeMs,
    neighbors: {
      previousBeatId: previous?.beatId || null,
      previousText: compact(previous?.screenText || "", 120),
      nextBeatId: next?.beatId || null,
      nextText: compact(next?.screenText || "", 120),
    },
    applyMode: "manual-review-required",
    applyAllowed: false,
    risk: "high",
  };

  if (row.recommendedSegmentationAction === "split-candidate") {
    return {
      ...base,
      operationType: "review-shot-split",
      proposedAuthoringChange: {
        kind: "split-current-shot",
        targetBeatId: row.beatId,
        splitBasis: "connector-words-and-story-arc",
        suggestedSplitPrompt: "Find the connector boundary in sourceText, then create two cognition units with separate visual focus phrases.",
      },
      acceptanceGate: [
        "new shots preserve full subtitle text without omission",
        "each new shot has one cognitiveRole and one visualFocusText",
        "new timing remains inside original source time range",
        "semanticFill and layout risk audits pass after regroup",
      ],
    };
  }

  if (row.recommendedSegmentationAction === "merge-candidate") {
    return {
      ...base,
      operationType: "review-shot-merge",
      proposedAuthoringChange: {
        kind: "merge-with-neighbor",
        targetBeatId: row.beatId,
        preferredNeighborBeatId: previous?.beatId || next?.beatId || null,
        mergeBasis: row.issue,
      },
      acceptanceGate: [
        "merged shot stays readable in duration and screen text",
        "merged visualFocusText is not generic",
        "sourceSubtitleIndexes are preserved",
        "semanticFill and layout risk audits pass after regroup",
      ],
    };
  }

  return {
    ...base,
    operationType: "review-support-run-softening",
    proposedAuthoringChange: {
      kind: "soften-or-differentiate-without-boundary-change",
      targetBeatId: row.beatId,
      preferredChange: "keep timing but vary motion/layout/text hierarchy to avoid mechanical support-run repetition",
      alternateChange: "merge with adjacent support row if readability improves",
    },
    acceptanceGate: [
      "support rows do not repeat the same motion signature three times",
      "visible text hierarchy differs from adjacent support rows",
      "no subtitle meaning is hidden or dropped",
      "motion repeat-window audit passes after update",
    ],
  };
}

const props = readJsonIfExists(storyboardPropsPath);
const segmentation = readJsonIfExists(segmentationPath);
const acceptance = readJsonIfExists(acceptancePath);
const blockers = [];

if (!props || !Array.isArray(props.scenes)) blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});
if (!segmentation || segmentation.contract !== "A1StoryboardStoryArcSegmentationContract/v1") blockers.push({id: "missing-story-arc-segmentation", detail: `Missing segmentation report: ${rel(segmentationPath)}`});

const scenes = props?.scenes || [];
const storyboardPropsSha256 = sha256File(storyboardPropsPath);
const indexByBeatId = sceneIndexByBeatId(scenes);
const issueRows = Array.isArray(segmentation?.issueRows) ? segmentation.issueRows : [];
const acceptedOperationIds = acceptance?.contract === "A1StoryboardStoryArcRegroupAcceptance/v1" && acceptance.storyboardPropsSha256 === storyboardPropsSha256 && Array.isArray(acceptance.acceptedOperationIds)
  ? new Set(acceptance.acceptedOperationIds)
  : new Set();
const rejectedOperationIds = acceptance?.contract === "A1StoryboardStoryArcRegroupAcceptance/v1" && acceptance.storyboardPropsSha256 === storyboardPropsSha256 && Array.isArray(acceptance.rejectedOperationIds)
  ? new Set(acceptance.rejectedOperationIds)
  : new Set();
function appliedOperation(operation) {
  const index = indexByBeatId.get(operation.beatId);
  const scene = typeof index === "number" ? scenes[index] : null;
  return scene?.storyboard?.storyArcRegroupResolution?.phaseId === "storyboard-story-arc-regroup-decisions-v1"
    || scene?.storyboard?.semanticFill?.storyArcRegroupResolution?.phaseId === "storyboard-story-arc-regroup-decisions-v1"
    || scene?.motionPlan?.storyArcRegroupResolution?.phaseId === "storyboard-story-arc-regroup-decisions-v1";
}
const operations = blockers.length ? [] : issueRows.map((row) => {
  const operation = operationFor(row, scenes, indexByBeatId);
  const applied = appliedOperation(operation);
  return {
    ...operation,
    applied,
    accepted: acceptedOperationIds.has(operation.operationId) && !applied,
    rejected: rejectedOperationIds.has(operation.operationId),
  };
});
const byOperationType = operations.reduce((acc, item) => {
  acc[item.operationType] = (acc[item.operationType] || 0) + 1;
  return acc;
}, {});
const acceptedCount = operations.filter((operation) => operation.accepted).length;
const appliedCount = operations.filter((operation) => operation.applied).length;
const rejectedCount = operations.filter((operation) => operation.rejected).length;
const pendingCount = operations.filter((operation) => !operation.accepted && !operation.rejected && !operation.applied).length;
const status = blockers.length
  ? "BLOCKED"
  : operations.length === 0
    ? "EMPTY"
    : appliedCount === operations.length
      ? "APPLIED"
    : pendingCount > 0
      ? "WAITING_FOR_ACCEPTANCE"
      : acceptedCount > 0
        ? "PLAN_READY"
        : "REVIEWED_NO_ACCEPTANCE";

const report = {
  contract: "A1StoryboardStoryArcRegroupPlan/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  safeMetadataApplyAllowed: acceptedCount > 0,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256,
    segmentationPath: rel(segmentationPath),
    segmentationSha256: sha256File(segmentationPath),
    acceptancePath: rel(acceptancePath),
    acceptanceSha256: sha256File(acceptancePath),
    acceptanceStatus: acceptance?.status || "empty",
  },
  summary: {
    sceneCount: scenes.length,
    issueRowCount: issueRows.length,
    operationCount: operations.length,
    acceptedCount,
    appliedCount,
    rejectedCount,
    pendingCount,
    blockerCount: blockers.length,
    byOperationType,
  },
  blockers,
  operations,
  nextAction: blockers.length
    ? "fix-regroup-plan-blockers"
    : pendingCount > 0
      ? "review-and-accept-or-reject-regroup-items-in-storyboard-ui"
      : acceptedCount > 0
        ? "build-dry-run-props-then-apply-accepted-regroup-items"
        : appliedCount > 0
          ? "story-arc-regroup-applied"
          : "story-arc-regroup-not-needed-or-reviewed",
};

const md = [
  "# Storyboard Story-Arc Regroup Plan v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- operations: ${report.summary.operationCount}`,
  `- accepted: ${report.summary.acceptedCount}`,
  `- applied: ${report.summary.appliedCount}`,
  `- rejected: ${report.summary.rejectedCount}`,
  `- pending: ${report.summary.pendingCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  `- boundary mutation allowed: ${report.applyAllowed}`,
  `- safe metadata apply allowed: ${report.safeMetadataApplyAllowed}`,
  "",
  "## Operations",
  "",
  ...(operations.length ? operations.map((item, index) => [
    `### ${index + 1}. ${item.beatId} - ${item.operationType}`,
    "",
    `- id: ${item.operationId}`,
    `- decision: ${item.applied ? "applied" : item.accepted ? "accepted" : item.rejected ? "rejected" : "pending"}`,
    `- action: ${item.segmentationAction}`,
    `- role: ${item.cognitiveRole}`,
    `- risk: ${item.risk}`,
    `- reason: ${item.reason}`,
    `- source: ${item.sourceText}`,
    "",
  ].join("\n")) : ["- no regroup operations"]),
  "## Blockers",
  "",
  ...(blockers.length ? blockers.map((item) => `- ${item.id}: ${item.detail}`) : ["- none"]),
  "",
].join("\n");

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
writeText(path.join(artifactRoot, "report.md"), md);
writeText(path.join(publicRoot, "report.md"), md);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
