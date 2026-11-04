#!/usr/bin/env node
import assert from "node:assert/strict";
import {auditWholeFilmTypographyRhythm, assertWholeFilmTypographyRhythmAudit} from "../apps/studio-next/src/lib/a1-whole-film-typography-rhythm-audit-v1.mjs";

const strong = (shotId, treatment, phrase, mode = "OVERLAY") => ({shotId, packageDecision: "PACKAGE", assemblyMode: mode, presentationMode: mode, baseVisualCarrier: "PRESENTER_BASE", strongLanguageEvent: true, typographyActor: true, typographyTreatment: treatment, protectedPhrases: [phrase], decisionHash: `${shotId}-decision`});
const decisions = [strong("T-01", "QUESTION_OVERLAY", "为什么不让 AI 直接写完全文"), strong("T-02", "VERDICT_OVERLAY", "AI 常常不说人话")];
const coveragePlan = {shotPlans: decisions.map((item) => ({...item, route: "PACKAGE_LOOK_MASTER", eventGrouping: {mode: item.assemblyMode}}))};
const contexts = {items: decisions.map((item) => ({shotId: item.shotId, assemblyMode: item.assemblyMode, presentationMode: item.presentationMode}))};
const plans = decisions.map((item) => ({shotId: item.shotId, candidateId: `${item.shotId}-candidate`, exactCopy: item.protectedPhrases}));
const rawReferences = decisions.map((item) => ({shotId: item.shotId, candidateId: `${item.shotId}-candidate`, ocrText: item.protectedPhrases[0], ocrExactCopyAligned: true, semanticPixelAudit: {status: "PASS"}, candidateAuditAuthority: {status: "PASS"}, pixelAudit: {status: "PASS"}}));

const pass = auditWholeFilmTypographyRhythm({decisionSet: {items: decisions, sourceRevisionHash: "source"}, coveragePlan, videoPackagingContexts: contexts, packageLookMasterPlans: plans, rawReferences, requireSelectedPixels: true});
assert.equal(pass.status, "PASS");
assert.equal(pass.strongLanguageEventCount, 2);
assert.equal(pass.recalledAsPackageCount, 2);
assert.equal(pass.presenterTypographyOverlayCount, 2);
assert.equal(pass.missedStrongLanguageEvents.length, 0);
assert.equal(pass.exactPhraseProtectionFailures.length, 0);
assertWholeFilmTypographyRhythmAudit(pass, {requireSelectedPixels: true});

const contrastDecision = strong("ED-13", "CONTRAST_HEADLINE", "国产模型写中文确实会顺一些 / 问题也并没有彻底解决");
const contrastPlan = {
  shotId: "ED-13",
  planSha256: "ed13-plan",
  candidateId: "ED-13-candidate",
  exactCopy: {text: "不得不说，国产模型写中文确实会顺一些，但问题也并没有彻底解决。"},
  protectedPhrases: ["国产模型写中文确实会顺一些", "问题也并没有彻底解决"],
};
const contrastRaw = {
  shotId: "ED-13",
  candidateId: "ED-13-candidate",
  providerMode: "built-in-imagegen-tool",
  canonicalVisibleCopy: "更顺一些 / 没解决",
  ocrText: "更顺一些 没解决",
  actualPixelMetrics: {copyAuthority: "canonical-visible-copy-actor-v1"},
  ocrExactCopyAligned: true,
  semanticPixelAudit: {status: "PASS"},
  candidateAuditAuthority: {status: "PASS"},
  pixelAudit: {status: "PASS"},
};
const contrast = auditWholeFilmTypographyRhythm({
  decisionSet: {items: [contrastDecision]},
  coveragePlan: {shotPlans: [{...contrastDecision, route: "PACKAGE_LOOK_MASTER", eventGrouping: {mode: "OVERLAY"}}]},
  videoPackagingContexts: {items: [{shotId: "ED-13", assemblyMode: "OVERLAY", presentationMode: "OVERLAY"}]},
  packageLookMasterPlans: [{...contrastPlan, assemblyMode: "OVERLAY", presentationMode: "OVERLAY"}],
  rawReferences: [contrastRaw],
  requireSelectedPixels: true,
});
assert.equal(contrast.status, "PASS");
assert.deepEqual(contrast.exactPhraseProtectionFailures, []);

const missed = auditWholeFilmTypographyRhythm({decisionSet: {items: [{...decisions[0], packageDecision: "NO_PACKAGE", assemblyMode: null, presentationMode: null}]}, coveragePlan: {shotPlans: []}});
assert.equal(missed.status, "FAIL");
assert.equal(missed.missedStrongLanguageEvents.length, 1);

const modeMismatch = auditWholeFilmTypographyRhythm({decisionSet: {items: [{...decisions[0], presentationMode: "TYPOGRAPHY"}]}, coveragePlan, videoPackagingContexts: contexts});
assert.equal(modeMismatch.status, "FAIL");
assert.ok(modeMismatch.modeProjectionConsistencyFailures.some((item) => item.reason === "STRONG_LANGUAGE_MODE_MISMATCH"));

const pending = auditWholeFilmTypographyRhythm({decisionSet: {items: decisions}, coveragePlan, videoPackagingContexts: contexts, packageLookMasterPlans: plans, rawReferences: [], requireSelectedPixels: false});
assert.equal(pending.status, "PASS_WITH_PIXEL_PENDING");
assert.equal(pending.strongLanguageEventCount, pending.recalledAsPackageCount);

console.log(JSON.stringify({status: "PASS", strongLanguageEventCount: pass.strongLanguageEventCount, recalledAsPackageCount: pass.recalledAsPackageCount, treatmentDistribution: pass.treatmentDistribution, pendingPixelStatus: pending.status}, null, 2));
