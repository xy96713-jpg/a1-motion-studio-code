#!/usr/bin/env node
import assert from "node:assert/strict";
import {decideShotVisualRepairAction, normalizeShotVisualRepairState} from "../apps/studio-next/src/lib/a1-visual-repair-policy-v1.mjs";

const decide = (overrides = {}) => decideShotVisualRepairAction({
  reviewStatus: "pending",
  hasVisualCritic: false,
  referenceMaturity: false,
  revisionRound: 0,
  strategyCycle: 0,
  maxRoundsPerTarget: 2,
  maxVisualStrategyCycles: 2,
  ...overrides,
});

assert.equal(decide().action, "continue-current", "unreviewed work must not consume a strategy cycle");
assert.equal(decide({reviewStatus: "revise", hasVisualCritic: true, revisionRound: 1}).action, "rebuild-same-primitive", "the first failed review gets one structural revision");
assert.equal(decide({reviewStatus: "revise", hasVisualCritic: true, revisionRound: 2, strategyCycle: 0}).action, "switch-visual-primitive", "round two changes the visual primitive");
assert.equal(decide({reviewStatus: "revise", hasVisualCritic: true, revisionRound: 2, strategyCycle: 2}).action, "block-engineering-required", "the final primitive failure must stop automation");
assert.equal(decide({reviewStatus: "revise", hasVisualCritic: true, revisionRound: 1, sourceEvidenceCaptureRequired: true}).action, "block-engineering-required", "a source-capture requirement must stop visual looping before another primitive reset");
assert.equal(decide({reviewStatus: "revise", hasVisualCritic: false, revisionRound: 99, strategyCycle: 1067}).action, "continue-current", "corrupt historical counters cannot reset pending work");
assert.equal(normalizeShotVisualRepairState({reviewStatus: "pending", hasVisualCritic: false, referenceMaturity: false, revisionRound: 1, strategyCycle: 1067, maxVisualStrategyCycles: 2}).normalizedStrategyCycle, 0, "unreviewed legacy cycle must normalize before the next tick");
assert.equal(normalizeShotVisualRepairState({reviewStatus: "revise", hasVisualCritic: true, referenceMaturity: false, revisionRound: 2, strategyCycle: 2, maxVisualStrategyCycles: 2}).normalizationRequired, false, "reviewed failure cycle must remain available to the block guard");

console.log(JSON.stringify({status: "PASS", contract: "A1VisualRepairDecision/v1", cases: 8}, null, 2));
