#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  A1_CREATOR_PALETTE_LANES,
  approveCreatorPackagingPalette,
  approveCreatorPackagingPaletteBySystemAuthority,
  auditCreatorPaletteOverlayComposite,
  assertCreatorPaletteApprovedForStaticBoard,
  buildCanonicalCreatorPackagingSequence,
  buildCreatorPackagingPaletteRegistry,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {compileFusionAuthority} from "../apps/studio-next/src/lib/a1-crt-pixel-editorial-fusion-authority-v1.mjs";

const hash = (character) => character.repeat(64);
const shotSpecs = [
  ["HOLDOUT-SRC-A", "一项研究报告给出了三组实验数据", "p1"],
  ["HOLDOUT-Q-B", "为什么不能直接交付？", "p2"],
  ["HOLDOUT-V-C", "关键结论是自动成品并不可靠", "p2"],
  ["HOLDOUT-R-D", "先停一下，重新整理判断", "p2"],
  ["HOLDOUT-SCREEN-E", "打开真实工作台继续检查版本", "p3"],
  ["HOLDOUT-TURN-F", "把输入和输出放在一起比较机制", "p4"],
  ["HOLDOUT-RESOLVE-G", "所以真正的结果仍回到人的选择", "p4"],
  ["HOLDOUT-Q-H", "为什么不能直接交付？", "p5"],
  ["HOLDOUT-Q-I", "为什么不能直接交付？", "p5"],
];

const genericWorkspace = {
  article: {shotCount: shotSpecs.length, sourceTextSha256: hash("a")},
  library: {assets: shotSpecs.map(([shotId, sourceText, paragraphId], index) => ({route: "shot-composition", shotDemand: {shotId, order: index + 1, sourceText, paragraphId}}))},
  production: {
    project: {projectId: "generic-semantic-fixture"},
    referenceConditioning: {referenceCorpusContract: "A1ReferenceSequenceCorpus/v2", referenceCorpusSha256: hash("b")},
    shotIntelligence: {semanticDesignBriefSet: {briefs: []}},
  },
};
genericWorkspace.production.creatorPackagingProjectOverrides = {
  contract: "A1CreatorPackagingProjectDecisionOverrides/v1",
  projectId: genericWorkspace.production.project.projectId,
  sourceRevisionHash: genericWorkspace.article.sourceTextSha256,
  precedence: "TEST_FIXTURE_CURRENT_SEMANTIC_AUTHORITY",
  entries: [],
  wholeFilmCompositionDirective: {fusionAuthority: compileFusionAuthority({
  contract: "A1PixelEditorialTaitCrtFusionAuthority/v1",
  status: "LOCKED_FUSED_DEFAULT",
  id: "fixture-retro-pixel-tait-crt-fusion-v1",
  baseVisualMaster: {role: "PRIMARY_VISUAL_MASTER", styleProfileId: "minimal-retro-pixel-editorial-v2", referencePackId: "pinterest-retro-pixel-v1"},
  crtMechanismSource: {role: "INTEGRATED_CRT_MECHANISM_SOURCE", id: "tait-crt-interface-skill", installedSkillSha256: hash("c")},
  typographyAuthority: {id: "EVA_TYPOGRAPHY_ONLY", forbiddenRoles: ["VISUAL_MASTER", "SHOT_ROUTING"]},
  filmAdapter: {id: "a1-crt-pixel-editorial-fusion", role: "FUSED_FILM_ADAPTATION_ENTRYPOINT", installedSkillSha256: hash("d")},
  appliesTo: ["NEW_GENERATION", "STALE_BOARD_REBUILD", "LOOK_MASTER_REPAIR"],
  fusionPolicy: "A1_BASE_VISUAL_MASTER_PLUS_TAIT_CRT_MECHANISMS",
  evaBoundary: "TYPOGRAPHY_ONLY",
  })},
};

