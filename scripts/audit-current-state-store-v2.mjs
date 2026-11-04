#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const publicWorkspace = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const artifactWorkspace = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(publicWorkspace, "utf8"));
const failures = [];
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (workspace.production?.currentStateArchivePointer?.contract !== "A1CurrentStateArchivePointer/v2" || workspace.production.currentStateArchivePointer.status !== "CURRENT") failures.push("CURRENT_STATE_ARCHIVE_POINTER_MISSING");
if (sha(publicWorkspace) !== sha(artifactWorkspace)) failures.push("WORKSPACE_MIRROR_MISMATCH");
if (fs.statSync(publicWorkspace).size > 30_000_000) failures.push("CURRENT_WORKSPACE_OVER_30MB");

let results = [];
const testPath = path.join(root, "scripts/test-current-state-store-v2.mjs");
if (!fs.existsSync(testPath)) failures.push("CURRENT_STATE_STORE_TEST_MISSING");
else {
  const test = spawnSync(process.execPath, [testPath], {cwd: root, encoding: "utf8", timeout: 10000, maxBuffer: 300000});
  if (test.status !== 0) failures.push("CURRENT_STATE_STORE_TEST_FAILED");
  else results = JSON.parse(test.stdout).results || [];
}
const report = {contract: "A1CurrentStateStoreAudit/v2", status: failures.length ? "FAIL" : "PASS", workspaceBytes: fs.statSync(publicWorkspace).size, workspaceSha256: workspace.workspaceSha256, pointer: workspace.production?.currentStateArchivePointer || null, mirrorsMatch: sha(publicWorkspace) === sha(artifactWorkspace), results, failures, checkedAt: new Date().toISOString()};
if (process.argv.includes("--write-baseline")) fs.writeFileSync(path.join(root, "work/current-state-store-v2-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--write")) {
  const out = path.join(root, "work/current-state-store-v2"); fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(out, "REPORT.md"), `# Current state store v2\n\n- Status: **${report.status}**\n- Current workspace: **${(report.workspaceBytes / 1_000_000).toFixed(2)} MB**\n- Archived active-collection records: **${report.pointer?.archivedRecordCount || 0}**\n- Exact recovery: **${report.pointer?.exactJsonRoundTripVerified === true ? "PASS" : "FAIL"}**\n- Public/artifact parity: **${report.mirrorsMatch ? "PASS" : "FAIL"}**\n`);
}
console.log(JSON.stringify(report, null, 2)); if (failures.length) process.exitCode = 1;
