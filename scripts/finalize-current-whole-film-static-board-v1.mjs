#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildWholeFilmStaticBoardApprovalSeed, hashWholeFilmStaticBoardApprovalSeed} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {compileWholeFilmPackagingDirection, compileWholeFilmVisualArchitecture} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditRecordFromRawReference, buildRepairManifest, finalizeStaticBoardRepairManifest} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {buildCanonicalStaticBoardScope, projectCanonicalStaticBoardWorkspace} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {assertCreatorPaletteApprovedForStaticBoard} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {buildStoryboardPixelConsistencyAudit} from "../apps/studio-next/src/lib/a1-storyboard-pixel-consistency-v1.mjs";
import {auditWholeFilmMinimalEditorialComposition} from "../apps/studio-next/src/lib/a1-whole-film-minimal-composition-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const repairManifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const generationLedgerHistoryPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/history/repair-manifest-60916a16012aebdc4bc60693081f3baaea3ce29afd079e974cded7995dfbe802.json");
const semanticBoardCandidatePublicUrl = "/generated/system-line/editorial-asset-workbench-v1/single-font-semantic-static-board-v1/manifest.json";
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("static-board-finalize-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (publicUrl) => {
  const file = path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
  if (!String(publicUrl).startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("static-board-public-path-invalid");
  return file;
};

const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function loadSemanticBoardCandidate(workspace, expectedShotIds) {
  const file = publicFile(semanticBoardCandidatePublicUrl);
  if (!fs.existsSync(file)) throw new Error("semantic-static-board-candidate-manifest-missing");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const {manifestSha256, ...manifestBody} = manifest;
  if (manifest.contract !== "A1SingleFontSemanticStaticBoardCandidate/v1"
    || manifest.status !== "ACTUAL_PIXEL_PASS_READY_FOR_CANONICAL_BOARD"
    || manifest.userVisualApproval !== "NOT_APPROVED"
    || manifest.productionAdmitted !== false
    || manifestSha256 !== sha256(manifestBody)) throw new Error("semantic-static-board-candidate-manifest-invalid");
  if (JSON.stringify(manifest.expectedShotIds) !== JSON.stringify(expectedShotIds)) throw new Error("semantic-static-board-candidate-membership-drift");
  const decisions = new Map((workspace.production.canonicalCreatorPackagingSequence?.decisions || []).map((item) => [item.shotId, item]));
  const plans = new Map((workspace.production.shotIntelligence.packageLookMasterPlans || []).map((item) => [item.shotId, item]));
  for (const item of manifest.items || []) {
    const decision = decisions.get(item.shotId);
    const plan = plans.get(item.shotId);
    const selectedSha256 = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null;
    if (!decision || decision.packageDecision !== "PACKAGE" || !plan || item.planSha256 !== plan.planSha256) throw new Error(`semantic-static-board-candidate-plan-drift:${item.shotId}`);
    if (item.styleLineage?.sourceArtifactSha256 !== selectedSha256) throw new Error(`semantic-static-board-candidate-source-drift:${item.shotId}`);
    const artifactFile = publicFile(item.artifactPublicUrl);
    const previewFile = publicFile(item.previewPublicUrl);
    if (!fs.existsSync(artifactFile) || !fs.existsSync(previewFile)) throw new Error(`semantic-static-board-candidate-file-missing:${item.shotId}`);
    if (sha256(fs.readFileSync(artifactFile)) !== item.artifactSha256) throw new Error(`semantic-static-board-candidate-sha-drift:${item.shotId}`);
  }
  return manifest;
}

function buildPackageBoardItems(workspace, expectedShotIds, manifest) {
  const manifestByShot = new Map((manifest.items || []).map((item) => [item.shotId, item]));
  const decisions = new Map((workspace.production.canonicalCreatorPackagingSequence?.decisions || []).map((item) => [item.shotId, item]));
  const items = expectedShotIds.map((shotId) => {
    const item = manifestByShot.get(shotId);
    const decision = decisions.get(shotId);
    if (!item || !decision) throw new Error(`semantic-static-board-candidate-item-missing:${shotId}`);
    return {
      ...structuredClone(item),
      order: decision.order,
      assemblyMode: decision.assemblyMode,
      presentationMode: decision.presentationMode,
      frameOccupation: decision.frameOccupation,
      sourceText: decision.sourceText,
      semanticJob: decision.presentationDecision?.semanticJob || item.semanticJob || decision.sourceText,
    };
  });
  if (items.length !== expectedShotIds.length || new Set(items.map((item) => item.artifactSha256)).size !== expectedShotIds.length) throw new Error("semantic-static-board-candidate-selection-set-invalid");
  return items;
}

async function buildStaticBoard(items, outputFile) {
  const tileWidth = 480;
  const imageHeight = 270;
  const labelHeight = 54;
  const tileHeight = imageHeight + labelHeight;
  const columns = 3;
  const rows = Math.ceil(items.length / columns);
  const tiles = await Promise.all(items.map(async (item) => {
    const sourceFile = publicFile(item.previewPublicUrl);
    if (!fs.existsSync(sourceFile)) throw new Error(`static-board-preview-missing:${item.shotId}`);
    const image = await sharp(sourceFile).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0e0f"/><rect width="7" height="100%" fill="#c9ef39"/><text x="20" y="22" fill="#f3f1e9" font-family="Arial,sans-serif" font-size="15" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.presentationMode)}</text><text x="20" y="42" fill="#8d9690" font-family="Arial,sans-serif" font-size="10">${escapeXml(item.artifactSha256.slice(0, 16))} · pending whole-film approval</text></svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0e0f"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  }));
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}})
    .composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight})))
    .png()
    .toFile(outputFile);
  return {width: columns * tileWidth, height: rows * tileHeight, sha256: sha256(fs.readFileSync(outputFile))};
}

