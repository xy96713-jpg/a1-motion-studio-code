#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (!process.argv.includes("--apply")) throw new Error("current-projection-refresh-requires-apply");
const appRoot = path.join(root, "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const token = fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/.writer-lease.token"), "utf8").trim();
const result = spawnSync(process.execPath, [path.join(root, "scripts/refresh-current-review-projections-v1.mjs"), workspace.workspaceSha256], {
  cwd: root,
  stdio: "inherit",
  env: {...process.env, A1_SYSTEM_LINE_WRITER_ID: "system-line-operator-cli", A1_SYSTEM_LINE_WRITER_LEASE_TOKEN: token},
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
