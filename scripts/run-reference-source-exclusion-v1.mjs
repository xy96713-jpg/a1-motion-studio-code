#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const apply = process.argv.includes("--apply");
if (!apply) throw new Error("reference-source-exclusion-requires-apply");
const sourceId = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "covacut";
if (sourceId !== "covacut") throw new Error(`reference-source-exclusion-not-registered:${sourceId}`);
const audit = spawnSync(process.execPath, [path.join(root, "scripts/audit-unique-system-line-v1.mjs")], {cwd: root, encoding: "utf8"});
if (audit.status !== 0) {
  process.stderr.write(audit.stdout || "");
  process.stderr.write(audit.stderr || "");
  throw new Error("reference-source-exclusion-unique-runtime-audit-failed");
}
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const token = fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/.writer-lease.token"), "utf8").trim();
const result = spawnSync(process.execPath, [path.join(root, "scripts/apply-reference-source-exclusion-v1.mjs"), sourceId, workspace.workspaceSha256], {
  cwd: root,
  stdio: "inherit",
  env: {...process.env, A1_SYSTEM_LINE_WRITER_ID: "system-line-operator-cli", A1_SYSTEM_LINE_WRITER_LEASE_TOKEN: token},
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
