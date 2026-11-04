#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const family = "generated/system-line/editorial-asset-workbench-v1/current-storyboard-authority-board-v1";
const publicOut = path.join(publicRoot, family);
const artifactOut = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/current-storyboard-authority-board-v1");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const authority = workspace.production?.shotIntelligence?.currentStoryboardAuthority;
if (authority?.contract !== "A1CurrentStoryboardAuthority/v1" || authority.current !== true || authority.shots?.length !== 34) throw new Error("current-storyboard-authority-34-required");

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const short = (value, max) => { const text = String(value || "").replace(/\s+/gu, " ").trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };
const colors = {STALE_REVIEW_REQUIRED: "#ff6b57", CURRENT_REVIEW_REQUIRED: "#ffd34e", USER_APPROVED_FOR_WHOLE_FILM_540P_REVIEW: "#65e08a"};
const tileWidth = 480;
const imageHeight = 270;
const labelHeight = 94;
const columns = 4;
const tiles = [];
const items = [];

for (const shot of authority.shots) {
  const publicUrl = shot.artifactPublicUrl;
  const file = path.join(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
  if (!publicUrl || !fs.existsSync(file)) throw new Error(`current-storyboard-authority-file-missing:${shot.shotId}`);
  const bytes = fs.readFileSync(file);
  const actualSha256 = sha(bytes);
  const declaredSha256 = shot.artifactSha256 || null;
  const shaStatus = !declaredSha256 ? "DECLARED_SHA_MISSING" : declaredSha256 === actualSha256 ? "PASS" : "DECLARED_SHA_MISMATCH";
  const metadata = await sharp(bytes).metadata();
  const image = await sharp(bytes).resize(tileWidth, imageHeight, {fit: "cover", position: "centre"}).png().toBuffer();
  const accent = colors[shot.assetBindingStatus] || "#5f87ff";
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f10"/><rect width="8" height="100%" fill="${accent}"/><text x="20" y="22" fill="#f5f4ec" font-family="Arial, PingFang SC, sans-serif" font-size="14" font-weight="700">${esc(`${shot.shotId} · ${shot.route || "CURRENT"}`)}</text><text x="20" y="42" fill="${accent}" font-family="Arial, PingFang SC, sans-serif" font-size="11" font-weight="700">${esc(`${shot.assetBindingStatus || "MISSING"} · ${shaStatus}`)}</text><text x="20" y="61" fill="#aeb8b4" font-family="Arial, PingFang SC, sans-serif" font-size="10">${esc(short(shot.versionId, 62))}</text><text x="20" y="80" fill="#aeb8b4" font-family="Arial, PingFang SC, sans-serif" font-size="10">${esc(short(shot.sourceText || shot.semanticJob, 64))}</text></svg>`);
  tiles.push(await sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 4, background: "#0b0f10"}}).composite([{input: image, top: 0, left: 0}, {input: label, top: imageHeight, left: 0}]).png().toBuffer());
  items.push({shotId: shot.shotId, order: shot.order, versionId: shot.versionId, artifactPublicUrl: publicUrl, declaredSha256, actualSha256, shaStatus, assetBindingStatus: shot.assetBindingStatus || "MISSING", route: shot.route || null, packageType: shot.packageType || null, source: shot.source || null, width: metadata.width, height: metadata.height});
}

const rows = Math.ceil(tiles.length / columns);
const headerHeight = 132;
const width = tileWidth * columns;
const height = headerHeight + rows * (imageHeight + labelHeight);
const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#101617"/><text x="28" y="42" fill="#f5f4ec" font-family="Arial, PingFang SC, sans-serif" font-size="27" font-weight="700">当前 Authority 34 镜视觉板</text><text x="28" y="72" fill="#aeb8b4" font-family="Arial, PingFang SC, sans-serif" font-size="13">workspace ${workspace.workspaceSha256.slice(0, 16)} · revision ${String(authority.lastRevisionSha256 || "none").slice(0, 16)} · ${esc(authority.updatedAt || "")}</text><text x="28" y="102" fill="#ffbc57" font-family="Arial, PingFang SC, sans-serif" font-size="15" font-weight="700">红：版本变更后待重审　黄：当前新增待审　绿：已绑定当前审片</text></svg>`);
const board = await sharp({create: {width, height, channels: 4, background: "#070a0b"}}).composite([{input: header, top: 0, left: 0}, ...tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: headerHeight + Math.floor(index / columns) * (imageHeight + labelHeight)}))]).png().toBuffer();
const boardSha256 = sha(board);
const reportBody = {contract: "A1CurrentStoryboardAuthorityBoard/v1", status: items.every((item) => item.shaStatus === "PASS") ? "READY_FOR_USER_REVIEW" : "READY_WITH_BINDING_GAPS", source: {workspaceSha256: workspace.workspaceSha256, storyboardRevisionSha256: authority.lastRevisionSha256 || null, authorityUpdatedAt: authority.updatedAt || null}, shotCount: items.length, counts: {stale: items.filter((item) => item.assetBindingStatus === "STALE_REVIEW_REQUIRED").length, currentReview: items.filter((item) => item.assetBindingStatus === "CURRENT_REVIEW_REQUIRED").length, approvedBinding: items.filter((item) => item.assetBindingStatus === "USER_APPROVED_FOR_WHOLE_FILM_540P_REVIEW").length, declaredShaMissing: items.filter((item) => item.shaStatus === "DECLARED_SHA_MISSING").length, declaredShaMismatch: items.filter((item) => item.shaStatus === "DECLARED_SHA_MISMATCH").length}, board: {publicUrl: `/${family}/board.png`, sha256: boardSha256, width, height}, items, boundary: {derivedFromCurrentStoryboardAuthorityOnly: true, filenameSearchSelectionForbidden: true, userVisualApproval: "NOT_APPROVED", productionAdmission: false, workspaceMutationPerformed: false}, generatedAt: new Date().toISOString()};
const report = {...reportBody, reportSha256: sha(JSON.stringify(reportBody))};
for (const directory of [publicOut, artifactOut]) {
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, "board.png"), board);
  fs.writeFileSync(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({status: report.status, board: report.board, counts: report.counts, reportSha256: report.reportSha256, publicArtifactParity: sha(fs.readFileSync(path.join(publicOut, "board.png"))) === sha(fs.readFileSync(path.join(artifactOut, "board.png"))), workspaceMutationPerformed: false}, null, 2));
