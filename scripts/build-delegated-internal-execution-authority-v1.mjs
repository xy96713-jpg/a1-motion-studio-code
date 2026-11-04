#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertApprovalOwnershipDecision, classifyApprovalOwnership} from "../apps/studio-next/src/lib/a1-approval-ownership-policy-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const motionManifestFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/editorial-shot-director-v1/candidate-v3/representative-motion-v1/manifest.json");
const fullFilmMotionPlanFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/editorial-shot-director-v1/candidate-v3/full-film-motion-plan-v1.json");
const artifactOutput = path.join(root, ".codex-artifacts/system-progress-system-line/delegated-internal-execution-authority-v1/current.json");
const publicOutput = path.join(publicRoot, "generated/system-line/delegated-internal-execution-authority-v1/current.json");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const motion = JSON.parse(fs.readFileSync(motionManifestFile, "utf8"));
const fullFilmMotionPlan = fs.existsSync(fullFilmMotionPlanFile) ? JSON.parse(fs.readFileSync(fullFilmMotionPlanFile, "utf8")) : null;
assert(motion.status === "AGENT_REPRESENTATIVE_MOTION_ACTUAL_PIXEL_PASS" && motion.actualPixelReview?.status === "PASS", "delegated-authority-motion-proof-not-pass");
assert(motion.boundaries.userVisualApproval === "NOT_APPROVED" && motion.boundaries.productionEligible === false, "delegated-authority-user-boundary-invalid");

const completedDecisions = [
  assertApprovalOwnershipDecision(classifyApprovalOwnership("SELECT_STRICTLY_BETTER_REVIEW_CANDIDATE", {incumbentComparisonPass: true, actualPixelReviewPass: true})),
  assertApprovalOwnershipDecision(classifyApprovalOwnership("ADMIT_STATIC_BOARD_TO_BOUNDED_MOTION_PROOF", {staticBoardActualPixelReviewPass: true, isolatedOutput: true})),
  assertApprovalOwnershipDecision(classifyApprovalOwnership("RENDER_ISOLATED_REPRESENTATIVE_MOTION", {reviewOnly: true, canonicalOverwrite: false, resolveWrite: false, externalPublication: false})),
  assertApprovalOwnershipDecision(classifyApprovalOwnership("RUN_ACTUAL_PIXEL_REVIEW")),
  assertApprovalOwnershipDecision(classifyApprovalOwnership("RUN_TECHNICAL_REGRESSION")),
  ...(fullFilmMotionPlan?.status === "REVIEW_ONLY_FULL_FILM_MOTION_PLAN_COMPILED"
    ? [assertApprovalOwnershipDecision(classifyApprovalOwnership("COMPILE_FULL_FILM_MOTION_PLAN"))]
    : []),
];
assert(completedDecisions.every((decision) => decision.owner === "AGENT_INTERNAL"), "delegated-authority-completed-decision-owner-invalid");

const body = {
  contract: "A1DelegatedInternalExecutionAuthority/v1",
  version: 1,
  status: "INTERNAL_MOTION_PROOF_PASSED_AUTONOMOUS_CONTINUATION_ALLOWED",
  sourceDirective: {
    text: "你客观看 最优执行 不要总是我批准",
    intent: "Agent owns reversible internal quality gates; user owns core direction and irreversible delivery gates.",
  },
  lanes: {
    internalReviewLane: {
      owner: "AGENT_INTERNAL",
      completedDecisionSha256s: completedDecisions.map((decision) => decision.decisionSha256),
      nextAction: {
        id: fullFilmMotionPlan?.status === "REVIEW_ONLY_FULL_FILM_MOTION_PLAN_COMPILED"
          ? "BUILD_SOURCE_BOUND_MOTION_CANARY"
          : "EXPAND_VALIDATED_PACKAGING_EVENTS_TO_FULL_FILM_MOTION_PLAN",
        requiresUser: false,
        targetShotIds: fullFilmMotionPlan?.status === "REVIEW_ONLY_FULL_FILM_MOTION_PLAN_COMPILED" ? ["ED-02", "ED-14", "ED-22"] : [],
        constraint: "review-only plan and 540p evidence; no canonical overwrite or Resolve write",
      },
    },
    canonicalProductionLane: {
      owner: "USER_REQUIRED_AT_IRREVERSIBLE_BOUNDARY_ONLY",
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
      blockedActions: ["CHANGE_CORE_AESTHETIC_DIRECTION", "OVERWRITE_CANONICAL_WHOLE_FILM", "WRITE_DAVINCI_RESOLVE", "APPROVE_FINAL_RENDER", "PUBLISH_EXTERNALLY"],
    },
  },
  sourceEvidence: {
    representativeMotionManifest: {publicUrl: publicUrlFor(motionManifestFile), fileSha256: sha256File(motionManifestFile), manifestSha256: motion.manifestSha256},
    representativeMotionPlayable: motion.output,
    representativeMotionStateBoard: {publicUrl: motion.motionStateBoard.publicUrl, sha256: motion.motionStateBoard.sha256},
    actualPixelReview: motion.actualPixelReview,
    fullFilmMotionPlan: fullFilmMotionPlan?.status === "REVIEW_ONLY_FULL_FILM_MOTION_PLAN_COMPILED"
      ? {publicUrl: publicUrlFor(fullFilmMotionPlanFile), sha256: sha256File(fullFilmMotionPlanFile), planSha256: fullFilmMotionPlan.planSha256, auditStatus: fullFilmMotionPlan.audit?.status}
      : null,
  },
  compatibility: {
    persistedCurrentPhaseMayRemainUserFacingStaticReview: true,
    internalLaneMustNotWaitForThatUserFacingGate: true,
    agentDecisionMustNeverBeSerializedAsUserApproval: true,
    workspaceMutationPerformed: false,
    currentPhaseMutationPerformed: false,
  },
  generatedAt: new Date().toISOString(),
};
const authority = {...body, authoritySha256: sha256Value(body)};
for (const file of [artifactOutput, publicOutput]) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(authority, null, 2)}\n`);
}
assert(sha256File(artifactOutput) === sha256File(publicOutput), "delegated-authority-mirror-drifted");
process.stdout.write(`${JSON.stringify({status: authority.status, nextAction: authority.lanes.internalReviewLane.nextAction, canonicalProductionLane: authority.lanes.canonicalProductionLane, authoritySha256: authority.authoritySha256, mirroredFileSha256: sha256File(publicOutput)}, null, 2)}\n`);
