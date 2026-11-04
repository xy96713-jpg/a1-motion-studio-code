#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Keep the historical audit implementation executable from its original
// `scripts/` location. It was archived without updating the mandatory
// AGENTS.md command, and its relative imports are intentionally rooted here.
const root = process.cwd();
const archivedPath = path.join(root, "_archive/scripts/audit-h-series-visual-master-contract-v1.mjs");
if (!fs.existsSync(archivedPath)) {
  throw new Error(`archived audit implementation missing: ${archivedPath}`);
}

const source = fs.readFileSync(archivedPath, "utf8")
  .replaceAll('from "../apps/', 'from "./apps/');
const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
