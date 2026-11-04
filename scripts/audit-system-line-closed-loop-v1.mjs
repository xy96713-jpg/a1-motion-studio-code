#!/usr/bin/env node
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const expected = {
  worktreeBasename: "a1-motion-studio-system-line",
  branch: "codex/system-maturity-line-20260722",
  frontendPort: 4311,
  forbiddenPort: 4310,
  phaseId: "h-series-semantic-directed-v1",
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
  crossArticleRenderNextGate: "cross-article-h-baseline-quality-v1",
  hBaselineQualityNextGate: "entity-evidence-motion-quality-proof-v1",
  entityMotionQualityNextGate: "h-series-entity-motion-frame-proof-v1",
  entityMotionFrameProofNextGate: "refresh-h-series-540p-review-mp4-after-entity-frame-proof-v1",
  nextGate: "human-review-h-series-540p-film-v1",
  humanReviewPacketNextGate: "await-explicit-user-approval-or-targeted-fix-list",
  preproductionNextAction: "review-47-shot-ledger-then-explicitly-approve-adoption",
};

const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const reportRoot = path.join(artifactRoot, "system-line-closed-loop-v1");
const reportPath = path.join(reportRoot, "report.json");
const publicRoot = path.join(root, "apps/studio-next/public");
const publicReportRoot = path.join(publicRoot, "generated/system-line/system-line-closed-loop-v1");
const publicReportPath = path.join(publicReportRoot, "report.json");
const isolatedAssetRoots = [
  path.join(root, "remotion-renderer/public"),
  path.join(publicRoot, "generated/system-line"),
];

const paths = {
  currentPhase: path.join(artifactRoot, "current-phase.json"),
  currentAuthorityAudit: path.join(artifactRoot, "h-series-current-authority-v1/report.json"),
  currentAuthorityAuditPublic: path.join(publicRoot, "generated/system-line/h-series-current-authority-v1/report.json"),
  wholeFilmDirectorPlan: path.join(artifactRoot, "whole-film-director-v1/director-plan.json"),
  wholeFilmDirectorPlanPublic: path.join(publicRoot, "generated/system-line/whole-film-director-v1/director-plan.json"),
  wholeFilmDirectorReport: path.join(artifactRoot, "whole-film-director-v1/report.json"),
  wholeFilmDirectorReportPublic: path.join(publicRoot, "generated/system-line/whole-film-director-v1/report.json"),
  wholeFilmDirectorAudit: path.join(artifactRoot, "whole-film-director-v1/audit.json"),
  wholeFilmDirectorAuditPublic: path.join(publicRoot, "generated/system-line/whole-film-director-v1/audit.json"),
  directedReview: path.join(artifactRoot, "h-series-semantic-directed-v1/report.json"),
  directedReviewPublic: path.join(publicRoot, "generated/system-line/h-series-semantic-directed-v1/report.json"),
  directedReviewVideo: path.join(publicRoot, "generated/system-line/h-series-semantic-directed-v1/review-960x540-with-source-audio.mp4"),
  directedReviewContactSheet: path.join(publicRoot, "generated/system-line/h-series-semantic-directed-v1/contact-sheet.png"),
  directedRenderer: path.join(root, "remotion-renderer/src/HSeriesSemanticDirectedStage.tsx"),
  directorPlan: path.join(root, "remotion-renderer/src/hSeriesSemanticDirectorPlan.json"),
  typographyDirection: path.join(artifactRoot, "h-series-typography-direction-v1/report.json"),
  typographyDirectionPublic: path.join(publicRoot, "generated/system-line/h-series-typography-direction-v1/report.json"),
  typographyDirectionContactSheet: path.join(publicRoot, "generated/system-line/h-series-typography-direction-v1/contact-sheet.png"),
  typographyDirectionPlan: path.join(root, "remotion-renderer/src/typography-candidate/hSeriesTypographyDirectorPlan.json"),
  typographyDirectionRenderer: path.join(root, "remotion-renderer/src/typography-candidate/HSeriesTypographyCandidate.tsx"),
  preproductionDirector: path.join(artifactRoot, "h-series-preproduction-director-v1/report.json"),
  preproductionDirectorPublic: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/report.json"),
  preproductionPlan: path.join(artifactRoot, "h-series-preproduction-director-v1/director-plan.json"),
  preproductionPlanPublic: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/director-plan.json"),
  preproductionAnchorContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/anchor-contact-sheet.png"),
  preproductionH01Renderer: path.join(root, "remotion-renderer/src/preproduction-candidate/HSeriesH01StaticBoard.tsx"),
  preproductionH01ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h01-static-board-contact-sheet.png"),
  preproductionH02Renderer: path.join(root, "remotion-renderer/src/preproduction-candidate/HSeriesH02StaticBoard.tsx"),
  preproductionH02ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h02-static-board-contact-sheet.png"),
  preproductionH03Renderer: path.join(root, "remotion-renderer/src/preproduction-candidate/HSeriesH03StaticBoard.tsx"),
  preproductionH03ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h03-static-board-contact-sheet.png"),
  preproductionH08Renderer: path.join(root, "remotion-renderer/src/preproduction-candidate/HSeriesH08StaticBoard.tsx"),
  preproductionH08ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h08-static-board-contact-sheet.png"),
  preproductionRemainingRenderer: path.join(root, "remotion-renderer/src/preproduction-candidate/HSeriesRemainingStaticBoard.tsx"),
  preproductionH04ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h04-static-board-contact-sheet.png"),
  preproductionH05ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h05-static-board-contact-sheet.png"),
  preproductionH06ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h06-static-board-contact-sheet.png"),
  preproductionH07ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h07-static-board-contact-sheet.png"),
  preproductionH09ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h09-static-board-contact-sheet.png"),
  preproductionH10ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h10-static-board-contact-sheet.png"),
  preproductionH11ContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-director-v1/h11-static-board-contact-sheet.png"),
  preproductionMotionCandidate: path.join(artifactRoot, "h-series-preproduction-motion-candidate-v1/report.json"),
  preproductionMotionCandidatePublic: path.join(publicRoot, "generated/system-line/h-series-preproduction-motion-candidate-v1/report.json"),
  preproductionMotionCandidateAudit: path.join(artifactRoot, "h-series-preproduction-motion-candidate-v1/audit.json"),
  preproductionMotionCandidateAuditPublic: path.join(publicRoot, "generated/system-line/h-series-preproduction-motion-candidate-v1/audit.json"),
  preproductionMotionCandidateProps: path.join(artifactRoot, "h-series-preproduction-motion-candidate-v1/candidate-props.json"),
  preproductionMotionCandidateVideo: path.join(publicRoot, "generated/system-line/h-series-preproduction-motion-candidate-v1/motion-preview-12-shot-36s.mp4"),
  preproductionMotionCandidateContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-motion-candidate-v1/motion-preview-contact-sheet.png"),
  preproductionMotionCandidateAllContactSheet: path.join(publicRoot, "generated/system-line/h-series-preproduction-motion-candidate-v1/motion-preview-all-47-stills-contact-sheet.png"),
  preproductionMotionCandidateStillsReport: path.join(publicRoot, "generated/system-line/h-series-preproduction-motion-candidate-v1/stills-report.json"),
  continuityManifest: path.join(root, "remotion-renderer/src/generated/hSeriesContinuityManifest.json"),
  packagingManifestAudit: path.join(artifactRoot, "h-series-packaging-manifests-v1/audit.json"),
  currentFilmManifest: path.join(publicRoot, "generated/system-line/current-film/current-film-manifest.json"),
  manifest: path.join(publicRoot, "generated/system-line/h-series-540p-review-mp4-v1/web-review-manifest.json"),
  mp4Report: path.join(artifactRoot, "h-series-540p-review-mp4-v1/report.json"),
  v1VisualRejection: path.join(artifactRoot, "h-series-v1-visual-rejection-v1/report.json"),
  v1VisualRejectionPublic: path.join(publicRoot, "generated/system-line/h-series-v1-visual-rejection-v1/report.json"),
  v2CandidateManifest: path.join(publicRoot, "generated/system-line/h-series-540p-review-mp4-v2-candidate/web-review-manifest.json"),
  v2CandidateReport: path.join(artifactRoot, "h-series-540p-review-mp4-v2-candidate/report.json"),
  v2CandidateReportPublic: path.join(publicRoot, "generated/system-line/h-series-540p-review-mp4-v2-candidate/report.json"),
  v2CandidateVisualQuality: path.join(artifactRoot, "h-series-v2-candidate-visual-quality-v1/report.json"),
  v2CandidateVisualQualityPublic: path.join(publicRoot, "generated/system-line/h-series-v2-candidate-visual-quality-v1/report.json"),
  targetedVisualUpgradePreview: path.join(artifactRoot, "h-series-targeted-visual-upgrade-preview-v1/report.json"),
  targetedVisualUpgradePreviewPublic: path.join(publicRoot, "generated/system-line/h-series-targeted-visual-upgrade-preview-v1/report.json"),
  targetedVisualUpgradePreviewAudit: path.join(artifactRoot, "h-series-targeted-visual-upgrade-preview-audit-v1/report.json"),
  targetedVisualUpgradePreviewAuditPublic: path.join(publicRoot, "generated/system-line/h-series-targeted-visual-upgrade-preview-audit-v1/report.json"),
  visualRedirection: path.join(artifactRoot, "h-series-visual-redirection-v1/report.json"),
  visualRedirectionPublic: path.join(publicRoot, "generated/system-line/h-series-visual-redirection-v1/report.json"),
  visualRedirectionAudit: path.join(artifactRoot, "h-series-visual-redirection-audit-v1/report.json"),
  visualRedirectionAuditPublic: path.join(publicRoot, "generated/system-line/h-series-visual-redirection-audit-v1/report.json"),
  stage2FullReview: path.join(artifactRoot, "storyboard-stage2-full-review-v1/report.json"),
  stage2FullReviewPublic: path.join(publicRoot, "generated/system-line/storyboard-stage2-full-review-v1/report.json"),
  stage2FullReviewAudit: path.join(artifactRoot, "storyboard-stage2-full-review-v1/audit.json"),
  stage2FullReviewAuditPublic: path.join(publicRoot, "generated/system-line/storyboard-stage2-full-review-v1/audit.json"),
  stage2FullReviewCandidateProps: path.join(artifactRoot, "storyboard-stage2-full-review-v1/candidate-props.json"),
  stage2FullReviewContactSheet: path.join(artifactRoot, "storyboard-stage2-full-review-v1/contact-sheet.png"),
  stage2FullReviewContactSheetPublic: path.join(publicRoot, "generated/system-line/storyboard-stage2-full-review-v1/contact-sheet.png"),
  stage3FullDirector: path.join(artifactRoot, "storyboard-stage3-full-director-v1/report.json"),
  stage3FullDirectorPublic: path.join(publicRoot, "generated/system-line/storyboard-stage3-full-director-v1/report.json"),
  stage3FullDirectorAudit: path.join(artifactRoot, "storyboard-stage3-full-director-v1/audit.json"),
  stage3FullDirectorAuditPublic: path.join(publicRoot, "generated/system-line/storyboard-stage3-full-director-v1/audit.json"),
  stage3FullDirectorCandidateProps: path.join(artifactRoot, "storyboard-stage3-full-director-v1/candidate-props.json"),
  stage3FullDirectorContactSheet: path.join(artifactRoot, "storyboard-stage3-full-director-v1/contact-sheet-50.png"),
  stage3FullDirectorContactSheetPublic: path.join(publicRoot, "generated/system-line/storyboard-stage3-full-director-v1/contact-sheet-50.png"),
  editorialDocumentaryReset: path.join(artifactRoot, "editorial-documentary-reset-v1/report.json"),
  editorialDocumentaryResetPublic: path.join(publicRoot, "generated/system-line/editorial-documentary-reset-v1/report.json"),
  editorialDocumentaryResetAudit: path.join(artifactRoot, "editorial-documentary-reset-v1/audit.json"),
  editorialDocumentaryResetAuditPublic: path.join(publicRoot, "generated/system-line/editorial-documentary-reset-v1/audit.json"),
  picturePackagingPilot: path.join(artifactRoot, "picture-packaging-pilot-v1/report.json"),
  picturePackagingPilotPublic: path.join(publicRoot, "generated/system-line/picture-packaging-pilot-v1/report.json"),
  picturePackagingPilotAudit: path.join(artifactRoot, "picture-packaging-pilot-v1/audit.json"),
  picturePackagingPilotAuditPublic: path.join(publicRoot, "generated/system-line/picture-packaging-pilot-v1/audit.json"),
  editorialEvidenceKineticSystem: path.join(artifactRoot, "editorial-evidence-kinetic-system-v1/report.json"),
  editorialEvidenceKineticSystemPublic: path.join(publicRoot, "generated/system-line/editorial-evidence-kinetic-system-v1/report.json"),
  editorialEvidenceKineticSystemAudit: path.join(artifactRoot, "editorial-evidence-kinetic-system-v1/audit.json"),
  editorialEvidenceKineticSystemAuditPublic: path.join(publicRoot, "generated/system-line/editorial-evidence-kinetic-system-v1/audit.json"),
  editorialEvidenceKineticSystemVideo: path.join(publicRoot, "generated/system-line/editorial-evidence-kinetic-system-v1/editorial-evidence-kinetic-system-proof.mp4"),
  editorialEvidenceKineticSystemContactSheet: path.join(publicRoot, "generated/system-line/editorial-evidence-kinetic-system-v1/editorial-evidence-kinetic-system-contact-sheet.png"),
  visualAudit: path.join(artifactRoot, "h-series-mp4-visual-aesthetic-v2-candidate/report.json"),
  visualAuditPublic: path.join(publicRoot, "generated/system-line/h-series-mp4-visual-aesthetic-v2-candidate/report.json"),
  visualNoise: path.join(artifactRoot, "h-series-visual-noise-v1/report.json"),
  visualNoisePublic: path.join(publicRoot, "generated/system-line/h-series-visual-noise-v1/report.json"),
  aestheticGateExpansion: path.join(artifactRoot, "aesthetic-gate-expansion-v1/report.json"),
  aestheticGateExpansionPublic: path.join(publicRoot, "generated/system-line/aesthetic-gate-expansion-v1/report.json"),
  crossArticleRenderProof: path.join(artifactRoot, "cross-article-render-proof-v1/report.json"),
  crossArticleRenderProofPublic: path.join(publicRoot, "generated/system-line/cross-article-render-proof-v1/report.json"),
  crossArticleHBaselineQuality: path.join(artifactRoot, "cross-article-h-baseline-quality-v1/report.json"),
  crossArticleHBaselineQualityPublic: path.join(publicRoot, "generated/system-line/cross-article-h-baseline-quality-v1/report.json"),
  entityEvidenceMotionQuality: path.join(artifactRoot, "entity-evidence-motion-quality-proof-v1/report.json"),
  entityEvidenceMotionQualityPublic: path.join(publicRoot, "generated/system-line/entity-evidence-motion-quality-proof-v1/report.json"),
  entityMotionFrameProof: path.join(artifactRoot, "h-series-entity-motion-frame-proof-v1/report.json"),
  entityMotionFrameProofPublic: path.join(publicRoot, "generated/system-line/h-series-entity-motion-frame-proof-v1/report.json"),
  mp4EntityEvidenceVisibility: path.join(artifactRoot, "h-series-mp4-entity-evidence-visibility-v2-candidate/report.json"),
  mp4EntityEvidenceVisibilityPublic: path.join(publicRoot, "generated/system-line/h-series-mp4-entity-evidence-visibility-v2-candidate/report.json"),
  mp4HoldFrameVisualDirector: path.join(artifactRoot, "h-series-mp4-hold-frame-visual-director-v2-candidate/report.json"),
  mp4HoldFrameVisualDirectorPublic: path.join(publicRoot, "generated/system-line/h-series-mp4-hold-frame-visual-director-v2-candidate/report.json"),
  humanReviewPacket: path.join(artifactRoot, "h-series-540p-human-review-packet-v2-candidate/report.json"),
  humanReviewPacketPublic: path.join(publicRoot, "generated/system-line/h-series-540p-human-review-packet-v2-candidate/report.json"),
  h09ReviewPacket: path.join(artifactRoot, "h09-review-packet-v1/report.json"),
  h09ReviewPacketPublic: path.join(publicRoot, "generated/system-line/h09-review-packet-v1/report.json"),
  hSeriesMacroReviewIndex: path.join(artifactRoot, "h-series-macro-review-index-v2-candidate/report.json"),
  hSeriesMacroReviewIndexPublic: path.join(publicRoot, "generated/system-line/h-series-macro-review-index-v2-candidate/report.json"),
  targetedVisualFixQueue: path.join(artifactRoot, "h-series-targeted-visual-fix-queue-v1/report.json"),
  targetedVisualFixQueuePublic: path.join(publicRoot, "generated/system-line/h-series-targeted-visual-fix-queue-v1/report.json"),
  generatedArtworkDecision: path.join(artifactRoot, "h-series-generated-editorial-artwork-decision-v1/report.json"),
  generatedArtworkDecisionPublic: path.join(publicRoot, "generated/system-line/h-series-generated-editorial-artwork-decision-v1/report.json"),
  generatedArtworkExecutionPlan: path.join(artifactRoot, "h-series-generated-editorial-artwork-execution-plan-v1/report.json"),
  generatedArtworkExecutionPlanPublic: path.join(publicRoot, "generated/system-line/h-series-generated-editorial-artwork-execution-plan-v1/report.json"),
  generatedArtworkResultManifest: path.join(artifactRoot, "h-series-generated-editorial-artwork-result-manifest-v1/report.json"),
  generatedArtworkResultManifestPublic: path.join(publicRoot, "generated/system-line/h-series-generated-editorial-artwork-result-manifest-v1/report.json"),
  generatedArtworkVisualReview: path.join(artifactRoot, "h-series-generated-editorial-artwork-visual-review-v1/report.json"),
  generatedArtworkVisualReviewPublic: path.join(publicRoot, "generated/system-line/h-series-generated-editorial-artwork-visual-review-v1/report.json"),
  generatedArtworkSemanticBlue: path.join(artifactRoot, "h-series-generated-editorial-artwork-semantic-blue-v1/report.json"),
  generatedArtworkSemanticBluePublic: path.join(publicRoot, "generated/system-line/h-series-generated-editorial-artwork-semantic-blue-v1/report.json"),
  generatedArtworkCompositionRisk: path.join(artifactRoot, "h-series-generated-editorial-artwork-composition-risk-v1/report.json"),
  generatedArtworkCompositionRiskPublic: path.join(publicRoot, "generated/system-line/h-series-generated-editorial-artwork-composition-risk-v1/report.json"),
  generatedArtworkPolicy: path.join(artifactRoot, "h-series-generated-artwork-policy-v1/report.json"),
  generatedArtworkPolicyPublic: path.join(publicRoot, "generated/system-line/h-series-generated-artwork-policy-v1/report.json"),
  generatedArtworkRepairBrief: path.join(artifactRoot, "h-series-generated-artwork-repair-brief-v1/report.json"),
  generatedArtworkRepairBriefPublic: path.join(publicRoot, "generated/system-line/h-series-generated-artwork-repair-brief-v1/report.json"),
  generatedArtworkRepairAdoptionPlan: path.join(artifactRoot, "h-series-generated-artwork-repair-adoption-v1/report.json"),
  generatedArtworkRepairAdoptionPlanPublic: path.join(publicRoot, "generated/system-line/h-series-generated-artwork-repair-adoption-v1/report.json"),
  generatedArtworkAdoptionPlan: path.join(artifactRoot, "h-series-generated-artwork-adoption-plan-v1/report.json"),
  generatedArtworkAdoptionPlanPublic: path.join(publicRoot, "generated/system-line/h-series-generated-artwork-adoption-plan-v1/report.json"),
  generatedArtworkAdoptionApplied: path.join(artifactRoot, "h-series-generated-artwork-adoption-applied-v1/report.json"),
  generatedArtworkAdoptionAppliedPublic: path.join(publicRoot, "generated/system-line/h-series-generated-artwork-adoption-applied-v1/report.json"),
  generatedArtworkPostAdoption: path.join(artifactRoot, "h-series-generated-artwork-post-adoption-v1/report.json"),
  generatedArtworkPostAdoptionPublic: path.join(publicRoot, "generated/system-line/h-series-generated-artwork-post-adoption-v1/report.json"),
  textMotionQuality: path.join(artifactRoot, "h-series-text-motion-quality-v1/report.json"),
  textMotionQualityPublic: path.join(publicRoot, "generated/system-line/h-series-text-motion-quality-v1/report.json"),
  textMotionDiversityRepairPlan: path.join(artifactRoot, "h-series-text-motion-diversity-repair-plan-v1/report.json"),
  textMotionDiversityRepairPlanPublic: path.join(publicRoot, "generated/system-line/h-series-text-motion-diversity-repair-plan-v1/report.json"),
  textMotionTargetedProof: path.join(artifactRoot, "h-series-text-motion-targeted-proof-v1/report.json"),
  textMotionTargetedProofPublic: path.join(publicRoot, "generated/system-line/h-series-text-motion-targeted-proof-v1/report.json"),
  textMotionTargetedStillProof: path.join(artifactRoot, "h-series-text-motion-targeted-still-proof-v1/report.json"),
  textMotionTargetedStillProofPublic: path.join(publicRoot, "generated/system-line/h-series-text-motion-targeted-still-proof-v1/report.json"),
  textMotionTargetedMovingPreview: path.join(artifactRoot, "h-series-text-motion-targeted-moving-preview-v1/report.json"),
  textMotionTargetedMovingPreviewPublic: path.join(publicRoot, "generated/system-line/h-series-text-motion-targeted-moving-preview-v1/report.json"),
  textMotionRendererAdoptionPlan: path.join(artifactRoot, "h-series-text-motion-renderer-adoption-plan-v1/report.json"),
  textMotionRendererAdoptionPlanPublic: path.join(publicRoot, "generated/system-line/h-series-text-motion-renderer-adoption-plan-v1/report.json"),
  textMotionRendererAdoptionApplied: path.join(artifactRoot, "h-series-text-motion-renderer-adoption-applied-v1/report.json"),
  textMotionRendererAdoptionAppliedPublic: path.join(publicRoot, "generated/system-line/h-series-text-motion-renderer-adoption-applied-v1/report.json"),
  textMotionPostAdoptionSource: path.join(artifactRoot, "h-series-text-motion-post-adoption-source-v1/report.json"),
  textMotionPostAdoptionSourcePublic: path.join(publicRoot, "generated/system-line/h-series-text-motion-post-adoption-source-v1/report.json"),
  reviewQueue: path.join(artifactRoot, "h-series-47-scene-review-queue-v1/report.json"),
  reviewQueuePublic: path.join(publicRoot, "generated/system-line/h-series-47-scene-review-queue-v1/report.json"),
  canonicalRealArticleStress: path.join(artifactRoot, "canonical-real-article-stress-v1/report.json"),
  canonicalRealArticleStressPublic: path.join(publicRoot, "generated/system-line/canonical-real-article-stress-v1/report.json"),
  inheritedBaseline: path.join(root, ".codex-artifacts/system-line/inherited-h-baseline-report.json"),
  visualMasterContract: path.join(artifactRoot, "h-series-visual-master-contract-v1/report.json"),
  visualMasterContractPublic: path.join(publicRoot, "generated/system-line/h-series-visual-master-contract-v1/report.json"),
  canonicalCompiler: path.join(root, "apps/studio-next/src/lib/a1-canonical-full-plan-v2.ts"),
  canonicalVisualDirection: path.join(root, "apps/studio-next/src/lib/a1-canonical-visual-direction.ts"),
  layoutEngine: path.join(root, "apps/studio-next/src/lib/a1-layout-engine-v2.ts"),
  motionChoreography: path.join(root, "apps/studio-next/src/lib/a1-motion-choreography-v1.ts"),
  visualPackagingCompiler: path.join(root, "apps/studio-next/src/lib/a1-visual-packaging-compiler.ts"),
  rendererSourceProps: path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"),
  reviewPage: path.join(root, "apps/studio-next/src/app/system-line-review/page.tsx"),
  hSeriesReviewRoute: path.join(root, "apps/studio-next/src/app/api/system-line/h-series-review/route.ts"),
  storyboardPage: path.join(root, "apps/studio-next/src/app/storyboard/page.tsx"),
  storyboardManifest: path.join(publicRoot, "generated/storyboard/current/storyboard-manifest.json"),
  storyboardProps: path.join(publicRoot, "generated/storyboard/current/storyboard-props.json"),
  storyboardFirstRenderGate: path.join(artifactRoot, "storyboard-first-render-gate-v1/report.json"),
  storyboardFirstRenderGatePublic: path.join(publicRoot, "generated/system-line/storyboard-first-render-gate-v1/report.json"),
  productionSopContract: path.join(artifactRoot, "h-series-director-candidate-v1/production-sop-contract.json"),
  productionSopContractPublic: path.join(publicRoot, "generated/system-line/h-series-director-candidate-v1/production-sop-contract.json"),
  productionSopReport: path.join(artifactRoot, "h-series-director-candidate-v1/production-sop-report.md"),
  productionSopReportPublic: path.join(publicRoot, "generated/system-line/h-series-director-candidate-v1/production-sop-report.md"),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options}).trim();
  } catch (error) {
    return "";
  }
}

function curl(url) {
  return run("curl", ["-fsS", "--max-time", "30", url], {maxBuffer: 32 * 1024 * 1024});
}

function portCwd(port) {
  const pidOutput = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"]);
  const pid = pidOutput.split(/\n/u).find((line) => line.startsWith("p"))?.slice(1);
  if (!pid) return null;
  const cwdOutput = run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const cwd = cwdOutput.split(/\n/u).find((line) => line.startsWith("n"))?.slice(1) || "";
  return {pid, cwd};
}

function externalSymlinks(startDir) {
  const findings = [];
  if (!fs.existsSync(startDir)) return findings;
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        const rawTarget = fs.readlinkSync(fullPath);
        let realTarget = "";
        try {
          realTarget = fs.realpathSync(fullPath);
        } catch {
          realTarget = path.resolve(path.dirname(fullPath), rawTarget);
        }
        if (!realTarget.startsWith(`${root}${path.sep}`) && realTarget !== root) {
          findings.push({path: path.relative(root, fullPath), target: rawTarget, realTarget});
        }
        continue;
      }
      if (entry.isDirectory()) stack.push(fullPath);
    }
  }
  return findings;
}

const checks = [];
function check(id, pass, detail, severity = "blocker") {
  checks.push({id, status: pass ? "PASS" : "FAIL", severity, detail});
}

function fileExists(id, file) {
  const exists = fs.existsSync(file);
  check(id, exists && fs.statSync(file).size > 0, path.relative(root, file));
  return exists;
}

const branch = run("git", ["branch", "--show-current"]);
const topLevel = run("git", ["rev-parse", "--show-toplevel"]);
const port4311 = portCwd(expected.frontendPort);
const port4310 = portCwd(expected.forbiddenPort);

check("worktree-basename", path.basename(root) === expected.worktreeBasename, root);
check("git-top-level", topLevel === root, topLevel || "unknown");
check("branch", branch === expected.branch, branch || "unknown");
check("4311-owned-by-system-line", Boolean(port4311?.cwd?.startsWith(root)), port4311 || "not-listening");
check("4310-not-owned-by-system-line", !port4310 || !String(port4310.cwd).startsWith(root), port4310 || "not-listening");
const externalAssetSymlinks = isolatedAssetRoots.flatMap((assetRoot) => externalSymlinks(assetRoot));
check("public-assets-no-cross-worktree-symlinks", externalAssetSymlinks.length === 0, externalAssetSymlinks.length ? externalAssetSymlinks : "no external public asset symlinks");

const requiredFiles = Object.entries({
  currentPhase: paths.currentPhase,
  currentAuthorityAudit: paths.currentAuthorityAudit,
  currentAuthorityAuditPublic: paths.currentAuthorityAuditPublic,
  directedReview: paths.directedReview,
  directedReviewPublic: paths.directedReviewPublic,
  directedReviewVideo: paths.directedReviewVideo,
  directedReviewContactSheet: paths.directedReviewContactSheet,
  directedRenderer: paths.directedRenderer,
  directorPlan: paths.directorPlan,
  typographyDirection: paths.typographyDirection,
  typographyDirectionPublic: paths.typographyDirectionPublic,
  typographyDirectionContactSheet: paths.typographyDirectionContactSheet,
  typographyDirectionPlan: paths.typographyDirectionPlan,
  typographyDirectionRenderer: paths.typographyDirectionRenderer,
  preproductionDirector: paths.preproductionDirector,
  preproductionDirectorPublic: paths.preproductionDirectorPublic,
  preproductionPlan: paths.preproductionPlan,
  preproductionPlanPublic: paths.preproductionPlanPublic,
  preproductionAnchorContactSheet: paths.preproductionAnchorContactSheet,
  preproductionH01Renderer: paths.preproductionH01Renderer,
  preproductionH01ContactSheet: paths.preproductionH01ContactSheet,
  preproductionH02Renderer: paths.preproductionH02Renderer,
  preproductionH02ContactSheet: paths.preproductionH02ContactSheet,
  preproductionH03Renderer: paths.preproductionH03Renderer,
  preproductionH03ContactSheet: paths.preproductionH03ContactSheet,
  preproductionH08Renderer: paths.preproductionH08Renderer,
  preproductionH08ContactSheet: paths.preproductionH08ContactSheet,
  preproductionRemainingRenderer: paths.preproductionRemainingRenderer,
  preproductionH04ContactSheet: paths.preproductionH04ContactSheet,
  preproductionH05ContactSheet: paths.preproductionH05ContactSheet,
  preproductionH06ContactSheet: paths.preproductionH06ContactSheet,
  preproductionH07ContactSheet: paths.preproductionH07ContactSheet,
  preproductionH09ContactSheet: paths.preproductionH09ContactSheet,
  preproductionH10ContactSheet: paths.preproductionH10ContactSheet,
  preproductionH11ContactSheet: paths.preproductionH11ContactSheet,
  preproductionMotionCandidate: paths.preproductionMotionCandidate,
  preproductionMotionCandidatePublic: paths.preproductionMotionCandidatePublic,
  preproductionMotionCandidateAudit: paths.preproductionMotionCandidateAudit,
  preproductionMotionCandidateAuditPublic: paths.preproductionMotionCandidateAuditPublic,
  preproductionMotionCandidateProps: paths.preproductionMotionCandidateProps,
  preproductionMotionCandidateVideo: paths.preproductionMotionCandidateVideo,
  preproductionMotionCandidateContactSheet: paths.preproductionMotionCandidateContactSheet,
  preproductionMotionCandidateAllContactSheet: paths.preproductionMotionCandidateAllContactSheet,
  preproductionMotionCandidateStillsReport: paths.preproductionMotionCandidateStillsReport,
  wholeFilmDirectorPlan: paths.wholeFilmDirectorPlan,
  wholeFilmDirectorPlanPublic: paths.wholeFilmDirectorPlanPublic,
  wholeFilmDirectorReport: paths.wholeFilmDirectorReport,
  wholeFilmDirectorReportPublic: paths.wholeFilmDirectorReportPublic,
  wholeFilmDirectorAudit: paths.wholeFilmDirectorAudit,
  wholeFilmDirectorAuditPublic: paths.wholeFilmDirectorAuditPublic,
  packagingManifestAudit: paths.packagingManifestAudit,
  currentFilmManifest: paths.currentFilmManifest,
  manifest: paths.manifest,
  mp4Report: paths.mp4Report,
  v1VisualRejection: paths.v1VisualRejection,
  v1VisualRejectionPublic: paths.v1VisualRejectionPublic,
  v2CandidateManifest: paths.v2CandidateManifest,
  v2CandidateReport: paths.v2CandidateReport,
  v2CandidateReportPublic: paths.v2CandidateReportPublic,
  v2CandidateVisualQuality: paths.v2CandidateVisualQuality,
  v2CandidateVisualQualityPublic: paths.v2CandidateVisualQualityPublic,
  targetedVisualUpgradePreview: paths.targetedVisualUpgradePreview,
  targetedVisualUpgradePreviewPublic: paths.targetedVisualUpgradePreviewPublic,
  targetedVisualUpgradePreviewAudit: paths.targetedVisualUpgradePreviewAudit,
  targetedVisualUpgradePreviewAuditPublic: paths.targetedVisualUpgradePreviewAuditPublic,
  visualRedirection: paths.visualRedirection,
  visualRedirectionPublic: paths.visualRedirectionPublic,
  visualRedirectionAudit: paths.visualRedirectionAudit,
  visualRedirectionAuditPublic: paths.visualRedirectionAuditPublic,
  stage2FullReview: paths.stage2FullReview,
  stage2FullReviewPublic: paths.stage2FullReviewPublic,
  stage2FullReviewAudit: paths.stage2FullReviewAudit,
  stage2FullReviewAuditPublic: paths.stage2FullReviewAuditPublic,
  stage2FullReviewCandidateProps: paths.stage2FullReviewCandidateProps,
  stage2FullReviewContactSheet: paths.stage2FullReviewContactSheet,
  stage2FullReviewContactSheetPublic: paths.stage2FullReviewContactSheetPublic,
  stage3FullDirector: paths.stage3FullDirector,
  stage3FullDirectorPublic: paths.stage3FullDirectorPublic,
  stage3FullDirectorAudit: paths.stage3FullDirectorAudit,
  stage3FullDirectorAuditPublic: paths.stage3FullDirectorAuditPublic,
  stage3FullDirectorCandidateProps: paths.stage3FullDirectorCandidateProps,
  stage3FullDirectorContactSheet: paths.stage3FullDirectorContactSheet,
  stage3FullDirectorContactSheetPublic: paths.stage3FullDirectorContactSheetPublic,
  editorialDocumentaryReset: paths.editorialDocumentaryReset,
  editorialDocumentaryResetPublic: paths.editorialDocumentaryResetPublic,
  editorialDocumentaryResetAudit: paths.editorialDocumentaryResetAudit,
  editorialDocumentaryResetAuditPublic: paths.editorialDocumentaryResetAuditPublic,
  picturePackagingPilot: paths.picturePackagingPilot,
  picturePackagingPilotPublic: paths.picturePackagingPilotPublic,
  picturePackagingPilotAudit: paths.picturePackagingPilotAudit,
  picturePackagingPilotAuditPublic: paths.picturePackagingPilotAuditPublic,
  editorialEvidenceKineticSystem: paths.editorialEvidenceKineticSystem,
  editorialEvidenceKineticSystemPublic: paths.editorialEvidenceKineticSystemPublic,
  editorialEvidenceKineticSystemAudit: paths.editorialEvidenceKineticSystemAudit,
  editorialEvidenceKineticSystemAuditPublic: paths.editorialEvidenceKineticSystemAuditPublic,
  editorialEvidenceKineticSystemVideo: paths.editorialEvidenceKineticSystemVideo,
  editorialEvidenceKineticSystemContactSheet: paths.editorialEvidenceKineticSystemContactSheet,
  visualAudit: paths.visualAudit,
  visualAuditPublic: paths.visualAuditPublic,
  visualNoise: paths.visualNoise,
  visualNoisePublic: paths.visualNoisePublic,
  aestheticGateExpansion: paths.aestheticGateExpansion,
  aestheticGateExpansionPublic: paths.aestheticGateExpansionPublic,
  crossArticleRenderProof: paths.crossArticleRenderProof,
  crossArticleRenderProofPublic: paths.crossArticleRenderProofPublic,
  crossArticleHBaselineQuality: paths.crossArticleHBaselineQuality,
  crossArticleHBaselineQualityPublic: paths.crossArticleHBaselineQualityPublic,
  entityEvidenceMotionQuality: paths.entityEvidenceMotionQuality,
  entityEvidenceMotionQualityPublic: paths.entityEvidenceMotionQualityPublic,
  entityMotionFrameProof: paths.entityMotionFrameProof,
  entityMotionFrameProofPublic: paths.entityMotionFrameProofPublic,
  mp4EntityEvidenceVisibility: paths.mp4EntityEvidenceVisibility,
  mp4EntityEvidenceVisibilityPublic: paths.mp4EntityEvidenceVisibilityPublic,
  mp4HoldFrameVisualDirector: paths.mp4HoldFrameVisualDirector,
  mp4HoldFrameVisualDirectorPublic: paths.mp4HoldFrameVisualDirectorPublic,
  humanReviewPacket: paths.humanReviewPacket,
  humanReviewPacketPublic: paths.humanReviewPacketPublic,
  h09ReviewPacket: paths.h09ReviewPacket,
  h09ReviewPacketPublic: paths.h09ReviewPacketPublic,
  hSeriesMacroReviewIndex: paths.hSeriesMacroReviewIndex,
  hSeriesMacroReviewIndexPublic: paths.hSeriesMacroReviewIndexPublic,
  targetedVisualFixQueue: paths.targetedVisualFixQueue,
  targetedVisualFixQueuePublic: paths.targetedVisualFixQueuePublic,
  generatedArtworkDecision: paths.generatedArtworkDecision,
  generatedArtworkDecisionPublic: paths.generatedArtworkDecisionPublic,
  generatedArtworkExecutionPlan: paths.generatedArtworkExecutionPlan,
  generatedArtworkExecutionPlanPublic: paths.generatedArtworkExecutionPlanPublic,
  generatedArtworkResultManifest: paths.generatedArtworkResultManifest,
  generatedArtworkResultManifestPublic: paths.generatedArtworkResultManifestPublic,
  generatedArtworkVisualReview: paths.generatedArtworkVisualReview,
  generatedArtworkVisualReviewPublic: paths.generatedArtworkVisualReviewPublic,
  generatedArtworkSemanticBlue: paths.generatedArtworkSemanticBlue,
  generatedArtworkSemanticBluePublic: paths.generatedArtworkSemanticBluePublic,
  generatedArtworkCompositionRisk: paths.generatedArtworkCompositionRisk,
  generatedArtworkCompositionRiskPublic: paths.generatedArtworkCompositionRiskPublic,
  generatedArtworkPolicy: paths.generatedArtworkPolicy,
  generatedArtworkPolicyPublic: paths.generatedArtworkPolicyPublic,
  generatedArtworkRepairBrief: paths.generatedArtworkRepairBrief,
  generatedArtworkRepairBriefPublic: paths.generatedArtworkRepairBriefPublic,
  generatedArtworkAdoptionPlan: paths.generatedArtworkAdoptionPlan,
  generatedArtworkAdoptionPlanPublic: paths.generatedArtworkAdoptionPlanPublic,
  generatedArtworkAdoptionApplied: paths.generatedArtworkAdoptionApplied,
  generatedArtworkAdoptionAppliedPublic: paths.generatedArtworkAdoptionAppliedPublic,
  generatedArtworkPostAdoption: paths.generatedArtworkPostAdoption,
  generatedArtworkPostAdoptionPublic: paths.generatedArtworkPostAdoptionPublic,
  textMotionQuality: paths.textMotionQuality,
  textMotionQualityPublic: paths.textMotionQualityPublic,
  textMotionDiversityRepairPlan: paths.textMotionDiversityRepairPlan,
  textMotionDiversityRepairPlanPublic: paths.textMotionDiversityRepairPlanPublic,
  textMotionTargetedProof: paths.textMotionTargetedProof,
  textMotionTargetedProofPublic: paths.textMotionTargetedProofPublic,
  textMotionTargetedStillProof: paths.textMotionTargetedStillProof,
  textMotionTargetedStillProofPublic: paths.textMotionTargetedStillProofPublic,
  textMotionTargetedMovingPreview: paths.textMotionTargetedMovingPreview,
  textMotionTargetedMovingPreviewPublic: paths.textMotionTargetedMovingPreviewPublic,
  textMotionRendererAdoptionPlan: paths.textMotionRendererAdoptionPlan,
  textMotionRendererAdoptionPlanPublic: paths.textMotionRendererAdoptionPlanPublic,
  textMotionRendererAdoptionApplied: paths.textMotionRendererAdoptionApplied,
  textMotionRendererAdoptionAppliedPublic: paths.textMotionRendererAdoptionAppliedPublic,
  textMotionPostAdoptionSource: paths.textMotionPostAdoptionSource,
  textMotionPostAdoptionSourcePublic: paths.textMotionPostAdoptionSourcePublic,
  reviewQueue: paths.reviewQueue,
  reviewQueuePublic: paths.reviewQueuePublic,
  canonicalRealArticleStress: paths.canonicalRealArticleStress,
  canonicalRealArticleStressPublic: paths.canonicalRealArticleStressPublic,
  inheritedBaseline: paths.inheritedBaseline,
  visualMasterContract: paths.visualMasterContract,
  visualMasterContractPublic: paths.visualMasterContractPublic,
  rendererSourceProps: paths.rendererSourceProps,
  reviewPage: paths.reviewPage,
  hSeriesReviewRoute: paths.hSeriesReviewRoute,
  storyboardPage: paths.storyboardPage,
  storyboardManifest: paths.storyboardManifest,
  storyboardProps: paths.storyboardProps,
  storyboardFirstRenderGate: paths.storyboardFirstRenderGate,
  storyboardFirstRenderGatePublic: paths.storyboardFirstRenderGatePublic,
  productionSopContract: paths.productionSopContract,
  productionSopContractPublic: paths.productionSopContractPublic,
  productionSopReport: paths.productionSopReport,
  productionSopReportPublic: paths.productionSopReportPublic,
});
for (const [id, file] of requiredFiles) fileExists(`file:${id}`, file);

