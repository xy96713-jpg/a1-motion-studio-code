#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildPackageLookMasterPrompt, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {compileShotSemanticDesignBriefSet} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {buildPackageSemanticPixelAudit} from "../apps/studio-next/src/lib/a1-package-semantic-pixel-audit-v1.mjs";
import crypto from "node:crypto";

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "workspace.json"), "utf8"));
const directorRun = JSON.parse(fs.readFileSync(path.join(publicRoot, "whole-film-director-input.json"), "utf8"));
for (const shot of directorRun.plan.shots) {
  shot.viewerQuestion ||= `观众是否理解：${shot.viewerTakeaway}`;
  shot.semanticActor ||= {identity: shot.primaryActor, action: shot.visualJob, beforeState: `变化前：${shot.narrativeJob}`, afterState: shot.viewerTakeaway, target: shot.viewerTakeaway};
}
const briefs = compileShotSemanticDesignBriefSet({workspace, directorRun, appRoot, now: "2026-08-05T12:00:00.000Z"});
const brief = briefs.briefs.find((item) => item.shotId === "ED-17");
const plan = structuredClone(workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-17"));
plan.dataChainVersion = 3;
plan.shotSourceHash = brief.shotSourceHash;
plan.semanticDesignBrief = brief;
plan.semanticDesignBriefSha256 = brief.briefSha256;
plan.semanticJob = brief.narrativeJob;
plan.viewerTakeaway = brief.viewerTakeaway;
plan.viewerQuestion = brief.viewerQuestion;
plan.styleBinding.styleProfileId = "minimal-retro-pixel-editorial-v2";
plan.styleBinding.simplicityPolicy = {contract: "A1EditorialSimplicityPolicy/v1", oneGlanceReadingPathRequired: true, maxDominantMasses: 2, maxCompositionClusters: 2, maxDecorativeMotifs: 0, minimumQuietFieldRatio: 0.35, removalPassRequired: true, textureMustBuildForm: true};
plan.planSha256 = sha256(planIdentity(plan));
const prompt = buildPackageLookMasterPrompt(plan, 1);
const first1200 = prompt.slice(0, 1200);
assert.ok(first1200.includes(brief.articleThesis));
assert.ok(first1200.includes(brief.context.currentSummary));
assert.ok(first1200.includes(brief.viewerTakeaway));
assert.ok(first1200.includes(brief.semanticActor.identity));
assert.ok(first1200.includes(plan.exactCopy.text));
assert.ok(prompt.indexOf("ARTICLE THESIS") < prompt.indexOf("AESTHETIC GRAMMAR ONLY"));
assert.ok(prompt.length < 9000, "compiled prompt must stay bounded after typography, presenter-safety, evidence, style, and simplicity contracts");
assert.match(prompt, /Video context: concise production fields only/u);
assert.doesNotMatch(prompt, /availableRegions|averageLuminance|contextSha256|sourceAssetSha256/u);
assert.match(prompt, /one primary reading path/u);
assert.match(prompt, /Remove every object/u);
assert.match(prompt, /Halftone must build form/u);

const styleSource = fs.readFileSync(path.join(appRoot, "src/lib/a1-retro-pixel-editorial-style-v1.mjs"), "utf8");
for (const forbidden of ["完成度很高", "常见、稳妥、可复用", "vibe coding 智能写作工作台", "给决定方向与保留作者风格"]) assert.ok(!styleSource.includes(forbidden), `style fallback still contains article phrase: ${forbidden}`);

const rejected = buildPackageSemanticPixelAudit({brief, artifact: {publicUrl: "/generated/system-line/pilot.png", sha256: "c".repeat(64)}, assessment: {mode: "ACTUAL_PIXEL_VISUAL_REVIEW", viewerTakeawayMatch: true, actorActionMatch: false, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true}});
assert.equal(rejected.status, "VISUAL_REJECTED");
const overdesigned = buildPackageSemanticPixelAudit({brief, artifact: {publicUrl: "/generated/system-line/pilot.png", sha256: "d".repeat(64)}, assessment: {mode: "ACTUAL_PIXEL_VISUAL_REVIEW", viewerTakeawayMatch: true, actorActionMatch: true, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: false, singleReadingPath: false, decorativeMotifFree: false}});
assert.equal(overdesigned.status, "VISUAL_REJECTED");
const copiedReference = buildPackageSemanticPixelAudit({brief, artifact: {publicUrl: "/generated/system-line/pilot.png", sha256: "f".repeat(64)}, assessment: {mode: "ACTUAL_PIXEL_VISUAL_REVIEW", viewerTakeawayMatch: true, actorActionMatch: true, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true, referenceCopyDetected: true}});
assert.equal(copiedReference.status, "VISUAL_REJECTED");
const accepted = buildPackageSemanticPixelAudit({brief, artifact: {publicUrl: "/generated/system-line/pilot.png", sha256: "e".repeat(64)}, assessment: {mode: "ACTUAL_PIXEL_VISUAL_REVIEW", viewerTakeawayMatch: true, actorActionMatch: true, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true}});
assert.equal(accepted.status, "PASS");
assert.throws(() => buildPackageSemanticPixelAudit({brief, artifact: {publicUrl: "/generated/system-line/pilot.png", sha256: "c".repeat(64)}, assessment: {viewerTakeawayMatch: true}}), /actual-review-required/u);

console.log(JSON.stringify({contract: "A1PackageLookMasterSemanticChainTest/v1", status: "PASS", checks: {semanticBeforeStyle: true, exactCopyWithinFirst1200: true, fullArticleContextPresent: true, rawVideoJsonExcluded: true, articleFallbackPhrasesRemoved: true, simplicityPromptBound: true, overdesignedPixelsRejected: true, pixelSemanticFailureRejects: true, fieldPresenceCannotPassPixelAudit: true, copiedReferenceIsRejected: true}}, null, 2));
