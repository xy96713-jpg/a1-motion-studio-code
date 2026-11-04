#!/usr/bin/env node

import assert from "node:assert/strict";

import {canonicalTitleRepairRawBindingIsAdmissible} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const evaPlan = {
  shotId: "ED-19",
  planSha256: "plan-eva",
  canonicalRepair: {formalTypographyStyleMode: "EVA_MECHANISM_CJK"},
};

const currentEvaRaw = {
  shotId: "ED-19",
  current: true,
  planSha256: "plan-eva",
  artifact: {sha256: "artifact-eva", formalTypographyBinding: {heroTitleStyleMode: "EVA_MECHANISM_CJK"}},
};

assert.equal(canonicalTitleRepairRawBindingIsAdmissible(evaPlan, currentEvaRaw), true);
assert.equal(canonicalTitleRepairRawBindingIsAdmissible(evaPlan, {
  ...currentEvaRaw,
  artifact: {sha256: "artifact-old"},
}), false, "an EVA plan must reject a candidate without the formal EVA binding");
assert.equal(canonicalTitleRepairRawBindingIsAdmissible(evaPlan, {
  ...currentEvaRaw,
  current: false,
}), false, "history candidates must remain ineligible");
assert.equal(canonicalTitleRepairRawBindingIsAdmissible(evaPlan, {
  ...currentEvaRaw,
  planSha256: "old-plan",
}), false, "a stale plan hash must remain ineligible");

const latinEvaPlan = {
  ...evaPlan,
  canonicalRepair: {formalTypographyStyleMode: "EVA_EDITORIAL_SERIF_LATIN"},
};
assert.equal(canonicalTitleRepairRawBindingIsAdmissible(latinEvaPlan, {
  ...currentEvaRaw,
  artifact: {sha256: "artifact-latin-eva", formalTypographyBinding: {heroTitleStyleMode: "EVA_EDITORIAL_SERIF_LATIN"}},
}), true, "the Latin EVA branch must use the same fail-closed binding contract");
assert.equal(canonicalTitleRepairRawBindingIsAdmissible(latinEvaPlan, currentEvaRaw), false, "CJK and Latin EVA bindings must not cross-admit");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1CanonicalTitleRepairEvaBindingTest/v1",
  formalStyles: ["EVA_MECHANISM_CJK", "EVA_EDITORIAL_SERIF_LATIN"],
  checks: ["current-eva-pass", "missing-style-block", "history-block", "stale-plan-block", "latin-eva-pass", "cross-style-block"],
}, null, 2));
