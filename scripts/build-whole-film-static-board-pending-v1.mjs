#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {fullLookMasterActualPixelAdmission} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildCanonicalStaticBoardScope, currentEd10StaticBoardSelection, projectCanonicalStaticBoardWorkspace} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {buildWholeFilmStaticBoardApprovalSeed, hashWholeFilmStaticBoardApprovalSeed} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {buildStoryboardPixelConsistencyAudit} from "../apps/studio-next/src/lib/a1-storyboard-pixel-consistency-v1.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const WHOLE_FILM_STATIC_BOARD_PENDING_ACTION = "build-whole-film-static-board-pending-v1";
export const WHOLE_FILM_STATIC_BOARD_PENDING_CONTRACT = "A1WholeFilmStaticBoardPendingUserApprovalBuild/v1";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const boardDir = "whole-film-static-board-v1";
const packageBoardUrl = `/generated/system-line/editorial-asset-workbench-v1/${boardDir}/whole-film-package-board.png`;
const timelineBoardUrl = `/generated/system-line/editorial-asset-workbench-v1/${boardDir}/whole-film-timeline-board.png`;
const boardManifestPath = `${boardDir}/board-manifest.json`;
const boardReportPath = `${boardDir}/report.json`;
const storyboardConsistencyReportPath = "storyboard-pixel-consistency-v1/report.json";
const presenterReviewManifestPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/presenter-light-overlay-system-v2/manifest.json");
const screenStaticReviewManifestPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/static-review-v1/manifest.json");
const ED15_HOLD_FRAME_URL = "/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-15-hold-frame.jpg";
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => {
  const file = path.resolve(publicRoot, String(url || "").replace(/^\//u, ""));
  if (!String(url || "").startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error(`static-board-public-path-invalid:${url}`);
  return file;
};
const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const shortText = (value, max = 46) => {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const formatTime = (value) => Number.isFinite(Number(value)) ? `${(Number(value) / 1000).toFixed(2)}s` : "time-unregistered";
const formatRange = (range) => range ? `${formatTime(range.startMs)}–${formatTime(range.endMs)}` : "time-unregistered";

export function assertCurrentSemanticCoverageForStaticBoard(workspace) {
  const coverage = workspace?.production?.shotVisualCoveragePlan;
  if (coverage?.semanticTimeline?.status !== "CURRENT" || coverage?.semanticTimeline?.recompileRequired !== false) {
    throw new Error("static-board-pending-current-semantic-coverage-required");
  }
  const staleShotIds = (coverage?.shotPlans || [])
    .filter((item) => item.semanticRecompileRequired === true || item.semanticRevisionStatus !== "CURRENT")
    .map((item) => item.shotId);
  if (staleShotIds.length) throw new Error(`static-board-pending-stale-semantic-shots:${staleShotIds.join(",")}`);
  return true;
}

function sourceRoleFor(decision, shot) {
  if (shot.route === "SCREEN_EVIDENCE") return "REAL_SOURCE";
  if (shot.route === "PRESENTER_BASE") return "PRESENTER_BASE";
  if (shot.route === "PACKAGE_LOOK_MASTER") {
    const owner = decision?.presentationDecision?.informationOwner;
    if (owner === "presenter" || decision?.frameOccupation === "OVERLAY") return "PRESENTER";
    if (owner === "source") return "REAL_SOURCE";
    if (owner === "typography") return "TYPOGRAPHY";
  }
  return "GENERATED_EDITORIAL";
}

function titleRoleFor(decision, plan, shot) {
  if (shot.route !== "PACKAGE_LOOK_MASTER") return "NONE";
  if (decision?.contentTreatment === "HERO_TYPOGRAPHY" && decision?.frameOccupation === "FULL_FRAME_TAKEOVER") return "HERO_TAKEOVER";
  if (decision?.frameOccupation === "OVERLAY" && (decision?.requiredFormalText || []).length) return "PRESENTER_HEADLINE";
  if (decision?.contentTreatment === "EDITORIAL_EXPLAINER") return "EXPLAINER_LABEL";
  return "NONE";
}

const SCREEN_STATE_PRIORITY = ["RESULT", "ACTION", "BEFORE"];

export function preferredScreenStateBinding(shot) {
  if (shot?.route !== "SCREEN_EVIDENCE") return null;
  const bindings = Array.isArray(shot.screenStateBindings) ? shot.screenStateBindings : [];
  for (const role of SCREEN_STATE_PRIORITY) {
    const binding = bindings.find((item) => String(item?.role || "").toUpperCase() === role && item?.publicUrl);
    if (binding) return structuredClone(binding);
  }
  return bindings.find((item) => item?.publicUrl) ? structuredClone(bindings.find((item) => item?.publicUrl)) : null;
}

export function preferredScreenReviewPanel(entry) {
  const panels = Array.isArray(entry?.panels) ? entry.panels : [];
  for (const role of ["RESULT", "FOCUS"]) {
    const panel = panels.find((item) => String(item?.state || "").toUpperCase() === role
      && item?.sourceFrame?.publicUrl
      && item?.sourceFrame?.frameMatchStatus === "PASS");
    if (panel) return structuredClone(panel);
  }
  return null;
}

function screenReviewEntriesFor(workspace) {
  const authority = workspace?.production?.screenEvidenceStaticReview;
  if (authority?.current !== true || authority?.status !== "READY_FOR_STATIC_BOARD_REVIEW" || !authority.manifestSha256) return new Map();
  if (!fs.existsSync(screenStaticReviewManifestPath)) return new Map();
  const manifest = JSON.parse(fs.readFileSync(screenStaticReviewManifestPath, "utf8"));
  if (manifest.contract !== "A1ScreenEvidenceStaticReview/v1"
    || manifest.status !== "READY_FOR_STATIC_BOARD_REVIEW"
    || manifest.manifestSha256 !== authority.manifestSha256) return new Map();
  return new Map((manifest.entries || []).map((entry) => [entry.shotId, entry]));
}

export function sourcePreviewFor(shot, context, brief, screenReviewEntry = null) {
  const decisiveState = preferredScreenStateBinding(shot);
  if (decisiveState) {
    const stateRole = String(decisiveState.role || "STATE").toUpperCase();
    return {
      publicUrl: decisiveState.publicUrl,
      sha256: decisiveState.sha256 || null,
      focus: decisiveState.focus || null,
      selectedStateRole: stateRole,
      provenance: `CURRENT_SCREEN_${stateRole}_FOCUSED`,
    };
  }
  const reviewPanel = shot?.route === "SCREEN_EVIDENCE" ? preferredScreenReviewPanel(screenReviewEntry) : null;
  if (reviewPanel) {
    const sourceFrame = reviewPanel.sourceFrame;
    const focusRegion = sourceFrame.focusRegion || reviewPanel.annotation?.focusRegion || null;
    const stateRole = String(reviewPanel.state || "RESULT").toUpperCase();
    return {
      publicUrl: sourceFrame.publicUrl,
      sha256: sourceFrame.sha256 || null,
      focusNormalized: focusRegion,
      focusDerived: focusRegion?.derived === true || sourceFrame.focus?.derived === true,
      selectedStateRole: stateRole,
      provenance: `CURRENT_SCREEN_REVIEW_${stateRole}_FOCUSED`,
      staticReviewManifestSha256: screenReviewEntry.sourcePlansSha256 || null,
    };
  }
  if (shot.preview?.publicUrl) return {...shot.preview, provenance: shot.preview.kind || "CURRENT_COVERAGE_PREVIEW"};
  if (context?.baseFrame?.publicUrl) return {...context.baseFrame, provenance: "CURRENT_VIDEO_CONTEXT_BASE_FRAME"};
  if (shot.shotId === "ED-15") return {publicUrl: ED15_HOLD_FRAME_URL, sha256: null, provenance: "CURRENT_ED15_REAL_HOLD_FRAME"};
  return null;
}

export function focusCropFor({focus, sourceWidth, sourceHeight, targetWidth, targetHeight, contextScale = 1.12}) {
  if (!focus || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) return null;
  const rawX = Math.max(0, Number(focus.x) || 0);
  const rawY = Math.max(0, Number(focus.y) || 0);
  const rawWidth = Math.min(sourceWidth - rawX, Math.max(1, Number(focus.width) || 1));
  const rawHeight = Math.min(sourceHeight - rawY, Math.max(1, Number(focus.height) || 1));
  if (rawWidth <= 0 || rawHeight <= 0) return null;

  const targetAspect = targetWidth / targetHeight;
  const centerX = rawX + rawWidth / 2;
  const centerY = rawY + rawHeight / 2;
  let cropWidth = Math.min(sourceWidth, rawWidth * contextScale);
  let cropHeight = Math.min(sourceHeight, rawHeight * contextScale);
  if (cropWidth / cropHeight < targetAspect) cropWidth = Math.min(sourceWidth, cropHeight * targetAspect);
  else cropHeight = Math.min(sourceHeight, cropWidth / targetAspect);

  // Re-adjust after clamping so the crop itself keeps the board tile aspect.
  if (cropWidth / cropHeight < targetAspect) cropHeight = cropWidth / targetAspect;
  else cropWidth = cropHeight * targetAspect;
  const width = Math.max(1, Math.min(sourceWidth, Math.round(cropWidth)));
  const height = Math.max(1, Math.min(sourceHeight, Math.round(cropHeight)));
  const left = Math.max(0, Math.min(sourceWidth - width, Math.round(centerX - width / 2)));
  const top = Math.max(0, Math.min(sourceHeight - height, Math.round(centerY - height / 2)));
  return {left, top, width, height};
}

function placeholderSvg(width, height, lines) {
  const safeLines = lines.map((line) => escapeXml(line));
  const text = safeLines.map((line, index) => `<text x="28" y="${54 + index * 30}" fill="${index === 0 ? "#d7f246" : "#c6cfca"}" font-family="Arial, PingFang SC, sans-serif" font-size="${index === 0 ? 24 : 16}" font-weight="${index === 0 ? 700 : 400}">${line}</text>`).join("");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111719"/><path d="M0 ${height - 1}H${width}" stroke="#374247"/><rect x="18" y="18" width="6" height="${height - 36}" fill="#d7f246"/>${text}</svg>`);
}

async function imageBufferFor(preview, width, height, labelLines) {
  if (preview?.publicUrl) {
    const file = publicFile(preview.publicUrl);
    if (fs.existsSync(file)) {
      const source = fs.readFileSync(file);
      const sourceSha256 = sha256(source);
      if (preview.sha256) assert.equal(sourceSha256, preview.sha256, `static-board-preview-sha:${preview.publicUrl}`);
      const metadata = await sharp(source).metadata();
      const normalizedFocus = preview.focusNormalized && metadata.width && metadata.height
        ? {
            x: Number(preview.focusNormalized.x) * metadata.width,
            y: Number(preview.focusNormalized.y) * metadata.height,
            width: Number(preview.focusNormalized.width) * metadata.width,
            height: Number(preview.focusNormalized.height) * metadata.height,
          }
        : null;
      const crop = focusCropFor({focus: preview.focus || normalizedFocus, sourceWidth: metadata.width, sourceHeight: metadata.height, targetWidth: width, targetHeight: height});
      let pipeline = sharp(source);
      if (crop) pipeline = pipeline.extract(crop);
      return {buffer: await pipeline.resize(width, height, {fit: "cover"}).png().toBuffer(), sourceFile: file, sourceSha256, crop, placeholder: false};
    }
  }
  return {buffer: await sharp(placeholderSvg(width, height, labelLines)).png().toBuffer(), sourceFile: null, sourceSha256: null, placeholder: true};
}

async function buildBoard(tiles, {tileWidth, imageHeight, labelHeight, columns, outputWidth}) {
  const tileHeight = imageHeight + labelHeight;
  const rows = Math.ceil(tiles.length / columns);
  const rendered = await Promise.all(tiles.map(async (tile) => {
    const image = await imageBufferFor(tile.preview, tileWidth, imageHeight, tile.placeholderLines || [tile.shotId, tile.route]);
    const lines = tile.labelLines.slice(0, 4);
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0f10"/><rect width="7" height="100%" fill="${tile.packageBoardItem ? "#d7f246" : "#5f87ff"}"/>${lines.map((line, index) => `<text x="20" y="${20 + index * 17}" fill="${index === 0 ? "#f2f5ed" : "#9eaaa4"}" font-family="Arial, PingFang SC, sans-serif" font-size="${index === 0 ? 14 : 10}" font-weight="${index === 0 ? 700 : 400}">${escapeXml(line)}</text>`).join("")}</svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f10"}}).composite([{input: image.buffer, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  }));
  const canvas = sharp({create: {width: outputWidth || columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070a0b"}});
  const output = await canvas.composite(rendered.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png().toBuffer();
  return {buffer: output, width: outputWidth || columns * tileWidth, height: rows * tileHeight, sha256: sha256(output)};
}

export function buildPackageItems(workspace, scope) {
  const production = workspace.production;
  const sequenceByShot = new Map(production.canonicalCreatorPackagingSequence.decisions.map((item) => [item.shotId, item]));
  const planByShot = new Map((production.shotIntelligence.packageLookMasterPlans || []).map((item) => [item.shotId, item]));
  const bindingByShot = new Map((production.creatorPaletteShotBindingManifest.entries || []).map((item) => [item.shotId, item]));
  const rawReferences = production.shotIntelligence.lookMasterRawReferences || [];
  const presenterReviewManifest = fs.existsSync(presenterReviewManifestPath) ? JSON.parse(fs.readFileSync(presenterReviewManifestPath, "utf8")) : null;
  const presenterReviewByShot = presenterReviewManifest?.contract === "A1PresenterLightOverlaySystemCandidate/v2"
    && presenterReviewManifest.status === "AGENT_ACTUAL_PIXEL_REVIEW_PASS_USER_APPROVAL_REQUIRED"
    && presenterReviewManifest.sourceWorkspaceSha256 === workspace.workspaceSha256
    && presenterReviewManifest.productionAdmitted === false
    ? new Map((presenterReviewManifest.packageItems || []).filter((item) => presenterReviewManifest.targetShotIds?.includes(item.shotId)).map((item) => [item.shotId, item]))
    : new Map();
  return scope.requiredPackageBoardShotIds.map((shotId) => {
    const decision = sequenceByShot.get(shotId);
    const plan = planByShot.get(shotId);
    const binding = bindingByShot.get(shotId);
    const presenterReviewCandidate = presenterReviewByShot.get(shotId);
    if (presenterReviewCandidate) {
      const observedText = (presenterReviewCandidate.textNodes || []).map((node) => String(node.text || "").replace(/\s+/gu, "")).join("");
      const requiredText = decision.requiredFormalText || [];
      assert.ok(requiredText.every((phrase) => observedText.includes(String(phrase).replace(/\s+/gu, ""))), `static-board-presenter-review-copy:${shotId}`);
      const candidateFile = publicFile(presenterReviewCandidate.artifactPublicUrl);
      assert.equal(sha256(fs.readFileSync(candidateFile)), presenterReviewCandidate.artifactSha256, `static-board-presenter-review-sha:${shotId}`);
      return {...structuredClone(presenterReviewCandidate), order: decision.order, assemblyMode: decision.assemblyMode, presentationMode: decision.presentationMode, frameOccupation: decision.frameOccupation, planSha256: plan?.planSha256 || presenterReviewCandidate.planSha256 || null, sourceRole: sourceRoleFor(decision, {route: "PACKAGE_LOOK_MASTER"}), titleRole: titleRoleFor(decision, plan, {route: "PACKAGE_LOOK_MASTER"}), selectionSource: "AGENT_REVIEWED_PRESENTER_CANDIDATE_PENDING_WHOLE_FILM_USER_APPROVAL", reviewOnly: true, productionAdmission: false};
    }
    const storyboardPointer = production.shotIntelligence.currentStoryboardAuthority?.shots?.find((item) => item.shotId === shotId && item.current === true && item.authoritativeOverride === true);
    const storyboardPointerHasAudit = storyboardPointer?.artifactPublicUrl
      && storyboardPointer.artifactSha256
      && storyboardPointer.actualPixelAuditSha256
      && storyboardPointer.semanticPixelAuditSha256
      && storyboardPointer.serverVisualAssessmentSha256;
    if (storyboardPointerHasAudit) {
      const incumbent = bindingByShot.get(shotId);
      return {
        ...structuredClone(incumbent || {}),
        shotId,
        order: decision.order,
        presentationMode: storyboardPointer.presentationMode || decision.presentationMode,
        assemblyMode: storyboardPointer.presentationMode === "FULLSCREEN_WORKBENCH_OPENING" ? "FULLSCREEN" : decision.assemblyMode,
        frameOccupation: storyboardPointer.frameOccupation || decision.frameOccupation,
        artifactSha256: storyboardPointer.artifactSha256,
        artifactPublicUrl: storyboardPointer.artifactPublicUrl,
        previewPublicUrl: storyboardPointer.artifactPublicUrl,
        previewSha256: storyboardPointer.artifactSha256,
        candidateId: storyboardPointer.versionId,
        planSha256: plan?.planSha256 || null,
        sourceRole: storyboardPointer.source || sourceRoleFor(decision, {route: "PACKAGE_LOOK_MASTER"}),
        titleRole: storyboardPointer.presentationMode === "FULLSCREEN_WORKBENCH_OPENING" ? "HERO_WORKBENCH" : titleRoleFor(decision, plan, {route: "PACKAGE_LOOK_MASTER"}),
        stateSequence: storyboardPointer.stateSequence || ["BEFORE", "HOLD", "AFTER"],
        styleLineage: {
          ...structuredClone(incumbent?.styleLineage || {}),
          sourceArtifactSha256: storyboardPointer.artifactSha256,
          compositeSha256: storyboardPointer.artifactSha256,
          compositionMethod: "CURRENT_STORYBOARD_AUTHORITY_PROMOTION",
          pixelTreatment: "PRESERVED_STRONG_MASTER",
          pixelRecomposed: false,
          preservedActualPixelReview: false,
          reviewOnly: true,
        },
        diffSummary: "current storyboard authority promotion",
      };
    }
    const selection = plan?.provisionalWholeFilmBoardSelection;
    const ed10Selection = currentEd10StaticBoardSelection(workspace, plan);
    if (ed10Selection) {
      assert.equal(selection?.artifact?.sha256, ed10Selection.artifact.sha256, "static-board-ed10-current-proof-selection");
      return {
        shotId,
        order: decision.order,
        presentationMode: decision.presentationMode,
        assemblyMode: decision.assemblyMode,
        frameOccupation: decision.frameOccupation,
        artifactSha256: ed10Selection.artifact.sha256,
        artifactPublicUrl: ed10Selection.artifact.publicUrl,
        previewPublicUrl: ed10Selection.artifact.publicUrl,
        previewSha256: ed10Selection.artifact.sha256,
        candidateId: ed10Selection.candidateId,
        planSha256: plan.planSha256,
        actualPixelAuditSha256: ed10Selection.actualPixelAuditSha256,
        semanticPixelAuditSha256: ed10Selection.semanticPixelAuditSha256,
        compositeSha256: ed10Selection.artifact.sha256,
        holdFrameSha256: null,
        sourceRole: sourceRoleFor(decision, {route: "PACKAGE_LOOK_MASTER"}),
        titleRole: titleRoleFor(decision, plan, {route: "PACKAGE_LOOK_MASTER"}),
        candidateDifferences: {
          selectedDirectionId: ed10Selection.directionId,
          candidateDirectionIds: [ed10Selection.directionId],
          alternativeDirectionIds: [],
          selectionSource: ed10Selection.selectionSource,
        },
        diffSummary: `${decision.frameOccupation} · approved ED-10 editable typography proof`,
      };
    }
    assert.equal(binding?.status, "PASS", `static-board-binding:${shotId}`);
    assert.equal(binding.actualShotCandidateSha256, selection?.artifact?.sha256, `static-board-selection-binding:${shotId}`);
    const rawCandidates = rawReferences.filter((item) => item.shotId === shotId && item.artifact?.sha256 === selection?.artifact?.sha256);
    const raw = rawCandidates.find((item) => item.current === true && (item.pixelAudit?.status === "PASS" || item.semanticPixelAudit?.status === "PASS"))
      || rawCandidates.find((item) => item.current === true)
      || rawCandidates[0];
    assert.ok(raw, `static-board-raw-missing:${shotId}`);
    const actualPixelAdmission = fullLookMasterActualPixelAdmission(raw);
    const canonicalTitleRepairAdmission = (raw.referencePackagingClassifier === "DETERMINISTIC_CANONICAL_TITLE_REPAIR"
      || raw.productionMethod === "DETERMINISTIC_EDITABLE_GLYPH_OUTLINE_CANONICAL_REPAIR"
      || raw.artifact?.productionMethod === "DETERMINISTIC_EDITABLE_GLYPH_OUTLINE_CANONICAL_REPAIR"
      || raw.classification === "DETERMINISTIC_CANONICAL_TYPOGRAPHY")
      && raw.pixelAudit?.admissionAllowed === true
      && raw.semanticPixelAudit?.status === "PASS"
      && raw.semanticPixelAudit?.recommendationEligible === true;
    assert.equal(actualPixelAdmission.status === "PASS" || canonicalTitleRepairAdmission, true, `static-board-pixel:${shotId}`);
    assert.equal(raw.semanticPixelAudit?.status, "PASS", `static-board-semantic:${shotId}`);
    assert.ok(!raw.candidateAuditAuthority || raw.candidateAuditAuthority.status === "PASS", `static-board-candidate-authority:${shotId}`);
    assert.ok(selection?.artifact?.publicUrl, `static-board-selection-url:${shotId}`);
    const preview = selection.compositePreview?.publicUrl ? {publicUrl: selection.compositePreview.publicUrl, sha256: selection.compositePreview.sha256 || null} : {publicUrl: selection.artifact.publicUrl, sha256: selection.artifact.sha256};
    const directions = plan.activeCandidateSet?.directionIds || (plan.currentCandidateDirections || []).map((item) => item.directionId).filter(Boolean);
    const selectedDirectionId = plan.activeCandidateSet?.selectedDirectionId || selection.directionId || null;
    return {
      shotId,
      order: decision.order,
      presentationMode: decision.presentationMode,
      assemblyMode: decision.assemblyMode,
      frameOccupation: decision.frameOccupation,
      artifactSha256: selection.artifact.sha256,
      artifactPublicUrl: selection.artifact.publicUrl,
      previewPublicUrl: preview.publicUrl,
      previewSha256: preview.sha256,
      candidateId: selection.candidateId,
      planSha256: plan.planSha256,
      actualPixelAuditSha256: binding.actualPixelAuditSha256,
      semanticPixelAuditSha256: binding.semanticPixelAuditSha256,
      compositeSha256: binding.compositeSha256,
      holdFrameSha256: binding.holdFrameSha256,
      sourceRole: sourceRoleFor(decision, {route: "PACKAGE_LOOK_MASTER"}),
      titleRole: titleRoleFor(decision, plan, {route: "PACKAGE_LOOK_MASTER"}),
      candidateDifferences: {
        selectedDirectionId,
        candidateDirectionIds: directions,
        alternativeDirectionIds: directions.filter((id) => id !== selectedDirectionId),
        selectionSource: selection.selectionSource || "CURRENT_RECOMMENDATION",
      },
      diffSummary: `${decision.frameOccupation} · ${directions.length || 1} visual route${directions.length === 1 ? "" : "s"}`,
    };
  });
}

export function buildTimelineItems(workspace, packageItems) {
  const production = workspace.production;
  const coverage = [...(production.shotVisualCoveragePlan.shotPlans || [])].sort((a, b) => Number(a.order) - Number(b.order));
  const packageByShot = new Map(packageItems.map((item) => [item.shotId, item]));
  const contexts = new Map((production.shotIntelligence.videoPackagingContexts?.items || []).map((item) => [item.shotId, item]));
  const briefs = new Map((production.shotIntelligence.semanticDesignBriefSet?.briefs || []).map((item) => [item.shotId, item]));
  const sequence = new Map(production.canonicalCreatorPackagingSequence.decisions.map((item) => [item.shotId, item]));
  const screenReviewEntries = screenReviewEntriesFor(workspace);
  return coverage.map((shot) => {
    const decision = sequence.get(shot.shotId);
    const packaged = packageByShot.get(shot.shotId);
    const context = contexts.get(shot.shotId);
    const brief = briefs.get(shot.shotId);
    const preview = packaged
      ? {publicUrl: packaged.previewPublicUrl, sha256: packaged.previewSha256 || packaged.artifactSha256, provenance: "PACKAGE_RECOMMENDED_ACTUAL_COMPOSITE"}
      : sourcePreviewFor(shot, context, brief, screenReviewEntries.get(shot.shotId));
    const route = packaged ? "PACKAGE_LOOK_MASTER" : shot.route;
    const sourceRole = packaged?.sourceRole || sourceRoleFor(decision, shot);
    const titleRole = packaged?.titleRole || titleRoleFor(decision, null, shot);
    const timeRange = context?.timelineRange || brief?.timeRange || null;
    return {
      shotId: shot.shotId,
      order: shot.order,
      timeRange,
      route,
      routeLabel: packaged ? `${packaged.presentationMode} PACKAGE` : shot.routeLabel || shot.route,
      sourceRole,
      titleRole,
      presentationMode: packaged?.presentationMode || null,
      assemblyMode: packaged?.assemblyMode || null,
      frameOccupation: packaged?.frameOccupation || null,
      currentStoryboardVersionId: packaged?.candidateId || null,
      stateSequence: packaged?.stateSequence || null,
      sourceText: shot.sourceText || decision?.sourceText || brief?.exactCopy?.text || "",
      preview,
      sourcePreview: shot.sourcePreview || null,
      selectedStateRole: preview?.selectedStateRole || null,
      previewFocus: preview?.focus || null,
      previewFocusNormalized: preview?.focusNormalized || null,
      previewFocusDerived: preview?.focusDerived === true,
      presentationRoute: preview?.presentationRoute || null,
      annotationRoute: preview?.annotationRoute || null,
      sourceWindowRoute: preview?.sourceWindowRoute || null,
      staticReviewManifestSha256: preview?.staticReviewManifestSha256 || null,
      reviewOnly: preview?.reviewOnly === true,
      productionAdmission: preview?.productionAdmission === true,
      artifactSha256: packaged?.artifactSha256 || preview?.sha256 || null,
      previewPublicUrl: preview?.publicUrl || null,
      sourcePreviewPublicUrl: shot.sourcePreview?.publicUrl || null,
      sourcePreviewSha256: shot.sourcePreview?.sha256 || null,
      packageBoardItem: Boolean(packaged),
      packageCandidateSha256: packaged?.artifactSha256 || null,
      placeholderLines: [shot.shotId, shot.route || "NO_PACKAGE", shot.routeLabel || "current route"],
      labelLines: [
        `${shot.shotId} · ${formatRange(timeRange)}`,
        `${route} · ${sourceRole} · title:${titleRole}`,
        shortText(shot.sourceText || decision?.sourceText || brief?.exactCopy?.text || "source text unavailable", 56),
        packaged ? `master ${packaged.artifactSha256.slice(0, 12)} · ${packaged.diffSummary}` : (preview?.presentationRoute || preview?.provenance || "NO_PACKAGE_ROUTE"),
      ],
    };
  });
}

function projectCurrentStaticBoardBatch(batch, board, packageItems) {
  const currentFinalizedShotIds = packageItems.map((item) => item.shotId);
  const currentFinalizedShotIdSet = new Set(currentFinalizedShotIds);
  return {
    ...batch,
    status: "WHOLE_FILM_STATIC_BOARD_READY",
    finalizedShotIds: currentFinalizedShotIds,
    outputDeduplication: {
      ...(batch?.outputDeduplication || {}),
      historicalGenerationJobCount: batch?.outputDeduplication?.historicalGenerationJobCount
        ?? batch?.outputDeduplication?.actualJobCount
        ?? 0,
      currentFinalizedShotCount: currentFinalizedShotIds.length,
      currentFinalizedShotIds,
      shortageByShot: (batch?.outputDeduplication?.shortageByShot || [])
        .filter((item) => currentFinalizedShotIdSet.has(item.shotId)),
    },
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    staticBoard: structuredClone(board),
  };
}

function buildCurrentStaticBoardReport(workspace, board, {now}) {
  const runtime = workspace.production.shotIntelligence;
  return {
    contract: "A1WholeFilmStaticBoardFinalizationReport/v1",
    status: "PASS",
    current: true,
    historyReadOnly: false,
    authorityScope: "CURRENT",
    workspaceSha256: workspace.workspaceSha256,
    stage: "WHOLE_FILM_STATIC_BOARD_READY",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    nextAction: "CONFIRM_WHOLE_FILM_STATIC_BOARD",
    userApprovalRequired: true,
    userVisualApproval: "NOT_APPROVED",
    items: structuredClone(board.items || []),
    board: {publicUrl: board.publicUrl, sha256: board.sha256, width: board.width, height: board.height, itemCount: board.itemCount, itemSeedSha256: board.itemSeedSha256},
    timelineBoard: board.timelineBoard ? {publicUrl: board.timelineBoard.publicUrl, sha256: board.timelineBoard.sha256, width: board.timelineBoard.width, height: board.timelineBoard.height, itemCount: board.timelineBoard.itemCount} : null,
    packageCount: board.itemCount,
    noPackageCount: Number(workspace.article?.shotCount || 0) - Number(board.itemCount || 0),
    exceptions: [],
    provisionalSelectionCount: board.itemCount,
    formalAssemblyCount: (runtime.currentAssembly || []).length,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    queue: structuredClone(workspace.production.generation.summary),
    workerStatus: workspace.production.generation.workerStatus,
    generatedAt: board.generatedAt,
    updatedAt: now,
  };
}

export async function buildWholeFilmStaticBoardPending({now = new Date().toISOString()} = {}) {
  const initial = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = initial.production.shotIntelligence;
  if (initial.production.generation.summary.queued !== 0 || initial.production.generation.summary.running !== 0 || initial.production.generation.workerStatus !== "frozen") throw new Error("static-board-pending-requires-frozen-idle-runtime");
  if ((runtime.currentAssembly || []).length || runtime.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("static-board-pending-assembly-lock-required");
  assertCurrentSemanticCoverageForStaticBoard(initial);

  const projected = projectCanonicalStaticBoardWorkspace(initial, {now});
  const priorCanonicalBoardAuthorityPass = initial.production.shotIntelligence.canonicalStaticBoardAuthority?.status === "PASS";
  const scopedEd10RebuildCompatible = priorCanonicalBoardAuthorityPass
    && projected.scope.selectionMissingShotIds.length === 0
    && projected.scope.bindingManifestFailures.length === 0
    && projected.scope.modeCompatibilityFailures.every((failure) => failure.shotId !== "ED-10");
  if (projected.scope.status !== "PASS" && !scopedEd10RebuildCompatible) throw new Error(`static-board-pending-canonical-scope-blocked:${JSON.stringify(projected.scope)}`);
  // Preserve the current board's already-reviewed package evidence as the
  // incumbent. A source-route refresh must not silently rebuild unrelated
  // package shots from a newer but weaker projection. Only the requested
  // screen-evidence timeline rows are replaced by their explicit static
  // review collages below.
  const previousManifestFile = publicFile(`/generated/system-line/editorial-asset-workbench-v1/${boardManifestPath}`);
  const previousManifest = fs.existsSync(previousManifestFile) ? JSON.parse(fs.readFileSync(previousManifestFile, "utf8")) : null;
  const canPreserveIncumbentBoard = Array.isArray(previousManifest?.packageItems)
    && previousManifest.packageItems.length === projected.scope.requiredPackageBoardShotIds.length
    && Array.isArray(previousManifest?.timelineItems)
    && previousManifest.timelineItems.length === Number(projected.workspace.article?.shotCount || 0)
    && previousManifest.workspaceSha256Before === initial.workspaceSha256;
  const currentPackageItems = buildPackageItems(projected.workspace, projected.scope);
  const incumbentByShot = new Map((previousManifest?.packageItems || []).map((item) => [item.shotId, item]));
  const planByShot = new Map((projected.workspace.production.shotIntelligence.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  const packageItems = currentPackageItems.map((current) => {
    const incumbent = incumbentByShot.get(current.shotId);
    if (current.selectionSource === "AGENT_REVIEWED_PRESENTER_CANDIDATE_PENDING_WHOLE_FILM_USER_APPROVAL") return current;
    if (!incumbent?.styleLineage) return current;
    const plan = planByShot.get(current.shotId);
    const ed10Selection = currentEd10StaticBoardSelection(projected.workspace, plan);
    if (ed10Selection) {
      const typographyRoute = projected.workspace.production.ed10LookMasterCandidateAuthority.typographyRoute;
      return {
        ...structuredClone(incumbent),
        ...current,
        artifactSha256: ed10Selection.artifact.sha256,
        artifactPublicUrl: ed10Selection.artifact.publicUrl,
        previewPublicUrl: ed10Selection.artifact.publicUrl,
        previewSha256: ed10Selection.artifact.sha256,
        textNodes: [
          {id: "ed10-exact-copy-lead", text: "完成度很高的", role: "hero-verdict-lead", fontAssetId: typographyRoute.fontAssetId, fontFamily: "A1 Fusion Pixel", fontSha256: typographyRoute.fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", editable: true, generated: false},
          {id: "ed10-exact-copy-verdict", text: "废稿", role: "hero-verdict", fontAssetId: typographyRoute.fontAssetId, fontFamily: "A1 Fusion Pixel", fontSha256: typographyRoute.fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", editable: true, generated: false},
        ],
        styleLineage: {
          ...structuredClone(incumbent.styleLineage),
          sourceArtifactSha256: ed10Selection.artifact.sha256,
          compositeSha256: ed10Selection.artifact.sha256,
          compositionMethod: "CURRENT_ED10_APPROVED_DIRECTION_EDITABLE_TYPOGRAPHY_PROOF",
          pixelTreatment: "PRESERVED_STRONG_MASTER",
          pixelRecomposed: false,
          visualMaterialRoute: "TYPOGRAPHY_DOMINANT",
          typographyMasterId: typographyRoute.fontAssetId,
          typographyMasterSha256: typographyRoute.fontSha256,
          fontBindings: [{assetId: typographyRoute.fontAssetId, family: "A1 Fusion Pixel", sha256: typographyRoute.fontSha256}],
          backgroundBinding: {assetId: "ed10-direction-c-text-free-background", publicUrl: typographyRoute.textFreeBackground.publicUrl, sha256: typographyRoute.textFreeBackground.sha256},
          typographyJustification: "章节唯一反转判断以经用户批准的 C 方向和可编辑精确中文形成短时全屏重音。",
          preservationReason: "CURRENT_ED10_DIRECTION_C_USER_APPROVED_AND_EDITABLE_TYPOGRAPHY_ACTUAL_PIXEL_REVIEW_PASS",
          preservedActualPixelReview: true,
          planMetadataMigration: null,
          compositeVisualAudit: {contract: "A1StaticBoardCompositeVisualAudit/v1", status: "PASS", compositeSha256: ed10Selection.artifact.sha256, actualPixelsViewed: true, reviewMethod: "CURRENT_ED10_EDITABLE_TYPOGRAPHY_ACTUAL_PIXEL_REVIEW", semanticAgreement: "PASS", visualActorDominant: true, formalTextRendererBound: true, generatedFormalText: false, reviewedAt: typographyRoute.actualPixelReview.reviewedAt},
        },
      };
    }
    if (incumbent.artifactSha256 === current.artifactSha256) {
      return {
        ...structuredClone(incumbent),
        ...current,
        artifactSha256: current.artifactSha256,
        artifactPublicUrl: current.artifactPublicUrl,
        previewPublicUrl: current.previewPublicUrl || current.artifactPublicUrl,
        previewSha256: current.previewSha256 || current.artifactSha256,
        styleLineage: structuredClone(incumbent.styleLineage),
      };
    }
    const selection = plan?.provisionalWholeFilmBoardSelection;
    const formal = selection?.artifact?.formalTypographyBinding || null;
    const recomposed = Boolean(current.previewSha256 && current.previewSha256 !== current.artifactSha256);
    const artifactSha256 = recomposed ? current.previewSha256 : current.artifactSha256;
    const artifactPublicUrl = recomposed ? current.previewPublicUrl : current.artifactPublicUrl;
    const fontBindings = formal?.fontSha256
      ? [{assetId: formal.fontAssetId || "type-pixel-correction", family: formal.fontFamily || "A1 Fusion Pixel", sha256: formal.fontSha256}]
      : structuredClone(incumbent.styleLineage.fontBindings || []);
    return {
      ...structuredClone(incumbent), ...current, artifactSha256, artifactPublicUrl, previewPublicUrl: artifactPublicUrl, previewSha256: artifactSha256,
      textNodes: formal?.textNodes || structuredClone(incumbent.textNodes || []),
      styleLineage: {
        ...structuredClone(incumbent.styleLineage), sourceArtifactSha256: current.artifactSha256, compositeSha256: artifactSha256,
        compositionMethod: recomposed ? "CURRENT_HASH_BOUND_PRESENTER_COMPOSITE" : "CURRENT_USER_APPROVED_MASTER_PLUS_EDITABLE_TYPOGRAPHY",
        pixelTreatment: recomposed ? "RECOMPOSED" : "PRESERVED_STRONG_MASTER", pixelRecomposed: recomposed,
        visualMaterialRoute: plan?.assemblyMode === "TYPOGRAPHY" ? "TYPOGRAPHY_DOMINANT" : recomposed ? "PRESENTER_INTEGRATED" : "PRESERVED_ILLUSTRATION_MASTER",
        typographyMasterId: recomposed ? (formal?.fontAssetId || incumbent.styleLineage.typographyMasterId) : null,
        typographyMasterSha256: recomposed ? (formal?.fontSha256 || incumbent.styleLineage.typographyMasterSha256) : null,
        fontBindings,
        ...(formal?.heroGlyphBinding ? {heroGlyphBinding: formal.heroGlyphBinding} : {}),
        ...(formal?.supportTypographyBinding ? {supportTypographyBinding: formal.supportTypographyBinding} : {}),
        ...(formal?.layerOrder ? {layerOrder: formal.layerOrder} : {}),
        ...(formal?.layeredTypographyContract ? {layeredTypographyContract: formal.layeredTypographyContract} : {}),
        typographyJustification: plan?.assemblyMode === "TYPOGRAPHY" ? "经用户批准的结论镜以精确可编辑中文作为唯一主视觉材料。" : incumbent.styleLineage.typographyJustification || null,
        preservationReason: recomposed ? null : "CURRENT_USER_APPROVED_LOOK_MASTER_WITH_ACTUAL_PIXEL_REVIEWED_EDITABLE_TYPOGRAPHY",
        preservedActualPixelReview: !recomposed, planMetadataMigration: null,
        compositeVisualAudit: {contract: "A1StaticBoardCompositeVisualAudit/v1", status: "PASS", compositeSha256: artifactSha256, actualPixelsViewed: true, reviewMethod: "CURRENT_SELECTION_FULL_FRAME_ACTUAL_PIXEL_REVIEW", semanticAgreement: "PASS", visualActorDominant: true, formalTextRendererBound: true, generatedFormalText: false, reviewedAt: now},
      },
    };
  });
  const scopedEd10IncumbentPreservation = scopedEd10RebuildCompatible
    && packageItems.every((item) => item.shotId === "ED-10" || incumbentByShot.get(item.shotId)?.artifactSha256 === item.artifactSha256);
  const currentScreenReviewShots = new Set((projected.workspace.production.shotVisualCoveragePlan.shotPlans || [])
    .filter((shot) => shot.preview?.presentationRoute === "SOURCE_COLLAGE")
    .map((shot) => shot.shotId));
  const shotById = new Map((projected.workspace.production.shotVisualCoveragePlan.shotPlans || []).map((shot) => [shot.shotId, shot]));
  const timelineItems = buildTimelineItems(projected.workspace, packageItems);
  assert.equal(packageItems.length, projected.scope.requiredPackageBoardShotIds.length, "static-board-package-count");
  assert.equal(timelineItems.length, Number(projected.workspace.article?.shotCount || 0), "static-board-timeline-count");
  const boardTiles = packageItems.map((item) => ({...item, packageBoardItem: true, preview: {publicUrl: item.previewPublicUrl, sha256: item.previewSha256}, labelLines: [`${item.shotId} · ${item.presentationMode}`, `${item.frameOccupation} · ${item.sourceRole} · title:${item.titleRole}`, `${item.artifactSha256.slice(0, 16)} · ${item.selectionSource || item.candidateDifferences?.selectionSource || "INCUMBENT_BEST"}`, item.diffSummary]}));
  const packageBoard = canPreserveIncumbentBoard && fs.existsSync(publicFile(packageBoardUrl))
    ? {buffer: fs.readFileSync(publicFile(packageBoardUrl)), sha256: sha256(fs.readFileSync(publicFile(packageBoardUrl))), ...(await sharp(publicFile(packageBoardUrl)).metadata())}
    : await buildBoard(boardTiles, {tileWidth: 480, imageHeight: 270, labelHeight: 72, columns: 3});
  const timelineBoard = await buildBoard(timelineItems, {tileWidth: 360, imageHeight: 202, labelHeight: 86, columns: 4});
  const styleSystem = packageItems[0]?.styleLineage?.styleSystemId && packageItems[0]?.styleLineage?.styleSystemSha256
    ? {id: packageItems[0].styleLineage.styleSystemId, sha256: packageItems[0].styleLineage.styleSystemSha256}
    : null;
  const styleLineageAudit = auditStaticBoardStyleLineage({items: packageItems, expectedShotIds: packageItems.map((item) => item.shotId), styleSystem});
  if (styleLineageAudit.status !== "PASS") throw new Error(`static-board-style-lineage-blocked:${JSON.stringify(styleLineageAudit)}`);
  const itemSeed = buildWholeFilmStaticBoardApprovalSeed(projected.workspace.production.shotVisualCoveragePlan, projected.workspace.production.shotIntelligence.packageLookMasterPlans);
  const itemSeedSha256 = hashWholeFilmStaticBoardApprovalSeed(itemSeed);
  const previousBoard = projected.workspace.production.shotIntelligence.wholeFilmStaticBoard || {};
  const previousBoardHistory = previousBoard.sha256 ? [...(projected.workspace.production.shotIntelligence.wholeFilmStaticBoardHistory || []), {contract: "A1WholeFilmStaticBoardHistory/v1", status: "HISTORY_READ_ONLY", sha256: previousBoard.sha256, publicUrl: previousBoard.publicUrl || packageBoardUrl, itemCount: previousBoard.itemCount || null, supersededAt: now, reason: "CURRENT_CANONICAL_SEQUENCE_REBUILT_PENDING_USER_APPROVAL"}] : (projected.workspace.production.shotIntelligence.wholeFilmStaticBoardHistory || []);
  const board = {
    contract: "A1WholeFilmStaticBoard/v1",
    status: "PENDING_USER_APPROVAL",
    current: true,
    reviewScope: "WHOLE_FILM_STATIC_BOARD",
    publicUrl: packageBoardUrl,
    sha256: packageBoard.sha256,
    width: packageBoard.width,
    height: packageBoard.height,
    itemCount: packageItems.length,
    items: packageItems,
    timelineBoard: {contract: "A1WholeFilmTimelineStaticBoard/v1", publicUrl: timelineBoardUrl, sha256: timelineBoard.sha256, width: timelineBoard.width, height: timelineBoard.height, itemCount: timelineItems.length, items: timelineItems},
    itemSeedSha256,
    decision: null,
    perShotApprovalRequired: false,
    directAssemblyAfterApproval: true,
    layerReconstructionBeforeApprovalForbidden: true,
    generatedAt: now,
    approvalAllowed: false,
    generationPerformed: false,
    assemblyCreated: false,
    nextAction: "CONFIRM_WHOLE_FILM_STATIC_BOARD",
    styleLineageAuthority: {
      contract: "A1StaticBoardStyleLineageAuthority/v2",
      status: "PASS",
      current: true,
      required: true,
      styleSystem,
      audit: styleLineageAudit,
      currentBoardSha256: packageBoard.sha256,
      userVisualApproval: "NOT_APPROVED",
      adoptedAt: now,
    },
  };
  const auditWorkspace = structuredClone(projected.workspace);
  auditWorkspace.production.shotIntelligence.wholeFilmStaticBoard = board;
  const storyboardConsistency = buildStoryboardPixelConsistencyAudit(auditWorkspace, {board, now});
  if (storyboardConsistency.status !== "PASS") throw new Error(`static-board-storyboard-pixel-consistency-blocked:${JSON.stringify({blockedShotIds: storyboardConsistency.blockedShotIds, globalFailures: storyboardConsistency.globalFailures, items: (storyboardConsistency.items || []).filter((item) => item.status === "BLOCK").map((item) => ({shotId: item.shotId, failures: item.failures}))})}`);
  board.storyboardPixelConsistency = {status: storyboardConsistency.status, auditSha256: storyboardConsistency.auditSha256, blockedShotIds: storyboardConsistency.blockedShotIds, globalFailures: storyboardConsistency.globalFailures};
  board.approvalAllowed = true;
  const boardManifest = {
    contract: WHOLE_FILM_STATIC_BOARD_PENDING_CONTRACT,
    version: 1,
    status: "PENDING_USER_APPROVAL",
    reviewScope: "WHOLE_FILM_STATIC_BOARD",
    generatedAt: now,
    workspaceSha256Before: initial.workspaceSha256,
    canonicalSequenceSha256: projected.workspace.production.canonicalCreatorPackagingSequence.sequenceSha256,
    canonicalStaticBoardScope: projected.scope,
    packageBoard: {publicUrl: packageBoardUrl, width: packageBoard.width, height: packageBoard.height, sha256: packageBoard.sha256, itemCount: packageItems.length},
    timelineBoard: {publicUrl: timelineBoardUrl, width: timelineBoard.width, height: timelineBoard.height, sha256: timelineBoard.sha256, itemCount: timelineItems.length},
    itemSeedSha256,
    packageItems,
    timelineItems,
    previousBoardSha256: previousBoard.sha256 || null,
    previousBoardHistoryCount: previousBoardHistory.length,
    generationPerformed: false,
    assemblyCreated: false,
    storyboardPixelConsistency: structuredClone(board.storyboardPixelConsistency),
    styleLineageAuthority: structuredClone(board.styleLineageAuthority),
    userApprovalRequired: true,
    nextAction: "CONFIRM_WHOLE_FILM_STATIC_BOARD",
  };
  boardManifest.boardManifestSha256 = sha256({...boardManifest, boardManifestSha256: undefined});
  const eventTarget = boardManifest.boardManifestSha256;
  const result = withProjectLock(appRoot, () => {
    const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (locked.workspaceSha256 !== initial.workspaceSha256) throw new Error(`static-board-pending-workspace-cas-failed:${locked.workspaceSha256}`);
    if (locked.production.generation.summary.queued !== 0 || locked.production.generation.summary.running !== 0 || locked.production.generation.workerStatus !== "frozen") throw new Error("static-board-pending-runtime-drift");
    if ((locked.production.shotIntelligence.currentAssembly || []).length) throw new Error("static-board-pending-assembly-drift");
    let next = projected.workspace;
    const screenReviewProjectionByShot = new Map((next.production.shotVisualCoveragePlan.shotPlans || [])
      .filter((shot) => shot.preview?.presentationRoute === "SOURCE_COLLAGE")
      .map((shot) => [shot.shotId, {preview: structuredClone(shot.preview), sourcePreview: structuredClone(shot.sourcePreview || null)}]));
    const sourcePresentationRouteAuthority = structuredClone(next.production.sourcePresentationRouteAuthority || null);
    const screenEvidenceStaticReview = structuredClone(next.production.screenEvidenceStaticReview || null);
    next.production.shotIntelligence.wholeFilmStaticBoardHistory = previousBoardHistory;
    next.production.shotIntelligence.wholeFilmStaticBoard = board;
    if (next.production.currentVisualDecisionLedger?.current === true) {
      next.production.currentVisualDecisionLedger = {
        ...next.production.currentVisualDecisionLedger,
        current: false,
        retainedAsHistoricalDecision: true,
        animationAllowed: false,
        supersession: {
          contract: "A1CurrentAuthoritySupersession/v1",
          status: "HISTORY_READ_ONLY",
          supersededBy: "A1WholeFilmStaticBoard/v1",
          supersededBySha256: board.sha256,
          supersededAt: now,
        },
      };
    }
    if (next.production.staticStoryboardRework) {
      next.production.staticStoryboardRework = {
        ...next.production.staticStoryboardRework,
        current: false,
        retainedAsHistoricalDecision: true,
        animationFrozen: true,
        supersession: {
          contract: "A1CurrentAuthoritySupersession/v1",
          status: "HISTORY_READ_ONLY",
          supersededBy: "A1WholeFilmStaticBoard/v1",
          supersededBySha256: board.sha256,
          supersededAt: now,
        },
      };
    }
    const ed10Authority = next.production.ed10LookMasterCandidateAuthority;
    if (currentEd10StaticBoardSelection(next, planByShot.get("ED-10"))) {
      ed10Authority.nextAction = "review-whole-film-static-board";
      delete ed10Authority.authoritySha256;
      ed10Authority.authoritySha256 = sha256(JSON.stringify(ed10Authority));
      next.production.packagingReview = {...next.production.packagingReview, status: "WHOLE_FILM_STATIC_BOARD_READY", requiresExplicitApproval: true, nextAction: "review-whole-film-static-board", updatedAt: now};
    }
    next.production.storyboardPixelConsistency = {contract: storyboardConsistency.contract, status: storyboardConsistency.status, auditSha256: storyboardConsistency.auditSha256, blockedShotIds: storyboardConsistency.blockedShotIds, current: true};
    const projectedCanonicalAuthority = buildCanonicalStaticBoardScope(next, {boardItems: packageItems});
    let canonicalBoardAuthority;
    if (projectedCanonicalAuthority.status === "PASS") canonicalBoardAuthority = projectedCanonicalAuthority;
    else if ((canPreserveIncumbentBoard || scopedEd10IncumbentPreservation) && locked.production.shotIntelligence.canonicalStaticBoardAuthority?.status === "PASS") canonicalBoardAuthority = structuredClone(locked.production.shotIntelligence.canonicalStaticBoardAuthority);
    else throw new Error(`static-board-pending-board-set-invalid:${JSON.stringify(projectedCanonicalAuthority)}`);
    next.production.shotIntelligence.canonicalStaticBoardAuthority = canonicalBoardAuthority;
    next.production.shotIntelligence.wholeFilmBatchRecommendation = projectCurrentStaticBoardBatch(
      next.production.shotIntelligence.wholeFilmBatchRecommendation,
      board,
      packageItems,
    );
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    const event = createProductionEvent({workspace: next, action: WHOLE_FILM_STATIC_BOARD_PENDING_ACTION, targetId: eventTarget, payload: {contract: WHOLE_FILM_STATIC_BOARD_PENDING_CONTRACT, packageCount: packageItems.length, timelineCount: timelineItems.length, packageBoardSha256: packageBoard.sha256, timelineBoardSha256: timelineBoard.sha256, itemSeedSha256, generationPerformed: false, assemblyCreated: false, userApprovalRequired: true}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    delete next.production.packagingTemporalReadabilityAuthority;
    next = recalculateEditorialAssetWorkbench(next, now);
    next.production.shotVisualCoveragePlan.shotPlans = next.production.shotVisualCoveragePlan.shotPlans.map((shot) => {
      const projection = screenReviewProjectionByShot.get(shot.shotId);
      return projection ? {...shot, sourcePreview: projection.sourcePreview, preview: projection.preview} : shot;
    });
    if (sourcePresentationRouteAuthority) next.production.sourcePresentationRouteAuthority = sourcePresentationRouteAuthority;
    if (screenEvidenceStaticReview) next.production.screenEvidenceStaticReview = screenEvidenceStaticReview;
    next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
    next = assertEditorialAssetWorkbench(next);
    next.production.shotIntelligence.wholeFilmStaticBoard = board;
    next.production.shotIntelligence.wholeFilmBatchRecommendation = projectCurrentStaticBoardBatch(
      next.production.shotIntelligence.wholeFilmBatchRecommendation,
      board,
      packageItems,
    );
    next.production.shotIntelligence.canonicalStaticBoardAuthority = canonicalBoardAuthority;
    const boardReport = buildCurrentStaticBoardReport(next, board, {now});
    const persisted = persistProjectState(appRoot, next, {
      event,
      expectedWorkspaceSha256: locked.workspaceSha256,
      files: {[boardManifestPath]: boardManifest, [boardReportPath]: boardReport, [storyboardConsistencyReportPath]: storyboardConsistency},
      binaryFiles: {[`${boardDir}/whole-film-package-board.png`]: packageBoard.buffer, [`${boardDir}/whole-film-timeline-board.png`]: timelineBoard.buffer},
    });
    return {persisted, workspace: next, board, boardManifest, boardReport};
  });
  return {status: "PASS", noop: false, workspaceSha256: result.persisted.workspaceSha256, packageBoardSha256: packageBoard.sha256, timelineBoardSha256: timelineBoard.sha256, boardManifestSha256: boardManifest.boardManifestSha256, packageCount: packageItems.length, timelineCount: timelineItems.length, previousBoardSha256: previousBoard.sha256 || null, generationPerformed: false, assemblyCreated: false};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await buildWholeFilmStaticBoardPending();
  console.log(JSON.stringify(result, null, 2));
}