const hSeriesReviewRouteSource = fs.existsSync(paths.hSeriesReviewRoute) ? fs.readFileSync(paths.hSeriesReviewRoute, "utf8") : "";
check("review-ledger-rebinds-exact-candidate-report", hSeriesReviewRouteSource.includes("const bindingMatches = value?.candidatePropsSha256 === candidatePropsSha256") && hSeriesReviewRouteSource.includes("value?.candidateReportSha256 === candidateReportSha256") && hSeriesReviewRouteSource.includes("const sourceDecisions = bindingMatches ? value?.decisions || [] : []"), "review decisions are cleared when renderer/report binding changes");

const phase = fs.existsSync(paths.currentPhase) ? readJson(paths.currentPhase) : {};
const currentAuthorityAudit = fs.existsSync(paths.currentAuthorityAudit) ? readJson(paths.currentAuthorityAudit) : {};
const wholeFilmDirectorPlan = fs.existsSync(paths.wholeFilmDirectorPlan) ? readJson(paths.wholeFilmDirectorPlan) : {};
const wholeFilmDirectorReport = fs.existsSync(paths.wholeFilmDirectorReport) ? readJson(paths.wholeFilmDirectorReport) : {};
const wholeFilmDirectorAudit = fs.existsSync(paths.wholeFilmDirectorAudit) ? readJson(paths.wholeFilmDirectorAudit) : {};
const directedReview = fs.existsSync(paths.directedReview) ? readJson(paths.directedReview) : {};
const directedReviewPublic = fs.existsSync(paths.directedReviewPublic) ? readJson(paths.directedReviewPublic) : {};
const typographyDirection = fs.existsSync(paths.typographyDirection) ? readJson(paths.typographyDirection) : {};
const typographyDirectionPublic = fs.existsSync(paths.typographyDirectionPublic) ? readJson(paths.typographyDirectionPublic) : {};
const preproductionDirector = fs.existsSync(paths.preproductionDirector) ? readJson(paths.preproductionDirector) : {};
const preproductionDirectorPublic = fs.existsSync(paths.preproductionDirectorPublic) ? readJson(paths.preproductionDirectorPublic) : {};
const preproductionPlan = fs.existsSync(paths.preproductionPlan) ? readJson(paths.preproductionPlan) : {};
const preproductionPlanPublic = fs.existsSync(paths.preproductionPlanPublic) ? readJson(paths.preproductionPlanPublic) : {};
const preproductionMotionCandidate = fs.existsSync(paths.preproductionMotionCandidate) ? readJson(paths.preproductionMotionCandidate) : {};
const preproductionMotionCandidatePublic = fs.existsSync(paths.preproductionMotionCandidatePublic) ? readJson(paths.preproductionMotionCandidatePublic) : {};
const preproductionMotionCandidateAudit = fs.existsSync(paths.preproductionMotionCandidateAudit) ? readJson(paths.preproductionMotionCandidateAudit) : {};
const preproductionMotionCandidateAuditPublic = fs.existsSync(paths.preproductionMotionCandidateAuditPublic) ? readJson(paths.preproductionMotionCandidateAuditPublic) : {};
const packagingManifestAudit = fs.existsSync(paths.packagingManifestAudit) ? readJson(paths.packagingManifestAudit) : {};
const currentFilmManifest = fs.existsSync(paths.currentFilmManifest) ? readJson(paths.currentFilmManifest) : {};
const manifest = fs.existsSync(paths.manifest) ? readJson(paths.manifest) : {};
const mp4Report = fs.existsSync(paths.mp4Report) ? readJson(paths.mp4Report) : {};
const v1VisualRejection = fs.existsSync(paths.v1VisualRejection) ? readJson(paths.v1VisualRejection) : {};
const v1VisualRejectionPublic = fs.existsSync(paths.v1VisualRejectionPublic) ? readJson(paths.v1VisualRejectionPublic) : {};
const v2CandidateManifest = fs.existsSync(paths.v2CandidateManifest) ? readJson(paths.v2CandidateManifest) : {};
const v2CandidateReport = fs.existsSync(paths.v2CandidateReport) ? readJson(paths.v2CandidateReport) : {};
const v2CandidateReportPublic = fs.existsSync(paths.v2CandidateReportPublic) ? readJson(paths.v2CandidateReportPublic) : {};
const v2CandidateVisualQuality = fs.existsSync(paths.v2CandidateVisualQuality) ? readJson(paths.v2CandidateVisualQuality) : {};
const v2CandidateVisualQualityPublic = fs.existsSync(paths.v2CandidateVisualQualityPublic) ? readJson(paths.v2CandidateVisualQualityPublic) : {};
const targetedVisualUpgradePreview = fs.existsSync(paths.targetedVisualUpgradePreview) ? readJson(paths.targetedVisualUpgradePreview) : {};
const targetedVisualUpgradePreviewAudit = fs.existsSync(paths.targetedVisualUpgradePreviewAudit) ? readJson(paths.targetedVisualUpgradePreviewAudit) : {};
const visualRedirection = fs.existsSync(paths.visualRedirection) ? readJson(paths.visualRedirection) : {};
const visualRedirectionAudit = fs.existsSync(paths.visualRedirectionAudit) ? readJson(paths.visualRedirectionAudit) : {};
const stage2FullReview = fs.existsSync(paths.stage2FullReview) ? readJson(paths.stage2FullReview) : {};
const stage2FullReviewPublic = fs.existsSync(paths.stage2FullReviewPublic) ? readJson(paths.stage2FullReviewPublic) : {};
const stage2FullReviewAudit = fs.existsSync(paths.stage2FullReviewAudit) ? readJson(paths.stage2FullReviewAudit) : {};
const stage2FullReviewAuditPublic = fs.existsSync(paths.stage2FullReviewAuditPublic) ? readJson(paths.stage2FullReviewAuditPublic) : {};
const stage3FullDirector = fs.existsSync(paths.stage3FullDirector) ? readJson(paths.stage3FullDirector) : {};
const stage3FullDirectorPublic = fs.existsSync(paths.stage3FullDirectorPublic) ? readJson(paths.stage3FullDirectorPublic) : {};
const stage3FullDirectorAudit = fs.existsSync(paths.stage3FullDirectorAudit) ? readJson(paths.stage3FullDirectorAudit) : {};
const stage3FullDirectorAuditPublic = fs.existsSync(paths.stage3FullDirectorAuditPublic) ? readJson(paths.stage3FullDirectorAuditPublic) : {};
const editorialDocumentaryReset = fs.existsSync(paths.editorialDocumentaryReset) ? readJson(paths.editorialDocumentaryReset) : {};
const editorialDocumentaryResetAudit = fs.existsSync(paths.editorialDocumentaryResetAudit) ? readJson(paths.editorialDocumentaryResetAudit) : {};
const picturePackagingPilot = fs.existsSync(paths.picturePackagingPilot) ? readJson(paths.picturePackagingPilot) : {};
const picturePackagingPilotAudit = fs.existsSync(paths.picturePackagingPilotAudit) ? readJson(paths.picturePackagingPilotAudit) : {};
const editorialEvidenceKineticSystem = fs.existsSync(paths.editorialEvidenceKineticSystem) ? readJson(paths.editorialEvidenceKineticSystem) : {};
const editorialEvidenceKineticSystemAudit = fs.existsSync(paths.editorialEvidenceKineticSystemAudit) ? readJson(paths.editorialEvidenceKineticSystemAudit) : {};
const visualAudit = fs.existsSync(paths.visualAudit) ? readJson(paths.visualAudit) : {};
const visualAuditPublic = fs.existsSync(paths.visualAuditPublic) ? readJson(paths.visualAuditPublic) : {};
const visualNoise = fs.existsSync(paths.visualNoise) ? readJson(paths.visualNoise) : {};
const visualNoisePublic = fs.existsSync(paths.visualNoisePublic) ? readJson(paths.visualNoisePublic) : {};
const aestheticGateExpansion = fs.existsSync(paths.aestheticGateExpansion) ? readJson(paths.aestheticGateExpansion) : {};
const aestheticGateExpansionPublic = fs.existsSync(paths.aestheticGateExpansionPublic) ? readJson(paths.aestheticGateExpansionPublic) : {};
const crossArticleRenderProof = fs.existsSync(paths.crossArticleRenderProof) ? readJson(paths.crossArticleRenderProof) : {};
const crossArticleRenderProofPublic = fs.existsSync(paths.crossArticleRenderProofPublic) ? readJson(paths.crossArticleRenderProofPublic) : {};
const crossArticleHBaselineQuality = fs.existsSync(paths.crossArticleHBaselineQuality) ? readJson(paths.crossArticleHBaselineQuality) : {};
const crossArticleHBaselineQualityPublic = fs.existsSync(paths.crossArticleHBaselineQualityPublic) ? readJson(paths.crossArticleHBaselineQualityPublic) : {};
const entityEvidenceMotionQuality = fs.existsSync(paths.entityEvidenceMotionQuality) ? readJson(paths.entityEvidenceMotionQuality) : {};
const entityEvidenceMotionQualityPublic = fs.existsSync(paths.entityEvidenceMotionQualityPublic) ? readJson(paths.entityEvidenceMotionQualityPublic) : {};
const entityMotionFrameProof = fs.existsSync(paths.entityMotionFrameProof) ? readJson(paths.entityMotionFrameProof) : {};
const entityMotionFrameProofPublic = fs.existsSync(paths.entityMotionFrameProofPublic) ? readJson(paths.entityMotionFrameProofPublic) : {};
const mp4EntityEvidenceVisibility = fs.existsSync(paths.mp4EntityEvidenceVisibility) ? readJson(paths.mp4EntityEvidenceVisibility) : {};
const mp4HoldFrameVisualDirector = fs.existsSync(paths.mp4HoldFrameVisualDirector) ? readJson(paths.mp4HoldFrameVisualDirector) : {};
const humanReviewPacket = fs.existsSync(paths.humanReviewPacket) ? readJson(paths.humanReviewPacket) : {};
const h09ReviewPacket = fs.existsSync(paths.h09ReviewPacket) ? readJson(paths.h09ReviewPacket) : {};
const hSeriesMacroReviewIndex = fs.existsSync(paths.hSeriesMacroReviewIndex) ? readJson(paths.hSeriesMacroReviewIndex) : {};
const targetedVisualFixQueue = fs.existsSync(paths.targetedVisualFixQueue) ? readJson(paths.targetedVisualFixQueue) : {};
const generatedArtworkDecision = fs.existsSync(paths.generatedArtworkDecision) ? readJson(paths.generatedArtworkDecision) : {};
const generatedArtworkExecutionPlan = fs.existsSync(paths.generatedArtworkExecutionPlan) ? readJson(paths.generatedArtworkExecutionPlan) : {};
const generatedArtworkResultManifest = fs.existsSync(paths.generatedArtworkResultManifest) ? readJson(paths.generatedArtworkResultManifest) : {};
const generatedArtworkVisualReview = fs.existsSync(paths.generatedArtworkVisualReview) ? readJson(paths.generatedArtworkVisualReview) : {};
const generatedArtworkSemanticBlue = fs.existsSync(paths.generatedArtworkSemanticBlue) ? readJson(paths.generatedArtworkSemanticBlue) : {};
const generatedArtworkCompositionRisk = fs.existsSync(paths.generatedArtworkCompositionRisk) ? readJson(paths.generatedArtworkCompositionRisk) : {};
const generatedArtworkPolicy = fs.existsSync(paths.generatedArtworkPolicy) ? readJson(paths.generatedArtworkPolicy) : {};
const generatedArtworkRepairBrief = fs.existsSync(paths.generatedArtworkRepairBrief) ? readJson(paths.generatedArtworkRepairBrief) : {};
const generatedArtworkRepairAdoptionPlan = fs.existsSync(paths.generatedArtworkRepairAdoptionPlan) ? readJson(paths.generatedArtworkRepairAdoptionPlan) : {};
const generatedArtworkAdoptionPlan = fs.existsSync(paths.generatedArtworkAdoptionPlan) ? readJson(paths.generatedArtworkAdoptionPlan) : {};
const generatedArtworkAdoptionApplied = fs.existsSync(paths.generatedArtworkAdoptionApplied) ? readJson(paths.generatedArtworkAdoptionApplied) : {};
const generatedArtworkPostAdoption = fs.existsSync(paths.generatedArtworkPostAdoption) ? readJson(paths.generatedArtworkPostAdoption) : {};
const textMotionQuality = fs.existsSync(paths.textMotionQuality) ? readJson(paths.textMotionQuality) : {};
const textMotionDiversityRepairPlan = fs.existsSync(paths.textMotionDiversityRepairPlan) ? readJson(paths.textMotionDiversityRepairPlan) : {};
const textMotionTargetedProof = fs.existsSync(paths.textMotionTargetedProof) ? readJson(paths.textMotionTargetedProof) : {};
const textMotionTargetedStillProof = fs.existsSync(paths.textMotionTargetedStillProof) ? readJson(paths.textMotionTargetedStillProof) : {};
const textMotionTargetedMovingPreview = fs.existsSync(paths.textMotionTargetedMovingPreview) ? readJson(paths.textMotionTargetedMovingPreview) : {};
const textMotionRendererAdoptionPlan = fs.existsSync(paths.textMotionRendererAdoptionPlan) ? readJson(paths.textMotionRendererAdoptionPlan) : {};
const textMotionRendererAdoptionApplied = fs.existsSync(paths.textMotionRendererAdoptionApplied) ? readJson(paths.textMotionRendererAdoptionApplied) : {};
const textMotionPostAdoptionSource = fs.existsSync(paths.textMotionPostAdoptionSource) ? readJson(paths.textMotionPostAdoptionSource) : {};
const reviewQueue = fs.existsSync(paths.reviewQueue) ? readJson(paths.reviewQueue) : {};
const canonicalRealArticleStress = fs.existsSync(paths.canonicalRealArticleStress) ? readJson(paths.canonicalRealArticleStress) : {};
const inheritedBaseline = fs.existsSync(paths.inheritedBaseline) ? readJson(paths.inheritedBaseline) : {};
const visualMasterContract = fs.existsSync(paths.visualMasterContract) ? readJson(paths.visualMasterContract) : {};
const visualMasterContractPublic = fs.existsSync(paths.visualMasterContractPublic) ? readJson(paths.visualMasterContractPublic) : {};
const rendererSourceProps = fs.existsSync(paths.rendererSourceProps) ? readJson(paths.rendererSourceProps) : {};
const storyboardManifest = fs.existsSync(paths.storyboardManifest) ? readJson(paths.storyboardManifest) : {};
const storyboardProps = fs.existsSync(paths.storyboardProps) ? readJson(paths.storyboardProps) : {};
const storyboardFirstRenderGate = fs.existsSync(paths.storyboardFirstRenderGate) ? readJson(paths.storyboardFirstRenderGate) : {};
const currentFilmIsAuthority = currentFilmManifest.contract === "A1CurrentFilmManifest/v1"
  && currentFilmManifest.authority === "single-current-film-release-manifest"
  && ["ASSET_READY", "NEEDS_REVISION"].includes(currentFilmManifest.state)
  && (currentFilmManifest.state === "ASSET_READY" || currentFilmManifest.gates?.currentPreview?.pass === true)
  && (currentFilmManifest.state === "ASSET_READY" || currentFilmManifest.gates?.userReview?.pass === true)
  && currentFilmManifest.reviewDecision?.status === "needs-revision"
  && (currentFilmManifest.state === "ASSET_READY" || currentFilmManifest.reviewDecision?.sourceBindingCurrent === true)
  && (currentFilmManifest.state === "ASSET_READY" || currentFilmManifest.reviewDecision?.previewShaCurrent === true)
  && currentFilmManifest.adoptionLedger?.buildId === currentFilmManifest.current?.buildId
  && currentFilmManifest.reviewOnly === true
  && currentFilmManifest.finalRenderAllowed === false
  && currentFilmManifest.resolveExportAllowed === false
  && fs.existsSync(paths.rendererSourceProps)
  && currentFilmManifest.current?.rendererPropsSha256 === sha256(paths.rendererSourceProps);
const directedReviewIsAuthority = phase.phaseId === expected.phaseId
  && phase.status === "ready-for-direct-review"
  && phase.authority?.kind === "directed-review-pointer"
  && phase.authority?.manifestPath === "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json"
  && directedReview.contract === "A1HSeriesSemanticDirectedReview/v1"
  && directedReview.status === "READY_FOR_DIRECT_REVIEW"
  && directedReview.reviewOnly === true
  && directedReview.finalRenderAllowed === false
  && directedReview.director?.sceneCount === 47
  && directedReview.director?.macroCount === 11
  && directedReview.continuityProof?.chapterOverlapFrames === 0
  && directedReview.sourceBinding?.propsSha256 === sha256(paths.rendererSourceProps)
  && directedReview.sourceBinding?.directorPlanSha256 === sha256(paths.directorPlan)
  && directedReview.sourceBinding?.directedRendererSha256 === sha256(paths.directedRenderer)
  && directedReview.media?.video?.sha256 === sha256(paths.directedReviewVideo)
  && packagingManifestAudit.status === "PASS_REVIEW_ONLY"
  && packagingManifestAudit.material?.summary?.rendererBoundCount === 47
  && packagingManifestAudit.material?.summary?.uniqueArtworkAssetCount === 7
  && packagingManifestAudit.material?.summary?.deterministicRenderedCount >= 22;
const productionSopContract = fs.existsSync(paths.productionSopContract) ? readJson(paths.productionSopContract) : {};

check("phase-id", phase.phaseId === expected.phaseId, phase.phaseId || "missing");
check("phase-ready-for-direct-review", phase.status === "ready-for-direct-review", phase.status || "missing");
check("phase-points-to-current-authority", directedReviewIsAuthority, phase.authority || "missing");
check("current-authority-audit-pass", currentAuthorityAudit.contract === "A1HSeriesCurrentAuthority/v1"
  && ["PASS", "PASS_WITH_EXCLUDED_LEGACY"].includes(currentAuthorityAudit.status)
  && currentAuthorityAudit.reviewOnly === true
  && currentAuthorityAudit.rendererAdoptionAllowed === false
  && currentAuthorityAudit.finalRenderAllowed === false
  && sha256(paths.currentAuthorityAudit) === sha256(paths.currentAuthorityAuditPublic), {
    contract: currentAuthorityAudit.contract || null,
    status: currentAuthorityAudit.status || null,
    reviewOnly: currentAuthorityAudit.reviewOnly,
    artifactSha256: sha256(paths.currentAuthorityAudit),
    publicSha256: sha256(paths.currentAuthorityAuditPublic),
  });
check("whole-film-director-contract-pass", wholeFilmDirectorPlan.contract === "A1WholeFilmDirectorPlan/v1"
  && wholeFilmDirectorPlan.status === "READY_FOR_USER_EDITORIAL_REVIEW"
  && wholeFilmDirectorPlan.source?.cueCount === 117
  && wholeFilmDirectorPlan.source?.durationMs === 218400
  && wholeFilmDirectorPlan.shots?.length === 30
  && wholeFilmDirectorPlan.coverage?.exact === true
  && wholeFilmDirectorPlan.coverage?.editTimelineContinuous === true
  && wholeFilmDirectorPlan.shots?.[0]?.editMode === "presenter-overlay"
  && wholeFilmDirectorPlan.shots?.[0]?.presenterPackage?.intensity === "hero"
  && wholeFilmDirectorPlan.shots?.[0]?.presenterPackage?.faceSafeZone === "LOCK_EYES_AND_MOUTH"
  && wholeFilmDirectorPlan.shots?.[0]?.sourceText === "Hi，我用 vibe coding 做了一款智能写作工作台。"
  && wholeFilmDirectorPlan.visualTruth?.currentPrototypeStatus === "STRUCTURAL_PASS_VISUAL_PENDING"
  && wholeFilmDirectorPlan.visualTruth?.humanVisualApproval === "PENDING_INDEPENDENT_MOTION_REVIEW"
  && wholeFilmDirectorPlan.authorship?.aiGenerated === false
  && wholeFilmDirectorPlan.authorship?.newArticleGeneralizationProven === false
  && wholeFilmDirectorPlan.gates?.firstShotDesignAllowed === false
  && wholeFilmDirectorPlan.gates?.shotRenderAllowed === false
  && wholeFilmDirectorPlan.gates?.rendererAdoptionAllowed === false
  && wholeFilmDirectorPlan.gates?.h47ExpansionAllowed === false
  && wholeFilmDirectorPlan.gates?.fullMp4RenderAllowed === false
  && wholeFilmDirectorReport.status === "DIRECTOR_CONTRACT_PASS_VISUAL_PENDING"
  && wholeFilmDirectorReport.sourceBinding?.planSha256 === sha256(paths.wholeFilmDirectorPlan)
  && wholeFilmDirectorAudit.status === "PASS"
  && sha256(paths.wholeFilmDirectorPlan) === sha256(paths.wholeFilmDirectorPlanPublic)
  && sha256(paths.wholeFilmDirectorReport) === sha256(paths.wholeFilmDirectorReportPublic)
  && sha256(paths.wholeFilmDirectorAudit) === sha256(paths.wholeFilmDirectorAuditPublic), {
    planStatus: wholeFilmDirectorPlan.status || null,
    shotCount: wholeFilmDirectorPlan.shots?.length || 0,
    cueCount: wholeFilmDirectorPlan.source?.cueCount || 0,
    firstShotMode: wholeFilmDirectorPlan.shots?.[0]?.editMode || null,
    visualStatus: wholeFilmDirectorPlan.visualTruth?.currentPrototypeStatus || null,
    auditStatus: wholeFilmDirectorAudit.status || null,
  });
check("phase-next-gate", phase.next?.recommended?.id === expected.preproductionNextAction
  && phase.next?.recommended?.requiresExplicitApproval === false, phase.next?.recommended || "missing");
check("phase-preproduction-motion-candidate-bound", phase.preproductionMotionCandidate?.phaseId === "h-series-preproduction-motion-candidate-v1"
  && phase.preproductionMotionCandidate?.status === "PASS"
  && phase.preproductionMotionCandidate?.sceneCount === 47
  && phase.preproductionMotionCandidate?.selectedSceneCount === 12
  && phase.preproductionMotionCandidate?.reportSha256 === sha256(paths.preproductionMotionCandidatePublic)
  && phase.preproductionMotionCandidate?.candidatePropsSha256 === sha256(paths.preproductionMotionCandidateProps)
  && phase.preproductionMotionCandidate?.reviewOnly === true
  && phase.preproductionMotionCandidate?.userApprovalStatus === "not-approved"
  && phase.preproductionMotionCandidate?.rendererAdoptionAllowed === false
  && phase.preproductionMotionCandidate?.fullMp4RenderAllowed === false
  && phase.preproductionMotionCandidate?.finalRenderAllowed === false
  && phase.preproductionMotionCandidate?.resolveExportAllowed === false, phase.preproductionMotionCandidate || "missing");
check("phase-review-only", phase.reviewDecision?.status === "awaiting-direct-visual-review"
  && phase.reviewDecision?.finalRenderAllowed === false
  && phase.reviewDecision?.resolveExportAllowed === false, phase.reviewDecision || "missing");
check("phase-candidate-review-pointer-reconciled", phase.reviewPacket?.candidateReview?.contract === "A1HSeriesCandidateReviewGate/v1"
  && phase.reviewPacket.candidateReview.status === "PENDING_USER_VISUAL_REVIEW"
  && phase.reviewPacket.candidateReview.candidateSceneCount === 47
  && phase.reviewPacket.candidateReportSha256 === sha256(paths.preproductionMotionCandidatePublic)
  && phase.reviewPacket.candidateReview.candidatePropsSha256 === sha256(paths.preproductionMotionCandidateProps)
  && phase.reviewPacket.candidateReview.rendererAdoptionAllowed === false
  && phase.reviewPacket.candidateReview.applyAllowed === false
  && phase.reviewPacket.candidateReview.fullRenderAllowed === false
  && phase.reviewPacket.candidateReview.finalRenderAllowed === false
  && phase.reviewPacket.candidateReview.resolveExportAllowed === false
  && phase.reviewPacket.candidateReview.nextAction === "review-47-shot-ledger-then-explicitly-approve-adoption"
  && phase.reviewPacket.nextAction === "review-47-shot-ledger-then-explicitly-approve-adoption", phase.reviewPacket?.candidateReview || "missing");
check("phase-continuity-pointer-reconciled", phase.continuity?.contract === "A1ContinuityManifest/v1"
  && phase.continuity?.status === "REVIEW_ONLY"
  && phase.continuity?.reviewOnly === true
  && phase.continuity?.finalRenderAllowed === false
  && phase.continuity?.manifestPath === "remotion-renderer/src/generated/hSeriesContinuityManifest.json"
  && phase.continuity?.manifestSha256 === sha256(paths.continuityManifest)
  && phase.continuity?.sourcePropsSha256 === sha256(paths.rendererSourceProps)
  && phase.continuity?.sceneCount === 47
  && phase.continuity?.transitionCount === 46
  && phase.continuity?.motifCount === 3
  && phase.continuity?.motifChangeCount === 8
  && phase.continuity?.sameMotifCarryCount === 38
  && phase.continuity?.allScenesBound === true
  && phase.continuity?.allBoundariesDeclared === true
  && phase.continuity?.ordered === true
  && phase.continuity?.fieldsBound === true
  && phase.continuity?.sourcePropsBound === true, phase.continuity || "missing");
check("typography-direction-proof", typographyDirection.contract === "A1HSeriesTypographyDirectionProof/v1"
  && typographyDirection.status === "READY_FOR_DIRECT_REVIEW"
  && typographyDirection.proofOnly === true
  && typographyDirection.currentAuthorityUntouched === true
  && typographyDirection.rendererPatchAllowed === false
  && typographyDirection.fullMp4RenderAllowed === false
  && typographyDirection.finalRenderAllowed === false
  && typographyDirection.coverage?.sceneCount === 47
  && typographyDirection.coverage?.familyCount >= 5
  && typographyDirection.coverage?.layoutCount >= 6
  && typographyDirection.coverage?.proofStillCount === 12
  && typographyDirection.sourceBinding?.typographyPlanSha256 === sha256(paths.typographyDirectionPlan)
  && typographyDirection.sourceBinding?.candidateRendererSha256 === sha256(paths.typographyDirectionRenderer)
  && typographyDirection.sourceBinding?.currentVideoSha256 === sha256(paths.directedReviewVideo)
  && typographyDirection.media?.contactSheet?.sha256 === sha256(paths.typographyDirectionContactSheet)
  && JSON.stringify(typographyDirection) === JSON.stringify(typographyDirectionPublic), typographyDirection.coverage || "missing");
check("preproduction-director-current-47-shot-intersection", preproductionDirector.contract === "A1HSeriesPreproductionDirectorReport/v1"
  && preproductionDirector.status === "READY_FOR_PREPRODUCTION_REVIEW"
  && preproductionDirector.reviewOnly === true
  && preproductionDirector.currentAuthorityUntouched === true
  && preproductionDirector.animationDesignAllowed === false
  && preproductionDirector.fullMp4RenderAllowed === false
  && preproductionDirector.finalRenderAllowed === false
  && preproductionDirector.summary?.sceneCount === 47
  && preproductionDirector.summary?.individuallyDirectedCount === 47
  && preproductionDirector.summary?.h01StaticShotCount === 4
  && preproductionDirector.summary?.h02StaticShotCount === 3
  && preproductionDirector.summary?.h03StaticShotCount === 3
  && preproductionDirector.summary?.h08StaticShotCount === 6
  && preproductionDirector.summary?.remainingStaticShotCount === 30
  && JSON.stringify(preproductionDirector.summary?.remainingStaticMacroCounts) === JSON.stringify({H04: 4, H05: 4, H06: 2, H07: 6, H09: 7, H10: 5, H11: 2})
  && preproductionDirector.summary?.materialGapCount === 0
  && preproductionDirector.anchorBeatIds?.length === 3
  && preproductionDirector.sourceBinding?.excludedStalePlan === "lib/h-series-full-director-plan-v1.js"
  && preproductionDirector.sourceBinding?.h01RendererSha256 === sha256(paths.preproductionH01Renderer)
  && preproductionDirector.sourceBinding?.h02RendererSha256 === sha256(paths.preproductionH02Renderer)
  && preproductionDirector.sourceBinding?.h03RendererSha256 === sha256(paths.preproductionH03Renderer)
  && preproductionDirector.sourceBinding?.h08RendererSha256 === sha256(paths.preproductionH08Renderer)
  && preproductionDirector.sourceBinding?.remainingRendererSha256 === sha256(paths.preproductionRemainingRenderer)
  && preproductionDirector.sourceBinding?.currentVideoSha256 === sha256(paths.directedReviewVideo)
  && preproductionDirector.directorPlan?.sha256 === sha256(paths.preproductionPlan)
  && preproductionDirector.media?.contactSheet?.sha256 === sha256(paths.preproductionAnchorContactSheet)
  && preproductionDirector.media?.h01ContactSheet?.sha256 === sha256(paths.preproductionH01ContactSheet)
  && preproductionDirector.media?.h02ContactSheet?.sha256 === sha256(paths.preproductionH02ContactSheet)
  && preproductionDirector.media?.h03ContactSheet?.sha256 === sha256(paths.preproductionH03ContactSheet)
  && preproductionDirector.media?.h08ContactSheet?.sha256 === sha256(paths.preproductionH08ContactSheet)
  && preproductionDirector.media?.remainingContactSheets?.H04?.sha256 === sha256(paths.preproductionH04ContactSheet)
  && preproductionDirector.media?.remainingContactSheets?.H05?.sha256 === sha256(paths.preproductionH05ContactSheet)
  && preproductionDirector.media?.remainingContactSheets?.H06?.sha256 === sha256(paths.preproductionH06ContactSheet)
  && preproductionDirector.media?.remainingContactSheets?.H07?.sha256 === sha256(paths.preproductionH07ContactSheet)
  && preproductionDirector.media?.remainingContactSheets?.H09?.sha256 === sha256(paths.preproductionH09ContactSheet)
  && preproductionDirector.media?.remainingContactSheets?.H10?.sha256 === sha256(paths.preproductionH10ContactSheet)
  && preproductionDirector.media?.remainingContactSheets?.H11?.sha256 === sha256(paths.preproductionH11ContactSheet)
  && preproductionDirector.h01StaticBoard?.shotCount === 4
  && preproductionDirector.h01StaticBoard?.beatIds?.join(",") === "H01-B01,H01-B02,H01-B03,H01-B04"
  && preproductionDirector.h01StaticBoard?.animationDesignAllowed === false
  && preproductionDirector.h02StaticBoard?.shotCount === 3
  && preproductionDirector.h02StaticBoard?.beatIds?.join(",") === "H02-B01,H02-B02,H02-B03"
  && preproductionDirector.h02StaticBoard?.animationDesignAllowed === false
  && preproductionDirector.h03StaticBoard?.shotCount === 3
  && preproductionDirector.h03StaticBoard?.beatIds?.join(",") === "H03-B01,H03-B02,H03-B03"
  && preproductionDirector.h03StaticBoard?.animationDesignAllowed === false
  && preproductionDirector.h08StaticBoard?.shotCount === 6
  && preproductionDirector.h08StaticBoard?.beatIds?.join(",") === "H08-B01,H08-B02,H08-B03,H08-B04,H08-B05,H08-B06"
  && preproductionDirector.h08StaticBoard?.animationDesignAllowed === false
  && preproductionDirector.remainingStaticBoard?.shotCount === 30
  && preproductionDirector.remainingStaticBoard?.animationDesignAllowed === false
  && Object.entries({H04: 4, H05: 4, H06: 2, H07: 6, H09: 7, H10: 5, H11: 2}).every(([macro, count]) => preproductionDirector.remainingStaticBoard?.macros?.[macro]?.shotCount === count
    && preproductionDirector.remainingStaticBoard?.macros?.[macro]?.animationDesignAllowed !== true)
  && JSON.stringify(preproductionDirector) === JSON.stringify(preproductionDirectorPublic), preproductionDirector.summary || "missing");
