#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
const readiness = JSON.parse(fs.readFileSync(path.join(root, "work/screen-result-region-readiness-v1/audit-report.json"), "utf8"));
const runsRoot = path.join(root, "work/background-cap-production-v1/runs");
const results = [];
for (const shot of plan.shots) {
  const ready = readiness.items.find((item) => item.shotId === shot.shotId);
  let matched = null;
  for (const runName of fs.readdirSync(runsRoot).sort().reverse()) {
    const runDir = path.join(runsRoot, runName), project = path.join(runDir, `${shot.shotId.toLowerCase()}.cap`), receiptPath = path.join(project, "a1-background-receipt.json"), review = path.join(runDir, `${shot.shotId.toLowerCase()}-background-cap-review-960x540.mp4`);
    if (!fs.existsSync(receiptPath) || !fs.existsSync(review)) continue;
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    if (receipt.storyboardBinding?.cameraRecipeSha256 !== shot.execution.cameraRecipe.recipeSha256 || receipt.sourceReport !== ready?.latestUsable?.reportPath) continue;
    matched = {project, review}; break;
  }
  if (!matched) {results.push({shotId: shot.shotId, status: "MISSING_CURRENT_PROJECT"}); continue;}
  const run = spawnSync(process.execPath, [path.join(root, "scripts/finalize-background-cap-receipt-v1.mjs"), matched.project, matched.review], {cwd: root, encoding: "utf8"});
  if (run.status !== 0) throw new Error(`post-export-reconcile:${shot.shotId}:${run.stderr || run.stdout}`);
  results.push({shotId: shot.shotId, status: "PASS", project: path.relative(root, matched.project), review: path.relative(root, matched.review)});
}
const body = {contract: "A1BackgroundCapPostExportReconciliation/v1", status: results.every((item) => item.status === "PASS") ? "PASS" : "INCOMPLETE", targetCount: results.length, reconciledCount: results.filter((item) => item.status === "PASS").length, missingShotIds: results.filter((item) => item.status !== "PASS").map((item) => item.shotId), results};
fs.writeFileSync(path.join(root, "work/screen-result-region-readiness-v1/post-export-reconciliation.json"), `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify(body, null, 2));
if (body.status !== "PASS") process.exitCode = 2;
