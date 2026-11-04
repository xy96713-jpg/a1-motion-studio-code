#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  compileChoreographySceneToMotionIrScene,
  compileMotionIrSceneToHyperframes,
  evaluateHyperframesPlanAtFrame,
  evaluateMotionIrSceneAtFrame,
} from "../lib/a1-motion-ir-parity-v1.js";
import {buildMotionIrV2, validateMotionIrV2} from "../lib/storyboard-motion-ir-v2.js";

const root = process.cwd();
const candidatePath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json");
const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
const sourceScene = candidate.scenes.find((scene) => scene.beatId === "H01-B01");
assert(sourceScene, "H01-B01 source scene is required");

const scene = compileChoreographySceneToMotionIrScene(sourceScene, candidate.fps);
assert.equal(scene.contract, "A1MotionIRScene/v2");
assert.equal(scene.sourceMotionContract, "A1MotionChoreography/v1");
assert.equal(scene.actors.length, 5);
assert.equal(scene.actors.reduce((sum, actor) => sum + actor.propertyTracks.length, 0), 30);
assert.deepEqual(scene.actors.find((actor) => actor.id === "subject")?.easing, [0.34, 0, 0.64, 1], "explicit curve profile must override a hidden interpreter lookup");

const hyperframes = compileMotionIrSceneToHyperframes(scene);
assert.equal(hyperframes.promotedRender, false);
assert.equal(hyperframes.tweens.length, scene.actors.length);

for (const frame of [0, 28, 42, 96, 154]) {
  assert.deepEqual(evaluateHyperframesPlanAtFrame(hyperframes, frame), evaluateMotionIrSceneAtFrame(scene, frame));
}

const projectIr = buildMotionIrV2({
  fps: candidate.fps,
  scenes: [{...sourceScene, id: sourceScene.beatId, frameDuration: sourceScene.durationInFrames, duration: sourceScene.durationInFrames / candidate.fps}],
});
assert.equal(projectIr.scenes[0].actorPlanContract, "A1MotionChoreography/v1");
assert.equal(projectIr.scenes[0].actors.length, 5);
assert.equal(validateMotionIrV2(projectIr).ok, true);

const invalidIr = structuredClone(projectIr);
invalidIr.scenes[0].actors[0].propertyTracks[0].property = "unsupported";
assert.equal(validateMotionIrV2(invalidIr).ok, false);

console.log(JSON.stringify({
  status: "PASS",
  sceneId: scene.sceneId,
  actorCount: scene.actors.length,
  propertyTrackCount: scene.actors.reduce((sum, actor) => sum + actor.propertyTracks.length, 0),
  checkedFrames: [0, 28, 42, 96, 154],
}, null, 2));
