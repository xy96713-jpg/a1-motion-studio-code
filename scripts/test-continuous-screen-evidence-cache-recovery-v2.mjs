#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/all-sixteen-shot-v2");
const manifestPath = path.join(outputRoot, "manifest.json");
const renderScriptPath = path.join(root, "scripts/render-continuous-screen-evidence-opening-v2.mjs");
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(`continuous-screen-cache-recovery-v2:${message}`);
};
const readManifest = () => JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const runRenderer = (extraEnvironment = {}) => spawnSync(process.execPath, [renderScriptPath], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    A1_SCREEN_EVIDENCE_SCOPE: "all",
    ...extraEnvironment,
  },
});

const beforeManifest = readManifest();
const beforeManifestSha256 = sha256File(manifestPath);
const outputPath = path.join(root, beforeManifest.output.path);
const contactPath = path.join(root, beforeManifest.contactSheet.path);
const beforeOutputSha256 = sha256File(outputPath);
const beforeContactSha256 = sha256File(contactPath);
const beforeOutputMtimeMs = fs.statSync(outputPath).mtimeMs;

assert(beforeManifest.cache?.atomicAdmission === true, "atomic-admission-not-declared");
assert(beforeManifest.cache?.concurrencyLimit === 2, "concurrency-limit-drift");
assert(beforeManifest.boundary?.userVisualApproval === "NOT_APPROVED", "user-approval-drift-before-test");

const interrupted = runRenderer({
  A1_FORCE_RENDER: "1",
  A1_SCREEN_EVIDENCE_INJECT_FAILURE_AFTER_STAGE_SETUP: "1",
});
assert(interrupted.status !== 0, "injected-interruption-did-not-fail");
assert(interrupted.stderr.includes("continuous-screen-injected-failure-after-stage-setup"), "unexpected-interruption-error");
assert(sha256File(manifestPath) === beforeManifestSha256, "interruption-mutated-manifest");
assert(sha256File(outputPath) === beforeOutputSha256, "interruption-mutated-video");
assert(sha256File(contactPath) === beforeContactSha256, "interruption-mutated-contact");
assert(fs.readdirSync(outputRoot).some((name) => name.startsWith(".staging-")), "interruption-left-no-recoverable-stage");

const resumed = runRenderer();
assert(resumed.status === 0, `resume-failed:${resumed.stderr}`);
const resumeReport = JSON.parse(resumed.stdout);
assert(resumeReport.cacheHit === true, "resume-did-not-hit-cache");
assert(resumeReport.recoveredStagingDirectoryCount >= 1, "resume-did-not-recover-staging");
assert(!fs.readdirSync(outputRoot).some((name) => name.startsWith(".staging-")), "staging-not-clean-after-resume");
assert(sha256File(manifestPath) === beforeManifestSha256, "resume-mutated-manifest");
assert(sha256File(outputPath) === beforeOutputSha256, "resume-mutated-video");
assert(sha256File(contactPath) === beforeContactSha256, "resume-mutated-contact");
assert(fs.statSync(outputPath).mtimeMs === beforeOutputMtimeMs, "cache-hit-rewrote-video");

const afterManifest = readManifest();
assert(afterManifest.boundary?.candidateOnly === true, "candidate-only-boundary-drift");
assert(afterManifest.boundary?.productionAdmission === false, "production-admission-drift");
assert(afterManifest.boundary?.userVisualApproval === "NOT_APPROVED", "user-approval-drift-after-test");

console.log(JSON.stringify({
  status: "PASS",
  injectedFailureIsolated: true,
  staleStageRecovered: true,
  cacheHit: resumeReport.cacheHit,
  cacheReusedWithoutVideoRewrite: true,
  recoveredStagingDirectoryCount: resumeReport.recoveredStagingDirectoryCount,
  outputSha256: beforeOutputSha256,
  contactSha256: beforeContactSha256,
  userVisualApproval: afterManifest.boundary.userVisualApproval,
}, null, 2));
