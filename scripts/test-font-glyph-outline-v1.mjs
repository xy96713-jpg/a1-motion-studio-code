#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths, verifyFontGlyphOutlineProof} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {assertFormalTypographyGlyphAdmission} from "../apps/studio-next/src/lib/a1-formal-typography-admission-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fontPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf");
const text = "把写作的不便变成流程力整理编排读取检查可控工作流";
const run = buildFontGlyphOutlineRun({fontPath, text});
assert.equal(run.postscriptName, "Fusion-Pixel-Regular");
assert.equal(run.glyphs.length, [...text].length);
assert.equal(run.glyphs.every((glyph) => glyph.glyphId > 0 && glyph.path.startsWith("M")), true);
assert.match(run.outlineSha256, /^[a-f0-9]{64}$/u);
const svgPaths = glyphOutlineRunToSvgPaths(run, {x: 0, baseline: 100, fontSize: 32, fill: "#000"});
assert.match(svgPaths, /<path /u);
assert.doesNotMatch(svgPaths, /font-family|@font-face|<text/u);
const fontSha256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
const proof = {contract: "A1RepresentativeED31ActualPixelFontProof/v2", status: "ACTUAL_PIXEL_FONT_PASS", actualGlyphSource: {sha256: fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", cssFontDeclarationAcceptedAsProof: false}, outlineProof: {[text]: {postscriptName: run.postscriptName, glyphIds: run.glyphs.map((glyph) => glyph.glyphId), outlineSha256: run.outlineSha256}}};
assert.equal(verifyFontGlyphOutlineProof({proof, fontPath, expectedFontSha256: fontSha256}).status, "PASS");
assert.throws(() => verifyFontGlyphOutlineProof({proof: {...proof, actualGlyphSource: {...proof.actualGlyphSource, renderer: "CSS_FONT_DECLARATION"}}, fontPath, expectedFontSha256: fontSha256}), /source-binding-invalid/u);
const receipt = {contract: "A1FormalTypographyGlyphAdmission/v2", version: 2, status: "PASS", productionAdmissionAllowed: true, method: "FONT_FILE_DIRECT_GLYPH_OUTLINE_AND_ACTUAL_PIXEL_PROOF", cssFontDeclarationAcceptedAsProof: false, fontSha256, proofSha256: run.outlineSha256, outlineSetSha256: run.outlineSha256, glyphOutlineCoverage: {status: "PASS", coveredNodeCount: 1, totalNodeCount: 1, method: "FONT_FILE_DIRECT_GLYPH_OUTLINE_RECOMPUTED"}, actualPixelCoverage: {status: "PASS", coveredNodeCount: 1, totalNodeCount: 1}, unmigratedBlockingRoutes: []};
assert.equal(assertFormalTypographyGlyphAdmission(receipt).status, "PASS");
assert.throws(() => assertFormalTypographyGlyphAdmission({...receipt, cssFontDeclarationAcceptedAsProof: true}), /glyph-admission-required/u);
assert.throws(() => assertFormalTypographyGlyphAdmission({...receipt, actualPixelCoverage: {status: "PENDING_AUTHORIZED_PREVIEW"}}), /actual-pixel-coverage-required/u);
console.log(JSON.stringify({status: "PASS", postscriptName: run.postscriptName, glyphCount: run.glyphs.length, outlineSha256: run.outlineSha256, cssDeclarationRejectedAsProof: true, centralAdmissionFailClosed: true}, null, 2));
