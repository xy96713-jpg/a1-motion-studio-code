import assert from "node:assert/strict";
import fs from "node:fs";

const library = JSON.parse(fs.readFileSync(new URL("../work/typography-director-v2/figma-typography-master-library-v1.json", import.meta.url), "utf8"));
assert.equal(library.contract, "A1FigmaTypographyMasterLibrary/v1");
assert.equal(library.status, "READY_FOR_USER_VISUAL_APPROVAL");
assert.equal(library.bindings.length, 6);
assert.equal(library.scaleReviews.length, 18);
assert.deepEqual(new Set(library.bindings.map((item) => item.masterFamily)), new Set(["PRESENTER_IDENTITY_HERO", "FULLSCREEN_CHAPTER_HERO", "CONCLUSION_STAMP", "GIANT_NUMBER_OBJECT", "ROLE_GRID_PROCESS", "DARK_RESET_VERDICT"]));
for (const item of library.bindings) {
  assert.equal(item.semanticGroupNodeIds.length, 5);
  assert.ok(item.glyphIds.length > 0);
  assert.equal(item.semanticSvgFiles.length, item.glyphNodeIds.length);
  assert.equal(Object.keys(item.semanticSvgSha256).length, item.glyphNodeIds.length);
  assert.match(item.fontSha256, /^[a-f0-9]{64}$/u);
  assert.match(item.svgSha256, /^[a-f0-9]{64}$/u);
  assert.equal(item.actualVisibleBounds.length, 4);
  assert.ok(item.minimumSemanticGapPx >= 48);
  assert.equal(item.ordinaryOverlapCount, 0);
  assert.equal(item.criticApprovalAllowed, false);
  assert.equal(item.productionSource, "REMOTION_OR_HYPERFRAMES");
  assert.equal(item.outputMode, "TRANSPARENT_GLYPH_ASSET");
  assert.equal(item.typographyOnlyAudit.status, "PASS");
  assert.equal(item.typographyOnlyAudit.visibleNonGlyphLeafCount, 0);
  assert.equal(item.typographyOnlyAudit.componentFillCount, 0);
}
assert.ok(library.scaleReviews.every((item) => item.renderPass));
assert.equal(library.figmaVideoProductionSourceAllowed, false);
assert.equal(library.productionAdmission, false);
assert.equal(library.outputMode, "TRANSPARENT_GLYPH_ASSET");
assert.equal(library.authoredBackgroundAllowed, false);
console.log("figma-typography-master-bindings-v1:PASS");
