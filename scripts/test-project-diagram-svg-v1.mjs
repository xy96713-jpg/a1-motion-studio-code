#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileProjectDiagramSvgV1} from "../apps/studio-next/src/lib/a1-project-diagram-svg-v1.mjs";
import {RETRO_PIXEL_FONT_MANIFEST} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const font = RETRO_PIXEL_FONT_MANIFEST.find((item) => item.assetId === "type-pixel-correction");
const fontPath = path.join(root, "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf");
const fontSha256 = sha256(fs.readFileSync(fontPath));
assert.equal(fontSha256, font.sha256, "diagram geometry test must use the pinned local font");
const numbersFromPath = (d) => [...d.matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/giu)].map((match) => Number(match[0]));
function quadraticArcMidpoint(d) {
  const values = numbersFromPath(d);
  assert.equal(values.length, 6, "labeled adjacent edges use a quadratic connector");
  const [sx, sy, cx, cy, ex, ey] = values;
  const samples = Array.from({length: 513}, (_, index) => {
    const t = index / 512, q = 1 - t;
    return {x: q * q * sx + 2 * q * t * cx + t * t * ex, y: q * q * sy + 2 * q * t * cy + t * t * ey};
  });
  const lengths = samples.slice(1).map((point, index) => Math.hypot(point.x - samples[index].x, point.y - samples[index].y));
  const halfLength = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let elapsed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (elapsed + lengths[index] >= halfLength) {
      const t = lengths[index] > 0 ? (halfLength - elapsed) / lengths[index] : 0;
      return {x: samples[index].x + (samples[index + 1].x - samples[index].x) * t, y: samples[index].y + (samples[index + 1].y - samples[index].y) * t};
    }
    elapsed += lengths[index];
  }
  return samples.at(-1);
}
function distanceToRect(point, rect) {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}
const rectsOverlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const sourceText = "The article says these corals can increase regional biodiversity";
const diagramSpec = {
  contract: "A1DeterministicDiagramSpec/v1",
  kind: "causal",
  nodes: [
    {id: "corals-can-increase", label: "these corals can increase"},
    {id: "regional-biodiversity", label: "regional biodiversity"},
  ],
  edges: [{from: "corals-can-increase", to: "regional-biodiversity", relation: "causes"}],
};
for (const node of diagramSpec.nodes) assert.ok(sourceText.includes(node.label), `diagram-label-not-source-bound:${node.id}`);

const compiled = compileProjectDiagramSvgV1({
  diagramSpec,
  sourceText,
  sourceTextSha256: sha256(sourceText),
  sourceEvidenceIds: ["noaa-claim-fixture"],
  fontPath,
  fontSha256,
});
assert.equal(compiled.status, "READY_FOR_REVIEW_ONLY");
assert.equal(compiled.productionAdmission, false);
assert.doesNotMatch(compiled.svgMarkup, /<rect\b|<image\b/iu, "diagram SVG remains a transparent overlay");

const edge = [...compiled.svgMarkup.matchAll(/<path data-relation="([^"]+)" data-from="([^"]+)" data-to="([^"]+)" d="([^"]+)"[^>]*>/gu)];
assert.equal(edge.length, 1, "one causal relation must yield one connector");
assert.equal(edge[0][1], "causes");
assert.equal(edge[0][2], "corals-can-increase");
assert.equal(edge[0][3], "regional-biodiversity");
const coordinateValues = [...edge[0][4].matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/giu)].map((match) => Number(match[0]));
assert.equal(coordinateValues.length, 6, "causal edge should be a single quadratic curve");
const [startX, startY, _controlX, _controlY, endX, endY] = coordinateValues;
const source = compiled.nodeLayout.find((node) => node.id === "corals-can-increase");
const target = compiled.nodeLayout.find((node) => node.id === "regional-biodiversity");
assert.ok(source && target);
const close = (actual, expected) => Math.abs(actual - expected) <= .02;
const sourceClearancePx = startX - source.glyphBounds.right;
const targetClearancePx = target.glyphBounds.left - endX;
assert.ok(close(sourceClearancePx, 18), "connector start must keep the prescribed gap from the source glyph bounds");
assert.ok(close(startY, source.baseline), "connector start Y must follow the rendered source glyph baseline");
assert.ok(close(targetClearancePx, 18), "arrow tip must keep the prescribed gap from the target glyph bounds");
assert.ok(close(endY, target.baseline), "arrow tip Y must follow the rendered target glyph baseline");
assert.ok(sourceClearancePx > 0 && targetClearancePx > 0, "connector endpoints must not overlap either glyph bound");
assert.ok(endX - startX >= 80, "connector gap must leave usable whitespace between labels");
assert.ok(compiled.nodeLayout.every((node) => node.glyphBounds.left >= 0 && node.glyphBounds.right <= compiled.width
  && node.glyphBounds.top >= 0 && node.glyphBounds.bottom <= compiled.height), "actual glyph bounds must remain inside the canvas");
