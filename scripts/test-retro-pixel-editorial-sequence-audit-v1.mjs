#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {auditRetroPixelStyleBriefs, compileRetroPixelEditorialStyleBrief, rehashRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const appRoot = path.resolve("apps/studio-next");
const makeBrief = (eventId, semanticJob, variationOverrides = {}) => compileRetroPixelEditorialStyleBrief({
  appRoot,
  event: {eventId, sourceBeatIds: [eventId], packagingType: "FULLSCREEN_PACKAGE", semanticJob},
  variationOverrides,
});

const sameFamilyBriefs = [
  makeBrief("formal-sequence-family-a", "人物情绪", {primaryFamily: "one-bit-character-object"}),
  makeBrief("formal-sequence-family-b", "source evidence", {primaryFamily: "one-bit-character-object"}),
  makeBrief("formal-sequence-family-c", "流程步骤", {primaryFamily: "one-bit-character-object"}),
];
assert.throws(() => auditRetroPixelStyleBriefs(sameFamilyBriefs, {appRoot}), /sequence:.*same-primary-family-consecutive-limit/);

const sameSilhouetteBriefs = [
  makeBrief("formal-sequence-silhouette-a", "人物情绪", {speciesOrSilhouetteId: "shared-silhouette"}),
  makeBrief("formal-sequence-silhouette-b", "source evidence", {speciesOrSilhouetteId: "shared-silhouette"}),
];
assert.throws(() => auditRetroPixelStyleBriefs(sameSilhouetteBriefs, {appRoot}), /sequence:.*same-species-or-silhouette-consecutive/);

const sixBriefs = [
  makeBrief("formal-sequence-six-a", "主持人介绍与呼吸", {speciesOrSilhouetteId: "sequence-a"}),
  makeBrief("formal-sequence-six-b", "人物情绪与感受", {speciesOrSilhouetteId: "sequence-b"}),
  makeBrief("formal-sequence-six-c", "source evidence", {speciesOrSilhouetteId: "sequence-c"}),
  makeBrief("formal-sequence-six-d", "流程步骤拆解", {speciesOrSilhouetteId: "sequence-d"}),
  makeBrief("formal-sequence-six-e", "结论判断", {speciesOrSilhouetteId: "sequence-e"}),
  makeBrief("formal-sequence-six-f", "语言观点", {speciesOrSilhouetteId: "sequence-f"}),
];
const sixAudit = auditRetroPixelStyleBriefs(sixBriefs, {appRoot});
assert.equal(sixAudit.sequenceAudit.status, "PASS");
assert.equal(sixAudit.sequenceAudit.sampleCount, 6);
assert.equal(sixAudit.sequenceAudit.legacyEntriesIgnored, 0);
assert.match(sixAudit.auditSha256, /^[a-f0-9]{64}$/u);

const legacy = makeBrief("formal-sequence-legacy", "主持人介绍与呼吸");
delete legacy.tasteDimensions;
legacy.fingerprint = [legacy.variation.primaryFamily, legacy.variation.surfaceLogic, legacy.variation.dominantActor, legacy.variation.composition, legacy.variation.palette].join("|");
const legacyAudit = auditRetroPixelStyleBriefs([rehashRetroPixelEditorialStyleBrief(legacy)], {appRoot});
assert.equal(legacyAudit.status, "PASS");
assert.equal(legacyAudit.sequenceAudit.status, "PASS");
assert.equal(legacyAudit.sequenceAudit.sampleCount, 0);
assert.equal(legacyAudit.sequenceAudit.legacyEntriesIgnored, 1);

console.log(JSON.stringify({status: "PASS", contract: "A1RetroPixelStyleAudit/v1", sequenceAuditWired: true, sixWindow: "PASS", sameFamilyRejected: true, sameSilhouetteRejected: true, legacyCompatible: true}, null, 2));
