#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const shots = workspace.production.shotIntelligence.currentStoryboardAuthority.shots;
assert.equal(shots.length, 34);
const required = ["before", "hold", "after", "handoff"];
const incomplete = shots.flatMap((shot) => {
  const missing = required.filter((key) => !String(shot.actionContract?.[key] || "").trim());
  return missing.length ? [{shotId: shot.shotId, missing}] : [];
});
assert.deepEqual(incomplete, [], `current-storyboard-action-contract-incomplete:${JSON.stringify(incomplete)}`);
for (let index = 0; index < shots.length - 1; index += 1) {
  assert.match(shots[index].actionContract.handoff, new RegExp(`^${shots[index + 1].shotId}(?:_|$)`, "u"), `storyboard-handoff-target-drift:${shots[index].shotId}`);
}
assert.match(shots.at(-1).actionContract.handoff, /^END(?:_|$)/u);
console.log(JSON.stringify({status: "PASS", contract: "A1CurrentStoryboardCompleteActionContractTest/v1", shotCount: shots.length}, null, 2));
