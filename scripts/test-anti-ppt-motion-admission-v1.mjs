#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {assertAntiPptMotionDirection, assertAntiPptMotionIr, auditMotionDirectionPlan, auditMotionIrAgainstDirection} from "../apps/studio-next/src/lib/a1-anti-ppt-motion-admission-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const directionPlan = JSON.parse(fs.readFileSync(path.join(root, "work/first-episode-motion-direction-v1/plan.json"), "utf8"));
assert.equal(auditMotionDirectionPlan(directionPlan).status, "PASS");
assert.doesNotThrow(() => assertAntiPptMotionDirection(directionPlan));

const scene = (sceneId, id, role, semanticJob, property, from, to, startFrame, endFrame) => ({
  contract: "A1MotionIRScene/v2",
  sceneId,
  actors: [{id, role, semanticJob, propertyTracks: [{property, from, to, startFrame, endFrame}]}],
});
const goodCanary = {
  contract: "A1MotionIRPreviewSet/v1",
  scenes: [
    scene("ED-01", "glyph-plane", "title-glyph", "assemble-approved-glyph-planes", "clip", 0, 1, 0, 18),
    scene("ED-10", "stamp-head", "verdict-tool", "strike-waste-verdict", "y", -42, 0, 8, 17),
    scene("ED-17", "conveyor-material", "process-object", "move-material-through-angle-selector", "x", -180, 260, 4, 70),
    scene("ED-20", "source-selection", "verified-source-region", "focus-real-source-selection", "clip", 0, 1, 10, 24),
    scene("ED-31", "control-window", "job-bound-window", "open-and-lock-control-state", "clip", 0, 1, 5, 22),
  ],
};
assert.equal(auditMotionIrAgainstDirection(goodCanary, directionPlan).status, "PASS");
assert.doesNotThrow(() => assertAntiPptMotionIr(goodCanary, directionPlan));

const repeatedSlide = {
  contract: "A1MotionIRPreviewSet/v1",
  scenes: ["ED-01", "ED-10", "ED-17"].map((sceneId) => scene(sceneId, "whole-frame-slide", "deck-page", "show-next-card", "x", 960, 0, 0, 18)),
};
const repeatedAudit = auditMotionIrAgainstDirection(repeatedSlide, directionPlan);
assert.equal(repeatedAudit.status, "FAIL");
assert.ok(repeatedAudit.failures.some((failure) => failure.startsWith("ppt-like-actor:")));
assert.ok(repeatedAudit.failures.some((failure) => failure.startsWith("repeated-generic-entrance:")));
assert.throws(() => assertAntiPptMotionIr(repeatedSlide, directionPlan), /anti-ppt-motion-ir-rejected/);

const corruptedDirection = structuredClone(directionPlan);
corruptedDirection.scenes[0].motionPrimitive = "whole-frame-slide-in";
assert.equal(auditMotionDirectionPlan(corruptedDirection).status, "FAIL");

console.log(JSON.stringify({status: "PASS", contract: "A1AntiPptMotionAdmissionTest/v1", currentDirectionAccepted: true, semanticCanaryAccepted: true, wholeFrameSlideRejected: true, repeatedGenericEntranceRejected: true, presenterAndEvidenceIntegrityEnforced: true}, null, 2));
