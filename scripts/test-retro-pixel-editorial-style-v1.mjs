#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY, assertRetroPixelEditorialStyleBrief, auditRetroPixelStyleBriefs, compileRetroPixelEditorialStyleBrief, editableTextSpecForBrief, mergeRetroPixelDiversityHistory} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {A1_PINTEREST_TASTE_PROFILE} from "../apps/studio-next/src/lib/a1-pinterest-taste-profile-v1.mjs";
import {packagingStyleDispatchDecision} from "../apps/studio-next/src/lib/a1-editorial-packaging-boundary-v1.mjs";

const appRoot = path.resolve("apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
assert.equal(referenceManifest.sources.length, 10);
assert.equal(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY.status, "FORMAL_PROJECT_UPGRADE");
assert.equal(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY.styleProfileId, "minimal-retro-pixel-editorial-v2");
assert.equal(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY.tasteProfileId, A1_PINTEREST_TASTE_PROFILE.id);
assert.equal(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY.tasteProfileContract, A1_PINTEREST_TASTE_PROFILE.contract);
assert.equal(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY.tasteAuthoritySha256.length, 64);
assert.equal(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY.referencePackId, referenceManifest.packId);
assert.deepEqual(A1_ACTIVE_RETRO_PIXEL_STYLE_AUTHORITY.referenceSourceIds, referenceManifest.sources.map((source) => source.id));
for (const source of referenceManifest.sources) {
  const bytes = fs.readFileSync(path.join(appRoot, "public", source.publicUrl.replace(/^\//u, "")));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), source.sha256);
}
const briefs = workspace.production.packagingStyleBriefs || [];
assert.ok(briefs.length >= 3, "selected packaging events need compiled style briefs");
const selectedIds = workspace.production.packagingBeatPlan.anchorSampling.selectedEventIds;
const audit = auditRetroPixelStyleBriefs(briefs, {appRoot, distinctEventIds: selectedIds});
assert.equal(audit.status, "PASS");
assert.equal(audit.briefCount, briefs.length);
assert.equal(audit.results.length, briefs.length);
assert.deepEqual(audit.fingerprintSet.slice().sort(), [...new Set(audit.results.map((item) => item.fingerprint))].sort());
assert.ok(/^[a-f0-9]{64}$/u.test(audit.auditSha256));
assert.equal(new Set(selectedIds.map((id) => briefs.find((brief) => brief.eventId === id)?.fingerprint)).size, selectedIds.length);
for (const brief of briefs) {
  const densityPolicy = A1_PINTEREST_TASTE_PROFILE.densityProfiles[brief.tasteDimensions?.densityProfile];
  assert.ok(densityPolicy, `unknown density profile: ${brief.tasteDimensions?.densityProfile}`);
  assert.equal(brief.sourceReferences.length >= 2 && brief.sourceReferences.length <= 4, true);
  assert.equal(Object.values(brief.atmosphere).every(Boolean), true);
  assert.equal(brief.styleProfile?.id, densityPolicy.styleProfileId);
  assert.equal(brief.styleProfile?.complexity, densityPolicy.id === "quiet-iconic" ? "minimal" : "editorial");
  for (const key of ["maxVisibleActors", "maxSemanticTextBlocks", "maxSupportingFamilies", "maxAccentColors", "maxDominantMasses", "maxCompositionClusters", "maxDecorativeMotifs"]) {
    assert.equal(brief.styleProfile?.[key], densityPolicy[key], `${brief.eventId}:${key}`);
  }
  assert.equal(brief.styleProfile?.minimumQuietFieldRatio, densityPolicy.quietFieldRatio[0]);
  assertRetroPixelEditorialStyleBrief(brief, {appRoot});
  const spec = editableTextSpecForBrief(brief, [{id: "test-node", text: "可编辑文字", geometry: {x: 0, y: 0, width: 100, height: 40}, size: 20, lineHeight: 22, tracking: 0, semanticRole: "test"}]);
  assert.equal(spec.nodes[0].fontSha256.length, 64);
  assert.equal(spec.systemFallbackForbidden, true);
}
// The first compiled brief may be a semantic timeline brief rather than a
// current packaging-plan event. Exercise dispatch with a real plan-bound brief.
const first = briefs.find((brief) => workspace.production.packagingBeatPlan.items.some((item) => item.packagingEventId === brief.eventId)) || briefs[0];
const firstItem = workspace.production.packagingBeatPlan.items.find((item) => item.packagingEventId === first.eventId) || {packagingEventId: first.eventId, packageType: first.packageType};
assert.equal(packagingStyleDispatchDecision(firstItem, {styleBriefAudit: {status: "BLOCK"}, styleBriefs: briefs}), false, "invalid style audit must hard-block dispatch");
assert.equal(packagingStyleDispatchDecision(firstItem, {styleBriefAudit: {status: "PASS"}, styleBriefs: briefs}), true);
const replay = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: first.eventId, sourceBeatIds: first.sourceBeatIds, sourceText: "同一内容重放", packagingType: first.packageType, semanticRole: "chapter-turn"}});
const replayDensityPolicy = A1_PINTEREST_TASTE_PROFILE.densityProfiles[replay.tasteDimensions.densityProfile];
assert.equal(replay.styleProfile.id, replayDensityPolicy.styleProfileId);
assert.equal(replay.styleProfile.maxVisibleActors, replayDensityPolicy.maxVisibleActors);
assert.equal(replay.styleProfile.maxSemanticTextBlocks, replayDensityPolicy.maxSemanticTextBlocks);
assert.equal(replay.styleProfile.maxDominantMasses, replayDensityPolicy.maxDominantMasses);
assert.equal(replay.styleProfile.maxCompositionClusters, replayDensityPolicy.maxCompositionClusters);
assert.equal(replay.styleProfile.maxDecorativeMotifs, replayDensityPolicy.maxDecorativeMotifs);
assert.equal(replay.styleProfile.minimumQuietFieldRatio, replayDensityPolicy.quietFieldRatio[0]);
assert.equal(replay.simplicityPolicy.oneGlanceReadingPathRequired, true);
assert.equal(replay.simplicityPolicy.removalPassRequired, true);
assert.equal(replay.aestheticApplication.referenceRole, "AESTHETIC_TRAIT_LIBRARY");
assert.equal(replay.aestheticApplication.fixedOutputStyle, false);
assert.equal(replay.aestheticApplication.semanticFamilyRoutingRequired, true);
assert.equal(replay.aestheticApplication.sameAppearanceAcrossShotsForbidden, true);
assert.ok(replay.sourceReferences.some((reference) => ["pinterest-retro-pixel-08", "pinterest-retro-pixel-09", "pinterest-retro-pixel-10"].includes(reference.id)));
assert.equal(replay.contentSha256, compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: first.eventId, sourceBeatIds: first.sourceBeatIds, sourceText: "同一内容重放", packagingType: first.packageType, semanticRole: "chapter-turn"}}).contentSha256);
assert.doesNotThrow(() => assertRetroPixelEditorialStyleBrief(replay, {appRoot, recentHistory: [{outputId: replay.outputId, contentSha256: replay.contentSha256, fingerprint: replay.fingerprint}]}), "same output/content replay must be idempotent");
assert.equal(mergeRetroPixelDiversityHistory([{outputId: "old", fingerprint: "f", status: "VISUAL_APPROVED"}, {outputId: "draft", fingerprint: "draft", status: "READY_FOR_REVIEW"}], [{outputId: "old", fingerprint: "f", status: "VISUAL_APPROVED"}]).entries.length, 1, "approved history merges without proposed entries or duplicates");
assert.throws(() => assertRetroPixelEditorialStyleBrief({...first, fingerprint: "wrong"}, {appRoot}), /fingerprint-derived-value/);
assert.throws(() => editableTextSpecForBrief(first, [{id: "bad", text: "bad", fontAssetId: "missing-font", geometry: {x: 0, y: 0, width: 1, height: 1}}]), /font-binding-invalid/);
const overlayA = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "overlay-a", sourceBeatIds: ["x"], packagingType: "OVERLAY_PACKAGE", semanticRole: "chapter-turn"}});
const overlayB = compileRetroPixelEditorialStyleBrief({appRoot, event: {eventId: "overlay-b", sourceBeatIds: ["y"], packagingType: "OVERLAY_PACKAGE", semanticRole: "conclusion"}});
assert.notEqual(overlayA.fingerprint, overlayB.fingerprint, "same package type must not silently reuse one fingerprint");
const ed01Event = {eventId: "event-ed01", sourceBeatIds: ["ED-01"], packagingType: "OVERLAY_PACKAGE", semanticRole: "chapter-turn", sourceText: "Hi，我用 vibe coding 做了一款智能写作工作台。"};
const ed34Event = {eventId: "event-ed34", sourceBeatIds: ["ED-34"], packagingType: "OVERLAY_PACKAGE", semanticRole: "conclusion", sourceText: "它会根据你的喜好，来决定这篇文章到底往哪个方向走，真正写出你自己的风格。", whyPackage: "短概念/身份词适合做 alpha-safe 叠加"};
const ed01Brief = compileRetroPixelEditorialStyleBrief({appRoot, event: ed01Event});
const ed34Brief = compileRetroPixelEditorialStyleBrief({appRoot, event: ed34Event});
assert.equal(ed34Brief.derivation.semanticActionId, null, "style adapter must not reinterpret article semantics");
assert.equal(ed34Brief.derivation.mode, "PACKAGE_CAPABILITY_FALLBACK");
assert.equal(ed34Brief.variation.primaryFamily, "icon-atlas-interface-language");
assert.notEqual(ed01Brief.fingerprint, ed34Brief.fingerprint, "semantic role may select a different visual grammar without reading article copy");
const sameRoleDifferentArticle = compileRetroPixelEditorialStyleBrief({appRoot, event: {...ed01Event, eventId: "event-other-article", sourceText: "完全不同文章的具体句子"}});
assert.equal(sameRoleDifferentArticle.fingerprint, ed01Brief.fingerprint, "article copy must not choose the style grammar");
assert.throws(() => assertRetroPixelEditorialStyleBrief(overlayA, {appRoot, recentHistory: [{outputId: "different-output", styleBriefSha256: overlayA.styleBriefSha256, fingerprint: overlayA.fingerprint}]}), /recent-fingerprint-duplicate/);

