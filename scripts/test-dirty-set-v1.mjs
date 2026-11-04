import assert from "node:assert/strict";
import {buildDirtySet} from "../apps/studio-next/src/lib/a1-dirty-set-v1.mjs";

const previous = [
  {key: "ED-10", shotId: "ED-10", fingerprint: "same", outputExists: true, outputValid: true},
  {key: "ED-13", shotId: "ED-13", fingerprint: "old", outputExists: true, outputValid: true},
];
const result = buildDirtySet({
  previousEntries: previous,
  currentEntries: [
    {key: "ED-10", shotId: "ED-10", fingerprint: "same", outputExists: true, outputValid: true},
    {key: "ED-13", shotId: "ED-13", fingerprint: "new", outputExists: true, outputValid: true},
    {key: "ED-31", shotId: "ED-31", fingerprint: "new-shot", outputExists: false, outputValid: true},
  ],
});

assert.equal(result.contract, "A1DirtySet/v1");
assert.deepEqual(result.cacheEligibleIds, ["ED-10"]);
assert.deepEqual(result.dirtyIds, ["ED-13", "ED-31"]);
assert.ok(result.entries.find((entry) => entry.key === "ED-13").reasons.includes("DEPENDENCY_CHANGED"));
assert.ok(result.entries.find((entry) => entry.key === "ED-31").reasons.includes("OUTPUT_MISSING"));
assert.equal(result.summary.unchanged, 1);
console.log(JSON.stringify({status: "PASS", contract: result.contract, summary: result.summary}));
