#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const sharedKernelFiles = [
  "apps/studio-next/src/lib/a1-current-storyboard-taste-compiler-v1.mjs",
  "apps/studio-next/src/lib/a1-screen-director-brain-v2.mjs",
  "apps/studio-next/src/lib/a1-editorial-shot-director-v1.mjs",
  "apps/studio-next/src/lib/a1-canonical-director-authority-v1.mjs",
  "apps/studio-next/src/lib/a1-semantic-motion-style-router-v1.mjs",
  "apps/studio-next/src/lib/a1-automatic-motion-router-v1.mjs",
  "apps/studio-next/src/lib/a1-system-line-lifecycle-v1.mjs",
];
const profileRuntime = "apps/studio-next/src/lib/a1-system-line-project-profile-v1.mjs";
const currentProfile = "configs/system-line-projects/july1-writing-workbench.json";
const failures = [];
const fileResults = [];

for (const relative of sharedKernelFiles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`SHARED_KERNEL_FILE_MISSING:${relative}`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  const filmIdentifiers = source.match(/\bED-[0-9]{2}\b/gu) || [];
  const demoProjectDefaults = source.match(/a1-screen-demo/gu) || [];
  fileResults.push({ path: relative, filmIdentifierCount: filmIdentifiers.length, demoProjectDefaultCount: demoProjectDefaults.length });
  if (filmIdentifiers.length) failures.push(`SHARED_KERNEL_FILM_IDENTIFIER_LEAK:${relative}`);
  if (demoProjectDefaults.length) failures.push(`SHARED_KERNEL_DEMO_PROJECT_DEFAULT:${relative}`);
}

if (!fs.existsSync(path.join(root, profileRuntime))) failures.push("PROJECT_PROFILE_RUNTIME_MISSING");
if (!fs.existsSync(path.join(root, currentProfile))) failures.push("CURRENT_PROJECT_PROFILE_MISSING");

let results = [];
const profileTestPath = path.join(root, "scripts/test-system-line-project-profile-v1.mjs");
if (!fs.existsSync(profileTestPath)) {
  failures.push("PROJECT_PROFILE_BLIND_TEST_MISSING");
} else {
  const test = spawnSync(process.execPath, [profileTestPath], { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 200000 });
  if (test.status !== 0) failures.push("PROJECT_PROFILE_BLIND_TEST_FAILED");
  else results = JSON.parse(test.stdout).results || [];
}

const report = {
  contract: "A1SystemLineRuntimeBoundaryAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  sharedKernelFiles,
  fileResults,
  results,
  currentProjectProfile: currentProfile,
  failures,
  checkedAt: new Date().toISOString(),
};

const outputDir = path.join(root, "work/project-fixture-boundary-v1");
if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(path.join(root, "work/project-fixture-boundary-v1-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
}
if (process.argv.includes("--write")) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "REPORT.md"), `# Project fixture boundary v1\n\n- Status: **${report.status}**\n- Shared kernel files checked: **${sharedKernelFiles.length}**\n- Shared kernel film identifier leaks: **${fileResults.reduce((total, item) => total + item.filmIdentifierCount, 0)}**\n- Blind genres passed: **${results.filter((item) => item.status === "PASS").length} / ${results.length}**\n- Current project compatibility profile: \`${currentProfile}\`\n`);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
