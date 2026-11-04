#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertScreenRunBreathingPlan, compileScreenRunBreathingPlan} from "../apps/studio-next/src/lib/a1-screen-run-breathing-v1.mjs";

const timelineItems = Array.from({length: 11}, (_, index) => ({shotId: `ED-${String(index + 20).padStart(2, "0")}`, order: index + 20, route: "SCREEN_EVIDENCE", timeRange: {startMs: index * 8000, endMs: index * 8000 + 7600}}));
const plan = assertScreenRunBreathingPlan(compileScreenRunBreathingPlan({timelineItems}));
assert.deepEqual(plan.resets.map((item) => item.afterShotId), ["ED-23", "ED-26", "ED-29"]);
assert.deepEqual(plan.resets.map((item) => item.durationMs), [700, 900, 700]);
assert.ok(plan.resets.every((item) => item.audioPolicy === "CONTINUOUS_VOICE_NO_RESTART" && item.typography === "NONE"));
assert.equal(plan.policy.preserveTotalFilmDuration, true);
assert.equal(plan.boundaries.assemblyCreated, false);
console.log(JSON.stringify({status: "PASS", contract: plan.contract, planSha256: plan.planSha256, resetCount: plan.resets.length}));
