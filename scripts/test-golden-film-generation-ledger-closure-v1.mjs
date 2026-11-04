#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {projectDirs} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const run = JSON.parse(fs.readFileSync(path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json"), "utf8"));
const expectedGeneratedShas = [
  "c9666b65e47a8b4db5117292fa7fdd90283c319b052ecb542298499309865ef3",
  "43b5d76be5e9a4bd712c219e47559bd1fd4383f36bf8b341d41a1d61da319be2",
  "1cdc234f862870c6b88f502b61617b6cffa0468ba80b4deecff90411e2fc5537",
  "b2482839cff91a0ffcf339b2996a9a7d47086bce08934647275aeb3d9e6eda1c",
].sort();

assert.equal(run.overallStatus, "WHOLE_FILM_STATIC_BOARD");
assert.equal(run.phases.PHASE_3.status, "PASS");
assert.deepEqual(run.phases.PHASE_3.targetShotIds, ["ED-16", "ED-17"]);
assert.deepEqual([...run.imageLedger.candidateShas].sort(), expectedGeneratedShas);
assert.equal(run.imageLedger.attemptedGeneratedCount, 4);
assert.equal(run.imageLedger.adoptedGeneratedCount, 2);
assert.equal(run.imageLedger.rejectedGeneratedCount, 2);
assert.equal(run.imageLedger.systemEligibleGeneratedCount, 2);
assert.equal(run.imageLedger.pendingGeneratedCount, 2);
assert.equal(run.imageLedger.referenceAttachmentAudit.currentWaveJobCount, 4);
assert.equal(run.imageLedger.referenceAttachmentAudit.currentWaveCompletedJobCount, 4);
assert.equal(run.imageLedger.referenceAttachmentAudit.currentWaveAuditedGeneratedCount, 4);
assert.equal(run.imageLedger.referenceAttachmentAudit.currentWaveUserVisualApprovedCount, 0);
assert.equal(run.imageLedger.reusedExistingCandidateCount, 11);

console.log(JSON.stringify({status: "PASS", attemptedGeneratedCount: 4, adoptedGeneratedCount: 2, rejectedGeneratedCount: 2, reusedExistingCandidateCount: 11, userVisualApprovedCount: 0}, null, 2));
