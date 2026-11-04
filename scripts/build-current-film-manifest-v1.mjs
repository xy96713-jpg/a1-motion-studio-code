#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {buildCurrentFilmManifest} from "../lib/current-film-manifest.js";

const root = process.cwd();
const manifest = buildCurrentFilmManifest(root);
const outputs = [
  path.join(root, ".codex-artifacts/system-progress-system-line/current-film-v1/current-film-manifest.json"),
  path.join(root, "apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json"),
];
for (const output of outputs) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
const packagingCandidate = manifest.adoptionLedger.items.find((item) => item.id === "picture-packaging-pilot-candidate");
const directedReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-semantic-directed-v1/report.json");
const packagingAuditPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-packaging-manifests-v1/audit.json");
const directedReport = fs.existsSync(directedReportPath) ? JSON.parse(fs.readFileSync(directedReportPath, "utf8")) : null;
const packagingAudit = fs.existsSync(packagingAuditPath) ? JSON.parse(fs.readFileSync(packagingAuditPath, "utf8")) : null;
const directedReviewReady = directedReport?.contract === "A1HSeriesSemanticDirectedReview/v1"
  && directedReport.status === "READY_FOR_DIRECT_REVIEW"
  && directedReport.director?.sceneCount === 47
  && directedReport.continuityProof?.chapterOverlapFrames === 0
  && packagingAudit?.status === "PASS_REVIEW_ONLY";
const currentPhase = {
  contract: "A1SystemLineCurrentPhase/v1",
  generatedAt: new Date().toISOString(),
  phaseId: directedReviewReady ? "h-series-semantic-directed-v1" : packagingCandidate?.directReviewReady ? "picture-packaging-pilot-v1" : manifest.state.toLowerCase(),
  status: directedReviewReady || packagingCandidate?.directReviewReady ? "ready-for-direct-review" : "active",
  authority: {
    kind: directedReviewReady ? "directed-review-pointer" : "derived-pointer-only",
    manifestPath: directedReviewReady
      ? "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json"
      : "apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json",
    buildId: directedReviewReady ? directedReport.sourceBinding.directorPlanSha256 : manifest.current.buildId,
    state: directedReviewReady ? "DIRECTED_REVIEW_READY" : manifest.state,
  },
  reviewDecision: {
    status: directedReviewReady ? "awaiting-direct-visual-review" : manifest.reviewDecision?.status || "not-reviewed",
    finalRenderAllowed: directedReviewReady ? false : manifest.finalRenderAllowed,
    resolveExportAllowed: directedReviewReady ? false : manifest.resolveExportAllowed,
  },
  proof: directedReviewReady ? {
    reportPath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json",
    videoPublicUrl: directedReport.media.video.publicUrl,
    videoSha256: directedReport.media.video.sha256,
    contactSheetPublicUrl: "/generated/system-line/h-series-semantic-directed-v1/contact-sheet.png",
    directorPlanSha256: directedReport.sourceBinding.directorPlanSha256,
    directedRendererSha256: directedReport.sourceBinding.directedRendererSha256,
    sceneCount: directedReport.director.sceneCount,
    macroCount: directedReport.director.macroCount,
    chapterOverlapFrames: directedReport.continuityProof.chapterOverlapFrames,
  } : undefined,
  next: {
    recommended: {
      id: directedReviewReady ? "direct-review-47-shot-semantic-directed-mainline" : manifest.nextAction,
      reason: directedReviewReady
        ? "The full 47-shot animation and design packaging review is renderer-bound, audio-bound, and ready for direct visual review. Host appearance and recording cuts remain user decisions."
        : packagingCandidate?.directReviewReady
        ? "A pure animation and design packaging pilot is ready. The user remains the sole authority for host appearance, screen-recording and cut timing; this proof has no main-timeline placement."
        : "Follow the next action declared by the current-film authority manifest.",
      requiresExplicitApproval: false,
      riskTags: directedReviewReady
        ? ["review-only-candidate", "47-shot-directed", "source-audio-bound", "zero-chapter-overlap", "user-editorial-authority", "no-final-render"]
        : packagingCandidate?.directReviewReady
        ? ["review-only-candidate", "placement-unassigned", "user-editorial-authority", "current-props-unchanged", "no-final-render"]
        : ["current-film-authority"],
    },
  },
};
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
fs.mkdirSync(path.dirname(currentPhasePath), {recursive: true});
fs.writeFileSync(currentPhasePath, `${JSON.stringify(currentPhase, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  contract: manifest.contract,
  state: manifest.state,
  buildId: manifest.current.buildId,
  storyboardRendererParity: manifest.gates.board.storyboardRendererParity,
  assetGate: manifest.gates.assets.pass,
  currentPreviewGate: manifest.gates.currentPreview.pass,
  finalRenderAllowed: manifest.finalRenderAllowed,
  legacyArtifacts: manifest.legacyArtifacts,
  outputs: outputs.map((output) => path.relative(root, output)),
  currentPhase: path.relative(root, currentPhasePath),
  nextAction: manifest.nextAction,
}, null, 2));
