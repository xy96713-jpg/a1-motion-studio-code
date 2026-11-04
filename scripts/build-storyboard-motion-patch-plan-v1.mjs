#!/usr/bin/env node
/**
 * Build reviewable motion patches for globally overused motion signatures.
 *
 * The repeat-window audit catches adjacent repeats. This plan catches the
 * second failure mode the user sees as "mechanical": the same semantic stage
 * using the same motion too many times across the whole storyboard.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-motion-patch-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const repeatPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-motion-repeat-window-plan-v1/report.json");
const acceptancePath = path.join(root, "apps/studio-next/public/generated/storyboard/current/motion-patch-acceptance.json");

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

function compact(value, max = 120) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
}

function signatureFor(scene) {
  const fill = scene.storyboard?.semanticFill || {};
  const semantic = scene.storyboard?.semanticDecision || {};
  const stage = semantic.semanticStageKind || fill.assetRoute || "missing-stage";
  const motion = fill.motionJob || scene.motionPlan?.motionStyle || scene.motionArchetype || "missing-motion";
  return {
    stage,
    motion,
    key: `${stage}::${motion}`,
  };
}

function motionAlternatives(stage, currentMotion) {
  const byStage = {
    "typographic-packaging": ["keyword-scale-packaging", "poster-slam-wipe", "quiet-type-emphasis", "archive-label-stamp"],
    "operation-flow": ["cursor-select-then-result-lock", "step-cards-connect-and-writeback", "gap-insertion-branch", "selection-highlight-write"],
    "archive-structure": ["timeline-pin-and-folder-close", "archive-stack-accumulate-and-tag", "converge-to-stable-version", "version-strip-slide"],
    "argument-grammar": ["cause-chain-to-verdict", "split-contrast-then-corrective-highlight", "verdict-stamp-after-evidence-slide", "question-counterproof-snap"],
  };
  return (byStage[stage] || ["semantic-stage-reveal", "keyword-scale-packaging", "soft-paragraph-reveal-with-keyword-lock"])
    .filter((item) => item !== currentMotion);
}

function operationIdFor(beatId, currentMotion, proposedMotionJob) {
  return `motion-patch-${beatId}-${currentMotion}-to-${proposedMotionJob}`
    .replace(/[^A-Za-z0-9_.-]+/gu, "-")
    .replace(/-+/gu, "-")
    .slice(0, 140);
}

function buildCandidates(scenes) {
  const rows = scenes.map((scene, index) => ({
    index,
    beatId: scene.beatId,
    macroId: scene.macroId,
    text: compact(scene.screenText),
    focusText: compact(scene.storyboard?.visualFocusText || scene.titleLines?.join(" ") || scene.screenText),
    signature: signatureFor(scene),
    assetRoute: scene.storyboard?.semanticFill?.assetRoute || null,
    typographyPreset: scene.storyboard?.typographyDirector?.preset || null,
  }));
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(row.signature.key, [...(byKey.get(row.signature.key) || []), row]);
  }
  const candidates = [];
  for (const [key, group] of byKey.entries()) {
    if (group.length < 6) continue;
    const [, currentMotion] = key.split("::");
    const alternates = motionAlternatives(group[0].signature.stage, currentMotion);
    if (!alternates.length) continue;
    for (let i = 2; i < group.length; i += 3) {
      const row = group[i];
      const proposedMotionJob = alternates[candidates.length % alternates.length];
      candidates.push({
        operationId: operationIdFor(row.beatId, row.signature.motion, proposedMotionJob),
        beatId: row.beatId,
        macroId: row.macroId,
        operationType: "vary-overused-motion-signature",
        applyMode: "manual-review-required",
        applyAllowed: false,
        risk: "medium",
        current: row.signature,
        proposedMotionJob,
        text: row.text,
        focusText: row.focusText,
        reason: `Motion signature ${row.signature.key} appears ${group.length} times; vary this occurrence to reduce mechanical rhythm without changing subtitle content.`,
        acceptanceGate: [
          "subtitle text remains unchanged",
          "visual focus text remains unchanged",
          "new motion job stays compatible with semantic stage",
          "layout risk audit passes after accepted patch apply",
        ],
      });
      if (candidates.length >= 12) return candidates;
    }
  }
  return candidates;
}

const props = readJsonIfExists(storyboardPropsPath);
const repeatPlan = readJsonIfExists(repeatPlanPath);
const acceptance = readJsonIfExists(acceptancePath);
const blockers = [];
if (!props || !Array.isArray(props.scenes)) blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});
if (!repeatPlan || repeatPlan.contract !== "A1StoryboardMotionRepeatWindowPlan/v1") blockers.push({id: "missing-motion-repeat-plan", detail: `Missing repeat plan: ${rel(repeatPlanPath)}`});

const storyboardPropsSha256 = sha256File(storyboardPropsPath);
const acceptedOperationIds = acceptance?.contract === "A1StoryboardMotionPatchAcceptance/v1" && acceptance.storyboardPropsSha256 === storyboardPropsSha256 && Array.isArray(acceptance.acceptedOperationIds)
  ? new Set(acceptance.acceptedOperationIds)
  : new Set();
const rejectedOperationIds = acceptance?.contract === "A1StoryboardMotionPatchAcceptance/v1" && acceptance.storyboardPropsSha256 === storyboardPropsSha256 && Array.isArray(acceptance.rejectedOperationIds)
  ? new Set(acceptance.rejectedOperationIds)
  : new Set();
const rawCandidates = blockers.length ? [] : buildCandidates(props.scenes || []);
const candidates = rawCandidates.map((candidate) => ({
  ...candidate,
  accepted: acceptedOperationIds.has(candidate.operationId),
  rejected: rejectedOperationIds.has(candidate.operationId),
}));
const acceptedCount = candidates.filter((candidate) => candidate.accepted).length;
const rejectedCount = candidates.filter((candidate) => candidate.rejected).length;
const pendingCount = candidates.filter((candidate) => !candidate.accepted && !candidate.rejected).length;
const status = blockers.length
  ? "BLOCKED"
  : candidates.length === 0
    ? "PASS"
    : pendingCount > 0
      ? "WAITING_FOR_ACCEPTANCE"
      : acceptedCount > 0
        ? "PLAN_READY"
        : "REVIEWED_NO_ACCEPTANCE";

const report = {
  contract: "A1StoryboardMotionPatchPlan/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256,
    repeatPlanPath: rel(repeatPlanPath),
    repeatPlanSha256: sha256File(repeatPlanPath),
    acceptancePath: rel(acceptancePath),
    acceptanceSha256: sha256File(acceptancePath),
    acceptanceStatus: acceptance?.status || "empty",
  },
  summary: {
    sceneCount: props?.scenes?.length || 0,
    repeatRunCount: repeatPlan?.summary?.repeatRunCount || 0,
    candidateCount: candidates.length,
    acceptedCount,
    rejectedCount,
    pendingCount,
    blockerCount: blockers.length,
  },
  blockers,
  candidates,
  nextAction: blockers.length
    ? "fix-motion-patch-plan-blockers"
    : pendingCount > 0
      ? "review-and-accept-or-reject-motion-patch-candidates"
      : acceptedCount > 0
        ? "apply-accepted-motion-patches"
        : "motion-patch-plan-clear",
};

const md = [
  "# Storyboard Motion Patch Plan v1",
  "",
  `Status: ${report.status}`,
  "",
  `- candidates: ${report.summary.candidateCount}`,
  `- accepted: ${report.summary.acceptedCount}`,
  `- rejected: ${report.summary.rejectedCount}`,
  `- pending: ${report.summary.pendingCount}`,
  "",
  ...(candidates.length ? candidates.map((item, index) => [
    `### ${index + 1}. ${item.beatId}`,
    "",
    `- id: ${item.operationId}`,
    `- decision: ${item.accepted ? "accepted" : item.rejected ? "rejected" : "pending"}`,
    `- current: ${item.current.key}`,
    `- proposed: ${item.proposedMotionJob}`,
    `- reason: ${item.reason}`,
    "",
  ].join("\n")) : ["- no motion patch candidates"]),
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
