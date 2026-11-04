import assert from "node:assert/strict";
import {assertScreenEvidenceActionBinding, resolveScreenEvidenceActionBinding} from "../apps/studio-next/src/lib/a1-screen-evidence-action-contract-v1.mjs";

const exact = resolveScreenEvidenceActionBinding({expectedActionId: "review", observedActionId: "review"});
assert.equal(exact.status, "MATCH");
assert.equal(exact.coverageComplete, true);
assertScreenEvidenceActionBinding(exact);

const partial = resolveScreenEvidenceActionBinding({
  expectedActionId: "codexMaterialToWorkbench",
  observedActionId: "review",
  acceptedObservedActionIds: ["review"],
  evidenceCoverage: "PARTIAL",
  evidenceClaim: "workbench tail only",
  unprovenClaim: "upstream material preparation",
});
assert.equal(partial.status, "PARTIAL_COMPATIBLE");
assert.equal(partial.compatible, true);
assert.equal(partial.coverageComplete, false);
assertScreenEvidenceActionBinding(partial);

const mismatch = resolveScreenEvidenceActionBinding({expectedActionId: "presentation", observedActionId: "review"});
assert.equal(mismatch.status, "MISMATCH");
assert.equal(mismatch.compatible, false);
assertScreenEvidenceActionBinding(mismatch);

console.log(JSON.stringify({status: "PASS", contract: "A1ScreenEvidenceActionBinding/v1", cases: [exact.status, partial.status, mismatch.status]}, null, 2));
