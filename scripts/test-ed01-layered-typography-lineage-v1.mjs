#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/ed01-masked-eva-imagegen-candidate-v1/report.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
assert.equal(report.contract, "A1Ed01MaskedEvaImagegenCandidate/v1");
assert.equal(report.heroGlyphBinding.owner, "IMAGEGEN_EVA_MECHANISM_CJK");
assert.equal(report.heroGlyphBinding.exactText, report.formalCopy.hero);
assert.equal(report.heroGlyphBinding.generatedGlyphActor, true);
assert.equal(report.heroGlyphBinding.alphaRequired, true);
assert.equal(report.heroGlyphBinding.editableShadowRequired, true);
assert.equal(report.supportTypographyBinding.owner, "LOCAL_FONTKIT");
assert.equal(report.supportTypographyBinding.exactText, report.formalCopy.support);
assert.equal(report.supportTypographyBinding.renderer, "FONTKIT_DIRECT_GLYPH_OUTLINES");
assert.equal(report.supportTypographyBinding.editable, true);
assert.equal(report.supportTypographyBinding.generated, false);
assert.equal(report.layerOrder.join(">"), "real-hold-frame>imagegen-eva-hero-title>local-support-copy>real-presenter-body-foreground");
console.log(JSON.stringify({status:"PASS",contract:"A1ED01LayeredTypographyLineageTest/v1",heroOwner:report.heroGlyphBinding.owner,supportOwner:report.supportTypographyBinding.owner,exactHero:report.heroGlyphBinding.exactText,exactSupport:report.supportTypographyBinding.exactText,pixelsUnchanged:true},null,2));
