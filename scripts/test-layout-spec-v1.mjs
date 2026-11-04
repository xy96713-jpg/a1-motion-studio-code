#!/usr/bin/env node
// Regression for A1LayoutSpec/v1 — proves the mechanical checks fire on the
// exact amateur mistakes we shipped before, and stay quiet on a clean layout.
import assert from "node:assert/strict";
import {SPEC, gridLine, gridRightEdge, gridSpanWidth, headlineSizeFor, presenterSideCenter, validateLayout} from "./lib/a1-layout-spec-v1.mjs";

// --- geometry -------------------------------------------------------------
assert.equal(gridLine(0), 96, "column 0 sits on the 96 safe edge");
assert.ok(Math.abs(gridRightEdge() - 1824) < 0.01, "last column right edge closes on the 1824 safe edge");
assert.ok(Math.abs(gridSpanWidth(12) - 1728) < 0.01, "full 12-col span equals content width");

// --- headline size tier (7 chars is our ED-01 headline) -------------------
assert.equal(headlineSizeFor(7), 96, "7-char headline -> 96 tier");
assert.equal(headlineSizeFor(4), 120, "<=6 chars -> 120 tier");
assert.equal(headlineSizeFor(10), 96, "10 chars -> 96 tier");

// --- presenter-side placement: our presenter is centre-right ---------------
const presenter = {subject: {x: 633, y: 381, w: 767, h: 699}, face: {x: 780, y: 381, w: 330, h: 280}};
const side = presenterSideCenter(presenter, 700);
assert.equal(side.onLeft, true, "subject centre right of frame -> group goes left");
assert.equal(side.sideCenterX, 480, "left half centre is x=480");
assert.ok(side.x >= SPEC.safeArea, "placed group stays inside the safe edge");

// --- CLEAN layout passes --------------------------------------------------
// headline on the 96 safe edge, group centre 42px off the half-frame centre
// (inside the 48px tolerance) and clear of the face-safe box.
const clean = validateLayout({
  elements: [
    {id: "headline", kind: "type", tier: "hero", role: "headline", fontSize: 96,
     box: {x: 96, y: 460, w: 684, h: 130}, groupGap: 32, outerGap: 96},
  ],
  presenter,
  centering: {actualCenterX: 438, targetCenterX: 480},
});
assert.equal(clean.status, "SPEC_PASS", `clean layout should pass, got ${JSON.stringify(clean.failures)}`);

// --- the actual mistakes we shipped, each must be caught -------------------
// 1. subtitle/title crammed against the frame edge
const edge = validateLayout({elements: [{id: "t", kind: "type", tier: "hero", fontSize: 96, box: {x: 20, y: 400, w: 700, h: 130}}]});
assert.ok(edge.failures.some((f) => f.code === "EDGE_PROXIMITY"), "must flag edge proximity");

// 2. spacing inversion (inner gap larger than the outer margin) — our "two blocks stuck to opposite edges" bug
const inverted = validateLayout({elements: [{id: "g", kind: "block", box: {x: 96, y: 400, w: 1200, h: 300}, groupGap: 400, outerGap: 96}]});
assert.ok(inverted.failures.some((f) => f.code === "SPACING_INVERTED"), "must flag spacing inversion");

// 3. left edge not snapped to any column line — our random hand-picked x
const offGrid = validateLayout({elements: [{id: "t", kind: "type", tier: "hero", fontSize: 96, box: {x: 137, y: 400, w: 700, h: 130}}]});
assert.ok(offGrid.failures.some((f) => f.code === "NOT_ON_GRID"), "must flag non-snapped left edge");

// 4. group box not centred where centring was intended
const offCentre = validateLayout({elements: [{id: "t", kind: "type", tier: "hero", fontSize: 96, box: {x: 160, y: 400, w: 700, h: 130}}],
  centering: {actualCenterX: 700, targetCenterX: 480}});
assert.ok(offCentre.failures.some((f) => f.code === "OFF_CENTER"), "must flag off-centre group");

// 5. annotation frame that fails to enclose its target (the L-bracket that missed the word)
const ann = validateLayout({elements: [{id: "frame", kind: "annotation", box: {x: 200, y: 300, w: 300, h: 200}, targetBox: {x: 160, y: 310, w: 400, h: 180}}]});
assert.ok(ann.failures.some((f) => f.code === "ANNOTATION_MISMATCH"), "must flag annotation not enclosing target");

// 6. type below its tier floor
const small = validateLayout({elements: [{id: "t", kind: "type", tier: "hero", fontSize: 64, box: {x: 160, y: 400, w: 500, h: 100}}]});
assert.ok(small.failures.some((f) => f.code === "TYPE_SIZE_BELOW_TIER"), "must flag hero below its floor");

// 7. two bounding boxes intersecting
const collide = validateLayout({elements: [
  {id: "a", kind: "type", tier: "hero", fontSize: 96, box: {x: 160, y: 400, w: 500, h: 200}},
  {id: "b", kind: "type", tier: "body", fontSize: 44, box: {x: 500, y: 500, w: 400, h: 200}},
]});
assert.ok(collide.failures.some((f) => f.code === "BOX_COLLISION"), "must flag intersecting boxes");

// 8. same-group blocks sharing one backing colour
const sameColour = validateLayout({elements: [
  {id: "chip1", kind: "block", group: "chips", backingColor: "#e8f0ff", box: {x: 160, y: 700, w: 300, h: 80}},
  {id: "chip2", kind: "block", group: "chips", backingColor: "#e8f0ff", box: {x: 160, y: 800, w: 300, h: 80}},
]});
assert.ok(sameColour.failures.some((f) => f.code === "DUPLICATE_BACKING"), "must flag repeated group backing colour");

// 9. two hero treatments in one frame
const twoHero = validateLayout({elements: [
  {id: "h1", kind: "type", tier: "hero", fontSize: 96, box: {x: 160, y: 300, w: 500, h: 200}},
  {id: "h2", kind: "type", tier: "hero", fontSize: 120, box: {x: 160, y: 600, w: 500, h: 200}},
]});
assert.ok(twoHero.failures.some((f) => f.code === "MULTIPLE_HERO"), "must flag multiple hero treatments");

// 10. element entering the presenter's face-safe box
const intoFace = validateLayout({
  elements: [{id: "t", kind: "type", tier: "hero", fontSize: 96, box: {x: 800, y: 420, w: 400, h: 200}}],
  presenter,
});
assert.ok(intoFace.failures.some((f) => f.code === "FACE_SAFETY_VIOLATION"), "must flag face-safe intrusion");

// a deliberate full-bleed element is exempt from the edge rule
const bleed = validateLayout({elements: [{id: "wall", kind: "type", tier: "hero", fontSize: 300, box: {x: -40, y: 400, w: 2000, h: 300}, bleed: true}]});
assert.ok(!bleed.failures.some((f) => f.code === "EDGE_PROXIMITY"), "declared bleed must be exempt");

console.log("A1 layout spec regression PASS");
console.log(JSON.stringify({cleanStatus: clean.status, checks: 10, p1Codes: [...new Set([...edge.failures, ...inverted.failures, ...offGrid.failures, ...offCentre.failures, ...ann.failures, ...small.failures, ...collide.failures, ...sameColour.failures, ...twoHero.failures, ...intoFace.failures].map((f) => f.code))]}, null, 2));
