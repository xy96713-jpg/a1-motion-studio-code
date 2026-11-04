#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const phasePath = path.join(
  root,
  ".codex-artifacts/system-progress-system-line/current-phase.json",
);

const commonCommands = [
  "audit:workspace-line-isolation",
  "test:active-work-selection-v1",
  "test:system-line-operator-cli-v2",
  "audit:node-capability-inventory",
  "test:system-line-cleanup-safety-v1",
  "audit:zero-cost-contract",
  "test:project-final-release-only-autopilot",
  "test:visual-generation-director-v2",
  "test:video-packaging-context-v1",
  "test:packaging-attention-policy-v1",
  "test:presenter-packaging-complexity-gate-v1",
  "test:presenter-light-overlay-policy-v1",
  "test:creator-packaging-authority-p0-v1",
];

const phaseCommands = Object.freeze({
  CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED: [
    "test:creator-packaging-palette-live-v1",
    "test:creator-packaging-palette-bound-repair-v1",
    "test:packaging-production-authority-v1",
    "test:production-hot-path-state-v1",
    "audit:system-line-current-authority",
  ],
  ACTIVE_REVIEW_GATED: [
    "test:creator-packaging-palette-live-v1",
    "test:creator-packaging-palette-bound-repair-v1",
    "test:packaging-production-authority-v1",
    "test:production-hot-path-state-v1",
    "audit:article-packaging-automatic-qa-v1",
    "audit:system-line-current-authority",
  ],
  WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED: [
    "test:visual-repair-authority-precedence-v1",
    "test:packaging-production-authority-v1",
    "test:production-hot-path-state-v1",
    "audit:system-line-current-authority",
  ],
  FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED: [
    "test:latest-visual-board-authority-v1",
    "test:current-visual-decision-ledger-v1",
    "test:current-static-review-client-bootstrap-v1",
    "test:system-line-current-entrypoints-v1",
    "test:anti-ppt-motion-admission-v1",
    "test:packaging-production-authority-v1",
    "test:production-hot-path-state-v1",
    "audit:system-line-current-authority",
  ],
  // MOTION_READY is the persisted base phase. When effective authority
  // overrides it to GENERATE_NEW_CURRENT_CANDIDATE, verify the bounded
  // paragraph repair path and keep motion/production closed instead of
  // incorrectly rejecting the phase as unknown.
  MOTION_READY: [
    "test:visual-repair-authority-precedence-v1",
    "test:packaging-paragraph-quality-v1",
    "test:packaging-paragraph-canary-lifecycle-v1",
    "test:screen-coverage-director-v1",
    "audit:screen-coverage-family-diversity-v1",
    "test:event-settle-screen-motion-v1",
    "test:persistent-screen-result-target-v1",
    "test:headless-persistent-result-dom-v1",
    "test:current-storyboard-motion-design-authority-v1",
    "test:storyboard-motion-design-contract-v1",
    "test:motion-primitive-registry-v1",
    "test:current-production-lanes-v1",
    "test:motion-design-workbench-surface-v1",
    "audit:event-settle-screen-storyboard-binding-v1",
    "audit:remotion-screen-storyboard-binding-v2",
    "test:packaging-production-authority-v1",
    "test:production-hot-path-state-v1",
    "audit:system-line-current-authority",
  ],
  WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW: [
    "test:current-whole-film-review-client-v1",
    "test:shot-motion-spec-compiler-v1",
    "test:semantic-motion-actor-v1",
    "test:sequence-visual-breathing-gate-v1",
    "test:screen-run-breathing-v1",
    "audit:current-full-film-540p-pixels-v1",
    "audit:current-full-film-transitions-v1",
    "review:current-full-film-visual-director-v1",
    "audit:current-motion-system-maturity-v1",
    "test:packaging-production-authority-v1",
    "test:production-hot-path-state-v1",
    "audit:system-line-current-authority",
  ],
});

