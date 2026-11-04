#!/usr/bin/env node

import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildGoldenLookAnchorRegistry, rebaseEd20RepairEntry} from "../apps/studio-next/src/lib/a1-golden-look-anchor-registry-v1.mjs";
import {updateRepairManifestSidecar} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const repairManifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const reviewDir = "golden-look-anchor-review-v1";
const contactSheetPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/${reviewDir}/contact-sheet.png`;
const registryPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/${reviewDir}/registry.json`;
const reportPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/${reviewDir}/report.json`;
const now = new Date().toISOString();

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => {
  const target = path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
  if (!target.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error(`golden-anchor-public-path-invalid:${publicUrl}`);
  return target;
};
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const selections = [
  {
    shotId: "ED-07",
    contentSha256: "28fbbd3032b2f9ecec9404584d8d5aaff30b1e4121c226d67ab9df612a7a1ec4",
    semanticRole: "question-reframed-as-human-editorial-intervention",
    windowCount: 2,
    typographyBehavior: "one exact question phrase is integrated into the larger semantic window",
  },
  {
    shotId: "ED-08",
    contentSha256: "3c3d9accb76598600a6bf4c23d4d703b754d7a00459b18de4873e3332c0e3489",
    semanticRole: "ai-output-collides-with-human-speaking-standard",
    windowCount: 2,
    typographyBehavior: "short judgment phrase shares hierarchy with one pixel actor",
  },
  {
    shotId: "ED-13",
    contentSha256: "ca2ac6f7ef291be4e18a2d3e2bf9b45d1fc4d165983e1ddbcb7d28ce5bd444ae",
    semanticRole: "two-part-editorial-contrast-in-presenter-negative-space",
    windowCount: 2,
    typographyBehavior: "two unequal phrase windows form one continuous comparison",
  },
  {
    shotId: "ED-34",
    contentSha256: "228e3c50034a2f59ce2f36dfbfe1525f9b733959949bfdf65732b419c5ee6b99",
    semanticRole: "human-preference-pushes-writing-direction",
    windowCount: 2,
    typographyBehavior: "one consequence phrase is subordinate to the pixel semantic actor",
  },
];

function findAndValidateRaw(workspace, selection) {
  const runtime = workspace.production.shotIntelligence;
  const raw = runtime.lookMasterRawReferences.find((item) => item.shotId === selection.shotId && item.artifact?.sha256 === selection.contentSha256);
  if (!raw) throw new Error(`golden-anchor-source-not-found:${selection.shotId}`);
  const failures = [];
  if (raw.current === false || raw.historyReadOnly === true || raw.status === "HISTORY_READ_ONLY") failures.push("history-read-only");
  if (raw.exception === true) failures.push("exception");
  if (raw.pixelAudit?.status !== "PASS" || raw.pixelAudit?.admissionAllowed !== true) failures.push("pixel-audit");
  if (raw.semanticPixelAudit?.status !== "PASS" || raw.semanticPixelAudit?.recommendationEligible !== true) failures.push("semantic-audit");
  if (raw.serverVisualAssessment?.status !== "PASS" || (raw.serverVisualAssessment?.hardFailures || []).length) failures.push("server-assessment");
  if (raw.pixelAudit?.duplicateFingerprint?.status !== "PASS") failures.push("duplicate");
  if (raw.candidateAuditAuthority?.status !== "PASS" || raw.candidateAuditAuthority?.recommendationEligible !== true) failures.push("candidate-authority");
  if (failures.length) throw new Error(`golden-anchor-source-ineligible:${selection.shotId}:${failures.join(",")}`);
  const sourceFile = publicFile(raw.artifact.publicUrl);
  if (!fs.existsSync(sourceFile) || fileSha256(sourceFile) !== selection.contentSha256) throw new Error(`golden-anchor-source-file-sha-mismatch:${selection.shotId}`);
  const composite = raw.pixelAudit.compositePreview;
  const compositeFile = publicFile(composite.publicUrl);
  if (!fs.existsSync(compositeFile) || fileSha256(compositeFile) !== composite.sha256) throw new Error(`golden-anchor-composite-sha-mismatch:${selection.shotId}`);
  const fingerprint = String(raw.directionFingerprint || raw.pixelAudit.directionFingerprint || "").split("|");
  return {raw, sourceFile, compositeFile, fingerprint};
}

async function buildContactSheet(validated) {
  const canvasWidth = 1920;
  const canvasHeight = 1260;
  const cardWidth = 900;
  const cardHeight = 515;
  const imageWidth = 860;
  const imageHeight = 400;
  const composites = [];
  for (const [index, item] of validated.entries()) {
    const left = 40 + (index % 2) * 940;
    const top = 150 + Math.floor(index / 2) * 550;
    const preview = await sharp(item.compositeFile).resize(imageWidth, imageHeight, {fit: "contain", background: "#101315"}).png().toBuffer();
    composites.push({input: preview, left: left + 20, top: top + 20});
    const selection = selections[index];
    const candidateId = item.raw.referenceId;
    const primaryFamily = item.fingerprint[0] || "pixel-window";
    const metaSvg = Buffer.from(`<svg width="${cardWidth}" height="95"><rect width="100%" height="100%" fill="#171b1d"/><text x="20" y="27" fill="#d9ff66" font-size="18" font-family="Arial" font-weight="700">${escapeXml(selection.shotId)}  ·  ${escapeXml(selection.contentSha256.slice(0, 12))}</text><text x="20" y="52" fill="#f2f3ed" font-size="14" font-family="Arial">${escapeXml(candidateId)}</text><text x="20" y="76" fill="#aab2ad" font-size="14" font-family="Arial">OVERLAY_PACKAGE  ·  ${escapeXml(primaryFamily)}</text></svg>`);
    composites.push({input: metaSvg, left, top: top + 420});
  }
  const header = Buffer.from(`<svg width="1920" height="130"><rect width="100%" height="100%" fill="#0e1112"/><text x="40" y="48" fill="#f2f3ed" font-size="34" font-family="Arial" font-weight="700">Golden Anchor Review</text><text x="40" y="82" fill="#aab2ad" font-size="17" font-family="Arial">Existing actual-pixel PASS relationships only · choose 1–3 · no generation performed</text><text x="40" y="108" fill="#d9ff66" font-size="15" font-family="Arial">ANCHOR_CANDIDATE — not yet user approved</text></svg>`);
  return sharp({create: {width: canvasWidth, height: canvasHeight, channels: 3, background: "#0e1112"}})
    .composite([{input: header, left: 0, top: 0}, ...composites])
    .png()
    .toBuffer();
}

const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("golden-anchor-build-generation-not-frozen");
if ((before.production.shotIntelligence.currentAssembly || []).length !== 0 || before.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("golden-anchor-build-assembly-not-locked");
const boardSha256Before = before.production.shotIntelligence.wholeFilmStaticBoard.sha256;
const candidateShasBefore = before.production.shotIntelligence.lookMasterRawReferences.map((item) => item.artifact?.sha256).filter(Boolean);
const validated = selections.map((selection) => findAndValidateRaw(before, selection));
const contactSheetBytes = await buildContactSheet(validated);
const contactSheetSha256 = sha256(contactSheetBytes);

const entries = validated.map((item, index) => {
  const selection = selections[index];
  const fingerprint = item.fingerprint;
  return {
    anchorId: `golden-anchor-${selection.shotId.toLowerCase()}-${selection.contentSha256.slice(0, 12)}`,
    shotId: selection.shotId,
    candidateId: item.raw.referenceId,
    projectLocalUrl: item.raw.artifact.publicUrl,
    path: path.relative(root, item.sourceFile).split(path.sep).join("/"),
    contentSha256: selection.contentSha256,
    approvalState: "ANCHOR_CANDIDATE",
    packageType: "OVERLAY_PACKAGE",
    primaryPrimitive: "PIXEL_WINDOW_OVERLAY",
    primaryFamily: fingerprint[0] || "pixel-window",
    semanticRole: selection.semanticRole,
    dominantActor: fingerprint[2] || "pixel-semantic-actor",
    composition: fingerprint[3] || "one-or-two-unequal-semantic-windows-in-presenter-negative-space",
    surfaceLogic: fingerprint[4] || "local-pixel-grid-without-full-frame-filter",
    paletteRoles: ["cool-neutral-base", "charcoal-ink", "one-structural-color", "one-semantic-accent"],
    windowCount: selection.windowCount,
    typographyBehavior: selection.typographyBehavior,
    holdFrameCompatibility: item.raw.pixelAudit?.footageCompatibility?.status === "PASS" ? "ACTUAL_BASE_FRAME_COMPOSITE_PASS" : "BLOCKED",
    allowedUses: ["PIXEL_WINDOW_OVERLAY"],
    forbiddenUses: ["FULLSCREEN_CRT_STORY", "complete-fictional-room", "global-crt-filter", "generic-ui-workflow", "three-to-six-window-density"],
    sourceAudit: {
      status: "PASS",
      duplicateStatus: item.raw.pixelAudit.duplicateFingerprint.status,
      exception: false,
      historyReadOnly: false,
      artifactSha256: selection.contentSha256,
      pixelAuditSha256: item.raw.pixelAudit.auditSha256,
      semanticAuditSha256: item.raw.semanticPixelAudit.auditSha256,
      candidateAuthoritySha256: item.raw.candidateAuditAuthority.authoritySha256,
      planSha256: item.raw.candidateAuditAuthority.planSha256,
      sourceBindingMode: item.raw.candidateAuditAuthority.bindingMode,
    },
    compositePreview: {publicUrl: item.raw.pixelAudit.compositePreview.publicUrl, sha256: item.raw.pixelAudit.compositePreview.sha256},
  };
});

const researchOnlyPath = "/Users/a1/.codex/generated_images/019fd508-584a-72b1-aef1-7769be501897/exec-f515c341-87e8-4292-a6b9-6b1530dd7178.png";
const researchOnlyArtifacts = fs.existsSync(researchOnlyPath) ? [{
  artifactId: "crt-color-research-f515c341",
  path: researchOnlyPath,
  contentSha256: fileSha256(researchOnlyPath),
  productionAssetAllowed: false,
  candidatePoolAllowed: false,
  note: "CRT study may inform local grammar only; it must not replace A1 or enter production.",
}] : [];

const registry = buildGoldenLookAnchorRegistry({
  entries,
  contactSheet: {publicUrl: contactSheetPublicUrl, sha256: contactSheetSha256, width: 1920, height: 1260},
  researchOnlyArtifacts,
  sourceWorkspaceSha256: before.workspaceSha256,
  sourceBoardSha256: boardSha256Before,
  now,
});
registry.registryPublicUrl = registryPublicUrl;
registry.ed20Repair = {status: "ANCHOR_REBASE_REQUIRED", generationAllowed: false, nextAction: "WAIT_FOR_GOLDEN_ANCHOR_SELECTION", requiredAssemblyMode: "OVERLAY", requiredPrimitiveId: "PIXEL_WINDOW_OVERLAY", maximumWindowCount: 2, fullscreenFallbackAllowed: false};
delete registry.registrySha256;
registry.registrySha256 = sha256(JSON.stringify(registry));

const transaction = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== before.workspaceSha256) throw new Error("golden-anchor-build-workspace-cas-mismatch");
  const next = structuredClone(current);
  next.production.goldenLookAnchorRegistry = registry;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  const event = createProductionEvent({workspace: next, action: "build-golden-look-anchor-review", targetId: "ED-20", payload: {registrySha256: registry.registrySha256, anchorIds: entries.map((entry) => entry.anchorId), imageGenerationPerformed: false}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const report = {
    contract: "A1GoldenLookAnchorReviewReport/v1",
    status: "GOLDEN_ANCHOR_REVIEW",
    registrySha256: registry.registrySha256,
    sourceWorkspaceSha256: before.workspaceSha256,
    workspaceSha256: recalculated.workspaceSha256,
    boardSha256Before,
    boardSha256After: recalculated.production.shotIntelligence.wholeFilmStaticBoard.sha256,
    boardRebuilt: false,
    contactSheet: registry.contactSheet,
    registryPublicUrl,
    reportPublicUrl,
    entries: registry.entries.map((entry) => ({anchorId: entry.anchorId, shotId: entry.shotId, candidateId: entry.candidateId, contentSha256: entry.contentSha256, approvalState: entry.approvalState, packageType: entry.packageType, primaryFamily: entry.primaryFamily})),
    ed20Status: "ANCHOR_REBASE_REQUIRED",
    imageGenerationPerformed: false,
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length,
    assemblyCreationAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true,
    downstream: {layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, fullFilmRenderAllowed: false},
    candidateShaCountBefore: candidateShasBefore.length,
    candidateShaCountAfter: recalculated.production.shotIntelligence.lookMasterRawReferences.map((item) => item.artifact?.sha256).filter(Boolean).length,
    candidateShasUnchanged: JSON.stringify(candidateShasBefore) === JSON.stringify(recalculated.production.shotIntelligence.lookMasterRawReferences.map((item) => item.artifact?.sha256).filter(Boolean)),
    createdAt: now,
  };
  if (report.boardSha256After !== boardSha256Before || !report.candidateShasUnchanged) throw new Error("golden-anchor-build-production-artifact-drift");
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {[`${reviewDir}/registry.json`]: registry, [`${reviewDir}/report.json`]: report},
    binaryFiles: {[`${reviewDir}/contact-sheet.png`]: contactSheetBytes},
  });
  return {workspace: recalculated, report};
});

const manifestUpdate = await updateRepairManifestSidecar({
  manifestPath: repairManifestPath,
  update: (manifest) => {
    const index = manifest.entries.findIndex((entry) => entry.shotId === "ED-20");
    if (index < 0) throw new Error("golden-anchor-ed20-repair-entry-missing");
    manifest.entries[index] = rebaseEd20RepairEntry(manifest.entries[index], {registrySha256: registry.registrySha256, now});
    manifest.status = "GOLDEN_ANCHOR_REVIEW";
    manifest.generationDispatched = false;
    manifest.boardRebuilt = false;
    manifest.updatedAt = now;
    return manifest;
  },
});

console.log(JSON.stringify({
  status: "GOLDEN_ANCHOR_REVIEW",
  workspaceSha256: transaction.workspace.workspaceSha256,
  boardSha256: boardSha256Before,
  registrySha256: registry.registrySha256,
  repairManifestSha256: manifestUpdate.manifestSha256,
  anchorCount: registry.entries.length,
  anchors: registry.entries.map((entry) => ({shotId: entry.shotId, sha256: entry.contentSha256})),
  contactSheetPublicUrl,
  imageGenerationPerformed: false,
}, null, 2));
