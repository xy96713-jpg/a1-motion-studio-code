#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  A1_DEFAULT_EFFECT_PRIMITIVE_IDS,
  assertDefaultEffectPrimitiveContinuation,
  assertDefaultEffectPrimitiveReview,
} from "../apps/studio-next/src/lib/a1-default-effect-primitives-v1.mjs";

const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
const frozenBoundaries = {motion: true, resolve: true, finalRender: true, wholeFilmExpansion: true};
const candidates = A1_DEFAULT_EFFECT_PRIMITIVE_IDS.map((candidateId, index) => ({
  candidateId,
  assetKind: index >= 2 && index <= 3 ? "BACKGROUND_FIELD" : "TRANSPARENT_EFFECT_OVERLAY",
  effectFamily: index <= 1 ? "CRT_SCANLINE" : index <= 3 ? "PROCESS_CONTOUR" : index === 4 ? "SIGNAL_TEAR" : "DITHER_EROSION",
  alphaChannelRequired: !(index >= 2 && index <= 3),
  publicUrl: `/generated/${candidateId}.png`,
  sha256: "a".repeat(64),
  width: 1920,
  height: 1080,
  mimeType: "image/png",
  styleBriefSha256: "b".repeat(64),
  composite: {publicUrl: `/generated/${candidateId}-composite.png`, sha256: "c".repeat(64), width: 1920, height: 1080},
  machineStatus: "PASS",
  visualReviewStatus: "READY_FOR_USER_REVIEW",
  currentDirectionApproved: false,
  productionAdmitted: false,
}));
const reviewBody = {contract: "A1DefaultEffectPrimitiveReview/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", candidateCount: 6, candidates, reviewSheet: {publicUrl: "/generated/review-sheet.png", sha256: "d".repeat(64), width: 1920, height: 1460}, usagePolicy: {maximumCrtFamilyInAnySix: 2, globalFilterForbidden: true, semanticActionRequired: true}, machinePassCannotApprove: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, frozenBoundaries};
const review = assertDefaultEffectPrimitiveReview({...reviewBody, reviewSha256: sha256(reviewBody)});
const continuationBody = {contract: "A1DefaultEffectPrimitiveContinuation/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", authorizationSource: "CURRENT_THREAD_EXECUTE_DIRECTIVE", reviewSha256: review.reviewSha256, review, productionAdmitted: false, frozenBoundaries};
const continuation = assertDefaultEffectPrimitiveContinuation({...continuationBody, continuationSha256: sha256(continuationBody)});

assert.equal(continuation.review.candidateCount, 6);
assert.throws(() => assertDefaultEffectPrimitiveReview({...review, userVisualApproval: "APPROVED"}), /default-effect-review-boundary-invalid/u);
assert.throws(() => assertDefaultEffectPrimitiveReview({...review, candidates: review.candidates.slice(1)}), /default-effect-review-candidate-set-invalid/u);

console.log(JSON.stringify({status: "PASS", reviewContract: review.contract, continuationContract: continuation.contract, candidateCount: review.candidateCount}, null, 2));