assert.match(compiled.svgMarkup, /stroke-linecap="butt"/u, "connector strokes must not project through label geometry");
assert.match(compiled.svgMarkup, /<marker\b[^>]*refX="10"/u, "arrow marker tip must land exactly on its path endpoint");

const labelledSourceText = "These corals can increase biodiversity by creating complex 3D structures.";
const labelledSpec = {
  contract: "A1DeterministicDiagramSpec/v1",
  kind: "sequence",
  nodes: [
    {id: "corals", label: "corals"},
    {id: "structures", label: "structures"},
    {id: "biodiversity", label: "biodiversity"},
  ],
  edges: [
    {from: "corals", to: "structures", relation: "causes", label: "creating"},
    {from: "structures", to: "biodiversity", relation: "supports", label: "can increase"},
  ],
};
for (const node of labelledSpec.nodes) assert.ok(labelledSourceText.includes(node.label), `edge-label-fixture-node-not-source-bound:${node.id}`);
for (const edge of labelledSpec.edges) assert.ok(labelledSourceText.includes(edge.label), `edge-label-not-source-bound:${edge.label}`);
const labelledCompiled = compileProjectDiagramSvgV1({
  diagramSpec: labelledSpec,
  sourceText: labelledSourceText,
  sourceTextSha256: sha256(labelledSourceText),
  sourceEvidenceIds: ["fixture-paragraph-1"],
  fontPath,
  fontSha256,
});
assert.equal(labelledCompiled.status, "READY_FOR_REVIEW_ONLY");
assert.equal(labelledCompiled.productionAdmission, false);
assert.deepEqual(labelledCompiled.visibleEdgeLabels, ["creating", "can increase"]);
assert.equal(labelledCompiled.edgeLabelLayout.length, labelledSpec.edges.length);
assert.match(labelledCompiled.svgMarkup, /data-a1-diagram-edge-labels="exact-source-substrings"/u);
assert.match(labelledCompiled.svgMarkup, /data-diagram-edge-label-id="edge-0"/u);
assert.match(labelledCompiled.svgMarkup, /data-diagram-edge-label-id="edge-1"/u);
assert.doesNotMatch(labelledCompiled.svgMarkup, /<text\b|<rect\b|<image\b/iu, "edge copy remains outlined vector on a transparent SVG");
for (const edgeLabel of labelledCompiled.edgeLabelLayout) {
  assert.ok(edgeLabel.glyphBounds.left >= 8 && edgeLabel.glyphBounds.right <= labelledCompiled.width - 8
    && edgeLabel.glyphBounds.top >= 8 && edgeLabel.glyphBounds.bottom <= labelledCompiled.height - 8,
  `edge-label-within-canvas:${edgeLabel.label}`);
  for (const node of labelledCompiled.nodeLayout) {
    const intersects = edgeLabel.glyphBounds.left < node.glyphBounds.right && edgeLabel.glyphBounds.right > node.glyphBounds.left
      && edgeLabel.glyphBounds.top < node.glyphBounds.bottom && edgeLabel.glyphBounds.bottom > node.glyphBounds.top;
    assert.equal(intersects, false, `edge-label-must-not-cover-endpoint:${edgeLabel.label}:${node.id}`);
  }
  const connectorMatch = [...labelledCompiled.svgMarkup.matchAll(new RegExp(`<path data-relation="[^"]+" data-from="${edgeLabel.from}" data-to="${edgeLabel.to}" d="([^"]+)"`, "gu"))][0];
  assert.ok(connectorMatch, `edge-label-connector-required:${edgeLabel.from}:${edgeLabel.to}`);
  const measuredMidpoint = quadraticArcMidpoint(connectorMatch[1]);
  const midpointDrift = Math.hypot(edgeLabel.midpoint.x - measuredMidpoint.x, edgeLabel.midpoint.y - measuredMidpoint.y);
  assert.ok(midpointDrift <= 1, `edge-label-anchor-must-use-own-path-midpoint:${edgeLabel.label}:${midpointDrift}`);
  const anchorDistance = Math.hypot(edgeLabel.anchor.x - measuredMidpoint.x, edgeLabel.anchor.y - measuredMidpoint.y);
  assert.ok(anchorDistance < 160, `edge-label-must-stay-near-own-connector:${edgeLabel.label}:${anchorDistance}`);
  const pathValues = numbersFromPath(connectorMatch[1]);
  const [sx, sy, cx, cy, ex, ey] = pathValues;
  const pathSamples = Array.from({length: 257}, (_, index) => {
    const t = index / 256, q = 1 - t;
    return {x: q * q * sx + 2 * q * t * cx + t * t * ex, y: q * q * sy + 2 * q * t * cy + t * t * ey};
  });
  const lineClearance = Math.min(...pathSamples.map((point) => distanceToRect(point, edgeLabel.glyphBounds)));
  assert.ok(lineClearance >= 8, `edge-label-must-not-cover-own-connector:${edgeLabel.label}:${lineClearance}`);
}
for (let left = 0; left < labelledCompiled.edgeLabelLayout.length; left += 1) for (let right = left + 1; right < labelledCompiled.edgeLabelLayout.length; right += 1) {
  assert.equal(rectsOverlap(labelledCompiled.edgeLabelLayout[left].glyphBounds, labelledCompiled.edgeLabelLayout[right].glyphBounds), false, "edge labels must not overlap each other");
}
const legacySpec = structuredClone(labelledSpec);
legacySpec.edges.forEach((edge) => delete edge.label);
const legacyCompiled = compileProjectDiagramSvgV1({diagramSpec: legacySpec, sourceText: labelledSourceText, sourceTextSha256: sha256(labelledSourceText), fontPath, fontSha256});
assert.equal(legacyCompiled.status, "READY_FOR_REVIEW_ONLY", "legacy specs without edge labels remain accepted");
assert.deepEqual(legacyCompiled.visibleEdgeLabels, []);
const invalidEdgeLabelSpec = structuredClone(labelledSpec);
invalidEdgeLabelSpec.edges[0].label = "not an exact source substring";
const invalidEdgeLabel = compileProjectDiagramSvgV1({diagramSpec: invalidEdgeLabelSpec, sourceText: labelledSourceText, sourceTextSha256: sha256(labelledSourceText), fontPath, fontSha256});
assert.equal(invalidEdgeLabel.status, "BLOCKED");
assert.ok(invalidEdgeLabel.failures.includes("DIAGRAM_EDGE_LABEL_NOT_IN_SOURCE_COPY"));
const overlongEdgeLabel = "creating ".repeat(40).trim();
const edgeLabelBoundarySource = `a ${overlongEdgeLabel} b`;
const edgeLabelBoundarySpec = {
  contract: "A1DeterministicDiagramSpec/v1",
  kind: "sequence",
  nodes: [{id: "a", label: "a"}, {id: "b", label: "b"}],
  edges: [{from: "a", to: "b", relation: "causes", label: overlongEdgeLabel}],
};
const edgeLabelBoundary = compileProjectDiagramSvgV1({diagramSpec: edgeLabelBoundarySpec, sourceText: edgeLabelBoundarySource,
  sourceTextSha256: sha256(edgeLabelBoundarySource), fontPath, fontSha256, width: 640, height: 360});
