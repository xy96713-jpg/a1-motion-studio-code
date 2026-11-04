#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "material-led-static-board-repair-v2");
const manifestFile = path.join(candidateRoot, "manifest.json");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("material-led-adoption-expected-workspace-sha-required");

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const manifest = readJson(manifestFile);
if (manifest.contract !== "A1MaterialLedStaticBoardRepair/v2" || manifest.status !== "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" || manifest.userVisualApproval !== "NOT_APPROVED" || manifest.productionAdmitted !== false || manifest.agentActualPixelReview?.status !== "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW") throw new Error("material-led-adoption-manifest-invalid");
if (fileSha256(publicFile(manifest.packageBoard.publicUrl)) !== manifest.packageBoard.sha256) throw new Error("material-led-adoption-package-board-sha-mismatch");
const expectedShotIds = manifest.items.map((item) => item.shotId);
const lineageAudit = auditStaticBoardStyleLineage({items: manifest.items, expectedShotIds, styleSystem: manifest.styleSystem});
if (lineageAudit.status !== "PASS") throw new Error(`material-led-adoption-lineage-blocked:${JSON.stringify(lineageAudit)}`);
for (const item of manifest.items) {
  const file = publicFile(item.previewPublicUrl);
  if (!fs.existsSync(file) || fileSha256(file) !== item.artifactSha256) throw new Error(`material-led-adoption-item-sha-mismatch:${item.shotId}`);
}

