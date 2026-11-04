#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildDesignCalibrationBatch} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {createProductionEvent, prepareDesignCalibrationBatch} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/design-calibration-batch-v1";
const outputDir = path.join(publicRoot, outputRelative);
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function persistPreparedBatch() {
  return withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const prepared = prepareDesignCalibrationBatch(current);
    const event = createProductionEvent({workspace: current, action: "prepare-design-calibration-batch", targetId: prepared.production.designCalibrationBatch?.batchSha256 || null, payload: {shotIds: prepared.production.designCalibrationBatch?.items?.map((item) => item.shotId) || [], runtimeFailures: prepared.production.designCalibrationBatch?.runtimeFailures || []}});
    prepared.production.eventLedger.eventCount += 1;
    prepared.production.eventLedger.lastEventId = event.eventId;
    prepared.production.eventLedger.lastEventAt = event.createdAt;
    const next = recalculateEditorialAssetWorkbench(prepared);
    persistProjectState(appRoot, next, {event});
    return next;
  });
}

function renderShot(shotId) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/render-shot-scene-graph-candidates-v1.mjs"), `--shot=${shotId}`], {cwd: root, stdio: "inherit", env: process.env});
  return result.status === 0 ? null : `render-exit-${result.status ?? "signal"}`;
}

function escapeXml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function buildContactSheet(workspace) {
  const batch = buildDesignCalibrationBatch(workspace);
  const tileWidth = 960;
  const tileHeight = 588;
  const columns = 2;
  const rows = 3;
  const composites = [];
  for (const [index, item] of batch.items.entries()) {
    const asset = workspace.library.assets.find((candidate) => candidate.id === item.assetId);
    const previewPublicUrl = item.previewPublicUrl
      || asset?.candidateRender?.previews?.find((candidate) => candidate.candidateId === asset.visualCritic?.selectedCandidateId)?.publicUrl
      || asset?.candidateRender?.previews?.[0]?.publicUrl;
    if (!previewPublicUrl) continue;
    const previewPath = path.join(publicRoot, previewPublicUrl.replace(/^\/+/, ""));
    if (!fs.existsSync(previewPath)) continue;
    const previewFrame = await sharp(previewPath)
      .resize(tileWidth, 540, {fit: "contain", background: "#070909", withoutEnlargement: false})
      .png()
      .toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="48" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101315"/><text x="24" y="30" fill="#d7ff45" font-family="Arial, sans-serif" font-size="16" font-weight="700">${String(index + 1).padStart(2, "0")}  ${escapeXml(item.shotId)}  /  ${escapeXml(item.label)}</text><text x="936" y="30" text-anchor="end" fill="#8b928e" font-family="Arial, sans-serif" font-size="13">${escapeXml(item.editMode)}</text></svg>`);
    const tile = await sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#101315"}})
      .composite([{input: previewFrame, top: 0, left: 0}, {input: label, top: 540, left: 0}])
      .png()
      .toBuffer();
    composites.push({input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight});
  }
  if (composites.length !== 6) throw new Error(`design-calibration-contact-sheet-needs-six-visible-frames:${composites.length}`);
  fs.mkdirSync(outputDir, {recursive: true});
  const contactPath = path.join(outputDir, "contact-sheet.png");
  await sharp({create: {width: tileWidth * columns, height: tileHeight * rows, channels: 4, background: "#070909"}}).composite(composites).png().toFile(contactPath);
  const bytes = fs.readFileSync(contactPath);
  return {publicUrl: `/${outputRelative}/contact-sheet.png`, sha256: sha256(bytes), width: tileWidth * columns, height: tileHeight * rows, renderedAt: new Date().toISOString()};
}

let workspace = persistPreparedBatch();
const initialBatch = buildDesignCalibrationBatch(workspace);
const runtimeFailures = [...(initialBatch.runtimeFailures || [])];
for (const item of initialBatch.items) {
  const asset = workspace.library.assets.find((candidate) => candidate.id === item.assetId);
  if (!asset?.candidates?.length) continue;
  const currentBatch = buildDesignCalibrationBatch(workspace);
  const currentItem = currentBatch.items.find((candidate) => candidate.shotId === item.shotId);
  if (currentItem?.renderReady) continue;
  const error = renderShot(item.shotId);
  if (error) runtimeFailures.push({shotId: item.shotId, error});
  workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
}

const contactSheet = await buildContactSheet(workspace);
const persisted = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const batch = buildDesignCalibrationBatch(current);
  current.production.designCalibrationBatch = {...batch, contactSheet, runtimeFailures, workerStatus: "idle"};
  const event = createProductionEvent({workspace: current, action: "render-design-calibration-batch", targetId: batch.batchSha256, payload: {shotIds: batch.items.map((item) => item.shotId), contactSheetSha256: contactSheet.sha256, runtimeFailures}});
  current.production.eventLedger.eventCount += 1;
  current.production.eventLedger.lastEventId = event.eventId;
  current.production.eventLedger.lastEventAt = event.createdAt;
  const next = recalculateEditorialAssetWorkbench(current);
  const report = {contract: "A1DesignCalibrationBatchBuildReport/v1", status: next.production.authority.designCalibrationBatch.status, batchSha256: next.production.authority.designCalibrationBatch.batchSha256, shotIds: next.production.authority.designCalibrationBatch.items.map((item) => item.shotId), contactSheet, sequenceAudit: next.production.authority.designCalibrationBatch.sequenceAudit, runtimeFailures, authoritySha256: next.production.authority.sha256, generatedAt: new Date().toISOString()};
  persistProjectState(appRoot, next, {event, files: {"design-calibration-batch-v1/report.json": report}});
  return {workspace: next, report};
});

console.log(JSON.stringify({status: persisted.report.status, batchSha256: persisted.report.batchSha256, shotIds: persisted.report.shotIds, contactSheet: contactSheet.publicUrl, runtimeFailures, nextAction: persisted.workspace.production.authority.nextAction}, null, 2));
