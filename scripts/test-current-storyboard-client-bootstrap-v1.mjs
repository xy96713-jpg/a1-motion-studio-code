#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {prepareWorkbenchPackagingClientSnapshot} from "../apps/studio-next/src/lib/a1-workbench-client-snapshot-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const snapshot = prepareWorkbenchPackagingClientSnapshot(workspace);
const authority = snapshot.production?.shotIntelligence?.currentStoryboardAuthority;
const timelineItems = snapshot.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.items;

assert.equal(authority?.contract, "A1CurrentStoryboardAuthority/v1");
assert.equal(authority?.shots?.length, 34);
assert.equal(timelineItems?.length, 34);
assert.deepEqual(authority.shots.map((shot) => shot.shotId), timelineItems.map((item) => item.shotId));
assert.equal(snapshot.workspaceSha256, workspace.workspaceSha256);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1CurrentStoryboardClientBootstrapTest/v1",
  workspaceSha256: snapshot.workspaceSha256,
  shotCount: authority.shots.length,
  timelineItemCount: timelineItems.length,
}, null, 2));
