import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { paperEditorialRveQuoteFixture } from "../lib/storyboard-paper-editorial-rve-quote-fixture.js";
import {
  buildPaperEditorialRveQuoteAdapterTimeline,
  rveQuoteCardPropsFromStyleTokens,
  validatePaperEditorialRveQuoteAdapterTimeline,
  wrapperSurfacePropsFromStyleTokens,
} from "../lib/storyboard-paper-editorial-rve-quote-adapter.js";
import { resolveVisualStyleProfile, visualStyleProfileToAdapterTokens } from "../lib/storyboard-visual-style-profile.js";

const timeline = buildPaperEditorialRveQuoteAdapterTimeline(paperEditorialRveQuoteFixture);
const validation = validatePaperEditorialRveQuoteAdapterTimeline(timeline);

assert.equal(validation.ok, true, validation.failures.join("\n"));
assert.equal(timeline.contract, "A1ArticleTemplateTimeline/v1");
assert.equal(timeline.styleProfileId, "paper-editorial");
assert.equal(timeline.visualStyleAdapterTokens.contract, "A1VisualStyleAdapterTokens/v1");
assert.equal(timeline.items.length >= 6 && timeline.items.length <= 10, true);
assert.ok(timeline.items.some((item) => item.selectedSlug === "quote-card"), "fixture must route claim/quote/point beats through RVE quote-card");
assert.ok(timeline.items.some((item) => item.selectedSlug === "end-card"), "fixture must close with a mature ending adapter");

for (const item of timeline.items) {
  assert.equal(item.templateProps.a1StyleAdapterTokens.contract, "A1VisualStyleAdapterTokens/v1");
  assert.equal(item.templateProps.a1StyleAdapterTokens.profileId, timeline.styleProfileId);
  assert.equal(item.templateProps.a1StyleAdapterTokens.cssVars["--a1-style-bg"], "#f6efe3");
  assert.equal(item.templateProps.paperEditorialAdapter.contract, "A1RveQuoteCardPaperEditorialAdapter/v1");
  assert.equal(item.templateProps.paperEditorialAdapter.source.sourcePath, "external/rve-remotion-templates/templates/quote-card.tsx");
  assert.equal(item.templateProps.paperEditorialAdapter.source.license, "MIT");
  assert.equal(item.templateProps.paperEditorialAdapter.skinOnly, true);
  assert.equal(item.templateProps.paperEditorialAdapter.doesNotControl.templateSelection, true);
  assert.equal(item.templateProps.paperEditorialAdapter.componentProps.contract, "A1RveQuoteCardComponentStyleProps/v1");
  assert.equal(item.templateProps.rveQuoteCardStyleProps.backgroundColor, item.templateProps.a1StyleAdapterTokens.cssVars["--a1-style-bg"]);
  assert.equal(item.templateProps.rveQuoteCardStyleProps.textColor, item.templateProps.a1StyleAdapterTokens.cssVars["--a1-style-ink"]);
  assert.equal(item.templateProps.rveQuoteCardStyleProps.accentColor, item.templateProps.a1StyleAdapterTokens.cssVars["--a1-style-accent"]);
  assert.equal(item.templateProps.rveQuoteCardStyleProps.motionScale, Number(item.templateProps.a1StyleAdapterTokens.cssVars["--a1-style-motion-scale"]));
  assert.equal(item.templateProps.a1WrapperSurface.contract, "A1RveQuoteCardWrapperSurface/v1");
  assert.equal(item.templateProps.a1WrapperSurface.background, item.templateProps.a1StyleAdapterTokens.cssVars["--a1-style-bg"]);
  assert.equal(item.templateProps.a1WrapperSurface.textureOpacity, Number(item.templateProps.a1StyleAdapterTokens.cssVars["--a1-style-texture-opacity"]));
}