assert.equal(edgeLabelBoundary.status, "BLOCKED", "out-of-canvas edge labels must fail closed instead of clipping");
assert.ok(edgeLabelBoundary.failures.includes("DIAGRAM_EDGE_LABEL_LAYOUT_BLOCKED"));

console.log(JSON.stringify({
  contract: "A1ProjectDiagramSvgGeometryTest/v1",
  status: "PASS",
  svgSha256: compiled.svgSha256,
  connectorPath: edge[0][4],
  sourceBoundLabels: true,
  connectorStartAndEndUseGlyphBaseline: true,
  connectorEndpointsClearGlyphBounds: true,
  sourceClearancePx: Number(sourceClearancePx.toFixed(2)),
  targetClearancePx: Number(targetClearancePx.toFixed(2)),
  interLabelGapPx: Number((endX - startX).toFixed(2)),
  glyphBoundsWithinCanvas: true,
  transparentSvg: true,
  visibleEdgeLabels: labelledCompiled.visibleEdgeLabels,
  edgeLabelSvgSha256: labelledCompiled.svgSha256,
  edgeLabelPlacements: labelledCompiled.edgeLabelLayout.map((label) => ({
    label: label.label,
    midpoint: {x: Number(label.midpoint.x.toFixed(2)), y: Number(label.midpoint.y.toFixed(2))},
    anchor: {x: Number(label.anchor.x.toFixed(2)), y: Number(label.anchor.y.toFixed(2))},
    pathDistancePx: Number(label.pathDistance.toFixed(2)),
    normalOffsetPx: Number(label.normalOffset.toFixed(2)),
  })),
  legacyUnlabelledSpecAccepted: legacyCompiled.status === "READY_FOR_REVIEW_ONLY",
  invalidEdgeLabelRejected: invalidEdgeLabel.status === "BLOCKED",
  outOfCanvasEdgeLabelRejected: edgeLabelBoundary.status === "BLOCKED",
  productionAdmission: false,
}, null, 2));
