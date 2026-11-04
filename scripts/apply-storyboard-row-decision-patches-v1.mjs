#!/usr/bin/env node
/**
 * Apply only safe storyboard row-decision patches.
 *
 * This is the explicit gate after the review-only patch plan. It applies:
 * - metadata-only operations
 * - safe-props-patch operations
 *
 * It skips manual-review-required operations and never allows final render.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-row-decision-patches-applied-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const planPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-row-decision-patch-plan-v1/report.json");

const allowedApplyModes = new Set(["metadata-only", "safe-props-patch"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function decodePointerPart(value) {
  return value.replace(/~1/gu, "/").replace(/~0/gu, "~");
}

function pointerParts(pointer) {
  if (!pointer || pointer[0] !== "/") throw new Error(`invalid json pointer: ${pointer}`);
  return pointer.slice(1).split("/").map(decodePointerPart);
}

function valueForApply(value, now) {
  if (value === true) return value;
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => valueForApply(item, now));
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "confirmedAtApplyTime" && item === true) next.confirmedAt = now;
    else if (key === "requestedAtApplyTime" && item === true) next.requestedAt = now;
    else next[key] = valueForApply(item, now);
  }
  return next;
}

function applyPatchOperation(target, operation, now) {
  if (!["add", "replace"].includes(operation.op)) throw new Error(`unsupported patch op: ${operation.op}`);
  const parts = pointerParts(operation.path);
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) throw new Error(`array pointer out of bounds: ${operation.path}`);
      cursor = cursor[index];
    } else {
      if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
      cursor = cursor[part];
    }
  }
  const last = parts.at(-1);
  if (Array.isArray(cursor)) {
    const index = Number(last);
    if (!Number.isInteger(index) || index < 0 || index >= cursor.length) throw new Error(`array target out of bounds: ${operation.path}`);
    cursor[index] = valueForApply(operation.value, now);
  } else {
    cursor[last] = valueForApply(operation.value, now);
  }
}

function recalcContentHash(props) {
  props.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (props.scenes || []).map((scene) => [
      scene.beatId,
      scene.storyboard?.semanticFill,
      scene.storyboard?.artworkStatus,
      scene.storyboard?.artworkFile,
      scene.storyboard?.rowReview,
      scene.storyboard?.routeReview,
      scene.storyboard?.motionReview,
      scene.storyboard?.rowPatchReason,
    ]),
  })).digest("hex");
}

function applyOperations(targetProps, operations, now) {
  for (const operation of operations) {
    for (const patch of operation.proposedPatch || []) applyPatchOperation(targetProps, patch, now);
  }
  recalcContentHash(targetProps);
}

const plan = readJsonIfExists(planPath);
const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};
const blockers = [];

if (!plan || plan.contract !== "A1StoryboardRowDecisionPatchPlan/v1") {
  blockers.push({id: "missing-patch-plan", detail: `Missing patch plan: ${rel(planPath)}`});
}
if (plan?.source?.storyboardPropsSha256 && plan.source.storyboardPropsSha256 !== before.storyboardPropsSha256) {
  blockers.push({id: "storyboard-props-sha-changed", detail: "Patch plan was built against a different storyboard props SHA."});
}
if (plan?.source?.rendererPropsSha256 && plan.source.rendererPropsSha256 !== before.rendererPropsSha256) {
  blockers.push({id: "renderer-props-sha-changed", detail: "Patch plan was built against a different renderer props SHA."});
}
if (before.storyboardPropsSha256 !== before.rendererPropsSha256) {
  blockers.push({id: "storyboard-renderer-props-sha-mismatch", detail: "Storyboard and renderer props must match before applying row-decision patches."});
}
if (Array.isArray(plan?.blockers) && plan.blockers.length) {
  blockers.push(...plan.blockers.map((item) => ({id: `plan-${item.id}`, detail: item.detail || item.id})));
}

const allOperations = Array.isArray(plan?.operations) ? plan.operations : [];
const allowedOperations = blockers.length ? [] : allOperations.filter((operation) => allowedApplyModes.has(operation.applyMode));
const skippedOperations = allOperations.filter((operation) => !allowedApplyModes.has(operation.applyMode));
const now = new Date().toISOString();

if (allowedOperations.length) {
  applyOperations(storyboardProps, allowedOperations, now);
  applyOperations(rendererProps, allowedOperations, now);
  writeJson(storyboardPropsPath, storyboardProps);
  writeJson(rendererPropsPath, rendererProps);
}

const after = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};

if (allowedOperations.length && fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.rowDecisionPatchApplied = {
    phaseId,
    reportPath: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
    appliedAt: now,
    appliedOperationCount: allowedOperations.length,
    skippedOperationCount: skippedOperations.length,
  };
  writeJson(manifestPath, manifest);
}

const report = {
  contract: "A1StoryboardRowDecisionPatchesApplied/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : allowedOperations.length ? "APPLIED_REVIEW_ONLY" : "EMPTY",
  generatedAt: now,
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    planPath: rel(planPath),
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
  },
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  summary: {
    planOperationCount: allOperations.length,
    appliedOperationCount: allowedOperations.length,
    skippedManualReviewCount: skippedOperations.length,
    blockerCount: blockers.length,
  },
  appliedOperations: allowedOperations.map((operation) => ({
    beatId: operation.beatId,
    action: operation.action,
    operationType: operation.operationType,
    applyMode: operation.applyMode,
    patchCount: (operation.proposedPatch || []).length,
  })),
  skippedOperations: skippedOperations.map((operation) => ({
    beatId: operation.beatId,
    action: operation.action,
    operationType: operation.operationType,
    applyMode: operation.applyMode,
    reason: "manual review required before props mutation",
  })),
  blockers,
  nextAction: skippedOperations.length
    ? "review-manual-row-decisions-before-applying"
    : allowedOperations.length
      ? "rebuild-storyboard-audits-after-review-only-row-patch"
      : "record-row-decisions-in-storyboard-table",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  after: report.after,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
