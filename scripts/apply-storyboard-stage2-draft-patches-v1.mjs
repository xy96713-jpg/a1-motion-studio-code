#!/usr/bin/env node
/**
 * Apply explicitly accepted Stage 2 semantic draft patches.
 *
 * This consumes A1StoryboardStage2DraftPatchPlan/v1 and applies only operations
 * produced from accepted draft IDs. It keeps the render/export gates closed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-stage2-draft-patches-applied-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const planPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-draft-patch-plan-v1/report.json");

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

function pointerParts(pointer) {
  if (!pointer || pointer[0] !== "/") throw new Error(`invalid json pointer: ${pointer}`);
  return pointer.slice(1).split("/").map((part) => part.replace(/~1/gu, "/").replace(/~0/gu, "~"));
}

function valueForApply(value, now) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => valueForApply(item, now));
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "acceptedAtApplyTime" && item === true) next.acceptedAt = now;
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
      scene.titleLines,
      scene.storyboard?.visualFocusText,
      scene.storyboard?.semanticFill,
      scene.storyboard?.artworkStatus,
      scene.storyboard?.artworkFile,
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

if (!plan || plan.contract !== "A1StoryboardStage2DraftPatchPlan/v1") {
  blockers.push({id: "missing-stage2-draft-patch-plan", detail: `Missing patch plan: ${rel(planPath)}`});
}
if (plan?.before?.storyboardPropsSha256 && plan.before.storyboardPropsSha256 !== before.storyboardPropsSha256) {
  blockers.push({id: "storyboard-props-sha-changed", detail: "Stage 2 patch plan was built against a different storyboard props SHA."});
}
if (plan?.before?.rendererPropsSha256 && plan.before.rendererPropsSha256 !== before.rendererPropsSha256) {
  blockers.push({id: "renderer-props-sha-changed", detail: "Stage 2 patch plan was built against a different renderer props SHA."});
}
if (before.storyboardPropsSha256 !== before.rendererPropsSha256) {
  blockers.push({id: "storyboard-renderer-props-sha-mismatch", detail: "Storyboard and renderer props must match before applying Stage 2 draft patches."});
}
if (Array.isArray(plan?.blockers) && plan.blockers.length) {
  blockers.push(...plan.blockers.map((item) => ({id: `plan-${item.id}`, detail: item.detail || item.id})));
}

const operations = blockers.length ? [] : (Array.isArray(plan?.operations) ? plan.operations : []).filter((operation) => operation.applyMode === "safe-props-patch");
const now = new Date().toISOString();

if (operations.length) {
  applyOperations(storyboardProps, operations, now);
  applyOperations(rendererProps, operations, now);
  writeJson(storyboardPropsPath, storyboardProps);
  writeJson(rendererPropsPath, rendererProps);
}

const after = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};

if (operations.length && fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.stage2DraftPatchApplied = {
    phaseId,
    reportPath: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
    appliedAt: now,
    appliedOperationCount: operations.length,
  };
  writeJson(manifestPath, manifest);
}

const report = {
  contract: "A1StoryboardStage2DraftPatchesApplied/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : operations.length ? "APPLIED_REVIEW_ONLY" : "EMPTY",
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
    planOperationCount: Array.isArray(plan?.operations) ? plan.operations.length : 0,
    appliedOperationCount: operations.length,
    blockerCount: blockers.length,
  },
  appliedOperations: operations.map((operation) => ({
    draftId: operation.draftId,
    beatId: operation.beatId,
    operationType: operation.operationType,
    patchCount: (operation.proposedPatch || []).length,
  })),
  blockers,
  nextAction: operations.length
    ? "rebuild-semantic-layout-artwork-audits-after-stage2-patch"
    : "accept-stage2-drafts-before-applying",
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
