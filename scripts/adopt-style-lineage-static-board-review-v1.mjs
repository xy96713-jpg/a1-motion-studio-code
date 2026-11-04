#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "style-lineage-static-board-v1");
const manifestFile = path.join(candidateRoot, "manifest.json");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("style-lineage-adoption-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const manifest = readJson(manifestFile);
if (manifest.contract !== "A1StyleLineageStaticBoardReview/v1" || manifest.status !== "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" || manifest.userVisualApproval !== "NOT_APPROVED" || manifest.productionAdmitted !== false) throw new Error("style-lineage-candidate-manifest-invalid");
if (fileSha256(publicFile(manifest.packageBoard.publicUrl)) !== manifest.packageBoard.sha256) throw new Error("style-lineage-candidate-board-sha-mismatch");
const expectedShotIds = manifest.items.map((item) => item.shotId);
const candidateLineageAudit = auditStaticBoardStyleLineage({items: manifest.items, expectedShotIds, styleSystem: manifest.styleSystem});
if (candidateLineageAudit.status !== "PASS") throw new Error(`style-lineage-candidate-audit-blocked:${JSON.stringify(candidateLineageAudit)}`);
for (const item of manifest.items) {
  const file = publicFile(item.previewPublicUrl);
  if (!fs.existsSync(file) || fileSha256(file) !== item.artifactSha256) throw new Error(`style-lineage-candidate-item-sha-mismatch:${item.shotId}`);
}

async function buildTimelineBoard(items, outputFile) {
  const tileWidth = 360;
  const imageHeight = 203;
  const labelHeight = 85;
  const tileHeight = imageHeight + labelHeight;
  const columns = 4;
  const rows = Math.ceil(items.length / columns);
  const tiles = await Promise.all(items.map(async (item) => {
    const image = await sharp(publicFile(item.previewPublicUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="6" height="100%" fill="${item.packageBoardItem ? "#8faeff" : "#4b5358"}"/><text x="17" y="22" fill="#f3f5f2" font-family="Arial,sans-serif" font-size="14" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.route)}</text><text x="17" y="43" fill="#8faeff" font-family="Arial,sans-serif" font-size="10">${item.packageBoardItem ? "STYLE-LINEAGE PACKAGE" : "EDITOR SOURCE"}</text><text x="17" y="64" fill="#8d9690" font-family="Arial,sans-serif" font-size="9">${escapeXml(String(item.sourceText || "").slice(0, 26))}</text></svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f13"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  }));
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight, bytes: pixels};
}

const packageBoardBytes = fs.readFileSync(publicFile(manifest.packageBoard.publicUrl));
const packageBoardMedia = {sha256: sha256(packageBoardBytes), width: manifest.packageBoard.width, height: manifest.packageBoard.height, bytes: packageBoardBytes};
const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`style-lineage-adoption-workspace-sha-precondition-failed:${current.workspaceSha256}`);
if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("style-lineage-adoption-requires-frozen-idle-runtime");
if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("style-lineage-adoption-formal-assembly-already-created");

const candidateByShot = new Map(manifest.items.map((item) => [item.shotId, item]));
const board = current.production.shotIntelligence.wholeFilmStaticBoard;
assert.equal(board.status, "PENDING_USER_APPROVAL");
assert.equal(board.items.length, manifest.items.length);
const nextItems = board.items.map((item) => {
  const candidate = candidateByShot.get(item.shotId);
  if (!candidate) throw new Error(`style-lineage-adoption-shot-missing:${item.shotId}`);
  if (candidate.styleLineage.sourceArtifactSha256 !== item.artifactSha256) throw new Error(`style-lineage-adoption-source-sha-drift:${item.shotId}`);
  return {
    ...item,
    artifactSha256: candidate.artifactSha256,
    artifactPublicUrl: candidate.artifactPublicUrl,
    previewPublicUrl: candidate.previewPublicUrl,
    previewSha256: candidate.artifactSha256,
    compositeSha256: candidate.artifactSha256,
    textNodes: candidate.textNodes || [],
    styleBrief: candidate.styleBrief,
    styleLineage: candidate.styleLineage,
    candidateDifferences: {...(item.candidateDifferences || {}), selectionSource: "STYLE_LINEAGE_COMPLETE_LOOK_MASTER_RECOMPOSE_OR_EXPLICIT_PRESERVE", priorSelectionSource: item.candidateDifferences?.selectionSource || null},
  };
});

const nextItemByShot = new Map(nextItems.map((item) => [item.shotId, item]));
const timelineItems = board.timelineBoard.items.map((item) => {
  const packageItem = nextItemByShot.get(item.shotId);
  if (!packageItem) return item;
  return {
    ...item,
    preview: {publicUrl: packageItem.previewPublicUrl, sha256: packageItem.artifactSha256, provenance: "STYLE_LINEAGE_ACTUAL_PIXEL_REVIEW_COMPOSITE"},
    artifactSha256: packageItem.artifactSha256,
    previewPublicUrl: packageItem.previewPublicUrl,
    packageCandidateSha256: packageItem.styleLineage.sourceArtifactSha256,
    styleCompositeSha256: packageItem.artifactSha256,
  };
});
const timelineTemp = path.join(candidateRoot, `.timeline-board-${process.pid}-${Date.now()}.png`);
const timelineMedia = await buildTimelineBoard(timelineItems, timelineTemp);

let result;
try {
  result = withProjectLock(appRoot, () => {
    const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`style-lineage-adoption-cas-failed:${locked.workspaceSha256}`);
    if (locked.production.generation.summary.queued !== 0 || locked.production.generation.summary.running !== 0 || locked.production.generation.workerStatus !== "frozen") throw new Error("style-lineage-adoption-runtime-changed");
    const now = new Date().toISOString();
    const next = structuredClone(locked);
    const priorBoardSha256 = next.production.shotIntelligence.wholeFilmStaticBoard.sha256;
    const styleLineageAuthority = {
      contract: "A1StaticBoardStyleLineageAuthority/v1",
      status: "PASS",
      current: true,
      required: true,
      styleSystem: manifest.styleSystem,
      candidateManifestPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/style-lineage-static-board-v1/manifest.json",
      candidateManifestSha256: manifest.manifestSha256,
      audit: candidateLineageAudit,
      priorBoardSha256,
      currentBoardSha256: packageBoardMedia.sha256,
      userVisualApproval: "NOT_APPROVED",
      adoptedAt: now,
    };
    const consistencyBody = {
      contract: "A1StoryboardStyleLineagePixelConsistency/v1",
      status: "PASS",
      sourceBoardSha256: priorBoardSha256,
      currentBoardSha256: packageBoardMedia.sha256,
      timelineBoardSha256: timelineMedia.sha256,
      styleSystemSha256: manifest.styleSystem.sha256,
      packageShotIds: nextItems.map((item) => item.shotId),
      recomposedShotIds: nextItems.filter((item) => item.styleLineage.pixelTreatment === "RECOMPOSED").map((item) => item.shotId),
      preservedStrongMasterShotIds: nextItems.filter((item) => item.styleLineage.pixelTreatment === "PRESERVED_STRONG_MASTER").map((item) => item.shotId),
      blockedShotIds: [],
      generatedAt: now,
    };
    const storyboardPixelConsistency = {...consistencyBody, auditSha256: sha256(consistencyBody)};
    next.production.shotIntelligence.wholeFilmStaticBoard = {
      ...next.production.shotIntelligence.wholeFilmStaticBoard,
      publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png",
      sha256: packageBoardMedia.sha256,
      width: packageBoardMedia.width,
      height: packageBoardMedia.height,
      items: nextItems,
      timelineBoard: {...next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard, sha256: timelineMedia.sha256, width: timelineMedia.width, height: timelineMedia.height, items: timelineItems},
      decision: null,
      generatedAt: now,
      userVisualApproval: "NOT_APPROVED",
      styleLineageAuthority,
      storyboardPixelConsistency,
    };
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {
      ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
      staticBoard: next.production.shotIntelligence.wholeFilmStaticBoard,
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    };
    next.production.shotIntelligence.currentAssembly = [];
    next.production.authority = {
      ...next.production.authority,
      currentStage: "whole-film-static-board-review",
      state: "whole-film-static-board-review",
      nextAction: {...next.production.authority.nextAction, id: "review-whole-film-static-board", label: "审看已真实应用双字体与多背景的 34 镜静态板", requiresUser: true},
    };
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
    if (gate.status !== "PASS") throw new Error(`style-lineage-adoption-post-gate-blocked:${JSON.stringify(gate)}`);
    const event = createProductionEvent({workspace: locked, action: "adopt-style-lineage-static-board-review-v1", targetId: packageBoardMedia.sha256, payload: {priorBoardSha256, packageBoardSha256: packageBoardMedia.sha256, timelineBoardSha256: timelineMedia.sha256, styleSystemSha256: manifest.styleSystem.sha256, recomposedCount: manifest.counts.recomposedCount, preservedStrongMasterCount: manifest.counts.preservedStrongMasterCount, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false}, now});
    recalculated.production.eventLedger.eventCount += 1;
    recalculated.production.eventLedger.lastEventId = event.eventId;
    recalculated.production.eventLedger.lastEventAt = event.createdAt;
    const report = {
      contract: "A1WholeFilmStaticBoardFinalizationReport/v1",
      status: "PASS",
      stage: "WHOLE_FILM_STATIC_BOARD_READY",
      nextUserGate: "WHOLE_FILM_STATIC_BOARD",
      userApprovalRequired: true,
      userVisualApproval: "NOT_APPROVED",
      styleLineageAuthority,
      items: nextItems,
      board: {publicUrl: next.production.shotIntelligence.wholeFilmStaticBoard.publicUrl, sha256: packageBoardMedia.sha256, width: packageBoardMedia.width, height: packageBoardMedia.height},
      timelineBoard: {publicUrl: next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.publicUrl, sha256: timelineMedia.sha256, width: timelineMedia.width, height: timelineMedia.height, itemCount: timelineItems.length, items: timelineItems},
      storyboardPixelConsistency,
      provisionalSelectionCount: nextItems.length,
      formalAssemblyCount: 0,
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      generatedAt: now,
    };
    const files = {
      "whole-film-static-board-v1/report.json": report,
      "storyboard-pixel-consistency-v1/report.json": storyboardPixelConsistency,
      "style-lineage-static-board-v1/manifest.json": manifest,
    };
    for (const file of fs.readdirSync(path.join(candidateRoot, "style-briefs"))) files[`style-lineage-static-board-v1/style-briefs/${file}`] = readJson(path.join(candidateRoot, "style-briefs", file));
    const binaryFiles = {
      "whole-film-static-board-v1/whole-film-package-board.png": packageBoardMedia.bytes,
      "whole-film-static-board-v1/whole-film-timeline-board.png": timelineMedia.bytes,
      "style-lineage-static-board-v1/whole-film-package-board.png": packageBoardMedia.bytes,
    };
    for (const file of fs.readdirSync(path.join(candidateRoot, "frames"))) binaryFiles[`style-lineage-static-board-v1/frames/${file}`] = fs.readFileSync(path.join(candidateRoot, "frames", file));
    const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: locked.workspaceSha256, commitId: `style-lineage-static-board-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files, binaryFiles});
    return {status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: committed.workspaceSha256, packageBoardSha256: packageBoardMedia.sha256, timelineBoardSha256: timelineMedia.sha256, styleSystemSha256: manifest.styleSystem.sha256, gate, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false};
  });
} finally {
  fs.rmSync(timelineTemp, {force: true});
}

console.log(JSON.stringify(result, null, 2));
