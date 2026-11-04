#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {compileScreenInteractionTimeline} from "../apps/studio-next/src/lib/a1-screen-interaction-timeline-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
const candidates = [];
for (const directory of fs.readdirSync(path.join(root, "work")).filter((name) => name.startsWith("headless-") && name.endsWith("-v1"))) {
  const parent = path.join(root, "work", directory);
  for (const run of fs.readdirSync(parent)) {
    const reportPath = path.join(parent, run, "report.json");
    if (fs.existsSync(reportPath)) candidates.push(reportPath);
  }
}
let selected = null;
for (const reportPath of candidates.sort().reverse()) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.shotId !== "ED-24") continue;
  const shot = plan.shots.find((item) => item.shotId === report.shotId);
  if (!shot) continue;
  try {
    const timeline = compileScreenInteractionTimeline({durationMs: report.authorityDurationMs || report.output.durationMs, actionId: shot.execution.actionId, actionContract: shot.authority.actionContract, screenActions: shot.execution.screenActions || [], events: report.events || [], cursorTelemetry: report.cursorTelemetry, domTargets: report.domTargets || [], pointerTargets: report.pointerTargets || []});
    if (timeline.status === "PASS") { selected = {reportPath, report, shot, timeline}; break; }
  } catch {}
}
assert.ok(selected, "real-headless-report-compatible-with-interaction-timeline-required");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-interaction-cap-test-"));
try {
  const report = structuredClone(selected.report);
  report.cursorPixelPolicy = "SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY";
  report.storyboardBinding = {...report.storyboardBinding, workspaceSha256: plan.source.workspaceSha256, versionId: selected.shot.authority.versionId, revisionSha256: selected.shot.authority.revisionSha256, cameraRecipeSha256: selected.shot.execution.cameraRecipe.recipeSha256};
  const reportPath = path.join(tempRoot, "report.json"), outputProject = path.join(tempRoot, "project.cap");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const run = spawnSync(process.execPath, [path.join(root, "scripts/build-cap-project-from-background-capture-v1.mjs"), reportPath, outputProject], {cwd: root, encoding: "utf8", maxBuffer: 1_000_000});
  if (run.status !== 0) throw new Error(run.stderr || run.stdout);
  const receipt = JSON.parse(fs.readFileSync(path.join(outputProject, "a1-background-receipt.json"), "utf8"));
  const timeline = JSON.parse(fs.readFileSync(path.join(outputProject, "a1-interaction-timeline.json"), "utf8"));
  const config = JSON.parse(fs.readFileSync(path.join(outputProject, "project-config.json"), "utf8"));
  assert.equal(timeline.status, "PASS");
  assert.equal(receipt.interactionTimeline.timelineSha256, timeline.timelineSha256);
  assert.equal(config.timeline.zoomSegments.length, timeline.camera.length);
  assert.equal(config.timeline.zoomSegments[0].targetInteractionId, timeline.camera[0].targetInteractionId);
  assert.equal(timeline.generatedActors.length, 0);
  assert.equal(receipt.interactionComposite.decorativeFrames, 0);
  assert.equal(receipt.cursorTelemetry.visibleInFinal, false);
  assert.equal(config.cursor.size, 0);
  assert.equal(receipt.directorFamily.id, timeline.directorFamily.id);
  assert.equal(config.background.padding, receipt.canvasPolicy.padding);
  assert.equal(timeline.coveragePlan.status, "PASS");
  assert.equal(timeline.coveragePlan.resultRegionSource, "VERIFIED_PIXEL_DELTA");
  assert.equal(receipt.coveragePlan.coverageSha256, timeline.coveragePlan.coverageSha256);
  assert.equal(receipt.resultRegionProof.contract, "A1VerifiedScreenResultRegion/v1");
  assert.ok(receipt.resultRegionProof.changedPixelCount >= 24);
  console.log(JSON.stringify({status: "PASS", contract: "A1BackgroundCapInteractionTimelineIntegrationTest/v1", selectedGenre: "real-headless-writing-workbench", timelineSha256: timeline.timelineSha256, maximumSyncOffsetMs: timeline.audit.maximumSyncOffsetMs, generatedActorCount: timeline.generatedActors.length, semanticZoomCount: timeline.camera.length, tempArtifactsRemoved: true}, null, 2));
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