const genericSequence = buildCanonicalCreatorPackagingSequence(genericWorkspace, {now: "2026-08-08T00:00:00.000Z"});
assert.equal(genericSequence.status, "CREATOR_PACKAGING_PALETTE_REVIEW");
assert.ok(genericSequence.decisions.every((item) => !item.shotId.startsWith("ED-") && item.derivationAuthority === "GENERIC_SEMANTIC_DERIVATION"));
assert.deepEqual(genericSequence.rhythmAudit.hupoOrderedSequenceAudit.chain.orderedShotIds, ["HOLDOUT-SRC-A", "HOLDOUT-Q-B", "HOLDOUT-V-C", "HOLDOUT-R-D", "HOLDOUT-SCREEN-E"]);
assert.equal(genericSequence.rhythmAudit.hupoOrderedSequenceAudit.status, "PASS");
assert.equal(genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-SRC-A").networkDecision, "REQUIRED");
assert.equal(genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-SCREEN-E").networkDecision, "SKIP");
assert.deepEqual([genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-Q-B").packageDecision, genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-Q-B").frameOccupation], ["PACKAGE", "OVERLAY"]);
assert.deepEqual([genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-TURN-F").contentTreatment, genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-TURN-F").frameOccupation], ["EDITORIAL_EXPLAINER", "SPLIT"]);
assert.equal(genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-Q-I").semanticSignals.repetitionSuppressed, true);
assert.equal(genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-Q-I").packageDecision, "NO_PACKAGE");
assert.equal(genericSequence.maturity.status, "GENERIC_HOLDOUT_DERIVED");
assert.ok(genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-Q-I").semanticSignals.informationGainScore < genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-Q-B").semanticSignals.informationGainScore);
assert.equal(genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-Q-I").semanticSignals.comparisonBasis.sameParagraph, true);
assert.ok(genericSequence.decisions.find((item) => item.shotId === "HOLDOUT-Q-B").semanticSignals.informationGain.includes("RESPONSIBILITY"));

const secondArticleWorkspace = structuredClone(genericWorkspace);
secondArticleWorkspace.production.project.projectId = "generic-semantic-fixture-second-article";
secondArticleWorkspace.article.sourceTextSha256 = hash("second-article-source");
secondArticleWorkspace.production.creatorPackagingProjectOverrides.projectId = secondArticleWorkspace.production.project.projectId;
secondArticleWorkspace.production.creatorPackagingProjectOverrides.sourceRevisionHash = secondArticleWorkspace.article.sourceTextSha256;
const secondArticleTexts = [
  "一份研究报告列出两项可复核的异常",
  "为什么这一步不能直接跳过？",
  "关键结论是自动摘要丢掉了责任边界",
  "先暂停，重新核对输入和结论",
  "打开实际版本页检查修订记录",
  "把两个结果放在同一张表里比较差异",
  "所以真正的结果仍回到编辑者的选择",
  "为什么同一套说法又出现一次？",
  "为什么同一套说法又出现一次？",
];
const secondArticleParagraphs = ["article2-p1", "article2-p2", "article2-p2", "article2-p2", "article2-p3", "article2-p4", "article2-p4", "article2-p5", "article2-p5"];
secondArticleWorkspace.library.assets = secondArticleWorkspace.library.assets.map((asset, index) => ({...asset, shotDemand: {...asset.shotDemand, shotId: asset.shotDemand.shotId.replace("HOLDOUT-", "ARTICLE2-"), sourceText: secondArticleTexts[index], paragraphId: secondArticleParagraphs[index]}}));
const secondArticleSequence = buildCanonicalCreatorPackagingSequence(secondArticleWorkspace, {now: "2026-08-08T00:00:00.000Z"});
assert.ok(secondArticleSequence.decisions.every((item) => item.derivationAuthority === "GENERIC_SEMANTIC_DERIVATION"));
assert.equal(secondArticleSequence.maturity.status, "GENERIC_HOLDOUT_DERIVED");
assert.equal(secondArticleSequence.sourceRevisionHash, secondArticleWorkspace.article.sourceTextSha256);
assert.ok(secondArticleSequence.decisions.some((item) => item.packageDecision === "PACKAGE"));
assert.ok(secondArticleSequence.decisions.some((item) => item.networkDecision === "REQUIRED"));
assert.ok(secondArticleSequence.decisions.some((item) => item.semanticSignals.repetitionSuppressed === true));

const brokenOrderWorkspace = structuredClone(genericWorkspace);
brokenOrderWorkspace.library.assets.find((item) => item.shotDemand.shotId === "HOLDOUT-R-D").shotDemand.sourceText = "继续说明下一段普通内容";
assert.throws(() => buildCanonicalCreatorPackagingSequence(brokenOrderWorkspace), /creator-packaging-sequence-audit-failed/);

const validOverlayRaw = {
  artifact: {sha256: hash("1")},
  pixelAudit: {
    compositePreview: {publicUrl: "/composite.png", sha256: hash("2")},
    footageCompatibility: {status: "PASS", baseFrameSha256: hash("3"), subjectOcclusion: {status: "PASS", availableRegionOverflow: {status: "PASS"}}},
  },
};
const validVideoContext = {baseFrame: {publicUrl: "/hold.png", sha256: hash("3")}, subjectBounds: {x: 0.2, y: 0.2, width: 0.3, height: 0.6}, safeZones: [{id: "safe"}], availableRegions: [{id: "available"}]};
assert.equal(auditCreatorPaletteOverlayComposite({raw: validOverlayRaw, videoContext: validVideoContext}).status, "PASS");
const missingComposite = structuredClone(validOverlayRaw);
delete missingComposite.pixelAudit.compositePreview;
assert.deepEqual(auditCreatorPaletteOverlayComposite({raw: missingComposite, videoContext: validVideoContext}).failures.includes("COMPOSITE_SHA_BINDING_MISSING"), true);

const makeEntry = ({id, laneId, contentTreatment, frameOccupation, history = false}) => ({
  paletteEntryId: id,
  laneId,
  shotId: `SHOT-${id}`,
  candidateId: `candidate-${id}`,
  projectLocalUrl: `/generated/system-line/${id}.png`,
  contentSha256: hash(String((id.length % 8) + 1)),
  packageType: `${contentTreatment}_${frameOccupation}`,
  primaryPrimitive: laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? "PIXEL_WINDOW_OVERLAY" : laneId === A1_CREATOR_PALETTE_LANES.TYPOGRAPHY ? "PIXEL_TYPE_ACTOR" : "PIXEL_EXPLAINER",
  semanticRole: "TURN",
  dominantActor: "fixture",
  composition: "fixture",
  surfaceLogic: "fixture",
  paletteRoles: ["cool-gray", "charcoal"],
  windowCount: laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? 1 : 0,
  typographyBehavior: "fixture",
  contentTreatment,
  frameOccupation,
  rhythmRole: "TURN",
  holdFrameCompatibility: laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? "PASS" : "NOT_REQUIRED",
  sourceAudit: {status: "PASS", actualPixelStatus: "PASS", semanticStatus: "PASS", duplicateStatus: "PASS", exception: false, originHistoryReadOnly: history},
  ...(laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? {overlayCompositeAudit: {status: "PASS", artifactSha256: hash("1"), compositeSha256: hash("2"), holdFrameSha256: hash("3"), subjectExclusionStatus: "PASS", safeZoneStatus: "PASS", availableRegionStatus: "PASS"}} : {}),
  ...(history ? {paletteReferenceAlias: {contract: "A1ImmutablePaletteReferenceAlias/v1", status: "PASS", originArtifactSha256: hash(String((id.length % 8) + 1)), originHistoryRecord: {historyReadOnly: true}, currentEligibilityAudit: {status: "PASS"}}} : {}),
});

const baseEntries = [
  makeEntry({id: "overlay-a", laneId: A1_CREATOR_PALETTE_LANES.OVERLAY, contentTreatment: "PIXEL_WINDOW", frameOccupation: "OVERLAY"}),
  makeEntry({id: "overlay-bb", laneId: A1_CREATOR_PALETTE_LANES.OVERLAY, contentTreatment: "PIXEL_WINDOW", frameOccupation: "OVERLAY"}),
  makeEntry({id: "type-aaa", laneId: A1_CREATOR_PALETTE_LANES.TYPOGRAPHY, contentTreatment: "HERO_TYPOGRAPHY", frameOccupation: "SPLIT", history: true}),
  makeEntry({id: "type-bbbb", laneId: A1_CREATOR_PALETTE_LANES.TYPOGRAPHY, contentTreatment: "HERO_TYPOGRAPHY", frameOccupation: "FULL_FRAME_TAKEOVER", history: true}),
];
const recommendedPair = {[A1_CREATOR_PALETTE_LANES.OVERLAY]: "overlay-a", [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY]: "type-aaa"};
const blockedRegistry = buildCreatorPackagingPaletteRegistry({sequence: genericSequence, entries: baseEntries, contactSheet: {publicUrl: "/contact.png", sha256: hash("4"), width: 1920, height: 1128}, sourceWorkspaceSha256: hash("5"), sourceBoardSha256: hash("6"), recommendedTrio: recommendedPair});
assert.equal(blockedRegistry.status, "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_MISSING_LANE_C");
assert.deepEqual(blockedRegistry.laneCTargetResolution, {status: "RESOLVED", targetShotIds: ["HOLDOUT-TURN-F"], semanticAdjudicationRequired: false, generationAllowed: false});
assert.equal(blockedRegistry.laneReadiness[A1_CREATOR_PALETTE_LANES.FULL_FRAME].status, "MISSING_ACTUAL_CANDIDATE");
assert.equal(blockedRegistry.confirmationAllowed, false);
assert.throws(() => approveCreatorPackagingPalette(blockedRegistry, recommendedPair), /creator-packaging-palette-confirmation-blocked/);
assert.equal(blockedRegistry.entries.find((item) => item.paletteEntryId === "type-aaa").sourceAudit.originHistoryReadOnly, true);

const laneCWorkspace = structuredClone(genericWorkspace);
laneCWorkspace.production.creatorPackagingProjectOverrides = {
  contract: "A1CreatorPackagingProjectDecisionOverrides/v1",
  projectId: laneCWorkspace.production.project.projectId,
  sourceRevisionHash: laneCWorkspace.article.sourceTextSha256,
  precedence: "TEST_ONLY_EXPLICIT_SEMANTIC_ADJUDICATION",
  wholeFilmCompositionDirective: structuredClone(genericWorkspace.production.creatorPackagingProjectOverrides.wholeFilmCompositionDirective),
  entries: [
    {shotId: "HOLDOUT-TURN-F", packageDecision: "PACKAGE", contentTreatment: "EDITORIAL_EXPLAINER", frameOccupation: "SPLIT", rhythmRole: "TURN", reason: "fixture-real-comparison-structure-preserves-split"},
    {shotId: "HOLDOUT-R-D", packageDecision: "PACKAGE", contentTreatment: "HERO_TYPOGRAPHY", frameOccupation: "SPLIT", rhythmRole: "RESET", reason: "fixture-reset-type-remains-split-to-avoid-contiguous-full-frame-takeovers"},
  ],
};
const laneCSequence = buildCanonicalCreatorPackagingSequence(laneCWorkspace, {now: "2026-08-08T00:00:00.000Z"});
const laneCEntry = makeEntry({id: "explainer-cc", laneId: A1_CREATOR_PALETTE_LANES.FULL_FRAME, contentTreatment: "EDITORIAL_EXPLAINER", frameOccupation: "SPLIT"});
laneCEntry.shotId = "HOLDOUT-TURN-F";
const resolvedRegistry = buildCreatorPackagingPaletteRegistry({
  sequence: laneCSequence,
  entries: [...baseEntries, laneCEntry],
  contactSheet: {publicUrl: "/contact.png", sha256: hash("7"), width: 1920, height: 1128},
  sourceWorkspaceSha256: hash("8"),
  sourceBoardSha256: hash("9"),
  recommendedTrio: {[A1_CREATOR_PALETTE_LANES.OVERLAY]: "overlay-a", [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY]: "type-aaa", [A1_CREATOR_PALETTE_LANES.FULL_FRAME]: "explainer-cc"},
});
assert.equal(resolvedRegistry.laneCTargetResolution.status, "RESOLVED");
assert.deepEqual(resolvedRegistry.laneCTargetResolution.targetShotIds, ["HOLDOUT-TURN-F"]);
const offTargetLaneCEntry = makeEntry({id: "explainer-off-target", laneId: A1_CREATOR_PALETTE_LANES.FULL_FRAME, contentTreatment: "EDITORIAL_EXPLAINER", frameOccupation: "FULL_FRAME_TAKEOVER"});
assert.throws(() => buildCreatorPackagingPaletteRegistry({
  sequence: laneCSequence,
  entries: [...baseEntries, offTargetLaneCEntry],
  contactSheet: {publicUrl: "/contact.png", sha256: hash("7"), width: 1920, height: 1128},
  sourceWorkspaceSha256: hash("8"),
  sourceBoardSha256: hash("9"),
  recommendedTrio: {[A1_CREATOR_PALETTE_LANES.OVERLAY]: "overlay-a", [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY]: "type-aaa", [A1_CREATOR_PALETTE_LANES.FULL_FRAME]: "explainer-off-target"},
}), /creator-packaging-palette-lane-c-entry-not-canonical-target/);
const systemApprovedRegistry = approveCreatorPackagingPaletteBySystemAuthority(resolvedRegistry, resolvedRegistry.recommendedTrio, {
  authoritySequenceSha256: resolvedRegistry.sequenceSha256,
  registrySourceSha256: resolvedRegistry.registrySha256,
  rationale: "fixture evidence comparison requires one continuous explainer field; this is a binding preflight selection, not user or board approval",
  now: "2026-08-08T00:02:00.000Z",
});
assert.equal(systemApprovedRegistry.status, "SYSTEM_APPROVED_CREATOR_PACKAGING_PALETTE");
assert.equal(systemApprovedRegistry.selection.approvalMode, "SYSTEM_AUTO_SELECTED_BY_CURRENT_STYLE_AUTHORITY");
assert.equal(systemApprovedRegistry.selection.userDecisionAt, null);
assert.equal(systemApprovedRegistry.entries.find((entry) => entry.paletteEntryId === "explainer-cc").approvalState, "SYSTEM_APPROVED");
assert.throws(() => approveCreatorPackagingPaletteBySystemAuthority(resolvedRegistry, resolvedRegistry.recommendedTrio, {authoritySequenceSha256: hash("bad"), registrySourceSha256: resolvedRegistry.registrySha256, rationale: "bad"}), /creator-packaging-palette-system-sequence-binding-invalid/);
const systemApprovalWorkspace = structuredClone(laneCWorkspace);
systemApprovalWorkspace.production.canonicalCreatorPackagingSequence = laneCSequence;
systemApprovalWorkspace.production.creatorPackagingPaletteRegistry = systemApprovedRegistry;
assert.throws(() => assertCreatorPaletteApprovedForStaticBoard(systemApprovalWorkspace), /creator-packaging-palette-user-approval-required/);

const mislabeledHero = makeEntry({id: "fake-c", laneId: A1_CREATOR_PALETTE_LANES.FULL_FRAME, contentTreatment: "HERO_TYPOGRAPHY", frameOccupation: "FULL_FRAME_TAKEOVER"});
mislabeledHero.shotId = "HOLDOUT-TURN-F";
assert.throws(() => buildCreatorPackagingPaletteRegistry({sequence: laneCSequence, entries: [...baseEntries, mislabeledHero], contactSheet: {publicUrl: "/contact.png", sha256: hash("4"), width: 1920, height: 1128}, sourceWorkspaceSha256: hash("5"), sourceBoardSha256: hash("6"), recommendedTrio: {...recommendedPair, [A1_CREATOR_PALETTE_LANES.FULL_FRAME]: "fake-c"}}), /creator-packaging-palette-lane-c-content-type-invalid/);

console.log(JSON.stringify({status: "PASS", genericShotIds: genericSequence.decisions.map((item) => item.shotId), hupoChain: genericSequence.rhythmAudit.hupoOrderedSequenceAudit.chain.orderedShotIds, laneCStatus: blockedRegistry.laneReadiness[A1_CREATOR_PALETTE_LANES.FULL_FRAME].status, historyAliasImmutable: true, missingCompositeFailClosed: true}, null, 2));
