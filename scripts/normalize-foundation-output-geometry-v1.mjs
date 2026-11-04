#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const stageId = process.argv.find((arg) => arg.startsWith("--stage="))?.split("=")[1];
if (!["background-foundry", "element-atlas", "key-backgrounds"].includes(stageId)) throw new Error("foundation-geometry-stage-invalid");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const prepared = [];
const sourceWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
for (const asset of sourceWorkspace.library.assets.filter((item) => item.stageId === stageId && ["editorial-artwork", "editorial-element"].includes(item.route) && item.assetUri)) {
    const file = path.resolve(publicRoot, asset.assetUri.replace(/^\/+/, ""));
    if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) || !fs.existsSync(file)) continue;
    const metadata = await sharp(file).metadata();
    if (metadata.width === 1920 && metadata.height === 1080) continue;
    const normalizedPath = `${file}.normalized`;
    await sharp(file).resize(1920, 1080, {fit: "cover", position: "centre"}).png().toFile(normalizedPath);
    fs.renameSync(normalizedPath, file);
    const bytes = fs.readFileSync(file);
    prepared.push({assetId: asset.id, from: `${metadata.width}x${metadata.height}`, to: "1920x1080", sha256: sha256(bytes)});
    const manifestPath = `${file}.manifest.json`;
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifest.sha256 = asset.sha256;
        manifest.width = 1920;
        manifest.height = 1080;
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      } catch {}
    }
}

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (!prepared.length) return {workspace: current, changed: []};
  const next = structuredClone(current);
  const now = new Date().toISOString();
  for (const item of prepared) {
    const asset = next.library.assets.find((candidate) => candidate.id === item.assetId);
    if (!asset) continue;
    asset.sha256 = item.sha256;
    asset.contentSha256 = null;
    asset.status = "ready-for-review";
    asset.review = {status: "pending", note: "系统已自动统一基础素材为 1920×1080；等待视觉红队重新评估。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
    asset.visualCritic = null;
    asset.contentSha256 = editorialAssetContentSha256(asset);
  }
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = `recritic-foundation:${stageId}`;
  const event = createProductionEvent({workspace: current, action: "foundation-output-geometry-normalized", targetId: stageId, payload: {stageId, changed: prepared}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return {workspace: recalculated, changed: prepared};
});

console.log(JSON.stringify({status: updated.changed.length ? "NORMALIZED" : "NOOP", stageId, changed: updated.changed}, null, 2));
if (!updated.changed.length) process.exitCode = 2;
