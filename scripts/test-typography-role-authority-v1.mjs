#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  A1_HERO_TITLE_CARRIERS,
  A1_HERO_TITLE_STYLE_MODES,
  A1_TYPOGRAPHY_ROLE_AUTHORITY,
  A1_TYPOGRAPHY_ROLES,
  assertTypographyRoleAuthority,
  deriveHeroTitlePresentation,
  evaluateTypographyCanaryAdmission,
  resolveHeroTitleStyleMode,
  resolveTypographyRoleForShot,
} from "../apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs";

assertTypographyRoleAuthority(A1_TYPOGRAPHY_ROLE_AUTHORITY);
assert.equal(resolveTypographyRoleForShot({shotId: "T-01", semanticEvent: "IDENTITY"}), A1_TYPOGRAPHY_ROLES.HERO_GENERATED_TYPE);
assert.equal(resolveTypographyRoleForShot({shotId: "R-02", sourceEvidenceRequired: true}), A1_TYPOGRAPHY_ROLES.FORMAL_COPY);
assert.equal(resolveTypographyRoleForShot({shotId: "P-03", semanticEvent: "CONCLUSION"}), A1_TYPOGRAPHY_ROLES.HERO_GENERATED_TYPE);
assert.equal(resolveTypographyRoleForShot({shotId: "Q-01", semanticEvent: "QUESTION"}), A1_TYPOGRAPHY_ROLES.HERO_GENERATED_TYPE);
assert.equal(resolveTypographyRoleForShot({editMode: "presenter-clean"}), A1_TYPOGRAPHY_ROLES.NO_TYPE);
assert.deepEqual(A1_TYPOGRAPHY_ROLE_AUTHORITY.roles.FORMAL_COPY.fontAssetIds, ["type-editorial-heavy", "type-condensed-impact"]);

const presenterHero = deriveHeroTitlePresentation({
  title: "中文顺了 / 问题还在",
  semanticEvent: "STRONG_CONTRAST",
  typeAllowed: true,
  baseVisualCarrier: "PRESENTER_BASE",
  presenterSemanticValue: true,
});
assert.equal(presenterHero.carrier, A1_HERO_TITLE_CARRIERS.PRESENTER_HERO_TYPE);
assert.equal(presenterHero.styleMode, A1_HERO_TITLE_STYLE_MODES.EVA_MECHANISM_CJK);
assert.equal(presenterHero.presenterLayerPolicy.protectionScope, "PRESENTER_FACE_AND_BODY_ONLY");
assert.deepEqual(presenterHero.presenterLayerPolicy.titleMayCover, ["MICROPHONE", "BOOM_ARM", "STAND"]);
assert.equal(A1_TYPOGRAPHY_ROLE_AUTHORITY.presenterHero.generatedBackgroundPolicy, "FORBIDDEN");
assert.equal(A1_TYPOGRAPHY_ROLE_AUTHORITY.presenterHero.packageOutputContract, "TRUE_TRANSPARENT_OVERLAY_ACTORS_ONLY");

const fullscreenConclusion = deriveHeroTitlePresentation({title: "问题还在", semanticEvent: "CONCLUSION", typeAllowed: true, baseVisualCarrier: "PRESENTER_BASE", presenterSemanticValue: false});
assert.equal(fullscreenConclusion.carrier, A1_HERO_TITLE_CARRIERS.FULLSCREEN_HERO_TYPE);
assert.equal(fullscreenConclusion.presenterRequired, false);
assert.equal(deriveHeroTitlePresentation({semanticEvent: "EVIDENCE", typeAllowed: true, sourceEvidenceRequired: true}).carrier, A1_HERO_TITLE_CARRIERS.EVIDENCE_WITH_TYPE);
assert.equal(resolveHeroTitleStyleMode({title: "CODEX", semanticEvent: "CONCLUSION"}), A1_HERO_TITLE_STYLE_MODES.EVA_EDITORIAL_SERIF_LATIN);
assert.equal(resolveHeroTitleStyleMode({title: "Codex 在后台", semanticEvent: "IDENTITY", dominantLanguage: "LATIN"}), A1_HERO_TITLE_STYLE_MODES.POSTER_GROTESK_LATIN);
assert.equal(deriveHeroTitlePresentation({title: "结论", semanticEvent: "CONCLUSION", typeAllowed: true, priorCarrier: "FULLSCREEN_HERO_TYPE"}).adjacentVariationRequired, true);
assert.equal(A1_TYPOGRAPHY_ROLE_AUTHORITY.heroTitleSystem.bilingualHierarchy.equalWeightForbidden, true);

const preflight = evaluateTypographyCanaryAdmission({
  shotId: "ED-13",
  semanticEvent: "IDENTITY",
  requestedCopy: "智能写作工作台",
  generator: "IMAGEGEN",
  editableShadowPlanned: true,
  candidateCount: 0,
  correctionCount: 0,
  maxConcurrentImagegenJobs: 1,
  isolatedReviewOnly: true,
  productionAuthorityMutation: false,
});
assert.equal(preflight.status, "READY_FOR_GENERATION");

