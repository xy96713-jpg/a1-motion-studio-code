#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertActualPixelTasteReviewInput} from "../apps/studio-next/src/lib/a1-pinterest-taste-profile-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const canaryRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/ed13-direction-bound-canary-v1");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const phaseBefore = fs.readFileSync(phasePath);
const decisions = {
  "ED-13-A": {
    humanVerdict: "VISUAL_REVISE_REQUIRED",
    disposition: "ONLY_REPAIR_PARENT",
    strengths: ["original chibi proofreader has authored personality", "one-bit character, proof-red rail and cyan dots establish a recognisable column language", "background exists", "character remains the lead"],
    hardFailures: ["SEMANTIC_READS_AS_PRINTER_JAM_NOT_SURFACE_SMOOTHER_ROOT_UNRESOLVED", "RED_RAIL_READS_AS_POWER_CABLE_NOT_ONE_PROOF_TRACK", "WARM_CREAM_CANVAS_VIOLATES_NEUTRAL_COOL_POLICY", "BACKGROUND_TEXTURE_NOT_LOCAL_ENOUGH", "MULTIPLE_PIXEL_AND_HALFTONE_SCALES", "CHARACTER_TOO_LARGE_MECHANISM_TOO_SMALL"],
    repairInstruction: "Keep the proofreader identity but reduce to 35–42%. Build one proof path: rough broken input tape, two rollers, smooth continuous output tape, then the same rail descends into a locked red root knot. The red pencil must point to both the smooth output and lower blockage. Use cool white/light gray canvas, local cyan dots, at least 35% connected quiet field, one low-resolution grid only, no text or pseudo-text.",
  },
  "ED-13-B": {
    humanVerdict: "VISUAL_REJECTED",
    disposition: "HISTORY_ONLY_NO_REPAIR",
    strengths: [],
    hardFailures: ["FULL_RIGHT_SCANLINE_FIELD_COMPETES_WITH_ACTION", "LARGE_CYAN_GRID_AND_MACHINE_DETAILS_OVERWEIGHT", "GENERIC_RETRO_GAME_POSTER", "MACHINE_TOO_DOMINANT", "PSEUDO_TEXT_OR_SYMBOL_RISK", "RANDOM_SPAGHETTI_KNOT", "SMOOTH_SURFACE_NOT_READABLE", "CRT_EXCEEDS_ONE_SEMANTIC_ACTION"],
    repairInstruction: "No repair. Retain as rejected evidence only.",
  },
};
const records = [];
for (const variant of Object.keys(decisions)) {
  const receiptPath = path.join(canaryRoot, "receipts", `${variant.toLowerCase()}.json`);
  const receipt = readJson(receiptPath);
  const decision = decisions[variant];
  const review = structuredClone(receipt.actualPixelTasteReviewInput);
  review.artifactSha256 = receipt.originalImagegenSource.sha256;
  review.humanVerdict = decision.humanVerdict;
  review.humanReviewerId = "independent-visual-director-thread-019ff3d7-7f18-7570-b3c2-cdf8d037bcc6";
  review.hardFailures = [...decision.hardFailures];
  review.repairInstruction = decision.repairInstruction;
  delete review.reviewInputSha256;
  review.reviewInputSha256 = hash(review);
  assertActualPixelTasteReviewInput(review);
  const body = {
    contract: "A1Ed13IndependentVisualDirectorReview/v1",
    status: decision.humanVerdict,
    shotId: "ED-13",
    selectedVariantId: variant,
    disposition: decision.disposition,
    source: {
      originalImagegenPath: receipt.originalImagegenSource.path,
      originalImagegenSha256: receipt.originalImagegenSource.sha256,
      normalizedCandidateSha256: receipt.mediaCommit.contentSha256,
      candidateReceiptSha256: receipt.receiptSha256,
      candidateLineageSha256: receipt.lineage.lineageSha256,
      directionAuthoritySha256: receipt.directionAuthoritySha256,
      selectedDirectionSha256: receipt.lineage.visualDirection.selectedDirectionSha256,
      requestSha256: receipt.requestSha256,
    },
    strengths: decision.strengths,
    hardFailures: decision.hardFailures,
    repairInstruction: decision.repairInstruction,
    actualPixelTasteReview: review,
    gate: {productionAdmitted: false, userVisualApproval: "NOT_APPROVED", machinePassCannotOverride: true, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false},
    reviewedAt: "2026-08-13T04:08:00.000Z",
  };
  const record = {...body, reviewSha256: hash(body)};
  fs.mkdirSync(path.join(canaryRoot, "independent-visual-review"), {recursive: true});
  fs.writeFileSync(path.join(canaryRoot, "independent-visual-review", `${variant.toLowerCase()}.json`), `${JSON.stringify(record, null, 2)}\n`);
  records.push(record);
}
const index = {contract: "A1Ed13IndependentVisualDirectorReviewIndex/v1", status: "ONE_REPAIR_ALLOWED_FOR_A_ONLY", directionAuthoritySha256: records[0].source.directionAuthoritySha256, decisions: records.map((record) => ({selectedVariantId: record.selectedVariantId, verdict: record.status, disposition: record.disposition, reviewSha256: record.reviewSha256, originalImagegenSha256: record.source.originalImagegenSha256})), repairBudget: {selectedVariantId: "ED-13-A", maximumAttempts: 1, usedAttempts: 0}, boundary: {userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}};
index.indexSha256 = hash(index);
fs.writeFileSync(path.join(canaryRoot, "independent-visual-review", "index.json"), `${JSON.stringify(index, null, 2)}\n`);
if (!fs.readFileSync(phasePath).equals(phaseBefore)) throw new Error("ed13-independent-review-invalid:phase-mutated");
console.log(JSON.stringify(index, null, 2));
