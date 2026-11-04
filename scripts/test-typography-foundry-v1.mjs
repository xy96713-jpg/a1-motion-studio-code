#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildArticlePackagingKit, reviewArticlePackagingKit} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {assertTypographyFoundry, buildTypographyFoundry, reviewTypographyPhrase} from "../apps/studio-next/src/lib/a1-typography-foundry-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const original = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const seed = structuredClone(original);
delete seed.production.typographyFoundry;

const initial = assertTypographyFoundry(buildTypographyFoundry(seed, "2026-08-02T12:00:00.000Z"), seed);
const expectedCandidateCount = seed.library.assets
  .filter((asset) => asset.typographySpec?.exactText)
  .reduce((count, asset) => count + (asset.typographySpec.generatedCandidates?.length || 0), 0);
if (initial.summary.phraseCount !== 4 || initial.summary.candidateCount !== expectedCandidateCount || initial.summary.approvedPhraseCount !== 0) throw new Error("typography-foundry-initial-summary-invalid");
if (initial.phrases.some((phrase) => phrase.candidates.length < 4 || !phrase.contextualFrame || phrase.selectedCandidateId)) throw new Error("typography-foundry-initial-phrase-invalid");

seed.production.typographyFoundry = initial;
const pendingKit = buildArticlePackagingKit(seed, "2026-08-02T12:00:01.000Z");
if (pendingKit.lanes.generatedGlyphs.length !== 0 || pendingKit.gates.typographyFoundryApproved !== false) throw new Error("typography-foundry-pending-kit-must-not-bind-glyphs");
let blocked = false;
try {
  reviewArticlePackagingKit(seed, "approved", "must block", "2026-08-02T12:00:02.000Z");
} catch (error) {
  blocked = error instanceof Error && error.message === "typography-foundry-approval-required";
}
if (!blocked) throw new Error("typography-foundry-package-approval-gate-missing");

let reviewed = seed;
for (const phrase of initial.phrases) {
  reviewed = reviewTypographyPhrase(reviewed, phrase.assetId, phrase.suggestedCandidateId, "approved", `test select ${phrase.suggestedCandidateId}`, "2026-08-02T12:01:00.000Z");
}
const approved = assertTypographyFoundry(reviewed.production.typographyFoundry, reviewed);
if (approved.status !== "approved" || approved.summary.approvedPhraseCount !== 4 || approved.acceptedTreatments.length !== 4 || approved.gates.packagingKitApprovalAllowed !== true) throw new Error("typography-foundry-approval-incomplete");
if (approved.acceptedTreatments.some((treatment) => treatment.contract !== "A1AcceptedTypographyTreatment/v1" || treatment.editableTextLayer.required !== true || treatment.policies.editableTextRemainsAuthoritative !== true)) throw new Error("accepted-typography-treatment-invalid");

reviewed.production.articlePackagingKit = buildArticlePackagingKit(reviewed, "2026-08-02T12:02:00.000Z");
if (reviewed.production.articlePackagingKit.lanes.generatedGlyphs.length !== 4 || reviewed.production.articlePackagingKit.gates.typographyFoundryApproved !== true) throw new Error("typography-foundry-approved-kit-bindings-invalid");
const packaged = reviewArticlePackagingKit(reviewed, "approved", "test approval", "2026-08-02T12:03:00.000Z");
if (packaged.production.articlePackagingKit.review.status !== "approved" || packaged.production.articlePackagingKit.gates.shotCompositionAllowed !== true) throw new Error("typography-foundry-package-approval-failed");

console.log(JSON.stringify({status: "PASS", phrases: approved.summary.phraseCount, candidates: approved.summary.candidateCount, acceptedTreatments: approved.acceptedTreatments.length, pendingKitGlyphs: pendingKit.lanes.generatedGlyphs.length, approvedKitGlyphs: packaged.production.articlePackagingKit.lanes.generatedGlyphs.length}, null, 2));