function fail(message, details = {}) {
  console.error(JSON.stringify({
    status: "FAIL",
    contract: "A1CurrentPhaseWorkbenchVerification/v1",
    message,
    ...details,
  }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(phasePath)) {
  fail("current-phase-missing", {phasePath: path.relative(root, phasePath)});
}

let phase;
try {
  phase = JSON.parse(fs.readFileSync(phasePath, "utf8"));
} catch (error) {
  fail("current-phase-invalid-json", {error: error instanceof Error ? error.message : String(error)});
}

const phaseStatus = phase?.status;
const selectedPhaseCommands = phaseCommands[phaseStatus];
if (!selectedPhaseCommands) {
  fail("current-phase-not-admitted", {
    phaseStatus,
    admittedPhaseStatuses: Object.keys(phaseCommands),
  });
}

if (phaseStatus === "WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED") {
  const targetShotIds = phase.authority?.nextAction?.targetShotIds || [];
  const threeAnchorReviewReady = phase.authority?.currentStage === "three-anchor-visual-repair-review"
    && phase.authority?.nextAction?.id === "review-three-anchor-visual-repair"
    && phase.authority?.nextAction?.requiresUser === true
    && JSON.stringify(targetShotIds) === JSON.stringify(["ED-01", "ED-17", "ED-34"])
    && phase.reviewDecision?.requiresExplicitApproval === true
    && phase.reviewDecision?.motionPrototypeAllowed === false
    && phase.reviewDecision?.finalRenderAllowed === false
    && phase.boardReview?.approvalAllowed === false
    && phase.boardReview?.userVisualApproval === "NOT_APPROVED";
  const summaryPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/shot-motion-review-v1/current-summary.json");
  const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, "utf8")) : null;
  const currentDesignReviewReady = phase.authority?.currentStage === "whole-film-static-board-semantic-repair"
    && phase.authority?.nextAction?.id === "review-current-shot-design-candidates"
    && phase.authority?.nextAction?.requiresUser === true
    && targetShotIds.length > 0
    && JSON.stringify([...targetShotIds].sort()) === JSON.stringify([...(phase.boardReview?.blockedShotIds || [])].sort())
    && summary?.workspaceSha256 === phase.authority.workspaceSha256
    && targetShotIds.every((id) => summary.items?.some((item) => item.shotId === id && item.status === "STATIC_DESIGN_REVIEW_REQUIRED"))
    && phase.reviewDecision?.requiresExplicitApproval === true
    && phase.reviewDecision?.motionPrototypeAllowed === false
    && phase.reviewDecision?.finalRenderAllowed === false
    && phase.boardReview?.approvalAllowed === false
    && phase.boardReview?.userVisualApproval === "NOT_APPROVED";
  if (!threeAnchorReviewReady && !currentDesignReviewReady) fail("static-design-review-contract-invalid", {authority: phase.authority || null, reviewDecision: phase.reviewDecision || null, boardReview: phase.boardReview || null});
}

if (phaseStatus === "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED") {
  const targetShotIds = phase.authority?.nextAction?.targetShotIds || [];
  const expectedShotIds = Array.from({length: 34}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`);
  const fullStaticReviewReady = phase.authority?.currentStage === "full-static-storyboard-rework-review"
    && phase.authority?.nextAction?.id === "review-full-static-storyboard-rework"
    && phase.authority?.nextAction?.requiresUser === true
    && phase.authority?.nextAction?.reviewGate === "FULL_STATIC_STORYBOARD_REWORK_REVIEW"
    && JSON.stringify(targetShotIds) === JSON.stringify(expectedShotIds)
    && phase.reviewDecision?.requiresExplicitApproval === true
    && phase.reviewDecision?.motionPrototypeAllowed === false
    && phase.reviewDecision?.finalRenderAllowed === false;
  if (!fullStaticReviewReady) fail("full-static-storyboard-rework-review-contract-invalid", {authority: phase.authority || null, reviewDecision: phase.reviewDecision || null});
}

if (phaseStatus === "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW") {
  const targetShotIds = phase.authority?.nextAction?.targetShotIds || [];
  const expectedShotIds = Array.from({length: 34}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`);
  const wholeFilmReviewReady = phase.authority?.currentStage === "whole-film-540p-review"
    && phase.authority?.nextAction?.id === "review-current-whole-film-540p"
    && phase.authority?.nextAction?.requiresUser === true
    && phase.authority?.nextAction?.reviewGate === "CURRENT_WHOLE_FILM_540P_REVIEW"
    && JSON.stringify(targetShotIds) === JSON.stringify(expectedShotIds)
    && phase.reviewDecision?.requiresExplicitApproval === true
    && phase.reviewDecision?.motionPrototypeAllowed === false
    && phase.reviewDecision?.finalRenderAllowed === false;
  if (!wholeFilmReviewReady) fail("whole-film-540p-review-contract-invalid", {authority: phase.authority || null, reviewDecision: phase.reviewDecision || null});
}

const commands = [...commonCommands, ...selectedPhaseCommands];
const results = [];
for (const script of commands) {
  const startedAt = Date.now();
  const child = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${child.stdout || ""}${child.stderr || ""}`;
  const result = {
    command: `npm run ${script}`,
    status: child.status === 0 ? "PASS" : "FAIL",
    exitCode: child.status,
    durationMs: Date.now() - startedAt,
  };
  results.push(result);
  if (child.status !== 0) {
    fail("current-phase-command-failed", {
      phaseStatus,
      failedCommand: result.command,
      outputTail: output.slice(-4000),
      results,
    });
  }
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1CurrentPhaseWorkbenchVerification/v1",
  phaseStatus,
  failClosedOnUnknownPhase: true,
  commandCount: commands.length,
  results,
}, null, 2));