async function buildTimelineBoard(items, outputFile) {
  const tileWidth = 360, imageHeight = 203, labelHeight = 85, tileHeight = imageHeight + labelHeight, columns = 4;
  const tiles = await Promise.all(items.map(async (item) => {
    const previewFile = publicFile(item.previewPublicUrl);
    const image = await sharp(previewFile).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="6" height="100%" fill="${item.packageBoardItem ? "#8faeff" : "#4b5358"}"/><text x="17" y="22" fill="#f3f5f2" font-family="Arial" font-size="14" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.route)}</text><text x="17" y="43" fill="#8faeff" font-family="Arial" font-size="10">${item.packageBoardItem ? "A1 FUSION PIXEL PACKAGE" : "EDITOR SOURCE"}</text><text x="17" y="64" fill="#8d9690" font-family="Arial" font-size="9">${escapeXml(String(item.sourceText || "").slice(0, 26))}</text></svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f13"}}).composite([{input: image}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const rows = Math.ceil(items.length / columns);
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}}).composite(tiles.map((input, index) => ({input, left: index % columns * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight, bytes: pixels};
}

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`material-led-adoption-workspace-sha-precondition-failed:${current.workspaceSha256}`);
if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("material-led-adoption-requires-frozen-idle-runtime");
if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("material-led-adoption-assembly-must-remain-empty");
const priorBoard = current.production.shotIntelligence.wholeFilmStaticBoard;
if (priorBoard.status !== "PENDING_USER_APPROVAL" || priorBoard.userVisualApproval !== "NOT_APPROVED" || priorBoard.sha256 !== manifest.sourceBoardSha256) throw new Error("material-led-adoption-current-board-drift");

const candidateByShot = new Map(manifest.items.map((item) => [item.shotId, item]));
const nextItems = priorBoard.items.map((item) => {
  const candidate = candidateByShot.get(item.shotId);
  if (!candidate) throw new Error(`material-led-adoption-shot-missing:${item.shotId}`);
  if (manifest.targetShotIds.includes(item.shotId) && candidate.styleLineage.priorCompositeSha256 !== item.artifactSha256) throw new Error(`material-led-adoption-prior-composite-drift:${item.shotId}`);
  return {...item, artifactSha256: candidate.artifactSha256, artifactPublicUrl: candidate.artifactPublicUrl, previewPublicUrl: candidate.previewPublicUrl, previewSha256: candidate.artifactSha256, compositeSha256: candidate.artifactSha256, textNodes: candidate.textNodes || [], styleBrief: candidate.styleBrief, styleLineage: candidate.styleLineage, candidateDifferences: {...(item.candidateDifferences || {}), selectionSource: "MATERIAL_LED_A1_FUSION_PIXEL_FULL_LOOK_MASTER_V2", priorSelectionSource: item.candidateDifferences?.selectionSource || null}};
});
const nextItemByShot = new Map(nextItems.map((item) => [item.shotId, item]));
const timelineItems = priorBoard.timelineBoard.items.map((item) => {
  const packageItem = nextItemByShot.get(item.shotId);
  if (!packageItem) return item;
  return {...item, preview: {publicUrl: packageItem.previewPublicUrl, sha256: packageItem.artifactSha256, provenance: "CURRENT_COMPOSITE_ACTUAL_PIXEL_AUDITED"}, artifactSha256: packageItem.artifactSha256, previewPublicUrl: packageItem.previewPublicUrl, packageCandidateSha256: packageItem.styleLineage.sourceArtifactSha256, styleCompositeSha256: packageItem.artifactSha256};
});
const timelineTemp = path.join(candidateRoot, `.timeline-${process.pid}-${Date.now()}.png`);
const timelineMedia = await buildTimelineBoard(timelineItems, timelineTemp);
const packageBoardBytes = fs.readFileSync(publicFile(manifest.packageBoard.publicUrl));

let result;
try {
  result = withProjectLock(appRoot, () => {
    const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`material-led-adoption-cas-failed:${locked.workspaceSha256}`);
    const now = new Date().toISOString();
    const next = structuredClone(locked);
    const priorBoardSha256 = next.production.shotIntelligence.wholeFilmStaticBoard.sha256;
    const styleLineageAuthority = {contract: "A1StaticBoardStyleLineageAuthority/v2", status: "PASS", current: true, required: true, styleSystem: manifest.styleSystem, candidateManifestPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/material-led-static-board-repair-v2/manifest.json", candidateManifestSha256: manifest.manifestSha256, agentActualPixelReview: manifest.agentActualPixelReview, audit: lineageAudit, priorBoard: {sha256: priorBoardSha256, disposition: "SUPERSEDED_VISUAL_REJECTED_TEXT_HEAVY", reason: "USER_REPORTED_TOO_MANY_TITLES_AND_MISSING_ILLUSTRATION_OR_MEDIA_ACTORS"}, currentBoardSha256: manifest.packageBoard.sha256, userVisualApproval: "NOT_APPROVED", adoptedAt: now};
    const consistencyBody = {contract: "A1StoryboardMaterialLedPixelConsistency/v1", status: "PASS", sourceBoardSha256: priorBoardSha256, currentBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: timelineMedia.sha256, styleSystemSha256: manifest.styleSystem.sha256, packageShotIds: nextItems.map((item) => item.shotId), targetRepairShotIds: manifest.targetShotIds, visualMaterialRouteCounts: lineageAudit.materialRouteCounts, blockedShotIds: [], actualCompositePixelsAudited: true, generatedAt: now};
    const storyboardPixelConsistency = {...consistencyBody, auditSha256: sha256(consistencyBody)};
    next.production.shotIntelligence.wholeFilmStaticBoard = {...priorBoard, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png", sha256: manifest.packageBoard.sha256, width: manifest.packageBoard.width, height: manifest.packageBoard.height, items: nextItems, timelineBoard: {...priorBoard.timelineBoard, sha256: timelineMedia.sha256, width: timelineMedia.width, height: timelineMedia.height, items: timelineItems}, status: "PENDING_USER_APPROVAL", decision: null, generatedAt: now, userVisualApproval: "NOT_APPROVED", approvalAllowed: true, reviewActionDisabled: false, styleLineageAuthority, storyboardPixelConsistency};
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, staticBoard: next.production.shotIntelligence.wholeFilmStaticBoard, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
    next.production.shotIntelligence.currentAssembly = [];
    next.production.authority = {...next.production.authority, currentStage: "whole-film-static-board-review", state: "whole-film-static-board-review", nextAction: {id: "review-whole-film-static-board", label: "审看语义主视觉已落实的 34 镜静态板", requiresUser: true, targetShotIds: [], reviewGate: "WHOLE_FILM_STATIC_BOARD"}};
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
    if (gate.status !== "PASS") throw new Error(`material-led-adoption-post-gate-blocked:${JSON.stringify(gate)}`);
    const event = createProductionEvent({workspace: locked, action: "adopt-material-led-static-board-repair-v2", targetId: manifest.packageBoard.sha256, payload: {priorBoardSha256, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: timelineMedia.sha256, targetRepairShotIds: manifest.targetShotIds, visualMaterialRouteCounts: lineageAudit.materialRouteCounts, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false}, now});
    recalculated.production.eventLedger.eventCount += 1;
    recalculated.production.eventLedger.lastEventId = event.eventId;
    recalculated.production.eventLedger.lastEventAt = event.createdAt;
    const report = {contract: "A1WholeFilmStaticBoardFinalizationReport/v1", status: "PASS", stage: "WHOLE_FILM_STATIC_BOARD_READY", nextUserGate: "WHOLE_FILM_STATIC_BOARD", userApprovalRequired: true, userVisualApproval: "NOT_APPROVED", styleLineageAuthority, items: nextItems, board: {publicUrl: next.production.shotIntelligence.wholeFilmStaticBoard.publicUrl, sha256: manifest.packageBoard.sha256, width: manifest.packageBoard.width, height: manifest.packageBoard.height}, timelineBoard: {publicUrl: priorBoard.timelineBoard.publicUrl, sha256: timelineMedia.sha256, width: timelineMedia.width, height: timelineMedia.height, itemCount: timelineItems.length, items: timelineItems}, storyboardPixelConsistency, provisionalSelectionCount: nextItems.length, formalAssemblyCount: 0, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, generatedAt: now};
    const files = {"whole-film-static-board-v1/report.json": report, "storyboard-pixel-consistency-v1/report.json": storyboardPixelConsistency, "material-led-static-board-repair-v2/manifest.json": manifest, "material-led-static-board-repair-v2/agent-actual-pixel-review.json": readJson(path.join(candidateRoot, "agent-actual-pixel-review.json"))};
    for (const file of fs.readdirSync(path.join(candidateRoot, "style-briefs"))) files[`material-led-static-board-repair-v2/style-briefs/${file}`] = readJson(path.join(candidateRoot, "style-briefs", file));
    const binaryFiles = {"whole-film-static-board-v1/whole-film-package-board.png": packageBoardBytes, "whole-film-static-board-v1/whole-film-timeline-board.png": timelineMedia.bytes, "material-led-static-board-repair-v2/whole-film-package-board.png": packageBoardBytes};
    for (const folder of ["frames", "substrates", "elements"]) for (const file of fs.readdirSync(path.join(candidateRoot, folder))) binaryFiles[`material-led-static-board-repair-v2/${folder}/${file}`] = fs.readFileSync(path.join(candidateRoot, folder, file));
    const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: locked.workspaceSha256, commitId: `material-led-static-board-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files, binaryFiles});
    return {status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: committed.workspaceSha256, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: timelineMedia.sha256, gateStatus: gate.status, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false};
  });
} finally {
  fs.rmSync(timelineTemp, {force: true});
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
