#!/usr/bin/env node

import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  A1_CREATOR_PACKAGING_PALETTE_BLOCKED_MISSING_LANE_C,
  A1_CREATOR_PACKAGING_PALETTE_BLOCKED_LANE_C_TARGET_UNRESOLVED,
  A1_CREATOR_PALETTE_LANES,
  auditCreatorPaletteOverlayComposite,
  buildCanonicalCreatorPackagingSequence,
  buildCreatorPaletteShotBindingManifest,
  buildCreatorPackagingPaletteRegistry,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {normalizeCreatorPaletteRepairManifest} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const repairManifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const reviewDir = "creator-packaging-palette-review-v1";
const contactSheetPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/${reviewDir}/contact-sheet.png`;
const registryPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/${reviewDir}/registry.json`;
const reportPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/${reviewDir}/report.json`;
const now = new Date().toISOString();
const HISTORICAL_CANONICAL_DIRECTOR_CUTOVER_SEQUENCE_SHA256 = "1d49be3c38817a20e7acdfa80b760329eee0c2ccf28daace107ca99058867476";
const projectOverrides = JSON.parse(fs.readFileSync(path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json"), "utf8"));

const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => {
  const target = path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
  if (!String(publicUrl || "").startsWith("/generated/system-line/") || !target.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error(`creator-palette-public-path-invalid:${publicUrl}`);
  return target;
};
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const baseSelections = [
  {laneId: A1_CREATOR_PALETTE_LANES.OVERLAY, shotId: "ED-07", contentSha256: "28fbbd3032b2f9ecec9404584d8d5aaff30b1e4121c226d67ab9df612a7a1ec4", semanticRole: "QUESTION", dominantActor: "presenter-plus-pixel-question-window", primaryPrimitive: "PIXEL_WINDOW_OVERLAY", composition: "real-presenter-negative-space-with-two-unequal-semantic-windows", typographyBehavior: "short-question-is-integrated-with-the-window-actor", windowCount: 2},
  {laneId: A1_CREATOR_PALETTE_LANES.OVERLAY, shotId: "ED-08", contentSha256: "3c3d9accb76598600a6bf4c23d4d703b754d7a00459b18de4873e3332c0e3489", semanticRole: "VERDICT", dominantActor: "presenter-plus-pixel-verdict-collision", primaryPrimitive: "PIXEL_WINDOW_OVERLAY", composition: "real-presenter-negative-space-with-one-semantic-collision", typographyBehavior: "short-verdict-shares-hierarchy-with-one-pixel-actor", windowCount: 2},
  {laneId: A1_CREATOR_PALETTE_LANES.OVERLAY, shotId: "ED-13", contentSha256: "ca2ac6f7ef291be4e18a2d3e2bf9b45d1fc4d165983e1ddbcb7d28ce5bd444ae", semanticRole: "TURN", dominantActor: "presenter-plus-two-part-comparison", primaryPrimitive: "PIXEL_WINDOW_OVERLAY", composition: "two-unequal-phrase-windows-in-presenter-negative-space", typographyBehavior: "two-phrase-contrast-remains-one-composition", windowCount: 2},
  {laneId: A1_CREATOR_PALETTE_LANES.OVERLAY, shotId: "ED-34", contentSha256: "228e3c50034a2f59ce2f36dfbfe1525f9b733959949bfdf65732b419c5ee6b99", semanticRole: "RESOLVE", dominantActor: "presenter-plus-human-preference-window", primaryPrimitive: "PIXEL_WINDOW_OVERLAY", composition: "quiet-presenter-base-with-one-local-pixel-relation", typographyBehavior: "support-copy-stays-subordinate-to-the-semantic-window", windowCount: 2},
  {laneId: A1_CREATOR_PALETTE_LANES.TYPOGRAPHY, shotId: "ED-16", contentSha256: "d144bc403ba16c51de2c5453a90772de8e63a29b465a077eeea3da4bd33d2e4e", semanticRole: "VERDICT", dominantActor: "large-causal-verdict-type", primaryPrimitive: "PIXEL_TYPE_ACTOR", composition: "headline-scale-collision-with-quiet-counterfield", typographyBehavior: "verdict-type-is-primary", windowCount: 0, immutablePaletteAlias: true},
  {laneId: A1_CREATOR_PALETTE_LANES.TYPOGRAPHY, shotId: "ED-33", contentSha256: "a304d71d956a81e355392c7512ef92b99b9f29fe8977762c3eddac72741b88c4", semanticRole: "RESOLVE", dominantActor: "system-resolution-type-actor", primaryPrimitive: "PIXEL_TYPE_ACTOR", composition: "large-resolution-phrase-with-controlled-pixel-material", typographyBehavior: "resolution-title-owns-the-frame-hierarchy", windowCount: 0, immutablePaletteAlias: true},
];

function validateRaw(workspace, selection) {
  const raw = (workspace.production.shotIntelligence.lookMasterRawReferences || []).find((item) => item.shotId === selection.shotId && item.artifact?.sha256 === selection.contentSha256);
  if (!raw) throw new Error(`creator-palette-source-not-found:${selection.shotId}`);
  const pixelPass = raw.pixelAudit?.admissionAllowed === true && (raw.pixelAudit?.status === "PASS" || raw.pixelAudit?.contract === "A1CanonicalTitleRepairActualPixelAudit/v2") && !(raw.pixelAudit?.failures || []).length;
  const semanticPass = raw.semanticPixelAudit?.status === "PASS" && raw.semanticPixelAudit?.recommendationEligible === true;
  const serverPass = raw.serverVisualAssessment?.status === "PASS" && !(raw.serverVisualAssessment?.hardFailures || []).length;
  const duplicatePass = raw.pixelAudit?.duplicateFingerprint?.status === "PASS" || raw.pixelAudit?.actualPixelMetrics?.repeatedTemplateDetected === false;
  const authorityPass = raw.candidateAuditAuthority?.status === "PASS" && raw.candidateAuditAuthority?.recommendationEligible === true
    || raw.pixelAudit?.contract === "A1CanonicalTitleRepairActualPixelAudit/v2" && raw.pixelAudit?.serverGenerated === true && raw.pixelAudit?.serverVisualAssessmentSha256 === raw.serverVisualAssessment?.assessmentSha256;
  const failures = [];
  if (raw.current !== true && selection.immutablePaletteAlias !== true) failures.push("not-current");
  if (raw.historyReadOnly === true && selection.immutablePaletteAlias !== true) failures.push("history-read-only");
  if (raw.exception === true) failures.push("exception");
  if (!pixelPass) failures.push("actual-pixel");
  if (!semanticPass) failures.push("semantic");
  if (!serverPass) failures.push("server-assessment");
  if (!duplicatePass) failures.push("duplicate");
  if (!authorityPass) failures.push("candidate-authority");
  if (failures.length) throw new Error(`creator-palette-source-ineligible:${selection.shotId}:${failures.join(",")}`);
  const sourceFile = publicFile(raw.artifact.publicUrl);
  if (!fs.existsSync(sourceFile) || fileSha256(sourceFile) !== selection.contentSha256) throw new Error(`creator-palette-source-file-sha-mismatch:${selection.shotId}`);
  const composite = raw.pixelAudit?.compositePreview || null;
  const compositeFile = composite?.publicUrl ? publicFile(composite.publicUrl) : null;
  if (selection.laneId === A1_CREATOR_PALETTE_LANES.OVERLAY && !compositeFile) throw new Error(`creator-palette-overlay-composite-missing:${selection.shotId}`);
  if (compositeFile && (!fs.existsSync(compositeFile) || fileSha256(compositeFile) !== composite.sha256)) throw new Error(`creator-palette-composite-sha-mismatch:${selection.shotId}`);
  const videoContext = (workspace.production.shotIntelligence.videoPackagingContexts?.items || []).find((item) => item.shotId === selection.shotId) || null;
  const overlayCompositeAudit = selection.laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? auditCreatorPaletteOverlayComposite({raw, videoContext}) : null;
  if (overlayCompositeAudit && overlayCompositeAudit.status !== "PASS") throw new Error(`creator-palette-overlay-composite-blocked:${selection.shotId}:${overlayCompositeAudit.failures.join(",")}`);
  return {selection, raw, sourceFile, overlayCompositeAudit, previewFile: selection.laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? compositeFile : sourceFile};
}

async function buildContactSheet(validated, sequence) {
  const width = 1920;
  const headerHeight = 138;
  const rowHeight = 330;
  const height = headerHeight + rowHeight * 3;
  const laneOrder = Object.values(A1_CREATOR_PALETTE_LANES);
  const laneDisplay = {
    [A1_CREATOR_PALETTE_LANES.OVERLAY]: ["PRESENTER OVERLAY", "PIXEL WINDOW"],
    [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY]: ["HERO TYPOGRAPHY", "TYPE ACTOR"],
    [A1_CREATOR_PALETTE_LANES.FULL_FRAME]: ["EXPLAINER STRUCTURE", "CANONICAL OCCUPATION"],
  };
  const composites = [];
  const laneCTargetShotIds = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE" && item.contentTreatment === "EDITORIAL_EXPLAINER").map((item) => item.shotId);
  const laneCRepresentative = validated.find((item) => item.selection.laneId === A1_CREATOR_PALETTE_LANES.FULL_FRAME)?.selection.shotId || null;
  const laneCStatus = laneCTargetShotIds.length && laneCRepresentative ? `Lane C adjudicated: EDITORIAL_EXPLAINER_STRUCTURE · ${laneCRepresentative} · canonical occupation preserved` : "Lane C unresolved: no canonical editorial explainer candidate";
  const header = Buffer.from(`<svg width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#0e1112"/><text x="42" y="48" fill="#f2f3ed" font-size="34" font-family="Arial" font-weight="700">Creator Packaging Palette Review</text><text x="42" y="82" fill="#aab2ad" font-size="17" font-family="Arial">Hupo = sequence grammar · A1 retro pixel = frame aesthetic · existing actual-pixel PASS only</text><text x="42" y="111" fill="#f0a06b" font-size="15" font-family="Arial">${escapeXml(laneCStatus)}</text></svg>`);
  composites.push({input: header, left: 0, top: 0});
  for (const [laneIndex, laneId] of laneOrder.entries()) {
    const items = validated.filter((item) => item.selection.laneId === laneId);
    const gap = 18;
    const labelWidth = 250;
    const cardWidth = items.length ? Math.floor((width - labelWidth - 42 - gap * (items.length - 1)) / items.length) : width - labelWidth - 42;
    const imageHeight = 236;
    const top = headerHeight + laneIndex * rowHeight;
    const [laneTitle, laneSubtitle] = laneDisplay[laneId];
    const laneLabel = Buffer.from(`<svg width="${labelWidth - 16}" height="${rowHeight - 20}"><rect width="100%" height="100%" rx="14" fill="#141819"/><text x="20" y="38" fill="#d9ff66" font-size="17" font-family="Arial" font-weight="700">LANE ${String.fromCharCode(65 + laneIndex)}</text><text x="20" y="72" fill="#f2f3ed" font-size="16" font-family="Arial" font-weight="700">${escapeXml(laneTitle)}</text><text x="20" y="96" fill="#f2f3ed" font-size="14" font-family="Arial" font-weight="700">${escapeXml(laneSubtitle)}</text><text x="20" y="132" fill="#96a09a" font-size="13" font-family="Arial">existing PNG only</text></svg>`);
    composites.push({input: laneLabel, left: 24, top: top + 10});
    if (!items.length) {
      const missing = Buffer.from(`<svg width="${cardWidth}" height="${rowHeight - 20}"><rect width="100%" height="100%" rx="14" fill="#201817" stroke="#f0a06b" stroke-opacity=".45"/><text x="28" y="72" fill="#f0a06b" font-size="24" font-family="Arial" font-weight="700">MISSING_ACTUAL_CANDIDATE</text><text x="28" y="112" fill="#d7c2b5" font-size="16" font-family="Arial">Requires EDITORIAL_EXPLAINER + canonical occupation + actual-pixel PASS.</text><text x="28" y="144" fill="#988a82" font-size="14" font-family="Arial">Hero typography cannot be relabeled as an explainer.</text></svg>`);
      composites.push({input: missing, left: labelWidth, top: top + 10});
    }
    for (const [index, item] of items.entries()) {
      const left = labelWidth + index * (cardWidth + gap);
      const preview = await sharp(item.previewFile).resize(cardWidth, imageHeight, {fit: "contain", background: "#0a0c0d"}).png().toBuffer();
      composites.push({input: preview, left, top: top + 10});
      const meta = Buffer.from(`<svg width="${cardWidth}" height="72"><rect width="100%" height="100%" fill="#171b1d"/><text x="14" y="25" fill="#d9ff66" font-size="15" font-family="Arial" font-weight="700">${escapeXml(item.selection.shotId)} · ${escapeXml(item.selection.contentSha256.slice(0, 12))}</text><text x="14" y="49" fill="#aab2ad" font-size="12" font-family="Arial">${escapeXml(item.selection.primaryPrimitive)} · ${escapeXml(item.selection.semanticRole)}</text></svg>`);
      composites.push({input: meta, left, top: top + imageHeight + 10});
    }
  }
  return sharp({create: {width, height, channels: 3, background: "#0e1112"}}).composite(composites).png().toBuffer();
}

