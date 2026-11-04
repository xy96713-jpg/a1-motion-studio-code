#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
const readiness = JSON.parse(fs.readFileSync(path.join(root, "work/screen-result-region-readiness-v1/audit-report.json"), "utf8"));
const runsRoot = path.join(root, "work/background-cap-production-v1/runs");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const receipts = [];
for (const runName of fs.readdirSync(runsRoot).sort().reverse()) {
  const runDir = path.join(runsRoot, runName);
  if (!fs.statSync(runDir).isDirectory()) continue;
  for (const name of fs.readdirSync(runDir).filter((item) => item.endsWith(".cap"))) {
    const receiptPath = path.join(runDir, name, "a1-background-receipt.json");
    if (fs.existsSync(receiptPath)) receipts.push({runDir, projectDir: path.join(runDir, name), receiptPath, receipt: JSON.parse(fs.readFileSync(receiptPath, "utf8"))});
  }
}

const items = [];
for (const shot of plan.shots) {
  const ready = readiness.items.find((item) => item.shotId === shot.shotId);
  const match = receipts.find((item) => item.receipt.shotId === shot.shotId && item.receipt.storyboardBinding?.cameraRecipeSha256 === shot.execution.cameraRecipe.recipeSha256 && item.receipt.sourceReport === ready?.latestUsable?.reportPath);
  const failures = [];
  if (!match) failures.push("CURRENT_COVERAGE_PROJECT_MISSING");
  let review = null;
  if (match) {
    const configPath = path.join(match.projectDir, "project-config.json");
    if (!fs.existsSync(configPath) || sha256(configPath) !== match.receipt.projectConfigSha256) failures.push("PROJECT_CONFIG_SHA_MISMATCH");
    const expectedRegionSource = shot.execution.cameraRecipe.interactionIntent.directorFamily.target === "NONE" ? "FULL_STATE" : "VERIFIED_PIXEL_DELTA";
    if (match.receipt.coveragePlan?.status !== "PASS" || match.receipt.coveragePlan?.resultRegionSource !== expectedRegionSource) failures.push("COVERAGE_RECEIPT_INVALID");
    const slug = shot.shotId.toLowerCase();
    const reviewFile = path.join(match.runDir, `${slug}-background-cap-review-960x540.mp4`);
    if (!fs.existsSync(reviewFile)) failures.push("REVIEW_VIDEO_MISSING");
    else {
      const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size", "-of", "json", reviewFile], {encoding: "utf8"}));
      const stream = probe.streams.find((item) => item.codec_type === "video");
      if (probe.streams.length !== 1 || stream?.width !== 960 || stream?.height !== 540 || stream?.r_frame_rate !== "60/1") failures.push("REVIEW_VIDEO_CONTRACT");
      review = {path: path.relative(root, reviewFile), sha256: sha256(reviewFile), frameCount: Number(stream?.nb_read_frames), durationMs: Math.round(Number(probe.format.duration) * 1000)};
    }
  }
  items.push({shotId: shot.shotId, status: failures.length ? "INCOMPLETE" : "PASS", sourceReport: ready?.latestUsable?.reportPath || null, projectPath: match ? path.relative(root, match.projectDir) : null, receiptSha256: match ? sha256(match.receiptPath) : null, review, failures});
}
const failures = items.flatMap((item) => item.failures.map((failure) => `${item.shotId}:${failure}`));
const body = {contract: "A1ScreenCoverageProjectReadinessAudit/v1", status: failures.length ? "INCOMPLETE" : "PASS", sourcePlanSha256: plan.planSha256, sourceResultReadinessAuditSha256: readiness.auditSha256, targetCount: items.length, completeCount: items.filter((item) => item.status === "PASS").length, items, failures};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
const output = path.join(root, "work/screen-result-region-readiness-v1/project-readiness-audit.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({contract: report.contract, status: report.status, targetCount: report.targetCount, completeCount: report.completeCount, failures: report.failures, auditSha256: report.auditSha256}, null, 2));
if (report.status !== "PASS") process.exitCode = 2;
