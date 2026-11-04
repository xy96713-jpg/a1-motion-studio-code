#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {assertPackagingParagraphAutoReviewProjection, buildPackagingParagraphAutoReviewProjection} from "../apps/studio-next/src/lib/a1-packaging-paragraph-auto-review-v1.mjs";
import {packagingParagraphCanaryLifecyclePaths, readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const listDirectFiles = (dir, suffix) => {
  try {
    return fs.readdirSync(dir, {withFileTypes: true})
      .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
};

let lifecycle = readPackagingParagraphCanaryLifecycle(appRoot, {refresh: true});
if (!lifecycle) throw new Error("packaging-paragraph-auto-review-lifecycle-required");
let projection = assertPackagingParagraphAutoReviewProjection(buildPackagingParagraphAutoReviewProjection(lifecycle));
let objectiveAuditRun = null;

if (lifecycle.status === "STATIC_REVIEW_BATCH_READY_AWAITING_OBJECTIVE_AUDIT") {
  const paths = packagingParagraphCanaryLifecyclePaths(appRoot, lifecycle.source.planSha256, lifecycle.source.requestPackSha256);
  const receiptFiles = listDirectFiles(paths.imagegenRoot, ".receipt.json");
  if (receiptFiles.length !== 1) throw new Error(`packaging-paragraph-auto-review-exactly-one-imagegen-receipt-required:${receiptFiles.length}`);
  const audit = spawnSync(process.execPath, [path.join(projectRoot, "scripts/audit-packaging-paragraph-objective-pixels-v1.mjs")], {
    cwd: projectRoot,
    env: {...process.env, A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_RESULT_RECEIPT: receiptFiles[0]},
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (audit.status !== 0) throw new Error(`packaging-paragraph-auto-review-objective-audit-failed:${String(audit.stderr || audit.stdout).trim()}`);
  objectiveAuditRun = JSON.parse(audit.stdout.trim());
  lifecycle = readPackagingParagraphCanaryLifecycle(appRoot, {refresh: true});
  projection = assertPackagingParagraphAutoReviewProjection(buildPackagingParagraphAutoReviewProjection(lifecycle));
}

const paths = packagingParagraphCanaryLifecyclePaths(appRoot, lifecycle.source.planSha256, lifecycle.source.requestPackSha256);
let repairScope = null;
if (lifecycle.status === "OBJECTIVE_PIXEL_REPAIR_REQUIRED" && paths.objectiveAudit && fs.existsSync(paths.objectiveAudit)) {
  const audit = readJson(paths.objectiveAudit);
  const failedShotIds = audit.items?.filter((item) => item.status !== "OBJECTIVE_PIXEL_PASS_REVIEW_ONLY").map((item) => item.shotId) || [];
  repairScope = {kind: "OBJECTIVE_PIXEL_FAILURES", failedShotIds, failedHandoffIds: audit.sequenceDifference?.status === "PASS" ? [] : ["THREE_FRAME_SEQUENCE_DIFFERENCE"]};
}
if (lifecycle.status === "VISUAL_REPAIR_REQUIRED" && paths.visualDirectorAssessment && fs.existsSync(paths.visualDirectorAssessment)) {
  const assessment = readJson(paths.visualDirectorAssessment);
  const failedShotIds = assessment.items?.filter((item) => item.status === "VISUAL_REPAIR_REQUIRED").map((item) => item.shotId) || [];
  const failedHandoffIds = assessment.paragraph?.continuityResults?.filter((item) => item.result === "FAIL").map((item) => item.id) || [];
  repairScope = {kind: "VISUAL_DIRECTOR_FAILURES", failedShotIds, failedHandoffIds};
}

const visualDirectorHandoff = lifecycle.status === "OBJECTIVE_PIXEL_PASS_AWAITING_VISUAL_DIRECTOR" ? {
  status: "READY_FOR_AUTOMATIC_AGENT_CONTINUATION",
  userPromptRequired: false,
  actualPixelPaths: ["ED-12.png", "ED-13.png", "ED-14.png"].map((fileName) => path.join(paths.reviewRoot, fileName)),
  paragraphStripPath: path.join(paths.reviewRoot, "objective-pixel-audit-v1/paragraph-review-strip.png"),
  assessmentInputTemplatePath: path.join(paths.reviewRoot, "objective-pixel-audit-v1/visual-director-assessment-input-template.json"),
  assessmentRecorder: "scripts/record-packaging-paragraph-visual-director-assessment-v1.mjs",
  requiredMethod: "ACTUAL_PIXELS_VIEWED_TOGETHER_AT_ORIGINAL_RESOLUTION",
} : null;

console.log(JSON.stringify({
  contract: "A1PackagingParagraphAutoReviewRun/v1",
  status: projection.status,
  lifecycleStatus: lifecycle.status,
  lifecycleSha256: lifecycle.lifecycleSha256,
  projectionSha256: projection.projectionSha256,
  currentAction: projection.currentAction,
  objectiveAuditRun,
  visualDirectorHandoff,
  repairScope,
  automaticContinuation: projection.currentAction.automaticContinuation,
  userVisualApproval: "NOT_APPROVED",
  productionAdmitted: false,
  workspaceMutationPerformed: false,
  motionAllowed: false,
  resolveAllowed: false,
  finalRenderAllowed: false,
}, null, 2));
