#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const runnerPath = path.join(root, "scripts/run-system-line-current-v1.mjs");
const registryPath = path.join(root, "apps/studio-next/src/data/system-line-current-entrypoints-v1.json");
const packagePath = path.join(root, "package.json");
const runner = fs.readFileSync(runnerPath, "utf8");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const failures = [];

if (registry.contract !== "A1SystemLineOperatorRegistry/v2") failures.push("OPERATOR_REGISTRY_V2_MISSING");
if (pkg.scripts?.["system-line"] !== "node scripts/run-system-line-current-v1.mjs") failures.push("FORMAL_SYSTEM_LINE_PACKAGE_COMMAND_MISSING");
if (!runner.includes("command.preflight === \"live-runtime\"")) failures.push("LIVE_RUNTIME_PREFLIGHT_NOT_SCOPED");
if (!runner.includes("system-core-v1/current.json")) failures.push("LIFECYCLE_GATE_MISSING");
if (!registry.lifecycleActions || !Object.keys(registry.lifecycleActions).length) failures.push("LIFECYCLE_ACTION_REGISTRY_MISSING");

let results = [];
const testPath = path.join(root, "scripts/test-system-line-operator-cli-v2.mjs");
if (!fs.existsSync(testPath)) {
  failures.push("OPERATOR_CLI_TEST_MISSING");
} else {
  const test = spawnSync(process.execPath, [testPath], { cwd: root, encoding: "utf8", timeout: 10000, maxBuffer: 300000 });
  if (test.status !== 0) failures.push("OPERATOR_CLI_TEST_FAILED");
  else results = JSON.parse(test.stdout).results || [];
}

const report = {
  contract: "A1SystemLineOperatorCliAudit/v2",
  status: failures.length ? "FAIL" : "PASS",
  commandCount: Object.keys(registry.commands || {}).length,
  lifecycleActionCount: Object.keys(registry.lifecycleActions || {}).length,
  formalCommand: pkg.scripts?.["system-line"] || null,
  results,
  failures,
  checkedAt: new Date().toISOString(),
};
if (process.argv.includes("--write-baseline")) fs.writeFileSync(path.join(root, "work/single-operator-entrypoint-v2-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--write")) {
  const out = path.join(root, "work/single-operator-entrypoint-v2");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(out, "REPORT.md"), `# Single operator entrypoint v2\n\n- Status: **${report.status}**\n- Formal command: \`${report.formalCommand}\`\n- Registered commands: **${report.commandCount}**\n- Lifecycle actions classified: **${report.lifecycleActionCount}**\n- CLI fixtures passed: **${results.filter((item) => item.status === "PASS").length} / ${results.length}**\n`);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
