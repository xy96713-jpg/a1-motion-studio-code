#!/usr/bin/env node
import assert from "node:assert/strict";

import {compileVisualProductionRun} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const coveragePlan = (shotPlans) => ({
  contract: "A1ShotVisualCoveragePlan/v1",
  projectId: "fixture-project",
  articleHash: "article-hash",
  sha256: "coverage-plan-sha",
  shotPlans,
});

const noPackageShot = {
  shotId: "T-NO-PACKAGE",
  order: 1,
  route: "PRESENTER_BASE",
  packageDecision: "NO_PACKAGE",
  actualVisualReady: false,
  preview: null,
};
const noPackageRun = compileVisualProductionRun(
  {},
  coveragePlan([noPackageShot]),
  {items: []},
  {now: "2026-08-06T00:00:00.000Z"},
);
assert.equal(noPackageRun.tasks[0].status, "COVERAGE_ONLY");
assert.equal(noPackageRun.counts.blockedSourceCount, 0);
assert.equal(noPackageRun.counts.coverageOnlyCount, 1);
assert.equal(noPackageRun.status, "WHOLE_FILM_STATIC_BOARD_READY");

const packageShot = {
  shotId: "T-PACKAGE",
  order: 2,
  route: "PACKAGE_LOOK_MASTER",
  packageDecision: "PACKAGE",
  actualVisualReady: false,
  preview: null,
};
const packageRun = compileVisualProductionRun(
  {},
  coveragePlan([packageShot]),
  {items: [{shotId: packageShot.shotId, state: "PREPARING_INPUTS"}]},
  {now: "2026-08-06T00:00:00.000Z"},
);
assert.equal(packageRun.tasks[0].status, "PREPARING_INPUTS");
assert.equal(packageRun.status, "GENERATION_INPUTS_PARTIAL");

console.log(JSON.stringify({
  status: "PASS",
  noPackage: {taskStatus: noPackageRun.tasks[0].status, runStatus: noPackageRun.status},
  packageWithoutInputs: {taskStatus: packageRun.tasks[0].status, runStatus: packageRun.status},
}, null, 2));
