#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {buildV8CanaryReviewEvidence} from "./engines/record-v8-canary-review-evidence-engine-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const fileSha = () => crypto.createHash("sha256").update(fs.readFileSync(workspacePath)).digest("hex");
const expectations = {
  1: {contract: undefined, version: "static-package-review-v8-canary-v2", reportRevision: 2, output: "static-package-review-v8/v8-canary-review-evidence.json", manifest: false},
  2: {contract: "A1V8CanaryReviewEvidence/v2", version: "static-package-review-v8-canary-v2", reportRevision: 2, output: "static-package-review-v8/v8-canary-review-evidence-v2.json", manifest: true},
  4: {contract: "A1V8CanaryReviewEvidence/v4", version: "static-package-review-v8-canary-v4", reportRevision: 4, output: "static-package-review-v8/v8-canary-review-evidence-v4.json", manifest: true},
};
for (const revision of [1, 2, 4]) {
  const plan = buildV8CanaryReviewEvidence(revision);
  const expected = expectations[revision];
  assert.equal(plan.workspaceEvidence.contract, expected.contract);
  assert.equal(plan.workspaceEvidence.version, expected.version);
  assert.equal(plan.workspaceEvidence.reportPath.includes(`canary-v${expected.reportRevision}/report.json`), true);
  assert.equal(plan.config.output, expected.output);
  assert.equal(Boolean(plan.manifestSha256), expected.manifest);
  assert.equal(plan.workspaceEvidence.productionAdmitted, false);
  assert.equal(plan.workspaceEvidence.userVisualApproval, "NOT_APPROVED");
  assert.equal(plan.fileEvidence.contract, `A1V8CanaryReviewEvidence/v${revision}`);
}
const before = fileSha();
for (const revision of [1, 2, 4]) {
  const output = execFileSync(process.execPath, [`scripts/record-v8-canary-review-evidence-v${revision}.mjs`, "--dry-run"], {cwd: root, encoding: "utf8", env: {...process.env, A1_FIXED_NOW: "2026-08-20T00:00:00.000Z"}});
  assert.equal(JSON.parse(output).status, "DRY_RUN_PASS");
}
assert.equal(fileSha(), before, "all wrappers must be mutation-free in dry-run mode");
for (const revision of [1, 2, 4]) {
  const source = fs.readFileSync(path.join(root, `scripts/record-v8-canary-review-evidence-v${revision}.mjs`), "utf8");
  assert.equal(source.trim().split("\n").length, 2);
  assert.ok(source.includes(`runRecordV8CanaryReviewEvidence(${revision})`));
}
console.log(JSON.stringify({status: "PASS", variantCount: 3, dryRunCount: 3, workspaceUnchanged: true}));