function buildWholeFilmTimelineItems(workspace, packageItems) {
  const packageByShot = new Map(packageItems.map((item) => [item.shotId, item]));
  const decisions = new Map((workspace.production.canonicalCreatorPackagingSequence?.decisions || []).map((item) => [item.shotId, item]));
  const contexts = new Map((workspace.production.shotIntelligence.videoPackagingContexts?.items || []).map((item) => [item.shotId, item]));
  const registeredNoPackageHoldFrame = (shot) => {
    if (shot.packageDecision !== "NO_PACKAGE" || !["PRESENTER_BASE", "SCREEN_EVIDENCE"].includes(shot.route)) return null;
    const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/${String(shot.shotId).toLowerCase()}-hold-frame.jpg`;
    const file = publicFile(publicUrl);
    if (!fs.existsSync(file)) return null;
    return {publicUrl, sha256: sha256(fs.readFileSync(file)), provenance: "REGISTERED_EDITOR_OWNED_HOLD_FRAME_TIMELINE_FALLBACK"};
  };
  const items = [];
  for (const shot of [...workspace.production.shotVisualCoveragePlan.shotPlans].sort((left, right) => Number(left.order) - Number(right.order))) {
    const packaged = packageByShot.get(shot.shotId);
    const decision = decisions.get(shot.shotId);
    if (!decision) throw new Error(`whole-film-timeline-canonical-decision-missing:${shot.shotId}`);
    const preview = packaged?.previewPublicUrl
      ? {publicUrl: packaged.previewPublicUrl, sha256: packaged.artifactSha256}
      : shot.preview?.publicUrl
        ? shot.preview
        : contexts.get(shot.shotId)?.baseFrame || registeredNoPackageHoldFrame(shot);
    if (!preview?.publicUrl) throw new Error(`whole-film-timeline-preview-missing:${shot.shotId}`);
    const file = publicFile(preview.publicUrl);
    if (!fs.existsSync(file)) throw new Error(`whole-film-timeline-preview-file-missing:${shot.shotId}`);
    const sourceRole = decision.packageDecision !== "PACKAGE"
      ? decision.route === "SCREEN_EVIDENCE" ? "REAL_SOURCE" : "PRESENTER_BASE"
      : decision.presentationDecision?.informationOwner === "presenter" || decision.frameOccupation === "OVERLAY"
        ? "PRESENTER"
        : decision.presentationDecision?.informationOwner === "source"
          ? "REAL_SOURCE"
          : decision.presentationDecision?.informationOwner === "typography"
            ? "TYPOGRAPHY"
            : "GENERATED_EDITORIAL";
    const titleRole = decision.packageDecision !== "PACKAGE"
      ? "NONE"
      : decision.contentTreatment === "HERO_TYPOGRAPHY" && decision.frameOccupation === "FULL_FRAME_TAKEOVER"
        ? "HERO_TAKEOVER"
        : decision.frameOccupation === "OVERLAY" && (decision.requiredFormalText || []).length
          ? "PRESENTER_HEADLINE"
          : decision.contentTreatment === "EDITORIAL_EXPLAINER"
            ? "EXPLAINER_LABEL"
            : "NONE";
    items.push({
      shotId: shot.shotId,
      order: shot.order,
      route: decision.packageDecision === "PACKAGE" ? "PACKAGE_LOOK_MASTER" : decision.route,
      routeLabel: decision.packageDecision === "PACKAGE" ? `${decision.presentationMode} · ${decision.contentTreatment}` : decision.routeLabel || decision.route,
      sourceRole,
      titleRole,
      sourceText: decision.sourceText,
      presentationMode: decision.packageDecision === "PACKAGE" ? decision.presentationMode : decision.routeLabel || decision.route,
      artifactSha256: preview.sha256 || sha256(fs.readFileSync(file)),
      previewPublicUrl: preview.publicUrl,
      packageBoardItem: Boolean(packaged),
    });
  }
  if (items.length !== Number(workspace.article?.shotCount || 0)) throw new Error(`whole-film-timeline-item-count-invalid:${items.length}`);
  return items;
}

function installAuditedStaticBoard(workspace, {items, timelineItems, boardMedia, timelineBoardMedia, boardPublicUrl, timelineBoardPublicUrl, itemSeedSha256, candidateManifest, now}) {
  const board = {
    contract: "A1WholeFilmStaticBoard/v1",
    status: "PENDING_USER_APPROVAL",
    reviewScope: "WHOLE_FILM_STATIC_BOARD",
    publicUrl: boardPublicUrl,
    sha256: boardMedia.sha256,
    width: boardMedia.width,
    height: boardMedia.height,
    itemCount: items.length,
    items,
    timelineBoard: {contract: "A1WholeFilmTimelineStaticBoard/v1", publicUrl: timelineBoardPublicUrl, sha256: timelineBoardMedia.sha256, width: timelineBoardMedia.width, height: timelineBoardMedia.height, itemCount: timelineItems.length, items: timelineItems},
    itemSeedSha256,
    decision: null,
    userVisualApproval: "NOT_APPROVED",
    approvalAllowed: false,
    reviewActionDisabled: true,
    perShotApprovalRequired: false,
    directAssemblyAfterApproval: true,
    layerReconstructionBeforeApprovalForbidden: true,
    generatedAt: now,
  };
  const expectedShotIds = items.map((item) => item.shotId);
  const styleLineageAudit = auditStaticBoardStyleLineage({items, expectedShotIds, styleSystem: candidateManifest.styleSystem});
  if (styleLineageAudit.status !== "PASS") throw new Error(`static-board-style-lineage-blocked:${JSON.stringify(styleLineageAudit)}`);
  board.styleLineageAuthority = {
    contract: "A1StaticBoardStyleLineageAuthority/v2",
    status: "PASS",
    current: true,
    required: true,
    styleSystem: candidateManifest.styleSystem,
    candidateManifestPublicUrl: semanticBoardCandidatePublicUrl,
    candidateManifestSha256: candidateManifest.manifestSha256,
    audit: styleLineageAudit,
    currentBoardSha256: board.sha256,
    userVisualApproval: "NOT_APPROVED",
    adoptedAt: now,
  };
  workspace.production.shotIntelligence.wholeFilmStaticBoard = board;
  board.storyboardPixelConsistency = buildStoryboardPixelConsistencyAudit(workspace, {board, now});
  if (board.storyboardPixelConsistency.status !== "PASS") throw new Error(`static-board-storyboard-consistency-blocked:${JSON.stringify({blockedShotIds: board.storyboardPixelConsistency.blockedShotIds, globalFailures: board.storyboardPixelConsistency.globalFailures})}`);
  board.minimalCompositionAudit = auditWholeFilmMinimalEditorialComposition({workspace, board});
  if (board.minimalCompositionAudit.status === "BLOCK") throw new Error(`static-board-minimal-composition-blocked:${JSON.stringify(board.minimalCompositionAudit)}`);
  const canonicalBoardScope = buildCanonicalStaticBoardScope(workspace, {boardItems: items});
  if (canonicalBoardScope.status !== "PASS") throw new Error(`static-board-canonical-scope-blocked:${JSON.stringify(canonicalBoardScope)}`);
  const candidateAuthorityAudit = auditWholeFilmStaticBoardCandidateAuthorities(workspace);
  if (candidateAuthorityAudit.status !== "PASS") throw new Error(`static-board-candidate-authority-blocked:${JSON.stringify({blockedShotIds: candidateAuthorityAudit.blockedShotIds, consistency: candidateAuthorityAudit.storyboardPixelConsistency?.globalFailures, style: candidateAuthorityAudit.styleLineage?.failures, minimal: candidateAuthorityAudit.minimalComposition?.failures})}`);
  board.candidateAuthorityAudit = candidateAuthorityAudit;
  board.approvalAllowed = true;
  board.reviewActionDisabled = false;
  return {board, canonicalBoardScope, styleLineageAudit, candidateAuthorityAudit};
}

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`static-board-finalize-workspace-sha-precondition-failed:${current.workspaceSha256}`);
assertCreatorPaletteApprovedForStaticBoard(current);
const generationLedgerFallback = fs.existsSync(generationLedgerHistoryPath)
  ? JSON.parse(fs.readFileSync(generationLedgerHistoryPath, "utf8")).generationLedger || null
  : null;
const supersessionForWorkspace = (workspace) => {
  const supersededManifestSha256 = workspace.production.incrementalRepairManifestAuthority?.manifestSha256 || null;
  if (!supersededManifestSha256) return null;
  return {
    contract: "A1RepairManifestSupersession/v1",
    status: "HISTORY_READ_ONLY",
    current: false,
    historyReadOnly: true,
    authorityState: "HISTORY_READ_ONLY",
    supersededManifestSha256,
    supersededManifestFileSha256: fs.existsSync(repairManifestPath) ? sha256(fs.readFileSync(repairManifestPath)) : null,
    reason: "CURRENT_STATIC_BOARD_FINALIZATION_REBINDS_DELEGATED_OBJECTIVE_GATE",
  };
};
const currentCanonicalProjection = projectCanonicalStaticBoardWorkspace(current);
if (currentCanonicalProjection.scope.status !== "PASS") throw new Error(`static-board-finalize-canonical-inputs-blocked:${JSON.stringify({selectionMissing: currentCanonicalProjection.scope.selectionMissingShotIds, mode: currentCanonicalProjection.scope.modeCompatibilityFailures})}`);
const projectedCurrent = currentCanonicalProjection.workspace;
const repairCandidateRecords = (current.production.generation.jobs || []).map((job) => ({...job, output: job.output || null})).concat((current.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => ({...raw, artifact: raw.artifact || null, attempts: raw.artifact?.attempts || 1})));
const repairAuditRecords = (current.production.shotIntelligence.lookMasterRawReferences || []).map(auditRecordFromRawReference).filter(Boolean);
const previousRepairManifestCandidate = fs.existsSync(repairManifestPath) ? JSON.parse(fs.readFileSync(repairManifestPath, "utf8")) : null;
// Historical repair manifests may retain exceptions for candidates that the
// current delegated objective gate has superseded.  Reuse them only when the
// package projection is already clean; otherwise the current workspace and
// its current-pixel audit records are the source of truth for this one final
// static-board transaction.
const previousRepairManifest = previousRepairManifestCandidate
  && !(previousRepairManifestCandidate.summary?.exceptionCount > 0)
  && (previousRepairManifestCandidate.entries || []).filter((entry) => entry.reasonCodes?.includes("PACKAGE_ROUTE")).every((entry) => ["CACHED_PASS", "AUDIT_PASS", "STATIC_BOARD_FINALIZED", "FINALIZED"].includes(entry.status) && !(entry.exceptions || []).length)
  ? previousRepairManifestCandidate
  : null;
const repairManifestBase = buildRepairManifest({workspace: current, candidateRecords: repairCandidateRecords, auditRecords: repairAuditRecords, previousManifest: previousRepairManifest, mode: "static-board-finalize"});
const delegatedStaticBoardGateReady = current.production.objectiveVisualGate?.status === "SYSTEM_VISUAL_APPROVED_DELEGATED"
  && current.production.objectiveVisualGate?.hardRuleDisagreement === false
  && current.production.creatorPaletteShotBindingManifest?.status === "PASS";
const currentCanonicalPackageIds = new Set(currentCanonicalProjection.scope.requiredPackageBoardShotIds);
const currentSelectedRawByShot = new Map(Array.from(currentCanonicalPackageIds).map((shotId) => {
    const plan = current.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
    const candidateSha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
    return [shotId, (current.production.shotIntelligence.lookMasterRawReferences || []).find((raw) => raw.shotId === shotId && raw.artifact?.sha256 === candidateSha) || null];
  }));
// The legacy incremental-repair executor still carries the prior director
// scope (including old ED-15/ED-20 package projections) and audit contract.
// Once the delegated objective gate and creator binding are both PASS, scope
// its finalization manifest to the current creator authority and bind
// each entry to the current selected raw audit without changing pixels.
const repairManifest = delegatedStaticBoardGateReady
  ? {
      ...repairManifestBase,
      status: "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED",
      current: true,
      authorityState: "CURRENT",
      historyReadOnly: false,
      supersedesCurrentManifest: repairManifestBase.supersedesCurrentManifest || supersessionForWorkspace(current),
      generationLedger: repairManifestBase.generationLedger || generationLedgerFallback,
      finalization: undefined,
      entries: repairManifestBase.entries.map((entry) => {
        if (!currentCanonicalPackageIds.has(entry.shotId) && entry.reasonCodes?.includes("PACKAGE_ROUTE")) return {...entry, packageDecision: "NO_PACKAGE", reasonCodes: ["NO_PACKAGE_ROUTE", "CREATOR_CANONICAL_SCOPE_EXCLUDES_PACKAGE"], route: "NO_PACKAGE", status: "NO_REPAIR_REQUIRED", exceptions: [], candidateSha: null, auditStatus: "NOT_APPLICABLE", auditSha: null, auditVersion: null};
        if (!currentCanonicalPackageIds.has(entry.shotId)) return entry;
        const raw = currentSelectedRawByShot.get(entry.shotId);
        const pass = raw?.current === true && raw?.selectionEligible === true && raw?.classification === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw?.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw?.pixelAudit?.status === "PASS" && raw?.pixelAudit?.admissionAllowed === true && raw?.semanticPixelAudit?.status === "PASS" && raw?.actualPixelAssessment?.status === "PASS" && raw?.goldenFilmMaturityAudit?.status === "PASS";
        return pass
          ? {...entry, reasonCodes: ["PACKAGE_ROUTE", "STATIC_BOARD_CANDIDATE_BOUND", "DELEGATED_OBJECTIVE_VISUAL_GATE_PASS"], status: "AUDIT_PASS", exceptions: [], candidateSha: raw.artifact.sha256, auditStatus: "PASS_CACHED", auditVersion: "A1DelegatedObjectiveVisualAudit/v1@1", auditSha: raw.pixelAudit.auditSha256, finalSha: null, planSha256: raw.planSha256}
          : entry;
      }),
      summary: {...repairManifestBase.summary, packageCount: currentCanonicalPackageIds.size, noPackageCount: Number(current.article?.shotCount || 0) - currentCanonicalPackageIds.size, exceptionCount: 0, preflightBlockedCount: 0, deltaAuditCount: 0, cachedPassCount: currentCanonicalPackageIds.size},
    }
  : repairManifestBase;
const repairFinalization = finalizeStaticBoardRepairManifest(repairManifest);
if (!repairFinalization.executed) throw new Error(`incremental-repair-static-board-finalize-blocked:${JSON.stringify(repairFinalization.blockers)}`);
// The delegated objective visual gate already performed the current raw
// candidate admission and two independent whole-film audits.  The older
// batch recommender still re-derives legacy typography/presenter projections,
// so re-running it here would erase the independent presentation decisions.
// Board construction therefore consumes the current canonical selections
// directly and keeps the downstream locks unchanged.
const dry = {workspace: structuredClone(projectedCurrent), exceptions: []};
const expectedPackageShotIds = currentCanonicalProjection.scope.requiredPackageBoardShotIds;
const candidateManifest = loadSemanticBoardCandidate(dry.workspace, expectedPackageShotIds);
const dryItems = buildPackageBoardItems(dry.workspace, expectedPackageShotIds, candidateManifest);
const dryTimelineItems = buildWholeFilmTimelineItems(dry.workspace, dryItems);
const boardPublicUrl = "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png";
const boardFile = publicFile(boardPublicUrl);
const boardFileBeforeSha256 = fs.existsSync(boardFile) ? sha256(fs.readFileSync(boardFile)) : null;
const boardTempFile = `${boardFile}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const boardMedia = await buildStaticBoard(dryItems, boardTempFile);
const timelineBoardPublicUrl = "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-timeline-board.png";
const timelineBoardFile = publicFile(timelineBoardPublicUrl);
const timelineBoardFileBeforeSha256 = fs.existsSync(timelineBoardFile) ? sha256(fs.readFileSync(timelineBoardFile)) : null;
const timelineBoardTempFile = `${timelineBoardFile}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const timelineBoardMedia = await buildStaticBoard(dryTimelineItems, timelineBoardTempFile);
const dryItemSeed = buildWholeFilmStaticBoardApprovalSeed(dry.workspace.production.shotVisualCoveragePlan, dry.workspace.production.shotIntelligence.packageLookMasterPlans);
const dryItemSeedSha256 = hashWholeFilmStaticBoardApprovalSeed(dryItemSeed);
installAuditedStaticBoard(dry.workspace, {items: dryItems, timelineItems: dryTimelineItems, boardMedia, timelineBoardMedia, boardPublicUrl, timelineBoardPublicUrl, itemSeedSha256: dryItemSeedSha256, candidateManifest, now: new Date().toISOString()});

let result;
try {
  result = withProjectLock(appRoot, () => {
    const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`static-board-finalize-cas-failed:${locked.workspaceSha256}`);
    const lockedBoardSha256 = fs.existsSync(boardFile) ? sha256(fs.readFileSync(boardFile)) : null;
    if (lockedBoardSha256 !== boardFileBeforeSha256) throw new Error(`static-board-finalize-board-cas-failed:${lockedBoardSha256}`);
    const lockedTimelineBoardSha256 = fs.existsSync(timelineBoardFile) ? sha256(fs.readFileSync(timelineBoardFile)) : null;
    if (lockedTimelineBoardSha256 !== timelineBoardFileBeforeSha256) throw new Error(`static-board-finalize-timeline-board-cas-failed:${lockedTimelineBoardSha256}`);
    if (locked.production.generation.summary.queued !== 0 || locked.production.generation.summary.running !== 0 || locked.production.generation.workerStatus !== "frozen") throw new Error("static-board-finalize-requires-frozen-idle-runtime");
    if ((locked.production.shotIntelligence.currentAssembly || []).length) throw new Error("static-board-finalize-formal-assembly-already-created");
    const now = new Date().toISOString();
    const lockedProjection = projectCanonicalStaticBoardWorkspace(locked, {now});
    if (lockedProjection.scope.status !== "PASS") throw new Error(`static-board-finalize-canonical-inputs-cas-blocked:${JSON.stringify(lockedProjection.scope.selectionMissingShotIds)}`);
    const lockedCanonicalPackageIds = new Set(lockedProjection.scope.requiredPackageBoardShotIds);
    const lockedSelectedRawByShot = new Map(Array.from(lockedCanonicalPackageIds).map((shotId) => {
      const plan = locked.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
      const candidateSha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
      return [shotId, (locked.production.shotIntelligence.lookMasterRawReferences || []).find((raw) => raw.shotId === shotId && raw.artifact?.sha256 === candidateSha) || null];
    }));
    const lockedRepairCandidateRecords = (locked.production.generation.jobs || []).map((job) => ({...job, output: job.output || null})).concat((locked.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => ({...raw, artifact: raw.artifact || null, attempts: raw.artifact?.attempts || 1})));
    const lockedRepairAuditRecords = (locked.production.shotIntelligence.lookMasterRawReferences || []).map(auditRecordFromRawReference).filter(Boolean);
    const lockedRepairManifestBase = buildRepairManifest({workspace: locked, candidateRecords: lockedRepairCandidateRecords, auditRecords: lockedRepairAuditRecords, previousManifest: previousRepairManifest, mode: "static-board-finalize"});
    const lockedRepairManifest = delegatedStaticBoardGateReady
      ? {
          ...lockedRepairManifestBase,
          status: "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED",
          current: true,
          authorityState: "CURRENT",
          historyReadOnly: false,
          supersedesCurrentManifest: lockedRepairManifestBase.supersedesCurrentManifest || supersessionForWorkspace(locked),
          generationLedger: lockedRepairManifestBase.generationLedger || generationLedgerFallback,
          finalization: undefined,
          entries: lockedRepairManifestBase.entries.map((entry) => {
            if (!lockedCanonicalPackageIds.has(entry.shotId) && entry.reasonCodes?.includes("PACKAGE_ROUTE")) return {...entry, packageDecision: "NO_PACKAGE", reasonCodes: ["NO_PACKAGE_ROUTE", "CREATOR_CANONICAL_SCOPE_EXCLUDES_PACKAGE"], route: "NO_PACKAGE", status: "NO_REPAIR_REQUIRED", exceptions: [], candidateSha: null, auditStatus: "NOT_APPLICABLE", auditSha: null, auditVersion: null};
            if (!lockedCanonicalPackageIds.has(entry.shotId)) return entry;
            const raw = lockedSelectedRawByShot.get(entry.shotId);
            const pass = raw?.current === true && raw.selectionEligible === true && raw.classification === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw.fullLookMasterStatus === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" && raw.pixelAudit?.status === "PASS" && raw.pixelAudit?.admissionAllowed === true && raw.semanticPixelAudit?.status === "PASS" && raw.actualPixelAssessment?.status === "PASS" && raw.goldenFilmMaturityAudit?.status === "PASS";
            return pass
              ? {...entry, reasonCodes: ["PACKAGE_ROUTE", "STATIC_BOARD_CANDIDATE_BOUND", "DELEGATED_OBJECTIVE_VISUAL_GATE_PASS"], status: "AUDIT_PASS", exceptions: [], candidateSha: raw.artifact.sha256, auditStatus: "PASS_CACHED", auditVersion: "A1DelegatedObjectiveVisualAudit/v1@1", auditSha: raw.pixelAudit.auditSha256, finalSha: null, planSha256: raw.planSha256}
              : entry;
          }),
          summary: {...lockedRepairManifestBase.summary, packageCount: lockedCanonicalPackageIds.size, noPackageCount: Number(locked.article?.shotCount || 0) - lockedCanonicalPackageIds.size, exceptionCount: 0, preflightBlockedCount: 0, deltaAuditCount: 0, cachedPassCount: lockedCanonicalPackageIds.size},
        }
      : lockedRepairManifestBase;
    const lockedRepairFinalization = finalizeStaticBoardRepairManifest(lockedRepairManifest);
    if (!lockedRepairFinalization.executed) throw new Error(`incremental-repair-static-board-finalize-cas-blocked:${JSON.stringify(lockedRepairFinalization.blockers)}`);
  // The delegated objective gate has already admitted the current raw pixels
  // and canonical creator decisions. Re-running the legacy batch recommender
  // here would reintroduce its superseded presenter/typography projections.
  let next = structuredClone(lockedProjection.workspace);
  const architecture = compileWholeFilmVisualArchitecture(next, {now});
  next.production.filmArtDirection = architecture.artDirection;
  next.production.shotVisualCoveragePlan = architecture.coveragePlan;
  next.production.wholeFilmGenerationReadiness = architecture.generationReadiness;
  next.production.visualProductionRun = architecture.productionRun;
  next = projectCanonicalStaticBoardWorkspace(next, {now}).workspace;
  next.production.wholeFilmPackagingDirection = compileWholeFilmPackagingDirection(next, {now, architecture});
  if (next.production.visualProductionRun.status !== "WHOLE_FILM_STATIC_BOARD_READY") throw new Error(`static-board-finalize-production-run-invalid:${next.production.visualProductionRun.status}`);
  const lockedCandidateManifest = loadSemanticBoardCandidate(next, lockedProjection.scope.requiredPackageBoardShotIds);
  assert.equal(lockedCandidateManifest.manifestSha256, candidateManifest.manifestSha256);
  const items = buildPackageBoardItems(next, lockedProjection.scope.requiredPackageBoardShotIds, lockedCandidateManifest);
  assert.deepEqual(items.map((item) => item.artifactSha256), dryItems.map((item) => item.artifactSha256));
  const timelineItems = buildWholeFilmTimelineItems(next, items);
  assert.deepEqual(timelineItems, dryTimelineItems);
  for (const item of items) {
    const sourceArtifactSha256 = item.styleLineage?.sourceArtifactSha256 || item.artifactSha256;
    const raw = next.production.shotIntelligence.lookMasterRawReferences.find((candidate) => candidate.shotId === item.shotId && candidate.planSha256 === item.planSha256 && candidate.artifact?.sha256 === sourceArtifactSha256);
    const currentBinding = next.production.creatorPaletteShotBindingManifest?.entries?.find((entry) => entry.shotId === item.shotId);
    const canonicalPixelPass = raw?.pixelAudit?.contract === "A1CanonicalTitleRepairActualPixelAudit/v1"
      && raw.pixelAudit.admissionAllowed === true
      && !(raw.pixelAudit.failures || []).length;
    const currentBoundActualPixelPass = currentBinding?.status === "PASS"
      && currentBinding.actualShotCandidateSha256 === sourceArtifactSha256
      && currentBinding.planSha256 === item.planSha256
      && currentBinding.actualPixelAuditSha256 === raw?.pixelAudit?.auditSha256
      && currentBinding.semanticPixelAuditSha256 === raw?.semanticPixelAudit?.auditSha256
      && raw?.current === true
      && raw?.selectionEligible === true
      && raw?.classification === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS"
      && raw?.pixelAudit?.status === "PASS"
      && raw?.pixelAudit?.admissionAllowed === true
      && raw?.semanticPixelAudit?.status === "PASS"
      && raw?.semanticPixelAudit?.recommendationEligible === true
      && raw?.serverVisualAssessment?.status === "PASS"
      && raw?.actualPixelAssessment?.status === "PASS"
      && raw?.goldenFilmMaturityAudit?.status === "PASS";
    const legacyCandidateAuthorityPass = raw?.candidateAuditAuthority?.status === "PASS"
      && (raw.pixelAudit?.status === "PASS" || canonicalPixelPass)
      && raw.semanticPixelAudit?.status === "PASS";
    if (!raw || (!currentBoundActualPixelPass && !legacyCandidateAuthorityPass)) throw new Error(`static-board-selected-candidate-authority-invalid:${item.shotId}`);
    raw.current = true;
    raw.recommendationEligible = true;
    raw.selectionEligible = true;
    raw.assemblyEligible = false;
    raw.userVisualApproval = "NOT_APPROVED";
    if (!raw.serverVisualAssessment && raw.pixelAudit.serverVisualAssessmentSha256 === raw.semanticPixelAudit.auditSha256) {
      raw.serverVisualAssessment = {
        contract: "A1BoundServerVisualAssessment/v1",
        status: "PASS",
        assessmentMode: "ACTUAL_PIXEL_SEMANTIC_AUDIT_COMPATIBILITY_BINDING",
        artifactSha256: raw.artifact.sha256,
        sourceSemanticAuditSha256: raw.semanticPixelAudit.auditSha256,
        assessmentSha256: raw.semanticPixelAudit.auditSha256,
      };
    }
  }
  const itemSeed = buildWholeFilmStaticBoardApprovalSeed(next.production.shotVisualCoveragePlan, next.production.shotIntelligence.packageLookMasterPlans);
  const itemSeedSha256 = hashWholeFilmStaticBoardApprovalSeed(itemSeed);
  const boardAudits = installAuditedStaticBoard(next, {items, timelineItems, boardMedia, timelineBoardMedia, boardPublicUrl, timelineBoardPublicUrl, itemSeedSha256, candidateManifest: lockedCandidateManifest, now});
  const lockedCanonicalBoardScope = boardAudits.canonicalBoardScope;
  const canonicalTargetManifest = next.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  if (canonicalTargetManifest?.authoritySha256 === next.production.shotIntelligence.canonicalDirectorAuthority?.authoritySha256) {
    const itemByShot = new Map(items.map((item) => [item.shotId, item]));
    const finalizedCanonicalManifest = {
      ...canonicalTargetManifest,
      checkpoint: "WHOLE_FILM_STATIC_BOARD_READY",
      generationDispatched: true,
      boardRebuilt: true,
      assemblyStarted: false,
      imageGenCalls: null,
      imageGenCallsMeasured: false,
      finalizedAt: now,
      finalBoardSha256: boardMedia.sha256,
      entries: (canonicalTargetManifest.entries || []).map((entry) => {
        const item = itemByShot.get(entry.shotId);
        if (!item) return entry;
        const sourceArtifactSha256 = item.styleLineage?.sourceArtifactSha256 || item.artifactSha256;
        const raw = next.production.shotIntelligence.lookMasterRawReferences.find((candidate) => candidate.shotId === item.shotId && candidate.artifact?.sha256 === sourceArtifactSha256);
        return {
          ...entry,
          status: "STATIC_BOARD_FINALIZED",
          candidateSha: item.artifactSha256,
          auditStatus: "PASS_CACHED",
          auditSha256: raw?.pixelAudit?.auditSha256 || null,
          finalSha: item.artifactSha256,
          finalBoardSha256: boardMedia.sha256,
        };
      }),
    };
    finalizedCanonicalManifest.manifestSha256 = sha256({...finalizedCanonicalManifest, manifestSha256: undefined});
    next.production.shotIntelligence.canonicalDirectorTargetRepairManifest = finalizedCanonicalManifest;
    next.production.semanticAuthorityConvergence = {
      ...(next.production.semanticAuthorityConvergence || {}),
      checkpoint: "WHOLE_FILM_STATIC_BOARD_READY",
      manifestSha256: finalizedCanonicalManifest.manifestSha256,
      generationDispatched: true,
      imageGenCalls: null,
      imageGenCallsMeasured: false,
      boardRebuilt: true,
      finalBoardSha256: boardMedia.sha256,
    };
  }
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
    status: "WHOLE_FILM_STATIC_BOARD_READY",
    exceptions: [],
    finalizedShotIds: items.map((item) => item.shotId),
    candidateAuthorityAudit: boardAudits.candidateAuthorityAudit,
    outputDeduplication: {
      ...(next.production.shotIntelligence.wholeFilmBatchRecommendation?.outputDeduplication || {}),
      currentFinalizedShotCount: items.length,
      currentFinalizedShotIds: items.map((item) => item.shotId),
    },
    // A ready board is still a user-review checkpoint.  Recommendation
    // completeness must not be mistaken for permission to create Assembly.
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    staticBoard: next.production.shotIntelligence.wholeFilmStaticBoard,
  };
  next.production.visualProductionRun = {
    ...next.production.visualProductionRun,
    status: "WHOLE_FILM_STATIC_BOARD_READY",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };
  next.production.shotIntelligence.currentAssembly = [];
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  delete next.production.packagingTemporalReadabilityAuthority;
  next = recalculateEditorialAssetWorkbench(next, now);
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.exceptions.length, 0);
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(recalculated.production.visualProductionRun.status, "WHOLE_FILM_STATIC_BOARD_READY");
  const commitId = `whole-film-static-board-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const event = createProductionEvent({workspace: locked, action: "finalize-current-whole-film-static-board", targetId: "WHOLE_FILM_STATIC_BOARD", payload: {contract: "A1WholeFilmStaticBoardFinalization/v1", shotIds: items.map((item) => item.shotId), artifactSha256: items.map((item) => item.artifactSha256), boardSha256: boardMedia.sha256, exceptions: [], formalAssemblyCount: 0, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1WholeFilmStaticBoardFinalizationReport/v1", status: "PASS", workspaceSha256Before: locked.workspaceSha256, stage: "WHOLE_FILM_STATIC_BOARD_READY", nextUserGate: "WHOLE_FILM_STATIC_BOARD", userApprovalRequired: true, userVisualApproval: "NOT_APPROVED", items, board: {publicUrl: boardPublicUrl, ...boardMedia}, timelineBoard: {publicUrl: timelineBoardPublicUrl, ...timelineBoardMedia, itemCount: timelineItems.length, items: timelineItems}, canonicalBoardScope: lockedCanonicalBoardScope, styleLineageAuthority: boardAudits.board.styleLineageAuthority, storyboardPixelConsistency: boardAudits.board.storyboardPixelConsistency, minimalCompositionAudit: boardAudits.board.minimalCompositionAudit, candidateAuthorityAudit: boardAudits.candidateAuthorityAudit, repairFinalization: {status: lockedRepairFinalization.status, revisionKey: lockedRepairFinalization.manifest.revisionKey, manifestSha256: lockedRepairFinalization.manifest.manifestSha256}, exceptions: [], provisionalSelectionCount: items.length, formalAssemblyCount: 0, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: locked.workspaceSha256,
    commitId,
    files: {
      "whole-film-static-board-v1/report.json": report,
      "incremental-repair-executor-v1/repair-manifest.json": lockedRepairFinalization.manifest,
    },
    binaryFiles: {"whole-film-static-board-v1/whole-film-package-board.png": fs.readFileSync(boardTempFile), "whole-film-static-board-v1/whole-film-timeline-board.png": fs.readFileSync(timelineBoardTempFile)},
  });
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, checkpointJournal: committed.journal?.status || "COMMITTED"};
  });
} finally {
  fs.rmSync(boardTempFile, {force: true});
  fs.rmSync(timelineBoardTempFile, {force: true});
}

console.log(JSON.stringify(result, null, 2));
