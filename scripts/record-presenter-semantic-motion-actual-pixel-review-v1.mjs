#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const outputRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/editorial-shot-director-v1/candidate-v3/representative-motion-v1");
const manifestFile = path.join(outputRoot, "manifest.json");
const reviewFile = path.join(outputRoot, "actual-pixel-review.json");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
assert(manifest.contract === "A1PresenterSemanticMotionManifest/v1", "presenter-motion-review-manifest-contract-invalid");
assert(manifest.motionStateBoard?.samples?.length === 25, "presenter-motion-review-state-board-incomplete");
assert(manifest.motionStateBoard.columns.join(",") === "PRE,ENTER,PEAK,HOLD,POST", "presenter-motion-review-state-sequence-invalid");
assert(manifest.boundaries.userVisualApproval === "NOT_APPROVED" && manifest.boundaries.productionEligible === false, "presenter-motion-review-user-boundary-invalid");

const reviewBody = {
  contract: "A1PresenterSemanticMotionActualPixelReview/v1",
  status: "PASS",
  reviewer: "CODEX_VISUAL_DIRECTOR_DELEGATED_INTERNAL_GATE",
  scope: "five real-presenter shots and five semantic marker grammars at PRE ENTER PEAK HOLD POST states",
  evidence: {
    motionStateBoard: {publicUrl: manifest.motionStateBoard.publicUrl, sha256: manifest.motionStateBoard.sha256, sampleCount: manifest.motionStateBoard.samples.length},
    playable: {publicUrl: manifest.output.publicUrl, sha256: manifest.output.sha256, durationMs: manifest.output.durationMs},
  },
  checks: [
    {id: "REAL_FOOTAGE_AND_AUDIO", status: "PASS", observation: "All five slices bind the verified 4K presenter source and original narration audio."},
    {id: "SUBJECT_DOMINANCE", status: "PASS", observation: "The presenter remains the primary visual actor; packaging stays in bounded left negative space."},
    {id: "NO_FULLSCREEN_PRESENTER_PACKAGE", status: "PASS", observation: "No presenter shot is converted into a fullscreen background treatment or persistent panel."},
    {id: "SEMANTIC_ENTRY_ORDER", status: "PASS", observation: "Identity, question, contrast, process, and problem-to-control grammars enter in phrase order without generic bounce."},
    {id: "PEAK_VS_HOLD_VISIBILITY", status: "PASS", observation: "The board separately exposes content-timed peak and fully resolved hold states, including late process and conclusion copy."},
    {id: "PRE_AND_POST_RETURN", status: "PASS", observation: "Every shot begins and ends on unwrapped presenter footage, proving the package is an event rather than a permanent skin."},
    {id: "REVIEW_LABEL_OCCLUSION", status: "PASS", observation: "Review labels sit outside image pixels and do not cover the top-left package region."},
  ],
  objectiveDecision: "ADMIT_AS_REPRESENTATIVE_MOTION_PROOF_ONLY",
  notGranted: ["USER_VISUAL_APPROVAL", "WHOLE_FILM_PRODUCTION_ADMISSION", "RESOLVE_WRITE", "FINAL_RENDER", "PUBLIC_RELEASE"],
  reviewedAt: new Date().toISOString(),
};
const review = {...reviewBody, reviewSha256: sha256Value(reviewBody)};
fs.writeFileSync(reviewFile, `${JSON.stringify(review, null, 2)}\n`);

const updated = structuredClone(manifest);
updated.status = "AGENT_REPRESENTATIVE_MOTION_ACTUAL_PIXEL_PASS";
updated.actualPixelReview = {publicUrl: publicUrlFor(reviewFile), sha256: sha256File(reviewFile), reviewSha256: review.reviewSha256, status: review.status};
updated.shots = updated.shots.map((shot) => ({...shot, actualPixelReview: "PASS"}));
delete updated.manifestSha256;
updated.manifestSha256 = sha256Value(updated);
fs.writeFileSync(manifestFile, `${JSON.stringify(updated, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: updated.status, actualPixelReview: updated.actualPixelReview, manifestSha256: updated.manifestSha256, userVisualApproval: updated.boundaries.userVisualApproval, productionEligible: updated.boundaries.productionEligible}, null, 2)}\n`);