const sequenceBrief = (eventId, semanticJob, variationOverrides = {}) => compileRetroPixelEditorialStyleBrief({
  appRoot,
  event: {eventId, sourceBeatIds: [eventId], packagingType: "FULLSCREEN_PACKAGE", semanticJob},
  variationOverrides,
});
const sameFamilyBriefs = [
  sequenceBrief("formal-sequence-family-a", "人物情绪", {primaryFamily: "one-bit-character-object"}),
  sequenceBrief("formal-sequence-family-b", "source evidence", {primaryFamily: "one-bit-character-object"}),
  sequenceBrief("formal-sequence-family-c", "流程步骤", {primaryFamily: "one-bit-character-object"}),
];
assert.throws(() => auditRetroPixelStyleBriefs(sameFamilyBriefs, {appRoot}), /sequence:.*same-primary-family-consecutive-limit/);

const sameSilhouetteBriefs = [
  sequenceBrief("formal-sequence-silhouette-a", "人物情绪", {speciesOrSilhouetteId: "shared-silhouette"}),
  sequenceBrief("formal-sequence-silhouette-b", "source evidence", {speciesOrSilhouetteId: "shared-silhouette"}),
];
assert.throws(() => auditRetroPixelStyleBriefs(sameSilhouetteBriefs, {appRoot}), /sequence:.*same-species-or-silhouette-consecutive/);

