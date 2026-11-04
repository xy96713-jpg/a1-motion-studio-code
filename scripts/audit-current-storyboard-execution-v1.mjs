#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const outputRoot = path.join(root, "work/current-hyperframes-storyboard-execution-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const workspace = readJson(workspacePath);
const meta = readJson(path.join(outputRoot, "hyperframes.json"));
const manifest = readJson(path.join(outputRoot, "execution-manifest.json"));
const index = fs.readFileSync(path.join(outputRoot, "index.html"), "utf8");
const authority = workspace.production?.shotIntelligence?.currentStoryboardAuthority;
const shots = manifest.shots || [];
const compositions = manifest.compositions || [];

assert.equal(authority?.contract, "A1CurrentStoryboardAuthority/v1");
assert.equal(authority?.current, true);
assert.equal(meta.entry, "index.html");
assert.equal(meta.compositionId, "a1-current-storyboard");
assert.equal(meta.reviewOnly, true);
assert.equal(meta.sourceAuthoritySha256, workspace.workspaceSha256);
assert.equal(manifest.source.workspaceSha256, workspace.workspaceSha256);
assert.equal(shots.length, 34);
assert.equal(compositions.length, 34);
assert.equal(new Set(shots.map((shot) => shot.shotId)).size, 34);
assert.equal(new Set(compositions.map((shot) => shot.compositionId)).size, 34);
assert.equal(manifest.timeline.rootCompositionId, meta.compositionId);
assert.equal(manifest.timeline.fps, meta.fps);
assert.equal(manifest.render.status, "LOCKED_UNTIL_USER_APPROVAL");
assert.equal(manifest.render.command, "npx hyperframes render --quality high --output out.mp4");

let previousEnd = -1;
for (const shot of shots) {
  assert.match(shot.shotId, /^ED-\d{2}$/u);
  assert.equal(typeof shot.actionContract.before, "string");
  assert.equal(typeof shot.actionContract.hold, "string");
  assert.equal(typeof shot.actionContract.after, "string");
  assert.equal(typeof shot.actionContract.handoff, "string");
  assert.ok(shot.timeRange.startMs >= previousEnd, `${shot.shotId}: timeline-overlap`);
  assert.equal(shot.timeRange.endMs - shot.timeRange.startMs, shot.timeRange.durationMs);
  previousEnd = shot.timeRange.endMs;
  const composition = compositions.find((item) => item.shotId === shot.shotId);
  assert.ok(composition, `${shot.shotId}: composition-missing`);
  assert.equal(composition.startMs, shot.timeRange.startMs);
  assert.equal(composition.durationMs, shot.timeRange.durationMs);
  const compositionPath = path.join(outputRoot, composition.source);
  assert.equal(fs.existsSync(compositionPath), true, `${shot.shotId}: composition-file-missing`);
  const html = fs.readFileSync(compositionPath, "utf8");
  assert.match(html, new RegExp(`data-a1-shot-id="${shot.shotId}"`, "u"));
  assert.match(index, new RegExp(`data-composition-src="compositions/${shot.shotId.toLowerCase()}\\.html"`, "u"));
}

assert.equal(sha256File(workspacePath), manifest.source.workspaceFileSha256);
console.log(JSON.stringify({
  status: "PASS",
  contract: "A1CurrentStoryboardExecutionAudit/v1",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  shotCount: shots.length,
  compositionCount: compositions.length,
  timelineDurationMs: manifest.timeline.durationMs,
  hyperframesCheck: "REQUIRED_SEPARATE_COMMAND",
  renderStatus: manifest.render.status,
  reviewOnly: meta.reviewOnly,
}, null, 2));
