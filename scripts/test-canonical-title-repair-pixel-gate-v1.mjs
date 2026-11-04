#!/usr/bin/env node

import assert from "node:assert/strict";
import {auditCanonicalVisibleCopy, auditFullscreenPixelRelation, buildCanonicalTextPixelGeometry, inferCanonicalTypographyLineCount} from "../apps/studio-next/src/lib/a1-canonical-title-repair-pixel-gate-v1.mjs";

assert.equal(inferCanonicalTypographyLineCount({role: "PRESENTER_HEADLINE", protectedPhrases: ["为什么不让它直接写完全文"], ocrSegments: ["为什么不让它直接写完全文"]}), 1);
assert.equal(inferCanonicalTypographyLineCount({role: "PRESENTER_HEADLINE", protectedPhrases: ["更顺一些", "没解决"], ocrSegments: ["更顺一些", "没解决"]}), 2);
assert.equal(inferCanonicalTypographyLineCount({role: "PRESENTER_HEADLINE", protectedPhrases: ["标题"], ocrSegments: []}), 1);
assert.equal(inferCanonicalTypographyLineCount({role: "HERO_TAKEOVER", protectedPhrases: ["整理", "编排", "读取", "检查"], ocrSegments: ["整理", "编排", "读取", "检查"]}), 1);

assert.equal(auditFullscreenPixelRelation({assemblyMode: "OVERLAY", width: 1672, height: 941}).status, "NOT_APPLICABLE");
assert.equal(auditFullscreenPixelRelation({assemblyMode: "FULLSCREEN", width: 1672, height: 941, humanDetection: {status: "PASS", faceCount: 0, humanRectCount: 0}}).status, "PASS");
assert.equal(auditFullscreenPixelRelation({assemblyMode: "FULLSCREEN", width: 1672, height: 941, humanDetection: {status: "PASS", faceCount: 1, humanRectCount: 1}}).status, "FAIL");
assert.equal(auditFullscreenPixelRelation({assemblyMode: "FULLSCREEN", width: 1672, height: 941, humanDetection: {status: "BLOCKED", faceCount: 0, humanRectCount: 0}}).status, "FAIL");

assert.equal(auditCanonicalVisibleCopy({expectedPhrases: ["为什么不让它直接写完全文"], ocrText: "为什么不让它直接写完全文"}).status, "PASS");
assert.equal(auditCanonicalVisibleCopy({expectedPhrases: ["为什么不让它直接写完全文"], ocrText: "为什么不让它直接写完全文口--"}).status, "FAIL");
assert.equal(auditCanonicalVisibleCopy({expectedPhrases: ["整理", "编排", "读取", "检查"], ocrText: "整理 ④ 编排 读取 检查"}).status, "FAIL");
const geometry = buildCanonicalTextPixelGeometry({frameWidth: 1672, frameHeight: 941, segmentDetails: [
  {text: "更顺一些", boundingBox: {x: 0.12, y: 0.65, width: 0.3, height: 0.12}},
  {text: "没解决", boundingBox: {x: 0.52, y: 0.65, width: 0.26, height: 0.12}},
]});
assert.deepEqual(geometry.titleBbox, {x: 0.12, y: 0.23, width: 0.66, height: 0.12});
assert.equal(geometry.minGlyphHeightPx, 113);
assert.equal(geometry.lineCount, 1);

console.log(JSON.stringify({status: "PASS", contract: "A1CanonicalTitleRepairPixelGateTest/v1", textureRowBandsDoNotBecomeTitleLines: true, fullscreenRequiresPixelDetection: true, exactVisibleCopyRejectsExtraGlyphs: true, titleGeometryUsesVisionTextBounds: true}, null, 2));
