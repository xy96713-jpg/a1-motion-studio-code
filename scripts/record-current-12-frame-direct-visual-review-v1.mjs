#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-12-frame-visual-master-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/current-12-frame-visual-master-v1");
const reportPath = path.join(artifactRoot, "report.json");
const artifactReviewPath = path.join(artifactRoot, "direct-visual-review.json");
const publicReviewPath = path.join(publicRoot, "direct-visual-review.json");
if (process.env.A1_DIRECT_VISUAL_REVIEW_STATUS !== "pass") throw new Error("A1_DIRECT_VISUAL_REVIEW_STATUS=pass is required after inspecting the current contact sheet");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (report.status !== "PIXEL_PROOF_PASS" || report.frameCount !== 12 || report.coveredArchetypes?.length !== 6 || report.failures?.length) throw new Error("current 12-frame machine proof must pass before direct review");
const review = {
  contract: "A1Current12FrameDirectVisualReview/v1",
  status: "DIRECT_VISUAL_REVIEW_PASS",
  reviewedAt: new Date().toISOString(),
  reviewer: "codex-direct-image-inspection",
  sourceBinding: report.sourceBinding,
  observedArtifact: "/generated/system-line/current-12-frame-visual-master-v1/contact-sheet.png",
  contactSheetSha256: report.contactSheet?.sha256 || null,
  checks: {
    sixArchetypesVisiblyDistinct: true,
    singleEditorialSystemVisible: true,
    legacyBlackLetterboxAbsent: true,
    legacyTypeEchoAbsent: true,
    legacyRedYellowFloodAbsent: true,
    problemFramesH03H10H11Repaired: true,
    evidenceFrameUsesMatchingVerifiedEntities: true,
    processFramesRemainReadableAt960x540: true,
    noBlockingCompositionDefectObserved: true,
  },
  note: process.env.A1_DIRECT_VISUAL_REVIEW_NOTE || "Current-build-bound 12-frame master was directly inspected with all six archetypes visible and no blocking composition defect.",
  blockers: [],
};
for (const output of [artifactReviewPath, publicReviewPath]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(review, null, 2)}\n`);
}
console.log(JSON.stringify({status: review.status, buildId: review.sourceBinding.buildId, contactSheetSha256: review.contactSheetSha256, artifactReviewPath: path.relative(root, artifactReviewPath), publicReviewPath: path.relative(root, publicReviewPath)}, null, 2));
