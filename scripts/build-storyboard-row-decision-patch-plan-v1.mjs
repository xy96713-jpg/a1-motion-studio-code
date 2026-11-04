#!/usr/bin/env node
/**
 * Build a reviewable patch plan from storyboard row decisions.
 *
 * This is intentionally plan-only. Row decisions are user-facing production
 * notes; they must not mutate storyboard props until a later apply step reviews
 * the proposed operations and SHA guards.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-row-decision-patch-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const rowDecisionsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/row-decisions.json");

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

function operationForDecision(decision, scene, index) {
  const basePointer = `/scenes/${index}/storyboard`;
  const fillPointer = `${basePointer}/semanticFill`;
  const title = scene.storyboard?.visualFocusText || (Array.isArray(scene.titleLines) ? scene.titleLines.join(" · ") : scene.screenText || scene.beatId);
  const fill = scene.storyboard?.semanticFill || {};
  const pipeline = scene.storyboard?.artworkPipeline || {};
  const common = {
    beatId: scene.beatId,
    macroId: scene.macroId,
    title,
    sourceText: scene.screenText || "",
    action: decision.action,
    userNote: decision.note || "",
    current: {
      assetRoute: fill.assetRoute || null,
      artworkStatus: scene.storyboard?.artworkStatus || null,
      artworkPipelineStatus: pipeline.status || null,
      motionJob: fill.motionJob || scene.motionPlan?.motionStyle || null,
      fillWhat: fill.fillWhat || null,
      fillHow: fill.fillHow || null,
    },
  };

  if (decision.action === "confirm") {
    return {
      ...common,
      operationType: "lock-row-review-state",
      applyMode: "metadata-only",
      risk: "low",
      proposedPatch: [
        {op: "add", path: `${basePointer}/rowReview`, value: {
          contract: "A1StoryboardRowReview/v1",
          status: "confirmed",
          source: "storyboard-row-decision",
          confirmedAtApplyTime: true,
        }},
      ],
      reason: "User confirmed the storyboard row; applying this should only record review metadata.",
    };
  }

  if (decision.action === "regenerate-artwork") {
    return {
      ...common,
      operationType: "queue-artwork-regeneration",
      applyMode: "safe-props-patch",
      risk: scene.storyboard?.artworkFile ? "medium" : "low",
      proposedPatch: [
        {op: "replace", path: `${basePointer}/artworkStatus`, value: "generation-queued"},
        {op: "replace", path: `${basePointer}/artworkFile`, value: null},
        {op: "replace", path: `${basePointer}/artworkPath`, value: null},
        {op: "replace", path: `${basePointer}/artworkSha256`, value: null},
        {op: "add", path: `${basePointer}/rowPatchReason`, value: "User requested generated artwork regeneration from storyboard table."},
      ],
      reason: "This row should stay on the GPT editorial artwork route and re-enter the generation queue.",
    };
  }

  if (decision.action === "needs-source") {
    return {
      ...common,
      operationType: "route-to-source-or-typography-fallback",
      applyMode: "manual-review-required",
      risk: "medium",
      proposedPatch: [
        {op: "replace", path: `${fillPointer}/assetRoute`, value: "deterministic-with-verified-entity"},
        {op: "replace", path: `${fillPointer}/status`, value: "needs-source-check-or-text-fallback"},
        {op: "add", path: `${fillPointer}/evidenceNeed`, value: "verify source binding or explicitly downgrade to typography-only fallback"},
      ],
      reason: "User marked this row as needing source evidence; applying should verify evidence before renderer use.",
    };
  }

  if (decision.action === "reroute-asset") {
    return {
      ...common,
      operationType: "reconsider-asset-route",
      applyMode: "manual-review-required",
      risk: "medium",
      proposedPatch: [
        {op: "add", path: `${basePointer}/routeReview`, value: {
          contract: "A1StoryboardRouteReview/v1",
          status: "needs-reroute",
          currentAssetRoute: fill.assetRoute || null,
          requestedAtApplyTime: true,
        }},
      ],
      reason: "Asset route must be re-decided from semantics before props mutation.",
    };
  }

  if (decision.action === "rewrite-visual") {
    return {
      ...common,
      operationType: "rewrite-visual-description",
      applyMode: "manual-review-required",
      risk: "medium",
      proposedPatch: [
        {op: "add", path: `${fillPointer}/rewriteRequest`, value: {
          contract: "A1StoryboardVisualRewriteRequest/v1",
          status: "needs-rewrite",
          currentFillWhat: fill.fillWhat || null,
          currentFillHow: fill.fillHow || null,
        }},
      ],
      reason: "Visual description needs new semantic wording before any renderer or asset queue update.",
    };
  }

  if (decision.action === "change-motion") {
    return {
      ...common,
      operationType: "replan-motion-grammar",
      applyMode: "manual-review-required",
      risk: "medium",
      proposedPatch: [
        {op: "add", path: `${basePointer}/motionReview`, value: {
          contract: "A1StoryboardMotionReview/v1",
          status: "needs-motion-replan",
          currentMotionJob: fill.motionJob || null,
          currentMotionStyle: scene.motionPlan?.motionStyle || null,
        }},
      ],
      reason: "Motion choice should be replanned by semantic action, not blindly overwritten.",
    };
  }

  return {
    ...common,
    operationType: "unknown-row-decision",
    applyMode: "blocked",
    risk: "high",
    proposedPatch: [],
    reason: "Unsupported row decision action.",
  };
}

const props = readJsonIfExists(storyboardPropsPath);
const rendererProps = readJsonIfExists(rendererPropsPath);
const manifest = readJsonIfExists(manifestPath);
const rowDecisions = readJsonIfExists(rowDecisionsPath);

if (!props || !Array.isArray(props.scenes)) throw new Error(`storyboard props missing: ${rel(storyboardPropsPath)}`);
if (!rendererProps || !Array.isArray(rendererProps.scenes)) throw new Error(`renderer props missing: ${rel(rendererPropsPath)}`);

const storyboardPropsSha256 = sha256File(storyboardPropsPath);
const rendererPropsSha256 = sha256File(rendererPropsPath);
const currentManifestSha = manifest?.current?.propsSha256 || null;
const rowDecisionSha = rowDecisions?.storyboardPropsSha256 || null;
const rowDecisionCurrent = Boolean(rowDecisions && rowDecisionSha && rowDecisionSha === currentManifestSha);
const activeDecisions = rowDecisionCurrent
  ? (rowDecisions.decisions || []).filter((decision) => decision.status === "active")
  : [];
const byBeatId = sceneIndexByBeatId(props.scenes);
const operations = [];
const blockers = [];

for (const decision of activeDecisions) {
  const index = byBeatId.get(decision.beatId);
  if (typeof index !== "number") {
    blockers.push({
      id: "decision-beat-not-found",
      beatId: decision.beatId,
      action: decision.action,
      detail: "Row decision references a beat that is not in the current storyboard props.",
    });
    continue;
  }
  operations.push(operationForDecision(decision, props.scenes[index], index));
}

if (rowDecisions && !rowDecisionCurrent) {
  blockers.push({
    id: "row-decisions-stale",
    decisionSha: rowDecisionSha,
    currentManifestSha,
    detail: "Row decisions belong to an older storyboard draft and must be ignored.",
  });
}

if (storyboardPropsSha256 !== rendererPropsSha256) {
  blockers.push({
    id: "storyboard-renderer-props-sha-mismatch",
    storyboardPropsSha256,
    rendererPropsSha256,
    detail: "Patch planning requires storyboard and renderer props to start from the same SHA.",
  });
}

const byAction = operations.reduce((acc, item) => {
  acc[item.action] = (acc[item.action] || 0) + 1;
  return acc;
}, {});
const byApplyMode = operations.reduce((acc, item) => {
  acc[item.applyMode] = (acc[item.applyMode] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardRowDecisionPatchPlan/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : operations.length ? "PLAN_READY" : "EMPTY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
    manifestPath: rel(manifestPath),
    rowDecisionsPath: rel(rowDecisionsPath),
    storyboardPropsSha256,
    rendererPropsSha256,
    currentManifestSha,
    rowDecisionSha,
    rowDecisionCurrent,
  },
  summary: {
    activeDecisionCount: activeDecisions.length,
    operationCount: operations.length,
    blockerCount: blockers.length,
    byAction,
    byApplyMode,
  },
  blockers,
  operations,
  nextAction: operations.length
    ? "review-patch-plan-then-build-explicit-apply-step"
    : "record-row-decisions-in-storyboard-table",
};

const md = [
  "# Storyboard Row Decision Patch Plan v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- active decisions: ${report.summary.activeDecisionCount}`,
  `- operations: ${report.summary.operationCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  `- apply allowed: ${report.applyAllowed}`,
  "",
  "## Operations",
  "",
  ...(operations.length ? operations.map((item, index) => [
    `### ${index + 1}. ${item.beatId} - ${item.operationType}`,
    "",
    `- action: ${item.action}`,
    `- apply mode: ${item.applyMode}`,
    `- risk: ${item.risk}`,
    `- reason: ${item.reason}`,
    `- current route: ${item.current.assetRoute || "missing"}`,
    `- current status: ${item.current.artworkPipelineStatus || item.current.artworkStatus || "missing"}`,
    "",
  ].join("\n")) : ["- no active row decisions"]),
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