const formalSixBriefs = [
  sequenceBrief("formal-sequence-six-a", "主持人介绍与呼吸", {speciesOrSilhouetteId: "sequence-a"}),
  sequenceBrief("formal-sequence-six-b", "人物情绪与感受", {speciesOrSilhouetteId: "sequence-b"}),
  sequenceBrief("formal-sequence-six-c", "source evidence", {speciesOrSilhouetteId: "sequence-c"}),
  sequenceBrief("formal-sequence-six-d", "流程步骤拆解", {speciesOrSilhouetteId: "sequence-d"}),
  sequenceBrief("formal-sequence-six-e", "结论判断", {speciesOrSilhouetteId: "sequence-e"}),
  sequenceBrief("formal-sequence-six-f", "语言观点", {speciesOrSilhouetteId: "sequence-f"}),
];
const formalSixAudit = auditRetroPixelStyleBriefs(formalSixBriefs, {appRoot});
assert.equal(formalSixAudit.sequenceAudit.status, "PASS");
assert.equal(formalSixAudit.sequenceAudit.sampleCount, 6);
assert.ok(/^[a-f0-9]{64}$/u.test(formalSixAudit.auditSha256));
console.log(JSON.stringify({status: "PASS", contract: "A1RetroPixelEditorialStyleBrief/v1", referenceCount: referenceManifest.sources.length, activeProfile: replay.styleProfile.id, briefCount: briefs.length, selectedAnchorCount: selectedIds.length, distinctAnchorFingerprints: selectedIds.length, idempotentReplay: true, sameTypeVariantPool: true, newUserReferencesBound: true, simplicityBudgetBound: true}, null, 2));
