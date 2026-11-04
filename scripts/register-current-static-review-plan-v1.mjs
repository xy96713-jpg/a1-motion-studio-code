#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(expectedWorkspaceSha256 || "")) throw new Error("expected-workspace-sha-required");
const manifestPath = path.join(root, "work/remaining-static-regeneration-20260914/review-plan-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.contract !== "A1RemainingStaticReviewPlanBundle/v1" || manifest.status !== "READY_FOR_LEASED_WRITER_PLAN_TRANSITION" || manifest.workspaceSha256 !== expectedWorkspaceSha256 || manifest.boundaries?.adoptionAllowedFromThisBundle !== false || manifest.boundaries?.productionAdmission !== false) throw new Error("static-review-plan-bundle-stale-or-unsafe");
const planPath = path.join(root, manifest.planPath);
const result = execFileSync(process.execPath, [path.join(root, "scripts/reconcile-shot-motion-review-v1.mjs"), "plan", planPath, expectedWorkspaceSha256], {cwd: root, encoding: "utf8", env: process.env});
const parsed = JSON.parse(result);
if (parsed.status !== "PASS" || parsed.mode !== "plan" || parsed.productionAdmission !== false) throw new Error("static-review-plan-transition-failed");
for (const [script, args] of [
  ["audit-system-line-workbench-current-authority-v2.mjs", ["--write"]],
  ["build-current-review-queue-v1.mjs", []],
  ["build-system-core-current-v1.mjs", []],
]) execFileSync(process.execPath, [path.join(root, "scripts", script), ...args], {cwd: root, stdio: "pipe", env: process.env});
console.log(JSON.stringify({...parsed, planSha256: manifest.planSha256, candidateSha256s: manifest.candidateSha256s, physicalMotionSha256s: manifest.physicalMotionSha256s}, null, 2));
