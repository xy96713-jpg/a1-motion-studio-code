#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "visual-system-full-review-v1";
const publicPath = path.join(root, "apps/studio-next/public/generated/system-line", phaseId, "review-ledger.json");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId, "review-ledger.json");
if (!fs.existsSync(publicPath)) {
  console.error("visual-system-full-review-ledger: run audit:visual-system-full-review first");
  process.exitCode = 1;
} else {
  const ledger = JSON.parse(fs.readFileSync(publicPath, "utf8"));
  if (ledger.contract !== "A1VisualSystemFullReviewHumanReviewLedger/v1" || ledger.scenes.length !== 47) {
    console.error("visual-system-full-review-ledger: invalid or incomplete ledger");
    process.exitCode = 1;
  } else {
    fs.mkdirSync(path.dirname(artifactPath), {recursive: true});
    fs.copyFileSync(publicPath, artifactPath);
    console.log(JSON.stringify({contract: ledger.contract, status: ledger.status, sceneCount: ledger.scenes.length, humanVisualApproval: ledger.gates.humanVisualApproval}, null, 2));
  }
}
