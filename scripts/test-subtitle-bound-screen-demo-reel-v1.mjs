#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "work/current-screen-demo-smooth-cursor-v1");
const manifest = JSON.parse(fs.readFileSync(path.join(outputRoot, "manifest.json"), "utf8"));
const director = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json"), "utf8"));
const currentPhase = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"), "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

assert.equal(manifest.contract, "A1SubtitleBoundScreenDemoReelManifest/v1");
assert.deepEqual(manifest.scenes.map((scene) => scene.shotId), ["ED-02", "ED-03", "ED-27"]);
for (const scene of manifest.scenes) {
  const shot = director.plan.shots.find((item) => item.shotId === scene.shotId);
  assert.ok(shot, `${scene.shotId} director shot required`);
  assert.equal(scene.timelineStartMs, shot.editWindow.startMs);
  assert.equal(scene.timelineEndMs, shot.editWindow.endMs);
  assert.equal(scene.durationMs, shot.editWindow.durationMs);
  assert.deepEqual(scene.cues.map((cue) => cue.id), shot.cueIds);
  assert.ok(scene.cues.every((cue) => cue.startMs >= 0 && cue.endMs <= scene.durationMs));
}

const ed02 = manifest.scenes.find((scene) => scene.shotId === "ED-02");
assert.equal(ed02.playbackRate, 1, "ED-02 must not be accelerated");
const ed03 = manifest.scenes.find((scene) => scene.shotId === "ED-03");
assert.deepEqual(ed03.sourceSegments.map((segment) => segment.kind), ["video", "video", "still"]);
assert.deepEqual(ed03.sourceSegments.map((segment) => [segment.outputStartMs, segment.outputEndMs]), [[0, 1736], [1736, 3946], [3946, 6040]]);
assert.ok(ed03.sourceSegments[0].sourceStartMs > ed03.sourceSegments[1].sourceStartMs, "ED-03 source actions are intentionally reordered to match like-before-dislike narration");
const ed27 = manifest.scenes.find((scene) => scene.shotId === "ED-27");
assert.equal(ed27.playbackRate, 1, "ED-27 real interaction must remain at natural speed");
assert.deepEqual(ed27.sourceSegments.map((segment) => segment.kind), ["still", "video", "still"], "ED-27 must use hold-action-hold instead of repeated-frame slow motion");

for (const scene of manifest.scenes) {
  assert.ok(scene.cursorTrack.length >= 2, `${scene.shotId} cursor track required`);
  assert.equal(scene.cursorTrack[0].atMs, 0, `${scene.shotId} cursor track must establish at scene start`);
  assert.equal(scene.cursorTrack.at(-1).atMs, scene.durationMs, `${scene.shotId} cursor track must cover the full scene`);
  assert.ok(["DOM_REGION_RECONSTRUCTED", "CAPTURED_POINTER_EVENT"].includes(scene.cursorBinding.mode), `${scene.shotId} cursor provenance mode required`);
  assert.match(scene.cursorBinding.sourceSha256, /^[a-f0-9]{64}$/u, `${scene.shotId} cursor source hash required`);
}
assert.equal(manifest.cursorSystem.contract, "A1IndependentCursorTrack/v1");
assert.equal(manifest.cursorSystem.cursorLayerIndependent, true);
assert.equal(manifest.cursorSystem.capturedEventClaimsAllowedOnlyWhenModeIsCaptured, true);

const outputFile = path.join(root, manifest.output.path);
const contactFile = path.join(root, manifest.contactSheet.path);
const comparisonFile = path.join(root, manifest.comparison.path);
assert.equal(sha256File(outputFile), manifest.output.sha256);
assert.equal(sha256File(contactFile), manifest.contactSheet.sha256);
assert.equal(sha256File(comparisonFile), manifest.comparison.sha256);
assert.equal(manifest.audio.sourceTimelinePreserved, true);
assert.equal(manifest.boundary.userVisualApproval, "NOT_APPROVED");
assert.equal(manifest.boundary.productionAdmission, false);
assert.equal(currentPhase.authority.workspaceSha256, manifest.sourceWorkspaceSha256);
assert.equal(currentPhase.authority.nextAction.id, "review-whole-film-static-board");

console.log(JSON.stringify({status: "PASS", shots: manifest.scenes.map((scene) => scene.shotId), durationMs: manifest.output.durationMs, outputSha256: manifest.output.sha256, timingAuthority: manifest.timingAuthority.kind, userVisualApproval: manifest.boundary.userVisualApproval}, null, 2));