const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("creator-palette-build-generation-not-frozen");
if ((before.production.shotIntelligence.currentAssembly || []).length !== 0 || before.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("creator-palette-build-assembly-not-locked");
const boardSha256Before = before.production.shotIntelligence.wholeFilmStaticBoard.sha256;
const candidateShasBefore = (before.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean);
const authorityWorkspace = structuredClone(before);
authorityWorkspace.production.creatorPackagingProjectOverrides = projectOverrides;
const sequence = buildCanonicalCreatorPackagingSequence(authorityWorkspace, {now});
const laneCTargetShotIds = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE" && item.contentTreatment === "EDITORIAL_EXPLAINER").map((item) => item.shotId);
const selections = [...baseSelections, ...(laneCTargetShotIds.includes("ED-14") ? [{laneId: A1_CREATOR_PALETTE_LANES.FULL_FRAME, shotId: "ED-14", contentSha256: "79f7e1cc07011e7a8b74b21bbd4b42fbbe82c37ec0b63e50cfa43dcf4b7bb454", semanticRole: "PROVE", dominantActor: "real-source-proof-relation", primaryPrimitive: "PIXEL_EXPLAINER", composition: "canonical-split-source-proof-relation", typographyBehavior: "short-proof-copy-supports-the-source-relation-not-a-hero-title", windowCount: 0}] : [])];
const validated = selections.map((selection) => validateRaw(before, selection));
const contactSheetBytes = await buildContactSheet(validated, sequence);
const contactSheetSha256 = sha256(contactSheetBytes);

const entries = validated.map(({selection, raw, sourceFile, overlayCompositeAudit}) => {
  const decision = sequence.decisions.find((item) => item.shotId === selection.shotId);
  if (!decision || decision.packageDecision !== "PACKAGE") throw new Error(`creator-palette-current-decision-invalid:${selection.shotId}`);
  return {
    paletteEntryId: `creator-palette-${selection.laneId.toLowerCase()}-${selection.shotId.toLowerCase()}-${selection.contentSha256.slice(0, 12)}`,
    laneId: selection.laneId,
    shotId: selection.shotId,
    candidateId: raw.referenceId,
    projectLocalUrl: raw.artifact.publicUrl,
    path: path.relative(root, sourceFile).split(path.sep).join("/"),
    contentSha256: selection.contentSha256,
    packageType: `${decision.contentTreatment}_${decision.frameOccupation}`,
    primaryPrimitive: selection.primaryPrimitive,
    semanticRole: selection.semanticRole,
    dominantActor: selection.dominantActor,
    composition: selection.composition,
    surfaceLogic: "local-pixel-grid-halftone-or-dither-without-global-crt-filter",
    paletteRoles: ["cool-white-or-cool-gray", "charcoal", "one-structural-color", "one-semantic-accent"],
    windowCount: selection.windowCount,
    typographyBehavior: selection.typographyBehavior,
    holdFrameCompatibility: decision.frameOccupation === "OVERLAY" && overlayCompositeAudit?.status === "PASS" ? "PASS" : decision.frameOccupation === "OVERLAY" ? "BLOCKED" : "NOT_REQUIRED",
    ...(overlayCompositeAudit ? {overlayCompositeAudit} : {}),
    allowedUses: selection.laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? ["PIXEL_WINDOW", "OVERLAY"] : selection.laneId === A1_CREATOR_PALETTE_LANES.TYPOGRAPHY ? ["HERO_TYPOGRAPHY", "SPLIT", "FULL_FRAME_TAKEOVER"] : ["EDITORIAL_EXPLAINER", "SPLIT", "FULL_FRAME_TAKEOVER"],
    forbiddenUses: ["creator-identity-copy", "logo-copy", "exact-composition-copy", "generic-ui-fallback", "global-crt-filter"],
    contentTreatment: decision.contentTreatment,
    frameOccupation: decision.frameOccupation,
    rhythmRole: decision.rhythmRole,
    aestheticFamily: decision.aestheticFamily,
    canonicalDecisionSha256: decision.decisionSha256,
    sourceAudit: {
      status: "PASS",
      actualPixelStatus: "PASS",
      semanticStatus: "PASS",
      duplicateStatus: "PASS",
      exception: false,
      originHistoryReadOnly: selection.immutablePaletteAlias === true,
      artifactSha256: selection.contentSha256,
      pixelAuditSha256: raw.pixelAudit.auditSha256,
      semanticAuditSha256: raw.semanticPixelAudit.auditSha256,
      serverAssessmentSha256: raw.serverVisualAssessment.assessmentSha256,
      candidateAuthoritySha256: raw.candidateAuditAuthority?.authoritySha256 || raw.pixelAudit.auditSha256,
      planSha256: raw.planSha256,
    },
    ...(selection.immutablePaletteAlias ? {paletteReferenceAlias: {
      contract: "A1ImmutablePaletteReferenceAlias/v1",
      status: "PASS",
      originReferenceId: raw.referenceId,
      originArtifactSha256: selection.contentSha256,
      originHistoryRecord: {historyReadOnly: true, originalCurrentEligibility: false},
      currentEligibilityAudit: {status: "PASS", sequenceSha256: sequence.sequenceSha256, actualPixelAuditSha256: raw.pixelAudit.auditSha256, semanticAuditSha256: raw.semanticPixelAudit.auditSha256},
    }} : {}),
    compositePreview: raw.pixelAudit?.compositePreview ? structuredClone(raw.pixelAudit.compositePreview) : undefined,
  };
});

const recommendedTrio = {
  [A1_CREATOR_PALETTE_LANES.OVERLAY]: entries.find((entry) => entry.shotId === "ED-07").paletteEntryId,
  [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY]: entries.find((entry) => entry.shotId === "ED-16").paletteEntryId,
  ...(entries.some((entry) => entry.shotId === "ED-14") ? {[A1_CREATOR_PALETTE_LANES.FULL_FRAME]: entries.find((entry) => entry.shotId === "ED-14").paletteEntryId} : {}),
};
const registry = buildCreatorPackagingPaletteRegistry({
  sequence,
  entries,
  contactSheet: {publicUrl: contactSheetPublicUrl, sha256: contactSheetSha256, width: 1920, height: 1128},
  sourceWorkspaceSha256: before.workspaceSha256,
  sourceBoardSha256: boardSha256Before,
  recommendedTrio,
  now,
});

const transaction = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== before.workspaceSha256) throw new Error("creator-palette-build-workspace-cas-mismatch");
  const next = structuredClone(current);
  next.production.creatorPackagingProjectOverrides = structuredClone(projectOverrides);
  next.production.canonicalCreatorPackagingSequence = sequence;
  next.production.creatorPackagingPaletteRegistry = registry;
  const bindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  next.production.creatorPaletteShotBindingManifest = bindingManifest;
  const currentRepairManifest = fs.existsSync(repairManifestPath) ? JSON.parse(fs.readFileSync(repairManifestPath, "utf8")) : null;
  const normalizedRepairManifest = currentRepairManifest ? normalizeCreatorPaletteRepairManifest(currentRepairManifest, {sequenceSha256: sequence.sequenceSha256, registrySha256: registry.registrySha256, bindingManifestSha256: bindingManifest.manifestSha256, status: registry.status, now}) : null;
  if (normalizedRepairManifest) next.production.incrementalRepairManifestAuthority = {contract: "A1IncrementalRepairManifestAuthority/v1", status: "CURRENT", manifestSha256: normalizedRepairManifest.manifestSha256, artifactPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json", publicPath: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json", mirrorStatus: "IN_SYNC"};
  if (next.production.goldenLookAnchorRegistry) Object.assign(next.production.goldenLookAnchorRegistry, {status: "SUPERSEDED_BY_CREATOR_PACKAGING_PALETTE", current: false, historyReadOnly: true, supersededBySequenceSha256: sequence.sequenceSha256, supersededAt: now});
  const oldAuthority = next.production.shotIntelligence.canonicalDirectorAuthority;
  // The canonical director cutover is historical and immutable. Its original
  // superseding pointer must not be rewritten each time the current creator
  // packaging sequence advances.
  if (oldAuthority) Object.assign(oldAuthority, {current: false, historyReadOnly: true, supersededBy: sequence.contract, supersededBySha256: oldAuthority.supersededBySha256 === sequence.sequenceSha256 ? HISTORICAL_CANONICAL_DIRECTOR_CUTOVER_SEQUENCE_SHA256 : oldAuthority.supersededBySha256});
  const oldRepair = next.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  if (oldRepair) Object.assign(oldRepair, {current: false, historyReadOnly: true, status: "HISTORY_READ_ONLY", generationDispatched: false, boardRebuilt: false, supersededBy: sequence.contract, supersededBySha256: sequence.sequenceSha256});
  const oldDecisionSet = next.production.shotIntelligence.decisionSet;
  if (oldDecisionSet) Object.assign(oldDecisionSet, {current: false, historyReadOnly: true, authorityStatus: "SUPERSEDED_BY_CANONICAL_CREATOR_PACKAGING_SEQUENCE", supersededBySha256: sequence.sequenceSha256});
  if (next.production.presentationDecisions) Object.assign(next.production.presentationDecisions, {current: false, historyReadOnly: true, authorityStatus: "SUPERSEDED_BY_CANONICAL_CREATOR_PACKAGING_SEQUENCE", supersededBySha256: sequence.sequenceSha256});
  const ed20Plan = (next.production.shotIntelligence.packageLookMasterPlans || []).find((plan) => plan.shotId === "ED-20");
  if (ed20Plan) Object.assign(ed20Plan, {current: false, historyReadOnly: true, status: "HISTORY_READ_ONLY", supersededReason: "ED20_REAL_EVIDENCE_SOURCE_CAPTURE_REQUIRED", supersededBySha256: sequence.sequenceSha256});
  const ed20Brief = (next.production.shotIntelligence.semanticDesignBriefSet?.briefs || []).find((brief) => brief.shotId === "ED-20");
  if (ed20Brief) Object.assign(ed20Brief, {status: "SOURCE_CAPTURE_REQUIRED", packageDecision: "NO_PACKAGE", evidenceRoute: "SCREEN_EVIDENCE", generationAllowed: false, sourceCaptureHandoff: {owner: "EDITOR", packagingPaletteBlocking: false, staticPackageBoardBlocking: false, generationFallbackAllowed: false}, canonicalCreatorDecisionSha256: sequence.decisions.find((item) => item.shotId === "ED-20").decisionSha256});
  for (const raw of next.production.shotIntelligence.lookMasterRawReferences || []) {
    if (["ED-15", "ED-16", "ED-33"].includes(raw.shotId) && ["5c4dbc907ec2e68f7400d71297d21e2d38703869e08dfe2393bceacdcc0c6235", "d144bc403ba16c51de2c5453a90772de8e63a29b465a077eeea3da4bd33d2e4e", "a304d71d956a81e355392c7512ef92b99b9f29fe8977762c3eddac72741b88c4"].includes(raw.artifact?.sha256)) {
      raw.historyReadOnly = true;
      raw.current = false;
      raw.status = "HISTORY_READ_ONLY";
      delete raw.paletteRevalidation;
    }
  }
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  const paletteBlockedStatus = registry.status;
  const targetUnresolved = paletteBlockedStatus === A1_CREATOR_PACKAGING_PALETTE_BLOCKED_LANE_C_TARGET_UNRESOLVED;
  const paletteStage = targetUnresolved ? "creator-packaging-palette-blocked-lane-c-target-unresolved" : paletteBlockedStatus === A1_CREATOR_PACKAGING_PALETTE_BLOCKED_MISSING_LANE_C ? "creator-packaging-palette-blocked-missing-lane-c" : "creator-packaging-palette-review";
  next.production.packagingAutomation = {...(next.production.packagingAutomation || {}), status: paletteBlockedStatus, currentStage: paletteStage, targetShotIds: [], generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
  next.production.shotIntelligence.wholeFilmStaticBoard = {...next.production.shotIntelligence.wholeFilmStaticBoard, status: targetUnresolved ? "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BLOCKED_LANE_C_TARGET_UNRESOLVED" : paletteBlockedStatus === A1_CREATOR_PACKAGING_PALETTE_BLOCKED_MISSING_LANE_C ? "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BLOCKED_MISSING_LANE_C" : "SUPERSEDED_CREATOR_PACKAGING_PALETTE_PENDING", decision: null, approvalAllowed: false, blockedShotIds: (next.production.shotIntelligence.wholeFilmStaticBoard.blockedShotIds || []).filter((shotId) => shotId !== "ED-20"), nonBlockingEditorHandoffShotIds: [...new Set([...(next.production.shotIntelligence.wholeFilmStaticBoard.nonBlockingEditorHandoffShotIds || []), "ED-20"])], supersededBySha256: sequence.sequenceSha256};
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, status: paletteBlockedStatus, finalizedShotIds: sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId), exceptions: (next.production.shotIntelligence.wholeFilmBatchRecommendation.exceptions || []).filter((item) => !(item?.shotId === "ED-20" && item?.code === "CANONICAL_STATIC_BOARD_SELECTION_MISSING")), autoRecommendationAllowed: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: targetUnresolved ? "CREATOR_PACKAGING_LANE_C_TARGET_ADJUDICATION" : paletteBlockedStatus === A1_CREATOR_PACKAGING_PALETTE_BLOCKED_MISSING_LANE_C ? "CREATOR_PACKAGING_PALETTE_MISSING_LANE_C" : "CREATOR_PACKAGING_PALETTE_SELECTION", staticBoard: structuredClone(next.production.shotIntelligence.wholeFilmStaticBoard)};
  next.production.project.currentStage = paletteStage;
  next.production.project.updatedAt = now;
  const event = createProductionEvent({workspace: next, action: "build-creator-packaging-palette-review", targetId: sequence.sequenceSha256, payload: {sequenceSha256: sequence.sequenceSha256, registrySha256: registry.registrySha256, laneCount: 3, imageGenerationPerformed: false}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const candidateShasAfter = (recalculated.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean);
  const report = {
    contract: "A1CreatorPackagingPaletteReviewReport/v1",
    status: paletteBlockedStatus,
    sequenceSha256: sequence.sequenceSha256,
    registrySha256: registry.registrySha256,
    bindingManifestSha256: bindingManifest.manifestSha256,
    repairManifestSha256: normalizedRepairManifest?.manifestSha256 || null,
    sourceWorkspaceSha256: before.workspaceSha256,
    workspaceSha256: recalculated.workspaceSha256,
    boardSha256Before,
    boardSha256After: recalculated.production.shotIntelligence.wholeFilmStaticBoard.sha256,
    boardRebuilt: false,
    boardStatus: recalculated.production.shotIntelligence.wholeFilmStaticBoard.status,
    contactSheet: registry.contactSheet,
    registryPublicUrl,
    reportPublicUrl,
    laneRecommendations: Object.fromEntries(Object.entries(recommendedTrio).map(([laneId, entryId]) => [laneId, entries.find((entry) => entry.paletteEntryId === entryId)?.shotId || null])),
    laneC: {status: laneCTargetShotIds.length && entries.some((entry) => entry.laneId === A1_CREATOR_PALETTE_LANES.FULL_FRAME) ? "RESOLVED" : "TARGET_UNRESOLVED", targetShotIds: laneCTargetShotIds, targetDecisionSha256: laneCTargetShotIds.map((shotId) => sequence.decisions.find((item) => item.shotId === shotId)?.decisionSha256).filter(Boolean), representativeShotId: entries.find((entry) => entry.laneId === A1_CREATOR_PALETTE_LANES.FULL_FRAME)?.shotId || null, rationale: "不需要独立 FULL_FRAME EDITORIAL_EXPLAINER；Lane C 只证明 Editorial Explainer 的 canonical 结构，保留 ED-14 的 SPLIT occupation。", requiredContentTreatment: "EDITORIAL_EXPLAINER", requiredFrameOccupation: "CANONICAL_SHOT_OCCUPATION", actualPixelStatus: laneCTargetShotIds.length && entries.some((entry) => entry.laneId === A1_CREATOR_PALETTE_LANES.FULL_FRAME) ? "PASS" : "NOT_AVAILABLE", candidateCount: entries.filter((entry) => entry.laneId === A1_CREATOR_PALETTE_LANES.FULL_FRAME).length},
    entries: entries.map((entry) => ({laneId: entry.laneId, shotId: entry.shotId, candidateId: entry.candidateId, contentSha256: entry.contentSha256, packageType: entry.packageType, primaryPrimitive: entry.primaryPrimitive})),
    modeDistribution: sequence.rhythmAudit,
    conflictAudit: sequence.conflictAudit,
    ed20Decision: sequence.decisions.find((item) => item.shotId === "ED-20"),
    imageGenerationPerformed: false,
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    assemblyCount: (recalculated.production.shotIntelligence.currentAssembly || []).length,
    assemblyCreationAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true,
    downstream: {layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, fullFilmRenderAllowed: false},
    candidateShaCountBefore: candidateShasBefore.length,
    candidateShaCountAfter: candidateShasAfter.length,
    candidateShasUnchanged: JSON.stringify(candidateShasBefore) === JSON.stringify(candidateShasAfter),
    createdAt: now,
  };
  if (report.boardSha256After !== boardSha256Before || !report.candidateShasUnchanged) throw new Error("creator-palette-build-production-artifact-drift");
  persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {[`${reviewDir}/registry.json`]: registry, [`${reviewDir}/report.json`]: report, "creator-packaging-palette-binding-v1/manifest.json": bindingManifest, ...(normalizedRepairManifest ? {"incremental-repair-executor-v1/repair-manifest.json": normalizedRepairManifest} : {})}, binaryFiles: {[`${reviewDir}/contact-sheet.png`]: contactSheetBytes}});
  return {workspace: recalculated, report, repairManifestSha256: normalizedRepairManifest?.manifestSha256 || null};
});
console.log(JSON.stringify({status: transaction.report.status, workspaceSha256: transaction.workspace.workspaceSha256, boardSha256: boardSha256Before, sequenceSha256: sequence.sequenceSha256, registrySha256: registry.registrySha256, repairManifestSha256: transaction.repairManifestSha256, conflictCount: sequence.conflictAudit.conflictCount, packageCount: sequence.rhythmAudit.packageCount, noPackageCount: sequence.rhythmAudit.noPackageCount, fullFrameTakeoverCount: sequence.rhythmAudit.fullFrameTakeoverCount, laneRecommendations: transaction.report.laneRecommendations, candidateShasUnchanged: transaction.report.candidateShasUnchanged, imageGenerationPerformed: false}, null, 2));
