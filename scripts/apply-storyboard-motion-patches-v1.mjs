#!/usr/bin/env node
/**
 * Apply accepted motion patches only. Subtitle, timing, focus text and route
 * remain unchanged.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-motion-patches-applied-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const approvalPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json");
const patchPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-motion-patch-plan-v1/report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function apply(props, candidateByBeatId) {
  const applied = [];
  for (const scene of props.scenes || []) {
    const candidate = candidateByBeatId.get(scene.beatId);
    if (!candidate) continue;
    const beforeMotion = scene.storyboard?.semanticFill?.motionJob || scene.motionPlan?.motionStyle || scene.motionArchetype || null;
    const semanticFill = scene.storyboard?.semanticFill || {};
    const semanticDecision = scene.storyboard?.semanticDecision || {};
    scene.storyboard = {
      ...(scene.storyboard || {}),
      semanticFill: {
        ...semanticFill,
        motionJob: candidate.proposedMotionJob,
        motionPatchResolution: {
          phaseId,
          operationId: candidate.operationId,
          previousMotionJob: beforeMotion,
          reason: candidate.reason,
        },
      },
      semanticDecision: {
        ...semanticDecision,
        motionStyle: candidate.proposedMotionJob,
      },
      motionPatchResolution: {
        phaseId,
        operationId: candidate.operationId,
        previousMotionJob: beforeMotion,
        proposedMotionJob: candidate.proposedMotionJob,
      },
    };
    scene.motionPlan = {
      ...(scene.motionPlan || {}),
      motionStyle: candidate.proposedMotionJob,
      primaryAction: candidate.proposedMotionJob,
      motionPatchResolution: {
        phaseId,
        operationId: candidate.operationId,
      },
    };
    applied.push({
      operationId: candidate.operationId,
      beatId: scene.beatId,
      previousMotionJob: beforeMotion,
      proposedMotionJob: candidate.proposedMotionJob,
      textUnchanged: true,
      timingUnchanged: true,
    });
  }
  props.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: (props.scenes || []).map((scene) => [
      scene.beatId,
      scene.screenText,
      scene.sourceStartMs,
      scene.sourceEndMs,
      scene.storyboard?.semanticFill?.motionJob,
      scene.motionPlan?.motionStyle,
    ]),
  })).digest("hex");
  return applied;
}

function motionPatchResolutionCount(props) {
  return (props.scenes || []).filter((scene) => scene.storyboard?.motionPatchResolution
    || scene.storyboard?.semanticFill?.motionPatchResolution
    || scene.motionPlan?.motionPatchResolution).length;
}

for (const required of [storyboardPropsPath, rendererPropsPath, patchPlanPath]) {
  if (!fs.existsSync(required)) throw new Error(`missing required file: ${rel(required)}`);
}

const patchPlan = readJson(patchPlanPath);
const candidates = Array.isArray(patchPlan.candidates) ? patchPlan.candidates : [];
const acceptedCandidates = candidates.filter((candidate) => candidate.accepted === true);
const candidateByBeatId = new Map(acceptedCandidates.map((candidate) => [candidate.beatId, candidate]));
const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
  patchPlanSha256: sha256File(patchPlanPath),
};
let after = {
  storyboardPropsSha256: before.storyboardPropsSha256,
  rendererPropsSha256: before.rendererPropsSha256,
};
let storyboardApplied = [];
let rendererApplied = [];
const now = new Date().toISOString();
let currentMotionPatchResolutionCount = 0;

if (acceptedCandidates.length > 0) {
  const storyboardProps = readJson(storyboardPropsPath);
  const rendererProps = readJson(rendererPropsPath);
  storyboardApplied = apply(storyboardProps, candidateByBeatId);
  rendererApplied = apply(rendererProps, candidateByBeatId);
  if (storyboardApplied.length !== rendererApplied.length) throw new Error(`apply mismatch storyboard=${storyboardApplied.length} renderer=${rendererApplied.length}`);
  currentMotionPatchResolutionCount = motionPatchResolutionCount(storyboardProps);
  writeJson(storyboardPropsPath, storyboardProps);
  writeJson(rendererPropsPath, rendererProps);
  after = {
    storyboardPropsSha256: sha256File(storyboardPropsPath),
    rendererPropsSha256: sha256File(rendererPropsPath),
  };
} else {
  currentMotionPatchResolutionCount = motionPatchResolutionCount(readJson(storyboardPropsPath));
}

if (acceptedCandidates.length > 0 && fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsPath: rel(storyboardPropsPath),
    propsSha256: after.storyboardPropsSha256,
  };
  manifest.reviewState = {
    ...(manifest.reviewState || {}),
    approvalInvalidatedAt: now,
    approvalInvalidationReason: "motion-patches-applied",
  };
  writeJson(manifestPath, manifest);
}

if (acceptedCandidates.length > 0 && fs.existsSync(approvalPath)) {
  writeJson(approvalPath, {
    contract: "A1StoryboardApproval/v1",
    status: "INVALIDATED_BY_STORYBOARD_CHANGE",
    invalidatedAt: now,
    reason: "motion-patches-applied",
    before,
    after,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  });
}

const rejectedCount = candidates.filter((candidate) => candidate.rejected === true).length;
const pendingCount = candidates.filter((candidate) => candidate.accepted !== true && candidate.rejected !== true).length;
const report = {
  contract: "A1StoryboardMotionPatchesApplied/v1",
  phaseId,
  status: acceptedCandidates.length ? "APPLIED_ACCEPTED_MOTION_PATCHES" : "EMPTY_NO_ACCEPTED_PATCHES",
  generatedAt: now,
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    patchPlanPath: rel(patchPlanPath),
    patchPlanSha256: before.patchPlanSha256,
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
  },
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  summary: {
    candidateCount: candidates.length,
    acceptedCount: acceptedCandidates.length,
    rejectedCount,
    pendingCount,
    appliedCount: storyboardApplied.length,
    currentMotionPatchResolutionCount,
    subtitleMutationApplied: false,
    timingMutationApplied: false,
  },
  applied: storyboardApplied,
  nextAction: pendingCount > 0 ? "review-remaining-motion-patch-candidates" : "motion-patches-applied-or-not-needed",
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
