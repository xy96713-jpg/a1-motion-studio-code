#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {runRecoverableJobs, writeJsonAtomic} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-system-validation-runner-"));
const statePath = path.join(root, "state.json");
const attempts = new Map();
const makeJobs = (failureId = null) => ["one", "two", "three"].map((id) => ({
  id,
  cacheKey: `cache-${id}`,
  run: async () => {
    attempts.set(id, (attempts.get(id) || 0) + 1);
    if (id === failureId) throw new Error(`injected-${id}`);
    const outputPath = path.join(root, `${id}.txt`);
    fs.writeFileSync(outputPath, id, "utf8");
    return {outputPath};
  },
}));
const validateOutput = async (_job, prior) => fs.existsSync(prior.output?.outputPath || "");

try {
  const interrupted = await runRecoverableJobs({jobs: makeJobs(), statePath, runKey: "resume", concurrency: 1, validateOutput, interruptAfterCompleted: 1});
  assert.equal(interrupted.status, "INTERRUPTED");
  const firstPassed = Object.values(interrupted.jobs).filter((item) => item.status === "PASS").length;
  assert.equal(firstPassed, 1);

  const resumed = await runRecoverableJobs({jobs: makeJobs(), statePath, runKey: "resume", concurrency: 2, validateOutput});
  assert.equal(resumed.status, "PASS");
  assert.equal(resumed.maxObservedConcurrency <= 2, true);
  const firstId = Object.entries(interrupted.jobs).find(([, item]) => item.status === "PASS")[0];
  assert.equal(attempts.get(firstId), 1, "resume must not repeat a valid completed job");

  const cached = await runRecoverableJobs({jobs: makeJobs(), statePath, runKey: "resume", concurrency: 2, validateOutput});
  assert.equal(cached.status, "PASS");
  assert.equal(Object.values(cached.jobs).every((item) => item.cacheHit === true), true);

  const failureStatePath = path.join(root, "failure-state.json");
  const isolated = await runRecoverableJobs({jobs: makeJobs("two"), statePath: failureStatePath, runKey: "failure", concurrency: 2, validateOutput});
  assert.equal(isolated.status, "FAILED_WITH_ISOLATION");
  assert.deepEqual(isolated.failedJobIds, ["two"]);
  assert.equal(isolated.jobs.one.status, "PASS");
  assert.equal(isolated.jobs.three.status, "PASS");

  const admission = path.join(root, "admission.json");
  writeJsonAtomic(admission, {status: "PASS"});
  assert.deepEqual(JSON.parse(fs.readFileSync(admission, "utf8")), {status: "PASS"});
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith(".tmp")), false, "atomic writer must not leave a partial file");
  console.log(JSON.stringify({status: "PASS", contract: "A1SystemValidationRunnerTest/v1", resume: true, cacheHit: true, failureIsolation: true, concurrencyLimit: 2, atomicAdmission: true}, null, 2));
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
