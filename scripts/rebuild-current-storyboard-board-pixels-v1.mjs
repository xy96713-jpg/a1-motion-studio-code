#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {writeJsonAtomic} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const boardDir = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1");
const artifactBoardDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/whole-film-static-board-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const shortText = (value, max = 48) => { const text = String(value || "").replace(/\s+/gu, " ").trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };
const now = new Date().toISOString();

async function buildBoard(items, {tileWidth, imageHeight, labelHeight, columns}) {
  const tileHeight = imageHeight + labelHeight;
  const rendered = await Promise.all(items.map(async (item) => {
    const source = item.previewPublicUrl || item.preview?.publicUrl || null;
    assert.ok(source, `current-board-preview-missing:${item.shotId}`);
    const sourceFile = publicFile(source);
    assert.ok(fs.existsSync(sourceFile), `current-board-preview-file-missing:${item.shotId}`);
    const image = await sharp(sourceFile).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const lines = [
      `${item.shotId} · ${item.routeLabel || item.route || "CURRENT"}`,
      `${item.presentationMode || item.frameOccupation || item.sourceRole || "SOURCE"}`,
      shortText(item.sourceText || item.semanticJob || "", 56),
      item.currentStoryboardVersionId || item.artifactSha256 || "CURRENT",
    ];
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b0f10"/><rect width="7" height="100%" fill="${item.packageBoardItem ? "#d7f246" : "#5f87ff"}"/>${lines.map((line, index) => `<text x="20" y="${20 + index * 17}" fill="${index === 0 ? "#f2f5ed" : "#9eaaa4"}" font-family="Arial, PingFang SC, sans-serif" font-size="${index === 0 ? 14 : 10}" font-weight="${index === 0 ? 700 : 400}">${escapeXml(line)}</text>`).join("")}</svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f10"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  }));
  const rows = Math.ceil(rendered.length / columns);
  const output = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070a0b"}}).composite(rendered.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png().toBuffer();
  return {buffer: output, width: columns * tileWidth, height: rows * tileHeight, sha256: sha256(output)};
}

const result = await withProjectLock(appRoot, async () => {
  const current = readProjectWorkspace(appRoot);
  const runtimeBoard = current.production.shotIntelligence.wholeFilmStaticBoard;
  assert.equal(runtimeBoard.status, "PENDING_USER_APPROVAL");
  const pointer = current.production.shotIntelligence.currentStoryboardAuthority?.shots?.find((item) => item.shotId === "ED-01" && item.authoritativeOverride === true);
  assert.ok(pointer, "current-storyboard-ed01-pointer-required");
  const next = structuredClone(current);
  const packageItems = next.production.shotIntelligence.wholeFilmStaticBoard.items || [];
  const timelineItems = next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard?.items || [];
  const applyPointer = (item) => item.shotId !== "ED-01" ? item : {...item, artifactSha256: pointer.artifactSha256, artifactPublicUrl: pointer.artifactPublicUrl, previewPublicUrl: pointer.artifactPublicUrl, previewSha256: pointer.artifactSha256, route: "PACKAGE_LOOK_MASTER", routeLabel: "FULLSCREEN WORKBENCH OPENING", sourceRole: "IMAGEGEN_LOOK_MASTER", titleRole: "HERO_WORKBENCH", presentationMode: "FULLSCREEN_WORKBENCH_OPENING", assemblyMode: "FULLSCREEN", frameOccupation: "FULL_FRAME_TAKEOVER", currentStoryboardVersionId: pointer.versionId, stateSequence: ["BEFORE", "HOLD", "AFTER"], packageBoardItem: true};
  next.production.shotIntelligence.wholeFilmStaticBoard.items = packageItems.map(applyPointer);
  next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items = timelineItems.map(applyPointer);
  const packageBoard = await buildBoard(next.production.shotIntelligence.wholeFilmStaticBoard.items, {tileWidth: 480, imageHeight: 270, labelHeight: 72, columns: 3});
  const timelineBoard = await buildBoard(next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items, {tileWidth: 360, imageHeight: 202, labelHeight: 86, columns: 4});
  const packagePath = path.join(boardDir, "whole-film-package-board.png");
  const timelinePath = path.join(boardDir, "whole-film-timeline-board.png");
  fs.mkdirSync(boardDir, {recursive: true}); fs.mkdirSync(artifactBoardDir, {recursive: true});
  fs.writeFileSync(packagePath, packageBoard.buffer); fs.writeFileSync(timelinePath, timelineBoard.buffer);
  fs.copyFileSync(packagePath, path.join(artifactBoardDir, "whole-film-package-board.png")); fs.copyFileSync(timelinePath, path.join(artifactBoardDir, "whole-film-timeline-board.png"));
  next.production.shotIntelligence.wholeFilmStaticBoard.sha256 = packageBoard.sha256;
  next.production.shotIntelligence.wholeFilmStaticBoard.width = packageBoard.width;
  next.production.shotIntelligence.wholeFilmStaticBoard.height = packageBoard.height;
  next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.sha256 = timelineBoard.sha256;
  next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.width = timelineBoard.width;
  next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.height = timelineBoard.height;
  const event = createProductionEvent({workspace: current, action: "rebuild-current-storyboard-board-pixels", targetId: "WHOLE_FILM_STATIC_BOARD", payload: {ed01VersionId: pointer.versionId, packageBoardSha256: packageBoard.sha256, timelineBoardSha256: timelineBoard.sha256, userVisualApproval: "NOT_APPROVED"}, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, binaryFiles: {"whole-film-static-board-v1/whole-film-package-board.png": packageBoard.buffer, "whole-film-static-board-v1/whole-film-timeline-board.png": timelineBoard.buffer}, files: {"whole-film-static-board-v1/current-board-pixel-rebuild.json": {contract: "A1CurrentStoryboardBoardPixelRebuild/v1", status: "PASS", ed01VersionId: pointer.versionId, packageBoardSha256: packageBoard.sha256, timelineBoardSha256: timelineBoard.sha256, userVisualApproval: "NOT_APPROVED", createdAt: now}}, expectedWorkspaceSha256: current.workspaceSha256});
  return {workspace: recalculated, packageBoard, timelineBoard, event};
});
console.log(JSON.stringify({status: "PASS", packageBoardSha256: result.packageBoard.sha256, timelineBoardSha256: result.timelineBoard.sha256, workspaceSha256: result.workspace.workspaceSha256, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false}, null, 2));
