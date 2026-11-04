#!/usr/bin/env node
/**
 * First-class storyboard WebGPT workflow.
 *
 * prepare: build the artwork bridge and resumable single-conversation queue.
 * status: report queue/import/closed-loop state.
 * finalize: import downloaded images, publish the isolated storyboard draft,
 * and run the bridge plus closed-loop audits.
 *
 * The browser phase remains Codex Chrome automation by design. This command
 * never uses AppleScript or private ChatGPT endpoints.
 */
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = process.cwd();
const mode = process.argv[2] || "status";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const queuePath = path.join(artifactRoot, "storyboard-webgpt-session-queue-v1/queue.json");
const importReportPath = path.join(artifactRoot, "storyboard-webgpt-artwork-import-v1/report.json");
const closedLoopReportPath = path.join(artifactRoot, "system-line-closed-loop-v1/report.json");
const runStatePath = path.join(artifactRoot, "storyboard-webgpt-workflow-v1/run-state.json");

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function runNode(script) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {cwd: root, stdio: "inherit"});
  if (result.status !== 0) process.exit(result.status || 1);
}

function writeState(state) {
  fs.mkdirSync(path.dirname(runStatePath), {recursive: true});
  fs.writeFileSync(runStatePath, `${JSON.stringify({...state, updatedAt: new Date().toISOString()}, null, 2)}\n`);
}

function status() {
  const queue = readJson(queuePath);
  const imported = readJson(importReportPath);
  const closedLoop = readJson(closedLoopReportPath);
  const output = {
    workflow: "storyboard-webgpt",
    browserPhase: queue ? "codex-chrome-session-required" : "not-prepared",
    queue: queue ? {
      contract: queue.contract,
      conversation: queue.conversation,
      jobCount: queue.summary?.jobCount || 0,
      messageMode: queue.policy?.messageMode || null,
      batchKeywordMode: queue.policy?.batchKeywordMode || null,
    } : null,
    import: imported ? {
      status: imported.status,
      importedCount: imported.summary?.importedCount || 0,
      missingCount: imported.summary?.missingCount || 0,
    } : null,
    closedLoop: closedLoop ? {
      status: closedLoop.status,
      failures: closedLoop.failures?.length || 0,
    } : null,
    runState: readJson(runStatePath),
  };
  console.log(JSON.stringify(output, null, 2));
}

if (mode === "prepare") {
  runNode("scripts/build-storyboard-webgpt-artwork-pack-v1.mjs");
  runNode("scripts/build-storyboard-webgpt-session-queue-v1.mjs");
  writeState({
    status: "WAITING_FOR_CODEX_CHROME_SESSION",
    nextAction: "use-the-persistent-conversation-then-run-npm-run-workflow:storyboard-webgpt:finalize",
  });
  status();
} else if (mode === "finalize") {
  runNode("scripts/import-storyboard-webgpt-artwork-v1.mjs");
  runNode("scripts/publish-storyboard-current-v1.mjs");
  runNode("scripts/audit-storyboard-webgpt-artwork-bridge-v1.mjs");
  runNode("scripts/audit-system-line-closed-loop-v1.mjs");
  writeState({
    status: "FINALIZED_REVIEW_ONLY",
    nextAction: "review-imported-artwork-on-4311-storyboard",
  });
  status();
} else if (mode === "status") {
  status();
} else {
  console.error("Usage: node scripts/workflow-storyboard-webgpt-v1.mjs <prepare|status|finalize>");
  process.exit(2);
}
