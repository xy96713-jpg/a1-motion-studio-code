#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ids = ["englishflow-fresh-director-maturity-v1", "lab-vault-fresh-navigation-maturity-v1", "lab-vault-fresh-menu-maturity-v1"];
for (const id of ids) {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, `work/screen-recording-maturity-test-v1/${id}/review-v8/cap-receipt.json`), "utf8"));
  assert.equal(receipt.status, "PASS", id);
  assert.equal(receipt.feedback.cameraPolicy, "ACTION_FIRST_CAMERA_SUPPRESSED", id);
  assert.equal(receipt.camera.semanticZoomCount, 0, id);
  assert.equal(receipt.reviewVideo.fullDecodePass, true, id);
  assert.ok(receipt.executionEffects.every((effect) => effect.execution !== "UNAVAILABLE"), id);
}
console.log(JSON.stringify({contract: "A1GenericCapActionFirstPolicyTest/v1", status: "PASS", tasks: ids, cameraSuppressedWhenActionPrimary: true, sourceActionPreserved: true}, null, 2));
