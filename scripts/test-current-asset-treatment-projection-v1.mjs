import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileCurrentAssetTreatmentProjection} from "../apps/studio-next/src/lib/a1-current-asset-treatment-projection-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const projection = compileCurrentAssetTreatmentProjection(workspace);

assert.equal(projection.contract, "A1CurrentAssetTreatmentProjection/v1");
assert.equal(projection.workspaceSha256, workspace.workspaceSha256);
assert.equal(projection.counts.externalAssets, 2);
assert.equal(projection.counts.decisions, 2);
assert.equal(projection.counts.evidencePreserved, 1);
assert.equal(projection.counts.cutouts, 0);
assert.equal(projection.counts.clean, 2);
assert.equal(projection.counts.stylized, 0);
assert.ok(projection.decisions.every((item) => item.decision.boundaries.productionAdmission === false));
assert.ok(projection.decisions.every((item) => item.decision.boundaries.titleRendered === false));
assert.ok(projection.decisions.every((item) => item.decision.boundaries.backgroundGenerated === false));
assert.equal(projection.policy.automaticStoryboardMutation, false);
assert.equal(projection.policy.productionAdmission, false);

console.log(JSON.stringify({
  contract: "A1CurrentAssetTreatmentProjectionTest/v1",
  status: "PASS",
  workspaceSha256: projection.workspaceSha256,
  counts: projection.counts,
  decisions: projection.decisions.map((item) => ({assetId: item.assetId, presentation: item.decision.presentation.mode, art: item.decision.art.selectedTreatment})),
}, null, 2));
