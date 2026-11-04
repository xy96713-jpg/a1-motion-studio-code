#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertScreenPackagingProgram,
  compileScreenPackagingProgram,
} from "../apps/studio-next/src/lib/a1-screen-packaging-program-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "apps/studio-next/src/data/video-shotcraft-catalog-v1.json"), "utf8"),
);
const fixture = (id, order, genre, {dense = true, edge = true, region = true} = {}) => ({
  contract: "A1NormalizedScreenShotFixture/v1",
  shotId: id,
  order,
  genre,
  intentId: dense ? "document-writing" : "single-click-trigger",
  durationMs: 6200,
  actionAtMs: 2500,
  resultAtMs: 4100,
  resultText: dense
    ? "这是一段需要观众阅读并确认的结果文本，包含结论和后续操作。"
    : "操作成功",
  contentDensity: dense ? "DENSE_TEXT" : "STANDARD",
  targetGeometry: true,
  targetCenter: {x: edge ? 0.82 : 0.5, y: 0.44},
  targetRegion: region ? {x: edge ? 0.68 : 0.38, y: 0.28, width: 0.28, height: 0.28} : null,
  nativeActionReadable: true,
  sourceVerified: true,
});

const fixtures = [
  fixture("unseen-tutorial-a", 1, "product-tutorial"),
  fixture("unseen-tutorial-b", 2, "product-tutorial", {dense: false, edge: false, region: true}),
  fixture("unseen-evidence-a", 3, "evidence-explainer"),
  fixture("unseen-evidence-b", 4, "evidence-explainer", {dense: false, edge: false, region: false}),
  fixture("unseen-opinion-a", 5, "personal-opinion"),
  fixture("unseen-opinion-b", 6, "personal-opinion", {dense: false, edge: true, region: false}),
];
const program = assertScreenPackagingProgram(
  compileScreenPackagingProgram({programId: "blind-six", shots: fixtures, catalog}),
);

assert.equal(program.shots.length, 6);
assert.equal(program.sequence.totalBeatCount, 30);
assert.ok(program.sequence.distinctAdapterCount >= 2);
assert.ok(program.sequence.maximumConsecutiveSameAdapter <= 2);
assert.ok(
  program.shots.every(
    (item) => item.beats.map((beat) => beat.id).join(",") === "ESTABLISH,ACTION,FEEDBACK,RESULT,READ",
  ),
);
assert.ok(program.shots.every((item) => item.reading.holdMs >= 1000));
assert.ok(
  program.shots
    .filter((item) => item.contentDensity === "DENSE_TEXT")
    .every(
      (item) =>
        item.reading.holdMs >
        program.shots.find((row) => row.contentDensity === "STANDARD").reading.holdMs,
    ),
);
assert.equal(program.sequence.allPageCamTreatmentsCinematic, true);
const pageCamShots = program.shots.filter(
  (item) => item.resultTreatment.adapterId === "A1_VIDEO_PAGE_CAM_V1",
);
assert.ok(pageCamShots.length >= 1);
assert.ok(
  pageCamShots.every(
    (item) =>
      item.resultTreatment.cameraPlan.camera.curve === "MINIMUM_JERK" &&
      item.resultTreatment.cameraPlan.camera.autoZoomOut === false &&
      item.resultTreatment.cameraPlan.temporalBlur.mode === "VELOCITY_ADAPTIVE_TEMPORAL_SAMPLING" &&
      item.resultTreatment.cameraPlan.temporalBlur.endpointsSharp === true,
  ),
);

console.log(
  JSON.stringify(
    {
      contract: "A1ScreenPackagingProgramTest/v2",
      status: "PASS",
      fixtureCount: fixtures.length,
      genres: [...new Set(fixtures.map((item) => item.genre))],
      shotCount: program.shots.length,
      beatCount: program.sequence.totalBeatCount,
      adapterCounts: program.sequence.adapterCounts,
      distinctAdapterCount: program.sequence.distinctAdapterCount,
      maximumConsecutiveSameAdapter: program.sequence.maximumConsecutiveSameAdapter,
      readingHoldSolved: true,
      runtimeBindingsVerified: true,
      cinematicPageCamProfiles: pageCamShots.length,
      velocityAdaptiveTemporalBlur: true,
    },
    null,
    2,
  ),
);
