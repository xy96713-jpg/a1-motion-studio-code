#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertCurrentSemanticCoverageForStaticBoard} from "./build-whole-film-static-board-pending-v1.mjs";

const current = {
  production: {
    shotVisualCoveragePlan: {
      semanticTimeline: {status: "CURRENT", recompileRequired: false},
      shotPlans: [
        {shotId: "T-01", semanticRevisionStatus: "CURRENT", semanticRecompileRequired: false},
      ],
    },
  },
};

assert.equal(assertCurrentSemanticCoverageForStaticBoard(current), true);

const staleTimeline = structuredClone(current);
staleTimeline.production.shotVisualCoveragePlan.semanticTimeline = {status: "STALE_REQUIRES_RECOMPILE", recompileRequired: true};
assert.throws(() => assertCurrentSemanticCoverageForStaticBoard(staleTimeline), /current-semantic-coverage-required/u);

const staleShot = structuredClone(current);
staleShot.production.shotVisualCoveragePlan.shotPlans[0].semanticRevisionStatus = "STALE_REQUIRES_RECOMPILE";
staleShot.production.shotVisualCoveragePlan.shotPlans[0].semanticRecompileRequired = true;
assert.throws(() => assertCurrentSemanticCoverageForStaticBoard(staleShot), /stale-semantic-shots:T-01/u);

console.log(JSON.stringify({status: "PASS", currentAllowed: true, staleTimelineBlocked: true, staleShotBlocked: true}, null, 2));