const reviewed = evaluateTypographyCanaryAdmission({
  shotId: "ED-13",
  semanticEvent: "IDENTITY",
  requestedCopy: "智能写作工作台",
  renderedCopy: "智能写作工作台",
  generator: "IMAGEGEN",
  editableShadowPlanned: true,
  editableShadowBound: true,
  candidateCount: 1,
  correctionCount: 1,
  maxConcurrentImagegenJobs: 1,
  candidateContentSha256: "a".repeat(64),
  ocrStatus: "PASS",
  characterVerificationStatus: "PASS",
  actualPixelReviewStatus: "PASS",
  incumbentComparisonStatus: "PASS",
  styleReferenceComparisonStatus: "PASS",
  adjacentShotComparisonStatus: "PASS",
  isolatedReviewOnly: true,
  productionAuthorityMutation: false,
});
assert.equal(reviewed.status, "READY_FOR_USER_REVIEW");
assert.equal(reviewed.productionAdmission, false);
assert.equal(reviewed.userVisualApproval, "NOT_IMPLIED");

const presenterViolation = evaluateTypographyCanaryAdmission({
  shotId: "ED-01",
  title: "智能写作工作台",
  semanticEvent: "IDENTITY",
  typeAllowed: true,
  baseVisualCarrier: "PRESENTER_BASE",
  presenterSemanticValue: true,
  requestedCopy: "智能写作工作台",
  generator: "IMAGEGEN",
  editableShadowPlanned: true,
  candidateCount: 0,
  correctionCount: 0,
  maxConcurrentImagegenJobs: 1,
  isolatedReviewOnly: true,
  productionAuthorityMutation: false,
  generatedBackgroundPresent: true,
});
assert.equal(presenterViolation.status, "BLOCKED");
for (const code of ["PRESENTER_REAL_HOLD_FRAME_REQUIRED", "PRESENTER_GENERATED_BACKGROUND_FORBIDDEN", "PRESENTER_TRUE_ALPHA_OVERLAY_REQUIRED", "PRESENTER_REAL_MASK_BINDING_REQUIRED", "PRESENTER_HERO_TITLE_OWNER_INVALID", "PRESENTER_SUPPORT_COPY_OWNER_INVALID"]) assert.ok(presenterViolation.failures.includes(code));

const presenterReady = evaluateTypographyCanaryAdmission({
  shotId: "ED-01",
  title: "智能写作工作台",
  semanticEvent: "IDENTITY",
  typeAllowed: true,
  baseVisualCarrier: "PRESENTER_BASE",
  presenterSemanticValue: true,
  requestedCopy: "智能写作工作台",
  generator: "IMAGEGEN",
  editableShadowPlanned: true,
  candidateCount: 0,
  correctionCount: 0,
  maxConcurrentImagegenJobs: 1,
  isolatedReviewOnly: true,
  productionAuthorityMutation: false,
  verifiedRealHoldFramePreserved: true,
  generatedBackgroundPresent: false,
  trueTransparentOverlay: true,
  realPresenterMaskBound: true,
  heroTitleOwner: "IMAGEGEN_EVA_MECHANISM_CJK",
  supportCopyOwner: "LOCAL_RENDERER_VERIFIED_FONT_OUTLINES",
});
assert.equal(presenterReady.status, "READY_FOR_GENERATION");

const overBudget = evaluateTypographyCanaryAdmission({
  shotId: "ED-13",
  semanticEvent: "IDENTITY",
  requestedCopy: "智能写作工作台",
  generator: "IMAGEGEN",
  editableShadowPlanned: true,
  candidateCount: 3,
  correctionCount: 2,
  maxConcurrentImagegenJobs: 3,
  isolatedReviewOnly: false,
  productionAuthorityMutation: true,
  fullAuditRequested: true,
  stageBoundary: false,
});
assert.equal(overBudget.status, "BLOCKED");
for (const code of ["CANDIDATE_BUDGET_EXCEEDED", "CORRECTION_BUDGET_EXCEEDED", "IMAGEGEN_CONCURRENCY_OUT_OF_BOUNDS", "ISOLATED_REVIEW_LANE_REQUIRED", "PRODUCTION_AUTHORITY_MUTATION_FORBIDDEN", "FULL_AUDIT_RESERVED_FOR_STAGE_BOUNDARY"]) assert.ok(overBudget.failures.includes(code));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1TypographyRoleAuthorityTest/v1",
  authoritySha256: A1_TYPOGRAPHY_ROLE_AUTHORITY.authoritySha256,
  proofRoles: A1_TYPOGRAPHY_ROLE_AUTHORITY.requiredProofRoles.map((entry) => entry.role),
  states: {preflight: preflight.status, reviewed: reviewed.status, overBudget: overBudget.status},
}, null, 2));
