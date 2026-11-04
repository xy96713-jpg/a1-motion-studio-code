#!/usr/bin/env node

import assert from "node:assert/strict";
import {buildDefaultTypographyTemplateContinuation, buildDefaultTypographyTemplateReview} from "../apps/studio-next/src/lib/a1-default-typography-template-review-v1.mjs";

const sha = "b".repeat(64);
const templates = Array.from({length: 1}, (_, index) => ({templateId: `template-${index}`, exactText: `标题${index}`, editableText: true, machineStatus: "PASS", visualReviewStatus: "READY_FOR_USER_REVIEW", currentDirectionApproved: false, productionAdmitted: false, width: 1920, height: 1080, mimeType: "image/png", fontId: "type-pixel-correction", fontFamily: "Fusion Pixel", sha256: sha, fontFileSha256: sha, layoutSpecSha256: sha}));
const historyOnlyTemplates = Array.from({length: 5}, (_, index) => ({templateId: `history-${index}`, status: "SUPERSEDED", historyOnly: true, reason: "test"}));
const review = buildDefaultTypographyTemplateReview({templates, historyOnlyTemplates, reviewSheet: {sha256: sha, width: 1920, height: 960}, createdAt: "2026-08-14T00:00:00.000Z"});
const continuation = buildDefaultTypographyTemplateContinuation({review, userDirective: "继续吧", createdAt: "2026-08-14T00:00:01.000Z"});
assert.equal(review.templateCount, 1);
assert.equal(review.policies.generatedFormalTextAllowed, false);
assert.equal(continuation.productionAdmitted, false);
assert.throws(() => buildDefaultTypographyTemplateReview({templates: [], historyOnlyTemplates, reviewSheet: {sha256: sha, width: 1920, height: 960}}), /default-typography-template-review-contract-invalid/u);
console.log(JSON.stringify({status: "PASS", templateCount: review.templateCount, reviewSha256: review.reviewSha256, continuationSha256: continuation.continuationSha256}, null, 2));