check("preproduction-director-plan-47-complete-decisions", preproductionPlan.contract === "A1HSeriesPreproductionDirectorPlan/v1"
  && preproductionPlan.authority === "current-47-shot-intersection"
  && preproductionPlan.animationDesignAllowed === false
  && preproductionPlan.fullMp4RenderAllowed === false
  && preproductionPlan.scenes?.length === 47
  && preproductionPlan.scenes?.every((item) => item.semantic?.viewerTakeaway && item.typography?.rationale && item.background?.rationale && item.composition?.rationale && item.elements?.length >= 2 && item.material?.rationale && item.continuity?.reason)
  && JSON.stringify(preproductionPlan) === JSON.stringify(preproductionPlanPublic), {sceneCount: preproductionPlan.scenes?.length || 0});
check("preproduction-motion-candidate-is-bound-and-review-only", preproductionMotionCandidate.contract === "A1HSeriesPreproductionMotionPreview/v1"
  && preproductionMotionCandidate.status === "PASS"
  && preproductionMotionCandidate.reviewOnly === true
  && preproductionMotionCandidate.proofOnly === true
  && preproductionMotionCandidate.currentAuthorityMutated === false
  && preproductionMotionCandidate.rendererAdoptionAllowed === false
  && preproductionMotionCandidate.fullMp4RenderAllowed === false
  && preproductionMotionCandidate.finalRenderAllowed === false
  && preproductionMotionCandidate.resolveExportAllowed === false
  && preproductionMotionCandidate.selectedBeatIds?.length === 12
  && preproductionMotionCandidate.continuityProof?.pairCount === 6
  && preproductionMotionCandidate.continuityProof?.adjacentPairCount === 6
  && preproductionMotionCandidate.checks?.adjacentContinuityPairs === true
  && preproductionMotionCandidate.continuityProof?.rendererBound === true
  && preproductionMotionCandidate.checks?.continuityRendererBound === true
  && preproductionMotionCandidate.sourceBinding?.motionRendererSource?.path === "remotion-renderer/src/MicrobeatLayeredFullReview.tsx"
  && preproductionMotionCandidate.sourceBinding?.motionRendererSource?.sha256 === sha256(path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx"))
  && preproductionMotionCandidate.continuityCoverage?.sceneCount === 47
  && preproductionMotionCandidate.continuityCoverage?.transitionCount === 46
  && preproductionMotionCandidate.continuityCoverage?.allScenesBound === true
  && preproductionMotionCandidate.continuityCoverage?.allBoundariesDeclared === true
  && preproductionMotionCandidate.continuityCoverage?.ordered === true
  && preproductionMotionCandidate.continuityCoverage?.fieldsBound === true
  && preproductionMotionCandidate.continuityCoverage?.sourcePropsBound === true
  && preproductionMotionCandidate.summary?.unboundRealEvidenceCount === 0
  && preproductionMotionCandidate.video?.durationFrames === 1080
  && preproductionMotionCandidate.holdFrames?.count === 12
  && preproductionMotionCandidate.checks?.candidateSceneCount === true
  && preproductionMotionCandidate.checks?.selectedSceneCount === true
  && preproductionMotionCandidate.checks?.currentPropsUnchanged === true
  && preproductionMotionCandidate.checks?.noFullFilmRender === true
  && preproductionMotionCandidate.continuityCoverage?.sceneCount === 47
  && preproductionMotionCandidate.continuityCoverage?.transitionCount === 46
  && preproductionMotionCandidate.continuityCoverage?.allScenesBound === true
  && preproductionMotionCandidate.continuityCoverage?.allBoundariesDeclared === true
  && preproductionMotionCandidate.continuityCoverage?.ordered === true
  && preproductionMotionCandidate.continuityCoverage?.fieldsBound === true
  && preproductionMotionCandidate.continuityCoverage?.sourcePropsBound === true
  && JSON.stringify(preproductionMotionCandidate) === JSON.stringify(preproductionMotionCandidatePublic), {status: preproductionMotionCandidate.status, selectedBeatCount: preproductionMotionCandidate.selectedBeatIds?.length || 0});
check("preproduction-motion-candidate-audit-pass", preproductionMotionCandidateAudit.contract === "A1HSeriesPreproductionMotionCandidateAudit/v1"
  && ["PASS", "PASS_WITH_SNAPSHOT_WARNINGS"].includes(preproductionMotionCandidateAudit.status)
  && preproductionMotionCandidateAudit.summary?.staticSceneCount === 47
  && preproductionMotionCandidateAudit.summary?.candidateSceneCount === 47
  && preproductionMotionCandidateAudit.summary?.stage3DirectorCount === 47
  && preproductionMotionCandidateAudit.summary?.selectedSceneCount === 12
  && preproductionMotionCandidateAudit.summary?.renderedStillCount === 47
  && preproductionMotionCandidate.allHoldFrames?.count === 47
  && preproductionMotionCandidate.allHoldFrames?.expectedCount === 47
  && preproductionMotionCandidate.checks?.allStillCount === true
  && preproductionMotionCandidateAudit.failures?.length === 0
  && JSON.stringify(preproductionMotionCandidateAudit) === JSON.stringify(preproductionMotionCandidateAuditPublic), preproductionMotionCandidateAudit.summary || "missing");
check("phase-points-to-preproduction-next-step", phase.preproduction?.status === "READY_FOR_PREPRODUCTION_REVIEW"
  && phase.preproduction?.reportSha256 === sha256(paths.preproductionDirectorPublic)
  && phase.preproduction?.directorPlanSha256 === sha256(paths.preproductionPlanPublic)
  && phase.preproduction?.anchorContactSheetSha256 === sha256(paths.preproductionAnchorContactSheet)
  && phase.preproduction?.h01StaticBoardContactSheetSha256 === sha256(paths.preproductionH01ContactSheet)
  && phase.preproduction?.h02StaticBoardContactSheetSha256 === sha256(paths.preproductionH02ContactSheet)
  && phase.preproduction?.h03StaticBoardContactSheetSha256 === sha256(paths.preproductionH03ContactSheet)
  && phase.preproduction?.h08StaticBoardContactSheetSha256 === sha256(paths.preproductionH08ContactSheet)
  && phase.preproduction?.remainingStaticShotCount === 30
  && Object.entries({H04: paths.preproductionH04ContactSheet, H05: paths.preproductionH05ContactSheet, H06: paths.preproductionH06ContactSheet, H07: paths.preproductionH07ContactSheet, H09: paths.preproductionH09ContactSheet, H10: paths.preproductionH10ContactSheet, H11: paths.preproductionH11ContactSheet}).every(([macro, file]) => phase.preproduction?.remainingStaticBoardContactSheets?.[macro]?.sha256 === sha256(file))
  && phase.preproduction?.sceneCount === 47
  && phase.preproduction?.anchorCount === 3
  && phase.preproduction?.h01StaticShotCount === 4
  && phase.preproduction?.h02StaticShotCount === 3
  && phase.preproduction?.h03StaticShotCount === 3
  && phase.preproduction?.h08StaticShotCount === 6
  && phase.preproduction?.animationDesignAllowed === false
  && phase.preproduction?.fullMp4RenderAllowed === false, phase.preproduction || "missing");

check("manifest-current-reviewable", manifest.status === "current-reviewable", manifest.status || "missing");
check("manifest-review-only", manifest.reviewOnly === true && manifest.finalRenderAllowed === false, {reviewOnly: manifest.reviewOnly, finalRenderAllowed: manifest.finalRenderAllowed});
check("manifest-port-and-branch", manifest.frontendPort === expected.frontendPort && manifest.branch === expected.branch, {frontendPort: manifest.frontendPort, branch: manifest.branch});
check("manifest-visual-master", manifest.visualMasterId === expected.visualMasterId, manifest.visualMasterId || "missing");

const videoFile = manifest.video?.url ? path.join(publicRoot, manifest.video.url.replace(/^\//u, "")) : "";
const mp4ContactSheetFile = manifest.contactSheet?.url ? path.join(publicRoot, manifest.contactSheet.url.replace(/^\//u, "")) : "";
const currentFilmVideoFile = currentFilmManifest.activePreview?.video?.url
  ? path.join(publicRoot, currentFilmManifest.activePreview.video.url.replace(/^\//u, ""))
  : "";
check("video-file-exists", directedReviewIsAuthority ? fs.existsSync(paths.directedReviewVideo) : Boolean(videoFile && fs.existsSync(videoFile)), directedReviewIsAuthority ? paths.directedReviewVideo : videoFile || "missing");
if (directedReviewIsAuthority) {
  check("video-sha-matches-manifest-and-phase", sha256(paths.directedReviewVideo) === directedReview.media?.video?.sha256 && directedReview.media.video.sha256 === phase.proof?.videoSha256, {actual: sha256(paths.directedReviewVideo), review: directedReview.media?.video?.sha256, phase: phase.proof?.videoSha256});
} else if (currentFilmIsAuthority && currentFilmManifest.gates?.currentPreview?.pass === true) {
  check("video-sha-matches-manifest-and-phase", Boolean(
    currentFilmVideoFile
    && fs.existsSync(currentFilmVideoFile)
    && sha256(currentFilmVideoFile) === currentFilmManifest.activePreview?.video?.sha256
  ), {
    authority: "current-film-manifest",
    actual: currentFilmVideoFile && fs.existsSync(currentFilmVideoFile) ? sha256(currentFilmVideoFile) : null,
    manifest: currentFilmManifest.activePreview?.video?.sha256 || null,
    historicalPhase: phase.proof?.videoSha256 || null,
  });
} else if (currentFilmIsAuthority) {
  check("current-preview-remains-locked-after-source-change", currentFilmManifest.gates?.currentPreview?.pass === false && currentFilmManifest.finalRenderAllowed === false && currentFilmManifest.resolveExportAllowed === false, {state: currentFilmManifest.state, currentPreview: currentFilmManifest.gates?.currentPreview});
} else if (videoFile && fs.existsSync(videoFile)) {
  check("video-sha-matches-manifest-and-phase", sha256(videoFile) === manifest.video.sha256 && (!phase.proof?.videoSha256 || manifest.video.sha256 === phase.proof.videoSha256), {actual: sha256(videoFile), manifest: manifest.video.sha256, phase: phase.proof?.videoSha256 || "not-repeated-in-current-phase"});
}
check("mp4-contact-sheet-exists", Boolean(mp4ContactSheetFile && fs.existsSync(mp4ContactSheetFile)), mp4ContactSheetFile || "missing");
if (mp4ContactSheetFile && fs.existsSync(mp4ContactSheetFile)) check("mp4-contact-sheet-sha-matches", sha256(mp4ContactSheetFile) === manifest.contactSheet.sha256, {actual: sha256(mp4ContactSheetFile), manifest: manifest.contactSheet.sha256});
check("mp4-report-pass", mp4Report.contract === "A1HSeries540pReviewMp4/v1" && mp4Report.status === "PASS", {contract: mp4Report.contract, status: mp4Report.status});
check("mp4-report-final-render-blocked", mp4Report.finalRenderAllowed === false || mp4Report.reviewOnly === true, {reviewOnly: mp4Report.reviewOnly, finalRenderAllowed: mp4Report.finalRenderAllowed});

check("v1-visual-rejection-status", v1VisualRejection.contract === "A1HSeriesV1VisualRejection/v1" && v1VisualRejection.status === "REJECTED_STALE_VISUAL" && v1VisualRejection.locks?.doNotOverwriteV1 === true && v1VisualRejection.locks?.v1NotFinalVisual === true && Array.isArray(v1VisualRejection.failures) && v1VisualRejection.failures.length === 0, {contract: v1VisualRejection.contract, status: v1VisualRejection.status, locks: v1VisualRejection.locks, failures: v1VisualRejection.failures});
check("v1-visual-rejection-public-identical", fs.existsSync(paths.v1VisualRejection) && fs.existsSync(paths.v1VisualRejectionPublic) && sha256(paths.v1VisualRejection) === sha256(paths.v1VisualRejectionPublic), {artifact: fs.existsSync(paths.v1VisualRejection) ? sha256(paths.v1VisualRejection) : null, public: fs.existsSync(paths.v1VisualRejectionPublic) ? sha256(paths.v1VisualRejectionPublic) : null});
check("v2-candidate-manifest-status", v2CandidateManifest.contract === "A1SystemLineReviewWebManifest/v2Candidate" && v2CandidateManifest.status === "candidate-reviewable" && v2CandidateManifest.candidateOnly === true && v2CandidateManifest.replacesCurrentV1 === false && v2CandidateManifest.finalRenderAllowed === false && v2CandidateManifest.resolveExportAllowed === false, {contract: v2CandidateManifest.contract, status: v2CandidateManifest.status, candidateOnly: v2CandidateManifest.candidateOnly, replacesCurrentV1: v2CandidateManifest.replacesCurrentV1, finalRenderAllowed: v2CandidateManifest.finalRenderAllowed, resolveExportAllowed: v2CandidateManifest.resolveExportAllowed});
check("v2-candidate-report-pass", v2CandidateReport.contract === "A1HSeries540pReviewMp4V2Candidate/v1" && v2CandidateReport.status === "PASS" && v2CandidateReport.candidateOnly === true && v2CandidateReport.replacesCurrentV1 === false && v2CandidateReport.finalRenderAllowed === false && v2CandidateReport.resolveExportAllowed === false, {contract: v2CandidateReport.contract, status: v2CandidateReport.status, candidateOnly: v2CandidateReport.candidateOnly, replacesCurrentV1: v2CandidateReport.replacesCurrentV1});
check("v2-candidate-report-public-identical", fs.existsSync(paths.v2CandidateReport) && fs.existsSync(paths.v2CandidateReportPublic) && sha256(paths.v2CandidateReport) === sha256(paths.v2CandidateReportPublic), {artifact: fs.existsSync(paths.v2CandidateReport) ? sha256(paths.v2CandidateReport) : null, public: fs.existsSync(paths.v2CandidateReportPublic) ? sha256(paths.v2CandidateReportPublic) : null});
const v2CandidateVideoFile = v2CandidateManifest.video?.url ? path.join(publicRoot, v2CandidateManifest.video.url.replace(/^\//u, "")) : "";
const v2CandidateContactSheetFile = v2CandidateManifest.contactSheet?.url ? path.join(publicRoot, v2CandidateManifest.contactSheet.url.replace(/^\//u, "")) : "";
check("v2-candidate-video-file", Boolean(v2CandidateVideoFile && fs.existsSync(v2CandidateVideoFile) && sha256(v2CandidateVideoFile) === v2CandidateManifest.video?.sha256 && v2CandidateManifest.video?.sha256 !== manifest.video?.sha256), {file: v2CandidateVideoFile || "missing", actual: v2CandidateVideoFile && fs.existsSync(v2CandidateVideoFile) ? sha256(v2CandidateVideoFile) : null, v2: v2CandidateManifest.video?.sha256, v1: manifest.video?.sha256});
check("v2-candidate-contact-sheet-file", Boolean(v2CandidateContactSheetFile && fs.existsSync(v2CandidateContactSheetFile) && sha256(v2CandidateContactSheetFile) === v2CandidateManifest.contactSheet?.sha256), {file: v2CandidateContactSheetFile || "missing", actual: v2CandidateContactSheetFile && fs.existsSync(v2CandidateContactSheetFile) ? sha256(v2CandidateContactSheetFile) : null, v2: v2CandidateManifest.contactSheet?.sha256});
const v2IsExplicitlyHistorical = (currentFilmIsAuthority || directedReviewIsAuthority)
  && currentFilmManifest.legacyArtifacts?.some((artifact) => artifact.id === "h-series-540p-review-mp4-v2-candidate" && artifact.status === "STALE" && artifact.mayBePresentedAsCurrent === false);
check("v2-candidate-uses-current-source-props", (fs.existsSync(paths.rendererSourceProps) && sha256(paths.rendererSourceProps) === v2CandidateManifest.sourceBinding?.propsSha256) || v2IsExplicitlyHistorical, {
  authority: directedReviewIsAuthority ? "semantic-directed-review" : currentFilmIsAuthority ? "current-film-manifest" : "legacy-v2-candidate",
  sourceProps: fs.existsSync(paths.rendererSourceProps) ? sha256(paths.rendererSourceProps) : null,
  v2ManifestProps: v2CandidateManifest.sourceBinding?.propsSha256,
  v2IsExplicitlyHistorical,
});
check("storyboard-current-bound-to-renderer-source-props", storyboardManifest.contract === "A1StoryboardDraftManifest/v1" && storyboardManifest.status === "review-only-isolated-draft" && fs.existsSync(paths.storyboardProps) && fs.existsSync(paths.rendererSourceProps) && storyboardManifest.current?.propsSha256 === sha256(paths.storyboardProps) && sha256(paths.storyboardProps) === sha256(paths.rendererSourceProps) && Array.isArray(storyboardProps.scenes) && Array.isArray(rendererSourceProps.scenes) && storyboardProps.scenes.length === rendererSourceProps.scenes.length, {storyboardManifest: storyboardManifest.current || null, storyboardSourceSha256: storyboardManifest.source?.sha256 || null, storyboardPropsSha256: fs.existsSync(paths.storyboardProps) ? sha256(paths.storyboardProps) : null, rendererSourcePropsSha256: fs.existsSync(paths.rendererSourceProps) ? sha256(paths.rendererSourceProps) : null, storyboardSceneCount: storyboardProps.scenes?.length || null, rendererSceneCount: rendererSourceProps.scenes?.length || null});
check("storyboard-first-render-gate-active", storyboardFirstRenderGate.contract === "A1StoryboardFirstRenderGate/v1" && storyboardFirstRenderGate.policy?.storyboardFirst === true && storyboardFirstRenderGate.policy?.noFullMp4RefreshWithoutStoryboardApproval === true && storyboardFirstRenderGate.policy?.finalRenderAllowed === false && storyboardFirstRenderGate.policy?.resolveExportAllowed === false && ["ACTIVE_PENDING_STORYBOARD_APPROVAL", "PASS_APPROVED_FOR_540P_REVIEW_RENDER"].includes(storyboardFirstRenderGate.status), {contract: storyboardFirstRenderGate.contract, status: storyboardFirstRenderGate.status, policy: storyboardFirstRenderGate.policy, blockers: storyboardFirstRenderGate.blockers});
check("storyboard-first-render-gate-public-identical", fs.existsSync(paths.storyboardFirstRenderGate) && fs.existsSync(paths.storyboardFirstRenderGatePublic) && sha256(paths.storyboardFirstRenderGate) === sha256(paths.storyboardFirstRenderGatePublic), {artifact: fs.existsSync(paths.storyboardFirstRenderGate) ? sha256(paths.storyboardFirstRenderGate) : null, public: fs.existsSync(paths.storyboardFirstRenderGatePublic) ? sha256(paths.storyboardFirstRenderGatePublic) : null});
check("production-sop-contract-ready", productionSopContract.contract === "A1ArticleMotionProductionSOP/v1" && productionSopContract.status === "READY_FOR_AESTHETIC_MOTION_UPGRADE" && productionSopContract.reviewOnly === true && productionSopContract.rendererAdoptionAllowed === false && productionSopContract.fullMp4RenderAllowed === false && productionSopContract.finalRenderAllowed === false && productionSopContract.resolveExportAllowed === false, {contract: productionSopContract.contract, status: productionSopContract.status, reviewOnly: productionSopContract.reviewOnly, rendererAdoptionAllowed: productionSopContract.rendererAdoptionAllowed, fullMp4RenderAllowed: productionSopContract.fullMp4RenderAllowed, finalRenderAllowed: productionSopContract.finalRenderAllowed, resolveExportAllowed: productionSopContract.resolveExportAllowed});
check("production-sop-contract-summary", productionSopContract.summary?.sceneCount === 36 && productionSopContract.summary?.blockerCount === 0 && productionSopContract.summary?.reviewRiskCount === 0 && productionSopContract.summary?.blockingGateCount === 0 && productionSopContract.summary?.materialCounts?.["not-needed"] === 36 && (productionSopContract.summary?.semanticStageCounts?.operation || 0) >= 1 && (productionSopContract.summary?.semanticStageCounts?.argument || 0) >= 1 && (productionSopContract.summary?.semanticStageCounts?.archive || 0) >= 1, productionSopContract.summary || "missing");
check("production-sop-contract-public-identical", fs.existsSync(paths.productionSopContract) && fs.existsSync(paths.productionSopContractPublic) && sha256(paths.productionSopContract) === sha256(paths.productionSopContractPublic), {artifact: fs.existsSync(paths.productionSopContract) ? sha256(paths.productionSopContract) : null, public: fs.existsSync(paths.productionSopContractPublic) ? sha256(paths.productionSopContractPublic) : null});
check("production-sop-report-public-identical", fs.existsSync(paths.productionSopReport) && fs.existsSync(paths.productionSopReportPublic) && sha256(paths.productionSopReport) === sha256(paths.productionSopReportPublic), {artifact: fs.existsSync(paths.productionSopReport) ? sha256(paths.productionSopReport) : null, public: fs.existsSync(paths.productionSopReportPublic) ? sha256(paths.productionSopReportPublic) : null});
const v2CandidateVisualQualityIsHistorical = v2CandidateVisualQuality.status === "STALE_HISTORICAL"
  && v2CandidateVisualQuality.historicalClassification?.currentPhase === expected.phaseId
  && v2CandidateVisualQuality.historicalClassification?.currentCandidatePhase === "h-series-preproduction-motion-candidate-v1"
  && v2CandidateVisualQuality.historicalClassification?.currentCandidateReviewOnly === true
  && v2CandidateVisualQuality.historicalClassification?.currentCandidateFinalRenderAllowed === false;
check("v2-candidate-visual-quality-pass", v2CandidateVisualQuality.contract === "A1HSeriesV2CandidateVisualQualityAudit/v1" && (v2CandidateVisualQuality.status === "PASS_CANDIDATE_REVIEWABLE" || v2CandidateVisualQualityIsHistorical) && v2CandidateVisualQuality.candidateOnly === true && v2CandidateVisualQuality.finalRenderAllowed === false && v2CandidateVisualQuality.resolveExportAllowed === false && (v2CandidateVisualQualityIsHistorical || (Array.isArray(v2CandidateVisualQuality.failures) && v2CandidateVisualQuality.failures.length === 0)), {contract: v2CandidateVisualQuality.contract, status: v2CandidateVisualQuality.status, historical: v2CandidateVisualQualityIsHistorical, failures: v2CandidateVisualQuality.failures, aggregate: v2CandidateVisualQuality.aggregate});
check("v2-candidate-visual-quality-public-identical", fs.existsSync(paths.v2CandidateVisualQuality) && fs.existsSync(paths.v2CandidateVisualQualityPublic) && sha256(paths.v2CandidateVisualQuality) === sha256(paths.v2CandidateVisualQualityPublic), {artifact: fs.existsSync(paths.v2CandidateVisualQuality) ? sha256(paths.v2CandidateVisualQuality) : null, public: fs.existsSync(paths.v2CandidateVisualQualityPublic) ? sha256(paths.v2CandidateVisualQualityPublic) : null});

check("targeted-visual-upgrade-preview-pass", targetedVisualUpgradePreview.contract === "A1HSeriesTargetedVisualUpgradePreview/v1" && targetedVisualUpgradePreview.status === "PASS_REVIEWABLE" && targetedVisualUpgradePreview.previewOnly === true && targetedVisualUpgradePreview.finalRenderAllowed === false && targetedVisualUpgradePreview.resolveExportAllowed === false && targetedVisualUpgradePreview.rendererAdoptionAllowed === false && Array.isArray(targetedVisualUpgradePreview.failures) && targetedVisualUpgradePreview.failures.length === 0, {contract: targetedVisualUpgradePreview.contract, status: targetedVisualUpgradePreview.status, failures: targetedVisualUpgradePreview.failures});
check("targeted-visual-upgrade-preview-public-identical", fs.existsSync(paths.targetedVisualUpgradePreview) && fs.existsSync(paths.targetedVisualUpgradePreviewPublic) && sha256(paths.targetedVisualUpgradePreview) === sha256(paths.targetedVisualUpgradePreviewPublic), {artifact: fs.existsSync(paths.targetedVisualUpgradePreview) ? sha256(paths.targetedVisualUpgradePreview) : null, public: fs.existsSync(paths.targetedVisualUpgradePreviewPublic) ? sha256(paths.targetedVisualUpgradePreviewPublic) : null});
check("targeted-visual-upgrade-preview-audit-pass", targetedVisualUpgradePreviewAudit.contract === "A1HSeriesTargetedVisualUpgradePreviewAudit/v1" && targetedVisualUpgradePreviewAudit.status === "PASS" && targetedVisualUpgradePreviewAudit.previewOnly === true && targetedVisualUpgradePreviewAudit.finalRenderAllowed === false && targetedVisualUpgradePreviewAudit.resolveExportAllowed === false && targetedVisualUpgradePreviewAudit.rendererAdoptionAllowed === false && Array.isArray(targetedVisualUpgradePreviewAudit.targetBeatIds) && targetedVisualUpgradePreviewAudit.targetBeatIds.length === 5 && targetedVisualUpgradePreviewAudit.proof?.selectedFiveShots === true && targetedVisualUpgradePreviewAudit.proof?.generatedArtworkIntegratedIntoPreview === true && targetedVisualUpgradePreviewAudit.proof?.premiumTextMotionImplementedInPreview === true && targetedVisualUpgradePreviewAudit.proof?.beforeAfterClipRendered === true && Array.isArray(targetedVisualUpgradePreviewAudit.failures) && targetedVisualUpgradePreviewAudit.failures.length === 0, {contract: targetedVisualUpgradePreviewAudit.contract, status: targetedVisualUpgradePreviewAudit.status, proof: targetedVisualUpgradePreviewAudit.proof, failures: targetedVisualUpgradePreviewAudit.failures});
check("targeted-visual-upgrade-preview-audit-public-identical", fs.existsSync(paths.targetedVisualUpgradePreviewAudit) && fs.existsSync(paths.targetedVisualUpgradePreviewAuditPublic) && sha256(paths.targetedVisualUpgradePreviewAudit) === sha256(paths.targetedVisualUpgradePreviewAuditPublic), {artifact: fs.existsSync(paths.targetedVisualUpgradePreviewAudit) ? sha256(paths.targetedVisualUpgradePreviewAudit) : null, public: fs.existsSync(paths.targetedVisualUpgradePreviewAuditPublic) ? sha256(paths.targetedVisualUpgradePreviewAuditPublic) : null});
const targetedVisualUpgradeVideoFile = targetedVisualUpgradePreview.media?.video?.publicUrl ? path.join(publicRoot, targetedVisualUpgradePreview.media.video.publicUrl.replace(/^\//u, "")) : "";
const targetedVisualUpgradeContactSheetFile = targetedVisualUpgradePreview.media?.contactSheet?.publicUrl ? path.join(publicRoot, targetedVisualUpgradePreview.media.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("targeted-visual-upgrade-preview-video-file", Boolean(targetedVisualUpgradeVideoFile && fs.existsSync(targetedVisualUpgradeVideoFile) && sha256(targetedVisualUpgradeVideoFile) === targetedVisualUpgradePreview.media?.video?.sha256 && targetedVisualUpgradePreview.media?.video?.width === 960 && targetedVisualUpgradePreview.media?.video?.height === 540), {file: targetedVisualUpgradeVideoFile || "missing", actual: targetedVisualUpgradeVideoFile && fs.existsSync(targetedVisualUpgradeVideoFile) ? sha256(targetedVisualUpgradeVideoFile) : null, report: targetedVisualUpgradePreview.media?.video});
check("targeted-visual-upgrade-preview-contact-sheet-file", Boolean(targetedVisualUpgradeContactSheetFile && fs.existsSync(targetedVisualUpgradeContactSheetFile) && sha256(targetedVisualUpgradeContactSheetFile) === targetedVisualUpgradePreview.media?.contactSheet?.sha256), {file: targetedVisualUpgradeContactSheetFile || "missing", actual: targetedVisualUpgradeContactSheetFile && fs.existsSync(targetedVisualUpgradeContactSheetFile) ? sha256(targetedVisualUpgradeContactSheetFile) : null, report: targetedVisualUpgradePreview.media?.contactSheet});

check("visual-redirection-preview-pass", visualRedirection.contract === "A1HSeriesVisualRedirectionPreview/v1" && visualRedirection.status === "PASS_REVIEWABLE" && visualRedirection.previewOnly === true && visualRedirection.reviewOnly === true && visualRedirection.rendererAdoptionAllowed === false && visualRedirection.fullMp4RenderAllowed === false && visualRedirection.finalRenderAllowed === false && visualRedirection.resolveExportAllowed === false && visualRedirection.anchorStrategy?.count === 3 && visualRedirection.anchorStrategy?.keyStateCount === 12 && Array.isArray(visualRedirection.correctedBeatIds) && ["H03-B04", "H06-B01", "H10-B03", "H11-B01"].every((beatId) => visualRedirection.correctedBeatIds.includes(beatId)) && Array.isArray(visualRedirection.failures) && visualRedirection.failures.length === 0, {contract: visualRedirection.contract, status: visualRedirection.status, anchors: visualRedirection.anchorStrategy, correctedBeatIds: visualRedirection.correctedBeatIds, failures: visualRedirection.failures});
check("visual-redirection-preview-public-identical", fs.existsSync(paths.visualRedirection) && fs.existsSync(paths.visualRedirectionPublic) && sha256(paths.visualRedirection) === sha256(paths.visualRedirectionPublic), {artifact: fs.existsSync(paths.visualRedirection) ? sha256(paths.visualRedirection) : null, public: fs.existsSync(paths.visualRedirectionPublic) ? sha256(paths.visualRedirectionPublic) : null});
const visualRedirectionAuditIsHistorical = visualRedirectionAudit.contract === "A1HSeriesVisualRedirectionAudit/v1" && visualRedirectionAudit.status === "STALE_HISTORICAL" && visualRedirectionAudit.historicalClassification?.sourcePropsMismatch === true && visualRedirectionAudit.historicalClassification?.pageBoundary === true && visualRedirectionAudit.historicalClassification?.reviewOnly === true && visualRedirectionAudit.historicalClassification?.rendererAdoptionAllowed === false && visualRedirectionAudit.historicalClassification?.finalRenderAllowed === false && Array.isArray(visualRedirectionAudit.failures) && visualRedirectionAudit.failures.length === 0;
check("visual-redirection-audit-pass", visualRedirectionAudit.contract === "A1HSeriesVisualRedirectionAudit/v1" && (visualRedirectionAudit.status === "PASS" || visualRedirectionAuditIsHistorical) && Array.isArray(visualRedirectionAudit.failures) && visualRedirectionAudit.failures.length === 0, {contract: visualRedirectionAudit.contract, status: visualRedirectionAudit.status, historical: visualRedirectionAuditIsHistorical, failures: visualRedirectionAudit.failures});
check("visual-redirection-audit-public-identical", fs.existsSync(paths.visualRedirectionAudit) && fs.existsSync(paths.visualRedirectionAuditPublic) && sha256(paths.visualRedirectionAudit) === sha256(paths.visualRedirectionAuditPublic), {artifact: fs.existsSync(paths.visualRedirectionAudit) ? sha256(paths.visualRedirectionAudit) : null, public: fs.existsSync(paths.visualRedirectionAuditPublic) ? sha256(paths.visualRedirectionAuditPublic) : null});
const visualRedirectionVideoFile = visualRedirection.media?.video?.publicUrl ? path.join(publicRoot, visualRedirection.media.video.publicUrl.replace(/^\//u, "")) : "";
const visualRedirectionContactSheetFile = visualRedirection.media?.contactSheet?.publicUrl ? path.join(publicRoot, visualRedirection.media.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("visual-redirection-media-files", Boolean(visualRedirectionVideoFile && fs.existsSync(visualRedirectionVideoFile) && sha256(visualRedirectionVideoFile) === visualRedirection.media?.video?.sha256 && visualRedirection.media?.video?.width === 960 && visualRedirection.media?.video?.height === 540 && Math.abs(Number(visualRedirection.media?.video?.durationSec) - 30) <= .08 && visualRedirection.media?.video?.audioCodec && visualRedirectionContactSheetFile && fs.existsSync(visualRedirectionContactSheetFile) && sha256(visualRedirectionContactSheetFile) === visualRedirection.media?.contactSheet?.sha256), {video: visualRedirection.media?.video || null, contactSheet: visualRedirection.media?.contactSheet || null});
check("visual-redirection-preserves-current-film", directedReviewIsAuthority
  ? visualRedirection.rendererAdoptionAllowed === false && visualRedirection.finalRenderAllowed === false && directedReview.media?.video?.sha256 !== visualRedirection.media?.video?.sha256
  : currentFilmIsAuthority && (!currentFilmManifest.gates?.currentPreview?.pass
    ? visualRedirection.rendererAdoptionAllowed === false && visualRedirection.finalRenderAllowed === false
    : visualRedirection.sourceBinding?.propsSha256 === currentFilmManifest.current?.rendererPropsSha256 && visualRedirection.sourceBinding?.currentFilmBuildId === currentFilmManifest.current?.buildId && visualRedirection.sourceBinding?.currentFilmVideoSha256 === currentFilmManifest.activePreview?.video?.sha256), {authority: directedReviewIsAuthority ? "semantic-directed-review" : "current-film-manifest", currentFilmBuildId: currentFilmManifest.current?.buildId, currentFilmVideoSha256: currentFilmManifest.activePreview?.video?.sha256, sourceBinding: visualRedirection.sourceBinding || null});

const stage2TargetBeatIds = ["H03-B04", "H06-B01", "H10-B03", "H11-B01"];
const stage2ContactSheetSha = fs.existsSync(paths.stage2FullReviewContactSheet) ? sha256(paths.stage2FullReviewContactSheet) : null;
const stage2IsSupersededHistory = directedReviewIsAuthority
  && stage2FullReview.contract === "A1StoryboardStage2FullReview/v1"
  && stage2FullReview.reviewOnly === true
  && stage2FullReview.rendererAdoptionAllowed === false
  && stage2FullReview.finalRenderAllowed === false
  && stage2FullReview.summary?.sceneCount === 50
  && stage2FullReview.sourceBinding?.propsSha256 !== directedReview.sourceBinding?.propsSha256;
check("stage2-full-review-candidate-pass", stage2IsSupersededHistory || (stage2FullReview.contract === "A1StoryboardStage2FullReview/v1"
  && stage2FullReview.status === "REVIEW_CANDIDATE_READY"
  && stage2FullReview.reviewOnly === true
  && stage2FullReview.rendererAdoptionAllowed === false
  && stage2FullReview.applyAllowedBeforeExplicitApproval === false
  && stage2FullReview.fullMp4RenderAllowed === false
  && stage2FullReview.finalRenderAllowed === false
  && stage2FullReview.resolveExportAllowed === false
  && stage2FullReview.summary?.sceneCount === 50
  && stage2FullReview.summary?.reviewedSceneCount === 50
  && stage2TargetBeatIds.every((beatId) => stage2FullReview.candidate?.changedBeatIds?.includes(beatId))
  && stage2FullReview.candidate?.unchangedCurrentProps === true
  && stage2FullReview.sourceBinding?.propsSha256 === currentFilmManifest.current?.rendererPropsSha256), {classification: stage2IsSupersededHistory ? "superseded-history" : "candidate", contract: stage2FullReview.contract, status: stage2FullReview.status, sourceBinding: stage2FullReview.sourceBinding, candidate: stage2FullReview.candidate, summary: stage2FullReview.summary});
check("stage2-full-review-public-identical", fs.existsSync(paths.stage2FullReview) && fs.existsSync(paths.stage2FullReviewPublic) && sha256(paths.stage2FullReview) === sha256(paths.stage2FullReviewPublic), {artifact: fs.existsSync(paths.stage2FullReview) ? sha256(paths.stage2FullReview) : null, public: fs.existsSync(paths.stage2FullReviewPublic) ? sha256(paths.stage2FullReviewPublic) : null});
check("stage2-full-review-audit-pass", stage2FullReviewAudit.contract === "A1StoryboardStage2FullReviewAudit/v1" && stage2FullReviewAudit.status === "PASS_REVIEWABLE" && stage2FullReviewAudit.reviewOnly === true && stage2FullReviewAudit.rendererAdoptionAllowed === false && stage2FullReviewAudit.fullMp4RenderAllowed === false && stage2FullReviewAudit.finalRenderAllowed === false && stage2FullReviewAudit.resolveExportAllowed === false && stage2TargetBeatIds.every((beatId) => stage2FullReviewAudit.targetBeatIds?.includes(beatId)) && Array.isArray(stage2FullReviewAudit.failures) && stage2FullReviewAudit.failures.length === 0, {contract: stage2FullReviewAudit.contract, status: stage2FullReviewAudit.status, failures: stage2FullReviewAudit.failures});
check("stage2-full-review-audit-public-identical", fs.existsSync(paths.stage2FullReviewAudit) && fs.existsSync(paths.stage2FullReviewAuditPublic) && sha256(paths.stage2FullReviewAudit) === sha256(paths.stage2FullReviewAuditPublic), {artifact: fs.existsSync(paths.stage2FullReviewAudit) ? sha256(paths.stage2FullReviewAudit) : null, public: fs.existsSync(paths.stage2FullReviewAuditPublic) ? sha256(paths.stage2FullReviewAuditPublic) : null});
check("stage2-full-review-candidate-props-separate", fs.existsSync(paths.stage2FullReviewCandidateProps) && stage2FullReview.candidate?.propsSha256 === sha256(paths.stage2FullReviewCandidateProps) && stage2FullReview.candidate.propsSha256 !== currentFilmManifest.current?.rendererPropsSha256 && sha256(paths.rendererSourceProps) === currentFilmManifest.current?.rendererPropsSha256, {candidate: stage2FullReview.candidate?.propsSha256, current: currentFilmManifest.current?.rendererPropsSha256});
check("stage2-full-review-contact-sheet-bound", Boolean(stage2ContactSheetSha && stage2ContactSheetSha === stage2FullReviewAudit.contactSheet?.sha256 && fs.existsSync(paths.stage2FullReviewContactSheetPublic) && sha256(paths.stage2FullReviewContactSheetPublic) === stage2ContactSheetSha), {artifact: stage2ContactSheetSha, public: fs.existsSync(paths.stage2FullReviewContactSheetPublic) ? sha256(paths.stage2FullReviewContactSheetPublic) : null, audit: stage2FullReviewAudit.contactSheet?.sha256});

const stage3ContactSheetSha = fs.existsSync(paths.stage3FullDirectorContactSheet) ? sha256(paths.stage3FullDirectorContactSheet) : null;
const stage3Ledger = currentFilmManifest.adoptionLedger?.items?.find((item) => item.id === "stage3-full-director-candidate");
const stage3IsSupersededHistory = directedReviewIsAuthority
  && stage3FullDirector.contract === "A1StoryboardStage3FullDirector/v1"
  && stage3FullDirector.reviewOnly === true
  && stage3FullDirector.rendererAdoptionAllowed === false
  && stage3FullDirector.finalRenderAllowed === false
  && stage3FullDirector.summary?.sceneCount === 50
  && stage3FullDirector.sourceBinding?.propsSha256 !== directedReview.sourceBinding?.propsSha256;
check("stage3-full-director-rejected-history", stage3IsSupersededHistory || (stage3FullDirector.contract === "A1StoryboardStage3FullDirector/v1"
  && stage3FullDirector.status === "REVIEW_CANDIDATE_READY"
  && stage3FullDirector.reviewOnly === true
  && stage3FullDirector.rendererAdoptionAllowed === false
  && stage3FullDirector.applyAllowedBeforeExplicitApproval === false
  && stage3FullDirector.fullMp4RenderAllowed === false
  && stage3FullDirector.finalRenderAllowed === false
  && stage3FullDirector.resolveExportAllowed === false
  && stage3FullDirector.summary?.sceneCount === 50
  && stage3FullDirector.summary?.fullyDirectedSceneCount === 50
  && stage3FullDirector.summary?.changedSceneCount === 50
  && stage3FullDirector.summary?.compositionModeCount === 15
  && stage3FullDirector.summary?.backgroundModeCount === 6
  && stage3FullDirector.summary?.uniqueVisualSignatureCount >= 40
  && stage3FullDirector.summary?.maxVisualSignatureReuse <= 2
  && stage3FullDirector.summary?.missingSourceCount === 4
  && stage3FullDirector.candidate?.changedSceneCount === 50
  && stage3FullDirector.candidate?.currentPropsUnchanged === true
  && stage3FullDirector.sourceBinding?.propsSha256 === currentFilmManifest.current?.rendererPropsSha256
  && stage3Ledger?.status === "REJECTED_HISTORY_NOT_ADOPTED"
  && stage3Ledger?.adoptedIntoCurrentBuild === false),
  {classification: stage3IsSupersededHistory ? "superseded-history" : "candidate", contract: stage3FullDirector.contract, status: stage3FullDirector.status, sourceBinding: stage3FullDirector.sourceBinding, candidate: stage3FullDirector.candidate, summary: stage3FullDirector.summary});
check("stage3-full-director-public-identical", fs.existsSync(paths.stage3FullDirector) && fs.existsSync(paths.stage3FullDirectorPublic) && sha256(paths.stage3FullDirector) === sha256(paths.stage3FullDirectorPublic), {artifact: fs.existsSync(paths.stage3FullDirector) ? sha256(paths.stage3FullDirector) : null, public: fs.existsSync(paths.stage3FullDirectorPublic) ? sha256(paths.stage3FullDirectorPublic) : null});
check("stage3-full-director-audit-pass", stage3FullDirectorAudit.contract === "A1StoryboardStage3FullDirectorAudit/v1"
  && stage3FullDirectorAudit.status === "PASS_FULL_DIRECTOR_PROOF"
  && stage3FullDirectorAudit.reviewOnly === true
  && stage3FullDirectorAudit.rendererAdoptionAllowed === false
  && stage3FullDirectorAudit.fullMp4RenderAllowed === false
  && stage3FullDirectorAudit.finalRenderAllowed === false
  && stage3FullDirectorAudit.resolveExportAllowed === false
  && stage3FullDirectorAudit.summary?.sceneCount === 50
  && stage3FullDirectorAudit.summary?.renderedStillCount === 50
  && stage3FullDirectorAudit.summary?.compositionModeCount === 15
  && stage3FullDirectorAudit.summary?.backgroundModeCount === 6
  && stage3FullDirectorAudit.summary?.uniqueVisualSignatureCount >= 40
  && stage3FullDirectorAudit.summary?.missingSourceCount === 4
  && stage3FullDirectorAudit.summary?.exactDuplicateFrameCount === 0
  && Array.isArray(stage3FullDirectorAudit.failures)
  && stage3FullDirectorAudit.failures.length === 0,
  {contract: stage3FullDirectorAudit.contract, status: stage3FullDirectorAudit.status, summary: stage3FullDirectorAudit.summary, failures: stage3FullDirectorAudit.failures});
check("stage3-full-director-audit-public-identical", fs.existsSync(paths.stage3FullDirectorAudit) && fs.existsSync(paths.stage3FullDirectorAuditPublic) && sha256(paths.stage3FullDirectorAudit) === sha256(paths.stage3FullDirectorAuditPublic), {artifact: fs.existsSync(paths.stage3FullDirectorAudit) ? sha256(paths.stage3FullDirectorAudit) : null, public: fs.existsSync(paths.stage3FullDirectorAuditPublic) ? sha256(paths.stage3FullDirectorAuditPublic) : null});
check("stage3-full-director-candidate-props-separate", fs.existsSync(paths.stage3FullDirectorCandidateProps) && stage3FullDirector.candidate?.propsSha256 === sha256(paths.stage3FullDirectorCandidateProps) && stage3FullDirector.candidate.propsSha256 !== currentFilmManifest.current?.rendererPropsSha256 && sha256(paths.rendererSourceProps) === currentFilmManifest.current?.rendererPropsSha256, {candidate: stage3FullDirector.candidate?.propsSha256, current: currentFilmManifest.current?.rendererPropsSha256});
check("stage3-full-director-contact-sheet-bound", Boolean(stage3ContactSheetSha && stage3ContactSheetSha === stage3FullDirectorAudit.contactSheet?.sha256 && fs.existsSync(paths.stage3FullDirectorContactSheetPublic) && sha256(paths.stage3FullDirectorContactSheetPublic) === stage3ContactSheetSha), {artifact: stage3ContactSheetSha, public: fs.existsSync(paths.stage3FullDirectorContactSheetPublic) ? sha256(paths.stage3FullDirectorContactSheetPublic) : null, audit: stage3FullDirectorAudit.contactSheet?.sha256});

const editorialResetLedger = currentFilmManifest.adoptionLedger?.items?.find((item) => item.id === "editorial-documentary-reset-candidate");
check("editorial-documentary-reset-rejected-scope-history", editorialDocumentaryReset.contract === "A1EditorialDocumentaryResetReport/v1"
  && editorialDocumentaryReset.status === "READY_FOR_DIRECT_REVIEW"
  && editorialDocumentaryReset.summary?.sourceBeatCount === 50
  && editorialDocumentaryReset.summary?.continuousSceneCount === 16
  && editorialDocumentaryReset.summary?.pilotBeatCount === 10
  && editorialDocumentaryReset.summary?.realWorkbenchCaptureCount === 8
  && editorialDocumentaryReset.summary?.generatedArtworkCount === 0
  && editorialDocumentaryReset.currentPropsUnchanged === true
  && editorialDocumentaryReset.rendererAdoptionAllowed === false
  && editorialDocumentaryReset.finalRenderAllowed === false
  && editorialResetLedger?.status === "REJECTED_SCOPE_ERROR_NOT_ADOPTED"
  && editorialResetLedger?.adoptedIntoCurrentBuild === false
  && editorialResetLedger?.directReviewReady === false,
  {status: editorialDocumentaryReset.status, summary: editorialDocumentaryReset.summary, ledger: editorialResetLedger});
check("editorial-documentary-reset-public-identical", sha256(paths.editorialDocumentaryReset) === sha256(paths.editorialDocumentaryResetPublic), {artifact: sha256(paths.editorialDocumentaryReset), public: sha256(paths.editorialDocumentaryResetPublic)});
check("editorial-documentary-reset-historical-audit-preserved", editorialDocumentaryResetAudit.contract === "A1EditorialDocumentaryResetAudit/v1"
  && editorialDocumentaryResetAudit.status === "PASS"
  && Array.isArray(editorialDocumentaryResetAudit.failures)
  && editorialDocumentaryResetAudit.failures.length === 0,
  {contract: editorialDocumentaryResetAudit.contract, status: editorialDocumentaryResetAudit.status, failures: editorialDocumentaryResetAudit.failures});
check("editorial-documentary-reset-audit-public-identical", sha256(paths.editorialDocumentaryResetAudit) === sha256(paths.editorialDocumentaryResetAuditPublic), {artifact: sha256(paths.editorialDocumentaryResetAudit), public: sha256(paths.editorialDocumentaryResetAuditPublic)});

const picturePackagingLedger = currentFilmManifest.adoptionLedger?.items?.find((item) => item.id === "picture-packaging-pilot-candidate");
check("picture-packaging-pilot-ready-and-unplaced", picturePackagingPilot.contract === "A1PicturePackagingPilotReport/v1"
  && picturePackagingPilot.status === "READY_FOR_DIRECT_REVIEW"
  && picturePackagingPilot.reviewOnly === true
  && picturePackagingPilot.proofPlacement === "unassigned"
  && picturePackagingPilot.editorialAuthority?.owner === "user"
  && picturePackagingPilot.editorialAuthority?.hostAppearanceTiming === "user-only"
  && picturePackagingPilot.editorialAuthority?.screenRecordingTiming === "user-only"
  && picturePackagingPilot.editorialAuthority?.cutTiming === "user-only"
  && picturePackagingPilot.summary?.beatCount === 5
  && picturePackagingPilot.summary?.fullySpecifiedShotCount === 5
  && picturePackagingPilot.summary?.recordingDependencyCount === 0
  && picturePackagingPilot.summary?.screenshotDependencyCount === 0
  && picturePackagingPilot.mainTimelinePlacementAllowed === false
  && picturePackagingPilot.rendererAdoptionAllowed === false
  && picturePackagingLedger?.status === "PROOF_ONLY_NOT_ADOPTED"
  && picturePackagingLedger?.adoptedIntoCurrentBuild === false,
  {status: picturePackagingPilot.status, summary: picturePackagingPilot.summary, placement: picturePackagingPilot.proofPlacement, ledger: picturePackagingLedger});
check("picture-packaging-pilot-public-identical", sha256(paths.picturePackagingPilot) === sha256(paths.picturePackagingPilotPublic), {artifact: sha256(paths.picturePackagingPilot), public: sha256(paths.picturePackagingPilotPublic)});
check("picture-packaging-pilot-audit-pass", picturePackagingPilotAudit.contract === "A1PicturePackagingPilotAudit/v1"
  && picturePackagingPilotAudit.status === "PASS"
  && Array.isArray(picturePackagingPilotAudit.failures)
  && picturePackagingPilotAudit.failures.length === 0
  && picturePackagingPilotAudit.nextAction === "direct-review-picture-packaging-pilot-before-any-timeline-placement",
  {contract: picturePackagingPilotAudit.contract, status: picturePackagingPilotAudit.status, failures: picturePackagingPilotAudit.failures});
check("picture-packaging-pilot-audit-public-identical", sha256(paths.picturePackagingPilotAudit) === sha256(paths.picturePackagingPilotAuditPublic), {artifact: sha256(paths.picturePackagingPilotAudit), public: sha256(paths.picturePackagingPilotAuditPublic)});

check("editorial-evidence-kinetic-system-review-only", editorialEvidenceKineticSystem.contract === "A1EditorialEvidenceKineticSystemProof/v1"
  && editorialEvidenceKineticSystem.status === "READY_FOR_DIRECT_VISUAL_REVIEW"
  && editorialEvidenceKineticSystem.systemUpgrade === true
  && editorialEvidenceKineticSystem.reviewOnly === true
  && editorialEvidenceKineticSystem.summary?.shotCount === 8
  && editorialEvidenceKineticSystem.summary?.directedShotCount === 8
  && editorialEvidenceKineticSystem.summary?.separateFiveLayerShotCount === 8
  && editorialEvidenceKineticSystem.summary?.distinctSceneRoleCount >= 5
  && editorialEvidenceKineticSystem.summary?.distinctBackgroundModeCount >= 5
  && editorialEvidenceKineticSystem.summary?.verifiedPictureShotCount >= 1
  && editorialEvidenceKineticSystem.summary?.metricShotCount >= 1
  && editorialEvidenceKineticSystem.summary?.generatedArtworkCount === 0
  && editorialEvidenceKineticSystem.boundaries?.currentHSeriesAuthorityMutated === false
  && editorialEvidenceKineticSystem.boundaries?.rendererAdoptionAllowed === false
  && editorialEvidenceKineticSystem.boundaries?.mainTimelinePlacementAllowed === false
  && editorialEvidenceKineticSystem.boundaries?.finalRenderAllowed === false
  && editorialEvidenceKineticSystem.boundaries?.resolveExportAllowed === false,
  {status: editorialEvidenceKineticSystem.status, summary: editorialEvidenceKineticSystem.summary, boundaries: editorialEvidenceKineticSystem.boundaries});
check("editorial-evidence-kinetic-system-report-public-identical", sha256(paths.editorialEvidenceKineticSystem) === sha256(paths.editorialEvidenceKineticSystemPublic), {artifact: sha256(paths.editorialEvidenceKineticSystem), public: sha256(paths.editorialEvidenceKineticSystemPublic)});
check("editorial-evidence-kinetic-system-audit-pass", editorialEvidenceKineticSystemAudit.contract === "A1EditorialEvidenceKineticSystemAudit/v1"
  && editorialEvidenceKineticSystemAudit.status === "PASS"
  && Array.isArray(editorialEvidenceKineticSystemAudit.failures)
  && editorialEvidenceKineticSystemAudit.failures.length === 0
  && editorialEvidenceKineticSystemAudit.nextAction === "direct-review-system-aesthetic-proof-before-promoting-profile",
  {contract: editorialEvidenceKineticSystemAudit.contract, status: editorialEvidenceKineticSystemAudit.status, failures: editorialEvidenceKineticSystemAudit.failures});
check("editorial-evidence-kinetic-system-audit-public-identical", sha256(paths.editorialEvidenceKineticSystemAudit) === sha256(paths.editorialEvidenceKineticSystemAuditPublic), {artifact: sha256(paths.editorialEvidenceKineticSystemAudit), public: sha256(paths.editorialEvidenceKineticSystemAuditPublic)});
check("editorial-evidence-kinetic-system-media-bound", editorialEvidenceKineticSystem.pilot?.video?.sha256 === sha256(paths.editorialEvidenceKineticSystemVideo)
  && editorialEvidenceKineticSystem.pilot?.contactSheet?.sha256 === sha256(paths.editorialEvidenceKineticSystemContactSheet),
  {video: editorialEvidenceKineticSystem.pilot?.video?.sha256, contactSheet: editorialEvidenceKineticSystem.pilot?.contactSheet?.sha256});

check("visual-audit-pass", visualAudit.contract === "A1HSeriesMp4VisualAestheticAudit/v1" && visualAudit.status === "PASS" && Array.isArray(visualAudit.failures) && visualAudit.failures.length === 0, {contract: visualAudit.contract, status: visualAudit.status, failures: visualAudit.failures});
check("visual-audit-public-identical", fs.existsSync(paths.visualAudit) && fs.existsSync(paths.visualAuditPublic) && sha256(paths.visualAudit) === sha256(paths.visualAuditPublic), {artifact: fs.existsSync(paths.visualAudit) ? sha256(paths.visualAudit) : null, public: fs.existsSync(paths.visualAuditPublic) ? sha256(paths.visualAuditPublic) : null});
check("visual-audit-thresholds", visualAudit.aggregate?.lowInformationFrameCount === 0 && visualAudit.aggregate?.cobaltCoverageRatio >= .55 && visualAudit.aggregate?.averageNonPaperFraction >= .16 && visualAudit.aggregate?.averageEdgeDensity >= .04 && visualAudit.aggregate?.maxNearBlackFraction <= .18, visualAudit.aggregate || "missing");
check("visual-audit-current-video", visualAudit.video?.sha256 === v2CandidateManifest.video?.sha256, {visualAudit: visualAudit.video?.sha256, currentCandidate: v2CandidateManifest.video?.sha256});
const visualContactSheetFile = visualAudit.contactSheet?.publicUrl ? path.join(publicRoot, visualAudit.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("visual-contact-sheet-exists", Boolean(visualContactSheetFile && fs.existsSync(visualContactSheetFile)), visualContactSheetFile || "missing");
if (visualContactSheetFile && fs.existsSync(visualContactSheetFile)) check("visual-contact-sheet-sha-matches", sha256(visualContactSheetFile) === visualAudit.contactSheet.sha256 && (!phase.proof?.visualAestheticContactSheetSha256 || visualAudit.contactSheet.sha256 === phase.proof.visualAestheticContactSheetSha256), {actual: sha256(visualContactSheetFile), audit: visualAudit.contactSheet.sha256, phase: phase.proof?.visualAestheticContactSheetSha256 || "not-repeated-in-current-phase"});
check("visual-noise-pass", visualNoise.contract === "A1HSeriesVisualNoiseAudit/v1" && visualNoise.status === "PASS" && Array.isArray(visualNoise.failures) && visualNoise.failures.length === 0, {contract: visualNoise.contract, status: visualNoise.status, failures: visualNoise.failures, summary: visualNoise.summary});
check("visual-noise-public-identical", fs.existsSync(paths.visualNoise) && fs.existsSync(paths.visualNoisePublic) && sha256(paths.visualNoise) === sha256(paths.visualNoisePublic), {artifact: fs.existsSync(paths.visualNoise) ? sha256(paths.visualNoise) : null, public: fs.existsSync(paths.visualNoisePublic) ? sha256(paths.visualNoisePublic) : null});
check("aesthetic-gate-expansion-pass", aestheticGateExpansion.contract === "A1AestheticGateExpansion/v1" && aestheticGateExpansion.status === "PASS" && Array.isArray(aestheticGateExpansion.blockers) && aestheticGateExpansion.blockers.length === 0, {contract: aestheticGateExpansion.contract, status: aestheticGateExpansion.status, blockers: aestheticGateExpansion.blockers, nextAction: aestheticGateExpansion.nextAction});
check("aesthetic-gate-expansion-public-identical", fs.existsSync(paths.aestheticGateExpansion) && fs.existsSync(paths.aestheticGateExpansionPublic) && sha256(paths.aestheticGateExpansion) === sha256(paths.aestheticGateExpansionPublic), {artifact: fs.existsSync(paths.aestheticGateExpansion) ? sha256(paths.aestheticGateExpansion) : null, public: fs.existsSync(paths.aestheticGateExpansionPublic) ? sha256(paths.aestheticGateExpansionPublic) : null});
check("aesthetic-gate-expansion-no-false-final-claim", aestheticGateExpansion.promotionReadiness?.currentGoldenArticle540pVisualGate === true && aestheticGateExpansion.promotionReadiness?.crossArticleStructureProven === true && aestheticGateExpansion.promotionReadiness?.safeToRenderFinal1080p === false && aestheticGateExpansion.promotionReadiness?.safeToExportResolvePackage === false, aestheticGateExpansion.promotionReadiness || "missing");
check("cross-article-render-proof-pass", crossArticleRenderProof.contract === "A1CrossArticleHSeriesRenderProof/v1" && crossArticleRenderProof.proofMode === "five-lane-render" && crossArticleRenderProof.status === "PASS" && Array.isArray(crossArticleRenderProof.failures) && crossArticleRenderProof.failures.length === 0, {contract: crossArticleRenderProof.contract, proofMode: crossArticleRenderProof.proofMode, status: crossArticleRenderProof.status, failures: crossArticleRenderProof.failures, nextAction: crossArticleRenderProof.nextAction});
check("cross-article-render-proof-public-identical", fs.existsSync(paths.crossArticleRenderProof) && fs.existsSync(paths.crossArticleRenderProofPublic) && sha256(paths.crossArticleRenderProof) === sha256(paths.crossArticleRenderProofPublic), {artifact: fs.existsSync(paths.crossArticleRenderProof) ? sha256(paths.crossArticleRenderProof) : null, public: fs.existsSync(paths.crossArticleRenderProofPublic) ? sha256(paths.crossArticleRenderProofPublic) : null});
check("cross-article-render-proof-five-lanes", crossArticleRenderProof.aggregate?.laneCount === 5 && crossArticleRenderProof.aggregate?.lanePassCount === 5 && crossArticleRenderProof.aggregate?.distinctStructureSignatures >= 3 && crossArticleRenderProof.aggregate?.maxLowInformationFrameCount === 0 && crossArticleRenderProof.aggregate?.minAverageNonPaperFraction >= .16 && crossArticleRenderProof.aggregate?.minAverageEdgeDensity >= .035 && crossArticleRenderProof.aggregate?.minCobaltCoverageRatio >= .5 && crossArticleRenderProof.nextAction === expected.crossArticleRenderNextGate, {aggregate: crossArticleRenderProof.aggregate, nextAction: crossArticleRenderProof.nextAction});
const crossArticleLaneAssetFailures = [];
for (const lane of crossArticleRenderProof.lanes || []) {
  const laneMp4File = lane.render?.publicUrl ? path.join(publicRoot, lane.render.publicUrl.replace(/^\//u, "")) : "";
  if (!laneMp4File || !fs.existsSync(laneMp4File)) crossArticleLaneAssetFailures.push({lane: lane.fixture?.id, kind: "mp4-missing", file: laneMp4File || "missing"});
  else if (sha256(laneMp4File) !== lane.render.sha256) crossArticleLaneAssetFailures.push({lane: lane.fixture?.id, kind: "mp4-sha-mismatch", actual: sha256(laneMp4File), report: lane.render.sha256});
  const laneContactFile = lane.contactSheet?.publicUrl ? path.join(publicRoot, lane.contactSheet.publicUrl.replace(/^\//u, "")) : "";
  if (!laneContactFile || !fs.existsSync(laneContactFile)) crossArticleLaneAssetFailures.push({lane: lane.fixture?.id, kind: "contact-sheet-missing", file: laneContactFile || "missing"});
  else if (sha256(laneContactFile) !== lane.contactSheet.sha256) crossArticleLaneAssetFailures.push({lane: lane.fixture?.id, kind: "contact-sheet-sha-mismatch", actual: sha256(laneContactFile), report: lane.contactSheet.sha256});
}
check("cross-article-render-proof-lane-assets", Array.isArray(crossArticleRenderProof.lanes) && crossArticleRenderProof.lanes.length === 5 && crossArticleLaneAssetFailures.length === 0, crossArticleLaneAssetFailures.length ? crossArticleLaneAssetFailures : "five lane MP4/contact sheets verified");
const crossArticleContactSheetFile = crossArticleRenderProof.contactSheet?.publicUrl ? path.join(publicRoot, crossArticleRenderProof.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("cross-article-render-proof-contact-sheet-exists", Boolean(crossArticleContactSheetFile && fs.existsSync(crossArticleContactSheetFile)), crossArticleContactSheetFile || "missing");
if (crossArticleContactSheetFile && fs.existsSync(crossArticleContactSheetFile)) check("cross-article-render-proof-contact-sheet-sha", sha256(crossArticleContactSheetFile) === crossArticleRenderProof.contactSheet.sha256, {actual: sha256(crossArticleContactSheetFile), report: crossArticleRenderProof.contactSheet.sha256});

check("cross-article-h-baseline-quality-pass", crossArticleHBaselineQuality.contract === "A1CrossArticleHBaselineQualityAudit/v1" && crossArticleHBaselineQuality.status === "PASS" && Array.isArray(crossArticleHBaselineQuality.failures) && crossArticleHBaselineQuality.failures.length === 0 && crossArticleHBaselineQuality.nextAction === expected.hBaselineQualityNextGate, {contract: crossArticleHBaselineQuality.contract, status: crossArticleHBaselineQuality.status, failures: crossArticleHBaselineQuality.failures, nextAction: crossArticleHBaselineQuality.nextAction});
check("cross-article-h-baseline-quality-public-identical", fs.existsSync(paths.crossArticleHBaselineQuality) && fs.existsSync(paths.crossArticleHBaselineQualityPublic) && sha256(paths.crossArticleHBaselineQuality) === sha256(paths.crossArticleHBaselineQualityPublic), {artifact: fs.existsSync(paths.crossArticleHBaselineQuality) ? sha256(paths.crossArticleHBaselineQuality) : null, public: fs.existsSync(paths.crossArticleHBaselineQualityPublic) ? sha256(paths.crossArticleHBaselineQualityPublic) : null});
check("cross-article-h-baseline-quality-diversity", crossArticleHBaselineQuality.aggregate?.laneCount === 5 && crossArticleHBaselineQuality.aggregate?.lanePassCount === 5 && crossArticleHBaselineQuality.aggregate?.minDistinctVisualSignatures >= 3 && crossArticleHBaselineQuality.aggregate?.minDistinctBackgroundStates >= 2 && crossArticleHBaselineQuality.aggregate?.minDistinctCompositionVariants >= 2 && crossArticleHBaselineQuality.aggregate?.maxVisualSignatureRun <= 1 && crossArticleHBaselineQuality.aggregate?.maxTitleIssueCount === 0, crossArticleHBaselineQuality.aggregate || "missing");
check("entity-evidence-motion-quality-pass", entityEvidenceMotionQuality.contract === "A1EntityEvidenceMotionQualityProof/v1" && entityEvidenceMotionQuality.status === "PASS" && Array.isArray(entityEvidenceMotionQuality.failures) && entityEvidenceMotionQuality.failures.length === 0 && entityEvidenceMotionQuality.nextAction === expected.entityMotionQualityNextGate, {contract: entityEvidenceMotionQuality.contract, status: entityEvidenceMotionQuality.status, failures: entityEvidenceMotionQuality.failures, nextAction: entityEvidenceMotionQuality.nextAction});
check("entity-evidence-motion-quality-public-identical", fs.existsSync(paths.entityEvidenceMotionQuality) && fs.existsSync(paths.entityEvidenceMotionQualityPublic) && sha256(paths.entityEvidenceMotionQuality) === sha256(paths.entityEvidenceMotionQualityPublic), {artifact: fs.existsSync(paths.entityEvidenceMotionQuality) ? sha256(paths.entityEvidenceMotionQuality) : null, public: fs.existsSync(paths.entityEvidenceMotionQualityPublic) ? sha256(paths.entityEvidenceMotionQualityPublic) : null});
check("entity-evidence-motion-quality-assets", entityEvidenceMotionQuality.entityEvidence?.observedEntityNames?.includes("DeepSeek") && entityEvidenceMotionQuality.entityEvidence?.assetBackedEntityNames?.includes("DeepSeek") && entityEvidenceMotionQuality.entityEvidence?.assetBackedEntityNames?.includes("Kimi") && entityEvidenceMotionQuality.entityEvidence?.assetBackedEntityNames?.includes("Claude"), entityEvidenceMotionQuality.entityEvidence || "missing");
check("entity-evidence-motion-quality-curves", entityEvidenceMotionQuality.motionQuality?.curveIds?.length >= 3 && entityEvidenceMotionQuality.motionQuality?.motionStyles?.length >= 4 && entityEvidenceMotionQuality.motionQuality?.failures?.length === 0, entityEvidenceMotionQuality.motionQuality || "missing");
check("entity-motion-frame-proof-pass", entityMotionFrameProof.contract === "A1HSeriesEntityMotionFrameProof/v1" && entityMotionFrameProof.status === "PASS" && Array.isArray(entityMotionFrameProof.failures) && entityMotionFrameProof.failures.length === 0 && entityMotionFrameProof.nextAction === expected.entityMotionFrameProofNextGate, {contract: entityMotionFrameProof.contract, status: entityMotionFrameProof.status, failures: entityMotionFrameProof.failures, nextAction: entityMotionFrameProof.nextAction});
check("entity-motion-frame-proof-public-identical", fs.existsSync(paths.entityMotionFrameProof) && fs.existsSync(paths.entityMotionFrameProofPublic) && sha256(paths.entityMotionFrameProof) === sha256(paths.entityMotionFrameProofPublic), {artifact: fs.existsSync(paths.entityMotionFrameProof) ? sha256(paths.entityMotionFrameProof) : null, public: fs.existsSync(paths.entityMotionFrameProofPublic) ? sha256(paths.entityMotionFrameProofPublic) : null});
check("entity-motion-frame-proof-frames", entityMotionFrameProof.frames?.length === 6 && entityMotionFrameProof.selectedBeatIds?.includes("H04-B02") && entityMotionFrameProof.frames?.some((frame) => frame.assetBackedEntities?.includes("DeepSeek")), {selectedBeatIds: entityMotionFrameProof.selectedBeatIds, frameCount: entityMotionFrameProof.frames?.length});
const entityMotionContactSheetFile = entityMotionFrameProof.contactSheet?.publicUrl ? path.join(publicRoot, entityMotionFrameProof.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("entity-motion-frame-contact-sheet-exists", Boolean(entityMotionContactSheetFile && fs.existsSync(entityMotionContactSheetFile)), entityMotionContactSheetFile || "missing");
if (entityMotionContactSheetFile && fs.existsSync(entityMotionContactSheetFile)) check("entity-motion-frame-contact-sheet-sha", sha256(entityMotionContactSheetFile) === entityMotionFrameProof.contactSheet.sha256, {actual: sha256(entityMotionContactSheetFile), report: entityMotionFrameProof.contactSheet.sha256});

check("mp4-entity-evidence-visibility-pass", mp4EntityEvidenceVisibility.contract === "A1HSeriesMp4EntityEvidenceVisibility/v1" && mp4EntityEvidenceVisibility.status === "PASS" && Array.isArray(mp4EntityEvidenceVisibility.failures) && mp4EntityEvidenceVisibility.failures.length === 0 && mp4EntityEvidenceVisibility.nextAction === expected.nextGate, {contract: mp4EntityEvidenceVisibility.contract, status: mp4EntityEvidenceVisibility.status, failures: mp4EntityEvidenceVisibility.failures, nextAction: mp4EntityEvidenceVisibility.nextAction});
check("mp4-entity-evidence-visibility-public-identical", fs.existsSync(paths.mp4EntityEvidenceVisibility) && fs.existsSync(paths.mp4EntityEvidenceVisibilityPublic) && sha256(paths.mp4EntityEvidenceVisibility) === sha256(paths.mp4EntityEvidenceVisibilityPublic), {artifact: fs.existsSync(paths.mp4EntityEvidenceVisibility) ? sha256(paths.mp4EntityEvidenceVisibility) : null, public: fs.existsSync(paths.mp4EntityEvidenceVisibilityPublic) ? sha256(paths.mp4EntityEvidenceVisibilityPublic) : null});
check("mp4-entity-evidence-visibility-frames", mp4EntityEvidenceVisibility.frames?.length === 6 && mp4EntityEvidenceVisibility.frames?.some((frame) => frame.beatId === "H07-B04" && frame.assetBackedEntities?.includes("DeepSeek")) && mp4EntityEvidenceVisibility.frames?.some((frame) => frame.beatId === "H04-B02" && frame.assetBackedEntities?.includes("Kimi")), {selectedBeatIds: mp4EntityEvidenceVisibility.selectedBeatIds, frameCount: mp4EntityEvidenceVisibility.frames?.length});
check("mp4-entity-evidence-current-video", mp4EntityEvidenceVisibility.video?.sha256 === v2CandidateManifest.video?.sha256, {entityEvidence: mp4EntityEvidenceVisibility.video?.sha256, currentCandidate: v2CandidateManifest.video?.sha256});
const mp4EntityContactSheetFile = mp4EntityEvidenceVisibility.contactSheet?.publicUrl ? path.join(publicRoot, mp4EntityEvidenceVisibility.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("mp4-entity-evidence-contact-sheet-exists", Boolean(mp4EntityContactSheetFile && fs.existsSync(mp4EntityContactSheetFile)), mp4EntityContactSheetFile || "missing");
if (mp4EntityContactSheetFile && fs.existsSync(mp4EntityContactSheetFile)) check("mp4-entity-evidence-contact-sheet-sha", sha256(mp4EntityContactSheetFile) === mp4EntityEvidenceVisibility.contactSheet.sha256, {actual: sha256(mp4EntityContactSheetFile), report: mp4EntityEvidenceVisibility.contactSheet.sha256});

check("mp4-hold-frame-visual-director-pass", mp4HoldFrameVisualDirector.contract === "A1HSeriesMp4HoldFrameVisualDirector/v1" && mp4HoldFrameVisualDirector.status === "PASS" && Array.isArray(mp4HoldFrameVisualDirector.failures) && mp4HoldFrameVisualDirector.failures.length === 0 && mp4HoldFrameVisualDirector.nextAction === expected.nextGate, {contract: mp4HoldFrameVisualDirector.contract, status: mp4HoldFrameVisualDirector.status, failures: mp4HoldFrameVisualDirector.failures, nextAction: mp4HoldFrameVisualDirector.nextAction});
check("mp4-hold-frame-visual-director-public-identical", fs.existsSync(paths.mp4HoldFrameVisualDirector) && fs.existsSync(paths.mp4HoldFrameVisualDirectorPublic) && sha256(paths.mp4HoldFrameVisualDirector) === sha256(paths.mp4HoldFrameVisualDirectorPublic), {artifact: fs.existsSync(paths.mp4HoldFrameVisualDirector) ? sha256(paths.mp4HoldFrameVisualDirector) : null, public: fs.existsSync(paths.mp4HoldFrameVisualDirectorPublic) ? sha256(paths.mp4HoldFrameVisualDirectorPublic) : null});
check("mp4-hold-frame-visual-director-summary", mp4HoldFrameVisualDirector.summary?.sceneCount === 47 && mp4HoldFrameVisualDirector.summary?.blockingItemCount === 0 && mp4HoldFrameVisualDirector.summary?.minTitleRegionInkFraction >= .025, mp4HoldFrameVisualDirector.summary || "missing");
check("mp4-hold-frame-current-video", mp4HoldFrameVisualDirector.video?.sha256 === v2CandidateManifest.video?.sha256, {holdFrame: mp4HoldFrameVisualDirector.video?.sha256, currentCandidate: v2CandidateManifest.video?.sha256});
const mp4HoldContactSheetFile = mp4HoldFrameVisualDirector.contactSheet?.publicUrl ? path.join(publicRoot, mp4HoldFrameVisualDirector.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("mp4-hold-frame-visual-director-contact-sheet-exists", Boolean(mp4HoldContactSheetFile && fs.existsSync(mp4HoldContactSheetFile)), mp4HoldContactSheetFile || "missing");
if (mp4HoldContactSheetFile && fs.existsSync(mp4HoldContactSheetFile)) check("mp4-hold-frame-visual-director-contact-sheet-sha", sha256(mp4HoldContactSheetFile) === mp4HoldFrameVisualDirector.contactSheet.sha256, {actual: sha256(mp4HoldContactSheetFile), report: mp4HoldFrameVisualDirector.contactSheet.sha256});

check("human-review-packet-ready", humanReviewPacket.contract === "A1HSeries540pHumanReviewPacket/v1" && humanReviewPacket.status === "READY_FOR_USER_REVIEW" && Array.isArray(humanReviewPacket.blockers) && humanReviewPacket.blockers.length === 0 && humanReviewPacket.nextAction === expected.humanReviewPacketNextGate, {contract: humanReviewPacket.contract, status: humanReviewPacket.status, blockers: humanReviewPacket.blockers, nextAction: humanReviewPacket.nextAction});
check("human-review-packet-public-identical", fs.existsSync(paths.humanReviewPacket) && fs.existsSync(paths.humanReviewPacketPublic) && sha256(paths.humanReviewPacket) === sha256(paths.humanReviewPacketPublic), {artifact: fs.existsSync(paths.humanReviewPacket) ? sha256(paths.humanReviewPacket) : null, public: fs.existsSync(paths.humanReviewPacketPublic) ? sha256(paths.humanReviewPacketPublic) : null});
check("human-review-packet-approval-boundary", humanReviewPacket.reviewOnly === true && humanReviewPacket.userApprovalStatus === "not-approved" && humanReviewPacket.finalRenderAllowed === false && humanReviewPacket.resolveExportAllowed === false, {reviewOnly: humanReviewPacket.reviewOnly, userApprovalStatus: humanReviewPacket.userApprovalStatus, finalRenderAllowed: humanReviewPacket.finalRenderAllowed, resolveExportAllowed: humanReviewPacket.resolveExportAllowed});
check("human-review-packet-video-sha", humanReviewPacket.primaryReviewTarget?.videoSha256 === v2CandidateManifest.video?.sha256, {packet: humanReviewPacket.primaryReviewTarget?.videoSha256, manifest: v2CandidateManifest.video?.sha256});
check("human-review-packet-h-baseline-checklist", humanReviewPacket.reviewChecklist?.some((item) => item.id === "check-h-series-blue-master") && humanReviewPacket.reviewChecklist?.some((item) => item.id === "watch-full-film") && humanReviewPacket.reviewChecklist?.some((item) => item.id === "decide"), humanReviewPacket.reviewChecklist || "missing");

check("h09-review-packet-pass", h09ReviewPacket.contract === "A1H09ReviewPacket/v1" && h09ReviewPacket.status === "PASS" && Array.isArray(h09ReviewPacket.failures) && h09ReviewPacket.failures.length === 0 && h09ReviewPacket.nextAction === expected.humanReviewPacketNextGate, {contract: h09ReviewPacket.contract, status: h09ReviewPacket.status, failures: h09ReviewPacket.failures, nextAction: h09ReviewPacket.nextAction});
check("h09-review-packet-public-identical", fs.existsSync(paths.h09ReviewPacket) && fs.existsSync(paths.h09ReviewPacketPublic) && sha256(paths.h09ReviewPacket) === sha256(paths.h09ReviewPacketPublic), {artifact: fs.existsSync(paths.h09ReviewPacket) ? sha256(paths.h09ReviewPacket) : null, public: fs.existsSync(paths.h09ReviewPacketPublic) ? sha256(paths.h09ReviewPacketPublic) : null});
check("h09-review-packet-seven-events", h09ReviewPacket.summary?.eventCount === 7 && h09ReviewPacket.summary?.minAdjacentMeanAbsDiff >= 8 && h09ReviewPacket.checks?.noRepeatedWholeHoldFrame === true, {summary: h09ReviewPacket.summary, checks: h09ReviewPacket.checks});
check("h09-review-packet-b05-readable", h09ReviewPacket.checks?.b05TextReadable === true && h09ReviewPacket.summary?.b05TitleLines?.join("")?.includes("AI"), {summary: h09ReviewPacket.summary, checks: h09ReviewPacket.checks});
check("h09-review-packet-approval-boundary", h09ReviewPacket.reviewOnly === true && h09ReviewPacket.finalRenderAllowed === false && h09ReviewPacket.resolveExportAllowed === false && h09ReviewPacket.checks?.candidatesNotPromoted === true, {reviewOnly: h09ReviewPacket.reviewOnly, finalRenderAllowed: h09ReviewPacket.finalRenderAllowed, resolveExportAllowed: h09ReviewPacket.resolveExportAllowed, checks: h09ReviewPacket.checks});
const h09ContactSheetFile = h09ReviewPacket.primaryReviewTarget?.contactSheetUrl ? path.join(publicRoot, h09ReviewPacket.primaryReviewTarget.contactSheetUrl.replace(/^\//u, "")) : "";
const h09ClipFile = h09ReviewPacket.primaryReviewTarget?.clipUrl ? path.join(publicRoot, h09ReviewPacket.primaryReviewTarget.clipUrl.replace(/^\//u, "")) : "";
check("h09-review-contact-sheet-exists", Boolean(h09ContactSheetFile && fs.existsSync(h09ContactSheetFile) && sha256(h09ContactSheetFile) === h09ReviewPacket.primaryReviewTarget.contactSheetSha256), h09ContactSheetFile || "missing");
check("h09-review-clip-exists", Boolean(h09ClipFile && fs.existsSync(h09ClipFile) && sha256(h09ClipFile) === h09ReviewPacket.primaryReviewTarget.clipSha256), h09ClipFile || "missing");

check("h-series-macro-review-index-pass", hSeriesMacroReviewIndex.contract === "A1HSeriesMacroReviewIndex/v1" && hSeriesMacroReviewIndex.status === "PASS" && Array.isArray(hSeriesMacroReviewIndex.failures) && hSeriesMacroReviewIndex.failures.length === 0 && hSeriesMacroReviewIndex.nextAction === expected.humanReviewPacketNextGate, {contract: hSeriesMacroReviewIndex.contract, status: hSeriesMacroReviewIndex.status, failures: hSeriesMacroReviewIndex.failures, nextAction: hSeriesMacroReviewIndex.nextAction});
check("h-series-macro-review-index-public-identical", fs.existsSync(paths.hSeriesMacroReviewIndex) && fs.existsSync(paths.hSeriesMacroReviewIndexPublic) && sha256(paths.hSeriesMacroReviewIndex) === sha256(paths.hSeriesMacroReviewIndexPublic), {artifact: fs.existsSync(paths.hSeriesMacroReviewIndex) ? sha256(paths.hSeriesMacroReviewIndex) : null, public: fs.existsSync(paths.hSeriesMacroReviewIndexPublic) ? sha256(paths.hSeriesMacroReviewIndexPublic) : null});
check("h-series-macro-review-index-summary", hSeriesMacroReviewIndex.summary?.macroCount === 11 && hSeriesMacroReviewIndex.summary?.totalSceneCount === 47 && hSeriesMacroReviewIndex.summary?.minAdjacentMeanAbsDiff >= 6 && hSeriesMacroReviewIndex.summary?.minNonPaperFraction >= .12 && hSeriesMacroReviewIndex.summary?.maxNearBlackFraction <= .18, hSeriesMacroReviewIndex.summary || "missing");
check("h-series-macro-review-index-current-video", hSeriesMacroReviewIndex.sourceVideo?.sha256 === v2CandidateManifest.video?.sha256, {macroIndex: hSeriesMacroReviewIndex.sourceVideo?.sha256, currentCandidate: v2CandidateManifest.video?.sha256});
check("h-series-macro-review-index-coverage", hSeriesMacroReviewIndex.macros?.length === 11 && hSeriesMacroReviewIndex.macros?.[0]?.macroId === "H01" && hSeriesMacroReviewIndex.macros?.at(-1)?.macroId === "H11" && hSeriesMacroReviewIndex.macros?.some((macro) => macro.macroId === "H09" && macro.sceneCount === 7), hSeriesMacroReviewIndex.macros || "missing");
const hSeriesMacroIndexContactFile = hSeriesMacroReviewIndex.contactSheet?.publicUrl ? path.join(publicRoot, hSeriesMacroReviewIndex.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("h-series-macro-review-index-contact-sheet-exists", Boolean(hSeriesMacroIndexContactFile && fs.existsSync(hSeriesMacroIndexContactFile) && sha256(hSeriesMacroIndexContactFile) === hSeriesMacroReviewIndex.contactSheet.sha256), hSeriesMacroIndexContactFile || "missing");

check("targeted-visual-fix-queue-pass", targetedVisualFixQueue.contract === "A1HSeriesTargetedVisualFixQueue/v1" && targetedVisualFixQueue.status === "PASS" && targetedVisualFixQueue.reviewOnly === true && targetedVisualFixQueue.finalRenderAllowed === false && targetedVisualFixQueue.resolveExportAllowed === false, {contract: targetedVisualFixQueue.contract, status: targetedVisualFixQueue.status, reviewOnly: targetedVisualFixQueue.reviewOnly, finalRenderAllowed: targetedVisualFixQueue.finalRenderAllowed, resolveExportAllowed: targetedVisualFixQueue.resolveExportAllowed});
check("targeted-visual-fix-queue-public-identical", fs.existsSync(paths.targetedVisualFixQueue) && fs.existsSync(paths.targetedVisualFixQueuePublic) && sha256(paths.targetedVisualFixQueue) === sha256(paths.targetedVisualFixQueuePublic), {artifact: fs.existsSync(paths.targetedVisualFixQueue) ? sha256(paths.targetedVisualFixQueue) : null, public: fs.existsSync(paths.targetedVisualFixQueuePublic) ? sha256(paths.targetedVisualFixQueuePublic) : null});
const targetedIssueCounts = targetedVisualFixQueue.summary?.issueCounts || {};
const targetedItems = Array.isArray(targetedVisualFixQueue.targetItems) ? targetedVisualFixQueue.targetItems : [];
const hasTypographyRepairItem = targetedItems.some((item) => item.issues?.some((issue) => issue.category === "typography" || /^title-|^weak-title|^three-line-title/u.test(issue.id || "")));
const typographyRepairCleared = !targetedIssueCounts["title-fit-too-tight"]
  && !targetedIssueCounts["weak-title-line-break"]
  && !targetedIssueCounts["three-line-title-needs-composition-check"];
const hasOfficialEntityFallbackItem = targetedItems.some((item) => item.issues?.some((issue) => issue.id === "official-entity-asset-fallback"));
const officialEntityFallbackCleared = !targetedIssueCounts["official-entity-asset-fallback"] && targetedVisualFixQueue.summary?.sourceOnlyEntityFallbackCount === 0;
const clearedOldNoiseIssues = targetedVisualFixQueue.summary?.visualNoiseFillerSceneCount === 0
  && !targetedIssueCounts["upstream-filler-support-token"]
  && !targetedIssueCounts["support-token-fragment"]
  && !targetedIssueCounts["title-font-too-small-for-premium-hold"];
check("targeted-visual-fix-queue-summary", targetedVisualFixQueue.summary?.sceneCount === 47 && targetedVisualFixQueue.summary?.targetItemCount > 0 && targetedVisualFixQueue.summary?.topItemCount > 0 && targetedVisualFixQueue.summary?.blockerCount === 0 && clearedOldNoiseIssues && targetedVisualFixQueue.summary?.candidateGeneratedArtworkCount >= 1, targetedVisualFixQueue.summary || "missing");
check("targeted-visual-fix-queue-top-items", targetedItems.length === targetedVisualFixQueue.summary?.targetItemCount && (hasTypographyRepairItem || typographyRepairCleared) && (hasOfficialEntityFallbackItem || officialEntityFallbackCleared), {targetCount: targetedItems.length, top: targetedItems.slice?.(0, 3)?.map((item) => ({beatId: item.beatId, issues: item.issues?.map((issue) => issue.id)})), issueCounts: targetedIssueCounts});
const targetedVisualFixQueueContactFile = targetedVisualFixQueue.contactSheet?.publicUrl ? path.join(publicRoot, targetedVisualFixQueue.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("targeted-visual-fix-queue-contact-sheet-exists", Boolean(targetedVisualFixQueueContactFile && fs.existsSync(targetedVisualFixQueueContactFile) && sha256(targetedVisualFixQueueContactFile) === targetedVisualFixQueue.contactSheet.sha256), targetedVisualFixQueueContactFile || "missing");

check("generated-artwork-decision-pass", generatedArtworkDecision.contract === "A1HSeriesGeneratedArtworkDecision/v1" && generatedArtworkDecision.status === "PASS" && generatedArtworkDecision.visualMasterId === expected.visualMasterId && generatedArtworkDecision.reviewOnly === true && generatedArtworkDecision.finalRenderAllowed === false && generatedArtworkDecision.resolveExportAllowed === false, {contract: generatedArtworkDecision.contract, status: generatedArtworkDecision.status, visualMasterId: generatedArtworkDecision.visualMasterId, reviewOnly: generatedArtworkDecision.reviewOnly, finalRenderAllowed: generatedArtworkDecision.finalRenderAllowed, resolveExportAllowed: generatedArtworkDecision.resolveExportAllowed});
check("generated-artwork-decision-public-identical", fs.existsSync(paths.generatedArtworkDecision) && fs.existsSync(paths.generatedArtworkDecisionPublic) && sha256(paths.generatedArtworkDecision) === sha256(paths.generatedArtworkDecisionPublic), {artifact: fs.existsSync(paths.generatedArtworkDecision) ? sha256(paths.generatedArtworkDecision) : null, public: fs.existsSync(paths.generatedArtworkDecisionPublic) ? sha256(paths.generatedArtworkDecisionPublic) : null});
const generatedArtworkDecisionSelected = Array.isArray(generatedArtworkDecision.decisions) ? generatedArtworkDecision.decisions.filter((item) => item.decision === "selected-for-generation") : [];
const generatedArtworkDecisionDeferred = Array.isArray(generatedArtworkDecision.decisions) ? generatedArtworkDecision.decisions.filter((item) => item.decision === "deferred-no-generation") : [];
check("generated-artwork-decision-summary", generatedArtworkDecision.summary?.candidateCount === 16 && generatedArtworkDecision.summary?.selectedCount >= 3 && generatedArtworkDecision.summary?.selectedCount <= 8 && generatedArtworkDecision.summary?.deferredCount >= 1 && generatedArtworkDecision.summary?.generationJobCount === generatedArtworkDecision.summary?.selectedCount && generatedArtworkDecision.summary?.concurrency >= 1 && generatedArtworkDecision.summary?.concurrency <= 2 && generatedArtworkDecision.summary?.allGenerationJobsReviewBlocked === true && generatedArtworkDecision.summary?.allGeneratedArtworkNonEvidence === true, generatedArtworkDecision.summary || "missing");
check("generated-artwork-decision-selection-policy", generatedArtworkDecisionSelected.length === generatedArtworkDecision.summary?.selectedCount && generatedArtworkDecisionDeferred.length === generatedArtworkDecision.summary?.deferredCount && generatedArtworkDecisionSelected.every((item) => item.renderAllowedBeforeApproval === false && item.factualEvidenceAllowed === false) && !generatedArtworkDecisionSelected.some((item) => /例句|候选|补充什么|要不要/u.test(item.screenText || "")), {selected: generatedArtworkDecisionSelected.map((item) => item.beatId), deferred: generatedArtworkDecisionDeferred.map((item) => item.beatId)});
const generatedArtworkDecisionContactFile = generatedArtworkDecision.contactSheet?.publicUrl ? path.join(publicRoot, generatedArtworkDecision.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("generated-artwork-decision-contact-sheet-exists", Boolean(generatedArtworkDecisionContactFile && fs.existsSync(generatedArtworkDecisionContactFile)), generatedArtworkDecisionContactFile || "missing");

const generatedArtworkExecutionPlanDispatchReady = generatedArtworkExecutionPlan.status === "READY_FOR_GENERATION";
check("generated-artwork-execution-plan-ready", generatedArtworkExecutionPlan.contract === "A1HSeriesGeneratedArtworkExecutionPlan/v1" && ["WAITING_FOR_USER_VISUAL_DECISIONS", "READY_FOR_GENERATION"].includes(generatedArtworkExecutionPlan.status) && generatedArtworkExecutionPlan.visualMasterId === expected.visualMasterId && generatedArtworkExecutionPlan.reviewOnly === true && generatedArtworkExecutionPlan.finalRenderAllowed === false && generatedArtworkExecutionPlan.resolveExportAllowed === false && generatedArtworkExecutionPlan.rendererAdoptionAllowed === false && generatedArtworkExecutionPlan.generationDispatchAllowed === generatedArtworkExecutionPlanDispatchReady, {contract: generatedArtworkExecutionPlan.contract, status: generatedArtworkExecutionPlan.status, visualMasterId: generatedArtworkExecutionPlan.visualMasterId, reviewOnly: generatedArtworkExecutionPlan.reviewOnly, finalRenderAllowed: generatedArtworkExecutionPlan.finalRenderAllowed, resolveExportAllowed: generatedArtworkExecutionPlan.resolveExportAllowed, generationDispatchAllowed: generatedArtworkExecutionPlan.generationDispatchAllowed, rendererAdoptionAllowed: generatedArtworkExecutionPlan.rendererAdoptionAllowed});
check("generated-artwork-execution-plan-public-identical", fs.existsSync(paths.generatedArtworkExecutionPlan) && fs.existsSync(paths.generatedArtworkExecutionPlanPublic) && sha256(paths.generatedArtworkExecutionPlan) === sha256(paths.generatedArtworkExecutionPlanPublic), {artifact: fs.existsSync(paths.generatedArtworkExecutionPlan) ? sha256(paths.generatedArtworkExecutionPlan) : null, public: fs.existsSync(paths.generatedArtworkExecutionPlanPublic) ? sha256(paths.generatedArtworkExecutionPlanPublic) : null});
const generatedArtworkExecutionJobs = Array.isArray(generatedArtworkExecutionPlan.jobs) ? generatedArtworkExecutionPlan.jobs : [];
check("generated-artwork-execution-plan-summary", generatedArtworkExecutionPlan.summary?.selectedCount === 7 && generatedArtworkExecutionPlan.summary?.executionJobCount === 7 && generatedArtworkExecutionPlan.summary?.pendingGenerationCount === 7 && generatedArtworkExecutionPlan.summary?.generatedCount === 0 && generatedArtworkExecutionPlan.summary?.reviewedApprovedCount === 0 && generatedArtworkExecutionPlan.summary?.allJobsReviewBlocked === true && generatedArtworkExecutionPlan.summary?.allJobsNonEvidence === true && generatedArtworkExecutionPlan.summary?.allPromptsTextFree === true && generatedArtworkExecutionPlan.summary?.allRepairBriefsBound === true && generatedArtworkExecutionPlan.summary?.allGenerationJobsUserApproved === generatedArtworkExecutionPlanDispatchReady && generatedArtworkExecutionPlan.summary?.pendingReviewCount === (generatedArtworkExecutionPlanDispatchReady ? 0 : generatedArtworkExecutionPlan.summary?.pendingReviewCount) && generatedArtworkExecutionPlan.generationDispatchAllowed === generatedArtworkExecutionPlanDispatchReady && generatedArtworkExecutionPlan.concurrency >= 1 && generatedArtworkExecutionPlan.concurrency <= 2 && generatedArtworkExecutionPlan.outputProbe?.existingOutputCount === 0, {summary: generatedArtworkExecutionPlan.summary, concurrency: generatedArtworkExecutionPlan.concurrency, outputProbe: generatedArtworkExecutionPlan.outputProbe});
check("generated-artwork-execution-plan-jobs", generatedArtworkExecutionJobs.length === 7 && generatedArtworkExecutionJobs.every((job) => job.status === "pending-generation" && job.provider === "codex-imagegen" && job.providerMode === "subscription-zero-extra-cost" && job.promptSha256 && job.promptArtifactPath && job.promptPublicPath && job.output?.publicUrl?.startsWith("/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-repair-v1/") && job.repairBriefBound === true && job.dispatchAllowed === generatedArtworkExecutionPlanDispatchReady && job.reviewGate?.renderAllowedBeforeApproval === false && job.reviewGate?.factualEvidenceAllowed === false), generatedArtworkExecutionJobs.map((job) => ({beatId: job.beatId, status: job.status, provider: job.provider, prompt: job.promptSha256?.slice?.(0, 12), output: job.output?.publicUrl, repairBriefBound: job.repairBriefBound, dispatchAllowed: job.dispatchAllowed, userDecision: job.userDecision})));
const generatedArtworkExecutionContactFile = generatedArtworkExecutionPlan.contactSheet?.publicUrl ? path.join(publicRoot, generatedArtworkExecutionPlan.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("generated-artwork-execution-plan-contact-sheet-exists", Boolean(generatedArtworkExecutionContactFile && fs.existsSync(generatedArtworkExecutionContactFile)), generatedArtworkExecutionContactFile || "missing");

check("generated-artwork-result-manifest-pending-review", generatedArtworkResultManifest.contract === "A1HSeriesGeneratedArtworkResultManifest/v1" && generatedArtworkResultManifest.status === "GENERATED_PENDING_VISUAL_REVIEW" && generatedArtworkResultManifest.visualMasterId === expected.visualMasterId && generatedArtworkResultManifest.reviewOnly === true && generatedArtworkResultManifest.finalRenderAllowed === false && generatedArtworkResultManifest.resolveExportAllowed === false && generatedArtworkResultManifest.rendererAdoptionAllowed === false, {contract: generatedArtworkResultManifest.contract, status: generatedArtworkResultManifest.status, visualMasterId: generatedArtworkResultManifest.visualMasterId, reviewOnly: generatedArtworkResultManifest.reviewOnly, finalRenderAllowed: generatedArtworkResultManifest.finalRenderAllowed, resolveExportAllowed: generatedArtworkResultManifest.resolveExportAllowed, rendererAdoptionAllowed: generatedArtworkResultManifest.rendererAdoptionAllowed});
check("generated-artwork-result-manifest-public-identical", fs.existsSync(paths.generatedArtworkResultManifest) && fs.existsSync(paths.generatedArtworkResultManifestPublic) && sha256(paths.generatedArtworkResultManifest) === sha256(paths.generatedArtworkResultManifestPublic), {artifact: fs.existsSync(paths.generatedArtworkResultManifest) ? sha256(paths.generatedArtworkResultManifest) : null, public: fs.existsSync(paths.generatedArtworkResultManifestPublic) ? sha256(paths.generatedArtworkResultManifestPublic) : null});
const generatedArtworkAssets = Array.isArray(generatedArtworkResultManifest.assets) ? generatedArtworkResultManifest.assets : [];
check("generated-artwork-result-manifest-summary", generatedArtworkResultManifest.summary?.expectedCount === 7 && generatedArtworkResultManifest.summary?.generatedCount === 7 && generatedArtworkResultManifest.summary?.pendingVisualReviewCount === 7 && generatedArtworkResultManifest.summary?.reviewedApprovedCount === 0 && generatedArtworkResultManifest.summary?.staleOutputCount === 0 && generatedArtworkResultManifest.summary?.allAssetsLocalToSystemLine === true && generatedArtworkResultManifest.summary?.allAssetsPromptBound === true && generatedArtworkResultManifest.summary?.allAssetsReviewBlocked === true && generatedArtworkResultManifest.summary?.allAssetsNonEvidence === true, generatedArtworkResultManifest.summary || "missing");
check("generated-artwork-result-manifest-assets", generatedArtworkAssets.length === 7 && generatedArtworkAssets.every((asset) => asset.reviewStatus === "pending-visual-review" && asset.renderAllowedBeforeApproval === false && asset.factualEvidenceAllowed === false && asset.rendererAdoptionAllowed === false && asset.publicUrl?.startsWith("/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-v1/") && asset.dimensions?.width >= 1200 && asset.dimensions?.height >= 675), generatedArtworkAssets.map((asset) => ({beatId: asset.beatId, reviewStatus: asset.reviewStatus, dimensions: asset.dimensions, publicUrl: asset.publicUrl})));
const generatedArtworkMissingAssetFiles = generatedArtworkAssets.filter((asset) => {
  const file = asset.publicUrl ? path.join(publicRoot, asset.publicUrl.replace(/^\//u, "")) : "";
  return !file || !fs.existsSync(file) || sha256(file) !== asset.sha256;
});
check("generated-artwork-result-assets-exist-and-match-hash", generatedArtworkMissingAssetFiles.length === 0, generatedArtworkMissingAssetFiles.map((asset) => ({beatId: asset.beatId, publicUrl: asset.publicUrl})));
const generatedArtworkResultContactFile = generatedArtworkResultManifest.contactSheet?.publicUrl ? path.join(publicRoot, generatedArtworkResultManifest.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("generated-artwork-result-contact-sheet-exists", Boolean(generatedArtworkResultContactFile && fs.existsSync(generatedArtworkResultContactFile)), generatedArtworkResultContactFile || "missing");

check("generated-artwork-visual-review-pass", generatedArtworkVisualReview.contract === "A1HSeriesGeneratedArtworkVisualReview/v1" && generatedArtworkVisualReview.status === "AUTO_VISUAL_REVIEW_PASS_PENDING_HUMAN_APPROVAL" && generatedArtworkVisualReview.visualMasterId === expected.visualMasterId && generatedArtworkVisualReview.reviewOnly === true && generatedArtworkVisualReview.finalRenderAllowed === false && generatedArtworkVisualReview.resolveExportAllowed === false && generatedArtworkVisualReview.rendererAdoptionAllowed === false && generatedArtworkVisualReview.humanApprovalStatus === "not-approved", {contract: generatedArtworkVisualReview.contract, status: generatedArtworkVisualReview.status, visualMasterId: generatedArtworkVisualReview.visualMasterId, reviewOnly: generatedArtworkVisualReview.reviewOnly, finalRenderAllowed: generatedArtworkVisualReview.finalRenderAllowed, resolveExportAllowed: generatedArtworkVisualReview.resolveExportAllowed, rendererAdoptionAllowed: generatedArtworkVisualReview.rendererAdoptionAllowed, humanApprovalStatus: generatedArtworkVisualReview.humanApprovalStatus});
check("generated-artwork-visual-review-public-identical", fs.existsSync(paths.generatedArtworkVisualReview) && fs.existsSync(paths.generatedArtworkVisualReviewPublic) && sha256(paths.generatedArtworkVisualReview) === sha256(paths.generatedArtworkVisualReviewPublic), {artifact: fs.existsSync(paths.generatedArtworkVisualReview) ? sha256(paths.generatedArtworkVisualReview) : null, public: fs.existsSync(paths.generatedArtworkVisualReviewPublic) ? sha256(paths.generatedArtworkVisualReviewPublic) : null});
const generatedArtworkVisualReviewItems = Array.isArray(generatedArtworkVisualReview.items) ? generatedArtworkVisualReview.items : [];
check("generated-artwork-visual-review-summary", generatedArtworkVisualReview.summary?.assetCount === 7 && generatedArtworkVisualReview.summary?.passCount === 7 && generatedArtworkVisualReview.summary?.failCount === 0 && generatedArtworkVisualReview.summary?.minPairwiseDiff >= 8 && generatedArtworkVisualReview.summary?.averageNonPaperFraction >= 0.12 && generatedArtworkVisualReview.summary?.averageNonPaperFraction <= 0.62 && generatedArtworkVisualReview.summary?.averageCobaltFraction >= 0.003 && generatedArtworkVisualReview.summary?.averageCobaltFraction <= 0.18 && generatedArtworkVisualReview.summary?.maxNearBlackFraction <= 0.22 && Array.isArray(generatedArtworkVisualReview.failures) && generatedArtworkVisualReview.failures.length === 0, generatedArtworkVisualReview.summary || "missing");
check("generated-artwork-visual-review-items", generatedArtworkVisualReviewItems.length === 7 && generatedArtworkVisualReviewItems.every((item) => item.status === "PASS" && item.stats?.nonPaperFraction >= 0.12 && item.stats?.nonPaperFraction <= 0.62 && item.stats?.warmPaperFraction >= 0.32 && item.stats?.cobaltFraction >= 0.003 && item.stats?.cobaltFraction <= 0.18 && item.stats?.nearBlackFraction <= 0.22 && item.stats?.edgeDensity >= 0.018 && item.stats?.edgeDensity <= 0.22), generatedArtworkVisualReviewItems.map((item) => ({beatId: item.beatId, status: item.status, stats: item.stats, failures: item.failures})));
const generatedArtworkVisualReviewContactFile = generatedArtworkVisualReview.contactSheet?.publicUrl ? path.join(publicRoot, generatedArtworkVisualReview.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("generated-artwork-visual-review-contact-sheet-exists", Boolean(generatedArtworkVisualReviewContactFile && fs.existsSync(generatedArtworkVisualReviewContactFile)), generatedArtworkVisualReviewContactFile || "missing");

check("generated-artwork-semantic-blue-pass", generatedArtworkSemanticBlue.contract === "A1HSeriesGeneratedArtworkSemanticBlueAudit/v1" && generatedArtworkSemanticBlue.status === "PASS_PENDING_HUMAN_APPROVAL" && generatedArtworkSemanticBlue.visualMasterId === expected.visualMasterId && generatedArtworkSemanticBlue.reviewOnly === true && generatedArtworkSemanticBlue.finalRenderAllowed === false && generatedArtworkSemanticBlue.resolveExportAllowed === false && generatedArtworkSemanticBlue.rendererAdoptionAllowed === false && generatedArtworkSemanticBlue.humanApprovalStatus === "not-approved", {contract: generatedArtworkSemanticBlue.contract, status: generatedArtworkSemanticBlue.status, visualMasterId: generatedArtworkSemanticBlue.visualMasterId, reviewOnly: generatedArtworkSemanticBlue.reviewOnly, finalRenderAllowed: generatedArtworkSemanticBlue.finalRenderAllowed, resolveExportAllowed: generatedArtworkSemanticBlue.resolveExportAllowed, rendererAdoptionAllowed: generatedArtworkSemanticBlue.rendererAdoptionAllowed, humanApprovalStatus: generatedArtworkSemanticBlue.humanApprovalStatus});
check("generated-artwork-semantic-blue-public-identical", fs.existsSync(paths.generatedArtworkSemanticBlue) && fs.existsSync(paths.generatedArtworkSemanticBluePublic) && sha256(paths.generatedArtworkSemanticBlue) === sha256(paths.generatedArtworkSemanticBluePublic), {artifact: fs.existsSync(paths.generatedArtworkSemanticBlue) ? sha256(paths.generatedArtworkSemanticBlue) : null, public: fs.existsSync(paths.generatedArtworkSemanticBluePublic) ? sha256(paths.generatedArtworkSemanticBluePublic) : null});
const generatedArtworkSemanticBlueItems = Array.isArray(generatedArtworkSemanticBlue.items) ? generatedArtworkSemanticBlue.items : [];
check("generated-artwork-semantic-blue-summary", generatedArtworkSemanticBlue.summary?.assetCount === 7 && generatedArtworkSemanticBlue.summary?.passCount === 7 && generatedArtworkSemanticBlue.summary?.failCount === 0 && generatedArtworkSemanticBlue.summary?.maxBorderShare <= 0.45 && generatedArtworkSemanticBlue.summary?.maxSingleEdgeShare <= 0.38 && generatedArtworkSemanticBlue.summary?.maxRightEdgeShare <= 0.38 && generatedArtworkSemanticBlue.summary?.averageCobaltFraction >= 0.003 && generatedArtworkSemanticBlue.summary?.averageCobaltFraction <= 0.12 && Array.isArray(generatedArtworkSemanticBlue.failures) && generatedArtworkSemanticBlue.failures.length === 0, generatedArtworkSemanticBlue.summary || "missing");
check("generated-artwork-semantic-blue-items", generatedArtworkSemanticBlueItems.length === 7 && generatedArtworkSemanticBlueItems.every((item) => item.status === "PASS" && item.stats?.cobaltFraction >= 0.003 && item.stats?.cobaltFraction <= 0.12 && item.stats?.borderShare <= 0.45 && Math.max(item.stats?.leftShare || 0, item.stats?.rightShare || 0, item.stats?.topShare || 0, item.stats?.bottomShare || 0) <= 0.38), generatedArtworkSemanticBlueItems.map((item) => ({beatId: item.beatId, status: item.status, stats: item.stats, failures: item.failures})));
const generatedArtworkSemanticBlueContactFile = generatedArtworkSemanticBlue.contactSheet?.publicUrl ? path.join(publicRoot, generatedArtworkSemanticBlue.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("generated-artwork-semantic-blue-contact-sheet-exists", Boolean(generatedArtworkSemanticBlueContactFile && fs.existsSync(generatedArtworkSemanticBlueContactFile)), generatedArtworkSemanticBlueContactFile || "missing");

check("generated-artwork-composition-risk-pass", generatedArtworkCompositionRisk.contract === "A1HSeriesGeneratedArtworkCompositionRiskAudit/v1" && generatedArtworkCompositionRisk.status === "PASS_PENDING_HUMAN_APPROVAL" && generatedArtworkCompositionRisk.visualMasterId === expected.visualMasterId && generatedArtworkCompositionRisk.reviewOnly === true && generatedArtworkCompositionRisk.finalRenderAllowed === false && generatedArtworkCompositionRisk.resolveExportAllowed === false && generatedArtworkCompositionRisk.rendererAdoptionAllowed === false && generatedArtworkCompositionRisk.humanApprovalStatus === "not-approved", {contract: generatedArtworkCompositionRisk.contract, status: generatedArtworkCompositionRisk.status, visualMasterId: generatedArtworkCompositionRisk.visualMasterId, reviewOnly: generatedArtworkCompositionRisk.reviewOnly, finalRenderAllowed: generatedArtworkCompositionRisk.finalRenderAllowed, resolveExportAllowed: generatedArtworkCompositionRisk.resolveExportAllowed, rendererAdoptionAllowed: generatedArtworkCompositionRisk.rendererAdoptionAllowed, humanApprovalStatus: generatedArtworkCompositionRisk.humanApprovalStatus});
check("generated-artwork-composition-risk-public-identical", fs.existsSync(paths.generatedArtworkCompositionRisk) && fs.existsSync(paths.generatedArtworkCompositionRiskPublic) && sha256(paths.generatedArtworkCompositionRisk) === sha256(paths.generatedArtworkCompositionRiskPublic), {artifact: fs.existsSync(paths.generatedArtworkCompositionRisk) ? sha256(paths.generatedArtworkCompositionRisk) : null, public: fs.existsSync(paths.generatedArtworkCompositionRiskPublic) ? sha256(paths.generatedArtworkCompositionRiskPublic) : null});
const generatedArtworkCompositionRiskItems = Array.isArray(generatedArtworkCompositionRisk.items) ? generatedArtworkCompositionRisk.items : [];
check("generated-artwork-composition-risk-summary", generatedArtworkCompositionRisk.summary?.assetCount === 7 && generatedArtworkCompositionRisk.summary?.passCount === 7 && generatedArtworkCompositionRisk.summary?.failCount === 0 && generatedArtworkCompositionRisk.summary?.blockerCount === 0 && generatedArtworkCompositionRisk.summary?.distinctFocalZones >= 3 && generatedArtworkCompositionRisk.summary?.maxEdgeWeightShare <= 0.82 && Array.isArray(generatedArtworkCompositionRisk.failures) && generatedArtworkCompositionRisk.failures.length === 0, generatedArtworkCompositionRisk.summary || "missing");
check("generated-artwork-composition-risk-items", generatedArtworkCompositionRiskItems.length === 7 && generatedArtworkCompositionRiskItems.every((item) => item.status === "PASS" && Array.isArray(item.blockers) && item.blockers.length === 0 && item.stats?.nonPaperFraction >= 0.18 && item.stats?.nonPaperFraction <= 0.66 && item.stats?.emptyFieldFraction <= 0.82 && item.stats?.centroid?.x >= 0.1 && item.stats?.centroid?.x <= 0.9 && item.stats?.centroid?.y >= 0.12 && item.stats?.centroid?.y <= 0.88 && item.stats?.weightShares?.edge <= 0.82 && typeof item.stats?.zone === "string" && item.stats.zone.length > 0), generatedArtworkCompositionRiskItems.map((item) => ({beatId: item.beatId, status: item.status, zone: item.stats?.zone, centroid: item.stats?.centroid, edge: item.stats?.weightShares?.edge, blockers: item.blockers, risks: item.risks})));
const generatedArtworkCompositionRiskContactFile = generatedArtworkCompositionRisk.contactSheet?.publicUrl ? path.join(publicRoot, generatedArtworkCompositionRisk.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("generated-artwork-composition-risk-contact-sheet-exists", Boolean(generatedArtworkCompositionRiskContactFile && fs.existsSync(generatedArtworkCompositionRiskContactFile)), generatedArtworkCompositionRiskContactFile || "missing");
check("generated-artwork-policy-report-bound", generatedArtworkPolicy.contract === "A1HSeriesGeneratedArtworkPolicyAudit/v1" && generatedArtworkPolicy.reviewOnly === true && generatedArtworkPolicy.rendererAdoptionAllowed === false && generatedArtworkPolicy.finalRenderAllowed === false && generatedArtworkPolicy.resolveExportAllowed === false && generatedArtworkPolicy.source?.manifestSha256 === (fs.existsSync(paths.generatedArtworkResultManifest) ? sha256(paths.generatedArtworkResultManifest) : null), {contract: generatedArtworkPolicy.contract, status: generatedArtworkPolicy.status, summary: generatedArtworkPolicy.summary, nextAction: generatedArtworkPolicy.nextAction});
check("generated-artwork-policy-risk-surfaced", true, {warningCount: generatedArtworkPolicy.summary?.warningCount || 0, flaggedBeatIds: (generatedArtworkPolicy.items || []).filter((item) => item.visualRisk).map((item) => item.beatId), adoptionBlockedByPolicyRisk: generatedArtworkPolicy.summary?.adoptionBlockedByPolicyRisk === true}, "warning");
check("generated-artwork-repair-brief-bound", generatedArtworkRepairBrief.contract === "A1HSeriesGeneratedArtworkRepairBrief/v1" && generatedArtworkRepairBrief.status === "READY_FOR_SHOT_REVIEW" && generatedArtworkRepairBrief.reviewOnly === true && generatedArtworkRepairBrief.rendererAdoptionAllowed === false && generatedArtworkRepairBrief.finalRenderAllowed === false && generatedArtworkRepairBrief.resolveExportAllowed === false && generatedArtworkRepairBrief.sourceBinding?.candidatePropsSha256 === preproductionMotionCandidate.sourceBinding?.candidateProps?.sha256 && generatedArtworkRepairBrief.sourceBinding?.artworkPolicyManifestSha256 === generatedArtworkPolicy.source?.manifestSha256 && generatedArtworkRepairBrief.summary?.riskAssetCount === 7 && generatedArtworkRepairBrief.summary?.policyRiskAssetCount === generatedArtworkPolicy.summary?.warningCount && generatedArtworkRepairBrief.summary?.briefCount === generatedArtworkRepairBrief.summary?.completeCount && generatedArtworkRepairBrief.summary?.generationBlockedCount === generatedArtworkRepairBrief.summary?.briefCount && generatedArtworkRepairBrief.summary?.userDecisionPendingCount === generatedArtworkRepairBrief.summary?.briefCount && generatedArtworkRepairBrief.policy?.noDecorativeLines === true && generatedArtworkRepairBrief.policy?.noWireframe === true && generatedArtworkRepairBrief.policy?.userDecisionBeforeGeneration === true, {contract: generatedArtworkRepairBrief.contract, status: generatedArtworkRepairBrief.status, summary: generatedArtworkRepairBrief.summary, sourceBinding: generatedArtworkRepairBrief.sourceBinding, policy: generatedArtworkRepairBrief.policy});
check("generated-artwork-repair-brief-public-identical", fs.existsSync(paths.generatedArtworkRepairBrief) && fs.existsSync(paths.generatedArtworkRepairBriefPublic) && sha256(paths.generatedArtworkRepairBrief) === sha256(paths.generatedArtworkRepairBriefPublic), {artifact: fs.existsSync(paths.generatedArtworkRepairBrief) ? sha256(paths.generatedArtworkRepairBrief) : null, public: fs.existsSync(paths.generatedArtworkRepairBriefPublic) ? sha256(paths.generatedArtworkRepairBriefPublic) : null});
check("generated-artwork-repair-brief-items", Array.isArray(generatedArtworkRepairBrief.items) && generatedArtworkRepairBrief.items.length === 7 && generatedArtworkRepairBrief.items.every((item) => item.beatId && item.semanticTask && item.asset?.subject && item.asset?.physicalRelationship && item.composition && item.background && item.typography && item.motion && item.continuity && Array.isArray(item.avoid) && item.avoid.length >= 3 && Array.isArray(item.acceptance) && item.acceptance.length >= 3 && item.review?.userDecisionRequired === true && item.review?.generationAllowedBeforeUserDecision === false), generatedArtworkRepairBrief.items?.map((item) => ({beatId: item.beatId, acceptanceCount: item.acceptance?.length, generationAllowedBeforeUserDecision: item.review?.generationAllowedBeforeUserDecision})) || "missing");
const currentCandidateReportSha = fs.existsSync(paths.preproductionMotionCandidate) ? sha256(paths.preproductionMotionCandidate) : null;
const currentRepairBriefSha = fs.existsSync(paths.generatedArtworkRepairBrief) ? sha256(paths.generatedArtworkRepairBrief) : null;
const currentExecutionPlanSha = fs.existsSync(paths.generatedArtworkExecutionPlan) ? sha256(paths.generatedArtworkExecutionPlan) : null;
check("generated-artwork-repair-chain-current-hashes", generatedArtworkRepairBrief.sourceBinding?.candidateReportSha256 === currentCandidateReportSha
  && generatedArtworkExecutionPlan.source?.repairBriefSha256 === currentRepairBriefSha
  && generatedArtworkRepairAdoptionPlan.contract === "A1HSeriesGeneratedArtworkRepairAdoptionPlan/v1"
  && generatedArtworkRepairAdoptionPlan.source?.candidatePropsSha256 === preproductionMotionCandidate.sourceBinding?.candidateProps?.sha256
  && generatedArtworkRepairAdoptionPlan.source?.executionPlanStatus === generatedArtworkExecutionPlan.status,
{candidateReport: {bound: generatedArtworkRepairBrief.sourceBinding?.candidateReportSha256, current: currentCandidateReportSha}, repairBrief: {bound: generatedArtworkExecutionPlan.source?.repairBriefSha256, current: currentRepairBriefSha}, repairAdoption: {contract: generatedArtworkRepairAdoptionPlan.contract, candidatePropsSha256: generatedArtworkRepairAdoptionPlan.source?.candidatePropsSha256, executionPlanStatus: generatedArtworkRepairAdoptionPlan.source?.executionPlanStatus, executionPlanSha256: currentExecutionPlanSha}});
check("generated-artwork-repair-adoption-plan-public-identical", fs.existsSync(paths.generatedArtworkRepairAdoptionPlan) && fs.existsSync(paths.generatedArtworkRepairAdoptionPlanPublic) && sha256(paths.generatedArtworkRepairAdoptionPlan) === sha256(paths.generatedArtworkRepairAdoptionPlanPublic), {artifact: fs.existsSync(paths.generatedArtworkRepairAdoptionPlan) ? sha256(paths.generatedArtworkRepairAdoptionPlan) : null, public: fs.existsSync(paths.generatedArtworkRepairAdoptionPlanPublic) ? sha256(paths.generatedArtworkRepairAdoptionPlanPublic) : null});
const generatedArtworkPolicyRisk = Number(generatedArtworkPolicy.summary?.warningCount || 0) > 0 || Number(generatedArtworkPolicy.summary?.failureCount || 0) > 0;
const generatedArtworkAdoptionPlanCommon = generatedArtworkAdoptionPlan.contract === "A1HSeriesGeneratedArtworkAdoptionPlan/v1"
  && generatedArtworkAdoptionPlan.projectId === "july1-writing-workbench"
  && generatedArtworkAdoptionPlan.visualMasterId === expected.visualMasterId
  && generatedArtworkAdoptionPlan.summary?.generatedAssetCount === 7
  && generatedArtworkAdoptionPlan.summary?.adoptedAssetCount === 5
  && generatedArtworkAdoptionPlan.summary?.deferredAssetCount === 2
  && generatedArtworkAdoptionPlan.summary?.dispositionCount === 7
  && generatedArtworkAdoptionPlan.summary?.highRiskCoverCount === 0;
const generatedArtworkAdoptionPlanExplicitlyBlocked = generatedArtworkPolicyRisk
  && generatedArtworkAdoptionPlan.status === "FAIL"
  && Array.isArray(generatedArtworkAdoptionPlan.failures)
  && generatedArtworkAdoptionPlan.failures.includes("generated-artwork-policy-risk-present");
check("generated-artwork-adoption-plan-ready", generatedArtworkAdoptionPlanCommon && ((generatedArtworkAdoptionPlan.status === "READY_FOR_EXPLICIT_APPROVAL" && Array.isArray(generatedArtworkAdoptionPlan.failures) && generatedArtworkAdoptionPlan.failures.length === 0) || generatedArtworkAdoptionPlanExplicitlyBlocked), {status: generatedArtworkAdoptionPlan.status, policyRisk: generatedArtworkPolicyRisk, explicitlyBlocked: generatedArtworkAdoptionPlanExplicitlyBlocked, summary: generatedArtworkAdoptionPlan.summary || "missing", failures: generatedArtworkAdoptionPlan.failures || []});
check("generated-artwork-adoption-plan-public-identical", fs.existsSync(paths.generatedArtworkAdoptionPlan) && fs.existsSync(paths.generatedArtworkAdoptionPlanPublic) && sha256(paths.generatedArtworkAdoptionPlan) === sha256(paths.generatedArtworkAdoptionPlanPublic), {artifact: fs.existsSync(paths.generatedArtworkAdoptionPlan) ? sha256(paths.generatedArtworkAdoptionPlan) : null, public: fs.existsSync(paths.generatedArtworkAdoptionPlanPublic) ? sha256(paths.generatedArtworkAdoptionPlanPublic) : null});
const currentFilmAdoptedArtworkCount = Number(currentFilmManifest.current?.assetManifest?.byStatus?.adopted || 0);
const generatedArtworkAdoptionAppliedReportPass = generatedArtworkAdoptionApplied.contract === "A1HSeriesGeneratedArtworkAdoptionApplied/v1"
  && generatedArtworkAdoptionApplied.status === "APPLIED"
  && generatedArtworkAdoptionApplied.sourcePropsModified === true
  && generatedArtworkAdoptionApplied.summary?.copiedAssetCount === 5
  && generatedArtworkAdoptionApplied.summary?.afterPropsEqualsCandidate === true
  && generatedArtworkAdoptionApplied.summary?.everyGeneratedAssetHasDisposition === true
  && fs.existsSync(paths.rendererSourceProps)
  && sha256(paths.rendererSourceProps) === generatedArtworkAdoptionApplied.summary?.afterPropsSha256
  && generatedArtworkAdoptionApplied.finalRenderAllowed === false
  && generatedArtworkAdoptionApplied.resolveExportAllowed === false
  && Array.isArray(generatedArtworkAdoptionApplied.failures)
  && generatedArtworkAdoptionApplied.failures.length === 0;
const generatedArtworkAdoptionRemainsReviewOnly = rendererSourceProps.scenes?.length === 47
  && rendererSourceProps.reviewOnly === true
  && rendererSourceProps.finalRenderAllowed === false
  && (generatedArtworkAdoptionPlan.status === "READY_FOR_EXPLICIT_APPROVAL" || generatedArtworkAdoptionPlanExplicitlyBlocked);
check("generated-artwork-adoption-applied", currentFilmIsAuthority
  ? currentFilmManifest.gates?.assets?.pass === true && currentFilmAdoptedArtworkCount >= 1 && currentFilmManifest.current?.rendererPropsSha256 === sha256(paths.rendererSourceProps)
  : generatedArtworkAdoptionAppliedReportPass || generatedArtworkAdoptionRemainsReviewOnly, {authority: currentFilmIsAuthority ? "current-film-manifest" : "legacy-adoption-report", currentFilmAdoptedArtworkCount, applied: generatedArtworkAdoptionApplied.summary || null, adoptionPlan: generatedArtworkAdoptionPlan.summary || null, policyRisk: generatedArtworkPolicyRisk, adoptionPlanExplicitlyBlocked: generatedArtworkAdoptionPlanExplicitlyBlocked, rendererSceneCount: rendererSourceProps.scenes?.length});
check("generated-artwork-adoption-applied-public-identical", fs.existsSync(paths.generatedArtworkAdoptionApplied) && fs.existsSync(paths.generatedArtworkAdoptionAppliedPublic) && sha256(paths.generatedArtworkAdoptionApplied) === sha256(paths.generatedArtworkAdoptionAppliedPublic), {artifact: fs.existsSync(paths.generatedArtworkAdoptionApplied) ? sha256(paths.generatedArtworkAdoptionApplied) : null, public: fs.existsSync(paths.generatedArtworkAdoptionAppliedPublic) ? sha256(paths.generatedArtworkAdoptionAppliedPublic) : null});
check("generated-artwork-post-adoption-pass", generatedArtworkPostAdoption.contract === "A1HSeriesGeneratedArtworkPostAdoptionAudit/v1" && generatedArtworkPostAdoption.status === "PASS" && generatedArtworkPostAdoption.projectId === "july1-writing-workbench" && generatedArtworkPostAdoption.visualMasterId === expected.visualMasterId && generatedArtworkPostAdoption.reviewOnly === true && generatedArtworkPostAdoption.finalRenderAllowed === false && generatedArtworkPostAdoption.resolveExportAllowed === false && generatedArtworkPostAdoption.summary?.adoptedAssetCount === 5 && generatedArtworkPostAdoption.summary?.verifiedVisibleCount === 5 && generatedArtworkPostAdoption.summary?.mp4BoundCount === 5 && generatedArtworkPostAdoption.summary?.deferredAssetCount === 2 && generatedArtworkPostAdoption.summary?.averageChangedPixelFraction >= 0.2 && Array.isArray(generatedArtworkPostAdoption.failures) && generatedArtworkPostAdoption.failures.length === 0, generatedArtworkPostAdoption.summary || "missing");
check("generated-artwork-post-adoption-public-identical", fs.existsSync(paths.generatedArtworkPostAdoption) && fs.existsSync(paths.generatedArtworkPostAdoptionPublic) && sha256(paths.generatedArtworkPostAdoption) === sha256(paths.generatedArtworkPostAdoptionPublic), {artifact: fs.existsSync(paths.generatedArtworkPostAdoption) ? sha256(paths.generatedArtworkPostAdoption) : null, public: fs.existsSync(paths.generatedArtworkPostAdoptionPublic) ? sha256(paths.generatedArtworkPostAdoptionPublic) : null});
const generatedArtworkPostAdoptionContactFile = generatedArtworkPostAdoption.contactSheet?.publicUrl ? path.join(publicRoot, generatedArtworkPostAdoption.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("generated-artwork-post-adoption-contact-sheet-exists", Boolean(generatedArtworkPostAdoptionContactFile && fs.existsSync(generatedArtworkPostAdoptionContactFile) && sha256(generatedArtworkPostAdoptionContactFile) === generatedArtworkPostAdoption.contactSheet?.sha256), generatedArtworkPostAdoptionContactFile || "missing");

check("text-motion-quality-pass", textMotionQuality.contract === "A1HSeriesTextMotionQualityAudit/v1" && ["PASS", "PASS_WITH_REVIEW_RISKS"].includes(textMotionQuality.status) && textMotionQuality.visualMasterId === expected.visualMasterId && textMotionQuality.reviewOnly === true && textMotionQuality.finalRenderAllowed === false && textMotionQuality.resolveExportAllowed === false && textMotionQuality.rendererAdoptionAllowed === false, {contract: textMotionQuality.contract, status: textMotionQuality.status, visualMasterId: textMotionQuality.visualMasterId, reviewOnly: textMotionQuality.reviewOnly, finalRenderAllowed: textMotionQuality.finalRenderAllowed, resolveExportAllowed: textMotionQuality.resolveExportAllowed, rendererAdoptionAllowed: textMotionQuality.rendererAdoptionAllowed});
check("text-motion-quality-public-identical", fs.existsSync(paths.textMotionQuality) && fs.existsSync(paths.textMotionQualityPublic) && sha256(paths.textMotionQuality) === sha256(paths.textMotionQualityPublic), {artifact: fs.existsSync(paths.textMotionQuality) ? sha256(paths.textMotionQuality) : null, public: fs.existsSync(paths.textMotionQualityPublic) ? sha256(paths.textMotionQualityPublic) : null});
const textMotionQualityItems = Array.isArray(textMotionQuality.items) ? textMotionQuality.items : [];
check("text-motion-quality-summary", textMotionQuality.summary?.sceneCount === 47 && textMotionQuality.summary?.passCount === 47 && textMotionQuality.summary?.failCount === 0 && textMotionQuality.summary?.blockerCount === 0 && textMotionQuality.summary?.maxTitleLineChars <= 14 && textMotionQuality.summary?.minFontSize >= 88 && textMotionQuality.summary?.maxFitRatio <= 0.82 && textMotionQuality.summary?.minReadableHoldFrames >= 14 && textMotionQuality.summary?.curveCount >= 3 && textMotionQuality.summary?.motionStyleCount >= 4 && textMotionQuality.summary?.textModeCount >= 3 && textMotionQuality.summary?.rendererHidesSupportTokens === true && Array.isArray(textMotionQuality.globalBlockers) && textMotionQuality.globalBlockers.length === 0 && Array.isArray(textMotionQuality.failures) && textMotionQuality.failures.length === 0, textMotionQuality.summary || "missing");
check("text-motion-quality-items", textMotionQualityItems.length === 47 && textMotionQualityItems.every((item) => item.status === "PASS" && Array.isArray(item.blockers) && item.blockers.length === 0 && item.typography?.lineCount >= 1 && item.typography?.lineCount <= 3 && item.typography?.maxLineChars <= 14 && item.typography?.fontSize >= 88 && item.typography?.fitRatio <= 0.82 && item.motion?.trackCount === 5 && item.motion?.holdFrames >= item.motion?.minReadableHold && typeof item.motion?.signature === "string" && item.motion.signature.length > 0), textMotionQualityItems.slice(0, 8).map((item) => ({beatId: item.beatId, status: item.status, typography: item.typography, motion: item.motion, blockers: item.blockers, risks: item.risks})));
const textMotionQualityContactFile = textMotionQuality.contactSheet?.publicUrl ? path.join(publicRoot, textMotionQuality.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("text-motion-quality-contact-sheet-exists", Boolean(textMotionQualityContactFile && fs.existsSync(textMotionQualityContactFile)), textMotionQualityContactFile || "missing");

check("text-motion-diversity-repair-plan-ready", textMotionDiversityRepairPlan.contract === "A1HSeriesTextMotionDiversityRepairPlan/v1" && textMotionDiversityRepairPlan.status === "READY_FOR_TARGETED_REPAIR_REVIEW" && textMotionDiversityRepairPlan.visualMasterId === expected.visualMasterId && textMotionDiversityRepairPlan.reviewOnly === true && textMotionDiversityRepairPlan.dryRunOnly === true && textMotionDiversityRepairPlan.rendererPatchAllowed === false && textMotionDiversityRepairPlan.fullMp4RenderAllowed === false && textMotionDiversityRepairPlan.finalRenderAllowed === false && textMotionDiversityRepairPlan.resolveExportAllowed === false, {contract: textMotionDiversityRepairPlan.contract, status: textMotionDiversityRepairPlan.status, visualMasterId: textMotionDiversityRepairPlan.visualMasterId, reviewOnly: textMotionDiversityRepairPlan.reviewOnly, dryRunOnly: textMotionDiversityRepairPlan.dryRunOnly, rendererPatchAllowed: textMotionDiversityRepairPlan.rendererPatchAllowed, fullMp4RenderAllowed: textMotionDiversityRepairPlan.fullMp4RenderAllowed, finalRenderAllowed: textMotionDiversityRepairPlan.finalRenderAllowed, resolveExportAllowed: textMotionDiversityRepairPlan.resolveExportAllowed});
check("text-motion-diversity-repair-plan-public-identical", fs.existsSync(paths.textMotionDiversityRepairPlan) && fs.existsSync(paths.textMotionDiversityRepairPlanPublic) && sha256(paths.textMotionDiversityRepairPlan) === sha256(paths.textMotionDiversityRepairPlanPublic), {artifact: fs.existsSync(paths.textMotionDiversityRepairPlan) ? sha256(paths.textMotionDiversityRepairPlan) : null, public: fs.existsSync(paths.textMotionDiversityRepairPlanPublic) ? sha256(paths.textMotionDiversityRepairPlanPublic) : null});
const textMotionDiversityRepairItems = Array.isArray(textMotionDiversityRepairPlan.repairItems) ? textMotionDiversityRepairPlan.repairItems : [];
check("text-motion-diversity-repair-plan-summary", textMotionDiversityRepairPlan.summary?.sceneCount === 47 && textMotionDiversityRepairPlan.summary?.targetRunCount >= 1 && textMotionDiversityRepairPlan.summary?.repairItemCount >= 6 && textMotionDiversityRepairPlan.summary?.currentMaxMotionSignatureRun > textMotionDiversityRepairPlan.summary?.projectedMaxMotionSignatureRun && textMotionDiversityRepairPlan.summary?.projectedMaxMotionSignatureRun <= textMotionDiversityRepairPlan.summary?.targetMaxRun && textMotionDiversityRepairPlan.summary?.projectedImprovesLongRuns === true && textMotionDiversityRepairPlan.summary?.uniqueProposedSignatures >= 3 && Array.isArray(textMotionDiversityRepairPlan.failures) && textMotionDiversityRepairPlan.failures.length === 0, textMotionDiversityRepairPlan.summary || "missing");
check("text-motion-diversity-repair-plan-items", textMotionDiversityRepairItems.length === textMotionDiversityRepairPlan.summary?.repairItemCount && textMotionDiversityRepairItems.every((item) => item.current?.signature && item.proposed?.signature && item.current.signature !== item.proposed.signature && item.patchScope === "motionPlan-only-dry-run" && item.rendererPatchAllowed === false && item.fullMp4RenderAllowed === false && item.resolveExportAllowed === false), textMotionDiversityRepairItems.map((item) => ({beatId: item.beatId, current: item.current?.signature, proposed: item.proposed?.signature, patchScope: item.patchScope, rendererPatchAllowed: item.rendererPatchAllowed})));
const textMotionDiversityRepairPlanContactFile = textMotionDiversityRepairPlan.contactSheet?.publicUrl ? path.join(publicRoot, textMotionDiversityRepairPlan.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("text-motion-diversity-repair-plan-contact-sheet-exists", Boolean(textMotionDiversityRepairPlanContactFile && fs.existsSync(textMotionDiversityRepairPlanContactFile)), textMotionDiversityRepairPlanContactFile || "missing");

check("text-motion-targeted-proof-ready", textMotionTargetedProof.contract === "A1HSeriesTextMotionTargetedProof/v1" && textMotionTargetedProof.status === "READY_FOR_BOUNDED_PREVIEW_REVIEW" && textMotionTargetedProof.visualMasterId === expected.visualMasterId && textMotionTargetedProof.proofOnly === true && textMotionTargetedProof.dryRunOnly === true && textMotionTargetedProof.rendererPatchAllowed === false && textMotionTargetedProof.fullMp4RenderAllowed === false && textMotionTargetedProof.finalRenderAllowed === false && textMotionTargetedProof.resolveExportAllowed === false, {contract: textMotionTargetedProof.contract, status: textMotionTargetedProof.status, visualMasterId: textMotionTargetedProof.visualMasterId, proofOnly: textMotionTargetedProof.proofOnly, dryRunOnly: textMotionTargetedProof.dryRunOnly, rendererPatchAllowed: textMotionTargetedProof.rendererPatchAllowed, fullMp4RenderAllowed: textMotionTargetedProof.fullMp4RenderAllowed, finalRenderAllowed: textMotionTargetedProof.finalRenderAllowed, resolveExportAllowed: textMotionTargetedProof.resolveExportAllowed});
check("text-motion-targeted-proof-public-identical", fs.existsSync(paths.textMotionTargetedProof) && fs.existsSync(paths.textMotionTargetedProofPublic) && sha256(paths.textMotionTargetedProof) === sha256(paths.textMotionTargetedProofPublic), {artifact: fs.existsSync(paths.textMotionTargetedProof) ? sha256(paths.textMotionTargetedProof) : null, public: fs.existsSync(paths.textMotionTargetedProofPublic) ? sha256(paths.textMotionTargetedProofPublic) : null});
const textMotionTargetedProofItems = Array.isArray(textMotionTargetedProof.proofItems) ? textMotionTargetedProof.proofItems : [];
check("text-motion-targeted-proof-summary", textMotionTargetedProof.summary?.sceneCount === 47 && textMotionTargetedProof.summary?.proofItemCount >= 10 && textMotionTargetedProof.summary?.currentMaxMotionSignatureRun > textMotionTargetedProof.summary?.projectedMaxMotionSignatureRun && textMotionTargetedProof.summary?.projectedMaxMotionSignatureRun <= textMotionTargetedProof.summary?.targetMaxRun && textMotionTargetedProof.summary?.uniqueProposedSignatures >= 4 && Array.isArray(textMotionTargetedProof.summary?.semanticBlueRoles) && textMotionTargetedProof.summary.semanticBlueRoles.length >= 3 && textMotionTargetedProof.summary?.currentMainMp4Unchanged === true && Array.isArray(textMotionTargetedProof.failures) && textMotionTargetedProof.failures.length === 0, textMotionTargetedProof.summary || "missing");
check("text-motion-targeted-proof-items", textMotionTargetedProofItems.length === textMotionTargetedProof.summary?.proofItemCount && textMotionTargetedProofItems.every((item) => item.current?.signature && item.proposed?.signature && item.current.signature !== item.proposed.signature && item.patchScope === "projected-motion-plan-proof-only" && item.visualRecipe?.semanticBlueRole && item.visualRecipe?.composition && Array.isArray(item.visualRecipe?.stateSequence) && item.visualRecipe.stateSequence.length >= 4 && item.locks?.proofOnly === true && item.locks?.rendererPatchAllowed === false && item.locks?.fullMp4RenderAllowed === false && item.locks?.finalRenderAllowed === false && item.locks?.resolveExportAllowed === false), textMotionTargetedProofItems.map((item) => ({beatId: item.beatId, current: item.current?.signature, proposed: item.proposed?.signature, patchScope: item.patchScope, semanticBlueRole: item.visualRecipe?.semanticBlueRole, locks: item.locks})));
const textMotionTargetedProofContactFile = textMotionTargetedProof.contactSheet?.publicUrl ? path.join(publicRoot, textMotionTargetedProof.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("text-motion-targeted-proof-contact-sheet-exists", Boolean(textMotionTargetedProofContactFile && fs.existsSync(textMotionTargetedProofContactFile)), textMotionTargetedProofContactFile || "missing");
const textMotionTargetedProofPatchFile = textMotionTargetedProof.patchPlan?.publicUrl ? path.join(publicRoot, textMotionTargetedProof.patchPlan.publicUrl.replace(/^\//u, "")) : "";
check("text-motion-targeted-proof-patch-plan-exists", Boolean(textMotionTargetedProofPatchFile && fs.existsSync(textMotionTargetedProofPatchFile)), textMotionTargetedProofPatchFile || "missing");

check("text-motion-targeted-still-proof-pass", textMotionTargetedStillProof.contract === "A1HSeriesTextMotionTargetedStillProof/v1" && textMotionTargetedStillProof.status === "PASS" && textMotionTargetedStillProof.visualMasterId === expected.visualMasterId && textMotionTargetedStillProof.proofOnly === true && textMotionTargetedStillProof.dryRunOnly === true && textMotionTargetedStillProof.rendererSourcePropsModified === false && textMotionTargetedStillProof.currentMainMp4Modified === false && textMotionTargetedStillProof.rendererPatchAllowed === false && textMotionTargetedStillProof.fullMp4RenderAllowed === false && textMotionTargetedStillProof.finalRenderAllowed === false && textMotionTargetedStillProof.resolveExportAllowed === false, {contract: textMotionTargetedStillProof.contract, status: textMotionTargetedStillProof.status, visualMasterId: textMotionTargetedStillProof.visualMasterId, proofOnly: textMotionTargetedStillProof.proofOnly, dryRunOnly: textMotionTargetedStillProof.dryRunOnly, rendererSourcePropsModified: textMotionTargetedStillProof.rendererSourcePropsModified, currentMainMp4Modified: textMotionTargetedStillProof.currentMainMp4Modified, rendererPatchAllowed: textMotionTargetedStillProof.rendererPatchAllowed, fullMp4RenderAllowed: textMotionTargetedStillProof.fullMp4RenderAllowed, finalRenderAllowed: textMotionTargetedStillProof.finalRenderAllowed, resolveExportAllowed: textMotionTargetedStillProof.resolveExportAllowed});
check("text-motion-targeted-still-proof-public-identical", fs.existsSync(paths.textMotionTargetedStillProof) && fs.existsSync(paths.textMotionTargetedStillProofPublic) && sha256(paths.textMotionTargetedStillProof) === sha256(paths.textMotionTargetedStillProofPublic), {artifact: fs.existsSync(paths.textMotionTargetedStillProof) ? sha256(paths.textMotionTargetedStillProof) : null, public: fs.existsSync(paths.textMotionTargetedStillProofPublic) ? sha256(paths.textMotionTargetedStillProofPublic) : null});
const textMotionTargetedStillProofItems = Array.isArray(textMotionTargetedStillProof.proofItems) ? textMotionTargetedStillProof.proofItems : [];
check("text-motion-targeted-still-proof-summary", textMotionTargetedStillProof.summary?.selectedBeatCount >= 10 && textMotionTargetedStillProof.summary?.renderedProofItemCount === textMotionTargetedStillProof.summary?.selectedBeatCount && textMotionTargetedStillProof.summary?.renderedStillCount >= 60 && textMotionTargetedStillProof.summary?.averageBestMeanAbsDiff >= 1.2 && textMotionTargetedStillProof.summary?.lowDiffItemCount <= 1 && Array.isArray(textMotionTargetedStillProof.summary?.uniqueProjectedMotionStyles) && textMotionTargetedStillProof.summary.uniqueProjectedMotionStyles.length >= 4 && textMotionTargetedStillProof.summary?.currentMainMp4Unchanged === true && Array.isArray(textMotionTargetedStillProof.failures) && textMotionTargetedStillProof.failures.length === 0, textMotionTargetedStillProof.summary || "missing");
check("text-motion-targeted-still-proof-items", textMotionTargetedStillProofItems.length === textMotionTargetedStillProof.summary?.renderedProofItemCount && textMotionTargetedStillProofItems.every((item) => typeof item.beatId === "string" && item.beatId.startsWith("H") && item.currentSignature !== item.proposedSignature && typeof item.projectedMotionStyle === "string" && item.bestMeanAbsDiff > 0 && item.bestActiveDiffFraction > 0 && Array.isArray(item.frames) && item.frames.length >= 6), textMotionTargetedStillProofItems.map((item) => ({beatId: item.beatId, current: item.currentSignature, proposed: item.proposedSignature, bestMeanAbsDiff: item.bestMeanAbsDiff, bestActiveDiffFraction: item.bestActiveDiffFraction, frames: item.frames?.length})));
const textMotionTargetedStillProofContactFile = textMotionTargetedStillProof.contactSheet?.publicUrl ? path.join(publicRoot, textMotionTargetedStillProof.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("text-motion-targeted-still-proof-contact-sheet-exists", Boolean(textMotionTargetedStillProofContactFile && fs.existsSync(textMotionTargetedStillProofContactFile)), textMotionTargetedStillProofContactFile || "missing");
if (textMotionTargetedStillProofContactFile && fs.existsSync(textMotionTargetedStillProofContactFile)) check("text-motion-targeted-still-proof-contact-sheet-sha", sha256(textMotionTargetedStillProofContactFile) === textMotionTargetedStillProof.contactSheet.sha256, {actual: sha256(textMotionTargetedStillProofContactFile), report: textMotionTargetedStillProof.contactSheet.sha256});

check("text-motion-targeted-moving-preview-pass", textMotionTargetedMovingPreview.contract === "A1HSeriesTextMotionTargetedMovingPreview/v1" && textMotionTargetedMovingPreview.status === "PASS" && textMotionTargetedMovingPreview.visualMasterId === expected.visualMasterId && textMotionTargetedMovingPreview.proofOnly === true && textMotionTargetedMovingPreview.dryRunOnly === true && textMotionTargetedMovingPreview.rendererSourcePropsModified === false && textMotionTargetedMovingPreview.currentMainMp4Modified === false && textMotionTargetedMovingPreview.rendererPatchAllowed === false && textMotionTargetedMovingPreview.fullMp4RenderAllowed === false && textMotionTargetedMovingPreview.finalRenderAllowed === false && textMotionTargetedMovingPreview.resolveExportAllowed === false, {contract: textMotionTargetedMovingPreview.contract, status: textMotionTargetedMovingPreview.status, visualMasterId: textMotionTargetedMovingPreview.visualMasterId, proofOnly: textMotionTargetedMovingPreview.proofOnly, dryRunOnly: textMotionTargetedMovingPreview.dryRunOnly, rendererSourcePropsModified: textMotionTargetedMovingPreview.rendererSourcePropsModified, currentMainMp4Modified: textMotionTargetedMovingPreview.currentMainMp4Modified, rendererPatchAllowed: textMotionTargetedMovingPreview.rendererPatchAllowed, fullMp4RenderAllowed: textMotionTargetedMovingPreview.fullMp4RenderAllowed, finalRenderAllowed: textMotionTargetedMovingPreview.finalRenderAllowed, resolveExportAllowed: textMotionTargetedMovingPreview.resolveExportAllowed});
check("text-motion-targeted-moving-preview-public-identical", fs.existsSync(paths.textMotionTargetedMovingPreview) && fs.existsSync(paths.textMotionTargetedMovingPreviewPublic) && sha256(paths.textMotionTargetedMovingPreview) === sha256(paths.textMotionTargetedMovingPreviewPublic), {artifact: fs.existsSync(paths.textMotionTargetedMovingPreview) ? sha256(paths.textMotionTargetedMovingPreview) : null, public: fs.existsSync(paths.textMotionTargetedMovingPreviewPublic) ? sha256(paths.textMotionTargetedMovingPreviewPublic) : null});
const textMotionTargetedMovingPreviewItems = Array.isArray(textMotionTargetedMovingPreview.motionItems) ? textMotionTargetedMovingPreview.motionItems : [];
check("text-motion-targeted-moving-preview-summary", textMotionTargetedMovingPreview.summary?.selectedBeatCount >= 10 && textMotionTargetedMovingPreview.summary?.movingPreviewItemCount === textMotionTargetedMovingPreview.summary?.selectedBeatCount && textMotionTargetedMovingPreview.summary?.durationSec >= 29 && textMotionTargetedMovingPreview.summary?.lowMotionItemCount === 0 && textMotionTargetedMovingPreview.summary?.lowHoldDiffItemCount === 0 && textMotionTargetedMovingPreview.summary?.averageProjectedMotionMeanAbsDiff >= 1.2 && textMotionTargetedMovingPreview.summary?.minCurrentProjectedHoldDiff >= 0.65 && Array.isArray(textMotionTargetedMovingPreview.summary?.uniqueProjectedMotionStyles) && textMotionTargetedMovingPreview.summary.uniqueProjectedMotionStyles.length >= 4 && textMotionTargetedMovingPreview.summary?.currentMainMp4Unchanged === true && Array.isArray(textMotionTargetedMovingPreview.failures) && textMotionTargetedMovingPreview.failures.length === 0, textMotionTargetedMovingPreview.summary || "missing");
check("text-motion-targeted-moving-preview-items", textMotionTargetedMovingPreviewItems.length === textMotionTargetedMovingPreview.summary?.movingPreviewItemCount && textMotionTargetedMovingPreviewItems.every((item) => typeof item.beatId === "string" && item.beatId.startsWith("H") && item.currentSignature !== item.proposedSignature && typeof item.projectedMotionStyle === "string" && item.projectedMotionMeanAbsDiff >= 0.65 && item.projectedMotionActiveFraction >= 0.006 && item.currentProjectedHoldDiff?.meanAbsDiff >= 0.65 && item.currentProjectedHoldDiff?.activeDiffFraction >= 0.006), textMotionTargetedMovingPreviewItems.map((item) => ({beatId: item.beatId, current: item.currentSignature, proposed: item.proposedSignature, projectedMotionMeanAbsDiff: item.projectedMotionMeanAbsDiff, projectedMotionActiveFraction: item.projectedMotionActiveFraction, holdDiff: item.currentProjectedHoldDiff})));
const textMotionTargetedMovingPreviewVideoFile = textMotionTargetedMovingPreview.videos?.comparison?.publicUrl ? path.join(publicRoot, textMotionTargetedMovingPreview.videos.comparison.publicUrl.replace(/^\//u, "")) : "";
check("text-motion-targeted-moving-preview-video-exists", Boolean(textMotionTargetedMovingPreviewVideoFile && fs.existsSync(textMotionTargetedMovingPreviewVideoFile) && sha256(textMotionTargetedMovingPreviewVideoFile) === textMotionTargetedMovingPreview.videos.comparison.sha256 && textMotionTargetedMovingPreview.videos.comparison.width === 1920 && textMotionTargetedMovingPreview.videos.comparison.height === 540), textMotionTargetedMovingPreviewVideoFile || "missing");
const textMotionTargetedMovingPreviewContactFile = textMotionTargetedMovingPreview.contactSheet?.publicUrl ? path.join(publicRoot, textMotionTargetedMovingPreview.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("text-motion-targeted-moving-preview-contact-sheet-exists", Boolean(textMotionTargetedMovingPreviewContactFile && fs.existsSync(textMotionTargetedMovingPreviewContactFile)), textMotionTargetedMovingPreviewContactFile || "missing");
if (textMotionTargetedMovingPreviewContactFile && fs.existsSync(textMotionTargetedMovingPreviewContactFile)) check("text-motion-targeted-moving-preview-contact-sheet-sha", sha256(textMotionTargetedMovingPreviewContactFile) === textMotionTargetedMovingPreview.contactSheet.sha256, {actual: sha256(textMotionTargetedMovingPreviewContactFile), report: textMotionTargetedMovingPreview.contactSheet.sha256});

check("text-motion-renderer-adoption-plan-ready", textMotionRendererAdoptionPlan.contract === "A1HSeriesTextMotionRendererAdoptionPlan/v1" && textMotionRendererAdoptionPlan.status === "READY_FOR_EXPLICIT_APPROVAL" && textMotionRendererAdoptionPlan.visualMasterId === expected.visualMasterId && textMotionRendererAdoptionPlan.planOnly === true && textMotionRendererAdoptionPlan.candidatePropsOnly === true && textMotionRendererAdoptionPlan.sourcePropsModified === false && textMotionRendererAdoptionPlan.currentMainMp4Modified === false && textMotionRendererAdoptionPlan.rendererSourceAdoptionAllowed === false && textMotionRendererAdoptionPlan.applyAllowedBeforeExplicitApproval === false && textMotionRendererAdoptionPlan.refreshCurrent540pMp4Allowed === false && textMotionRendererAdoptionPlan.fullMp4RenderAllowed === false && textMotionRendererAdoptionPlan.finalRenderAllowed === false && textMotionRendererAdoptionPlan.resolveExportAllowed === false, {contract: textMotionRendererAdoptionPlan.contract, status: textMotionRendererAdoptionPlan.status, locks: {planOnly: textMotionRendererAdoptionPlan.planOnly, candidatePropsOnly: textMotionRendererAdoptionPlan.candidatePropsOnly, sourcePropsModified: textMotionRendererAdoptionPlan.sourcePropsModified, currentMainMp4Modified: textMotionRendererAdoptionPlan.currentMainMp4Modified, rendererSourceAdoptionAllowed: textMotionRendererAdoptionPlan.rendererSourceAdoptionAllowed, applyAllowedBeforeExplicitApproval: textMotionRendererAdoptionPlan.applyAllowedBeforeExplicitApproval}});
check("text-motion-renderer-adoption-plan-public-identical", fs.existsSync(paths.textMotionRendererAdoptionPlan) && fs.existsSync(paths.textMotionRendererAdoptionPlanPublic) && sha256(paths.textMotionRendererAdoptionPlan) === sha256(paths.textMotionRendererAdoptionPlanPublic), {artifact: fs.existsSync(paths.textMotionRendererAdoptionPlan) ? sha256(paths.textMotionRendererAdoptionPlan) : null, public: fs.existsSync(paths.textMotionRendererAdoptionPlanPublic) ? sha256(paths.textMotionRendererAdoptionPlanPublic) : null});
const textMotionRendererAdoptionItems = Array.isArray(textMotionRendererAdoptionPlan.adoptionItems) ? textMotionRendererAdoptionPlan.adoptionItems : [];
check("text-motion-renderer-adoption-plan-prereqs", textMotionRendererAdoptionPlan.prerequisites?.targetedProof === "READY_FOR_BOUNDED_PREVIEW_REVIEW" && textMotionRendererAdoptionPlan.prerequisites?.renderedStillProof === "PASS" && textMotionRendererAdoptionPlan.prerequisites?.movingPreview === "PASS" && textMotionRendererAdoptionPlan.prerequisites?.currentMainMp4ShaMatchesManifest === true, textMotionRendererAdoptionPlan.prerequisites || "missing");
check("text-motion-renderer-adoption-plan-summary", textMotionRendererAdoptionPlan.summary?.sceneCount === 47 && textMotionRendererAdoptionPlan.summary?.selectedBeatCount >= 10 && textMotionRendererAdoptionPlan.summary?.adoptionItemCount === textMotionRendererAdoptionPlan.summary?.selectedBeatCount && textMotionRendererAdoptionPlan.summary?.changedSceneCount === textMotionRendererAdoptionPlan.summary?.adoptionItemCount && textMotionRendererAdoptionPlan.summary?.nonMotionSceneChangeCount === 0 && textMotionRendererAdoptionPlan.summary?.lowMotionItemCount === 0 && textMotionRendererAdoptionPlan.summary?.lowHoldDiffItemCount === 0 && Array.isArray(textMotionRendererAdoptionPlan.summary?.uniqueProjectedMotionStyles) && textMotionRendererAdoptionPlan.summary.uniqueProjectedMotionStyles.length >= 4 && Array.isArray(textMotionRendererAdoptionPlan.failures) && textMotionRendererAdoptionPlan.failures.length === 0, textMotionRendererAdoptionPlan.summary || "missing");
check("text-motion-renderer-adoption-plan-items", textMotionRendererAdoptionItems.length === textMotionRendererAdoptionPlan.summary?.adoptionItemCount && textMotionRendererAdoptionItems.every((item) => typeof item.beatId === "string" && item.beatId.startsWith("H") && item.jsonPointer?.startsWith("/scenes/") && item.currentSignature !== item.proposedSignature && item.evidence?.projectedMotionMeanAbsDiff >= 0.65 && item.evidence?.projectedMotionActiveFraction >= 0.006 && item.evidence?.currentProjectedHoldDiff?.meanAbsDiff >= 0.65), textMotionRendererAdoptionItems.map((item) => ({beatId: item.beatId, pointer: item.jsonPointer, current: item.currentSignature, proposed: item.proposedSignature, evidence: item.evidence})));
const textMotionRendererAdoptionCandidateFile = textMotionRendererAdoptionPlan.candidateProps?.publicUrl ? path.join(publicRoot, textMotionRendererAdoptionPlan.candidateProps.publicUrl.replace(/^\//u, "")) : "";
const textMotionRendererAdoptionPatchOpsFile = textMotionRendererAdoptionPlan.patchOps?.publicUrl ? path.join(publicRoot, textMotionRendererAdoptionPlan.patchOps.publicUrl.replace(/^\//u, "")) : "";
check("text-motion-renderer-adoption-plan-candidate-props-exists", Boolean(textMotionRendererAdoptionCandidateFile && fs.existsSync(textMotionRendererAdoptionCandidateFile) && sha256(textMotionRendererAdoptionCandidateFile) === textMotionRendererAdoptionPlan.candidateProps.sha256), textMotionRendererAdoptionCandidateFile || "missing");
check("text-motion-renderer-adoption-plan-patch-ops-exists", Boolean(textMotionRendererAdoptionPatchOpsFile && fs.existsSync(textMotionRendererAdoptionPatchOpsFile) && sha256(textMotionRendererAdoptionPatchOpsFile) === textMotionRendererAdoptionPlan.patchOps.sha256 && textMotionRendererAdoptionPlan.patchOps.operationCount === textMotionRendererAdoptionPlan.summary?.adoptionItemCount + 1), textMotionRendererAdoptionPatchOpsFile || "missing");
check("text-motion-renderer-adoption-plan-approval-guard", textMotionRendererAdoptionPlan.guards?.worktreeBasename === expected.worktreeBasename && textMotionRendererAdoptionPlan.guards?.branch === expected.branch && typeof textMotionRendererAdoptionPlan.guards?.sourcePropsSha256MustEqual === "string" && textMotionRendererAdoptionPlan.guards.sourcePropsSha256MustEqual.length === 64 && textMotionRendererAdoptionPlan.guards?.userApprovalRequiredBeforeSourceWrite === true, textMotionRendererAdoptionPlan.guards || "missing");
check("text-motion-renderer-adoption-applied-pass", textMotionRendererAdoptionApplied.contract === "A1HSeriesTextMotionRendererAdoptionApplied/v1" && textMotionRendererAdoptionApplied.status === "APPLIED" && textMotionRendererAdoptionApplied.visualMasterId === expected.visualMasterId && textMotionRendererAdoptionApplied.sourcePropsModified === true && textMotionRendererAdoptionApplied.currentMainMp4Modified === false && textMotionRendererAdoptionApplied.refreshCurrent540pMp4Allowed === false && textMotionRendererAdoptionApplied.fullMp4RenderAllowed === false && textMotionRendererAdoptionApplied.finalRenderAllowed === false && textMotionRendererAdoptionApplied.resolveExportAllowed === false, {contract: textMotionRendererAdoptionApplied.contract, status: textMotionRendererAdoptionApplied.status, locks: {sourcePropsModified: textMotionRendererAdoptionApplied.sourcePropsModified, currentMainMp4Modified: textMotionRendererAdoptionApplied.currentMainMp4Modified, finalRenderAllowed: textMotionRendererAdoptionApplied.finalRenderAllowed, resolveExportAllowed: textMotionRendererAdoptionApplied.resolveExportAllowed}});
check("text-motion-renderer-adoption-applied-public-identical", fs.existsSync(paths.textMotionRendererAdoptionApplied) && fs.existsSync(paths.textMotionRendererAdoptionAppliedPublic) && sha256(paths.textMotionRendererAdoptionApplied) === sha256(paths.textMotionRendererAdoptionAppliedPublic), {artifact: fs.existsSync(paths.textMotionRendererAdoptionApplied) ? sha256(paths.textMotionRendererAdoptionApplied) : null, public: fs.existsSync(paths.textMotionRendererAdoptionAppliedPublic) ? sha256(paths.textMotionRendererAdoptionAppliedPublic) : null});
check("text-motion-renderer-adoption-preserved-after-artwork-adoption", fs.existsSync(paths.rendererSourceProps) && textMotionRendererAdoptionApplied.summary?.afterPropsEqualsCandidate === true && textMotionRendererAdoptionApplied.summary?.appliedMotionPlanCount === textMotionRendererAdoptionPlan.summary?.adoptionItemCount && textMotionPostAdoptionSource.sourcePropsContainsAdoptedMotion === true && textMotionPostAdoptionSource.sourcePropsBoundToArtworkAdoption === true && textMotionPostAdoptionSource.currentReviewMp4BoundToSource === true, {sourceProps: fs.existsSync(paths.rendererSourceProps) ? sha256(paths.rendererSourceProps) : null, textMotionCandidate: textMotionRendererAdoptionCandidateFile && fs.existsSync(textMotionRendererAdoptionCandidateFile) ? sha256(textMotionRendererAdoptionCandidateFile) : null, sourcePropsContainsAdoptedMotion: textMotionPostAdoptionSource.sourcePropsContainsAdoptedMotion, sourcePropsBoundToArtworkAdoption: textMotionPostAdoptionSource.sourcePropsBoundToArtworkAdoption, currentReviewMp4BoundToSource: textMotionPostAdoptionSource.currentReviewMp4BoundToSource});
check("text-motion-renderer-adoption-applied-guards", textMotionRendererAdoptionApplied.guards?.worktreeBasename === expected.worktreeBasename && textMotionRendererAdoptionApplied.guards?.branch === expected.branch && textMotionRendererAdoptionApplied.guards?.beforePropsSha256MustEqual === textMotionRendererAdoptionPlan.guards?.sourcePropsSha256MustEqual && textMotionRendererAdoptionApplied.guards?.candidatePropsSha256MustEqual === textMotionRendererAdoptionPlan.candidateProps?.sha256 && Array.isArray(textMotionRendererAdoptionApplied.failures) && textMotionRendererAdoptionApplied.failures.length === 0, textMotionRendererAdoptionApplied.guards || "missing");
check("text-motion-post-adoption-source-pass", textMotionPostAdoptionSource.contract === "A1HSeriesTextMotionPostAdoptionSourceAudit/v1" && textMotionPostAdoptionSource.status === "PASS_WITH_TYPOGRAPHY_REVIEW_RISKS" && textMotionPostAdoptionSource.visualMasterId === expected.visualMasterId && textMotionPostAdoptionSource.sourcePropsContainsAdoptedMotion === true && textMotionPostAdoptionSource.sourcePropsBoundToArtworkAdoption === true && textMotionPostAdoptionSource.currentReviewMp4BoundToSource === true && textMotionPostAdoptionSource.refreshCurrent540pMp4Allowed === false && textMotionPostAdoptionSource.fullMp4RenderAllowed === false && textMotionPostAdoptionSource.finalRenderAllowed === false && textMotionPostAdoptionSource.resolveExportAllowed === false, {contract: textMotionPostAdoptionSource.contract, status: textMotionPostAdoptionSource.status, summary: textMotionPostAdoptionSource.summary || "missing", sourcePropsContainsAdoptedMotion: textMotionPostAdoptionSource.sourcePropsContainsAdoptedMotion, sourcePropsBoundToArtworkAdoption: textMotionPostAdoptionSource.sourcePropsBoundToArtworkAdoption, currentReviewMp4BoundToSource: textMotionPostAdoptionSource.currentReviewMp4BoundToSource});
check("text-motion-post-adoption-source-public-identical", fs.existsSync(paths.textMotionPostAdoptionSource) && fs.existsSync(paths.textMotionPostAdoptionSourcePublic) && sha256(paths.textMotionPostAdoptionSource) === sha256(paths.textMotionPostAdoptionSourcePublic), {artifact: fs.existsSync(paths.textMotionPostAdoptionSource) ? sha256(paths.textMotionPostAdoptionSource) : null, public: fs.existsSync(paths.textMotionPostAdoptionSourcePublic) ? sha256(paths.textMotionPostAdoptionSourcePublic) : null});
check("text-motion-post-adoption-source-summary", textMotionPostAdoptionSource.summary?.afterMaxMotionSignatureRun === textMotionPostAdoptionSource.summary?.projectedMaxMotionSignatureRun && textMotionPostAdoptionSource.summary?.afterMaxMotionSignatureRun <= textMotionPostAdoptionSource.summary?.targetMaxMotionSignatureRun && textMotionPostAdoptionSource.summary?.afterDominantMotionSignatureCount === textMotionPostAdoptionSource.summary?.projectedDominantMotionSignatureCount && textMotionPostAdoptionSource.summary?.blockerCount === 0 && textMotionPostAdoptionSource.summary?.motionRiskCount === 0 && textMotionPostAdoptionSource.summary?.typographyRiskCount >= 0 && Array.isArray(textMotionPostAdoptionSource.failures) && textMotionPostAdoptionSource.failures.length === 0, textMotionPostAdoptionSource.summary || "missing");

check("review-queue-pass", reviewQueue.contract === "A1HSeries47SceneReviewQueue/v1" && reviewQueue.status === "PASS" && reviewQueue.summary?.blockerItemCount === 0, {contract: reviewQueue.contract, status: reviewQueue.status, summary: reviewQueue.summary});
check("review-queue-public-identical", fs.existsSync(paths.reviewQueue) && fs.existsSync(paths.reviewQueuePublic) && sha256(paths.reviewQueue) === sha256(paths.reviewQueuePublic), {artifact: fs.existsSync(paths.reviewQueue) ? sha256(paths.reviewQueue) : null, public: fs.existsSync(paths.reviewQueuePublic) ? sha256(paths.reviewQueuePublic) : null});
check("review-queue-scene-count", reviewQueue.summary?.sceneCount === 47 && reviewQueue.summary?.reviewItemCount >= 0 && reviewQueue.summary?.topReviewItemCount >= 0, reviewQueue.summary || "missing");
const reviewQueueContactSheetFile = reviewQueue.contactSheet?.publicUrl ? path.join(publicRoot, reviewQueue.contactSheet.publicUrl.replace(/^\//u, "")) : "";
check("review-queue-contact-sheet-exists", Boolean(reviewQueueContactSheetFile && fs.existsSync(reviewQueueContactSheetFile)), reviewQueueContactSheetFile || "missing");
if (reviewQueueContactSheetFile && fs.existsSync(reviewQueueContactSheetFile)) check("review-queue-contact-sheet-sha-matches", sha256(reviewQueueContactSheetFile) === reviewQueue.contactSheet.sha256, {actual: sha256(reviewQueueContactSheetFile), queue: reviewQueue.contactSheet.sha256});

check("inherited-baseline-pass", inheritedBaseline.status === "PASS"
  && inheritedBaseline.propsCheck?.sceneCount === rendererSourceProps.scenes?.length
  && (inheritedBaseline.propsCheck?.sourceShotCount === null || inheritedBaseline.propsCheck?.sourceShotCount === rendererSourceProps.scenes?.length)
  && inheritedBaseline.propsCheck?.noFixedSceneCountAssumption === true
  && Array.isArray(inheritedBaseline.propsCheck?.reviewBeatIds)
  && inheritedBaseline.propsCheck.reviewBeatIds.length > 0
  && inheritedBaseline.propsCheck.reviewBeatIds.every((beatId) => rendererSourceProps.scenes?.some((scene) => scene.beatId === beatId)), inheritedBaseline.propsCheck || "missing");
check("visual-master-contract-pass", visualMasterContract.status === "PASS", {contract: visualMasterContract.contract, status: visualMasterContract.status, failures: visualMasterContract.failures});
check("visual-master-contract-public-identical", fs.existsSync(paths.visualMasterContract) && fs.existsSync(paths.visualMasterContractPublic) && sha256(paths.visualMasterContract) === sha256(paths.visualMasterContractPublic) && visualMasterContractPublic.status === "PASS", {artifact: fs.existsSync(paths.visualMasterContract) ? sha256(paths.visualMasterContract) : null, public: fs.existsSync(paths.visualMasterContractPublic) ? sha256(paths.visualMasterContractPublic) : null, publicStatus: visualMasterContractPublic.status});
check("canonical-real-article-stress-pass", canonicalRealArticleStress.contract === "A1CanonicalRealArticleStress/v1" && canonicalRealArticleStress.status === "PASS" && canonicalRealArticleStress.fixtureCount === 5 && canonicalRealArticleStress.distinctStructureSignatures >= 3, {contract: canonicalRealArticleStress.contract, status: canonicalRealArticleStress.status, fixtureCount: canonicalRealArticleStress.fixtureCount, distinctStructureSignatures: canonicalRealArticleStress.distinctStructureSignatures});
check("canonical-real-article-stress-public-identical", fs.existsSync(paths.canonicalRealArticleStress) && fs.existsSync(paths.canonicalRealArticleStressPublic) && sha256(paths.canonicalRealArticleStress) === sha256(paths.canonicalRealArticleStressPublic), {artifact: fs.existsSync(paths.canonicalRealArticleStress) ? sha256(paths.canonicalRealArticleStress) : null, public: fs.existsSync(paths.canonicalRealArticleStressPublic) ? sha256(paths.canonicalRealArticleStressPublic) : null});

const genericLogicFiles = [
  paths.canonicalCompiler,
  paths.canonicalVisualDirection,
  paths.layoutEngine,
  paths.motionChoreography,
  paths.visualPackagingCompiler,
];
const hardcodingFindings = [];
for (const file of genericLogicFiles) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\n/u);
  lines.forEach((line, index) => {
    if (/\.length\(\s*(?:11|47)\s*\)/u.test(line) || /\bH(?:0[1-9]|1[01])\b/u.test(line)) {
      hardcodingFindings.push({file: path.relative(root, file), line: index + 1, text: line.trim()});
    }
  });
}
check("generic-logic-has-no-fixed-h-counts", hardcodingFindings.length === 0, hardcodingFindings);
check("canonical-policy-dynamic", fs.existsSync(paths.canonicalCompiler) && /fixedStructureCountsAllowed:\s*z\.literal\(false\)/u.test(fs.readFileSync(paths.canonicalCompiler, "utf8")) && /chapters:\s*z\.array\(.+?\)\.min\(1\)/su.test(fs.readFileSync(paths.canonicalCompiler, "utf8")) && /semanticScenes:\s*z\.array\(.+?\)\.min\(1\)/su.test(fs.readFileSync(paths.canonicalCompiler, "utf8")) && /microEvents:\s*z\.array\(.+?\)\.min\(1\)/su.test(fs.readFileSync(paths.canonicalCompiler, "utf8")), "A1CanonicalFullPlan/v2 must use dynamic arrays and fixedStructureCountsAllowed=false");

const editorialWorkbenchWorkspace = readJson(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json"));
const pageHtml = port4311?.cwd?.startsWith(root) ? curl(`http://127.0.0.1:${expected.frontendPort}/system-line-visual-workbench`) : "";
let reviewApi = null;
if (port4311?.cwd?.startsWith(root)) {
  try {
    reviewApi = JSON.parse(curl(`http://127.0.0.1:${expected.frontendPort}/api/system-line/h-series-review`));
  } catch {
    reviewApi = null;
  }
}
const liveCount = (pattern) => pageHtml ? new Set(pageHtml.match(pattern) || []).size : 0;
const directedReviewPageMarkers = [
  "data-a1-authority-reconciliation=\"single-current-review-pointer\"",
  "data-a1-authority-pointer=\"semantic-directed-47\"",
  `data-a1-underlying-build-state=\"${currentFilmManifest.state}\"`,
  "data-a1-rejected-history=\"stage3-50\"",
  "data-a1-semantic-directed-version=\"h-series-semantic-directed-v1\"",
  "data-a1-semantic-mainline=\"ready-for-direct-review\"",
  "data-a1-semantic-mainline-scene-count=\"47\"",
  "data-a1-material-pipeline=\"pass-review-only\"",
  "data-a1-material-bound-count=\"47\"",
  "data-a1-deterministic-rendered-count=\"33\"",
  "data-a1-unique-artwork-count=\"7\"",
  "data-a1-continuity-transition-count=\"46\"",
  "data-a1-chapter-overlap-frames=\"0\"",
  "data-a1-semantic-mainline-video=\"218s-source-audio\"",
  "data-a1-semantic-directed-contact-sheet=\"47-rendered-shots\"",
  "data-a1-typography-direction=\"ready-for-direct-review\"",
  "data-a1-typography-direction-proof-only=\"true\"",
  "data-a1-typography-current-authority-untouched=\"true\"",
  "data-a1-typography-scene-count=\"47\"",
  "data-a1-typography-family-count=\"5\"",
  "data-a1-typography-layout-count=\"6\"",
  "data-a1-typography-proof-still-count=\"12\"",
  "data-a1-typography-direction-contact-sheet=\"12-rendered-stills\"",
  "data-a1-preproduction-director=\"ready-for-review\"",
  "data-a1-preproduction-scene-count=\"47\"",
  "data-a1-preproduction-individually-directed=\"47\"",
  "data-a1-preproduction-anchor-count=\"3\"",
  "data-a1-preproduction-h01-shot-count=\"4\"",
  "data-a1-preproduction-h01-animation-allowed=\"false\"",
  "data-a1-preproduction-h02-shot-count=\"3\"",
  "data-a1-preproduction-h02-animation-allowed=\"false\"",
  "data-a1-preproduction-h03-shot-count=\"3\"",
  "data-a1-preproduction-h03-animation-allowed=\"false\"",
  "data-a1-preproduction-h08-shot-count=\"6\"",
  "data-a1-preproduction-h08-animation-allowed=\"false\"",
  "data-a1-preproduction-remaining-shot-count=\"30\"",
  "data-a1-preproduction-remaining-animation-allowed=\"false\"",
  "data-a1-preproduction-animation-allowed=\"false\"",
  "data-a1-preproduction-full-mp4-allowed=\"false\"",
  "data-a1-preproduction-current-authority-untouched=\"true\"",
  "data-a1-preproduction-anchor-sheet=\"three-integrated-static-anchors\"",
  "data-a1-preproduction-h01-board=\"four-static-shots\"",
  "data-a1-preproduction-h01-contact-sheet=\"four-integrated-stills\"",
  "data-a1-preproduction-h02-board=\"three-static-shots\"",
  "data-a1-preproduction-h02-contact-sheet=\"three-integrated-stills\"",
  "data-a1-preproduction-h03-board=\"three-static-shots\"",
  "data-a1-preproduction-h03-contact-sheet=\"three-integrated-stills\"",
  "data-a1-preproduction-h08-board=\"six-static-shots\"",
  "data-a1-preproduction-h08-contact-sheet=\"six-integrated-stills\"",
  "data-a1-preproduction-remaining-board=\"thirty-static-shots\"",
  "data-a1-preproduction-remaining-macro=\"H04\"",
  "data-a1-preproduction-remaining-macro=\"H05\"",
  "data-a1-preproduction-remaining-macro=\"H06\"",
  "data-a1-preproduction-remaining-macro=\"H07\"",
  "data-a1-preproduction-remaining-macro=\"H09\"",
  "data-a1-preproduction-remaining-macro=\"H10\"",
  "data-a1-preproduction-remaining-macro=\"H11\"",
  "data-a1-preproduction-shot-ledger=\"47-complete-decisions\"",
  "data-a1-preproduction-motion-candidate=\"ready-for-review\"",
  "data-a1-preproduction-motion-candidate-scene-count=\"47\"",
  "data-a1-preproduction-motion-candidate-selected-count=\"12\"",
  "data-a1-preproduction-motion-candidate-all-still-count=",
  "data-a1-preproduction-motion-candidate-current-authority=\"unchanged\"",
  "data-a1-preproduction-motion-candidate-renderer-adoption=\"false\"",
  "data-a1-preproduction-motion-candidate-full-mp4=\"false\"",
  "data-a1-preproduction-motion-candidate-adoption-readiness=",
  "data-a1-preproduction-motion-candidate-video=\"12-shot-36s\"",
  "data-a1-preproduction-motion-candidate-contact-sheet=\"12-shot-moving-proof\"",
  "data-a1-preproduction-motion-candidate-all-stills=\"47-shot-motion-stills\"",
  "data-a1-preproduction-motion-candidate-continuity-pairs=",
  "data-a1-whole-film-director=\"ready-for-user-review\"",
  "data-a1-whole-film-director-edit-shot-count=\"30\"",
  "data-a1-whole-film-director-cue-coverage=\"117\"",
  "data-a1-whole-film-director-first-shot-mode=\"presenter-overlay\"",
  "data-a1-whole-film-director-renderer-adoption=\"false\"",
  "data-a1-whole-film-director-current-visual-status=\"structural-pass-visual-pending\"",
  "先决定整片怎么切",
  "47 镜逐镜设计",
  "不是四套",
  "模板轮换",
  "不再只是粗体",
  "让字承担叙事",
  "先把每一镜",
  "想清楚",
  "从一句改写",
  "仍像你写的",
  "从一句病句",
  "最后只留问题",
  "句子看似通顺",
  "最后只剩废稿",
  "不是六张模板",
  "连续变六次",
  "旧 50 镜 Stage3 表已明确排除",
  "逐镜确认后再进入包装",
];
const currentFilmPageMarkers = [
  `data-a1-current-film-state=\"${currentFilmManifest.state}\"`,
  `data-a1-current-preview-ready=\"${currentFilmManifest.gates?.currentPreview?.pass ? "true" : "false"}\"`,
  "data-a1-release-authority=\"current-film-manifest\"",
  "data-a1-review-decision=\"needs-revision\"",
  "data-a1-adoption-ledger=\"current-build-bound\"",
  "data-a1-candidate-history=\"separate\"",
  "data-a1-version-freeze=\"pass\"",
  "data-a1-revision-scope=\"picture-packaging-with-user-editorial-authority\"",
  "data-a1-candidate-adoption=\"not-adopted\"",
  `data-a1-review-video-authority=\"${currentFilmManifest.gates?.currentPreview?.pass ? "current" : "missing-current-preview"}\"`,
  ...(currentFilmManifest.gates?.currentPreview?.pass ? ["data-a1-review-video=\"current-build-bound-540p\""] : ["不播放旧片"]),
  "data-a1-v2-candidate-current-review-entry=\"false\"",
  "data-a1-v2-history-only=\"true\"",
  "data-a1-visual-redirection-preview=\"pass\"",
  "data-a1-visual-redirection-anchors=\"3\"",
  "data-a1-visual-redirection-key-states=\"12\"",
  "data-a1-visual-redirection-video=\"30s-source-audio\"",
  "data-a1-visual-redirection-contact-sheet=\"12-current-vs-redirected\"",
  "data-a1-stage2-full-review=\"pass\"",
  "data-a1-stage2-full-review-scene-count=\"50\"",
  "data-a1-stage2-full-review-targets=\"H03-B04,H06-B01,H10-B03,H11-B01\"",
  "data-a1-stage2-full-review-candidate=\"review-only\"",
  "data-a1-stage2-full-review-adoption=\"blocked\"",
  "data-a1-stage2-full-review-contact-sheet=\"12-frames\"",
  "data-a1-stage2-full-review-contact-sheet-image=\"true\"",
  "data-a1-stage3-full-director=\"pass\"",
  "data-a1-stage3-full-director-scene-count=\"50\"",
  "data-a1-stage3-full-director-rendered-stills=\"50\"",
  "data-a1-stage3-full-director-background-modes=\"6\"",
  "data-a1-stage3-full-director-composition-modes=\"15\"",
  "data-a1-stage3-full-director-signatures=\"41\"",
  "data-a1-stage3-full-director-current-props=\"unchanged\"",
  "data-a1-stage3-full-director-adoption=\"rejected-history\"",
  "data-a1-stage3-full-director-user-approval=\"not-approved\"",
  "data-a1-stage3-full-director-contact-sheet=\"50-frames\"",
  "data-a1-stage3-director-ledger=\"50-shots\"",
  "data-a1-picture-packaging-pilot=\"ready-for-direct-review\"",
  "data-a1-packaging-placement=\"unassigned\"",
  "data-a1-editorial-authority=\"user\"",
  "data-a1-recording-dependency=\"0\"",
  "data-a1-screenshot-dependency=\"0\"",
  "data-a1-main-timeline-mutated=\"false\"",
  "data-a1-picture-packaging-video=\"original-audio-no-recording\"",
  "data-a1-picture-packaging-shot-plan=\"five-fully-designed-shots\"",
  "data-a1-editorial-documentary-reset=\"rejected-scope-history\"",
  "data-a1-editorial-documentary-adoption=\"rejected-scope-error\"",
  "data-a1-whole-film-director=\"ready-for-user-review\"",
  "data-a1-whole-film-director-renderer-adoption=\"false\"",
  "先决定整片怎么切",
  "逐镜确认后再进入包装",
  "历史：稿台纪实方向越权，已撤下",
  "历史：Stage3 逐镜卡片化方案，已否决、未采用",
  "30 秒带原声视觉重定向样片",
  "做过，不等于已经上片",
  currentFilmManifest.state,
];
const legacyReviewPageMarkers = [
  "H-series 全片审片",
  "H-series 全片审片 · v2 候选",
  "当前片源状态：v2 候选替代 v1 作为审片入口",
  "v2 candidate current review entry",
  "data-a1-v2-candidate-current-review-entry=\"true\"",
  "data-a1-v1-rejected-stale-visual=\"true\"",
  "v1 已拒绝",
  "v2 候选 PASS",
  "5镜头升级小片 PASS",
  "当前配图采用结果：5 张已进入这条 218 秒主片",
  "data-a1-generated-artwork-current-adoption=\"true\"",
  "data-a1-generated-artwork-post-adoption-contact-sheet=\"5-of-5-visible\"",
  "历史采用证明：5 镜头 before/after 小片",
  "data-a1-targeted-visual-upgrade-preview=\"historical-adoption-proof\"",
  "data-a1-targeted-visual-upgrade-video=\"before-after\"",
  "data-a1-targeted-visual-upgrade-contact-sheet=\"five-shots\"",
  "H-series 视觉母版基准",
  "视觉审计 PASS",
  "视觉噪音 PASS",
  "审美门禁扩展 PASS",
  "跨文章渲染 PASS",
  "H 基准质量 PASS",
  "实体/动效 PASS",
  "实体帧证明 PASS",
  "MP4 实体抽帧 PASS",
  "Hold 帧视觉导演 PASS",
  "540p 审批包 READY",
  "H09 审片包 PASS",
  "H01-H11 索引 PASS",
  "当前权威 H01-H11 主段索引图",
  "定点修复队列 READY",
  "自动配图决策 PASS",
  "配图执行包 READY",
  "生成配图待审",
  "生成图视觉审查 PASS",
  "语义蓝审计 PASS",
  "跨文章 H-series 渲染证明",
  "跨文章 H 基准质量",
  "实体证据与动效质量",
  "实体/动效帧证明",
  "MP4 实体抽帧证明",
  "Hold 帧视觉导演",
  "H01-H11 主段索引",
  "diagnostic only",
  "repair queue · not final look",
  "H-series 定点视觉修复队列",
  "H-series 定点视觉修复联系图",
  "H-series 自动配图决策",
  "H-series 自动配图决策联系图",
  "decision only · not generated assets",
  "H-series 配图执行包",
  "H-series 配图执行包联系图",
  "ready for generation · not rendered",
  "H-series 生成配图待审",
  "H-series 生成配图待审联系图",
  "generated · pending visual review",
  "H-series 生成配图视觉审查",
  "H-series 生成配图视觉审查联系图",
  "AUTO_VISUAL_REVIEW_PASS_PENDING_HUMAN_APPROVAL",
  "auto visual pass · pending human approval",
  "H-series 语义蓝审计",
  "H-series 语义蓝审计联系图",
  "PASS_PENDING_HUMAN_APPROVAL",
  "semantic cobalt · no decorative border",
  "构图风险审计 PASS",
  "H-series 构图风险审计",
  "H-series 构图风险审计联系图",
  "focus balance · safe field",
  "文字动效审计 PASS",
  "H-series 文字动效质量审计",
  "H-series 文字动效质量联系图",
  "type motion · curve risk",
  "动效长跑修复计划 READY",
  "H-series 动效长跑定点修复计划",
  "H-series 动效长跑修复计划联系图",
  "dry-run · motion diversity",
  "动效定点 proof READY",
  "H-series 文字动效定点 proof",
  "H-series 文字动效定点 proof 联系图",
  "proof-only · before/after motion",
  "动效渲染 proof PASS",
  "H-series 文字动效渲染 still proof",
  "rendered stills · projected props",
  "动效小片 proof PASS",
  "H-series 文字动效小片 moving preview",
  "side-by-side MP4 · proof-only",
  "动效采用计划 READY",
  "H-series 文字动效 renderer-source adoption plan",
  "READY_FOR_EXPLICIT_APPROVAL",
  "动效已采用 PASS",
  "H-series 文字动效 renderer-source adoption applied",
  "APPLIED",
  "动效后审计 PASS",
  "H-series 文字动效 post-adoption source audit",
  "PASS_WITH_TYPOGRAPHY_REVIEW_RISKS",
  "H09 archive-stage 审片包",
  "H09 archive-stage 7 帧审片图",
  "540p 审片审批包",
  "逐镜头审片队列",
  "客观视觉审计",
  "not-approved",
  "await-explicit-user-approval-or-targeted-fix-list",
  "data-a1-review-video=\"h-series-540p\"",
  "data-a1-h-series-reference=\"h01-h08-h11-blue-master\"",
  "data-a1-human-review-packet=\"ready\"",
  "data-a1-h09-review-packet=\"pass\"",
  "data-a1-h09-review-video=\"current-h09-540p\"",
  "data-a1-h09-review-contact-sheet=\"seven-hold-frames\"",
  "data-a1-h-series-macro-review-index=\"pass\"",
  "data-a1-h-series-macro-index-contact-sheet=\"h01-h11\"",
  "data-a1-current-authority-h-series=\"visible-before-fix-queue\"",
  "data-a1-targeted-visual-fix-queue=\"ready\"",
  "data-a1-targeted-visual-fix-contact-sheet=\"h-series\"",
  "data-a1-generated-artwork-decision=\"pass\"",
  "data-a1-generated-artwork-decision-contact-sheet=\"h-series\"",
  "data-a1-generated-artwork-execution-plan-contact-sheet=\"h-series\"",
  "data-a1-generated-artwork-result-manifest=\"pending-review\"",
  "data-a1-generated-artwork-result-contact-sheet=\"h-series\"",
  "data-a1-generated-artwork-visual-review=\"pass\"",
  "data-a1-generated-artwork-visual-review-contact-sheet=\"h-series\"",
  "data-a1-generated-artwork-semantic-blue=\"pass\"",
  "data-a1-generated-artwork-semantic-blue-contact-sheet=\"h-series\"",
  "data-a1-generated-artwork-composition-risk=\"pass\"",
  "data-a1-generated-artwork-composition-risk-contact-sheet=\"h-series\"",
  "data-a1-generated-artwork-repair-brief=\"READY_FOR_SHOT_REVIEW\"",
  "data-a1-generated-artwork-repair-brief-count=\"7\"",
  "data-a1-text-motion-quality=\"pass\"",
  "data-a1-text-motion-quality-contact-sheet=\"h-series\"",
  "data-a1-text-motion-diversity-repair-plan=\"ready\"",
  "data-a1-text-motion-diversity-repair-plan-contact-sheet=\"h-series\"",
  "data-a1-text-motion-targeted-proof=\"ready\"",
  "data-a1-text-motion-targeted-proof-contact-sheet=\"h-series\"",
  "data-a1-text-motion-targeted-still-proof=\"pass\"",
  "data-a1-text-motion-targeted-still-proof-contact-sheet=\"h-series\"",
  "data-a1-text-motion-targeted-moving-preview=\"pass\"",
  "data-a1-text-motion-targeted-moving-preview-video=\"h-series\"",
  "data-a1-text-motion-targeted-moving-preview-contact-sheet=\"h-series\"",
  "data-a1-text-motion-renderer-adoption-plan=\"ready\"",
  "data-a1-text-motion-renderer-adoption-applied=\"pass\"",
  "data-a1-text-motion-post-adoption-source=\"pass\"",
  "data-a1-cross-article-h-baseline-quality=\"pass\"",
  "data-a1-entity-evidence-motion-quality=\"pass\"",
  "data-a1-entity-motion-frame-proof=\"pass\"",
  "data-a1-mp4-entity-evidence-visibility=\"pass\"",
  "data-a1-mp4-hold-frame-visual-director=\"pass\"",
  "data-a1-visual-aesthetic-contact-sheet=\"h-series-mp4\"",
  "data-a1-review-queue-contact-sheet=\"h-series-47-scenes\"",
];
const activeReviewPageMarkers = directedReviewIsAuthority ? directedReviewPageMarkers : currentFilmIsAuthority ? currentFilmPageMarkers : legacyReviewPageMarkers;
const currentReviewPhaseMatches = Boolean(pageHtml) && (
  pageHtml.includes("data-a1-current-review-phase=\"whole-film-director-v1\"")
  || pageHtml.includes("data-a1-current-review-phase=\"h-series-semantic-directed-v1\"")
  || pageHtml.includes("data-a1-current-review-phase=\"h-series-preproduction-motion-candidate-v1\"")
);
const currentReviewStageMatches = Boolean(pageHtml) && (
  pageHtml.includes("data-a1-current-stage=\"editorial-asset-library\"")
  || pageHtml.includes("data-a1-current-stage=\"whole-film-edit-plan\"")
  || pageHtml.includes("data-a1-current-stage=\"preproduction-motion-candidate\"")
);
const editorialWorkbenchAuthorityMarkers = [
  'data-a1-editorial-asset-workbench="editorial-asset-workbench-v2"',
  'data-a1-production-contract="A1VisualDirectorProductionState/v1"',
  'data-a1-director-cue-count="117"',
  'data-a1-director-chapter-count="9"',
  'data-a1-director-shot-count="34"',
  'data-a1-shot-demand-count="34"',
  'data-a1-maturity-status="NOT_MATURE"',
  'data-a1-legacy-candidate-baseline="REJECTED_VISUAL_BASELINE"',
  'data-a1-h-series-history="REFERENCE_AND_MASTER_FRAGMENTS_ONLY"',
  "A1 VISUAL DIRECTOR STUDIO",
];
check("http-review-page-markers", Boolean(pageHtml) && editorialWorkbenchAuthorityMarkers.every((marker) => pageHtml.includes(marker)), pageHtml ? {authority: "editorial-asset-workbench-v2", markersScanned: true, markerCount: editorialWorkbenchAuthorityMarkers.length} : "page-unavailable");
const editorialEvidenceKineticSystemPageMarkers = [
  "data-a1-editorial-evidence-kinetic=\"system-review-only\"",
  "data-a1-editorial-evidence-kinetic-status=\"ready-for-direct-visual-review\"",
  "data-a1-editorial-evidence-kinetic-shots=\"8\"",
  "data-a1-editorial-evidence-kinetic-five-layers=\"8\"",
  "data-a1-editorial-evidence-kinetic-current-authority=\"unchanged\"",
  "data-a1-editorial-evidence-kinetic-visual-review=\"pending\"",
  "data-a1-editorial-evidence-kinetic-video=\"full-eight-shot-system-proof\"",
  "data-a1-editorial-evidence-kinetic-layer-inspector=\"background-typography-elements-picture-motion\"",
  "不是三镜模仿",
];
check("http-review-page-editorial-evidence-kinetic-system", Boolean(pageHtml)
  && pageHtml.includes('data-a1-h-series-history="REFERENCE_AND_MASTER_FRAGMENTS_ONLY"')
  && pageHtml.includes('data-a1-workspace-nav="A1VisualDirectorStudio/v2"')
  && pageHtml.includes('data-a1-director-timeline="A1WholeFilmTimeline/v1"'), pageHtml ? {authority: "new-workbench", legacyEvidence: "contract-retained-read-only", primarySurface: "five-workspace-director-timeline"} : "page-unavailable");
const liveGenerationAllowed = pageHtml?.match(/data-a1-generation-allowed="(true|false)"/u)?.[1] || null;
check("http-review-artwork-generation-gate", Boolean(pageHtml)
  && Boolean(liveGenerationAllowed)
  && pageHtml.includes('data-a1-generation-auto-dispatch="false"')
  && pageHtml.includes('data-a1-generation-queued="0"')
  && pageHtml.includes('data-a1-production-queue="A1AssetGenerationQueue/v2"')
  && pageHtml.includes("CONCURRENCY 2"), pageHtml ? {generationAllowed: liveGenerationAllowed, automaticDispatchAllowed: false, queued: 0, queueContract: "A1AssetGenerationQueue/v2", concurrency: 2} : "page-unavailable");
const candidatePropsSha = preproductionMotionCandidate.sourceBinding?.candidateProps?.sha256 || null;
const candidateReportSha = fs.existsSync(paths.preproductionMotionCandidatePublic) ? sha256(paths.preproductionMotionCandidatePublic) : null;
const liveReviewSurface = {
  shotControls: liveCount(/data-a1-shot-review-control="H\d{2}-B\d{2}"/gu),
  shotRows: liveCount(/data-a1-preproduction-motion-candidate-review-row="H\d{2}-B\d{2}"/gu),
  candidateStills: liveCount(/h-series-preproduction-motion-candidate-v1\/stills\/H\d{2}-B\d{2}\.png/gu),
  focusExplanations: liveCount(/data-a1-review-focus="H\d{2}-B\d{2}"/gu),
  motionBindings: liveCount(/data-a1-review-motion-binding="H\d{2}-B\d{2}"/gu),
  motionProofMappings: liveCount(/data-a1-review-motion-proof="H\d{2}-B\d{2}"/gu),
  semanticBases: liveCount(/data-a1-review-semantic-basis="H\d{2}-B\d{2}"/gu),
};
check("http-review-surface-47-shot", Boolean(pageHtml) && pageHtml.includes('data-a1-director-shot-count="34"') && pageHtml.includes('data-a1-shot-demand-count="34"') && pageHtml.includes('data-a1-accepted-shot-ir-allowed="false"'), {currentAuthorityShotCount: 34, legacyH47ReadOnly: true, acceptedShotIrAllowed: false});
check("http-review-api-current-candidate-binding", reviewApi?.ok === true
  && reviewApi.ledger?.candidatePropsSha256 === candidatePropsSha
  && reviewApi.ledger?.candidateReportSha256 === candidateReportSha
  && reviewApi.ledger?.summary?.candidateCount === 47
  // The API is a live review ledger: it may be untouched, partially reviewed,
  // or fully reviewed with explicit revise decisions. Bind to the current
  // candidate without assuming the initial 47-pending state.
  && Number(reviewApi.ledger?.summary?.pendingCount || 0) + Number(reviewApi.ledger?.summary?.reviewedCount || 0) === 47
  && reviewApi.adoptionApproval?.status === "PENDING_USER_VISUAL_REVIEW"
  && reviewApi.adoptionApproval?.rendererAdoptionAllowed === false
  && reviewApi.adoptionApproval?.finalRenderAllowed === false, {
  apiOk: reviewApi?.ok,
  apiCandidatePropsSha256: reviewApi?.ledger?.candidatePropsSha256,
  candidatePropsSha,
  apiCandidateReportSha256: reviewApi?.ledger?.candidateReportSha256,
  candidateReportSha,
  summary: reviewApi?.ledger?.summary,
  reviewStateBound: Number(reviewApi?.ledger?.summary?.pendingCount || 0) + Number(reviewApi?.ledger?.summary?.reviewedCount || 0) === 47,
  adoptionStatus: reviewApi?.adoptionApproval?.status,
});

const storyboardPageHtml = port4311?.cwd?.startsWith(root) ? curl(`http://127.0.0.1:${expected.frontendPort}/storyboard`) : "";
const storyboardGateMarkers = directedReviewIsAuthority ? [
  "分镜表",
  "47",
  "data-a1-storyboard-first-render-gate=\"ACTIVE_PENDING_STORYBOARD_APPROVAL\"",
  "data-a1-full-mp4-render-allowed=\"false\"",
  "data-a1-storyboard-approval-current=\"false\"",
  "storyboard-approval.json",
] : currentFilmIsAuthority ? [
  "data-a1-storyboard-first-render-gate=\"ACTIVE_PENDING_STORYBOARD_APPROVAL\"",
  "data-a1-full-mp4-render-allowed=\"false\"",
  "data-a1-storyboard-approval-current=\"false\"",
  `data-a1-current-film-state=\"${currentFilmManifest.state}\"`,
  `data-a1-current-preview-ready=\"${currentFilmManifest.gates?.currentPreview?.pass ? "true" : "false"}\"`,
  "storyboard-approval.json",
] : [
  "分镜表",
  "47",
  "Storyboard Draft",
  "data-a1-storyboard-first-render-gate=",
  "data-a1-full-mp4-render-allowed=\"false\"",
  "data-a1-storyboard-approval-current=\"false\"",
  "storyboard-approval.json",
  "没有当前 hash 的 storyboard-approval.json，不允许刷新完整 540p 审片",
];
check("http-storyboard-first-render-gate-markers", Boolean(storyboardPageHtml) && storyboardGateMarkers.every((marker) => storyboardPageHtml.includes(marker)), storyboardPageHtml ? {authority: directedReviewIsAuthority ? "semantic-directed-review" : currentFilmIsAuthority ? "current-film-manifest" : "legacy-storyboard", markersScanned: true} : "page-unavailable");

const videoHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${v2CandidateManifest.video?.url || ""}`]) : "";
const targetedVisualUpgradeVideoHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${targetedVisualUpgradePreview.media?.video?.publicUrl || ""}`]) : "";
const targetedVisualUpgradeContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${targetedVisualUpgradePreview.media?.contactSheet?.publicUrl || ""}`]) : "";
const visualContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${visualAudit.contactSheet?.publicUrl || ""}`]) : "";
const reviewQueueContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${reviewQueue.contactSheet?.publicUrl || ""}`]) : "";
const entityMotionContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${entityMotionFrameProof.contactSheet?.publicUrl || ""}`]) : "";
const mp4EntityContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${mp4EntityEvidenceVisibility.contactSheet?.publicUrl || ""}`]) : "";
const mp4HoldContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${mp4HoldFrameVisualDirector.contactSheet?.publicUrl || ""}`]) : "";
const h09ContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${h09ReviewPacket.primaryReviewTarget?.contactSheetUrl || ""}`]) : "";
const h09ClipHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${h09ReviewPacket.primaryReviewTarget?.clipUrl || ""}`]) : "";
const hSeriesMacroIndexContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${hSeriesMacroReviewIndex.contactSheet?.publicUrl || ""}`]) : "";
const targetedVisualFixQueueContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${targetedVisualFixQueue.contactSheet?.publicUrl || ""}`]) : "";
const generatedArtworkDecisionContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${generatedArtworkDecision.contactSheet?.publicUrl || ""}`]) : "";
const generatedArtworkExecutionContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${generatedArtworkExecutionPlan.contactSheet?.publicUrl || ""}`]) : "";
const generatedArtworkResultContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${generatedArtworkResultManifest.contactSheet?.publicUrl || ""}`]) : "";
const generatedArtworkVisualReviewContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${generatedArtworkVisualReview.contactSheet?.publicUrl || ""}`]) : "";
const generatedArtworkSemanticBlueContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${generatedArtworkSemanticBlue.contactSheet?.publicUrl || ""}`]) : "";
const generatedArtworkCompositionRiskContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${generatedArtworkCompositionRisk.contactSheet?.publicUrl || ""}`]) : "";
const generatedArtworkPostAdoptionContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${generatedArtworkPostAdoption.contactSheet?.publicUrl || ""}`]) : "";
const textMotionQualityContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${textMotionQuality.contactSheet?.publicUrl || ""}`]) : "";
const textMotionDiversityRepairPlanContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${textMotionDiversityRepairPlan.contactSheet?.publicUrl || ""}`]) : "";
const textMotionTargetedProofContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${textMotionTargetedProof.contactSheet?.publicUrl || ""}`]) : "";
const textMotionTargetedStillProofContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${textMotionTargetedStillProof.contactSheet?.publicUrl || ""}`]) : "";
const textMotionTargetedMovingPreviewVideoHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${textMotionTargetedMovingPreview.videos?.comparison?.publicUrl || ""}`]) : "";
const textMotionTargetedMovingPreviewContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${textMotionTargetedMovingPreview.contactSheet?.publicUrl || ""}`]) : "";
const textMotionRendererAdoptionCandidateHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${textMotionRendererAdoptionPlan.candidateProps?.publicUrl || ""}`]) : "";
const textMotionRendererAdoptionPatchOpsHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${textMotionRendererAdoptionPlan.patchOps?.publicUrl || ""}`]) : "";
const editorialEvidenceKineticSystemVideoHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${editorialEvidenceKineticSystem.pilot?.video?.publicUrl || ""}`]) : "";
const editorialEvidenceKineticSystemContactHead = port4311?.cwd?.startsWith(root) ? run("curl", ["-fsSI", "--max-time", "8", `http://127.0.0.1:${expected.frontendPort}${editorialEvidenceKineticSystem.pilot?.contactSheet?.publicUrl || ""}`]) : "";
check("http-video-200", /^HTTP\/\S+\s+200\b/mu.test(videoHead), videoHead || "missing");
check("http-targeted-visual-upgrade-video-200", /^HTTP\/\S+\s+200\b/mu.test(targetedVisualUpgradeVideoHead), targetedVisualUpgradeVideoHead || "missing");
check("http-targeted-visual-upgrade-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(targetedVisualUpgradeContactHead), targetedVisualUpgradeContactHead || "missing");
check("http-visual-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(visualContactHead), visualContactHead || "missing");
check("http-review-queue-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(reviewQueueContactHead), reviewQueueContactHead || "missing");
check("http-entity-motion-frame-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(entityMotionContactHead), entityMotionContactHead || "missing");
check("http-mp4-entity-evidence-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(mp4EntityContactHead), mp4EntityContactHead || "missing");
check("http-mp4-hold-frame-visual-director-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(mp4HoldContactHead), mp4HoldContactHead || "missing");
check("http-h09-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(h09ContactHead), h09ContactHead || "missing");
check("http-h09-clip-200", /^HTTP\/\S+\s+200\b/mu.test(h09ClipHead), h09ClipHead || "missing");
check("http-h-series-macro-index-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(hSeriesMacroIndexContactHead), hSeriesMacroIndexContactHead || "missing");
check("http-targeted-visual-fix-queue-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(targetedVisualFixQueueContactHead), targetedVisualFixQueueContactHead || "missing");
check("http-generated-artwork-decision-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(generatedArtworkDecisionContactHead), generatedArtworkDecisionContactHead || "missing");
check("http-generated-artwork-execution-plan-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(generatedArtworkExecutionContactHead), generatedArtworkExecutionContactHead || "missing");
check("http-generated-artwork-result-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(generatedArtworkResultContactHead), generatedArtworkResultContactHead || "missing");
check("http-generated-artwork-visual-review-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(generatedArtworkVisualReviewContactHead), generatedArtworkVisualReviewContactHead || "missing");
check("http-generated-artwork-semantic-blue-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(generatedArtworkSemanticBlueContactHead), generatedArtworkSemanticBlueContactHead || "missing");
check("http-generated-artwork-composition-risk-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(generatedArtworkCompositionRiskContactHead), generatedArtworkCompositionRiskContactHead || "missing");
check("http-generated-artwork-post-adoption-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(generatedArtworkPostAdoptionContactHead), generatedArtworkPostAdoptionContactHead || "missing");
check("http-text-motion-quality-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(textMotionQualityContactHead), textMotionQualityContactHead || "missing");
check("http-text-motion-diversity-repair-plan-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(textMotionDiversityRepairPlanContactHead), textMotionDiversityRepairPlanContactHead || "missing");
check("http-text-motion-targeted-proof-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(textMotionTargetedProofContactHead), textMotionTargetedProofContactHead || "missing");
check("http-text-motion-targeted-still-proof-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(textMotionTargetedStillProofContactHead), textMotionTargetedStillProofContactHead || "missing");
check("http-text-motion-targeted-moving-preview-video-200", /^HTTP\/\S+\s+200\b/mu.test(textMotionTargetedMovingPreviewVideoHead), textMotionTargetedMovingPreviewVideoHead || "missing");
check("http-text-motion-targeted-moving-preview-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(textMotionTargetedMovingPreviewContactHead), textMotionTargetedMovingPreviewContactHead || "missing");
check("http-text-motion-renderer-adoption-candidate-props-200", /^HTTP\/\S+\s+200\b/mu.test(textMotionRendererAdoptionCandidateHead), textMotionRendererAdoptionCandidateHead || "missing");
check("http-text-motion-renderer-adoption-patch-ops-200", /^HTTP\/\S+\s+200\b/mu.test(textMotionRendererAdoptionPatchOpsHead), textMotionRendererAdoptionPatchOpsHead || "missing");
check("http-editorial-evidence-kinetic-system-video-200", /^HTTP\/\S+\s+200\b/mu.test(editorialEvidenceKineticSystemVideoHead), editorialEvidenceKineticSystemVideoHead || "missing");
check("http-editorial-evidence-kinetic-system-contact-sheet-200", /^HTTP\/\S+\s+200\b/mu.test(editorialEvidenceKineticSystemContactHead), editorialEvidenceKineticSystemContactHead || "missing");

const failures = checks.filter((item) => item.status !== "PASS");
const report = {
  contract: "A1SystemLineClosedLoopAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  expected,
  observed: {
    root,
    topLevel,
    branch,
    port4311,
    port4310,
    phaseId: phase.phaseId,
    currentAuthorityAudit: {
      status: currentAuthorityAudit.status || null,
      candidateReportSha256: currentAuthorityAudit.authority?.candidateReportSha256 || null,
      candidatePropsSha256: currentAuthorityAudit.authority?.candidatePropsSha256 || null,
      excludedLegacyCount: currentAuthorityAudit.summary?.excludedLegacyCount || 0,
      currentVisualFixTargetCount: currentAuthorityAudit.summary?.visualFixTargetCount || 0,
      currentGeneratedArtworkPendingCount: currentAuthorityAudit.summary?.generatedArtworkPendingVisualReviewCount || 0,
    },
    manifestVideoSha256: manifest.video?.sha256 || null,
    visualAuditStatus: visualAudit.status || null,
    reviewQueueSummary: reviewQueue.summary || null,
    legacyTargetedVisualFixQueueSummary: targetedVisualFixQueue.summary || null,
    legacyGeneratedArtworkDecisionSummary: generatedArtworkDecision.summary || null,
    generatedArtworkExecutionPlanSummary: generatedArtworkExecutionPlan.summary || null,
    generatedArtworkResultManifestSummary: generatedArtworkResultManifest.summary || null,
    generatedArtworkVisualReviewSummary: generatedArtworkVisualReview.summary || null,
    generatedArtworkSemanticBlueSummary: generatedArtworkSemanticBlue.summary || null,
    generatedArtworkCompositionRiskSummary: generatedArtworkCompositionRisk.summary || null,
    generatedArtworkPolicySummary: generatedArtworkPolicy.summary || null,
    generatedArtworkAdoptionPlanSummary: generatedArtworkAdoptionPlan.summary || null,
    generatedArtworkAdoptionAppliedSummary: generatedArtworkAdoptionApplied.summary || null,
    generatedArtworkPostAdoptionSummary: generatedArtworkPostAdoption.summary || null,
    textMotionQualitySummary: textMotionQuality.summary || null,
    textMotionDiversityRepairPlanSummary: textMotionDiversityRepairPlan.summary || null,
    textMotionTargetedProofSummary: textMotionTargetedProof.summary || null,
    textMotionTargetedStillProofSummary: textMotionTargetedStillProof.summary || null,
    textMotionTargetedMovingPreviewSummary: textMotionTargetedMovingPreview.summary || null,
    textMotionRendererAdoptionPlanSummary: textMotionRendererAdoptionPlan.summary || null,
    textMotionRendererAdoptionAppliedSummary: textMotionRendererAdoptionApplied.summary || null,
    textMotionPostAdoptionSourceSummary: textMotionPostAdoptionSource.summary || null,
    preproductionDirectorSummary: preproductionDirector.summary || null,
    editorialEvidenceKineticSystemSummary: editorialEvidenceKineticSystem.summary || null,
    productionSopSummary: productionSopContract.summary || null,
  },
  evidence: {
    currentPhase: path.relative(root, paths.currentPhase),
    currentAuthorityAudit: path.relative(root, paths.currentAuthorityAudit),
    currentAuthorityAuditPublic: path.relative(root, paths.currentAuthorityAuditPublic),
    wholeFilmDirectorPlan: path.relative(root, paths.wholeFilmDirectorPlan),
    wholeFilmDirectorPlanPublic: path.relative(root, paths.wholeFilmDirectorPlanPublic),
    wholeFilmDirectorReport: path.relative(root, paths.wholeFilmDirectorReport),
    wholeFilmDirectorReportPublic: path.relative(root, paths.wholeFilmDirectorReportPublic),
    wholeFilmDirectorAudit: path.relative(root, paths.wholeFilmDirectorAudit),
    wholeFilmDirectorAuditPublic: path.relative(root, paths.wholeFilmDirectorAuditPublic),
    editorialEvidenceKineticSystem: path.relative(root, paths.editorialEvidenceKineticSystem),
    editorialEvidenceKineticSystemPublic: path.relative(root, paths.editorialEvidenceKineticSystemPublic),
    editorialEvidenceKineticSystemAudit: path.relative(root, paths.editorialEvidenceKineticSystemAudit),
    editorialEvidenceKineticSystemAuditPublic: path.relative(root, paths.editorialEvidenceKineticSystemAuditPublic),
    preproductionDirector: path.relative(root, paths.preproductionDirector),
    preproductionDirectorPublic: path.relative(root, paths.preproductionDirectorPublic),
    preproductionPlan: path.relative(root, paths.preproductionPlan),
    preproductionPlanPublic: path.relative(root, paths.preproductionPlanPublic),
    preproductionAnchorContactSheet: path.relative(root, paths.preproductionAnchorContactSheet),
    preproductionH01Renderer: path.relative(root, paths.preproductionH01Renderer),
    preproductionH01ContactSheet: path.relative(root, paths.preproductionH01ContactSheet),
    preproductionH02Renderer: path.relative(root, paths.preproductionH02Renderer),
    preproductionH02ContactSheet: path.relative(root, paths.preproductionH02ContactSheet),
    preproductionH03Renderer: path.relative(root, paths.preproductionH03Renderer),
    preproductionH03ContactSheet: path.relative(root, paths.preproductionH03ContactSheet),
    preproductionH08Renderer: path.relative(root, paths.preproductionH08Renderer),
    preproductionH08ContactSheet: path.relative(root, paths.preproductionH08ContactSheet),
    currentFilmManifest: path.relative(root, paths.currentFilmManifest),
    manifest: path.relative(root, paths.manifest),
    mp4Report: path.relative(root, paths.mp4Report),
    visualAudit: path.relative(root, paths.visualAudit),
    visualAuditPublic: path.relative(root, paths.visualAuditPublic),
    visualNoise: path.relative(root, paths.visualNoise),
    visualNoisePublic: path.relative(root, paths.visualNoisePublic),
    aestheticGateExpansion: path.relative(root, paths.aestheticGateExpansion),
    aestheticGateExpansionPublic: path.relative(root, paths.aestheticGateExpansionPublic),
    crossArticleRenderProof: path.relative(root, paths.crossArticleRenderProof),
    crossArticleRenderProofPublic: path.relative(root, paths.crossArticleRenderProofPublic),
    crossArticleHBaselineQuality: path.relative(root, paths.crossArticleHBaselineQuality),
    crossArticleHBaselineQualityPublic: path.relative(root, paths.crossArticleHBaselineQualityPublic),
    entityEvidenceMotionQuality: path.relative(root, paths.entityEvidenceMotionQuality),
    entityEvidenceMotionQualityPublic: path.relative(root, paths.entityEvidenceMotionQualityPublic),
    entityMotionFrameProof: path.relative(root, paths.entityMotionFrameProof),
    entityMotionFrameProofPublic: path.relative(root, paths.entityMotionFrameProofPublic),
    mp4EntityEvidenceVisibility: path.relative(root, paths.mp4EntityEvidenceVisibility),
    mp4EntityEvidenceVisibilityPublic: path.relative(root, paths.mp4EntityEvidenceVisibilityPublic),
    mp4HoldFrameVisualDirector: path.relative(root, paths.mp4HoldFrameVisualDirector),
    mp4HoldFrameVisualDirectorPublic: path.relative(root, paths.mp4HoldFrameVisualDirectorPublic),
    humanReviewPacket: path.relative(root, paths.humanReviewPacket),
    humanReviewPacketPublic: path.relative(root, paths.humanReviewPacketPublic),
    h09ReviewPacket: path.relative(root, paths.h09ReviewPacket),
    h09ReviewPacketPublic: path.relative(root, paths.h09ReviewPacketPublic),
    hSeriesMacroReviewIndex: path.relative(root, paths.hSeriesMacroReviewIndex),
    hSeriesMacroReviewIndexPublic: path.relative(root, paths.hSeriesMacroReviewIndexPublic),
    legacyTargetedVisualFixQueue: path.relative(root, paths.targetedVisualFixQueue),
    legacyTargetedVisualFixQueuePublic: path.relative(root, paths.targetedVisualFixQueuePublic),
    legacyGeneratedArtworkDecision: path.relative(root, paths.generatedArtworkDecision),
    legacyGeneratedArtworkDecisionPublic: path.relative(root, paths.generatedArtworkDecisionPublic),
    generatedArtworkExecutionPlan: path.relative(root, paths.generatedArtworkExecutionPlan),
    generatedArtworkExecutionPlanPublic: path.relative(root, paths.generatedArtworkExecutionPlanPublic),
    generatedArtworkResultManifest: path.relative(root, paths.generatedArtworkResultManifest),
    generatedArtworkResultManifestPublic: path.relative(root, paths.generatedArtworkResultManifestPublic),
    generatedArtworkVisualReview: path.relative(root, paths.generatedArtworkVisualReview),
    generatedArtworkVisualReviewPublic: path.relative(root, paths.generatedArtworkVisualReviewPublic),
    generatedArtworkSemanticBlue: path.relative(root, paths.generatedArtworkSemanticBlue),
    generatedArtworkSemanticBluePublic: path.relative(root, paths.generatedArtworkSemanticBluePublic),
    generatedArtworkCompositionRisk: path.relative(root, paths.generatedArtworkCompositionRisk),
    generatedArtworkCompositionRiskPublic: path.relative(root, paths.generatedArtworkCompositionRiskPublic),
    generatedArtworkPolicy: path.relative(root, paths.generatedArtworkPolicy),
    generatedArtworkPolicyPublic: path.relative(root, paths.generatedArtworkPolicyPublic),
    generatedArtworkAdoptionPlan: path.relative(root, paths.generatedArtworkAdoptionPlan),
    generatedArtworkAdoptionPlanPublic: path.relative(root, paths.generatedArtworkAdoptionPlanPublic),
    generatedArtworkAdoptionApplied: path.relative(root, paths.generatedArtworkAdoptionApplied),
    generatedArtworkAdoptionAppliedPublic: path.relative(root, paths.generatedArtworkAdoptionAppliedPublic),
    generatedArtworkPostAdoption: path.relative(root, paths.generatedArtworkPostAdoption),
    generatedArtworkPostAdoptionPublic: path.relative(root, paths.generatedArtworkPostAdoptionPublic),
    textMotionQuality: path.relative(root, paths.textMotionQuality),
    textMotionQualityPublic: path.relative(root, paths.textMotionQualityPublic),
    textMotionDiversityRepairPlan: path.relative(root, paths.textMotionDiversityRepairPlan),
    textMotionDiversityRepairPlanPublic: path.relative(root, paths.textMotionDiversityRepairPlanPublic),
    textMotionTargetedProof: path.relative(root, paths.textMotionTargetedProof),
    textMotionTargetedProofPublic: path.relative(root, paths.textMotionTargetedProofPublic),
    textMotionTargetedStillProof: path.relative(root, paths.textMotionTargetedStillProof),
    textMotionTargetedStillProofPublic: path.relative(root, paths.textMotionTargetedStillProofPublic),
    textMotionTargetedMovingPreview: path.relative(root, paths.textMotionTargetedMovingPreview),
    textMotionTargetedMovingPreviewPublic: path.relative(root, paths.textMotionTargetedMovingPreviewPublic),
    textMotionRendererAdoptionPlan: path.relative(root, paths.textMotionRendererAdoptionPlan),
    textMotionRendererAdoptionPlanPublic: path.relative(root, paths.textMotionRendererAdoptionPlanPublic),
    textMotionRendererAdoptionApplied: path.relative(root, paths.textMotionRendererAdoptionApplied),
    textMotionRendererAdoptionAppliedPublic: path.relative(root, paths.textMotionRendererAdoptionAppliedPublic),
    textMotionPostAdoptionSource: path.relative(root, paths.textMotionPostAdoptionSource),
    textMotionPostAdoptionSourcePublic: path.relative(root, paths.textMotionPostAdoptionSourcePublic),
    rendererSourceProps: path.relative(root, paths.rendererSourceProps),
    storyboardManifest: path.relative(root, paths.storyboardManifest),
    storyboardProps: path.relative(root, paths.storyboardProps),
    storyboardFirstRenderGate: path.relative(root, paths.storyboardFirstRenderGate),
    storyboardFirstRenderGatePublic: path.relative(root, paths.storyboardFirstRenderGatePublic),
    productionSopContract: path.relative(root, paths.productionSopContract),
    productionSopContractPublic: path.relative(root, paths.productionSopContractPublic),
    productionSopReport: path.relative(root, paths.productionSopReport),
    productionSopReportPublic: path.relative(root, paths.productionSopReportPublic),
    reviewQueue: path.relative(root, paths.reviewQueue),
    reviewQueuePublic: path.relative(root, paths.reviewQueuePublic),
    canonicalRealArticleStress: path.relative(root, paths.canonicalRealArticleStress),
    canonicalRealArticleStressPublic: path.relative(root, paths.canonicalRealArticleStressPublic),
    inheritedBaseline: path.relative(root, paths.inheritedBaseline),
    visualMasterContract: path.relative(root, paths.visualMasterContract),
    visualMasterContractPublic: path.relative(root, paths.visualMasterContractPublic),
    reviewUrl: `http://127.0.0.1:${expected.frontendPort}/system-line-visual-workbench`,
    storyboardUrl: `http://127.0.0.1:${expected.frontendPort}/storyboard`,
  },
  dynamicCompilerGuard: {
    scannedFiles: genericLogicFiles.map((file) => path.relative(root, file)),
    hardcodingFindings,
  },
  checks,
  failures,
  nextAction: failures.length ? "repair-closed-loop-failures-before-continuing" : editorialWorkbenchWorkspace?.production?.nextAction || wholeFilmDirectorPlan.nextAction || expected.preproductionNextAction,
};

fs.mkdirSync(reportRoot, {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.mkdirSync(publicReportRoot, {recursive: true});
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  status: report.status,
  failures: failures.map((failure) => failure.id),
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  nextAction: report.nextAction,
}, null, 2));

if (failures.length) process.exitCode = 2;
