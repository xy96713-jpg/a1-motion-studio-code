#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

import {assertProjectWriterLease, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {deriveCurrentShotReviewSummary} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
assertProjectWriterLease(appRoot);
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(expectedWorkspaceSha256 || "")) throw new Error("expected-workspace-sha-required");
const workspace = readProjectWorkspace(appRoot);
if (workspace.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`review-projection-cas:${workspace.workspaceSha256}`);
const summary = deriveCurrentShotReviewSummary(workspace);
const bytes = `${JSON.stringify(summary)}\n`;
const targets = [
  path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/shot-motion-review-v1/current-summary.json"),
  path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/shot-motion-review-v1/current-summary.json"),
];
for (const target of targets) {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, target);
}
for (const [script, args] of [
  ["build-current-review-queue-v1.mjs", []],
  ["audit-system-line-workbench-current-authority-v2.mjs", ["--write"]],
  ["build-system-core-current-v1.mjs", []],
]) execFileSync(process.execPath, [path.join(root, "scripts", script), ...args], {cwd: root, stdio: "pipe", env: process.env});
console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, counts: summary.counts, readyForReview: summary.readyForReview, workspaceMutationPerformed: false, eventWritten: false}, null, 2));