const slateTokens = visualStyleProfileToAdapterTokens(resolveVisualStyleProfile("ink-slate"));
const slateComponentProps = rveQuoteCardPropsFromStyleTokens(slateTokens);
const slateWrapperProps = wrapperSurfacePropsFromStyleTokens(slateTokens);
assert.equal(slateTokens.profileId, "ink-slate");
assert.notEqual(slateComponentProps.backgroundColor, "#f6efe3", "non-paper profile must not be hardcoded to paper background");
assert.notEqual(slateComponentProps.accentColor, "#c3362b", "non-paper profile must not be hardcoded to paper red");
assert.equal(slateComponentProps.backgroundColor, slateTokens.cssVars["--a1-style-bg"]);
assert.equal(slateComponentProps.accentColor, slateTokens.cssVars["--a1-style-accent"]);
assert.equal(slateWrapperProps.background, slateTokens.cssVars["--a1-style-bg"]);
assert.equal(slateWrapperProps.gridOpacity, Number(slateTokens.cssVars["--a1-style-grid-opacity"]));

const slateFixture = { ...paperEditorialRveQuoteFixture, styleProfileId: "ink-slate" };
const slateTimeline = buildPaperEditorialRveQuoteAdapterTimeline(slateFixture);
assert.deepEqual(slateTimeline.items.map((item) => item.selectedSlug), timeline.items.map((item) => item.selectedSlug), "style profile must not alter selectedSlug/template routing");
assert.deepEqual(slateTimeline.items.map((item) => item.article.storyRole), timeline.items.map((item) => item.article.storyRole), "style profile must not alter article roles");
assert.deepEqual(slateTimeline.items.map((item) => item.assetSlotPlan), timeline.items.map((item) => item.assetSlotPlan), "style profile must not alter asset truth gates");
assert.equal(slateTimeline.items.find((item) => item.selectedSlug === "quote-card").templateProps.rveQuoteCardStyleProps.backgroundColor, slateTokens.cssVars["--a1-style-bg"]);

const timelineSource = await fs.readFile(path.join(process.cwd(), "remotion-renderer", "src", "ArticleTemplateTimeline.tsx"), "utf8");
assert.match(timelineSource, /\.\.\.componentStyleProps/s, "TemplateComponent props must spread token-derived component style props");
assert.match(timelineSource, /<TemplateComponent \{\.\.\.templateProps\}/, "RVE TemplateComponent must receive final templateProps");
assert.match(timelineSource, /data-a1-style-wrapper-overlay="token-texture-grid"/, "wrapper texture/grid overlay must be explicit and token-driven");
assert.match(timelineSource, /data-a1-template-component-layer="rve-official-component"/, "wrapper surface must be separate from component prop consumption");
const rveCatalogSource = await fs.readFile(path.join(process.cwd(), "remotion-renderer", "src", "RveOfficialTemplates.tsx"), "utf8");
assert.match(rveCatalogSource, /export function A1RveQuoteCardAdapter/, "RVE quote-card catalog entry must use an A1 adapter component, not the raw external component directly");
assert.match(rveCatalogSource, /component: A1RveQuoteCardAdapter/, "quote-card must render through the style-consuming adapter component");
assert.match(rveCatalogSource, /--rve-quote-card-bg/, "quote-card adapter must map style tokens to actual component CSS variables");
assert.match(rveCatalogSource, /<RveQuoteCard \{\.\.\.props\} \/>/, "quote-card adapter must still render the source RVE component with final props");

const quote = timeline.items.find((item) => item.id === "shot-03-evidence-quote");
assert.equal(quote.assetSlotPlan.slots[0].verificationStatus, "verified-fixture-slot-only");
assert.equal(quote.assetSlotPlan.slots[0].renderAllowed, false);
assert.match(quote.assetSlotPlan.slots[0].provenanceRequirement, /local cache/i);

const reportPath = path.join(process.cwd(), ".codex-artifacts", "paper-editorial-rve-quote-adapter", "fixture-report.json");
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify({ ok: true, itemCount: timeline.items.length, selectedSlugs: timeline.items.map((item) => item.selectedSlug), styleProfileId: timeline.styleProfileId }, null, 2) + "\n");
console.log(`paper editorial RVE quote adapter fixture passed: ${reportPath}`);
