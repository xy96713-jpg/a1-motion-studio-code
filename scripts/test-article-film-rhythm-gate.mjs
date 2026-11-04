import assert from "node:assert/strict";
import { buildArticleFilmRhythmGate, validateArticleFilmRhythmGate } from "../lib/storyboard-article-film-rhythm-gate.js";

function scene(id, templateId, composition, role, options = {}) {
  return {
    id,
    templateId,
    layoutPrimitive: { composition },
    narrative: { storyRole: role },
    visualScale: options.visualScale || "medium",
    shotScale: options.shotScale,
    transition: options.transition || "cut",
    motionDensity: options.motionDensity ?? 0.5,
    type: options.type || "point",
    visualTreatment: { primaryVisualForm: options.form || "editorial-image" },
    assets: options.assets || [],
    assetSlots: options.assetSlots || [],
    styleframeComposer: options.styleframeComposer || {},
  };
}

const verifiedAsset = {
  id: "verified-nasa-photo",
  kind: "photo",
  url: "https://images.nasa.gov/example.jpg",
  renderAllowed: true,
  verifiedForRender: true,
  provenance: { sourceUrl: "https://images.nasa.gov/", license: "NASA media" },
};

const essayFilm = [
  scene("s1", "MagazineLead", "hero-left", "setup", { visualScale: "wide", motionDensity: 0.55, type: "cover" }),
  scene("s2", "EvidenceImage", "image-split", "proof", { visualScale: "close", assets: [verifiedAsset], assetSlots: [{ kind: "real-image", provenanceRequired: true, sourceCandidates: ["NASA"] }] }),
  scene("s3", "ConceptPoster", "center-claim", "problem", { visualScale: "medium", form: "generated-bitmap", motionDensity: 0.6 }),
  scene("s4", "TimelineFlow", "timeline", "method", { visualScale: "wide", transition: "soft-push", motionDensity: 0.56 }),
  scene("s5", "QuoteFocus", "quote-air", "proof", { visualScale: "detail", motionDensity: 0.5 }),
  scene("s6", "ComparisonSplit", "split-contrast", "turn", { visualScale: "wide", transition: "section-wipe", motionDensity: 0.45 }),
  scene("s7", "EvidenceImage", "image-split", "example", { visualScale: "close", assets: [verifiedAsset], assetSlots: [{ kind: "real-image", provenanceRequired: true }] }),
  scene("s8", "EndingCard", "closing-hold", "closing", { visualScale: "medium", motionDensity: 0.22, type: "closing" }),
];

const tutorialFilm = [
  scene("t1", "MagazineLead", "hero-left", "setup", { visualScale: "wide", motionDensity: 0.52, type: "cover" }),
  scene("t2", "TimelineFlow", "timeline", "method", { visualScale: "medium", motionDensity: 0.58 }),
  scene("t3", "DataMap", "data-map", "method", { visualScale: "detail", motionDensity: 0.54 }),
  scene("t4", "EvidenceImage", "image-split", "example", { visualScale: "wide", assets: [verifiedAsset], assetSlots: [{ kind: "webpage-screenshot", provenanceRequired: true }] }),
  scene("t5", "QuoteFocus", "quote-air", "proof", { visualScale: "close", motionDensity: 0.48 }),
  scene("t6", "EndingCard", "closing-hold", "closing", { visualScale: "medium", motionDensity: 0.18, type: "closing" }),
];

for (const [name, scenes] of [["essay", essayFilm], ["tutorial", tutorialFilm]]) {
  const gate = buildArticleFilmRhythmGate(scenes, { articleShape: name });
  const validation = validateArticleFilmRhythmGate(gate, scenes);
  assert.equal(validation.ok, true, `${name} should pass: ${validation.failures.join("; ")}`);
  assert.equal(gate.contract, "A1ArticleFilmRhythmGate/v1");
  assert.equal(gate.shouldRender, true);
  assert.equal(gate.rules.noConsecutiveSameTemplate.ok, true);
  assert.equal(gate.rules.noThreeSamePrimaryComposition.ok, true);
  assert.equal(gate.rules.textOnlyRatio.ok, true);
  assert.equal(gate.rules.scaleChangeEveryThreeToFiveShots.ok, true);
  assert.equal(gate.rules.transitionEffectsOnlyAtSectionTurns.ok, true);
  assert.equal(gate.rules.endingMotionDensityDrops.ok, true);
  assert.equal(gate.rules.realMaterialNoFakeFallback.ok, true);
}

const shortTextOnly = [
  scene("a", "MagazineLead", "center-claim", "setup", { visualScale: "wide", form: "typographic-claim", type: "cover" }),
  scene("b", "EndingCard", "closing-hold", "closing", { visualScale: "close", form: "typographic-resolution", type: "closing", motionDensity: 0.12 }),
];
const shortGate = buildArticleFilmRhythmGate(shortTextOnly, { articleShape: "two-shot-short" });
assert.equal(shortGate.rules.textOnlyRatio.ok, true, `short exception should be explicit: ${JSON.stringify(shortGate.rules.textOnlyRatio)}`);
assert.match(shortGate.rules.textOnlyRatio.exception.reason, /short film/i);

const failing = [
  scene("f1", "CenterTitle", "center-claim", "setup", { visualScale: "medium", form: "typographic-claim", transition: "glitch-wipe", motionDensity: 0.2 }),
  scene("f2", "CenterTitle", "center-claim", "proof", { visualScale: "medium", form: "typographic-claim", motionDensity: 0.3 }),
  scene("f3", "CenterTitle", "center-claim", "method", { visualScale: "medium", form: "typographic-claim", motionDensity: 0.4 }),
  scene("f4", "CenterTitle", "center-claim", "closing", {
    visualScale: "medium",
    form: "fake-browser",
    transition: "spin-blur",
    motionDensity: 0.9,
    type: "closing",
    assetSlots: [{ kind: "webpage-screenshot", sourceCandidates: ["official product page"], provenanceRequired: true }],
    styleframeComposer: { template: "fake-browser-card", placeholder: true },
  }),
];
const badGate = buildArticleFilmRhythmGate(failing, { articleShape: "diagnostic" });
assert.equal(badGate.shouldRender, false, "failing gate should block render promotion");
const diagnostics = badGate.diagnostics.join("\n");
for (const expected of [
  "consecutive template",
  "three-shot composition",
  "text-only ratio",
  "scale change",
  "effect transition",
  "ending motion density",
  "real material",
]) {
  assert.match(diagnostics, new RegExp(expected, "i"), `missing diagnostic for ${expected}: ${diagnostics}`);
}

console.log("Article film rhythm gate tests passed.");
