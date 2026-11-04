#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const authorityReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json");
const macroReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-macro-review-index-v1/report.json");
const queueReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-visual-fix-queue-v1/report.json");
const preproductionReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/report.json");
const preproductionPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/director-plan.json");
const candidateReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/report.json");
const continuityManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesContinuityManifest.json");
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
for (const file of [phasePath, authorityReportPath, macroReportPath, queueReportPath, preproductionReportPath, preproductionPlanPath, candidateReportPath, continuityManifestPath]) if (!fs.existsSync(file)) throw new Error(`required-file-missing:${path.relative(root, file)}`);
const phase = readJson(phasePath);
const authority = readJson(authorityReportPath);
const macro = readJson(macroReportPath);
const queue = readJson(queueReportPath);
const preproduction = readJson(preproductionReportPath);
const candidate = readJson(candidateReportPath);
const continuityManifest = readJson(continuityManifestPath);
const authorityVideoSha256 = authority.media.video.sha256;
if (sha256(authorityReportPath) !== macro.sourceBinding.reportSha256 || macro.sourceBinding.videoSha256 !== authorityVideoSha256 || queue.source.propsSha256 !== authority.sourceBinding.propsSha256 || queue.source.semanticReportSha256 !== macro.sourceBinding.reportSha256) throw new Error("current-review-artifacts-binding-mismatch");
if (preproduction.contract !== "A1HSeriesPreproductionDirectorReport/v1" || preproduction.status !== "READY_FOR_PREPRODUCTION_REVIEW" || preproduction.summary?.sceneCount !== 47) throw new Error("preproduction-director-pointer-invalid");
const preproductionPhase = {
  status: preproduction.status,
  reportPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/report.json",
  reportSha256: sha256(preproductionReportPath),
  directorPlanPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/director-plan.json",
  directorPlanSha256: sha256(preproductionPlanPath),
  anchorContactSheetPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/anchor-contact-sheet.png",
  anchorContactSheetSha256: sha256(path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/anchor-contact-sheet.png")),
  h01StaticBoardContactSheetPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/h01-static-board-contact-sheet.png",
  h01StaticBoardContactSheetSha256: sha256(path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/h01-static-board-contact-sheet.png")),
  h02StaticBoardContactSheetPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/h02-static-board-contact-sheet.png",
  h02StaticBoardContactSheetSha256: sha256(path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/h02-static-board-contact-sheet.png")),
  h03StaticBoardContactSheetPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/h03-static-board-contact-sheet.png",
  h03StaticBoardContactSheetSha256: sha256(path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/h03-static-board-contact-sheet.png")),
  h08StaticBoardContactSheetPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/h08-static-board-contact-sheet.png",
  h08StaticBoardContactSheetSha256: sha256(path.join(root, "apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/h08-static-board-contact-sheet.png")),
  remainingStaticBoardContactSheets: Object.fromEntries(Object.entries(preproduction.media?.remainingContactSheets || {}).map(([macroId, media]) => [macroId, {
    path: `apps/studio-next/public/generated/system-line/h-series-preproduction-director-v1/${macroId.toLowerCase()}-static-board-contact-sheet.png`,
    sha256: media.sha256,
  }])),
  sceneCount: preproduction.summary.sceneCount,
  anchorCount: preproduction.anchorBeatIds?.length || 0,
  h01StaticShotCount: preproduction.summary.h01StaticShotCount,
  h02StaticShotCount: preproduction.summary.h02StaticShotCount,
  h03StaticShotCount: preproduction.summary.h03StaticShotCount,
  h08StaticShotCount: preproduction.summary.h08StaticShotCount,
  remainingStaticShotCount: preproduction.summary.remainingStaticShotCount,
  animationDesignAllowed: false,
  fullMp4RenderAllowed: false,
};
phase.reviewPacket = {
  contract: "A1HSeriesCurrentReviewPacket/v1",
  status: "READY_FOR_DIRECT_REVIEW",
  authorityPhaseId: "h-series-semantic-directed-v1",
  authorityReportPath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json",
  authorityReportSha256: sha256(authorityReportPath),
  authorityVideoPath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/review-960x540-with-source-audio.mp4",
  authorityVideoSha256,
  propsPath: "remotion-renderer/src/generated/microbeatLayeredFullProps.json",
  propsSha256: authority.sourceBinding.propsSha256,
  macroIndexPath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-macro-review-index-v1/report.json",
  macroIndexSha256: sha256(macroReportPath),
  macroCount: macro.summary.macroCount,
  sceneCount: macro.summary.totalSceneCount,
  visualFixQueuePath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-visual-fix-queue-v1/report.json",
  visualFixQueueSha256: sha256(queueReportPath),
  visualFixCount: queue.summary.targetItemCount,
  candidateReportPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/report.json",
  candidateReportSha256: sha256(candidateReportPath),
  continuity: {
    contract: continuityManifest.contract,
    status: continuityManifest.status,
    reviewOnly: continuityManifest.reviewOnly === true,
    finalRenderAllowed: continuityManifest.finalRenderAllowed === true,
    manifestPath: "remotion-renderer/src/generated/hSeriesContinuityManifest.json",
    manifestSha256: sha256(continuityManifestPath),
    sourcePropsSha256: continuityManifest.sourceBinding?.propsSha256 || null,
    sceneCount: candidate.continuityCoverage?.sceneCount || 0,
    transitionCount: candidate.continuityCoverage?.transitionCount || 0,
    motifCount: candidate.continuityCoverage?.motifCount || 0,
    motifChangeCount: candidate.continuityCoverage?.motifChangeCount || 0,
    sameMotifCarryCount: candidate.continuityCoverage?.sameMotifCarryCount || 0,
    allScenesBound: candidate.continuityCoverage?.allScenesBound === true,
    allBoundariesDeclared: candidate.continuityCoverage?.allBoundariesDeclared === true,
    ordered: candidate.continuityCoverage?.ordered === true,
    fieldsBound: candidate.continuityCoverage?.fieldsBound === true,
    sourcePropsBound: candidate.continuityCoverage?.sourcePropsBound === true,
  },
  candidateReview: {
    contract: "A1HSeriesCandidateReviewGate/v1",
    status: "PENDING_USER_VISUAL_REVIEW",
    candidateSceneCount: candidate.reviewLedger?.items?.length || 0,
    candidatePropsSha256: candidate.sourceBinding?.candidateProps?.sha256 || null,
    reviewLedgerPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/review-decisions.json",
    adoptionApprovalPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/adoption-approval.json",
    adoptionApprovalStatus: "PENDING_USER_VISUAL_REVIEW",
    rendererAdoptionAllowed: false,
    applyAllowed: false,
    fullRenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    nextAction: "review-47-shot-ledger-then-explicitly-approve-adoption",
  },
  userApprovalStatus: "not-approved",
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  nextAction: "review-47-shot-ledger-then-explicitly-approve-adoption",
  updatedAt: new Date().toISOString(),
};
phase.continuity = phase.reviewPacket.continuity;
phase.preproduction = preproductionPhase;
phase.preproductionMotionCandidate = {
  phaseId: "h-series-preproduction-motion-candidate-v1",
  status: candidate.status,
  reportPath: "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/report.json",
  reportSha256: sha256(candidateReportPath),
  candidatePropsPath: candidate.sourceBinding?.candidateProps?.path || ".codex-artifacts/system-progress-system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json",
  candidatePropsSha256: candidate.sourceBinding?.candidateProps?.sha256 || null,
  sceneCount: candidate.summary?.candidateSceneCount || candidate.scenes?.length || 0,
  selectedSceneCount: candidate.selectedBeatIds?.length || 0,
  reviewOnly: candidate.reviewOnly === true,
  userApprovalStatus: candidate.userApprovalStatus || "not-approved",
  rendererAdoptionAllowed: candidate.rendererAdoptionAllowed === true,
  fullMp4RenderAllowed: candidate.fullMp4RenderAllowed === true,
  finalRenderAllowed: candidate.finalRenderAllowed === true,
  resolveExportAllowed: candidate.resolveExportAllowed === true,
};
phase.next = {
  recommended: {
    id: "review-47-shot-ledger-then-explicitly-approve-adoption",
    reason: "从唯一逐镜审片入口完成 47 镜视觉决定；全部通过后仍需明确批准采用，之前不进入源素材采用或整片渲染。",
    requiresExplicitApproval: false,
    riskTags: ["preproduction-only", "47-shot-current-intersection", "all-47-static-shots", "candidate-version-bound", "no-full-mp4", "stale-50-shot-plan-excluded"],
  },
};
phase.status = "ready-for-direct-review";
phase.reviewDecision = {...phase.reviewDecision, status: "awaiting-direct-visual-review", finalRenderAllowed: false, resolveExportAllowed: false};
fs.writeFileSync(phasePath, `${JSON.stringify(phase, null, 2)}\n`);
console.log(JSON.stringify({status: phase.reviewPacket.status, authorityVideoSha256, propsSha256: phase.reviewPacket.propsSha256, macroCount: phase.reviewPacket.macroCount, sceneCount: phase.reviewPacket.sceneCount, visualFixCount: phase.reviewPacket.visualFixCount, nextAction: phase.reviewPacket.nextAction}, null, 2));
