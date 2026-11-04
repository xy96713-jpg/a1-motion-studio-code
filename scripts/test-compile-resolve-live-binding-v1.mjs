import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-resolve-live-binding-fixture-"));
try {
  const readbackPath = path.join(tempRoot, "synthetic-live-readback.json");
  const outputPath = path.join(tempRoot, "handoff.json");
  fs.writeFileSync(readbackPath, JSON.stringify({status: "LIVE_READBACK", projectId: "synthetic-project", projectName: "fixture-only", timelineId: "synthetic-timeline", timelineName: "fixture-only", timelineSha256: "a".repeat(64), fps: 30, startFrame: 0, endFrame: 7000}));
  const result = spawnSync(process.execPath, ["scripts/compile-resolve-live-binding-v1.mjs", "--readback", readbackPath, "--output", outputPath], {encoding: "utf8"});
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.planStatus, "BOUND_LIVE_TIMELINE");
  assert.equal(report.eventCount, 13);
  const plan = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(plan.events.length, 13);
  assert.equal(plan.events.every((event) => Number.isInteger(event.startFrame) && Number.isInteger(event.endFrame) && event.timelineBinding?.evidence?.source === "RESOLVE_READBACK"), true);
  assert.equal(plan.resolveProjectMutationPerformed, false);
  assert.equal(plan.resolveInsertReady, false);
  assert.equal(plan.resolveInsertAuthorized, false);
  console.log(JSON.stringify({status: "PASS", contract: "A1ResolvePackagingHandoff/v4", syntheticFixtureOnly: true, eventCount: 13, liveReadbackEvidenceRequired: true, productionMutation: false}));
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
